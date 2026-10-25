import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGenerationCanvasStore } from './generationCanvasStore'
import * as canvasConnectDerivations from './canvasConnectDerivations'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { applyArchetypeModeSwitch } from '../nodes/controls/archetypeMeta'
import { archetypeForNode, resolveTargetModeForEdge, textModeToReturnTo } from '../agent/referenceEdgeCapability'
import { MODEL_ARCHETYPES, type ModelArchetype } from '../../../../electron/shared/modelArchetypes'
import type { GenerationCanvasEdgeMode } from '../model/generationCanvasTypes'

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

function pendingSourceNode(id: string): GenerationCanvasNode {
  return imageNode(id, 't2i')
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

const EDGE_MODES: readonly GenerationCanvasEdgeMode[] = [
  'reference', 'first_frame', 'last_frame', 'style_ref', 'character_ref', 'composition_ref',
]

type CatalogCase = { profile: ModelArchetype; textModeId: string; promotedModeId: string; edgeMode: GenerationCanvasEdgeMode }

function catalogCases(): CatalogCase[] {
  const cases: CatalogCase[] = []
  for (const profile of MODEL_ARCHETYPES) {
    if (profile.kind !== 'image' && profile.kind !== 'video' && profile.kind !== 'model3d') continue
    const textMode = profile.modes.find((mode) => mode.intent === 'text')
    if (!textMode) continue
    const target = catalogNode(profile, textMode.id)
    const source = pendingSourceNode('catalog-source')
    const seen = new Set<string>()
    for (const edgeMode of EDGE_MODES) {
      const promotedModeId = resolveTargetModeForEdge(source, target, edgeMode)
      if (!promotedModeId || promotedModeId === textMode.id || seen.has(promotedModeId)) continue
      const promotedMode = profile.modes.find((mode) => mode.id === promotedModeId)
      if (!promotedMode || !textModeToReturnTo(profile, promotedMode, false)) continue
      seen.add(promotedModeId)
      cases.push({ profile, textModeId: textMode.id, promotedModeId, edgeMode })
    }
  }
  return cases
}

function catalogNode(profile: ModelArchetype, modeId: string): GenerationCanvasNode {
  return {
    id: 'catalog-target',
    kind: profile.kind as GenerationCanvasNode['kind'],
    title: profile.id,
    position: { x: 0, y: 0 },
    prompt: '',
    categoryId: 'shots',
    meta: {
      modelKey: profile.identifierPatterns[0] ?? profile.id,
      archetype: { id: profile.id, modeId },
    },
  }
}

const CATALOG_CASES = catalogCases()

describe('canvas generation mode follows input writes', () => {
  beforeEach(() => {
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [] })
  })

  it('skips input derivation for position-only writes and computes each changed state once', () => {
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [imageNode('target', 'edit')], edges: [], groups: [] })
    const liveInputSpy = vi.spyOn(canvasConnectDerivations, 'liveInputNodeIds')
    liveInputSpy.mockClear()

    useGenerationCanvasStore.getState().moveNode('target', { x: 42, y: 18 })
    expect(liveInputSpy).not.toHaveBeenCalled()

    useGenerationCanvasStore.getState().updateNode('target', { meta: { archetype: { id: 'nano-banana', modeId: 'edit' }, referenceImageUrls: ['nomi-local://ref.png'] } })
    expect(liveInputSpy.mock.calls.length).toBeLessThanOrEqual(2)
    liveInputSpy.mockRestore()
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

  it('load convergence repairs a persisted node that is already empty', () => {
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

    useGenerationCanvasStore.getState().redo()

    expect(useGenerationCanvasStore.getState().edges).toHaveLength(0)
    expect(modeId('target')).toBe('t2i')
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

  it.each(CATALOG_CASES)('catalog profile $profile.id / $promotedModeId returns to text when its last reference is removed by disconnect', ({ profile, textModeId, promotedModeId, edgeMode }) => {
    const target = catalogNode(profile, promotedModeId)
    const source = pendingSourceNode('source')
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [source, target], edges: [{ id: 'edge', source: source.id, target: target.id, mode: edgeMode }], groups: [] })
    expect(modeId(target.id)).toBe(promotedModeId)

    useGenerationCanvasStore.getState().disconnectEdge('edge')

    expect(modeId(target.id)).toBe(textModeId)
  })

  it.each(CATALOG_CASES)('catalog profile $profile.id / $promotedModeId returns to text when its source is deleted', ({ profile, textModeId, promotedModeId, edgeMode }) => {
    const target = catalogNode(profile, promotedModeId)
    const source = pendingSourceNode('source')
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [source, target], edges: [{ id: 'edge', source: source.id, target: target.id, mode: edgeMode }], groups: [] })
    expect(modeId(target.id)).toBe(promotedModeId)

    useGenerationCanvasStore.getState().deleteNode(source.id)

    expect(modeId(target.id)).toBe(textModeId)
  })

  it.each(CATALOG_CASES)('catalog profile $profile.id / $promotedModeId returns to text when an Agent clears its last self reference', ({ profile, textModeId, promotedModeId }) => {
    const target = catalogNode(profile, promotedModeId)
    const activeMode = profile.modes.find((mode) => mode.id === promotedModeId)
    expect(activeMode).toBeDefined()
    useGenerationCanvasStore.getState().restoreSnapshot({
      nodes: [{ ...target, meta: { ...(target.meta || {}), referenceImageUrls: ['nomi-local://reference.png'] } }],
      edges: [],
      groups: [],
    })
    expect(modeId(target.id)).toBe(promotedModeId)

    useGenerationCanvasStore.getState().updateNode(target.id, {
      meta: { ...(target.meta || {}), referenceImageUrls: [] },
    })

    expect(modeId(target.id)).toBe(textModeId)
  })

  it.each(CATALOG_CASES)('catalog profile $profile.id / $promotedModeId keeps a planned first frame as an input', ({ profile, promotedModeId }) => {
    const target = catalogNode(profile, promotedModeId)
    const keyframe = {
      ...imageNode('keyframe', 't2i'),
      meta: { storyboardDesignId: 'design', shotId: 'shot-1', storyboardKeyframe: true },
    }
    useGenerationCanvasStore.getState().restoreSnapshot({
      nodes: [{ ...target, meta: { ...(target.meta || {}), storyboardDesignId: 'design', shotId: 'shot-1' } }, keyframe],
      edges: [],
      groups: [],
    })

    expect(modeId(target.id)).toBe(promotedModeId)
  })

  it.each(CATALOG_CASES)('catalog profile $profile.id / $promotedModeId keeps one remaining reference edge', ({ profile, promotedModeId, edgeMode }) => {
    const target = catalogNode(profile, promotedModeId)
    const first = pendingSourceNode('first')
    const second = pendingSourceNode('second')
    useGenerationCanvasStore.getState().restoreSnapshot({
      nodes: [first, second, target],
      edges: [
        { id: 'first', source: first.id, target: target.id, mode: edgeMode },
        { id: 'second', source: second.id, target: target.id, mode: edgeMode },
      ],
      groups: [],
    })

    useGenerationCanvasStore.getState().disconnectEdge('first')

    expect(modeId(target.id)).toBe(promotedModeId)
  })

  it('keeps an empty upstream reference and a planned storyboard keyframe as live inputs', () => {
    const target = videoNode('target', 'first')
    const keyframe = {
      ...imageNode('keyframe', 't2i'),
      meta: { storyboardDesignId: 'design', shotId: 'shot-1', storyboardKeyframe: true },
    }
    const plannedTarget = {
      ...target,
      meta: { ...(target.meta || {}), storyboardDesignId: 'design', shotId: 'shot-1' },
    }
    useGenerationCanvasStore.getState().restoreSnapshot({
      nodes: [keyframe, plannedTarget],
      edges: [{ id: 'edge', source: keyframe.id, target: plannedTarget.id, mode: 'first_frame' }],
      groups: [],
    })
    expect(modeId(plannedTarget.id)).toBe('first')

    useGenerationCanvasStore.getState().disconnectEdge('edge')

    expect(modeId(plannedTarget.id)).toBe('first')
    useGenerationCanvasStore.getState().deleteNode(keyframe.id)
    expect(modeId(plannedTarget.id)).toBe('t2v')
  })

  it('does not revert while one of two reference edges remains', () => {
    useGenerationCanvasStore.getState().restoreSnapshot({
      nodes: [sourceNode('one'), sourceNode('two'), imageNode('target', 'edit')],
      edges: [
        { id: 'one', source: 'one', target: 'target', mode: 'reference' },
        { id: 'two', source: 'two', target: 'target', mode: 'reference' },
      ],
      groups: [],
    })

    useGenerationCanvasStore.getState().disconnectEdge('one')

    expect(modeId('target')).toBe('edit')
  })
})
