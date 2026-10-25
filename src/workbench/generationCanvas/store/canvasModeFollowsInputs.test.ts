import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerationCanvasStore } from './generationCanvasStore'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { applyArchetypeModeSwitch } from '../nodes/controls/archetypeMeta'
import { archetypeForNode } from '../agent/referenceEdgeCapability'

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

function videoNode(id: string, modeId: string): GenerationCanvasNode {
  return {
    id,
    kind: 'video',
    title: id,
    position: { x: 0, y: 0 },
    prompt: '',
    categoryId: 'shots',
    meta: { modelKey: 'bytedance/seedance-2', modelVendor: 'kie', archetype: { id: 'seedance-2', modeId } },
  }
}

function directorReferenceNode(id: string): GenerationCanvasNode {
  return {
    id,
    kind: 'director',
    title: id,
    position: { x: 0, y: 0 },
    prompt: '',
    categoryId: 'shots',
    result: { id: `${id}-result`, type: 'video', url: `nomi-local://${id}.mp4`, createdAt: 1 },
  }
}

function setMode(nodeId: string, modeId: string): void {
  const state = useGenerationCanvasStore.getState()
  const node = state.nodes.find((candidate) => candidate.id === nodeId)
  const archetype = node ? archetypeForNode(node) : null
  if (!node || !archetype) throw new Error(`missing archetype for ${nodeId}`)
  state.updateNode(nodeId, { meta: applyArchetypeModeSwitch((node.meta || {}) as Record<string, unknown>, archetype, modeId) })
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

  it.each([
    ['首帧', 'first_frame', 'first'],
    ['尾帧', 'last_frame', 'firstlast'],
  ] as const)('keeps an explicit %s write after the edge write', (_label, edgeMode, explicitMode) => {
    const targetSpec = videoNode('target', 't2v')
    const sourceSpec = sourceNode('source')
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [] })
    const target = useGenerationCanvasStore.getState().addNode(targetSpec)
    const source = useGenerationCanvasStore.getState().addNode(sourceSpec)

    useGenerationCanvasStore.getState().connectNodes(source.id, target.id, edgeMode)
    setMode(target.id, explicitMode)

    expect(useGenerationCanvasStore.getState().edges).toEqual([
      expect.objectContaining({ source: source.id, target: target.id, mode: edgeMode }),
    ])
    expect(modeId(target.id)).toBe(explicitMode)
  })

  it('keeps both explicit first and last frame writes after their edges are built', () => {
    const targetSpec = videoNode('target', 't2v')
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [] })
    const target = useGenerationCanvasStore.getState().addNode(targetSpec)
    const first = useGenerationCanvasStore.getState().addNode(sourceNode('first'))
    const last = useGenerationCanvasStore.getState().addNode(sourceNode('last'))

    useGenerationCanvasStore.getState().connectNodes(first.id, target.id, 'first_frame')
    useGenerationCanvasStore.getState().connectNodes(last.id, target.id, 'last_frame')
    setMode(target.id, 'firstlast')

    expect(useGenerationCanvasStore.getState().edges.map((edge) => edge.mode)).toEqual(['first_frame', 'last_frame'])
    expect(modeId(target.id)).toBe('firstlast')
  })

  it('keeps an explicit director camera reference write after the edge is built', () => {
    const targetSpec = videoNode('target', 'firstlast')
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [] })
    const target = useGenerationCanvasStore.getState().addNode(targetSpec)
    const camera = useGenerationCanvasStore.getState().addNode(directorReferenceNode('camera'))

    useGenerationCanvasStore.getState().connectNodes(camera.id, target.id, 'reference')
    setMode(target.id, 'firstlast')

    expect(useGenerationCanvasStore.getState().edges).toEqual([
      expect.objectContaining({ source: camera.id, target: target.id, mode: 'reference' }),
    ])
    expect(modeId(target.id)).toBe('firstlast')
  })
})
