import { describe, expect, it } from 'vitest'
import { resolveCanvasFocusZoom, resolvePendingCanvasFocus, type PendingCanvasFocus } from './focusViewportRecovery'

const node = (id: string, categoryId = 'shots') => ({
  id,
  kind: 'image' as const,
  categoryId,
  title: id,
  prompt: '',
  position: { x: 0, y: 0 },
  size: { width: 200, height: 200 },
  status: 'idle' as const,
})

const pending: PendingCanvasFocus = {
  nodeId: 'temporary-variant',
  categoryId: 'shots',
  viewport: { x: 30, y: 10, zoom: 0.86 },
}

describe('resolvePendingCanvasFocus', () => {
  it('focuses the target once it is visible in the active category', () => {
    const target = node('temporary-variant')
    expect(resolvePendingCanvasFocus(pending, 'shots', [target], [target])).toEqual({ type: 'focus', node: target })
  })

  it('waits for virtualization instead of restoring while the target still exists', () => {
    expect(resolvePendingCanvasFocus(pending, 'shots', [], [node('temporary-variant')])).toEqual({ type: 'wait' })
  })

  it('restores the pre-focus viewport after undo removes the target', () => {
    expect(resolvePendingCanvasFocus(pending, 'shots', [], [])).toEqual({ type: 'restore', viewport: pending.viewport })
  })

  it('does not restore during a category transition', () => {
    expect(resolvePendingCanvasFocus(pending, 'assets', [], [])).toEqual({ type: 'wait' })
  })
})

describe('readable node focus after overview', () => {
  it('raises a 20% overview to actual size for an ordinary node', () => {
    expect(resolveCanvasFocusZoom({ width: 300, height: 180 }, { width: 900, height: 700 }, 0.2)).toBe(1)
  })
  it('fits oversized and portrait nodes rather than cutting their aspect ratio', () => {
    expect(resolveCanvasFocusZoom({ width: 300, height: 1200 }, { width: 900, height: 700 }, 0.2)).toBeCloseTo(560 / 1200)
    expect(resolveCanvasFocusZoom({ width: 1800, height: 200 }, { width: 900, height: 700 }, 2)).toBeCloseTo(0.4)
  })
  it('keeps an already readable zoom when the node still fits', () => {
    expect(resolveCanvasFocusZoom({ width: 200, height: 150 }, { width: 900, height: 700 }, 2)).toBe(2)
  })
})
