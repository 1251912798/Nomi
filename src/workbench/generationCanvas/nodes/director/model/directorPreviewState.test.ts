import { describe, expect, it } from 'vitest'
import type { GenerationCanvasNode } from '../../../model/generationCanvasTypes'
import { directorPreviewBlocksForOperation, directorPreviewSpendBlock, directorPreviewSpendBlockMessageKey } from './directorPreviewState'
import { DIRECTOR_PREVIEW_DISMISSED_URL_KEY } from '../agent/attachCameraMoveToTarget'

function director(id: string, preview: Record<string, unknown>): GenerationCanvasNode {
  return { id, kind: 'director', title: '', position: { x: 0, y: 0 }, meta: { directorPreview: { revision: 'dplan-1', ...preview } } } as unknown as GenerationCanvasNode
}
function shot(id: string, meta: Record<string, unknown> = {}): GenerationCanvasNode {
  return { id, kind: 'video', title: '', position: { x: 0, y: 0 }, meta } as unknown as GenerationCanvasNode
}

describe('directorPreviewSpendBlock (3D-BOX 花钱闸唯一判据)', () => {
  it('blocks while rendering and after a failure, lets ready and unrelated shots through', () => {
    const nodes = [shot('v1'), shot('v2'), director('d1', { status: 'rendering', targetNodeId: 'v1', updatedAt: 1 })]
    expect(directorPreviewSpendBlock('v1', nodes)).toEqual({ reason: 'rendering', directorNodeId: 'd1' })
    expect(directorPreviewSpendBlock('v2', nodes)).toBeNull()
    expect(directorPreviewSpendBlock('v1', [shot('v1'), director('d1', { status: 'failed', reason: 'capture_failed', targetNodeId: 'v1', updatedAt: 1 })]))
      .toEqual({ reason: 'failed', directorNodeId: 'd1', failure: 'capture_failed' })
    expect(directorPreviewSpendBlock('v1', [shot('v1'), director('d1', { status: 'ready', targetNodeId: 'v1', updatedAt: 1 })])).toBeNull()
  })

  it('the newest preview for a shot wins (a ready replacement lifts an older failure)', () => {
    const nodes = [shot('v1'), director('old', { status: 'failed', targetNodeId: 'v1', updatedAt: 1 }), director('new', { status: 'ready', targetNodeId: 'v1', updatedAt: 2 })]
    expect(directorPreviewSpendBlock('v1', nodes)).toBeNull()
  })

  it('maps a generate operation to its blocked shots by the landing stamps', () => {
    const nodes = [
      shot('v1', { materializationOperationId: 'canvas-landing:op-1', productionRunId: 'op-1', productionShotId: 'shot-1' }),
      shot('v2', { materializationOperationId: 'canvas-landing:op-1', productionRunId: 'op-1', productionShotId: 'shot-2' }),
      shot('v3', { storyboardDesignId: 'design-1', shotId: 's-3' }),
      director('d1', { status: 'rendering', targetNodeId: 'v1', updatedAt: 1 }),
      director('d3', { status: 'failed', reason: 'too_long', targetNodeId: 'v3', updatedAt: 1 }),
    ]
    expect(directorPreviewBlocksForOperation(nodes, 'op-1')).toEqual([{ nodeId: 'v1', shotId: 'shot-1', reason: 'rendering' }])
    expect(directorPreviewBlocksForOperation(nodes, 'op-1', ['shot-2'])).toEqual([])
    expect(directorPreviewBlocksForOperation(nodes, 'design-1')).toEqual([{ nodeId: 'v3', shotId: 's-3', reason: 'failed', failure: 'too_long' }])
  })

  it('a ready video_ref preview the draft candidate does not carry blocks the Agent generate; carrying it passes; shots without a preview are untouched', () => {
    const nodes = [
      shot('v1', { materializationOperationId: 'canvas-landing:op-1', productionRunId: 'op-1', productionShotId: 'shot-1' }),
      shot('v2', { materializationOperationId: 'canvas-landing:op-1', productionRunId: 'op-1', productionShotId: 'shot-2' }),
      director('d1', { status: 'ready', attach: 'video_ref', assetId: 'asset-p1', targetNodeId: 'v1', updatedAt: 1 }),
    ]
    expect(directorPreviewBlocksForOperation(nodes, 'op-1', undefined, { 'shot-1': [], 'shot-2': [] }))
      .toEqual([{ nodeId: 'v1', shotId: 'shot-1', reason: 'not_referenced', previewAssetId: 'asset-p1' }])
    expect(directorPreviewBlocksForOperation(nodes, 'op-1', undefined, { 'shot-1': ['asset-p1'], 'shot-2': [] })).toEqual([])
    // 手动生成钮读节点（预演已挂在节点上），不受候选核对影响。
    expect(directorPreviewSpendBlock('v1', nodes)).toBeNull()
  })

  it('a preview that could only be written into the prompt (model has no reference-video slot) is not required in the candidate', () => {
    const nodes = [shot('v1', { materializationOperationId: 'canvas-landing:op-1', productionRunId: 'op-1', productionShotId: 'shot-1' }), director('d1', { status: 'ready', attach: 'prompt_only', assetId: 'asset-p1', targetNodeId: 'v1', updatedAt: 1 })]
    expect(directorPreviewBlocksForOperation(nodes, 'op-1', undefined, { 'shot-1': [] })).toEqual([])
  })

  it('a ready preview that is no longer attached blocks with the explicit not-attached reason', () => {
    const preview = { status: 'ready', attach: 'video_ref', videoUrl: 'nomi://preview.mp4', targetNodeId: 'v1', updatedAt: 1 }
    const nodes = [shot('v1'), director('d1', preview)]
    const block = directorPreviewSpendBlock('v1', nodes)
    expect(block).toEqual({ reason: 'not_attached', directorNodeId: 'd1' })
    expect(directorPreviewSpendBlockMessageKey(block!)).toBe('director.agent.spendBlockedNotAttached')
  })

  it('an explicit dismissal opens the gate and suppresses Agent not_referenced', () => {
    const preview = { status: 'ready', attach: 'video_ref', assetId: 'asset-p1', videoUrl: 'nomi://preview.mp4', targetNodeId: 'v1', updatedAt: 1 }
    const nodes = [
      shot('v1', { productionRunId: 'op-1', productionShotId: 'shot-1', [DIRECTOR_PREVIEW_DISMISSED_URL_KEY]: 'nomi://preview.mp4' }),
      director('d1', preview),
    ]
    expect(directorPreviewSpendBlock('v1', nodes)).toBeNull()
    expect(directorPreviewBlocksForOperation(nodes, 'op-1', undefined, { 'shot-1': [] })).toEqual([])
  })

  it('a new preview URL is not covered by the old dismissal and asks for explicit produce', () => {
    const nodes = [
      shot('v1', { [DIRECTOR_PREVIEW_DISMISSED_URL_KEY]: 'nomi://old.mp4' }),
      director('d1', { status: 'ready', attach: 'video_ref', videoUrl: 'nomi://new.mp4', targetNodeId: 'v1', updatedAt: 2 }),
    ]
    expect(directorPreviewSpendBlock('v1', nodes)?.reason).toBe('not_attached')
  })
})
