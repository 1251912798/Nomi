// 制作落到画布的一镜「此刻在哪一段」的读法，和「这一段左上角说什么 / 停下说哪句话」（2026-10-23 从 ProductionShotPlaceholder 抽出）。
//
// 为什么抽：聊天里的指向元素（`src/workbench/ai/pointer/`）要和节点长同一张脸（NodePointer 板 D3）。
// 「阶段 → 小标说什么」「已停 → 说哪句话」只许有一份，节点和指向元素读同一个函数，不各抄一张表。
// 小标的样子（NodeCornerPill / ProductionShotCornerLabel）在 ProductionShotPlaceholder.tsx，两边挂同一个组件。
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

/** 这一段有没有左上小标（判据就是上面那一个函数，不另列一张阶段表）。 */
export function hasProductionShotCorner(state: ProductionShotState | null): boolean {
  return productionShotCornerText((key) => key, state) !== null
}
