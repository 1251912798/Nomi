import type { GenerationNodeResult } from '../model/generationCanvasTypes'
import { canvasImageSourceOf, canvasVideoPosterOf, type CanvasImageSource } from '../nodes/canvasImageSource'

export const LIGHTWEIGHT_NODE_RENDER_THRESHOLD = 80
export const LIGHTWEIGHT_NODE_ZOOM_THRESHOLD = 0.55

export type LightweightNodePreview =
  | { kind: 'image'; src: CanvasImageSource }
  | { kind: 'video'; src: string }

/** 图片只取画布预览（canvasImageSource 唯一判定，原图只经被计数的缺失分支）；视频有封面挂封面，没有才挂视频。 */
export function resolveLightweightNodePreview(input: {
  result?: Pick<GenerationNodeResult, 'type' | 'url' | 'thumbnailUrl' | 'previewState'>
}): LightweightNodePreview | null {
  const result = input.result
  if (!result) return null
  if (result.type === 'image') {
    const src = canvasImageSourceOf(result)
    return src ? { kind: 'image', src } : null
  }
  if (result.type === 'video') {
    const poster = canvasVideoPosterOf(result)
    if (poster) return { kind: 'image', src: poster }
    const url = typeof result.url === 'string' ? result.url.trim() : ''
    return url ? { kind: 'video', src: url } : null
  }
  return null
}

/**
 * 订阅原语（2026-09-25 画布跟手）：节点外壳只订这两个布尔，跨过门槛才重渲。
 * 之前每张卡订节点总数 + `useViewport()`，新建 / 删除一个节点、平移缩放的每一帧，全部卡片都重渲。
 */
export function isLargeCanvas(nodeCount: number): boolean {
  return nodeCount > LIGHTWEIGHT_NODE_RENDER_THRESHOLD
}

export function isZoomedOutForLightweight(zoom: number): boolean {
  return zoom < LIGHTWEIGHT_NODE_ZOOM_THRESHOLD
}

export function shouldUseLightweightNodeRendering(largeCanvas: boolean, zoomedOut: boolean): boolean {
  return largeCanvas && zoomedOut
}

export function shouldUseLightweightNodeRenderingForSelection(input: {
  largeCanvas: boolean
  zoomedOut: boolean
  selected: boolean
  primarySelection: boolean
}): boolean {
  return shouldUseLightweightNodeRendering(input.largeCanvas, input.zoomedOut)
    || (input.largeCanvas && input.selected && !input.primarySelection)
}

export function retainLargeCanvasLightweightRendering(input: {
  retained: boolean
  largeCanvas: boolean
  selected: boolean
  primarySelection: boolean
}): boolean {
  if (!input.largeCanvas || input.primarySelection) return false
  return input.retained || input.selected
}

export function shouldRenderFullNodeContent(input: {
  lightweightMode: boolean
  selected: boolean
  focusFlash: boolean
}): boolean {
  if (!input.lightweightMode) return true
  return input.selected || input.focusFlash
}
