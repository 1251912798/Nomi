// 「用户连了一条线」之后，目标节点上跟着这个手势变的东西——唯一一处。
//
// 连线手势的入口有好几扇（手拖把柄 connectToNode、多选成组连、组连线 connectToGroup、节点进组时物化组连线、
// Agent 计划 / 3D 站位经 connectNodes、派生节点 addDerivedOutput，以及外部 MCP 的连线经 applyExternalGraph——
// 协调 2026-10-23 裁定：外部 Agent 连线和进程内 Agent 是同一个口径），它们在「边已经建上」之后都只调这一个函数；
// 粘贴、模板、恢复快照、撤销 / 重做 / 放回带着自己的状态进来，**不**调它（那不是连线手势，不重算）。
// 这一处做两件事，顺序固定：
//   ① 生成方式收不下这条参考、档案却有能收的模式 → 切过去（t2i → 改图）；
//   ② 视频比例的产品默认（首选 16:9、已连输入全竖 9:16，唯一出处 nodes/videoAspectSeed）——只改没被明确选过比例的
//      视频节点（用户 2026-10-22 Q2 拍板：连线那一刻算；断线、删上游不回头改），而且只在新边属于比例规则会数的
//      输入（首帧 / 尾帧 / 参考，判据 nodes/aspectRatio.isAspectInputEdgeMode）时才算——角色参考这类边没改输入集合，
//      不拿它去把一个比例本来是档案默认（如 adaptive）的节点改成 16:9。
// 两件都幂等：已经是该模式 / 已经是首选比例 → 不写。
//
// **`history: false` 不是可选项**（2026-09-07 真机走查测出来的）：这些是**连线这一个手势的后果**，不是用户另做的一件事。
// updateNode 默认会给 `meta` patch 打一个自己的 undo barrier，于是连完一条线后日志里叠了两个 barrier——第一下 ⌘Z
// 只把模式 / 比例切回去（用户眼里画布毫无变化），得按第二下才撤掉那条边。关掉的只是 barrier：这条 meta 变更照常入日志、
// 照常落盘，撤到连线那个 barrier 时它跟着回退。
import { archetypeForNode, isTextPromptEdge, referenceAssetKindForNode, resolveTargetModeForEdge, textModeToReturnTo } from '../agent/referenceEdgeCapability'
import { applyArchetypeModeSwitch } from '../nodes/controls/archetypeMeta'
import { currentArchetypeMode } from '../nodes/controls/archetypeMeta'
import { listPlacementInputs } from '../nodes/controls/referenceList'
import { referenceSlotStorage } from '../nodes/controls/archetypeMeta'
import { findModelOptionByIdentifier, peekGenerationNodeModelOptions } from '../adapters/modelOptionsAdapter'
import { isAspectInputEdgeMode } from '../nodes/aspectRatio'
import { resolveRenderedControls } from '../nodes/nodeModelArchetype'
import { videoAspectSeedPatch } from '../nodes/videoAspectSeed'
import { nodeSelectedModelAddress } from '../nodes/controls/parameterControlModel'
import { isImageLikeGenerationNodeKind, isVideoLikeGenerationNodeKind } from '../model/generationNodeKinds'
import type { GenerationCanvasEdge, GenerationCanvasEdgeMode, GenerationCanvasNode } from '../model/generationCanvasTypes'

type ConnectDerivationStore = {
  nodes: GenerationCanvasNode[]
  edges: GenerationCanvasEdge[]
  updateNode: (nodeId: string, patch: { meta: Record<string, unknown> }, options?: { history?: boolean }) => void
}

type InputState = Pick<ConnectDerivationStore, 'nodes' | 'edges'>

/** Fields read by liveInputNodeIds. Keep this list next to the skip check so a new input
 * fact cannot silently bypass the subscription's drag fast path. */
export const LIVE_INPUT_NODE_FIELDS = ['kind', 'meta', 'result'] as const

function storyboardKey(meta: Record<string, unknown> | undefined): string {
  const design = typeof meta?.storyboardDesignId === 'string' ? meta.storyboardDesignId : ''
  const shot = typeof meta?.shotId === 'string' ? meta.shotId : ''
  return design && shot ? `${design}\u0000${shot}` : ''
}

function hasNodeOwnedReferenceInput(node: GenerationCanvasNode): boolean {
  const archetype = archetypeForNode(node)
  if (!archetype) return false
  const meta = (node.meta || {}) as Record<string, unknown>
  const mode = currentArchetypeMode(archetype, meta)
  if (mode.slots.some((slot) => ['first_frame', 'last_frame', 'image_ref'].includes(slot.kind))) {
    const inputs = listPlacementInputs(meta, mode)
    if (inputs.list.some((url) => !inputs.parked.has(url))) return true
  }
  for (const slot of mode.slots) {
    if (['first_frame', 'last_frame', 'image_ref'].includes(slot.kind)) continue
    const storage = referenceSlotStorage(slot)
    if (!storage) continue
    const value = meta[storage.metaKey]
    if (storage.isArray
      ? Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim())
      : typeof value === 'string' && value.trim()) return true
  }
  return false
}

/** Compute all targets with any live input in one nodes+edges pass. */
export function liveInputNodeIds(store: InputState): Set<string> {
  const live = new Set<string>()
  const nodesById = new Map(store.nodes.map((node) => [node.id, node]))
  const plannedKeyframes = new Map<string, Set<string>>()
  for (const node of store.nodes) {
    const meta = (node.meta || {}) as Record<string, unknown>
    if (meta.storyboardKeyframe === true) {
      const key = storyboardKey(meta)
      if (key) {
        const ids = plannedKeyframes.get(key) ?? new Set<string>()
        ids.add(node.id)
        plannedKeyframes.set(key, ids)
      }
    }
  }
  for (const node of store.nodes) {
    const meta = (node.meta || {}) as Record<string, unknown>
    const keyframeIds = plannedKeyframes.get(storyboardKey(meta))
    if (hasNodeOwnedReferenceInput(node) || Boolean(keyframeIds && [...keyframeIds].some((id) => id !== node.id))) live.add(node.id)
  }
  for (const edge of store.edges) {
    const target = nodesById.get(edge.target)
    const source = nodesById.get(edge.source)
    if (target && source && referenceAssetKindForNode(source) && !isTextPromptEdge(source, target, edge.mode)) live.add(target.id)
  }
  return live
}

/** The subscription can skip deriving both sets when only positions/other fields changed. */
export function inputDerivationFieldsChanged(before: readonly GenerationCanvasNode[], after: readonly GenerationCanvasNode[]): boolean {
  if (before.length !== after.length) return true
  for (let index = 0; index < before.length; index += 1) {
    const previous = before[index]
    const next = after[index]
    if (previous.id !== next.id) return true
    for (const field of LIVE_INPUT_NODE_FIELDS) if (previous[field] !== next[field]) return true
  }
  return false
}

export function targetHasLiveReferenceInput(store: InputState, targetNodeId: string): boolean {
  return liveInputNodeIds(store).has(targetNodeId)
}

/** 连线手势的唯一升格写口：边已经建好后，按这条边的语义切到能消费它的模式。 */
function promoteTargetMode(store: ConnectDerivationStore, sourceNodeId: string, targetNodeId: string, mode: GenerationCanvasEdgeMode | undefined): void {
  const source = store.nodes.find((node) => node.id === sourceNodeId)
  const target = store.nodes.find((node) => node.id === targetNodeId)
  if (!source || !target) return
  const nextModeId = resolveTargetModeForEdge(source, target, mode)
  if (!nextModeId) return
  const archetype = archetypeForNode(target)
  if (!archetype) return
  const activeMode = currentArchetypeMode(archetype, (target.meta || {}) as Record<string, unknown>)
  if (nextModeId === activeMode.id) return
  store.updateNode(
    targetNodeId,
    { meta: applyArchetypeModeSwitch((target.meta || {}) as Record<string, unknown>, archetype, nextModeId) },
    { history: false },
  )
}

/** Store/document 写入口的唯一回文生写口：仅当参考输入全部消失时收回文生。 */
export function revertTargetModeForEmptyInputs(
  store: ConnectDerivationStore,
  targetNodeId: string,
  hasAnyInput = false,
): void {
  const target = store.nodes.find((node) => node.id === targetNodeId)
  if (!target) return
  const archetype = archetypeForNode(target)
  if (!archetype) return
  const activeMode = currentArchetypeMode(archetype, (target.meta || {}) as Record<string, unknown>)
  const nextModeId = textModeToReturnTo(archetype, activeMode, hasAnyInput)
  if (!nextModeId || nextModeId === activeMode.id) return
  store.updateNode(
    targetNodeId,
    { meta: applyArchetypeModeSwitch((target.meta || {}) as Record<string, unknown>, archetype, nextModeId) },
    { history: false },
  )
}

/** Load-time state convergence for snapshots and event tails; it deliberately does not push undo. */
export function convergeStuckInputModes(store: ConnectDerivationStore): void {
  const live = liveInputNodeIds(store)
  for (const node of store.nodes) {
    if (live.has(node.id)) continue
    const archetype = archetypeForNode(node)
    const activeMode = archetype ? currentArchetypeMode(archetype, (node.meta || {}) as Record<string, unknown>) : null
    if (activeMode?.slots.some((slot) => slot.kind === 'first_frame' || slot.kind === 'last_frame')) continue
    revertTargetModeForEmptyInputs(store, node.id, false)
  }
}

/**
 * ② 视频比例默认值跟着输入走。参数控件按节点此刻的模型，模型清单的取法和生成框同一个（同步读目录缓存，
 * 按节点**当前生成方式**取——peekGenerationNodeModelOptions；只发布「图生视频」的模型在默认的文生视频清单里找不到）；
 * 目录还没载入 → 不改（这一刻说不清这个模型有哪些比例档，不猜）。
 */
function seedTargetVideoAspect(store: ConnectDerivationStore, targetNodeId: string, edgeMode: GenerationCanvasEdgeMode | undefined): void {
  if (!isAspectInputEdgeMode(edgeMode)) return
  const target = store.nodes.find((n) => n.id === targetNodeId)
  if (!target || !isVideoLikeGenerationNodeKind(target.kind)) return
  const meta = (target.meta || {}) as Record<string, unknown>
  const address = nodeSelectedModelAddress(meta)
  if (!address.modelKey) return
  const option = findModelOptionByIdentifier(peekGenerationNodeModelOptions(target, store) ?? [], address.modelKey, address.vendorKey)
  if (!option) return
  const controls = resolveRenderedControls(option, meta, isImageLikeGenerationNodeKind(target.kind), true)
  const patch = videoAspectSeedPatch({ nodeId: targetNodeId, nodes: store.nodes, edges: store.edges, controls, meta, respectExplicit: true })
  if (Object.keys(patch).length === 0) return
  store.updateNode(targetNodeId, { meta: { ...meta, ...patch } }, { history: false })
}

/**
 * 连线手势的边已经建上之后调（每条新边一次）。传进来的 store 必须是**此刻**的（`get()`），两步之间会重读。
 * `mode` 是这条新边**落库后**的 mode（不是调用方请求的那个——writeCanvasEdge 的请求 mode 可以缺省、会被连线规则改写）。
 */
export function deriveTargetAfterConnect(
  getStore: () => ConnectDerivationStore,
  sourceNodeId: string,
  targetNodeId: string,
  mode: GenerationCanvasEdgeMode | undefined,
): void {
  promoteTargetMode(getStore(), sourceNodeId, targetNodeId, mode)
  seedTargetVideoAspect(getStore(), targetNodeId, mode)
}
