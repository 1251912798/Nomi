import React, { type JSX } from 'react'
import { useStore } from '@xyflow/react'
import { selectFlowZoom, shotTableDensityForZoom } from '../../reactFlow/canvasViewportScale'
import { useGenerationFlowNodeManagedDrag } from '../../reactFlow/generationFlowNodeContext'
import { useTranslation } from 'react-i18next'
import { IconTable } from '@tabler/icons-react'
import { WorkbenchMenu, promptDialog } from '../../../../design'
import { cn } from '../../../../utils/cn'
import { useGenerationCanvasStore } from '../../store/generationCanvasStore'
import type { GenerationCanvasNode } from '../../model/generationCanvasTypes'
import { readShotTable, type ShotTableColumn } from '../../../../../electron/shared/canvas/shotTable'
import { selectShotTableRows, shotTableTotalSeconds } from './selectShotTableRows'
import { editShotTableFacts } from './shotTableActions'
import { retryShot } from './factBridge'
import { deconstructionNoticeKey } from './deconstructionLifecycle'
import { withProjectAction } from '../../../project/projectCanvasReadSurface'
import { ShotTableGrid } from './ShotTableGrid'
import { ShotTableToolbar } from './ShotTableToolbar'
import { SHOT_TABLE_ROW_METRICS } from './shotTableRowMetrics'
import { ShotTableComposer } from './ShotTableComposer'
import { ShotTableFarCard } from './ShotTableFarCard'
import { resolveNodeVisualSize } from '../nodeSizing'
import { knownDurationOf } from '../extractVideoFrameToNode'

type NodeProps = { node: unknown; selected: boolean; readOnly?: boolean }
export default function ShotTableNode(props: NodeProps): JSX.Element {
  const managed = useGenerationFlowNodeManagedDrag()
  return managed ? <FlowShotTable {...props} /> : <ShotTableContent {...props} />
}
function FlowShotTable(props: NodeProps): JSX.Element {
  const density = useStore(state => shotTableDensityForZoom(selectFlowZoom(state)))
  return <ShotTableContent {...props} flowDensity={density} />
}
function ShotTableContent({ node: rawNode, selected, readOnly = false, flowDensity }: NodeProps & { flowDensity?: 'full' | 'compact' | 'card' }): JSX.Element {
  const node = rawNode as GenerationCanvasNode
  const isMultiSelectActive = useGenerationCanvasStore(state => selected && state.selectedNodeIds.length > 1)
  const { t } = useTranslation()
  const table = React.useMemo(() => readShotTable(node.meta), [node.meta])
  const nodes = useGenerationCanvasStore(state => state.nodes)
  // 画布外的宿主（设计实验室样张）没有视口，也就没有缩放——按 1 档算。
  // 画布内的档位由 FlowShotTable 从 React Flow 的 transform 订阅（唯一真相）。
  const zoomDensity = shotTableDensityForZoom(1)
  const rows = React.useMemo(() => table ? selectShotTableRows(table) : [], [table])
  const source = table?.source
  const totalSeconds = React.useMemo(() => shotTableTotalSeconds(rows), [rows])
  const visionFailureSummary = React.useMemo(() => {
    const failed = rows.filter(row => row.visionFailed && row.failureReason)
    return failed.length ? { count: failed.length, reason: failed[0].failureReason ?? '' } : undefined
  }, [rows])
  const density = table?.view.density === 'auto' ? flowDensity ?? zoomDensity : table?.view.density ?? zoomDensity
  const [columnMenu, setColumnMenu] = React.useState<{ column: ShotTableColumn; point: { x: number; y: number } } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const facts = table
  // 中断 / 取消那句话按**当前语言**现取（它是界面文案，不是落盘的供应商原话）。
  const noticeKey = facts ? deconstructionNoticeKey(facts.source.status) : undefined
  const sourceNode = source === undefined ? undefined : nodes.find(candidate => candidate.id === source.sourceNodeId)
  const sourceAvailable = Boolean(sourceNode?.result?.url)
  const selectedIds = (table?.view.selectedRowIds ?? []).filter(id => rows.some(row => row.id === id))
  const selectRow = (id: string) => {
    const latest = useGenerationCanvasStore.getState().nodes.find(candidate => candidate.id === node.id)
    const current = readShotTable(latest?.meta)
    if (!current || readOnly) return
    const ids = current.view.selectedRowIds
    useGenerationCanvasStore.getState().updateNode(node.id, { meta: { ...latest?.meta, shotTable: { ...current, view: { ...current.view, selectedRowIds: ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id] }, revision: current.revision + 1, updatedAt: new Date().toISOString() } } })
  }
  const editCell = async (rowId: string, columnId: string, initialValue: string) => {
    const value = await promptDialog({ title: t('shotTable.editCell'), initialValue })
    if (value === null) return
    editShotTableFacts(node.id, current => ({ ...current, rows: current.rows.map(row => row.rowId === rowId ? { ...row, cells: { ...row.cells, [columnId]: value } } : row) }))
  }
  // 选中才出上方浮条与下方拆解栏（同其它节点）；它们是卡片的兄弟——卡片 overflow-hidden，放进去会被裁掉。
  const engaged = Boolean(facts) && selected && !isMultiSelectActive && !readOnly
  return <><article data-node-id={node.id} data-kind="shot_table" data-testid="shot-table-node" data-density={density}
    className={cn('generation-canvas-v2-node flex h-full w-full flex-col overflow-hidden rounded-nomi border bg-nomi-paper text-nomi-ink shadow-nomi-md', 'border-nomi-line')}>
    {/* 远档卡片自己写标题 · 镜数（拍板稿图 4），头条不再重复一遍。 */}
    {density !== 'card' && <header className="flex h-10 shrink-0 cursor-grab items-center gap-2 border-b border-nomi-line-soft px-3">
      <IconTable size={16} stroke={1.5} className="shrink-0 text-nomi-ink-60" />
      <span className="min-w-0 truncate text-body-sm font-medium">{node.title ?? t('shotTable.title')}</span>
      <span className="shrink-0 text-micro text-nomi-ink-40">{t('shotTable.count', { count: rows.length })}</span>
      {totalSeconds !== undefined && <span className="shrink-0 font-mono text-micro text-nomi-ink-40">{t('shotTable.duration', { duration: totalSeconds })}</span>}
    </header>}
    {/* 拆解失败/半成的原因**只在顶上说一次**（B10：不要每格一句「没读出」）。
        rows 为空时下面的空状态也会显示它，这里保证「表里已有行」时同样看得到。 */}
    {density !== 'card' && facts?.source.errorMessage && rows.length > 0 && !noticeKey
      && <div role="alert" data-testid="shot-table-failure-reason" className="shrink-0 border-b border-nomi-line-soft px-3 py-1 text-micro text-nomi-danger">{facts.source.errorMessage}</div>}
    {/* 读图没成的镜：原话在顶上说一次（哪怕只有几镜），不让用户对着空格子猜（2026-10-11 走查 §1）。 */}
    {density !== 'card' && !noticeKey && visionFailureSummary
      && <div role="status" data-testid="shot-table-vision-failure-summary" title={visionFailureSummary.reason} className="shrink-0 truncate border-b border-nomi-line-soft px-3 py-1 text-micro text-nomi-danger">{t('shotTable.visionFailedSummary', visionFailureSummary)}</div>}
    {/* 中断 / 取消**不是失败**：没有供应商原话可抄，也不该红着报警——但必须有一句话，
        否则一张空表和「还没拆过」长得一模一样（2026-09-17 走查 §6.5 的那一屏）。 */}
    {density !== 'card' && noticeKey
      && <div data-testid="shot-table-interrupted-notice" className="shrink-0 border-b border-nomi-line-soft px-3 py-1 text-micro text-nomi-ink-60">{t(noticeKey)}</div>}
    {/* 阶段内部那句更细的进度（本地转写的下载 / 分段）。**就地告知**，和失败那行分开两个颜色——
        本地第一次用要先下 575MB、之后按段跑几分钟，没有这行的几分钟等待和「卡死了」长得一样。 */}
    {density !== 'card' && facts?.source.status === 'running' && facts.source.progressDetail && rows.length > 0
      && <div data-testid="shot-table-progress-detail" className="shrink-0 border-b border-nomi-line-soft px-3 py-1 text-micro text-nomi-ink-60">{facts.source.progressDetail}</div>}
    {density === 'card' ? <ShotTableFarCard title={node.title ?? t('shotTable.title')} rows={rows} totalSeconds={totalSeconds} /> : rows.length ? <ShotTableGrid rows={rows} compact={density === 'compact'} rowMetrics={SHOT_TABLE_ROW_METRICS[facts?.view.rowHeight ?? 'standard']} selectedIds={selectedIds} onSelect={readOnly ? undefined : selectRow} onRetry={readOnly || busy || !sourceAvailable ? undefined : rowId => { withProjectAction(project => { setBusy(true); void retryShot(node.id, rowId, project).catch(cause => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setBusy(false)) }) }} factColumns={facts?.columns ?? []} onColumnMenu={readOnly ? undefined : (column, point) => { if (column.kind === 'custom') setColumnMenu({ column, point }) }} onEditCell={readOnly ? undefined : (rowId, columnId, value) => { void editCell(rowId, columnId, value) }} /> : <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-body-sm text-nomi-ink-60">{facts?.source.status === 'running' ? (facts.source.progressDetail || t(facts.source.phase === 0 ? 'generationCommon.node.deconstruct.phaseCuts' : facts.source.phase === 1 ? 'generationCommon.node.deconstruct.phaseVision' : facts.source.phase === 2 ? 'generationCommon.node.deconstruct.phaseDialogue' : 'shotTable.running')) : facts?.source.errorMessage || t(!facts ? 'shotTable.sourceMissing' : facts.source.status === 'idle' ? 'shotTable.node.idleHint' : 'shotTable.factsEmpty')}</div>}
    {columnMenu && <WorkbenchMenu open point={columnMenu.point} onOpenChange={open => { if (!open) setColumnMenu(null) }} items={[
      { id: 'rename-column', label: t('shotTable.renameColumn'), onSelect: () => { const column = columnMenu.column; void promptDialog({ title: t('shotTable.renameColumn'), initialValue: column.labelKey }).then(name => { if (name?.trim()) editShotTableFacts(node.id, current => ({ ...current, columns: current.columns.map(item => item.columnId === column.columnId ? { ...item, labelKey: name.trim() } : item) })) }) } },
      { id: 'remove-column', label: t('shotTable.removeColumn'), danger: true, onSelect: () => { const id = columnMenu.column.columnId; editShotTableFacts(node.id, current => ({ ...current, columns: current.columns.filter(item => item.columnId !== id), rows: current.rows.map(row => ({ ...row, cells: Object.fromEntries(Object.entries(row.cells).filter(([key]) => key !== id)) })) })) } },
    ]} />}
    {error && <div role="alert" className="px-3 text-micro text-nomi-danger">{error}</div>}
  </article>
    {engaged && facts && <ShotTableToolbar nodeId={node.id} table={facts} />}
    {engaged && facts && <ShotTableComposer nodeId={node.id} table={facts} visualSize={resolveNodeVisualSize(node)} sourceAvailable={sourceAvailable}
      sourceThumbnail={sourceNode?.result?.thumbnailUrl} sourceSeconds={(sourceNode && knownDurationOf(sourceNode)) ?? source?.durationSeconds}
      hasRows={rows.length > 0} selectedRowIds={selectedIds} onError={setError} />}
  </>
}
