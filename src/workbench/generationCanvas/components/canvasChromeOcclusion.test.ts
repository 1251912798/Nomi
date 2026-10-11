import { describe, expect, it } from 'vitest'
import { clipPathForHoles, createFrameCoalescer, occludedHoles } from './useCanvasChromeOcclusion'

const dock = { left: 100, top: 700, right: 300, bottom: 740 }

describe('外框控件被生成框压住的那一块', () => {
  it('不相交 → 没有洞，也不加任何裁剪', () => {
    const holes = occludedHoles(dock, [{ left: 0, top: 0, right: 90, bottom: 690 }])
    expect(holes).toEqual([])
    expect(clipPathForHoles(200, 40, holes)).toBeUndefined()
  })

  it('相交 → 洞是交集，坐标相对外框控件左上角', () => {
    const holes = occludedHoles(dock, [{ left: 250, top: 600, right: 500, bottom: 720 }])
    expect(holes).toEqual([{ left: 150, top: 0, right: 200, bottom: 20 }])
  })

  it('洞转成 clip-path：外框比盒子大一圈（不剪投影），洞反向缠绕挖空', () => {
    const path = clipPathForHoles(200, 40, [{ left: 150, top: 0, right: 200, bottom: 20 }])
    expect(path).toBe('path(nonzero,"M-24 -24H224V64H-24ZM150 0V20H200V0Z")')
  })

  it('只擦边（不足半像素）不算压住', () => {
    expect(occludedHoles(dock, [{ left: 300.2, top: 700, right: 400, bottom: 740 }])).toEqual([])
  })
})

describe('量一次的时机：事件触发、合并到一帧，静止时零开销', () => {
  function harness(isPaused: () => boolean = () => false) {
    let measures = 0
    let nextId = 0
    const frames = new Map<number, () => void>()
    const coalescer = createFrameCoalescer(
      () => { measures += 1 },
      (cb) => { nextId += 1; frames.set(nextId, cb); return nextId },
      (id) => { frames.delete(id) },
      isPaused,
    )
    const flushFrame = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach((cb) => cb()) }
    return { coalescer, flushFrame, measures: () => measures, pendingFrames: () => frames.size }
  }

  it('没有事件就一帧也不排：连续 120 帧过去，量的次数不变', () => {
    const h = harness()
    h.coalescer.schedule()
    h.flushFrame()
    expect(h.measures()).toBe(1)
    for (let i = 0; i < 120; i += 1) h.flushFrame()
    expect(h.measures()).toBe(1)
    expect(h.pendingFrames()).toBe(0)
  })

  it('同一帧里来 50 个事件（拖动 / 平移一连串变动）只量一次', () => {
    const h = harness()
    for (let i = 0; i < 50; i += 1) h.coalescer.schedule()
    expect(h.pendingFrames()).toBe(1)
    h.flushFrame()
    expect(h.measures()).toBe(1)
  })

  it('量完之后再来事件，下一帧再量一次', () => {
    const h = harness()
    h.coalescer.schedule(); h.flushFrame()
    h.coalescer.schedule(); h.flushFrame()
    expect(h.measures()).toBe(2)
  })

  it('拖动期间暂停：120 帧里每帧都有节点位移事件也量 0 次，松手翻回 false 量 1 次', () => {
    let dragging = true
    const h = harness(() => dragging)
    for (let i = 0; i < 120; i += 1) { h.coalescer.schedule(); h.flushFrame() }
    expect(h.measures()).toBe(0)
    expect(h.pendingFrames()).toBe(0)
    dragging = false
    h.coalescer.schedule(); h.flushFrame()
    expect(h.measures()).toBe(1)
  })

  it('卸载时取消还没跑的那一帧', () => {
    const h = harness()
    h.coalescer.schedule()
    h.coalescer.dispose()
    h.flushFrame()
    expect(h.measures()).toBe(0)
  })
})
