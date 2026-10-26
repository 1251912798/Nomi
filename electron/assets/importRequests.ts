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
  const inflight = new Set<AbortController>();

  async function run<T>(
    sender: ImportRequestSender,
    assertCurrent: (() => void) | undefined,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    inflight.add(controller);
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
    }
  }

  function abortAll(): number {
    const count = inflight.size;
    for (const controller of inflight) controller.abort();
    return count;
  }

  return { run, abortAll, inflightCount: () => inflight.size };
}

export type ImportRequestRegistry = ReturnType<typeof createImportRequestRegistry>;
