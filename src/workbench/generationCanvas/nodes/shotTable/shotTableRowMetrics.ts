/** 行高三档：行高与关键帧（16:9）尺寸（紧凑 44 · 标准 58 · 大图 92，见 docs/plan/2026-10-18-shot-table-node.md 图 4）。 */
export type ShotTableRowHeight = 'compact' | 'standard' | 'large'

export const SHOT_TABLE_ROW_METRICS: Record<ShotTableRowHeight, { row: number; thumbWidth: number; thumbHeight: number }> = {
  compact: { row: 44, thumbWidth: 52, thumbHeight: 30 },
  standard: { row: 58, thumbWidth: 68, thumbHeight: 38 },
  large: { row: 92, thumbWidth: 140, thumbHeight: 78 },
}
