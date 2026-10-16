import { isAssetPreviewCancelled } from "./assetPreview";

/**
 * 打开项目后补预览的在途请求（nomi:assets:ensure-preview）的取消边界（2026-10-16 V-1209）。
 *
 * 补预览是后台低优先级的长活：每张一次 ffprobe + ffmpeg。发起它的项目关了 / 换了、窗口没了、
 * 渲染层自己撤了（换项目、桥 dispose），在途那张都必须立刻停：杀子进程、删掉没写完的产物、不写 sidecar。
 * 三个来源汇成同一个 AbortSignal，交给预览 owner（assetPreview）一路传到子进程：
 *   · 渲染层显式取消：nomi:assets:cancel-preview { requestId }（同一个 sender 才能撤自己的请求）；
 *   · 发起窗口销毁：sender 'destroyed'；
 *   · 项目上下文失效：发起时签发的 assertCurrent（窗口当前项目会话）按周期复核，失效即撤。
 * 取消不是失败：返回 null（渲染层不写任何事实，下次打开再补），不记 missing。
 */
export type PreviewRequestSender = {
  readonly id: number;
  isDestroyed(): boolean;
  once(event: "destroyed", listener: () => void): unknown;
  removeListener(event: "destroyed", listener: () => void): unknown;
};

export const PREVIEW_CONTEXT_POLL_MS = 200;

export function createPreviewRequestRegistry(options: { pollMs?: number } = {}) {
  const pollMs = options.pollMs ?? PREVIEW_CONTEXT_POLL_MS;
  const inflight = new Map<string, AbortController>();
  const keyOf = (senderId: number, requestId: string) => `${senderId}:${requestId}`;

  async function run<T>(
    sender: PreviewRequestSender,
    requestId: string,
    assertCurrent: (() => void) | undefined,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T | null> {
    const controller = new AbortController();
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
      if (controller.signal.aborted || isAssetPreviewCancelled(error)) return null;
      throw error;
    } finally {
      if (timer) clearInterval(timer);
      sender.removeListener("destroyed", onDestroyed);
      if (key && inflight.get(key) === controller) inflight.delete(key);
    }
  }

  function cancel(senderId: number, requestId: string): boolean {
    const controller = requestId ? inflight.get(keyOf(senderId, requestId)) : undefined;
    controller?.abort();
    return Boolean(controller);
  }

  return { run, cancel, inflightCount: () => inflight.size };
}

export type PreviewRequestRegistry = ReturnType<typeof createPreviewRequestRegistry>;
