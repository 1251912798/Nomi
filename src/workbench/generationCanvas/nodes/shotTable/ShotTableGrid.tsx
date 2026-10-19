import type { JSX } from 'react'
import type { ShotTableColumn } from '../../../../../electron/shared/canvas/shotTable'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../../utils/cn'
import { WorkbenchButton } from '../../../../design'
import type { ShotTableRowView } from './selectShotTableRows'
import { NODE_SCROLL_REGION_CLASS_NAME } from '../nodeScrollRegionClassName'

const COMPACT_FACT_COLUMNS = new Set(['shotSize', 'visual'])
const SELECT_COLUMN_WIDTH = 28
const INDEX_COLUMN_WIDTH = 40

type Props = {
  rows: readonly ShotTableRowView[]
  compact: boolean
  /** 行高与关键帧尺寸（节点浮条的三档，见 shotTableRowMetrics.ts）。 */
  rowMetrics: { row: number; thumbWidth: number; thumbHeight: number }
  selectedIds: readonly string[]
  factColumns: readonly ShotTableColumn[]
  onSelect?: (id: string) => void
  onEditCell?: (rowId: string, columnId: string, value: string) => void
  onColumnMenu?: (column: ShotTableColumn, point: { x: number; y: number }) => void
  onRetry?: (rowId: string) => void
}
export function ShotTableGrid({ rows, compact, rowMetrics, selectedIds, onSelect, factColumns, onEditCell, onColumnMenu, onRetry }: Props): JSX.Element {
  const { t } = useTranslation()
  // 中档（compact）只留 镜 · 关键帧 · 景别 · 画面（2026-10-18 拆解前选模型 图 4）；用户藏掉的列在哪一档都不出。
  const visibleFacts = factColumns.filter(column => column.visible).slice().sort((a, b) => a.order - b.order)
  const facts = compact ? visibleFacts.filter(column => COMPACT_FACT_COLUMNS.has(column.columnId)) : visibleFacts
  const { row: rowHeightPx, thumbWidth, thumbHeight } = rowMetrics
  const leading = compact ? ['index', 'thumbnail'] as const : ['index', 'thumbnail', 'duration'] as const
  // 镜号与关键帧固定在左（拍板稿「尺寸与缩放」：表宽大于节点时横向滚动，这两列不动）；固定格要自己的底色，否则滚过去的字会透出来。
  const stickyLeft = { index: SELECT_COLUMN_WIDTH, thumbnail: SELECT_COLUMN_WIDTH + INDEX_COLUMN_WIDTH } as const
  const pinnedBg = (id: string) => selectedIds.includes(id) ? 'bg-nomi-accent-soft' : 'bg-nomi-paper'
  return <div className={cn(NODE_SCROLL_REGION_CLASS_NAME, 'min-h-0 flex-1 overflow-auto')} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <table style={{ minWidth: compact ? undefined : 1100 }} className="w-full table-fixed border-collapse text-left text-body-sm text-nomi-ink">
      <colgroup>
        <col style={{ width: SELECT_COLUMN_WIDTH }} />{leading.map(column => <col key={column} style={{ width: column === 'index' ? INDEX_COLUMN_WIDTH : column === 'duration' ? 92 : thumbWidth + 16 }} />)}
        {facts.map(column => <col key={column.columnId} style={{ width: column.columnId === 'visual' ? 220 : 112 }} />)}
        <col style={{ width: 112 }} />
      </colgroup>
      <thead className="sticky top-0 z-10 bg-nomi-bg text-micro text-nomi-ink-60"><tr>
        <th aria-label={t('common.select')} className="sticky z-20 bg-nomi-bg" style={{ left: 0 }} />{leading.map(column => <th key={column} className={cn('px-2 py-2 font-medium', column !== 'duration' && 'sticky z-20 bg-nomi-bg')} style={column === 'duration' ? undefined : { left: stickyLeft[column] }}>{t(`shotTable.columns.${column}`)}</th>)}
        {facts.map(column => <th key={column.columnId} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); onColumnMenu?.(column, { x: event.clientX, y: event.clientY }) }} className="px-2 py-2 font-medium">{column.kind === 'custom' ? column.labelKey : t(`shotTable.facts.${column.columnId}`)}</th>)}
        <th className="px-2 py-2 font-medium">{t('shotTable.columns.status')}</th>
      </tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} data-shot-table-row={row.id} style={{ height: rowHeightPx }}
        className={cn('border-t border-nomi-line-soft hover:bg-nomi-ink-05', selectedIds.includes(row.id) && 'bg-nomi-accent-soft')}
        >
        <td className={cn('sticky z-0 px-2', pinnedBg(row.id))} style={{ left: 0 }}><input type="checkbox" checked={selectedIds.includes(row.id)} disabled={!onSelect} aria-label={t('shotTable.select', { index: row.index })} onChange={() => onSelect?.(row.id)} onDoubleClick={event => event.stopPropagation()} className="accent-nomi-accent" /></td>
        <td className={cn('sticky z-0 px-2 font-mono text-micro text-nomi-ink-60', pinnedBg(row.id))} style={{ left: stickyLeft.index }}>{String(row.index).padStart(2, '0')}</td>
        <td className={cn('sticky z-0 px-2', pinnedBg(row.id))} style={{ left: stickyLeft.thumbnail }}>{row.thumbnail ? <img src={row.thumbnail} alt="" style={{ width: thumbWidth, height: thumbHeight }} className="rounded-nomi-sm object-cover" /> : <div style={{ width: thumbWidth, height: thumbHeight }} className="rounded-nomi-sm bg-nomi-ink-05" />}</td>
        {!compact && <td className="px-2 font-mono text-micro">{row.start != null && row.end != null ? t('shotTable.timeRange', { start: row.start, end: row.end }) : row.duration != null ? t('shotTable.duration', { duration: row.duration }) : '—'}</td>}
          {facts.map(column => <td key={column.columnId} className="px-2" onDoubleClick={event => { event.stopPropagation(); onEditCell?.(row.id, column.columnId, row.cells?.[column.columnId] ?? '') }}><span className="block truncate" title={row.visionFailed && !row.cells?.[column.columnId] ? row.failureReason ?? undefined : row.cells?.[column.columnId]}>{row.visionFailed && !row.cells?.[column.columnId] ? t('shotTable.unread') : row.cells?.[column.columnId] || '—'}</span></td>)}
        <td className="px-2 text-micro"><span className={cn('inline-flex items-center gap-1.5', row.visionFailed ? 'text-nomi-danger' : 'text-nomi-ink-60')}><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />{row.visionFailed ? t('shotTable.unread') : '—'}</span>
          {row.visionFailed && row.failureReason && <span data-testid="shot-table-row-failure-reason" title={row.failureReason} className="block truncate text-nomi-ink-60">{row.failureReason}</span>}
          {row.visionFailed && onRetry && <WorkbenchButton size="sm" variant="default" onClick={() => onRetry(row.id)}>{t('shotTable.retry')}</WorkbenchButton>}
        </td>
      </tr>)}</tbody>
    </table>
  </div>
}
