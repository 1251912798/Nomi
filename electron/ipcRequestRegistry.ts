/**
 * 主进程在途 IPC 长请求的停止边界（中立模块：补预览、视频拆解共用这一份）。
 *
 * 2026-10-16 先长在补预览那里（electron/assets/previewRequests.ts）；2026-10-27 拆解要同一个东西，
 * 按用户拍板挪到这里，旧文件同提交删掉，不留第二份。
 *
 * `ipcRenderer.invoke` 没有取消机制，AbortSignal 也过不了结构化克隆——取消只能是第二条按请求号寻址的通道。
 * 一次请求的停止由下面几个来源汇成同一个 AbortSignal，交给干活的那一层一路往下传：
 *   · 渲染层显式撤回：按「发送方:requestId」寻址，同一个窗口才能撤自己的请求；
 *   · 发起窗口销毁：sender 'destroyed'；
 *   · 项目上下文失效：发起时签发的 assertCurrent（窗口当前项目会话）按周期复核，失效即撤；
 *   · 退出：调用方把 abortAll 挂进 registerQuitDrain。
 * 停下不是失败：signal 被 abort 之后，干活那一层抛出的任何错误都按「已停」收，返回 null（调用方据此不写事实）。
 */
export type IpcRequestSender = {
  readonly id: number;
  isDestroyed(): boolean;
  once(event: "destroyed", listener: () => void): unknown;
  removeListener(event: "destroyed", listener: () => void): unknown;
};

export const IPC_REQUEST_CONTEXT_POLL_MS = 200;

export function createIpcRequestRegistry(options: { pollMs?: number } = {}) {
  const pollMs = options.pollMs ?? IPC_REQUEST_CONTEXT_POLL_MS;
  const inflight = new Map<string, AbortController>();
  const live = new Set<AbortController>();
  const keyOf = (senderId: number, requestId: string) => `${senderId}:${requestId}`;

  async function run<T>(
    sender: IpcRequestSender,
    requestId: string,
    assertCurrent: (() => void) | undefined,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T | null> {
    const controller = new AbortController();
    live.add(controller);
    const key = requestId ? keyOf(sender.id, requestId) : "";
    if (key) {
      inflight.get(key)?.abort();
      inflight.set(key, controller);
    }
    const onDestroyed = () => controller.abort();
    sender.once("destroyed", onDestroyed);
    if (sender.isDestroyed()) controller.abort();
    const checkContext = () => {
      try { assertCurrent?.(); } catch { controller.abort(); }
    };
    checkContext();
    const timer = assertCurrent ? setInterval(checkContext, pollMs) : undefined;
    try {
      return await work(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return null;
      throw error;
    } finally {
      if (timer) clearInterval(timer);
      sender.removeListener("destroyed", onDestroyed);
      if (key && inflight.get(key) === controller) inflight.delete(key);
      live.delete(controller);
    }
  }

  function cancel(senderId: number, requestId: string): boolean {
    const controller = requestId ? inflight.get(keyOf(senderId, requestId)) : undefined;
    controller?.abort();
    return Boolean(controller);
  }

  /** 退出收摊：把还在跑的全部撤掉（含没带请求号的）。返回撤了几件。 */
  function abortAll(): number {
    const count = live.size;
    for (const controller of live) controller.abort();
    return count;
  }

  return { run, cancel, abortAll, inflightCount: () => live.size };
}

export type IpcRequestRegistry = ReturnType<typeof createIpcRequestRegistry>;
