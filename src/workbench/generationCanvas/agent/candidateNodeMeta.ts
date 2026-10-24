// 「这个节点是哪份候选的投影」——候选来源戳的键名与读法的唯一 owner。
//
// 为什么需要一个戳：画布节点是 Run 里 `generationPlan.candidate` 的**投影**，不是一份独立意图。
// 没有戳，渲染层无从分辨「这张卡是用户自己新建的（该自动挑默认模型）」和「这张卡是 agent 草稿落下来的
// （模型已经由候选定了，不该被自动挑选覆盖）」——2026-09-10 真机症状「节点上的模型和 agent 定的不一致」
// 正是后者被前者的自愈逻辑改写的结果。
//
// 戳只记身份与版本，不记参数：参数的唯一 owner 仍是 `buildPlannedNodeMeta`。
// 「落地报文里的候选 → buildPlannedNodeMeta 入参」这一步也住这里（`plannedInputFromCandidate`，首落与重绑定共用）。
import type { MaterializeShotCandidateWire } from '../../../../electron/shared/canvas/materializeShotCandidate'
import type { PlannedNodeModelInput } from './plannedNodeMeta'

export const CANDIDATE_META_KEYS = {
  /** PlanCandidate.candidateId。 */
  candidateId: 'productionCandidateId',
  /** PlanCandidate.revision：落地时记下，下一次落地据它判断「意图变了没有」。 */
  candidateRevision: 'productionCandidateRevision',
  /** 候选选的模型身份（两段）。模型此刻不可用时它仍在，用来向用户说清「agent 要的是哪个」。 */
  candidateModelKey: 'productionCandidateModelKey',
  candidateModelVendor: 'productionCandidateModelVendor',
} as const

export type CandidateNodeIdentity = {
  candidateId: string
  modelKey: string
  modelVendor: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 读节点上的候选来源戳。没有 candidateId = 这张卡不是候选的投影（用户自己建的），返回 null。
 * 调用方据此决定「能不能替这张卡自动挑模型」。
 */
export function readCandidateNodeIdentity(
  meta: Record<string, unknown> | null | undefined,
): CandidateNodeIdentity | null {
  if (!meta) return null
  const candidateId = text(meta[CANDIDATE_META_KEYS.candidateId])
  if (!candidateId) return null
  return {
    candidateId,
    modelKey: text(meta[CANDIDATE_META_KEYS.candidateModelKey]),
    modelVendor: text(meta[CANDIDATE_META_KEYS.candidateModelVendor]),
  }
}

/**
 * 落地报文里的候选（`MaterializeShotCandidateWire`）的渲染半：主进程线类型的同一份，只是渲染层收到时
 * 除了身份与版本，其余键都可能缺（旧报文 / 只动已有节点的重放），所以放宽成可选——**不另写第二份类型**。
 */
export type LandedShotCandidate =
  Pick<MaterializeShotCandidateWire, 'candidateId' | 'revision'>
  & Partial<Omit<MaterializeShotCandidateWire, 'candidateId' | 'revision'>>

/** 这个线字段渲染层不喂给节点模型，以及为什么。 */
type NotNodeModel = { readonly notNodeModel: string }

/**
 * 每一个线字段在渲染层落到哪——穷举表：主进程给线上加一个字段而这里没归类，typecheck 就红
 * （变体就是「线上有、渲染层没喂给节点」那一类，2026-10-22 R-d2-defaults #2）。
 * 值是 `buildPlannedNodeMeta` 入参的键，或者一句「不喂」的理由。
 */
const LANDED_CANDIDATE_FIELDS: { readonly [K in keyof Required<MaterializeShotCandidateWire>]: keyof PlannedNodeModelInput | NotNodeModel } = {
  candidateId: { notNodeModel: '来源戳（candidateStamp），不是模型参数' },
  revision: { notNodeModel: '来源戳（candidateStamp），据它判断要不要重绑定' },
  vendor: 'vendor',
  modelKey: 'modelKey',
  modeId: 'modeId',
  variantId: 'variantId',
  parameters: 'params',
  mode: { notNodeModel: '任务种类；节点的方式由 modeId 定，任务种类在节点路由方式推出' },
}

/**
 * 落地报文里的候选 → 节点 meta 唯一构造器（`buildPlannedNodeMeta`）的入参。首次落地（新建节点）与重绑定
 * （已落节点、候选 revision 变新）**共用这一个**——以前两处各手写一份，变体两处都没写，节点停在默认变体。
 * 候选没有模型身份 → null（不知道是哪个模型就不假装知道它的参数）。
 */
export function plannedInputFromCandidate(candidate: LandedShotCandidate | undefined): PlannedNodeModelInput | null {
  if (!candidate?.modelKey) return null
  const input: Record<string, unknown> = {}
  for (const [field, target] of Object.entries(LANDED_CANDIDATE_FIELDS)) {
    const value = candidate[field as keyof LandedShotCandidate]
    if (typeof target === 'string' && value !== undefined) input[target] = value
  }
  return input as PlannedNodeModelInput
}
