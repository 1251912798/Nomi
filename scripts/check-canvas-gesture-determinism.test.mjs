import { describe, expect, it } from 'vitest'
import { findCoordinateOnlyClicks } from './check-canvas-gesture-determinism.mjs'

describe('canvas benchmark click hit ownership', () => {
  it.each([
    'await page.mouse.click(box.x + box.width * 0.45, box.y + 14)',
    'await page.mouse.click(pick.box.x + pick.box.width * 0.45, pick.box.y + 14)',
    'await page.mouse.click(\n rect.left + 20,\n rect.top + 10\n)',
  ])('rejects unverified coordinate arithmetic: %s', source => {
    expect(findCoordinateOnlyClicks(source)).toHaveLength(1)
  })
  it('accepts points obtained from the shared hit owner', () => {
    expect(findCoordinateOnlyClicks(`
      const hit = await findNodeHitPoint(page, { nodeSelector })
      if (!hit) throw new Error('No selectable point')
      await page.mouse.click(hit.x, hit.y)
      await page.mouse.click(blank.x, blank.y)
    `)).toEqual([])
  })
})
