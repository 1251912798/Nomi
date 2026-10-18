import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { IconTable } from '@tabler/icons-react'
import { WorkbenchButton, promptDialog } from '../../../../design'
import type { DeconstructionShotTableDocument } from '../../../../../electron/shared/canvas/shotTable'
import { withProjectAction } from '../../../project/projectCanvasReadSurface'
import { CANVAS_LAYER } from '../../reactFlow/canvasLayerOrder'
import { ComposerAnchor } from '../composerAnchor'
import { DeconstructModelPicker } from './DeconstructModelPicker'
import { cancelDeconstruction, deconstructToShotTable } from './factBridge'
import { canRestartDeconstruction } from './deconstructionLifecycle'
import { editShotTableFacts } from './shotTableActions'

type Props = {
  nodeId: string
  table: DeconstructionShotTableDocument
  visualSize: { width: number; height: number }
  /** 源视频节点还在、有结果：拆解 / 重拆才点得动。 */
  sourceAvailable: boolean
  /** 镜头表里已有行（「拆解」与「重新拆解」只差这一句）。 */
  hasRows: boolean
  selectedRowIds: readonly string[]
  busy: boolean
  onGenerate: () => void
  onError: (message: string) => void
}

/**
 * 拆解表的下方拆解栏（2026-10-18 拆解前选模型 图 1 / 图 2）：钉在节点正下方、居中，定位锚与生成框同一个（`ComposerAnchor`）。
 *
 * 取代节点内那条挤成一排的底栏——原来的七件事每件都有去处（docs/plan/2026-10-18-shot-table-node.md「旧功能普查」）：
 * 没勾镜头 = 拆这条视频（读图 / 转写 / 自定义列 / 主按钮按状态在 拆解 · 重新拆解 · 取消拆解 之间换，本机转写挂了另给「改用云端」）；
 * 勾了镜头 = 用选中的镜头出分镜图（现有 generate 行为不变，只换入口位置）。
 * 主按钮能不能点的判据仍归终态 owner（`canRestartDeconstruction`），这里不再列一遍状态词。
 */
export function ShotTableComposer({ nodeId, table, visualSize, sourceAvailable, hasRows, selectedRowIds, busy, onGenerate, onError }: Props): JSX.Element {
  const { t } = useTranslation()
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const running = table.source.status === 'running'
  const run = (transcribe?: 'cloud') => {
    withProjectAction((project) => {
      void deconstructToShotTable(table.source.sourceNodeId, project, transcribe).catch((cause: unknown) => onError(cause instanceof Error ? cause.message : String(cause)))
    })
  }
  const addColumn = async () => {
    const name = await promptDialog({ title: t('shotTable.addColumn') })
    if (!name?.trim()) return
    editShotTableFacts(nodeId, (current) => ({ ...current, columns: [...current.columns, { columnId: crypto.randomUUID(), kind: 'custom', labelKey: name.trim(), hint: name.trim(), order: Math.max(-1, ...current.columns.map((column) => column.order)) + 1, visible: true }] }))
  }
  const clearSelection = () => {
    editShotTableFacts(nodeId, (current) => ({ ...current, view: { ...current.view, selectedRowIds: [] } }))
  }
  return (
    <ComposerAnchor
      inFlow={false}
      anchorRef={anchorRef}
      visualSize={visualSize}
      data-composer-host="canvas"
      data-shot-table-composer={selectedRowIds.length ? 'selection' : 'deconstruct'}
      aria-label={t('shotTable.node.composer')}
      className="nodrag nokey generation-canvas-react-flow__no-pan absolute group-data-[dragging=true]/canvas:invisible"
      style={{ cursor: 'default', zIndex: CANVAS_LAYER.nodeComposer }}
    >
      <div className="flex flex-col gap-2.5 rounded-nomi-lg border border-nomi-line bg-nomi-paper p-3 text-nomi-ink shadow-nomi-md">
        {selectedRowIds.length ? (
          <div className="flex items-center gap-2">
            <span className="text-body-sm">{t('shotTable.node.selectionTitle', { count: selectedRowIds.length })}</span>
            <WorkbenchButton size="sm" variant="default" className="ml-auto" onClick={clearSelection}>{t('shotTable.node.clearSelection')}</WorkbenchButton>
            <WorkbenchButton size="sm" variant="primary" loading={busy} onClick={onGenerate}>{t('shotTable.generate', { count: selectedRowIds.length })}</WorkbenchButton>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-nomi bg-nomi-ink-05 text-nomi-ink-60"><IconTable size={18} stroke={1.5} /></span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-body-sm">{t('shotTable.node.composerTitle', { title: table.source.title || t('shotTable.title') })}</span>
                <span className="line-clamp-2 text-micro text-nomi-ink-60">{table.source.status === 'ready' ? t('shotTable.node.readyHint') : hasRows ? t('shotTable.node.composerHint') : t('shotTable.node.idleHint')}</span>
              </span>
            </div>
            <div className="h-px bg-nomi-line-soft" />
            <div className="flex flex-wrap items-center gap-2">
              <DeconstructModelPicker leg="vision" nodeId={nodeId} table={table} disabled={running} />
              <DeconstructModelPicker leg="transcribe" nodeId={nodeId} table={table} disabled={running} />
              <WorkbenchButton size="sm" variant="default" disabled={running} onClick={() => { void addColumn() }}>{t('shotTable.node.addCustomColumn')}</WorkbenchButton>
              <span className="ml-auto flex items-center gap-2">
                {/* 本地离线转写挂了时的出口：用户点的一下才走云端，代码不许失败时自己切（那样会在不知情时花钱）。 */}
                {table.source.failureKind === 'local-speech' && !running
                  && <WorkbenchButton size="sm" variant="default" data-testid="shot-table-retry-cloud" disabled={!sourceAvailable} onClick={() => run('cloud')}>{t('shotTable.retryWithCloud')}</WorkbenchButton>}
                {running
                  ? <WorkbenchButton size="sm" variant="default" data-testid="shot-table-cancel-deconstruction" onClick={() => { cancelDeconstruction(nodeId) }}>{t('shotTable.cancel')}</WorkbenchButton>
                  : canRestartDeconstruction(table.source.status)
                    && <WorkbenchButton size="sm" variant="primary" data-testid="shot-table-restart-deconstruction" disabled={!sourceAvailable} title={!sourceAvailable ? t('shotTable.sourceVideoMissing') : undefined} onClick={() => run()}>{hasRows ? t('shotTable.retry') : t('shotTable.node.deconstruct')}</WorkbenchButton>}
              </span>
            </div>
          </>
        )}
      </div>
    </ComposerAnchor>
  )
}
