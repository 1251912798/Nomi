import { describe, expect, it } from 'vitest'
import { computeGridCells, computeSplitLayout, containedImageBox, defaultCropRect, CROP_ONLY } from './cropGridGeometry'

const FULL = { x: 0, y: 0, w: 1, h: 1 }

describe('computeGridCells', () => {
  it('裁剪退化：无分割线 → 1 个 cell，等于外框本身', () => {
    const cells = computeGridCells({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 }, [], [])
    expect(cells).toHaveLength(1)
    expect(cells[0]).toMatchObject({ row: 0, column: 0 })
    expect(cells[0].x).toBeCloseTo(0.1)
    expect(cells[0].y).toBeCloseTo(0.2)
    expect(cells[0].w).toBeCloseTo(0.5)
    expect(cells[0].h).toBeCloseTo(0.4)
  })

  it('等分 2×2（默认线 0.5）→ 4 个等大 cell，证明＝旧等分行为', () => {
    const cells = computeGridCells(FULL, [0.5], [0.5])
    expect(cells).toHaveLength(4)
    for (const cell of cells) {
      expect(cell.w).toBeCloseTo(0.5)
      expect(cell.h).toBeCloseTo(0.5)
    }
    expect(cells.map((c) => [c.row, c.column])).toEqual([
      [0, 0], [0, 1], [1, 0], [1, 1],
    ])
  })

  it('等分 3×3（线 1/3,2/3）→ 9 个 cell，各 1/3', () => {
    const third = [1 / 3, 2 / 3]
    const cells = computeGridCells(FULL, third, third)
    expect(cells).toHaveLength(9)
    for (const cell of cells) {
      expect(cell.w).toBeCloseTo(1 / 3)
      expect(cell.h).toBeCloseTo(1 / 3)
    }
  })

  it('自定义线：把竖线拖到 0.7 → 左宽 0.7、右窄 0.3（不再等分）', () => {
    const cells = computeGridCells(FULL, [0.7], [0.5])
    expect(cells[0].w).toBeCloseTo(0.7)
    expect(cells[1].w).toBeCloseTo(0.3)
  })

  it('外框偏移 + 缩放：cell 是整图坐标，随框平移缩放', () => {
    const frame = { x: 0.2, y: 0.1, w: 0.6, h: 0.8 }
    const cells = computeGridCells(frame, [0.5], [])
    expect(cells).toHaveLength(2)
    expect(cells[0]).toMatchObject({ x: 0.2, y: 0.1, h: 0.8 })
    expect(cells[0].w).toBeCloseTo(0.3)
    expect(cells[1].x).toBeCloseTo(0.5)
    expect(cells[1].w).toBeCloseTo(0.3)
  })

  it('乱序传入的线也会被升序处理', () => {
    const cells = computeGridCells(FULL, [2 / 3, 1 / 3], [])
    expect(cells.map((c) => c.x)).toEqual([0, 1 / 3, 2 / 3])
  })
})

describe('computeSplitLayout（排布：行列对齐 + 绝不重叠）', () => {
  const grid = (n: number) => computeGridCells({ x: 0, y: 0, w: 1, h: 1 }, cuts(n), cuts(n))
  const cuts = (n: number) => Array.from({ length: n - 1 }, (_, i) => (i + 1) / n)
  const same = (count: number, width: number, height: number) => Array.from({ length: count }, () => ({ width, height }))
  const overlaps = (boxes: { x: number; y: number; width: number; height: number }[]) => {
    let hits = 0
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]
        const b = boxes[j]
        if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) hits += 1
      }
    }
    return hits
  }

  it('九宫格等大瓦片：3 列 3 行、步距=尺寸+间距、零重叠', () => {
    const cells = grid(3)
    const boxes = computeSplitLayout(cells, same(9, 240, 240), { gap: 16 })
    expect(boxes).toHaveLength(9)
    expect([...new Set(boxes.map((b) => b.x))]).toEqual([0, 256, 512])
    expect([...new Set(boxes.map((b) => b.y))]).toEqual([0, 256, 512])
    expect(overlaps(boxes)).toBe(0)
  })

  // 「布局很乱」的回归锁：卡片实际渲染得比按比例算出来的格子大时，排布必须跟着卡片走。
  it('卡片被壳撑到地板尺寸时也不重叠（旧版按比例算格宽 → 九张互相压掉 110px）', () => {
    const cells = grid(3)
    const boxes = computeSplitLayout(cells, same(9, 240, 240), { gap: 16 })
    const pitchX = boxes[1].x - boxes[0].x
    expect(pitchX).toBeGreaterThanOrEqual(240)
    expect(overlaps(boxes)).toBe(0)
  })

  it('同列不等高：列宽取该列最宽、行高取该行最高，仍然行列对齐', () => {
    const cells = grid(2)
    const boxes = computeSplitLayout(cells, [
      { width: 240, height: 200 },
      { width: 300, height: 240 },
      { width: 240, height: 180 },
      { width: 260, height: 160 },
    ], { gap: 16 })
    expect(boxes[0].x).toBe(0)
    expect(boxes[1].x).toBe(256) // 第 2 列起点 = 第 1 列最宽(240) + gap
    expect(boxes[2].x).toBe(0)
    expect(boxes[2].y).toBe(256) // 第 2 行起点 = 第 1 行最高(240) + gap
    expect(overlaps(boxes)).toBe(0)
  })

  it('单格（裁剪退化）：一个盒子，原点对齐', () => {
    const cells = computeGridCells({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, [], [])
    expect(computeSplitLayout(cells, [{ width: 320, height: 200 }])).toEqual([{ x: 0, y: 0, width: 320, height: 200 }])
  })

  it('空输入不炸', () => {
    expect(computeSplitLayout([], [])).toEqual([])
  })
})

// 2026-10-11 走查 §5：「九宫格不是完整切图，外侧还有另外的空间」。
// 不变量：不动取景框直接确认，N×M 个 cell 必须无缝、无重叠地拼回整张原图。
describe('切图默认取景框：九格拼回原图（不变量）', () => {
  const equalCuts = (n: number) => Array.from({ length: n - 1 }, (_, i) => (i + 1) / n)
  const grids = [[2, 2], [3, 3], [2, 3], [4, 4], [1, 3]] as const

  for (const [rows, cols] of grids) {
    it(`${rows}×${cols}：默认框 = 整图，cell 面积和 = 1 且覆盖到四边`, () => {
      const rect = defaultCropRect({ rows, cols })
      expect(rect).toEqual({ x: 0, y: 0, w: 1, h: 1 })
      const cells = computeGridCells(rect, equalCuts(cols), equalCuts(rows))
      expect(cells).toHaveLength(rows * cols)
      expect(cells.reduce((sum, c) => sum + c.w * c.h, 0)).toBeCloseTo(1, 10)
      expect(Math.min(...cells.map((c) => c.x))).toBe(0)
      expect(Math.min(...cells.map((c) => c.y))).toBe(0)
      expect(Math.max(...cells.map((c) => c.x + c.w))).toBeCloseTo(1, 10)
      expect(Math.max(...cells.map((c) => c.y + c.h))).toBeCloseTo(1, 10)
      // 无重叠：相邻 cell 边对边咬合
      for (const a of cells) {
        for (const b of cells) {
          if (a === b) continue
          const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
          const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
          expect(overlapW > 1e-9 && overlapH > 1e-9).toBe(false)
        }
      }
    })
  }

  it('纯裁剪仍是居中八分（不是整图）', () => {
    expect(defaultCropRect(CROP_ONLY)).toEqual({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
  })
})

describe('containedImageBox：取景框按真实显示矩形算', () => {
  it('宽图放进方容器 → 上下留 letterbox，框只覆盖图', () => {
    const box = containedImageBox({ width: 200, height: 200 }, { width: 400, height: 200 })
    expect(box).toEqual({ left: 0, top: 50, width: 200, height: 100 })
  })
  it('竖图放进方容器 → 左右留 letterbox', () => {
    const box = containedImageBox({ width: 200, height: 200 }, { width: 100, height: 200 })
    expect(box).toEqual({ left: 50, top: 0, width: 100, height: 200 })
  })
  it('比例一致 → 整个容器', () => {
    expect(containedImageBox({ width: 300, height: 200 }, { width: 600, height: 400 })).toEqual({ left: 0, top: 0, width: 300, height: 200 })
  })
  it('自然尺寸未知 → 整个容器（加载前不抖）', () => {
    expect(containedImageBox({ width: 300, height: 200 }, null)).toEqual({ left: 0, top: 0, width: 300, height: 200 })
  })
})
