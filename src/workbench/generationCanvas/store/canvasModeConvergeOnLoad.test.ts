import { beforeEach, describe, expect, it, vi } from 'vitest'

const disk = vi.hoisted(() => ({
  record: null as null | { id: string; payload: Record<string, unknown> },
}))

vi.mock('../../../../electron/projects/repository', () => ({
  readProject: () => structuredClone(disk.record),
  saveProject: async (_projectId: string, record: { id: string; payload: Record<string, unknown> }) => {
    disk.record = structuredClone(record)
    return disk.record
  },
}))
vi.mock('../../../../electron/projects/projectCanvasWrite', () => ({
  serializeProjectCanvasWrite: async (_projectId: string, operation: () => Promise<unknown>) => operation(),
}))
import { useGenerationCanvasStore } from './generationCanvasStore'
import { liveInputNodeIds } from './canvasConnectDerivations'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { createDiskGateway } from '../../../../electron/capabilityCore/gateway'

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

function sourceNode(id: string): GenerationCanvasNode {
  return {
    id,
    kind: 'image',
    title: id,
    position: { x: 0, y: 0 },
    prompt: '',
    categoryId: 'shots',
  }
}

describe('canvas generation mode converges once after load and event-tail replay', () => {
  beforeEach(() => {
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [] })
    disk.record = {
      id: 'offline-project',
      payload: {
        generationCanvas: {
          nodes: [sourceNode('source'), videoNode('target', 'omni')],
          edges: [{ id: 'edge', source: 'source', target: 'target', mode: 'reference' }],
          groups: [],
        },
      },
    }
  })

  it('repairs a disk-gateway write made while the project was not in the renderer', async () => {
    const gateway = createDiskGateway('offline-project')
    const base = await gateway.readDoc()
    await gateway.apply({ ...base, edges: [] }, base)
    const loaded = await gateway.readDoc()

    useGenerationCanvasStore.getState().restoreSnapshot(loaded)

    expect(loaded.edges).toHaveLength(0)
    expect(useGenerationCanvasStore.getState().nodes.find((node) => node.id === 'target')?.meta?.archetype).toMatchObject({ modeId: 't2v' })
  })

  it('repairs old persisted single-image mode with no input without creating an undo entry', () => {
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [videoNode('target', 'omni')], edges: [], groups: [] })

    expect(useGenerationCanvasStore.getState().nodes[0]?.meta?.archetype).toMatchObject({ modeId: 't2v' })
    expect(useGenerationCanvasStore.getState().canUndo).toBe(false)
  })

  it('repairs a reference edge removed by the event tail after the snapshot', () => {
    useGenerationCanvasStore.getState().restoreSnapshot({
      nodes: [sourceNode('source'), videoNode('target', 'omni')],
      edges: [{ id: 'edge', source: 'source', target: 'target', mode: 'reference' }],
      groups: [],
    })
    expect(useGenerationCanvasStore.getState().nodes.find((node) => node.id === 'target')?.meta?.archetype).toMatchObject({ modeId: 'omni' })

    useGenerationCanvasStore.getState().applyEventTail([{ type: 'canvas.edge.disconnected', payload: { edgeId: 'edge' } }])

    expect(useGenerationCanvasStore.getState().nodes.find((node) => node.id === 'target')?.meta?.archetype).toMatchObject({ modeId: 't2v' })
    expect(useGenerationCanvasStore.getState().canUndo).toBe(false)
  })

  it('re-converges when a stale mode update arrives in the event tail after load', () => {
    const target = videoNode('target', 'omni')
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [target], edges: [], groups: [] })
    expect(useGenerationCanvasStore.getState().nodes[0]?.meta?.archetype).toMatchObject({ modeId: 't2v' })

    useGenerationCanvasStore.getState().applyEventTail([{
      type: 'canvas.node.updated',
      payload: { nodeId: 'target', patch: { meta: target.meta } },
    }])

    expect(useGenerationCanvasStore.getState().nodes[0]?.meta?.archetype).toMatchObject({ modeId: 't2v' })
  })

  it('keeps an unresolved upstream edge as a live input during load', () => {
    useGenerationCanvasStore.getState().restoreSnapshot({
      nodes: [sourceNode('source'), videoNode('target', 'omni')],
      edges: [{ id: 'edge', source: 'source', target: 'target', mode: 'reference' }],
      groups: [],
    })

    expect(liveInputNodeIds(useGenerationCanvasStore.getState())).toEqual(new Set(['target']))
    expect(useGenerationCanvasStore.getState().nodes.find((node) => node.id === 'target')?.meta?.archetype).toMatchObject({ modeId: 'omni' })
  })

  it('keeps a planned storyboard first frame as a live input during load', () => {
    const keyframe = { ...sourceNode('keyframe'), meta: { storyboardKeyframe: true, storyboardDesignId: 'design', shotId: 'shot-1' } }
    const target = { ...videoNode('target', 'first'), meta: { ...videoNode('target', 'first').meta, storyboardDesignId: 'design', shotId: 'shot-1' } }
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [keyframe, target], edges: [], groups: [] })

    expect(useGenerationCanvasStore.getState().nodes.find((node) => node.id === 'target')?.meta?.archetype).toMatchObject({ modeId: 'first' })
  })

  it('keeps an explicitly empty first-frame workflow during load', () => {
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [videoNode('target', 'first')], edges: [], groups: [] })

    expect(useGenerationCanvasStore.getState().nodes[0]?.meta?.archetype).toMatchObject({ modeId: 'first' })
  })
})
