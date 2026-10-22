import { describe, expect, it } from 'vitest'
import { composerFocusFootprint } from '../nodes/composerCanvasPlacement'
import { NODE_COMPOSER_WIDTH } from '../nodes/nodeSizing'
import { resolveCanvasFocusViewport, resolveFreeViewRect, resolvePendingCanvasFocus, type PendingCanvasFocus } from './focusViewportRecovery'

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

describe('focus keeps the node and its composer in the visible area', () => {
  const stage = { width: 1280, height: 933 }
  // 屏幕上的 ↑（生成钮）中心：生成框屏幕宽 560、居中于节点，钮在底栏右端；高度按最坏值（预留值）算。
  const submitCenter = (view: { zoom: number; x: number; y: number }, nodeBox: { x: number; y: number; width: number; height: number }, kind: string) => {
    const footprint = composerFocusFootprint(kind)!
    const centerX = view.x + (nodeBox.x + nodeBox.width / 2) * view.zoom
    const bottom = view.y + (nodeBox.y + nodeBox.height + footprint.gap) * view.zoom + footprint.height
    return { x: centerX + NODE_COMPOSER_WIDTH / 2 - 24, y: bottom - 24 }
  }
  const inside = (point: { x: number; y: number }, rect: { left: number; top: number; width: number; height: number }) =>
    point.x >= rect.left && point.x <= rect.left + rect.width && point.y >= rect.top && point.y <= rect.top + rect.height
  const covers = (point: { x: number; y: number }, o: { left: number; top: number; right: number; bottom: number }) =>
    point.x >= o.left && point.x <= o.right && point.y >= o.top && point.y <= o.bottom

  // 事故现场：1280×933 窗口，浮动 Agent 窗压右下，迷你画面窗 / 缩放条压底部。
  const agentFloat = { left: 860, top: 420, right: 1260, bottom: 920 }
  const zoomBar = { left: 16, top: 880, right: 220, bottom: 925 }

  it('the 3D shot node: the submit arrow is inside the free area and not covered by any overlay', () => {
    const view = resolveFreeViewRect(stage, [agentFloat, zoomBar])
    const box = { x: 900, y: 600, width: 320, height: 180 }
    const next = resolveCanvasFocusViewport({ node: box, composer: composerFocusFootprint('video'), view })
    const arrow = submitCenter(next, box, 'video')
    expect(inside(arrow, view)).toBe(true)
    expect(covers(arrow, agentFloat)).toBe(false)
    expect(covers(arrow, zoomBar)).toBe(false)
  })

  it('never zooms in past 100%, however small the node or the current zoom', () => {
    const view = resolveFreeViewRect(stage, [])
    for (const box of [{ x: 0, y: 0, width: 60, height: 40 }, { x: 0, y: 0, width: 320, height: 180 }]) {
      expect(resolveCanvasFocusViewport({ node: box, composer: composerFocusFootprint('image'), view }).zoom).toBe(1)
    }
  })

  it('class: any node size / position / overlay set keeps the submit arrow in the free area', () => {
    const overlaySets = [[], [agentFloat], [agentFloat, zoomBar], [{ left: 0, top: 0, right: 60, bottom: 933 }, zoomBar]]
    const sizes = [{ width: 200, height: 148 }, { width: 320, height: 180 }, { width: 180, height: 320 }, { width: 680, height: 290 }, { width: 900, height: 700 }]
    for (const overlays of overlaySets) {
      const view = resolveFreeViewRect(stage, overlays)
      for (const size of sizes) {
        for (const kind of ['image', 'video']) {
          const box = { x: 1234, y: -567, ...size }
          const next = resolveCanvasFocusViewport({ node: box, composer: composerFocusFootprint(kind), view })
          const arrow = submitCenter(next, box, kind)
          expect(inside(arrow, view), `${kind} ${size.width}x${size.height}`).toBe(true)
        }
      }
    }
  })

  it('a node that has no composer is just centred at actual size', () => {
    const view = resolveFreeViewRect(stage, [])
    const next = resolveCanvasFocusViewport({ node: { x: 0, y: 0, width: 300, height: 200 }, composer: composerFocusFootprint('whiteboard'), view })
    expect(next.zoom).toBe(1)
    expect(next.x + 150).toBeCloseTo(640)
    expect(next.y + 100).toBeCloseTo(466.5)
  })

  it('fits oversized nodes down to the floor, and the composer end stays on screen', () => {
    const view = resolveFreeViewRect(stage, [])
    const box = { x: 0, y: 0, width: 300, height: 5000 }
    const next = resolveCanvasFocusViewport({ node: box, composer: composerFocusFootprint('video'), view })
    expect(next.zoom).toBeCloseTo(0.2)
    expect(inside(submitCenter(next, box, 'video'), view)).toBe(true)
  })
})

describe('free view area', () => {
  it('cuts the biggest remaining rectangle around each overlay', () => {
    const free = resolveFreeViewRect({ width: 1000, height: 800 }, [{ left: 600, top: 0, right: 1000, bottom: 800 }])
    expect(free).toEqual({ left: 0, top: 0, width: 600, height: 800 })
  })
  it('ignores overlays outside the stage', () => {
    expect(resolveFreeViewRect({ width: 1000, height: 800 }, [{ left: 2000, top: 0, right: 2100, bottom: 50 }])).toEqual({ left: 0, top: 0, width: 1000, height: 800 })
  })
})
