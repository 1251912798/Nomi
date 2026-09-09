import { CANVAS_MIN_ZOOM } from '../model/canvasFitBounds'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

export type CanvasFocusViewport = {
  x: number
  y: number
  zoom: number
}

export type PendingCanvasFocus = {
  nodeId: string
  categoryId: string
  viewport: CanvasFocusViewport
}

export type PendingCanvasFocusDecision =
  | { type: 'wait' }
  | { type: 'focus'; node: GenerationCanvasNode }
  | { type: 'restore'; viewport: CanvasFocusViewport }

/** Resolve a focus request after the active category and virtualization settle. */
export function resolvePendingCanvasFocus(
  pending: PendingCanvasFocus | null,
  activeCategoryId: string,
  visibleNodes: readonly GenerationCanvasNode[],
  allNodes: readonly GenerationCanvasNode[],
): PendingCanvasFocusDecision {
  if (!pending || pending.categoryId !== activeCategoryId) return { type: 'wait' }
  const target = visibleNodes.find((node) => node.id === pending.nodeId)
  if (target) return { type: 'focus', node: target }
  if (!allNodes.some((node) => node.id === pending.nodeId)) return { type: 'restore', viewport: pending.viewport }
  return { type: 'wait' }
}

/** Focusing means reading a node, not retaining the overview's miniature scale. */
export function resolveCanvasFocusZoom(
  node: { width: number; height: number },
  stage: { width: number; height: number },
  currentZoom: number,
): number {
  const fit = Math.min(stage.width * 0.8 / node.width, stage.height * 0.8 / node.height)
  return Math.max(CANVAS_MIN_ZOOM, Math.min(fit, Math.max(1, currentZoom), 3))
}
