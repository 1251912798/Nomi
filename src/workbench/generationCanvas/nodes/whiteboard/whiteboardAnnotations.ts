import type { GenerationCanvasNode } from '../../model/generationCanvasTypes'
import { resultIdentity } from '../../model/nodeResultLifecycle'

/** Revision-bound editorial feedback; never part of the raster document. */
export type WhiteboardAnnotation = {
  id: string
  resultId: string
  x: number
  y: number
  width?: number
  height?: number
  text: string
}

export function whiteboardAnnotationResultId(node: GenerationCanvasNode): string {
  return node.result ? resultIdentity(node.result) : `board:${node.id}`
}

export function readWhiteboardAnnotations(node: Pick<GenerationCanvasNode, 'meta'>): WhiteboardAnnotation[] {
  const raw = node.meta?.whiteboardAnnotations
  if (!Array.isArray(raw)) return []
  return raw.filter((value): value is WhiteboardAnnotation => Boolean(value && typeof value === 'object'
    && typeof value.id === 'string' && typeof value.resultId === 'string' && typeof value.text === 'string'
    && Number.isFinite(value.x) && Number.isFinite(value.y)
    && (value.width === undefined || (Number.isFinite(value.width) && value.width > 0))
    && (value.height === undefined || (Number.isFinite(value.height) && value.height > 0))))
    .map((value) => ({ ...value }))
}

export function annotationsForResult(notes: WhiteboardAnnotation[], resultId: string): WhiteboardAnnotation[] {
  return notes.filter((note) => note.resultId === resultId)
}
