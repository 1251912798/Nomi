import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { IconTable } from '@tabler/icons-react'
import { WorkbenchButton, promptDialog } from '../../../../design'
import type { DeconstructionShotTableDocument } from '../../../../../electron/shared/canvas/shotTable'
import { withProjectAction } from '../../../project/projectCanvasReadSurface'
import { CANVAS_LAYER } from '../../reactFlow/canvasLayerOrder'
import { ComposerAnchor } from '../composerAnchor'
import { DeconstructModelPicker } from './DeconstructModelPicker'
import { useDeconstructLegChoice } from './deconstructLegChoice'
import { cancelDeconstruction, deconstructToShotTable } from './factBridge'
import { canRestartDeconstruction } from './deconstructionLifecycle'
import { editShotTableFacts } from './shotTableActions'

type Props = {
  nodeId: string
  table: DeconstructionShotTableDocument
  visualSize: { width: number; height: number }
  /** 源视频节点还在、有结果：拆解 / 重拆才点得动。 */
  sourceAvailable: boolean
  /** 源视频的 poster 与时长（拍板稿图 1 下方栏首行）；没有就不画，不编。 */
  sourceThumbnail?: string
  sourceSeconds?: number
  /** 镜头表里已有行（「拆解」与「重新拆解」只差这一句）。 */
  hasRows: boolean
  selectedRowIds: readonly string[]
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
/** 源视频时长写成 m:ss（拍板稿「雨夜参考片 · 0:15」）。先取整再拆分，59.6 秒不会写成 0:60。 */
const clockOf = (seconds: number): string => { const total = Math.round(seconds); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}` }

export function ShotTableComposer({ nodeId, table, visualSize, sourceAvailable, sourceThumbnail, sourceSeconds, hasRows, selectedRowIds, onError }: Props): JSX.Element {
  const { t } = useTranslation()
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const running = table.source.status === 'running'
  // 选的模型用不了：不悄悄换、也不让拆（拆了等于花钱去撞一个已知用不了的模型）；「改用云端」只盖过转写腿，读图腿失效照样拦。
  const visionStale = useDeconstructLegChoice('vision', table).stale
  const transcribeStale = useDeconstructLegChoice('transcribe', table).stale
  const blockedReason = visionStale || transcribeStale ? t('shotTable.node.staleBlocked') : undefined
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
          // 勾选只是标出这几镜（2026-10-18 用户：拆完要干嘛交给 Agent，表上不再闷头「生成 N 镜」）；这里只说选了几镜、能取消。
          <div className="flex items-center gap-2">
            <span className="text-body-sm">{t('shotTable.node.selectedCount', { count: selectedRowIds.length })}</span>
            <WorkbenchButton size="sm" variant="default" onClick={clearSelection}>{t('shotTable.node.clearSelection')}</WorkbenchButton>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              {sourceThumbnail
                ? <img data-testid="shot-table-source-thumbnail" src={sourceThumbnail} alt="" className="h-9 w-16 shrink-0 rounded-nomi object-cover" />
                : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-nomi bg-nomi-ink-05 text-nomi-ink-60"><IconTable size={18} stroke={1.5} /></span>}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span data-testid="shot-table-source-line" className="truncate text-body-sm">{sourceSeconds !== undefined && sourceSeconds > 0
                  ? t('shotTable.node.composerTitleWithLength', { title: table.source.title || t('shotTable.title'), length: clockOf(sourceSeconds) })
                  : t('shotTable.node.composerTitle', { title: table.source.title || t('shotTable.title') })}</span>
                <span className="line-clamp-2 text-micro text-nomi-ink-60">{table.source.status === 'ready' ? t('shotTable.node.readyHint') : hasRows ? t('shotTable.node.composerHint') : t('shotTable.node.idleHint')}</span>
              </span>
            </div>
            <div className="h-px bg-nomi-line-soft" />
            <div className="flex flex-wrap items-center gap-2">
              <DeconstructModelPicker leg="vision" nodeId={nodeId} table={table} disabled={running} />
              <DeconstructModelPicker leg="transcribe" nodeId={nodeId} table={table} disabled={running} />
              <WorkbenchButton size="sm" variant="default" disabled={running} onClick={() => { void addColumn() }}>{t('shotTable.node.addCustomColumn')}</WorkbenchButton>
              {/* 主按钮靠右：只有主操作许用撑开的空隙（V4Row 同一条规矩），附属信息不贴行尾。 */}
              <span aria-hidden className="flex-1" />
              <span className="flex items-center gap-2">
                {/* 本地离线转写挂了时的出口：用户点的一下才走云端，代码不许失败时自己切（那样会在不知情时花钱）。 */}
                {table.source.failureKind === 'local-speech' && !running
                  && <WorkbenchButton size="sm" variant="default" data-testid="shot-table-retry-cloud" disabled={!sourceAvailable || visionStale} title={visionStale ? blockedReason : undefined} onClick={() => run('cloud')}>{t('shotTable.retryWithCloud')}</WorkbenchButton>}
                {running
                  ? <WorkbenchButton size="sm" variant="default" data-testid="shot-table-cancel-deconstruction" onClick={() => { cancelDeconstruction(nodeId) }}>{t('shotTable.cancel')}</WorkbenchButton>
                  : canRestartDeconstruction(table.source.status)
                    && <WorkbenchButton size="sm" variant="primary" data-testid="shot-table-restart-deconstruction" disabled={!sourceAvailable || Boolean(blockedReason)} title={!sourceAvailable ? t('shotTable.sourceVideoMissing') : blockedReason} onClick={() => run()}>{hasRows ? t('shotTable.retry') : t('shotTable.node.deconstruct')}</WorkbenchButton>}
              </span>
            </div>
            {blockedReason && !running && <p role="status" data-testid="shot-table-model-stale" className="m-0 text-micro text-nomi-danger">{blockedReason}</p>}
          </>
        )}
      </div>
    </ComposerAnchor>
  )
}
