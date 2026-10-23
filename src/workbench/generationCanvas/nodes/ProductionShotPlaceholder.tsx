// P4 S5 — 制作（Agent 付费卡 / 多镜批次）落到画布的节点上，**只属于制作**的小标：等你确认 / 还没生成 / 排队中 / 已停。
// 每一段都有自己的标记（`data-shot-placeholder-state`）：没点就不叫排队中（付费卡① 第 12 条），在等用户就说在等用户。
//
// 「生成中」与「失败」不在这里画（2026-09-25）：那两段写进节点自己的运行记录（主进程画布落地投影 →
// materialize-shots → 节点 runs[0]），由普通生成那一套 NodeGeneratingOverlay / NodeErrorReport 画——
// 一个节点「在生成 / 生成完」只有一份真相、一套画法。以前这里自己轮询一份 Run 快照另画「整卡模糊 + N 字标」，
// 供应商早出片了它还在转（用户原话：「没有复用逻辑，视频早就生产出来了，他这里一直显示生成中」）。
//
// 排队中 / 已停没有普通生成的对应物，所以留在这里；判定读中立层 `deriveProductionShotState`（与主进程投影
// 同一个函数，两端不会一个说在生成、一个说已停）。节点已有结果或自己在跑（普通生成 / 制作投影的生成中）时不画。
//
// 状态色一律根层 token（#128 后）：已停 = --nomi-warning（非 danger，等你再确认 / 急停是可继续的中止，不是错误）。
//
// 已停时说哪句话、给不给「继续」按钮，只看 Run 在停下那一刻记下的原因（stoppedReason，2026-09-29）：以前一律从
// needs_attention 猜成预算用完，今天没有价格，点进去额度全是 0。2026-10-01 起停下原因里没有「预算」了：
// 上一版记成预算的旧数据读出来是中性的「已停」（unknown）；批过的镜离用户上一次点头太久、没人续，停在
// consent_expired，说「这镜还没开拍，需要你再确认一次」，那颗「继续」就是确认（付费卡① 第 13 条）。
import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { IconClock, IconPlayerPause } from '@tabler/icons-react'

import { cn } from '../../../utils/cn'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { resumeProductionBatch } from '../../production/productionShotActions'
import { productionShotCornerText, stoppedCopyOf, useProductionShotState } from './productionShotCorner'
import type { ProductionShotState } from '../../../../electron/shared/productionShotPhase'

// 「阶段 → 小标说什么 / 已停说哪句话」与读阶段的 hook 住在 productionShotCorner.ts（2026-10-23）；
// 小标的样子是下面这两个组件。聊天里的指向元素和画布节点挂同一份，不各抄一张表、不各画一枚。
// 走查定位用的 data-*（`data-shot-placeholder-state`、`data-production-shot-node`）只由节点这一侧传进去——
// 指向元素不能带它们，否则全局 querySelectorAll 会把聊天里的指向元素也数成画布占位。

/** 渲染层的翻译函数（`useTranslation().t` 能直接传进来）。 */
type Translate = (key: string, options?: Record<string, unknown>) => string

type DataAttributes = { [key: `data-${string}`]: string | undefined }

/** 左上角那枚中性小标（纸白 85% 底、ink-60 字、细阴影）。位置随宿主（节点 8px、指向元素 4px），样子只有这一份。 */
export function NodeCornerPill({ label, icon, className, attributes }: {
  label: string
  icon?: React.ReactNode
  className?: string
  attributes?: DataAttributes
}): JSX.Element {
  return (
    <div
      className={cn('absolute left-2 top-2 z-[4] inline-flex max-w-[calc(100%-16px)] items-center gap-1 rounded-full bg-nomi-paper/85 px-2 py-0.5 text-micro text-nomi-ink-60 shadow-nomi-sm', className)}
      aria-label={label}
      {...attributes}
    >
      {icon}
      <span className="min-w-0 truncate">{label}</span>
    </div>
  )
}

/** 制作小标：阶段有小标才画（排队带钟）。 */
export function ProductionShotCornerLabel({ state, t, className, attributes }: {
  state: ProductionShotState | null
  t: Translate
  className?: string
  attributes?: DataAttributes
}): JSX.Element | null {
  const corner = productionShotCornerText(t, state)
  if (!corner) return null
  return (
    <NodeCornerPill
      label={corner.text}
      icon={corner.queued ? <IconClock size={11} stroke={1.8} aria-hidden="true" className="shrink-0" /> : undefined}
      className={className}
      attributes={attributes}
    />
  )
}

export function ProductionShotPlaceholder({ node, reportFeedback }: { reportFeedback: (message: string) => void; node: GenerationCanvasNode }): JSX.Element | null {
  const { t } = useTranslation()
  const { runId, projectId, state } = useProductionShotState(node)
  const [busy, setBusy] = React.useState(false)
  // 这一下点击续哪几镜的同意、怎么接着拍，由主进程定——渲染层只说「继续」。
  const runResume = React.useCallback(() => {
    if (!projectId || !runId || busy) return
    setBusy(true)
    void resumeProductionBatch(projectId, runId, reportFeedback).finally(() => setBusy(false))
  }, [busy, projectId, runId, reportFeedback])

  if (!runId || !state || node.result?.url) return null
  // 节点自己在跑（制作投影的「生成中」或用户手动的一次）：那一段由 NodeGeneratingOverlay 画，这里不叠第二层。
  if (node.status === 'running' || node.status === 'queued') return null

  if (state.phase !== 'stopped') {
    // 等你确认 / 还没生成 / 已去掉 / 排队中（第 n/N）：左上角中性小标；其余阶段由节点自己的运行记录画。
    return <ProductionShotCornerLabel state={state} t={t} attributes={{ 'data-shot-placeholder-state': state.phase, 'data-production-shot-node': node.id }} />
  }
  // 已停：warning 底（非 danger），一句人话 + 这种停法下真能用的入口（没有就不摆）。
  const copy = stoppedCopyOf(state.stoppedReason)
  return (
    <div
      role="status"
      data-shot-placeholder-state="stopped"
      data-production-shot-node={node.id}
      className={cn(
        'absolute inset-0 z-[4] flex flex-col items-center justify-center gap-2 rounded-nomi p-4 text-center',
        'bg-[color-mix(in_oklch,var(--nomi-warning)_6%,var(--nomi-paper))]',
        'border border-[color-mix(in_oklch,var(--nomi-warning)_28%,transparent)]',
      )}
    >
      <IconPlayerPause size={18} stroke={1.6} className="text-nomi-warning" aria-hidden="true" />
      <span className="text-caption leading-snug text-nomi-ink-80" data-shot-stop-reason={state.stoppedReason}>{t(copy.message)}</span>
      {/* P4 S6：再确认一次 / 急停后接着拍。data-* 用 active 值供走查；busy 期间禁重复点。 */}
      {copy.action ? (
        <button
          type="button"
          disabled={busy || !projectId}
          onClick={runResume}
          onPointerDown={(event) => event.stopPropagation()}
          data-production-shot-action={copy.action.kind}
          className={cn(
            'rounded-nomi-sm border px-2.5 py-1 text-caption',
            busy || !projectId
              ? 'cursor-not-allowed border-nomi-line bg-nomi-paper text-nomi-ink-40'
              : 'border-[color-mix(in_oklch,var(--nomi-warning)_36%,transparent)] bg-nomi-paper text-nomi-ink hover:bg-[color-mix(in_oklch,var(--nomi-warning)_8%,var(--nomi-paper))]',
          )}
        >
          {t(copy.action.label)}
        </button>
      ) : null}
    </div>
  )
}
