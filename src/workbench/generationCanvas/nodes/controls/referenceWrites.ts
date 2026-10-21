/**
 * 参考行的写入动作（从 NodeParameterControls 原样搬出，保持单一写路径）：
 * 数组槽追加 / 删除、首尾帧等单槽的指派 / 换图、两帧对调。宿主壳只负责把它们接到界面上。
 */
import { useGenerationCanvasStore } from '../../store/generationCanvasStore'
import type { GenerationCanvasNode } from '../../model/generationCanvasTypes'
import {
  edgeModeForGroup, parameterReferenceMetaPatch, readParameterReferenceSlots,
  resolveParameterReferenceAssignments, type ImageUrlSlot,
} from '../../model/parameterReferenceSlots'
import {
  appendArchetypeArrayValue, readArchetypeArray, referenceSlotStorage, type ArchetypeArraySlot,
} from './archetypeMeta'
import { decideArrayReferenceRemoval, resolveReferenceSlots } from '../../runner/referenceSlots'
import { removeMention } from '../../../assets/promptMentions'
import { nodeReferenceCapacity } from './nodeCrossFieldConstraints'
import type { useNodeWriteAccess } from '../nodeWriteAccess'

type Access = ReturnType<typeof useNodeWriteAccess>
type ArchMode = Parameters<typeof nodeReferenceCapacity>[0]

export type ReferenceWriteContext = {
  node: GenerationCanvasNode
  archMode: ArchMode | null
  /** 惰性取：宿主壳里这份列表晚于写入句柄算出，但只在事件里才用到。 */
  getImageUrlSlots: () => ImageUrlSlot[]
  latestNode: Access['latestNode']
  updateNode: Access['updateNode']
  getLatestMeta: () => Record<string, unknown>
  updateMeta: (patch: Record<string, unknown>) => void
  storeConnectNodes: (source: string, target: string, mode: ReturnType<typeof edgeModeForGroup>, slotKey?: string) => void
  storeDisconnectEdge: (edgeId: string, options?: { scope: 'parameter' }) => void
  closeSlot: () => void
  feedback: (key: string, values: Record<string, unknown>) => void
}

export function addToArraySlot(ctx: ReferenceWriteContext, slot: ArchetypeArraySlot, url: string): void {
  const { node, archMode } = ctx
  const state = useGenerationCanvasStore.getState()
  const currentNode = ctx.latestNode(node.id) ?? node
  if (archMode && nodeReferenceCapacity(archMode, currentNode, state.nodes, state.edges) === 0) {
    ctx.feedback('generationCommon.parameters.referenceTotal', { max: archMode.maxTotalReferences })
    return
  }
  // 容量先按**已占用位置**判（含连线 + pending 边，单源 resolveReferenceSlots），不能只看 meta 数组长度——
  // 否则被边占满的槽仍允许写入 meta、却落不进槽（显示/发送都没它）=「参考图上不去」。
  const occupied = resolveReferenceSlots(currentNode, state.nodes, state.edges).find(
    (rs) => referenceSlotStorage({ kind: rs.slotKind })?.metaKey === slot.metaKey,
  )?.fills.length
  if (occupied != null && slot.max !== undefined && occupied >= slot.max) {
    ctx.feedback('generationCommon.parameters.referenceFull', { max: slot.max })
    return
  }
  // 单源去重/上限：与拖入/连线共用 appendArchetypeArrayValue（规则 1：不另开写路径）。
  // 读最新 meta 计算追加（避免基于渲染快照算出过期数组 → 覆盖刚连边写入的项）。
  const result = appendArchetypeArrayValue(ctx.getLatestMeta(), slot, url)
  if (result.status === 'full') {
    ctx.feedback('generationCommon.parameters.maximum', { max: slot.max, label: slot.label })
    return
  } // 到上限:明确告知(对抗评审:别静默丢)
  if (result.status !== 'added') return // empty / duplicate：静默
  ctx.updateMeta({ [slot.metaKey]: result.next })
  ctx.closeSlot()
}

export function removeFromArray(ctx: ReferenceWriteContext, metaKey: string, index: number): void {
  const { node } = ctx
  // 「×」按这一项的来源分流（单一真相源 decideArrayReferenceRemoval）：
  // 来自连边 → 断边（之前只删 meta 不断边，边来源的图重渲染又被解析回来 = 「叉不掉」根因）；
  // 来自上传 → 按 url 删 meta（显示 index 是「边+上传」合并列表的下标，不能直接拿去 filter meta 数组）。
  const state = useGenerationCanvasStore.getState()
  const decision = decideArrayReferenceRemoval(ctx.latestNode(node.id) ?? node, state.nodes, state.edges, metaKey, index)
  // image 数组(= character 参考)删除时，同步抹掉描述框里指向它的 @ chip（保 undo 原子性 + 一次持久化）。
  const promptAfterRemovingMention = (url: string | null) =>
    metaKey === 'referenceImageUrls' && url ? removeMention(node.prompt || '', url) : null

  if (decision.kind === 'disconnect-edge') {
    ctx.storeDisconnectEdge(decision.edgeId)
    // B5：同一 url 既来自边、又残留在 meta 上传里（去重后只显示边那份）→ 仅断边会让它以 upload 形态
    // 重现（「叉一次还在」）。断边时一并清掉 meta 里的同 url 上传（与断边/删 chip 合成一次持久化，保 undo 原子）。
    const latestMeta = ctx.getLatestMeta()
    const metaArr = readArchetypeArray(latestMeta, metaKey)
    const cleanedMeta = decision.url ? metaArr.filter((u) => u !== decision.url) : metaArr
    const nextPrompt = promptAfterRemovingMention(decision.url)
    const patch: { meta?: Record<string, unknown>; prompt?: string } = {}
    if (cleanedMeta.length !== metaArr.length) patch.meta = { ...latestMeta, [metaKey]: cleanedMeta }
    if (nextPrompt != null && nextPrompt !== (node.prompt || '')) patch.prompt = nextPrompt
    if (Object.keys(patch).length > 0) ctx.updateNode(node.id, patch)
    return
  }
  if (decision.kind === 'noop') return

  // remove-upload：按 url 从 meta 数组删（不是显示 index）。
  const latestMeta = ctx.getLatestMeta()
  const next = readArchetypeArray(latestMeta, metaKey).filter((u) => u !== decision.url)
  const nextPrompt = promptAfterRemovingMention(decision.url)
  if (nextPrompt != null && nextPrompt !== (node.prompt || '')) {
    ctx.updateNode(node.id, { meta: { ...latestMeta, [metaKey]: next }, prompt: nextPrompt })
    return
  }
  ctx.updateMeta({ [metaKey]: next })
}

function existingEdgeOf(ctx: ReferenceWriteContext, slot: ImageUrlSlot) {
  const state = useGenerationCanvasStore.getState()
  const target = state.nodes.find((candidate) => candidate.id === ctx.node.id) || ctx.node
  return {
    state,
    target,
    edge: resolveParameterReferenceAssignments(target, state.nodes, state.edges, ctx.getImageUrlSlots())
      .find((assignment) => assignment.slot.key === slot.key)?.edge,
  }
}

export function assignSlotSource(ctx: ReferenceWriteContext, slot: ImageUrlSlot, newSourceNodeId: string): void {
  const { state, target, edge: existingEdge } = existingEdgeOf(ctx, slot)
  if (!newSourceNodeId) {
    if (existingEdge) ctx.storeDisconnectEdge(existingEdge.id, { scope: 'parameter' })
    const clearPatch = parameterReferenceMetaPatch(slot, ctx.getImageUrlSlots(), null)
    ctx.updateNode(ctx.node.id, { meta: { ...ctx.getLatestMeta(), ...clearPatch } }, { history: !existingEdge })
    ctx.closeSlot()
    return
  }
  const declared = readParameterReferenceSlots(target.meta).some((candidate) => candidate.key === slot.key)
  if (existingEdge?.source === newSourceNodeId) { ctx.closeSlot(); return }
  if (existingEdge) ctx.storeDisconnectEdge(existingEdge.id, { scope: 'parameter' })
  else state.captureHistory()
  ctx.storeConnectNodes(newSourceNodeId, ctx.node.id, edgeModeForGroup(slot.group), declared ? slot.key : undefined)
  // S2 写收口：边即真相源——不再写 firstFrameUrl/firstFrameRef/referenceImages 等快照 meta（源未生成时快照为空=陈旧，
  // 且与其它参数写入竞态）；读取方都已边优先，源生成后 url 由边实时解析。
  ctx.closeSlot()
}

/** 上传 / 选项目素材只替换该槽来源；退出编组继承时其它槽保留为手工边。 */
export function setSlotUrl(ctx: ReferenceWriteContext, slot: ImageUrlSlot, url: string): void {
  const { edge: existingEdge } = existingEdgeOf(ctx, slot)
  if (existingEdge) ctx.storeDisconnectEdge(existingEdge.id, { scope: 'parameter' })
  const patch = parameterReferenceMetaPatch(slot, ctx.getImageUrlSlots(), url)
  ctx.updateNode(ctx.node.id, { meta: { ...ctx.getLatestMeta(), ...patch } }, { history: !existingEdge })
  ctx.closeSlot()
}

/** 首尾帧对调：连线来的跟着边走，上传来的跟着 url 走；一次撤销回到对调前。 */
export function swapFrameSlots(ctx: ReferenceWriteContext, first: ImageUrlSlot, last: ImageUrlSlot, assetValuesByKey: Record<string, unknown>, edgeSourceOf: (slot: ImageUrlSlot) => string | undefined): void {
  type Source = { edgeSource: string } | { url: string } | null
  const describe = (slot: ImageUrlSlot): Source => {
    const edgeSource = edgeSourceOf(slot)
    if (edgeSource) return { edgeSource }
    const url = assetValuesByKey[slot.key]
    return typeof url === 'string' && url ? { url } : null
  }
  const a = describe(first)
  const b = describe(last)
  if (!a && !b) return
  useGenerationCanvasStore.getState().captureHistory()
  assignSlotSource(ctx, first, '')
  assignSlotSource(ctx, last, '')
  const put = (slot: ImageUrlSlot, value: Source) => {
    if (!value) return
    if ('edgeSource' in value) assignSlotSource(ctx, slot, value.edgeSource)
    else setSlotUrl(ctx, slot, value.url)
  }
  put(first, b)
  put(last, a)
}
