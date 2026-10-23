// 指向元素此刻画哪一张脸（纯函数，可裸测）。
//
// 一个东西一个家（设计系统 §1.0）：指向元素不存节点的状态，也不另写一套「状态 → 样子」的判断。
// 它读的是画布节点自己读的那几份事实，判序照 BaseGenerationNode 叠层的先后：
//   ① 节点不在画布上了                       → 已删除（只在指向元素上有）
//   ② 生成反馈在跑（排队 / 生成中）           → 等待面 + 状态条（GenerationWaitingSurface + GenerationStatusBar）
//   ③ 生成反馈是失败                          → 状态条红点 + 原因
//   ④ 有结果画面                              → 结果缩略图（画布轻量档同一个取图函数）
//   ⑤ 制作流程还没开拍这一镜（等你确认 / 还没生成 / 已去掉 / 排队中） → 空卡 + 节点上同一个左上小标（ProductionShotPlaceholder）
//   ⑥ 制作流程停在这一镜                       → 空卡 + 「已停」（详细原因和「继续」在节点上，聊天里不放动作）
//   ⑦ 其余                                    → 空卡（NodeEmptyState 的圆托 + 种类图标）
import type { GenerationFeedback } from '../../observability/generationFeedback'
import { resolveLightweightNodePreview, type LightweightNodePreview } from '../../generationCanvas/components/canvasNodeLevelOfDetail'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import type { ProductionShotPhase } from '../../../../electron/shared/productionShotPhase'

export type NodePointerFace =
  | Readonly<{ kind: 'deleted' }>
  | Readonly<{ kind: 'generating'; feedback: GenerationFeedback }>
  | Readonly<{ kind: 'failed'; feedback: GenerationFeedback }>
  | Readonly<{ kind: 'result'; preview: LightweightNodePreview }>
  | Readonly<{ kind: 'production'; phase: 'awaiting_confirmation' | 'not_generated' | 'removed' | 'queued' }>
  | Readonly<{ kind: 'stopped' }>
  | Readonly<{ kind: 'empty' }>

export type NodePointerFaceKind = NodePointerFace['kind']

const PRODUCTION_LABEL_PHASES = new Set<ProductionShotPhase>(['awaiting_confirmation', 'not_generated', 'removed', 'queued'])

export function nodePointerFace(input: Readonly<{
  node: GenerationCanvasNode | undefined
  feedback: GenerationFeedback | null | undefined
  /** 这一镜在制作流程里的阶段（节点不归制作流程管时缺席）。 */
  productionPhase?: ProductionShotPhase | null
}>): NodePointerFace {
  const { node, feedback, productionPhase } = input
  if (!node) return { kind: 'deleted' }
  if (feedback?.active) return { kind: 'generating', feedback }
  if (feedback?.phase === 'failed') return { kind: 'failed', feedback }
  const preview = resolveLightweightNodePreview(node)
  if (preview) return { kind: 'result', preview }
  if (productionPhase && PRODUCTION_LABEL_PHASES.has(productionPhase)) {
    return { kind: 'production', phase: productionPhase as 'awaiting_confirmation' | 'not_generated' | 'removed' | 'queued' }
  }
  if (productionPhase === 'stopped') return { kind: 'stopped' }
  return { kind: 'empty' }
}

/** 指向元素里节点画面的比例（宽 / 高）。竖版按真比例放进固定高度的槽里，不裁不拉伸。 */
export function nodePointerAspect(size: Readonly<{ width: number; height: number }>): number {
  const ratio = size.width / size.height
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9
}

/**
 * 组指向露几个：超过 `max` 就露 `max` 个、剩下的折成「还有 N 个」；展开了就全露。
 * 只多 1 个时不折（折出来的「还有 1 个」占的地方和那一个本身一样大，折了反而多一步）。
 */
export function nodePointerGroupVisible(total: number, max: number, expanded: boolean): Readonly<{ shown: number; hidden: number }> {
  if (expanded || total <= max + 1) return { shown: total, hidden: 0 }
  return { shown: max, hidden: total - max }
}
