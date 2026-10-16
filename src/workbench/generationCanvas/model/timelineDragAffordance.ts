import type { GenerationCanvasNode } from './generationCanvasTypes'
import { buildClipFromGenerationNode } from './buildClipFromGenerationNode'

export function canDragGenerationNodeToTimeline(
  node: GenerationCanvasNode,
  options: { readOnly?: boolean } = {},
): boolean {
  if (options.readOnly) return false
  if (node.kind === 'panorama') return false
  const type = node.result?.type
  if (type !== 'image' && type !== 'video' && type !== 'audio') return false
  return buildClipFromGenerationNode(node) !== null
}
