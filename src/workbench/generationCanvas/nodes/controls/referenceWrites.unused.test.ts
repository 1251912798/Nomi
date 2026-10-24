// 「未用到」那张的 ×（用户 10-22 拍板 ⑫）：上传的从参考列表里删、连线来的断开那条线，@ 一起删。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGenerationCanvasStore } from '../../store/generationCanvasStore'
import type { GenerationCanvasEdge, GenerationCanvasNode } from '../../model/generationCanvasTypes'
import { removeUnusedReference, type ReferenceWriteContext } from './referenceWrites'
import { encodeMention } from '../../../assets/promptMentions'

const A = 'nomi-local://asset/a.png'
const B = 'nomi-local://asset/b.png'
const C = 'nomi-local://asset/c.png'

function harness(node: GenerationCanvasNode, edges: GenerationCanvasEdge[] = [], sources: GenerationCanvasNode[] = []) {
  useGenerationCanvasStore.setState({ nodes: [node, ...sources], edges })
  let current = node
  const updateNode = vi.fn((_id: string, patch: Partial<GenerationCanvasNode>) => { current = { ...current, ...patch } })
  const storeDisconnectEdge = vi.fn()
  const ctx = {
    node, archMode: null, getImageUrlSlots: () => [], latestNode: () => current, updateNode,
    getLatestMeta: () => (current.meta || {}) as Record<string, unknown>, updateMeta: vi.fn(),
    storeConnectNodes: vi.fn(), storeDisconnectEdge, closeSlot: vi.fn(), feedback: vi.fn(),
  } as unknown as ReferenceWriteContext
  return { ctx, updateNode, storeDisconnectEdge, current: () => current }
}

describe('removeUnusedReference', () => {
  beforeEach(() => useGenerationCanvasStore.setState({ nodes: [], edges: [] }))

  it('上传的「未用到」：从参考列表里删这一张，别的位置不变；提示词里的 @ 一起删', () => {
    const node = { id: 'n', kind: 'video', title: '', position: { x: 0, y: 0 }, prompt: `走进 ${encodeMention(C)}`,
      meta: { archetype: { id: 'seedance-2', modeId: 'firstlast' }, referenceImageUrls: [A, B, C] } } as GenerationCanvasNode
    const { ctx, current, storeDisconnectEdge } = harness(node)
    removeUnusedReference(ctx, C)
    expect(current().meta?.referenceImageUrls).toEqual([A, B])
    expect(current().prompt).toBe('走进')
    expect(storeDisconnectEdge).not.toHaveBeenCalled()
  })

  it('连线来的「未用到」：断开那条线，不碰参考列表', () => {
    const node = { id: 'n', kind: 'video', title: '', position: { x: 0, y: 0 }, prompt: '',
      meta: { archetype: { id: 'seedance-2', modeId: 'firstlast' }, referenceImageUrls: [A] } } as GenerationCanvasNode
    const source = { id: 's', kind: 'image', title: '', position: { x: 0, y: 0 }, result: { id: 'r', type: 'image', url: C, createdAt: 1 } } as GenerationCanvasNode
    const edge = { id: 'e', source: 's', target: 'n', mode: 'reference' } as GenerationCanvasEdge
    const { ctx, current, storeDisconnectEdge } = harness(node, [edge], [source])
    removeUnusedReference(ctx, C)
    expect(storeDisconnectEdge).toHaveBeenCalledWith('e')
    expect(current().meta?.referenceImageUrls).toEqual([A])
  })
})
