import { describe, expect, it } from 'vitest'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import type { GenerationFeedback } from '../../observability/generationFeedback'
import type { ProductionShotState } from '../../../../electron/shared/productionShotPhase'
import { isPortraitAspect, nodePointerAspect, nodePointerFace, nodePointerGroupVisible, nodePointerLocatable, nodePointerSummary, pointerHoverStack } from './nodePointerFace'

const node = (patch: Partial<GenerationCanvasNode> = {}): GenerationCanvasNode => ({
  id: 'n1', kind: 'video', title: '纸船出发', categoryId: 'shots', position: { x: 0, y: 0 }, status: 'idle', prompt: '', meta: {}, ...patch,
} as GenerationCanvasNode)

const feedback = (patch: Partial<GenerationFeedback>): GenerationFeedback => ({
  phase: 'generating', message: '生成中 · 已等 12 秒', late: false, active: true, previewLabel: '', ...patch,
})

const ready = { canvasReady: true, feedback: null } as const

describe('nodePointerFace', () => {
  it('says deleted only on the host’s explicit fact, never because the node is merely missing (board D4)', () => {
    expect(nodePointerFace({ ...ready, node: undefined, removed: true })).toEqual({ kind: 'removed' })
    expect(nodePointerFace({ ...ready, node: undefined })).toEqual({ kind: 'unavailable' })
    // 画布还没载入完：节点不在不代表被删。
    expect(nodePointerFace({ node: undefined, canvasReady: false, feedback: null })).toEqual({ kind: 'unavailable' })
    // 撤销回来了：节点又在画布上，以节点为准。
    expect(nodePointerFace({ ...ready, node: node(), removed: true })).toEqual({ kind: 'empty' })
    expect(nodePointerLocatable({ kind: 'removed' })).toBe(false)
    expect(nodePointerLocatable({ kind: 'unavailable' })).toBe(false)
    expect(nodePointerLocatable({ kind: 'empty' })).toBe(true)
  })

  it('follows the node shell layering: running feedback beats a stale result and production labels', () => {
    const running = node({ status: 'running', result: { id: 'r', type: 'image', url: 'nomi-asset://a.png', createdAt: 1 } })
    const face = nodePointerFace({ node: running, canvasReady: true, feedback: feedback({}), productionState: { phase: 'awaiting_confirmation' } })
    expect(face.kind).toBe('generating')
  })

  it('shows the failure the node itself shows (same feedback), not a pointer-only copy', () => {
    const failed = feedback({ phase: 'failed', active: false, message: '服务暂时不可用' })
    expect(nodePointerFace({ node: node({ status: 'error' }), canvasReady: true, feedback: failed })).toEqual({ kind: 'failed', feedback: failed })
  })

  it('mirrors recoverable and local processing instead of falling into an empty card', () => {
    expect(nodePointerFace({ ...ready, node: node({ status: 'recoverable' }) }).kind).toBe('recoverable')
    expect(nodePointerFace({ ...ready, node: node({ meta: { uploadStatus: 'uploading' } }) }).kind).toBe('processing')
  })

  it('shows the result thumbnail through the canvas lightweight preview owner', () => {
    const done = node({ result: { id: 'r', type: 'image', url: 'nomi-asset://a.png', createdAt: 1 } })
    expect(nodePointerFace({ ...ready, node: done, productionState: { phase: 'done' } })).toMatchObject({ kind: 'result', preview: { kind: 'image' } })
  })

  it('carries the whole production state so the corner label can say 第 k/N, and keeps stopped without actions', () => {
    for (const phase of ['awaiting_confirmation', 'not_generated', 'removed'] as const) {
      expect(nodePointerFace({ ...ready, node: node(), productionState: { phase } })).toEqual({ kind: 'production', state: { phase } })
    }
    const queued: ProductionShotState = { phase: 'queued', queueIndex: 1, queueTotal: 3 }
    expect(nodePointerFace({ ...ready, node: node(), productionState: queued })).toEqual({ kind: 'production', state: queued })
    const stopped: ProductionShotState = { phase: 'stopped', stoppedReason: 'user_paused' }
    expect(nodePointerFace({ ...ready, node: node(), productionState: stopped })).toEqual({ kind: 'stopped', state: stopped })
    expect(nodePointerFace({ ...ready, node: node(), productionState: null })).toEqual({ kind: 'empty' })
  })
})

describe('nodePointerAspect', () => {
  it('keeps the true ratio for vertical shots and falls back for broken sizes', () => {
    expect(nodePointerAspect({ width: 9, height: 16 })).toBeCloseTo(0.5625)
    expect(nodePointerAspect({ width: 0, height: 0 })).toBeCloseTo(16 / 9)
  })
})

describe('nodePointerGroupVisible', () => {
  it('folds anything over three into the third tile (board drawing), including four', () => {
    expect(nodePointerGroupVisible(5, 3, false)).toEqual({ shown: 3, hidden: 2 })
    expect(nodePointerGroupVisible(4, 3, false)).toEqual({ shown: 3, hidden: 1 })
    expect(nodePointerGroupVisible(3, 3, false)).toEqual({ shown: 3, hidden: 0 })
    expect(nodePointerGroupVisible(5, 3, true)).toEqual({ shown: 5, hidden: 0 })
  })
})

describe('pointerHoverStack', () => {
  it('the last tile to arrive is the one shown; leaving takes away only the one that left', () => {
    const afterBoth = pointerHoverStack(pointerHoverStack([], 'a', true), 'b', true)
    expect(afterBoth).toEqual(['a', 'b'])
    // 先到的走了，后到的还在；后到的走了，先到的回来。
    expect(pointerHoverStack(afterBoth, 'a', false)).toEqual(['b'])
    expect(pointerHoverStack(afterBoth, 'b', false)).toEqual(['a'])
    expect(pointerHoverStack(pointerHoverStack(afterBoth, 'a', false), 'b', false)).toEqual([])
  })

  it('arriving again moves a tile to the end; nothing changes (same array) when there is nothing to change', () => {
    expect(pointerHoverStack(['a', 'b'], 'a', true)).toEqual(['b', 'a'])
    const same = ['a', 'b']
    expect(pointerHoverStack(same, 'b', true)).toBe(same)
    expect(pointerHoverStack(same, 'c', false)).toBe(same)
  })
})

describe('nodePointerSummary', () => {
  const facts = { model: 'Seedance 2', aspect: '16:9', duration: '4s', resolution: '480p' }
  it('card reads model · ratio · duration from the node', () => {
    expect(nodePointerSummary(facts, 'card')).toEqual(['Seedance 2 · 16:9 · 4s'])
  })
  it('row drops the ratio for landscape but never for portrait', () => {
    expect(nodePointerSummary(facts, 'row')).toEqual(['Seedance 2 · 4s'])
    expect(nodePointerSummary({ ...facts, aspect: '9:16' }, 'row')).toEqual(['Seedance 2 · 9:16 · 4s'])
  })
  it('a single portrait card puts two lines beside the frame: model / ratio · duration · resolution', () => {
    expect(nodePointerSummary({ ...facts, aspect: '9:16', duration: '5s' }, 'side')).toEqual(['Seedance 2', '9:16 · 5s · 480p'])
  })
  it('prints nothing it cannot read (no empty separators)', () => {
    expect(nodePointerSummary({ model: '', aspect: null, duration: null, resolution: null }, 'card')).toEqual([])
    expect(isPortraitAspect('3:4')).toBe(true)
    expect(isPortraitAspect('16:9')).toBe(false)
    expect(isPortraitAspect(null)).toBe(false)
  })
})
