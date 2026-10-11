import React, { type JSX } from 'react'
import { cn } from '../../../../utils/cn'
import { containedImageBox, defaultCropRect, type DisplayBox } from './cropGridGeometry'

export type CropRect = { x: number; y: number; w: number; h: number }
export type CropGridResult = { rect: CropRect; cols: number[]; rows: number[] }
/** 行列数：{1,1} = 纯裁剪（无内线），其余 = 切成 rows×cols 张。 */
export type CropGridSize = Readonly<{ rows: number; cols: number }>

type CornerMode = 'nw' | 'ne' | 'sw' | 'se'
type DragTarget =
  | { kind: 'move' }
  | { kind: 'corner'; corner: CornerMode }
  | { kind: 'col'; index: number }
  | { kind: 'row'; index: number }

type ActiveDrag = {
  target: DragTarget
  pointerId: number
  startX: number
  startY: number
  boxWidth: number
  boxHeight: number
  startRect: CropRect
  startCols: number[]
  startRows: number[]
}

const MIN_CROP = 0.06
// 框内相邻分割线（或线与边）最小间距，防止线叠在一起切出 0 宽 cell。
const MIN_GAP = 0.06

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// 默认等分线：n 份 → [1/n, 2/n, …, (n-1)/n]（1 份 → 空）。
function equalCuts(parts: number): number[] {
  const cuts: number[] = []
  for (let i = 1; i < parts; i += 1) cuts.push(i / parts)
  return cuts
}

/**
 * 非破坏式可调取景框：裁剪与切图共用一个组件（P1，不留两套）。
 * gridSize {1,1} = 纯裁剪（无内线）；其余 = cols-1 条竖线 + rows-1 条横线（可拖），默认等分。
 * 内线坐标 = 框内归一化分数（随外框缩放自动跟随）。确认时把 { rect, cols, rows } 交回父级，
 * 由父级按 cell 裁出新节点（原图零改动）。坐标约定：取景框的 0~1 == 图片**真实显示矩形**（stage，已去掉 letterbox）。
 */
export default function ImageCropGridOverlay({
  imageUrl,
  gridSize,
  onDraftChange,
}: {
  imageUrl: string
  gridSize: CropGridSize
  /** 把当前取景框报给宿主：确认/取消由宿主在图片区**之外**渲染，避免按钮压住要切的格子（2026-10-11）。 */
  onDraftChange?: (draft: CropGridResult) => void
}): JSX.Element {
  const outerRef = React.useRef<HTMLDivElement>(null)
  const boxRef = React.useRef<HTMLDivElement>(null)
  const dragRef = React.useRef<ActiveDrag | null>(null)
  // 默认取景框归 cropGridGeometry.defaultCropRect（切图 = 整图，裁剪 = 居中八分）。
  // 取景框的坐标系 = 图片真实显示矩形（object-contain 后），不是整个卡片：stage 就是那块矩形。
  const [stage, setStage] = React.useState<DisplayBox | null>(null)
  const [natural, setNatural] = React.useState<{ width: number; height: number } | null>(null)
  React.useLayoutEffect(() => {
    const outer = outerRef.current
    if (!outer) return
    const measure = () => setStage(containedImageBox({ width: outer.clientWidth, height: outer.clientHeight }, natural))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(outer)
    return () => observer.disconnect()
  }, [natural])
  const [rect, setRect] = React.useState<CropRect>(() => defaultCropRect(gridSize))
  const [cols, setCols] = React.useState<number[]>(() => equalCuts(gridSize.cols))
  const [rows, setRows] = React.useState<number[]>(() => equalCuts(gridSize.rows))

  // 确认/取消已经移到图片区之外（宿主渲染），这里只把取景框状态报上去。
  React.useEffect(() => {
    onDraftChange?.({ rect, cols, rows })
  }, [rect, cols, rows, onDraftChange])

  const beginDrag = (target: DragTarget) => (event: React.PointerEvent) => {
    event.stopPropagation()
    event.preventDefault()
    const box = boxRef.current?.getBoundingClientRect()
    if (!box) return
    dragRef.current = {
      target,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      boxWidth: box.width,
      boxHeight: box.height,
      startRect: rect,
      startCols: cols,
      startRows: rows,
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    event.stopPropagation()
    const dx = (event.clientX - drag.startX) / Math.max(1, drag.boxWidth)
    const dy = (event.clientY - drag.startY) / Math.max(1, drag.boxHeight)
    const s = drag.startRect
    const t = drag.target

    if (t.kind === 'move') {
      const x = clamp01(Math.min(s.x + dx, 1 - s.w))
      const y = clamp01(Math.min(s.y + dy, 1 - s.h))
      setRect({ x: Math.max(0, x), y: Math.max(0, y), w: s.w, h: s.h })
      return
    }

    if (t.kind === 'corner') {
      const right = s.x + s.w
      const bottom = s.y + s.h
      let nx = s.x
      let ny = s.y
      let nr = right
      let nb = bottom
      if (t.corner === 'nw') {
        nx = clamp01(Math.min(s.x + dx, right - MIN_CROP))
        ny = clamp01(Math.min(s.y + dy, bottom - MIN_CROP))
      }
      if (t.corner === 'ne') {
        nr = clamp01(Math.max(right + dx, s.x + MIN_CROP))
        ny = clamp01(Math.min(s.y + dy, bottom - MIN_CROP))
      }
      if (t.corner === 'sw') {
        nx = clamp01(Math.min(s.x + dx, right - MIN_CROP))
        nb = clamp01(Math.max(bottom + dy, s.y + MIN_CROP))
      }
      if (t.corner === 'se') {
        nr = clamp01(Math.max(right + dx, s.x + MIN_CROP))
        nb = clamp01(Math.max(bottom + dy, s.y + MIN_CROP))
      }
      setRect({ x: nx, y: ny, w: Math.max(MIN_CROP, nr - nx), h: Math.max(MIN_CROP, nb - ny) })
      return
    }

    // 内部分割线：在「框内分数」空间拖动，夹在相邻线/边的 MIN_GAP 内。
    if (t.kind === 'col') {
      const base = drag.startCols
      const rel = dx / Math.max(0.0001, s.w)
      const lower = (t.index > 0 ? base[t.index - 1] : 0) + MIN_GAP
      const upper = (t.index < base.length - 1 ? base[t.index + 1] : 1) - MIN_GAP
      const next = [...base]
      next[t.index] = clamp(base[t.index] + rel, lower, upper)
      setCols(next)
      return
    }
    if (t.kind === 'row') {
      const base = drag.startRows
      const rel = dy / Math.max(0.0001, s.h)
      const lower = (t.index > 0 ? base[t.index - 1] : 0) + MIN_GAP
      const upper = (t.index < base.length - 1 ? base[t.index + 1] : 1) - MIN_GAP
      const next = [...base]
      next[t.index] = clamp(base[t.index] + rel, lower, upper)
      setRows(next)
    }
  }

  const endDrag = (event: React.PointerEvent) => {
    if (!dragRef.current) return
    event.stopPropagation()
    dragRef.current = null
  }

  const pct = (v: number) => `${v * 100}%`
  const handleClass = cn(
    'absolute w-3 h-3 -m-1.5 rounded-full bg-nomi-paper border border-nomi-ink-20',
    'shadow-nomi-sm',
  )
  const gripClass = cn(
    'absolute w-3 h-3 rounded-full bg-nomi-paper border border-nomi-ink-20',
    'shadow-nomi-sm -translate-x-1/2 -translate-y-1/2',
  )

  return (
    <div
      ref={outerRef}
      className="absolute inset-0 z-[14] select-none touch-none"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        ref={boxRef}
        data-crop-stage="true"
        className="absolute"
        style={stage ? { left: stage.left, top: stage.top, width: stage.width, height: stage.height } : { inset: 0 }}
      >
      <img
        src={imageUrl}
        alt=""
        className="w-full h-full object-fill pointer-events-none"
        draggable={false}
        onLoad={(event) => {
          const img = event.currentTarget
          if (img.naturalWidth > 0 && img.naturalHeight > 0) setNatural({ width: img.naturalWidth, height: img.naturalHeight })
        }}
      />
      {/* 框外压暗：上/下/左/右四块 */}
      <div
        className="absolute left-0 right-0 top-0 bg-nomi-ink/[0.55] pointer-events-none"
        style={{ height: pct(rect.y) }}
      />
      <div
        className="absolute left-0 right-0 bottom-0 bg-nomi-ink/[0.55] pointer-events-none"
        style={{ height: pct(1 - rect.y - rect.h) }}
      />
      <div
        className="absolute left-0 bg-nomi-ink/[0.55] pointer-events-none"
        style={{ top: pct(rect.y), height: pct(rect.h), width: pct(rect.x) }}
      />
      <div
        className="absolute right-0 bg-nomi-ink/[0.55] pointer-events-none"
        style={{ top: pct(rect.y), height: pct(rect.h), width: pct(1 - rect.x - rect.w) }}
      />
      {/* 选区框 */}
      <div
        className="absolute border border-nomi-paper/90 cursor-move"
        style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
        onPointerDown={beginDrag({ kind: 'move' })}
      >
        {/* 框内可拖分割线（竖） */}
        {cols.map((c, index) => (
          <div
            key={`col-${index}`}
            className="absolute top-0 bottom-0 w-4 -ml-2 cursor-ew-resize"
            style={{ left: pct(c) }}
            onPointerDown={beginDrag({ kind: 'col', index })}
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-nomi-paper/90 pointer-events-none" />
            <span className={cn(gripClass, 'left-1/2 top-1/2 pointer-events-none')} />
          </div>
        ))}
        {/* 框内可拖分割线（横） */}
        {rows.map((r, index) => (
          <div
            key={`row-${index}`}
            className="absolute left-0 right-0 h-4 -mt-2 cursor-ns-resize"
            style={{ top: pct(r) }}
            onPointerDown={beginDrag({ kind: 'row', index })}
          >
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-nomi-paper/90 pointer-events-none" />
            <span className={cn(gripClass, 'left-1/2 top-1/2 pointer-events-none')} />
          </div>
        ))}
        {/* 外框四角：抓点内缩 6px（left-1.5/top-1.5 抵消 -m-1.5 的半格外移）——
            默认框现在贴整图，抓点若仍压在角上会被 preview 的 overflow-hidden 裁掉、点不到。 */}
        <span
          className={cn(handleClass, 'left-1.5 top-1.5 cursor-nwse-resize')}
          onPointerDown={beginDrag({ kind: 'corner', corner: 'nw' })}
        />
        <span
          className={cn(handleClass, 'right-1.5 top-1.5 cursor-nesw-resize')}
          onPointerDown={beginDrag({ kind: 'corner', corner: 'ne' })}
        />
        <span
          className={cn(handleClass, 'left-1.5 bottom-1.5 cursor-nesw-resize')}
          onPointerDown={beginDrag({ kind: 'corner', corner: 'sw' })}
        />
        <span
          className={cn(handleClass, 'right-1.5 bottom-1.5 cursor-nwse-resize')}
          onPointerDown={beginDrag({ kind: 'corner', corner: 'se' })}
        />
      </div>
      </div>
    </div>
  )
}
