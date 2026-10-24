/**
 * [INPUT]: 依赖 ../../../agent/generationCanvasTools（generationCanvasTools / readGenerationCanvasSnapshot）、../../../agent/trajectoryLayout 的 layoutPlannedNodes、
 *          ../../../agent/referenceEdgeCapability 的 validateReferenceEdge（写边总闸同一条规则）、../../../store/generationCanvasStore（连边 + 连后再读）、
 *          ../../../model/generationNodeKinds 的 getDefaultCategoryForNodeKind、../../../../../i18n、./stagingBuilder 的 buildStagingSceneAudited、
 *          ../migration/migrateScene3d 的 migrateScene3DState、../model/directorNodeMeta 的 meta 键
 * [OUTPUT]: 对外提供 StagingAutoCapture、readStagingAutoCapture、createStagingReferenceNode、StagingAttachPlan、stagingAttachForTarget、stagingAttachReceipt、
 *           StagingAttachOutcome、attachStagingReference
 * [POS]: director/agent 的「站位参考」单一真相：create_staging_reference 工具执行器调 createStagingReferenceNode——词表 spec → V1 形状场景（含运行时自检）
 *        → 迁成导演台工程 → 建 director 节点并打 stagingAutoCapture 标志；**不渲染**，常驻 StagingCaptureHost 扫到标志才离屏出图。
 *        站位图接不接得上目标镜头只在这里判、只在这里连（2026-10-24 走查）：工具受理时 stagingAttachForTarget 预判、回执照实说（stagingAttachReceipt）；
 *        Host 出图后 attachStagingReference 真连、连完再读画布报结果。接不上 = 图留在画布上、不留假边，由 Host 提示。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import i18n from '../../../../../i18n'
import { generationCanvasTools, readGenerationCanvasSnapshot } from '../../../agent/generationCanvasTools'
import { validateReferenceEdge, type EdgeSkipReason } from '../../../agent/referenceEdgeCapability'
import { layoutPlannedNodes } from '../../../agent/trajectoryLayout'
import { getDefaultCategoryForNodeKind } from '../../../model/generationNodeKinds'
import type { GenerationCanvasNode } from '../../../model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../../../store/generationCanvasStore'
import { migrateScene3DState } from '../migration/migrateScene3d'
import { DIRECTOR_NODE_KIND, DIRECTOR_PROJECT_META_KEY, STAGING_AUTO_CAPTURE_META_KEY } from '../model/directorNodeMeta'
import { buildStagingSceneAudited, type StagingSpec } from './stagingBuilder'

export type StagingAutoCapture = { targetNodeId?: string }

export function readStagingAutoCapture(node: Pick<GenerationCanvasNode, 'meta'>): StagingAutoCapture | null {
  const raw = node.meta?.[STAGING_AUTO_CAPTURE_META_KEY]
  return raw && typeof raw === 'object' ? (raw as StagingAutoCapture) : null
}

/**
 * 站位图（一张图片）此刻能不能作 composition_ref 接到目标镜头：没指目标 → none；目标不在画布上 → missing；
 * 其余照写边总闸同一条规则（validateReferenceEdge）判，拒了带总闸的原因。2026-10-24 走查：工具栏默认图片模型只吃文字，
 * 以前照连不误、被总闸静默拒掉，Agent 回执却说「已连到镜头」。
 */
export type StagingAttachPlan = { kind: 'none' } | { kind: 'missing' } | { kind: 'connect' } | { kind: 'rejected'; reason: EdgeSkipReason }

/** 出图后的站位图是一张图片节点：预判时按它当连线的源。 */
const STAGING_IMAGE_SOURCE = { kind: 'image' } as const

export function stagingAttachForTarget(targetNodeId: string | undefined): StagingAttachPlan {
  if (!targetNodeId) return { kind: 'none' }
  const target = useGenerationCanvasStore.getState().nodes.find((node) => node.id === targetNodeId)
  if (!target) return { kind: 'missing' }
  const verdict = validateReferenceEdge(STAGING_IMAGE_SOURCE, target, 'composition_ref')
  return verdict.ok ? { kind: 'connect' } : { kind: 'rejected', reason: verdict.reason }
}

/** 给 Agent 的回执：「正在离屏渲染出图」后面那半句 + 是不是降级。照预判说，不许预判接不上还说「连到镜头」。 */
export function stagingAttachReceipt(plan: StagingAttachPlan): { clause: string; degraded: boolean } {
  if (plan.kind === 'none') return { clause: '', degraded: false }
  if (plan.kind === 'connect') return { clause: '并连到镜头作 composition_ref', degraded: false }
  if (plan.kind === 'missing') return { clause: '；⚠️ shotClientId 指的节点不在画布上，图只留在画布上、不连', degraded: true }
  if (plan.reason === 'unsupported_reference') {
    return {
      clause: '；⚠️ 不会连到镜头：这个镜头当前的模型不接参考图（composition_ref 进不去），图只留在画布上。要用它控构图，先把这个镜头换成接参考图的模型再调一次；或只给 customBlocking，把构图写进提示词',
      degraded: true,
    }
  }
  return { clause: `；⚠️ 不会连到镜头：shotClientId 指的节点不收参考图（${plan.reason}），它应是这个镜头的关键帧图片节点；图只留在画布上`, degraded: true }
}

export type StagingAttachOutcome =
  | { kind: 'none' | 'missing' | 'connected' }
  | { kind: 'not_connected'; reason: 'stagingTextOnly' | 'stagingNotConnected'; message: string }

/**
 * 站位图 → 目标镜头 composition_ref 的**唯一**写边处（常驻 Host 出图后调）。连一次（写边总闸裁决；目标带参数参考槽时也由它定），
 * 再读画布：边在 = connected；不在 = not_connected，带一句给人看的话（与运镜参考「这个模型不接参考视频…」同一种语气）。
 * 目标不在了与运镜参考同口径：只出图留痕，不提示。
 */
export function attachStagingReference(imageNodeId: string, targetNodeId: string | undefined): StagingAttachOutcome {
  const plan = stagingAttachForTarget(targetNodeId)
  if (plan.kind === 'none' || plan.kind === 'missing' || !targetNodeId) return { kind: plan.kind === 'missing' ? 'missing' : 'none' }
  useGenerationCanvasStore.getState().connectNodes(imageNodeId, targetNodeId, 'composition_ref')
  const landed = useGenerationCanvasStore.getState().edges.some((edge) => edge.source === imageNodeId && edge.target === targetNodeId)
  if (landed) return { kind: 'connected' }
  return plan.kind === 'rejected' && plan.reason === 'unsupported_reference'
    ? { kind: 'not_connected', reason: 'stagingTextOnly', message: i18n.t('director.agent.stagingTextOnly') }
    : { kind: 'not_connected', reason: 'stagingNotConnected', message: i18n.t('director.agent.stagingNotConnected') }
}

export type CreateStagingReferenceNodeArgs = {
  spec: StagingSpec
  /** 目标镜头的关键帧图片节点 id；省略 → 只出图留痕，不连 composition_ref */
  targetNodeId?: string
  /** 手势上下文包裹（AI 提议事务用） */
  inCtx?: <T>(fn: () => T) => T
}

export function createStagingReferenceNode(args: CreateStagingReferenceNodeArgs): { stagingNodeId: string | null; issues: string[]; attach: StagingAttachPlan } {
  const inCtx = args.inCtx ?? (<T>(fn: () => T): T => fn())
  const { state, issues } = buildStagingSceneAudited(args.spec)
  const title = i18n.t('director.agent.stagingReference')
  const { project } = migrateScene3DState(state, { sceneName: title })
  const existing = readGenerationCanvasSnapshot().nodes
  const position = layoutPlannedNodes(['image'], existing)[0]
  const created = inCtx(() =>
    generationCanvasTools.create_nodes([
      {
        kind: DIRECTOR_NODE_KIND,
        categoryId: getDefaultCategoryForNodeKind(DIRECTOR_NODE_KIND),
        title,
        prompt: '',
        position,
        meta: {
          [DIRECTOR_PROJECT_META_KEY]: project,
          [STAGING_AUTO_CAPTURE_META_KEY]: args.targetNodeId ? { targetNodeId: args.targetNodeId } : {},
        },
      },
    ]),
  )
  return { stagingNodeId: created[0]?.id ?? null, issues, attach: stagingAttachForTarget(args.targetNodeId) }
}
