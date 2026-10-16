/**
 * 画布预览事实（落盘回执 → 画布结果的唯一契约）。
 *
 * 不变式：交给画布的图片 / 视频结果，要么带**独立的小图**（thumbnailUrl ≠ url，长边 ≤ 预览上限，
 * 由主进程 assetPreview 唯一派生），要么带明确的事实说明为什么没有：
 *   - 'ready'   ：thumbnailUrl 指向落盘边界派生的独立小图（图片缩略 / 视频首帧 poster）；
 *   - 'source'  ：源图本身长边 ≤ 预览上限（或是矢量图），源就是有界的，不另存一份；
 *   - 'missing' ：派生不出来（ffmpeg 不在、探测失败、远端还没落盘……），画布只能画源，并且被计数。
 * 没有这一栏的结果是「未知」：只可能来自升级前的旧数据或还没接上回执的入口，打开项目后由
 * resultMediaBackfillBridge 补成上面三者之一。**thumbnailUrl 永远不许等于 url**——那是把原图冒充预览。
 */
export const CANVAS_PREVIEW_LONG_EDGE_PX = 1024

export const CANVAS_PREVIEW_STATES = ['ready', 'source', 'missing'] as const
export type CanvasPreviewState = (typeof CANVAS_PREVIEW_STATES)[number]

export function isCanvasPreviewState(value: unknown): value is CanvasPreviewState {
  return typeof value === 'string' && (CANVAS_PREVIEW_STATES as readonly string[]).includes(value)
}

/** 画布结果上与预览有关的两栏。两栏都没有 = 未知（旧数据）。 */
export type CanvasPreviewFields = { thumbnailUrl?: string; previewState?: CanvasPreviewState }

/** 任务结果（runtime TaskResult.assets[]）上的同两栏：thumbnailUrl 只放独立小图，永不等于 url；事实写在 previewState。 */
export type TaskAssetPreviewFields = { thumbnailUrl?: string | null; previewState?: CanvasPreviewState }

type ReceiptPreviewLike = { thumbnailUrl?: unknown; previewState?: unknown } | null | undefined

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 落盘回执（assetPreview.attachStoredAssetPreview 之后的 `data`）→ 画布结果的预览两栏。所有入口只走这一个投影：
 * - 图 / 视频以外的结果没有预览概念，返回 {}；
 * - 回执说 ready 且小图地址与源不同 → 带小图；
 * - 回执说 source（只对图片成立）→ 只带事实，不复制一份地址；
 * - 回执说 missing，或说 ready 却拿不出与源不同的小图 → 'missing'（明确缺失，绝不回落成 thumbnailUrl = url）；
 * - 回执没有事实（旧产物记录）→ 有与源不同的小图就带上，否则 {}（未知，交给打开后补预览）。
 */
export function canvasPreviewFieldsFromReceipt(
  type: string | undefined,
  receipt: ReceiptPreviewLike,
  sourceUrl: string | undefined,
): CanvasPreviewFields {
  if (type !== 'image' && type !== 'video') return {}
  const thumbnailUrl = trimmed(receipt?.thumbnailUrl)
  const source = trimmed(sourceUrl)
  const distinctThumbnail = thumbnailUrl && thumbnailUrl !== source ? thumbnailUrl : ''
  const state = isCanvasPreviewState(receipt?.previewState) ? receipt?.previewState : undefined
  if (state === 'ready') return distinctThumbnail ? { thumbnailUrl: distinctThumbnail, previewState: 'ready' } : { previewState: 'missing' }
  if (state === 'source') return type === 'image' ? { previewState: 'source' } : { previewState: 'missing' }
  if (state === 'missing') return { previewState: 'missing' }
  return distinctThumbnail ? { thumbnailUrl: distinctThumbnail } : {}
}

/** 一个结果此刻有没有「已知、可用」的预览事实（有独立小图，或明确知道源已有界 / 明确缺失）。 */
export function hasCanvasPreviewFact(result: { type?: string; url?: string; thumbnailUrl?: string; previewState?: unknown } | null | undefined): boolean {
  if (!result || (result.type !== 'image' && result.type !== 'video')) return true
  if (isCanvasPreviewState(result.previewState)) return true
  const thumbnailUrl = trimmed(result.thumbnailUrl)
  return Boolean(thumbnailUrl && thumbnailUrl !== trimmed(result.url))
}
