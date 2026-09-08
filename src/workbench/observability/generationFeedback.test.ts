import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { GenerationCanvasNode } from '../generationCanvas/model/generationCanvasTypes'
import { generationFeedback } from './generationFeedback'
import { GenerationStatusBar } from '../generationCanvas/nodes/GenerationStatusBar'

const node = (percent?: number): GenerationCanvasNode => ({ id: 'test', kind: 'image', title: '', position: { x: 0, y: 0 }, status: 'running', progress: { phase: 'generating', updatedAt: 1000, ...(percent === undefined ? {} : { percent }) } })
const html = (value: GenerationCanvasNode) => renderToStaticMarkup(React.createElement(GenerationStatusBar, { feedback: generationFeedback(value, 19000)! }))
describe('C1 feedback atom', () => {
  it('omits numbers without provider evidence and preserves a real percentage', () => {
    expect(html(node())).not.toContain('%')
    expect(html(node())).not.toMatch(/前面.*个/)
    expect(html(node(60))).toContain('60%')
    for (const invalid of [NaN, Infinity, -1, 101]) expect(html(node(invalid))).not.toContain('%')
  })
  it('returns the exact same narration object for simultaneous consumers', () => {
    const value = node()
    expect(generationFeedback(value, 19001)).toBe(generationFeedback(value, 19999))
    expect(generationFeedback(value, 19000)?.message).toBe('生成中 · 已等 18 秒')
  })
  it('does not mistake queue zero for a percentage', () => {
    const value = node(0); value.progress!.phase = 'comfyui-queued'
    expect(html(value)).not.toContain('%')
  })
})
