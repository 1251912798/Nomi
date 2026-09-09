import { describe, expect, it } from 'vitest'
import { resolveComposerObstaclePlacement, type ComposerRect } from './composerObstaclePlacement'
const stage = { left: 0, top: 0, right: 1200, bottom: 900 }
const node = { left: 400, top: 350, right: 700, bottom: 550 }
const input = { stage, node, width: 400, height: 200, gap: 14, aboveClearance: 60 }
function verify(obstacles: ComposerRect[], options = input) {
  const p = resolveComposerObstaclePlacement({ ...options, obstacles })
  expect(p.left).toBeGreaterThanOrEqual(options.stage.left)
  expect(p.top).toBeGreaterThanOrEqual(options.stage.top)
  expect(p.left + p.width).toBeLessThanOrEqual(options.stage.right)
  expect(p.top + p.height).toBeLessThanOrEqual(options.stage.bottom)
  for (const r of obstacles) expect(p.left < r.right && p.left + p.width > r.left && p.top < r.bottom && p.top + p.height > r.top).toBe(false)
  return p
}
describe('composer neighbor collision boundary', () => {
  it('prefers below when clear', () => expect(verify([]).side).toBe('below'))
  it('flips above when a neighboring row blocks below', () => {
    expect(verify([{ left: 0, top: 560, right: 1200, bottom: 900 }]).side).toBe('above')
  })
  it('uses a side when both vertical regions are blocked', () => {
    expect(verify([{ left: 0, top: 560, right: 1200, bottom: 900 }, { left: 0, top: 0, right: 1200, bottom: 340 }]).side).toBe('right')
  })
  it('shrinks inside remaining free space instead of forcing a colliding minimum', () => {
    const p = verify([{ left: 0, top: 610, right: 1200, bottom: 900 }, { left: 0, top: 0, right: 1200, bottom: 300 }, { left: 0, top: 300, right: 390, bottom: 610 }, { left: 710, top: 300, right: 1200, bottom: 610 }])
    expect(p.width * p.height).toBeGreaterThan(0)
    expect(p.width < input.width || p.height < input.height).toBe(true)
  })
  it('keeps a scrollable card when all four surrounding regions are completely occupied', () => {
    const p = verify([{ left: 0, top: 0, right: 1200, bottom: 350 }, { left: 0, top: 550, right: 1200, bottom: 900 }, { left: 0, top: 350, right: 400, bottom: 550 }, { left: 700, top: 350, right: 1200, bottom: 550 }])
    expect(p.width * p.height).toBeGreaterThan(0)
    expect(p.width).toBeLessThan(input.width)
  })
  it('avoids connection hit regions as well as the dock when placing beside media', () => {
    verify([{ left: 0, top: 560, right: 1200, bottom: 900 }, { left: 0, top: 0, right: 1200, bottom: 340 }, { left: 288, top: 360, right: 400, bottom: 528 }, { left: 700, top: 360, right: 812, bottom: 528 }])
  })
  it('does not mix screen pixels and canvas zoom for dense nodes and docks', () => {
    for (const zoom of [0.6, 1, 1.5]) {
      const scaled = { left: node.left * zoom, right: node.right * zoom, top: node.top * zoom, bottom: node.bottom * zoom }
      verify([{ left: 10, top: 700, right: 1190, bottom: 900 }, { left: 730, top: 80, right: 950, bottom: 620 }], { ...input, node: scaled, gap: 14 * zoom })
    }
  })
})
