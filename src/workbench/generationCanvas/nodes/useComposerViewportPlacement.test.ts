import { describe, expect, it } from 'vitest'
import {
  toolbarClearanceInCanvasUnits,
} from './useComposerViewportPlacement'

describe('toolbarClearanceInCanvasUnits', () => {
  it('converts the screen-space toolbar height back into canvas units and keeps the visual gap', () => {
    expect(toolbarClearanceInCanvasUnits(42, 0.7, 18)).toBe(78)
    expect(toolbarClearanceInCanvasUnits(42, 1, 18)).toBe(60)
  })

  it('does not reserve a phantom gap when no toolbar is mounted', () => {
    expect(toolbarClearanceInCanvasUnits(0, 0.7, 18)).toBe(0)
  })
})
