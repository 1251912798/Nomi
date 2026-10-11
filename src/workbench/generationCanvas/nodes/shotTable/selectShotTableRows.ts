import type { ShotTableDocument } from '../../../../../electron/shared/canvas/shotTable'
import { quantizeShotSeconds } from '../../../../../electron/shared/canvas/shotTime'

export type ShotTableRowView = {
  id: string
  index: number
  /** 没有时长（静帧）就是 undefined，**不是 0**——「没有」和「零秒」是两件事，挤进一个表示读者就分不开。 */
  duration?: number
  start?: number
  end?: number
  prompt: string
  thumbnail?: string
  cells?: Record<string, string>
  visionFailed?: boolean
  /** 没读出来的原因（供应商原话），格子 tooltip 与状态列显示。 */
  failureReason?: string
}

/** 拆解事实表的行视图（只读）。分镜表 / Agent 分镜表已退役，镜头的行在生成页「列表」里。 */
export function selectShotTableRows(table: ShotTableDocument): ShotTableRowView[] {
  return table.rows.map(row => ({
    id: row.rowId, index: row.order, duration: row.durationSeconds, start: row.startSeconds, end: row.endSeconds,
    prompt: row.cells.visual ?? '', thumbnail: row.keyframeRef,
    cells: row.cells, visionFailed: row.visionFailed, failureReason: row.failureReason,
  }))
}

/**
 * 表头那个「总时长」。**唯一出口**：每行时长已经落在 0.1 秒格子上，但**几个格子点上的数相加**会重新长出浮点尾数
 * （0.7 + 1.2 = 1.9000000000000001），表头就显示成「1.9000000000000001s」（2026-10-11 真付费走查）。
 * 派生量在产出的这一刻按精度 owner（shotTime）量化，显示层不写 round，也不自己 reduce。
 * 没有任何行带时长（静帧）→ undefined，不是 0。
 */
export function shotTableTotalSeconds(rows: readonly Pick<ShotTableRowView, 'duration'>[]): number | undefined {
  if (!rows.some(row => row.duration != null)) return undefined
  return quantizeShotSeconds(rows.reduce((sum, row) => sum + (row.duration ?? 0), 0))
}
