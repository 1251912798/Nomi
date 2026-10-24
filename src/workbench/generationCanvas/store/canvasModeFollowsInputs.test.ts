import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerationCanvasStore } from './generationCanvasStore'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

function imageNode(id: string, modeId: string): GenerationCanvasNode {
  return {
    id,
    kind: 'image',
    title: id,
    position: { x: 0, y: 0 },
    prompt: '',
    categoryId: 'shots',
    meta: { archetype: { id: 'nano-banana', modeId } },
  }
}

function sourceNode(id: string): GenerationCanvasNode {
  return {
    ...imageNode(id, 't2i'),
    result: { id: `${id}-result`, type: 'image', url: `nomi-local://${id}.png`, createdAt: 1 },
  }
}

function modeId(nodeId: string): string | undefined {
  const node = useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId)
  return (node?.meta?.archetype as { modeId?: string } | undefined)?.modeId
}

describe('canvas generation mode follows input writes', () => {
  beforeEach(() => {
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [] })
  })

  it('reverts immediately when the last reference edge is disconnected while the composer is absent', () => {
    useGenerationCanvasStore.getState().restoreSnapshot({
      nodes: [sourceNode('source'), imageNode('target', 'edit')],
      edges: [{ id: 'edge', source: 'source', target: 'target', mode: 'reference' }],
      groups: [],
    })

    useGenerationCanvasStore.getState().disconnectEdge('edge')

    expect(modeId('target')).toBe('t2i')
  })

  it('reverts when deleting the source removes the target input edge', () => {
    useGenerationCanvasStore.getState().restoreSnapshot({
      nodes: [sourceNode('source'), imageNode('target', 'edit')],
      edges: [{ id: 'edge', source: 'source', target: 'target', mode: 'reference' }],
      groups: [],
    })

    useGenerationCanvasStore.getState().deleteNode('source')

    expect(modeId('target')).toBe('t2i')
  })

  it('reverts when an Agent-style node write removes the last uploaded reference', () => {
    useGenerationCanvasStore.getState().restoreSnapshot({
      nodes: [{ ...imageNode('target', 'edit'), meta: { archetype: { id: 'nano-banana', modeId: 'edit' }, referenceImageUrls: ['nomi-local://ref.png'] } }],
      edges: [],
      groups: [],
    })

    useGenerationCanvasStore.getState().updateNode('target', {
      meta: { archetype: { id: 'nano-banana', modeId: 'edit' }, referenceImageUrls: [] },
    })

    expect(modeId('target')).toBe('t2i')
  })

  it('reconciles imported snapshots before any composer is mounted', () => {
    useGenerationCanvasStore.getState().restoreSnapshot({
      nodes: [imageNode('target', 'edit')],
      edges: [],
      groups: [],
    })

    expect(modeId('target')).toBe('t2i')
  })

  it('undoes the input and the derived mode together', () => {
    useGenerationCanvasStore.getState().restoreSnapshot({
      nodes: [sourceNode('source'), imageNode('target', 'edit')],
      edges: [{ id: 'edge', source: 'source', target: 'target', mode: 'reference' }],
      groups: [],
    })

    useGenerationCanvasStore.getState().disconnectEdge('edge')
    expect(modeId('target')).toBe('t2i')

    useGenerationCanvasStore.getState().undo()

    expect(useGenerationCanvasStore.getState().edges).toHaveLength(1)
    expect(modeId('target')).toBe('edit')
  })
})
