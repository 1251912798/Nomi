// 画布图片组件吃的地址：只吃「预览」（2026-10-16）。
//
// 画布上每张卡画的是「卡在屏幕上那么大」的图，不是 2048×3072 的原图（C-dense：原图像素约是预览的 9 倍，
// 低合成预算下整块缺绘）。以前每个画图的地方各写一遍 `thumbnailUrl || url`、甚至直接写 `result.url`，
// 于是任何一个入口忘了带小图、或把源地址填进 thumbnailUrl，原图就悄悄上了画布——没人知道上了几张。
//
// 现在把「预览」做成一个品牌类型：DeferredNodeImage 的 src 只收 CanvasImageSource，而它只能从这里造出来。
// 原图要上画布只有一条路——显式的「预览缺失」分支，并且按地址计数（以后做确定性显存 / 像素预算就读这个数）。
// 结构上写不出「原图冒充预览」：裸字符串传不进画布图片组件。
import type { GenerationNodeResult } from '../model/generationCanvasTypes'

declare const canvasImageSourceBrand: unique symbol
/** 画布图片组件唯一接受的地址类型。只有本文件的 canvasImageSourceOf / canvasVideoPosterOf 能造。 */
export type CanvasImageSource = string & { readonly [canvasImageSourceBrand]: true }

/** 这张图是怎么上画布的：独立小图 / 源本身已有界 / 预览缺失只能画源。 */
export type CanvasImageSourceKind = 'preview' | 'bounded-source' | 'missing-preview'

type ResultLike = Pick<GenerationNodeResult, 'type' | 'url' | 'thumbnailUrl' | 'previewState'>

const originalsWithMissingFact = new Set<string>()
const originalsWithUnknownFact = new Set<string>()

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function brand(url: string): CanvasImageSource {
  return url as CanvasImageSource
}

/** 结果 → 画布该挂的图片地址 + 它的来历。不是图片 / 没有地址 → null。 */
export function resolveCanvasImageSource(result: ResultLike | null | undefined): { src: CanvasImageSource; kind: CanvasImageSourceKind } | null {
  if (!result || result.type !== 'image') return null
  const url = trimmed(result.url)
  const thumbnailUrl = trimmed(result.thumbnailUrl)
  if (thumbnailUrl && thumbnailUrl !== url) return { src: brand(thumbnailUrl), kind: 'preview' }
  if (!url) return null
  if (result.previewState === 'source') return { src: brand(url), kind: 'bounded-source' }
  // 预览缺失分支：原图上画布。按地址去重计数（同一张图重渲多少次都只算一张）。
  if (result.previewState === 'missing') originalsWithMissingFact.add(url)
  else originalsWithUnknownFact.add(url)
  return { src: brand(url), kind: 'missing-preview' }
}

export function canvasImageSourceOf(result: ResultLike | null | undefined): CanvasImageSource | null {
  return resolveCanvasImageSource(result)?.src ?? null
}

/** 视频卡的封面：只有独立小图（poster）才算；没有就让调用方挂播放器。 */
export function canvasVideoPosterOf(result: ResultLike | null | undefined): CanvasImageSource | null {
  if (!result || result.type !== 'video') return null
  const thumbnailUrl = trimmed(result.thumbnailUrl)
  return thumbnailUrl && thumbnailUrl !== trimmed(result.url) ? brand(thumbnailUrl) : null
}

/**
 * 走过「预览缺失」分支的原图张数（本次启动、按地址去重）。missing = 明确记了缺失；unknown = 没有事实
 * （旧数据 / 只交了 URL 的入口，后台补预览会把它们变成 ready / source / missing）。
 */
export function canvasOriginalImageStats(): { missing: number; unknown: number; total: number } {
  return { missing: originalsWithMissingFact.size, unknown: originalsWithUnknownFact.size, total: originalsWithMissingFact.size + originalsWithUnknownFact.size }
}

export function resetCanvasImageSourceStatsForTests(): void {
  originalsWithMissingFact.clear()
  originalsWithUnknownFact.clear()
}
