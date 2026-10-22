// 文本任务流式 IPC（per-session 通道，与 Agent 对话 IPC 同形状）。
//
// runTask 是请求/响应式（一次性返回 TaskResult），没法推 delta。这里另开一条单向
// 事件通道：handle 立即返回 streamId，逐 token 经 webContents.send 推到渲染层。
// 支持 cancel（AbortController 真中断流，不只是置标志）。
import { ipcMain, webContents as electronWebContents } from "electron";
import type { WebContents } from "electron";

import { assertTrustedSender } from "../ipcSenderGuard";
import { prewarmModelCall } from "./modelCallBridge";
import type { ModelProtocol } from "../shared/agentLane/modelCallPort";
type TextStreamSession = {
  streamId: string;
  webContentsId: number;
  abortController: AbortController;
};

const textStreamSessions = new Map<string, TextStreamSession>();
let textTaskRunnerPromise: Promise<typeof import("../textTaskRunner")> | null = null;

function loadTextTaskRunner(): Promise<typeof import("../textTaskRunner")> {
  textTaskRunnerPromise ??= import("../textTaskRunner");
  return textTaskRunnerPromise;
}

function sendTextEvent(session: TextStreamSession, event: unknown): void {
  const target: WebContents | undefined = electronWebContents.fromId(session.webContentsId) || undefined;
  if (!target || target.isDestroyed()) return;
  target.send("nomi:tasks:text:event", { streamId: session.streamId, event });
}

/**
 * 目录里启用着的文本模型用到哪几条协议：预热只装这几条（每条协议带一个 SDK，在 Electron 主进程里装一条就是一段约 120–280ms 的同步卡顿，
 * 没接的协议不该让用户付这段）。读不出就不点名任何协议（只装核心；第一次真用时照常现装）。
 */
async function textModelProtocols(): Promise<ModelProtocol[]> {
  try {
    const [{ readCatalog }, { vendorModelConnection }] = await Promise.all([import("../catalog/catalogStore"), import("./vendorModelConnection")]);
    const catalog = readCatalog();
    const protocols = new Set<ModelProtocol>();
    for (const model of catalog.models) {
      if (!model.enabled || model.kind !== "text") continue;
      const vendor = catalog.vendors.find((candidate) => candidate.key === model.vendorKey && candidate.enabled);
      if (!vendor) continue;
      try { protocols.add(vendorModelConnection(vendor, model, "").kind); } catch { /* 不走 HTTP 协议的接入（本机 CLI 等）不点名 */ }
    }
    return [...protocols];
  } catch {
    return [];
  }
}

export function registerTextStreamIpc(): void {
  // 文本任务的模型调用核心住在 pi 岛上、第一次用时才装：用户朝文本动作伸手时（指针移进 / 焦点进），渲染层空闲回调里叫这里先装好
  // （★7，协调 10-21 定「有意图时预热」）。预热失败不影响功能：第一次真用时照常现装。
  ipcMain.handle("nomi:tasks:text:prewarm", async (event) => {
    assertTrustedSender(event);
    await prewarmModelCall(await textModelProtocols()).catch(() => undefined);
    return { ok: true };
  });
  ipcMain.handle("nomi:tasks:text:stream", async (event, payload: Record<string, unknown>) => {
    assertTrustedSender(event);
    // 流 id 由渲染层先定、先订阅、再发起：失败得快（被拦 / 凭据 / DNS 一毫秒内就错）的流，事件在 invoke 回包之前就已发出，
    // 渲染层若等回包才订阅就永远收不到 error，节点卡在「提交中」。没带合法 id（旧调用方）才由这里生成。
    const requested = typeof payload?.streamId === "string" ? payload.streamId : "";
    const streamId = /^text-[A-Za-z0-9-]{8,64}$/.test(requested) && !textStreamSessions.has(requested)
      ? requested
      : `text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session: TextStreamSession = {
      streamId,
      webContentsId: event.sender.id,
      abortController: new AbortController(),
    };
    textStreamSessions.set(streamId, session);

    // once("destroyed") 挂在 sender 上、只在 webContents 销毁时触发；流正常结束后必须
    // 显式解绑，否则监听器与闭包引用的 session/abortController 随会话数累积（MaxListeners 泄漏）。
    const onSenderDestroyed = () => {
      const live = textStreamSessions.get(streamId);
      if (!live) return;
      live.abortController.abort();
      textStreamSessions.delete(streamId);
    };
    event.sender.once("destroyed", onSenderDestroyed);

    // 异步跑，让 handle 立刻返回 streamId（渲染层先订阅事件再收 delta）。
    queueMicrotask(() => {
      void (async () => {
        const { runTextTaskStream } = await loadTextTaskRunner();
        return runTextTaskStream(payload, {
          onDelta: (delta) => sendTextEvent(session, { type: "delta", delta }),
          abortSignal: session.abortController.signal,
        });
      })()
        .then((result) => {
          // 用户点了「停止」：底层流被掐断后会带着已收到的残文本正常返回，但那不是一次成功——
          // 不发 done（否则把半截文字当终态送给渲染层）；渲染层自己按取消收尾。
          if (session.abortController.signal.aborted) return;
          sendTextEvent(session, { type: "done", result });
        })
        .catch(async (error: unknown) => {
          // 用户点了「停止」：取消只清理 session，不当错误上报（渲染层自己按取消收尾）。
          if (session.abortController.signal.aborted) return;
          // 厂商失败在抛出那一刻已是结构化错误（带 vendorKey 与 category）：编码后穿到渲染层，文本节点的错误卡不靠正则猜。
          const { describeAgentError } = await import("./agentError");
          const message = describeAgentError(error);
          sendTextEvent(session, { type: "error", message });
        })
        .finally(() => {
          textStreamSessions.delete(streamId);
          if (!event.sender.isDestroyed()) event.sender.removeListener("destroyed", onSenderDestroyed);
        });
    });

    return { streamId };
  });

  ipcMain.handle("nomi:tasks:text:cancel", async (event, payload: { streamId?: string }) => {
    assertTrustedSender(event);
    const session = textStreamSessions.get(String(payload?.streamId || ""));
    if (!session) return { ok: false, error: "stream not found" };
    session.abortController.abort();
    return { ok: true };
  });
}
