// 制作落到画布的一镜「此刻在哪一段」的读法 + 左上角那枚中性小标（2026-10-23 从 ProductionShotPlaceholder 抽出）。
//
// 为什么抽：聊天里的指向元素（`src/workbench/ai/pointer/`）要和节点长同一张脸（NodePointer 板 D3）。
// 「阶段 → 小标说什么」「已停 → 说哪句话」只许有一份，节点和指向元素挂同一个函数 / 组件，不各抄一张表。
// 小标的样子（NodeCornerPill）也只有一枚：节点上的「等你确认 / 排队中」、指向元素上的「已删除 / 已定位」都是它。
// 走查定位用的 data-*（`data-shot-placeholder-state`、`data-production-shot-node`）只由节点那一侧传进来——
// 指向元素不能带它们，否则全局 querySelectorAll 会把聊天里的指向元素也数成画布占位。
import React, { type JSX } from 'react'
import { IconClock } from '@tabler/icons-react'
import { cn } from '../../../utils/cn'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { useProductionCanvasLandingStore } from '../../production/productionCanvasLandingStore'
import { deriveProductionShotState, productionShotIdForNode, type ProductionShotState } from '../../../../electron/shared/productionShotPhase'
import { productionRunIdOf } from '../../production/productionShotOwnership'
import type { TranslationKey } from '../../../i18n/translationKey'

/** 渲染层的翻译函数（`useTranslation().t` 能直接传进来；与 storyboardLabels 同一个形状）。 */
type Translate = (key: string, options?: Record<string, unknown>) => string

export type ProductionShotRead = Readonly<{ runId: string | null; projectId: string | null; state: ProductionShotState | null }>

/** 这一镜此刻在制作里的阶段。只在这个 Run 是 store 缓存里的那一份时派生（避免读到别的项目 / Run 的态）。 */
export function useProductionShotState(node: GenerationCanvasNode | undefined): ProductionShotRead {
  const runId = node ? productionRunIdOf(node) : null
  const state = useProductionCanvasLandingStore((store) => {
    const run = runId ? store.runs[runId] : undefined
    return run && node ? deriveProductionShotState(run, productionShotIdForNode(run, node.id)) : null
  })
  const projectId = useProductionCanvasLandingStore((store) => (runId && store.runs[runId] ? store.projectId : null))
  return { runId, projectId, state }
}

export type StoppedCopy = {
  message: TranslationKey
  /** 这一种停法下「继续」有没有用：没用就不摆按钮（选中节点单独生成 / 去任务面板，文案里说清）。 */
  action: { label: TranslationKey; kind: 'resume-consent' | 'resume-manual' } | null
}

/** 停下的原因 → 这一镜上说的话与能做的事。穷尽：新长一个原因而这里没表态，编译就过不去。 */
export function stoppedCopyOf(reason: Extract<ProductionShotState, { phase: 'stopped' }>['stoppedReason']): StoppedCopy {
  switch (reason) {
    case 'consent_expired':
      return { message: 'generationCommon.production.canvasLanding.stoppedConsentExpired', action: { label: 'generationCommon.production.canvasLanding.resume', kind: 'resume-consent' } }
    case 'landing_failed':
      return { message: 'generationCommon.production.canvasLanding.stoppedLandingFailed', action: { label: 'generationCommon.production.canvasLanding.resume', kind: 'resume-manual' } }
    case 'user_paused':
      return { message: 'generationCommon.production.canvasLanding.stoppedManual', action: { label: 'generationCommon.production.canvasLanding.continueRemaining', kind: 'resume-manual' } }
    case 'failed':
      return { message: 'generationCommon.production.canvasLanding.stoppedAfterFailure', action: null }
    case 'restart_recovery':
      return { message: 'generationCommon.production.canvasLanding.stoppedForRecovery', action: null }
    case 'user_cancelled':
      return { message: 'generationCommon.production.canvasLanding.stoppedCancelled', action: null }
    case 'unknown':
      return { message: 'generationCommon.production.canvasLanding.stoppedUnknown', action: { label: 'generationCommon.production.canvasLanding.resume', kind: 'resume-manual' } }
    default:
      return ((value: never) => value)(reason)
  }
}

/**
 * 小标说什么：等你确认 / 还没生成 / 已去掉，不生成 / 排队中（第 n/N）。其余阶段没有小标（null）。
 * 在等用户 / 从没被批过 / 用户去掉了：中性小标，不转圈、不说排队（它们不在任何队列里）。
 */
export function productionShotCornerText(t: Translate, state: ProductionShotState | null): Readonly<{ text: string; queued: boolean }> | null {
  if (!state) return null
  if (state.phase === 'awaiting_confirmation') return { text: t('generationCommon.production.canvasLanding.awaitingConfirmation'), queued: false }
  if (state.phase === 'removed') return { text: t('generationCommon.production.canvasLanding.removedNotGenerated'), queued: false }
  if (state.phase === 'not_generated') return { text: t('generationCommon.production.canvasLanding.notGenerated'), queued: false }
  if (state.phase === 'queued') {
    return {
      text: state.queueIndex && state.queueTotal
        ? t('generationCommon.production.canvasLanding.queuedNth', { index: state.queueIndex, total: state.queueTotal })
        : t('generationCommon.production.canvasLanding.queued'),
      queued: true,
    }
  }
  return null
}

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
