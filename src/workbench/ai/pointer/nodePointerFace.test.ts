import { describe, expect, it } from 'vitest'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import type { GenerationFeedback } from '../../observability/generationFeedback'
import { nodePointerAspect, nodePointerFace, nodePointerGroupVisible } from './nodePointerFace'

const node = (patch: Partial<GenerationCanvasNode> = {}): GenerationCanvasNode => ({
  id: 'n1', kind: 'video', title: '纸船出发', categoryId: 'shots', position: { x: 0, y: 0 }, status: 'idle', prompt: '', meta: {}, ...patch,
} as GenerationCanvasNode)

const feedback = (patch: Partial<GenerationFeedback>): GenerationFeedback => ({
  phase: 'generating', message: '生成中 · 已等 12 秒', late: false, active: true, previewLabel: '', ...patch,
})

describe('nodePointerFace', () => {
  it('says deleted only when the node is gone from the canvas', () => {
    expect(nodePointerFace({ node: undefined, feedback: null })).toEqual({ kind: 'deleted' })
  })

  it('follows the node shell layering: running feedback beats a stale result and production labels', () => {
    const running = node({ status: 'running', result: { id: 'r', type: 'image', url: 'nomi-asset://a.png', createdAt: 1 } })
    const face = nodePointerFace({ node: running, feedback: feedback({}), productionPhase: 'awaiting_confirmation' })
    expect(face.kind).toBe('generating')
  })

  it('shows the failure the node itself shows (same feedback), not a pointer-only copy', () => {
    const failed = feedback({ phase: 'failed', active: false, message: '服务暂时不可用' })
    expect(nodePointerFace({ node: node({ status: 'error' }), feedback: failed })).toEqual({ kind: 'failed', feedback: failed })
  })

  it('shows the result thumbnail through the canvas lightweight preview owner', () => {
    const done = node({ result: { id: 'r', type: 'image', url: 'nomi-asset://a.png', createdAt: 1 } })
    const face = nodePointerFace({ node: done, feedback: null, productionPhase: 'done' })
    expect(face).toMatchObject({ kind: 'result', preview: { kind: 'image' } })
  })

  it('maps production phases that the node marks with a corner label, and keeps stopped without actions', () => {
    for (const phase of ['awaiting_confirmation', 'not_generated', 'removed', 'queued'] as const) {
      expect(nodePointerFace({ node: node(), feedback: null, productionPhase: phase })).toEqual({ kind: 'production', phase })
    }
    expect(nodePointerFace({ node: node(), feedback: null, productionPhase: 'stopped' })).toEqual({ kind: 'stopped' })
    expect(nodePointerFace({ node: node(), feedback: null, productionPhase: null })).toEqual({ kind: 'empty' })
  })
})

describe('nodePointerAspect', () => {
  it('keeps the true ratio for vertical shots and falls back for broken sizes', () => {
    expect(nodePointerAspect({ width: 9, height: 16 })).toBeCloseTo(0.5625)
    expect(nodePointerAspect({ width: 0, height: 0 })).toBeCloseTo(16 / 9)
  })
})

describe('nodePointerGroupVisible', () => {
  it('folds the tail into "N more" and never folds a single extra', () => {
    expect(nodePointerGroupVisible(5, 3, false)).toEqual({ shown: 3, hidden: 2 })
    expect(nodePointerGroupVisible(4, 3, false)).toEqual({ shown: 4, hidden: 0 })
    expect(nodePointerGroupVisible(5, 3, true)).toEqual({ shown: 5, hidden: 0 })
  })
})
