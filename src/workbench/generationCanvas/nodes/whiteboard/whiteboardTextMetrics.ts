import type { CanvasText } from './lib/canvas'
import type { LeaferUiModule } from './whiteboardCanvasTypes'

export type TextSize = { width: number; height: number }
export type TextMeasure = (content: string, fontSize: number) => TextSize | null

/**
 * The size of a text object is whatever Leafer lays out for it: the same `Text` node that draws the glyphs
 * answers how big they are (auto width and height, no wrapping). Selection, hit testing, group bounds,
 * snapping and raster export all read the size stored on the `CanvasText`, so every write path stores this number
 * instead of an estimate made from the character count.
 */
export function measureWhiteboardText(Text: LeaferUiModule['Text'], content: string, fontSize: number): TextSize {
  const probe = new Text({ text: content || ' ', fontSize })
  probe.updateLayout()
  const { width, height } = probe.boxBounds
  probe.destroy()
  return { width: Math.max(1, Math.ceil(width), Math.ceil(fontSize)), height: Math.max(1, Math.ceil(height)) }
}

const withMeasuredSize = (item: Omit<CanvasText, 'width' | 'height'>, measure: TextMeasure): CanvasText | null => {
  const size = measure(item.text, item.fontSize)
  return size ? { ...item, ...size } : null
}

/** The only way a text object comes into existence: its size is the measured one. Null while the canvas engine is not ready. */
export function createWhiteboardText(input: Omit<CanvasText, 'width' | 'height'>, measure: TextMeasure): CanvasText | null {
  return withMeasuredSize(input, measure)
}

/** Applies an edit to a text object and re-derives its size from the new content and font size. */
export function applyTextChanges(item: CanvasText, changes: Partial<Pick<CanvasText, 'text' | 'fontSize' | 'color'>>, measure: TextMeasure): CanvasText {
  const next = { ...item, ...changes }
  if (next.text === item.text && next.fontSize === item.fontSize) return next
  return withMeasuredSize(next, measure) ?? item
}
