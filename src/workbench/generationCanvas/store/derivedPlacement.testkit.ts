import { useGenerationCanvasStore } from './generationCanvasStore'
import { resolveNodeVisualSize } from '../nodes/nodeSizing'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

// 派生节点落点测试共用的夹具与量尺：量的是节点在屏幕上占的**渲染矩形**（resolveNodeVisualSize，几何子系统共用的渲染尺寸），
// 不是名义 node.size——名义尺寸下「看着没压」正是 2026-10-18 那个 bug 的样子。

export type Rect = { x: number; y: number; width: number; height: number }

export function rectOf(node: GenerationCanvasNode): Rect {
  const size = resolveNodeVisualSize(node)
  return { x: node.position.x, y: node.position.y, width: size.width, height: size.height }
}

export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

export function mediaNode(id: string, kind: 'image' | 'video', x: number, y: number, aspect: number, categoryId = 'shots'): GenerationCanvasNode {
  return {
    id, kind, categoryId, title: id, prompt: '', references: [], history: [], runs: [], status: 'success',
    position: { x, y }, size: { width: 320, height: 180 },
    result: { id: `${id}-r`, type: kind, url: `nomi-local://asset/p/${id}.${kind === 'video' ? 'mp4' : 'png'}`, createdAt: 1 },
    meta: kind === 'image'
      ? { imageWidth: 1000, imageHeight: Math.round(1000 / aspect), imageAspectRatio: aspect }
      : { videoWidth: 1000, videoHeight: Math.round(1000 / aspect), videoAspectRatio: aspect },
  } as GenerationCanvasNode
}

export function seed(nodes: GenerationCanvasNode[]): void {
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes, edges: [], selectedNodeIds: [], groups: [] })
}

export function overlapsAny(node: GenerationCanvasNode): GenerationCanvasNode[] {
  const rect = rectOf(node)
  return useGenerationCanvasStore.getState().nodes.filter((other) => other.id !== node.id && (other.categoryId || 'shots') === (node.categoryId || 'shots') && intersects(rect, rectOf(other)))
}

/** 视频右边挨着一排竖图（9:16，渲染比名义 180 高得多）——派生节点的默认落点（源右边 + 间距）正压在第一张竖图上。 */
export function videoBesideTallRow(): GenerationCanvasNode[] {
  return [
    mediaNode('src', 'video', 120, 160, 16 / 9),
    ...[520, 920, 1320, 1720].map((x, index) => mediaNode(`tall-${index}`, 'image', x, 160, 9 / 16)),
  ]
}

