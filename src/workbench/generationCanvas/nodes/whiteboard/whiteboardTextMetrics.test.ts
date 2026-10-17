import { describe, expect, it } from 'vitest'
import type { CanvasText } from './lib/canvas'
import { getCanvasObjectRenderBounds, getLayerBaseBounds } from './whiteboardCanvasGeometry'
import { applyTextChanges, createWhiteboardText, type TextMeasure } from './whiteboardTextMetrics'

// Stand-in for the Leafer layout answer: one em per character, 1.5 em line height, no wrapping.
const measure: TextMeasure = (content, fontSize) => ({ width: Math.max(fontSize, content.length * fontSize), height: fontSize * 1.5 })
const text = (over: Partial<CanvasText> = {}): CanvasText => ({ id: 't1', layerId: 'l1', text: 'Type text', x: 40, y: 60, width: 288, height: 48, fontSize: 32, color: '#111111', ...over })

describe('text object size follows its content', () => {
  it('re-derives width and height when the content changes', () => {
    const long = '这是一段明显比占位词长得多的中文文字内容用来检查点击范围'
    const next = applyTextChanges(text(), { text: long }, measure)
    expect(next.width).toBe(long.length * 32)
    expect(next.height).toBe(48)
    expect(next.text).toBe(long)
  })

  it('creates a text object with the measured size, and none while the engine is not ready', () => {
    const { width: _width, height: _height, ...input } = text()
    expect(createWhiteboardText(input, measure)).toMatchObject({ width: 9 * 32, height: 48, text: 'Type text' })
    expect(createWhiteboardText(input, () => null)).toBeNull()
  })

  it('re-derives the size when only the font size changes', () => {
    const next = applyTextChanges(text(), { fontSize: 64 }, measure)
    expect(next).toMatchObject({ fontSize: 64, width: 9 * 64, height: 96 })
  })

  it('keeps the stored size for edits that do not change the layout', () => {
    const next = applyTextChanges(text({ width: 300, height: 50 }), { color: '#ef4444' }, measure)
    expect(next).toMatchObject({ color: '#ef4444', width: 300, height: 50 })
  })

  it('ignores a layout edit while the canvas engine is not ready instead of storing a guess', () => {
    const before = text()
    expect(applyTextChanges(before, { text: 'x'.repeat(40) }, () => null)).toBe(before)
  })

  it('selection, hit and group bounds all read the same re-derived size', () => {
    const grown = applyTextChanges(text(), { text: 'x'.repeat(30) }, measure)
    const asObject = getCanvasObjectRenderBounds({ kind: 'text', id: 't1' }, [], [], [], new Map(), new Map(), [grown])
    const asGroup = getLayerBaseBounds('l1', new Map(), new Map(), new Map(), new Map(), [grown])
    expect(asObject).toEqual({ x: 40, y: 60, width: 960, height: 48 })
    expect(asGroup).toEqual(asObject)
  })
})
