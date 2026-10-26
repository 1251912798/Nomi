/**
 * 本地素材导入的生命周期边界：窗口销毁、项目绑定失效、应用退出都汇入同一 AbortSignal。
 * 这层只负责请求的主人，不拥有 ffmpeg；实际子进程由 runBoundedProcess 清理。
 */
export type ImportRequestSender = {
  readonly id: number;
  isDestroyed?: () => boolean;
  once?: (event: "destroyed", listener: () => void) => unknown;
  removeListener?: (event: "destroyed", listener: () => void) => unknown;
};

export const IMPORT_CONTEXT_POLL_MS = 200;

/**
 * 退出排空最多等多久（quitTeardown 的整个退出预算也是 3 秒，实际拿到的是剩下的那部分）。
 * 杀进程组是信号一发就生效的；要等的是 ffmpeg 真退出（不退就 250ms 后升级 SIGKILL）、半成品和临时目录删掉。
 */
export const IMPORT_QUIT_DRAIN_TIMEOUT_MS = 3_000;

export class AssetImportCancelledError extends Error {
  constructor() {
    super("asset import cancelled");
    this.name = "AssetImportCancelledError";
  }
}

export function isAssetImportCancelled(error: unknown): error is AssetImportCancelledError {
  return error instanceof AssetImportCancelledError;
}

export function createImportRequestRegistry(options: { pollMs?: number } = {}) {
  const pollMs = options.pollMs ?? IMPORT_CONTEXT_POLL_MS;
  /** 在途请求 → 它「连收尾都做完」的那一刻（work 的 finally：删半成品、删临时目录都在里面）。 */
  const inflight = new Map<AbortController, Promise<void>>();
  let draining = false;

  async function run<T>(
    sender: ImportRequestSender,
    assertCurrent: (() => void) | undefined,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    // 退出已经开始：不再起新的导入（否则它会在排空之后才起 ffmpeg，成为没人管的那一个）。
    if (draining) throw new AssetImportCancelledError();
    const controller = new AbortController();
    let settle: () => void = () => undefined;
    inflight.set(controller, new Promise<void>((resolve) => { settle = resolve; }));
    const onDestroyed = () => controller.abort();
    sender.once?.("destroyed", onDestroyed);
    if (sender.isDestroyed?.()) controller.abort();
    const checkContext = () => {
      try { assertCurrent?.(); } catch { controller.abort(); }
    };
    checkContext();
    const timer = assertCurrent ? setInterval(checkContext, pollMs) : undefined;
    try {
      return await work(controller.signal);
    } catch (error) {
      if (controller.signal.aborted && !(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "project_binding_stale")) {
        throw new AssetImportCancelledError();
      }
      throw error;
    } finally {
      if (timer) clearInterval(timer);
      sender.removeListener?.("destroyed", onDestroyed);
      inflight.delete(controller);
      settle();
    }
  }

  /**
   * 退出排空：中止全部在途导入，并**等它们落定**（进程没了、半成品和临时目录删了）才返回。
   * 只发中止不等的话，App 先退出，没人删的临时目录和半成品就留在系统 tmp 里。等多久由退出预算封顶。
   */
  async function drain(): Promise<number> {
    draining = true;
    const pending = [...inflight.entries()];
    for (const [controller] of pending) controller.abort();
    await Promise.all(pending.map(([, settled]) => settled));
    return pending.length;
  }

  return { run, drain, inflightCount: () => inflight.size };
}

export type ImportRequestRegistry = ReturnType<typeof createImportRequestRegistry>;
