// 文本任务的**每一个调用方**，走真栈、真 HTTP（本机假上游，零额度、不出网）。
//
// 为什么按调用方逐个跑：全部文本任务都收口到 `executeTextTask` 一扇门，但进门的姿势不同——
// 流式的经 `nomi:tasks:text:stream`（带取消、逐段回调），一次性的经 `nomi:tasks:run`（没有取消、错误经 runTaskIpcGuard 编码），
// 拆解显式不重试并带 3 帧图，浏览器提取带图和温度。同一种上游回法，在不同姿势下用户看到的东西可以不一样；
// 漏掉一个姿势，就是迁完还残留一种旧行为（设计卡 docs/plan/2026-10-21-text-tasks-to-pi-ai.md「一、调用方普查」）。
//
// 断言的是用户看得到的东西：拿到的正文 / 渲染层收到的那句错误 / 上游被请求了几次 / 停止后 HTTP 是不是真断了，
// 以及那句错误在渲染层会不会被「自动重提」（generationRetryPolicy）、被分成哪一类（classifyError）。
// 后两条是协调 10-21 的硬要求：迁移前后必须一样，文案改动不许悄悄改掉重试行为。
//
// 计时类用例（想得久 / 真死连接）用真墙钟跑主进程的真实闸，单条要几十秒：默认不跑，`NOMI_TEXT_REALTIME=1` 时跑。
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { Model, Vendor } from "../catalog/types";
import type { TaskRequest } from "../runtime";
import { reply, startTextUpstream, type UpstreamProtocol, type UpstreamReply } from "./fixtures/textUpstream";
import { isRetryableGenerationError } from "../../src/workbench/generationCanvas/runner/generationRetryPolicy";
import { classifyGenerationError } from "../../src/workbench/observability/classifyError";

type Selection = { vendor: Vendor; model: Model; apiKey: string };
type Sender = EventEmitter & { id: number; isDestroyed: () => boolean };
type Handler = (event: { sender: Sender }, payload?: unknown) => unknown;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  selections: new Map<string, Selection>(),
  events: new Map<string, Array<{ type?: string; delta?: string; message?: string; result?: unknown }>>(),
  listeners: new Set<() => void>(),
}));

vi.mock("electron", () => ({
  ipcMain: { handle: (name: string, fn: Handler) => mocks.handlers.set(name, fn) },
  webContents: {
    fromId: () => ({ isDestroyed: () => false, send: (_channel: string, payload: { streamId: string; event: { type?: string } }) => {
      const list = mocks.events.get(payload.streamId) ?? [];
      list.push(payload.event);
      mocks.events.set(payload.streamId, list);
      for (const listener of [...mocks.listeners]) listener();
    } }),
  },
}));
vi.mock("../ipcSenderGuard", () => ({ assertTrustedSender: () => undefined }));
vi.mock("../events/vendorCallTrace", () => ({ traceVendorCompleted: () => undefined, traceVendorRequested: () => undefined }));
vi.mock("../catalog/validateCandidateCredential", () => ({ revalidatePendingCredential: async () => undefined }));
// 一张 1×1 PNG：拆解的 3 帧都是本机素材（nomi-local），读字节走真 readNomiLocalAsset 的契约形状。
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
vi.mock("../assets/localAssetFile", () => ({
  readNomiLocalAsset: (url: string) => url.startsWith("nomi-local://frame") ? { bytes: PNG, contentType: "image/png" } : null,
}));
vi.mock("../runtime", () => ({
  billingKindForTaskKind: () => "text",
  findExecutableModelForTask: (vendorKey: string) => {
    const selection = mocks.selections.get(vendorKey);
    if (!selection) throw new Error(`fixture vendor not registered: ${vendorKey}`);
    return selection;
  },
}));

import { registerTextStreamIpc } from "./textStreamIpc";
import { executeTextTask } from "../textTaskRunner";
import { runTaskIpcGuard } from "../tasks/taskIpcGuard";

const owner = Object.assign(new EventEmitter(), { id: 1, isDestroyed: () => false }) as Sender;
let registered = false;
function ensureIpc() {
  if (registered) return;
  registerTextStreamIpc();
  registered = true;
}

/** 调用方 = 进门姿势 + 请求形状。与 docs/plan/2026-10-21-text-tasks-to-pi-ai.md 普查表的编号一一对应。 */
type Caller = { id: string; door: "stream" | "one-shot"; kind: TaskRequest["kind"]; extras?: Record<string, unknown> };
const DATA_PNG = `data:image/png;base64,${PNG.toString("base64")}`;
export const CALLERS: readonly Caller[] = [
  { id: "#1 文本节点续写/重写/预设", door: "stream", kind: "chat" },
  { id: "#2 文本节点改写选区", door: "one-shot", kind: "chat" },
  { id: "#3 提示词优化", door: "stream", kind: "prompt_refine" },
  { id: "#4 提示词翻译", door: "stream", kind: "prompt_refine" },
  { id: "#5 AI 起草脚本", door: "stream", kind: "prompt_refine" },
  { id: "#6 视频拆解读图", door: "one-shot", kind: "image_to_prompt",
    extras: { temperature: 0.2, maxTokens: 1200, maxRetries: 0, referenceImages: ["nomi-local://frame-1.png", "nomi-local://frame-2.png", "nomi-local://frame-3.png"] } },
  { id: "#7 浏览器提取提示词", door: "one-shot", kind: "image_to_prompt", extras: { temperature: 0.35, maxTokens: 1600, referenceImages: [DATA_PNG] } },
  { id: "#8 MCP 试跑文本模型", door: "one-shot", kind: "chat" },
  { id: "#9 画布单镜 Run 文本", door: "one-shot", kind: "chat" },
];
const STREAM_CALLERS = CALLERS.filter((caller) => caller.door === "stream");

export type Observation = {
  ok: boolean;
  text: string;
  deltas: string;
  /** 渲染层拿到的那句错误（流式：error 事件的 message；一次性：Electron 包过一层的 rejection）。 */
  error: string;
  /** 用户点了停止：既没有 done 也没有 error。 */
  cancelled: boolean;
  requests: number;
  closedEarly: number;
};

let seq = 0;

async function upstream(protocol: UpstreamProtocol, script: (index: number) => UpstreamReply) {
  const server = await startTextUpstream(protocol, (_request, index) => script(index));
  const key = `fixture-${++seq}`;
  const selection: Selection = {
    vendor: { key, baseUrlHint: server.baseURL, providerKind: protocol, authType: "bearer" } as unknown as Vendor,
    model: { modelKey: "fixture-model", vendorKey: key, kind: "text" } as unknown as Model,
    apiKey: "sk-fixture-key",
  };
  mocks.selections.set(key, selection);
  return { server, key, selection };
}

function until(check: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => { if (!check()) return; mocks.listeners.delete(tick); resolve(); };
    mocks.listeners.add(tick);
    tick();
  });
}

/** 按调用方的姿势跑一次。`stopAfterFirstDelta`：流式入口收到第一段字就点停止。 */
export async function runCaller(caller: Caller, protocol: UpstreamProtocol, script: (index: number) => UpstreamReply,
  options: { stopAfterFirstDelta?: boolean } = {}): Promise<Observation> {
  const { server, key, selection } = await upstream(protocol, script);
  try {
    return await runOn(caller, server, key, selection, options);
  } finally {
    // 每个用例只关自己的假上游（计时类用例并发跑，不能一个用例收尾把别人的上游也关了）。
    await server.close();
  }
}

async function runOn(caller: Caller, server: Awaited<ReturnType<typeof upstream>>["server"], key: string, selection: Selection,
  options: { stopAfterFirstDelta?: boolean }): Promise<Observation> {
  const request: TaskRequest = { kind: caller.kind, prompt: `${caller.id}：缩短这句话`, extras: { modelKey: "fixture-model", ...(caller.extras || {}) } };
  if (caller.door === "one-shot") {
    try {
      // runtime.runTask 的文本分支 = 付费闸 + executeTextTask；闸不在本测试范围，错误编码层（runTaskIpcGuard）是真的。
      const result = await runTaskIpcGuard({ vendor: key, request }, () => executeTextTask({
        ...selection, kind: caller.kind, request, taskId: `task-${seq}` }));
      const text = textOf(result.raw);
      return { ok: true, text, deltas: "", error: "", cancelled: false, requests: server.requests.length, closedEarly: server.closedEarly };
    } catch (error) {
      // Electron 把主进程 handler 的 rejection 包成这一句交给渲染层。
      const wire = `Error invoking remote method 'nomi:tasks:run': ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
      return { ok: false, text: "", deltas: "", error: wire, cancelled: false, requests: server.requests.length, closedEarly: server.closedEarly };
    }
  }
  ensureIpc();
  const streamId = `text-${key}-0000`;
  mocks.events.set(streamId, []);
  await mocks.handlers.get("nomi:tasks:text:stream")!({ sender: owner }, { vendor: key, request, streamId });
  const events = () => mocks.events.get(streamId)!;
  if (options.stopAfterFirstDelta) {
    await until(() => events().some((event) => event.type === "delta"));
    await mocks.handlers.get("nomi:tasks:text:cancel")!({ sender: owner }, { streamId });
    await server.whenClosedEarly();
    // 被掐断的流收尾之后，确认没有补发成功 / 错误事件（不靠墙钟：等到下一次事件循环把已排队的 IPC 事件发完）。
    await new Promise((resolve) => setImmediate(resolve));
  } else {
    await until(() => events().some((event) => event.type === "done" || event.type === "error"));
  }
  const done = events().find((event) => event.type === "done");
  const failed = events().find((event) => event.type === "error");
  return {
    ok: Boolean(done),
    text: done ? textOf((done.result as { raw?: unknown }).raw) : "",
    deltas: events().filter((event) => event.type === "delta").map((event) => event.delta).join(""),
    error: failed?.message ?? "",
    cancelled: !done && !failed,
    requests: server.requests.length,
    closedEarly: server.closedEarly,
  };
}

function textOf(raw: unknown): string {
  const choice = (raw as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0];
  return typeof choice?.message?.content === "string" ? choice.message.content : "";
}

/** 渲染层的两条判据：会不会自动重提（文本节点的运行控制器），错误卡归哪一类。 */
function rendererVerdict(message: string): { retried: boolean; kind: string } {
  return { retried: isRetryableGenerationError(new Error(message)), kind: classifyGenerationError(message).kind };
}

describe.each(CALLERS)("$id", (caller) => {
  it("正常回话：拿到正文（流式入口逐段收到同一段字）", async () => {
    const seen = await runCaller(caller, "openai-compatible", () => reply.text("慢慢展开纸条。"));
    expect(seen).toMatchObject({ ok: true, text: "慢慢展开纸条。", requests: 1 });
    if (caller.door === "stream") expect(seen.deltas).toBe("慢慢展开纸条。");
  });

  it("空回包（200、stop、没有正文）：不报错，正文为空，交给入口自己的「空结果」文案", async () => {
    const seen = await runCaller(caller, "openai-compatible", () => reply.empty());
    expect(seen).toMatchObject({ ok: true, text: "", requests: 1 });
  });

  it("429：缺省重试 2 次（拆解 0 次），最后的错误带结构化类别 quota，渲染层不自动重提", async () => {
    const seen = await runCaller(caller, "openai-compatible", () => reply.http(429, { error: { message: "Too many requests, slow down" } }));
    expect(seen.ok).toBe(false);
    expect(seen.requests).toBe(caller.extras?.maxRetries === 0 ? 1 : 3);
    expect(seen.error).toContain("HTTP 429");
    expect(seen.error).toContain("Too many requests, slow down");
    expect(rendererVerdict(seen.error)).toEqual({ retried: false, kind: "quota" });
  }, 20_000);

  it("503：同样的重试次数，类别 server", async () => {
    const seen = await runCaller(caller, "openai-compatible", () => reply.http(503, { error: { message: "upstream overloaded" } }));
    expect(seen.ok).toBe(false);
    expect(seen.requests).toBe(caller.extras?.maxRetries === 0 ? 1 : 3);
    expect(seen.error).toContain("HTTP 503");
    expect(rendererVerdict(seen.error)).toEqual({ retried: false, kind: "server" });
  }, 20_000);

  it("401：不重试，类别 auth，带上游原话", async () => {
    const seen = await runCaller(caller, "openai-compatible", () => reply.http(401, { error: { message: "invalid api key" } }));
    expect(seen).toMatchObject({ ok: false, requests: 1 });
    expect(seen.error).toContain("invalid api key");
    expect(rendererVerdict(seen.error)).toEqual({ retried: false, kind: "auth" });
  });

  it("包装过的回包（HTTP 200、SSE 里是 error）：失败，说出上游原话", async () => {
    const seen = await runCaller(caller, "openai-compatible", () => reply.sseError("relay upstream failed: channel busy"));
    expect(seen.ok).toBe(false);
    expect(seen.error).toContain("relay upstream failed: channel busy");
  });

  it("出字中途断连：失败，不把半截字当成功", async () => {
    const seen = await runCaller(caller, "openai-compatible", () => reply.cutAfterText("半截"));
    expect(seen.ok).toBe(false);
    expect(seen.error).not.toBe("");
  });

  it("流结束却没有 finish_reason（D3，协调 10-21 定：算失败）", async () => {
    const seen = await runCaller(caller, "openai-compatible", () => reply.noFinishReason("看着像完整的一句。"));
    expect(seen.ok).toBe(false);
    expect(seen.error).not.toBe("");
  });
});

describe.each(STREAM_CALLERS)("$id · 停止", (caller) => {
  it("出字中点停止：真掐 HTTP，不发 done 也不发 error", async () => {
    const seen = await runCaller(caller, "openai-compatible", () => reply.drip(200, 20), { stopAfterFirstDelta: true });
    expect(seen.cancelled).toBe(true);
    expect(seen.closedEarly).toBe(1);
    expect(seen.deltas.length).toBeGreaterThan(0);
  });
});

const realtime = process.env.NOMI_TEXT_REALTIME === "1";
describe.runIf(realtime)("真墙钟（NOMI_TEXT_REALTIME=1）", () => {
  it.concurrent.each(CALLERS)("$id · 思考型模型：先想 35 秒（每 5 秒一段 reasoning）再出字——不被当死连接掐掉", async (caller) => {
    const seen = await runCaller(caller, "openai-compatible", () => reply.thinkThenText(7, 5_000, "想好了。"));
    expect(seen.error).toBe("");
    expect(seen).toMatchObject({ ok: true, text: "想好了。" });
  }, 90_000);
});
