// 「用户连了一条线」之后，目标节点上跟着这个手势变的东西——唯一一处。
//
// 连线手势的入口有好几扇（手拖把柄 connectToNode、多选成组连、组连线 connectToGroup、节点进组时物化组连线、
// Agent 计划 / 3D 站位经 connectNodes、派生节点 addDerivedOutput），它们在「边已经建上」之后都只调这一个函数；
// 粘贴、模板、恢复快照、外部写回带着自己的状态进来，**不**调它（那不是连线手势，不重算）。
// 这一处做两件事，顺序固定：
//   ① 生成方式收不下这条参考、档案却有能收的模式 → 切过去（t2i → 改图）；
//   ② 视频比例的产品默认（首选 16:9、已连输入全竖 9:16，唯一出处 nodes/videoAspectSeed）——只改没被明确选过比例的
//      视频节点（用户 2026-10-22 Q2 拍板：连线那一刻算；断线、删上游不回头改）。
// 两件都幂等：已经是该模式 / 已经是首选比例 → 不写。
//
// **`history: false` 不是可选项**（2026-09-07 真机走查测出来的）：这些是**连线这一个手势的后果**，不是用户另做的一件事。
// updateNode 默认会给 `meta` patch 打一个自己的 undo barrier，于是连完一条线后日志里叠了两个 barrier——第一下 ⌘Z
// 只把模式 / 比例切回去（用户眼里画布毫无变化），得按第二下才撤掉那条边。关掉的只是 barrier：这条 meta 变更照常入日志、
// 照常落盘，撤到连线那个 barrier 时它跟着回退。
import { archetypeForNode, resolveTargetModeForEdge } from '../agent/referenceEdgeCapability'
import { applyArchetypeModeSwitch } from '../nodes/controls/archetypeMeta'
import { findModelOptionByIdentifier } from '../adapters/modelOptionsAdapter'
import { resolveRenderedControls } from '../nodes/nodeModelArchetype'
import { videoAspectSeedPatch } from '../nodes/videoAspectSeed'
import { nodeSelectedModelAddress } from '../nodes/controls/parameterControlModel'
import { getGenerationNodeCatalogKind, isImageLikeGenerationNodeKind, isVideoLikeGenerationNodeKind } from '../model/generationNodeKinds'
import { peekCatalogModelOptions } from '../../../config/modelCatalogCache'
import type { GenerationCanvasEdge, GenerationCanvasEdgeMode, GenerationCanvasNode } from '../model/generationCanvasTypes'

type ConnectDerivationStore = {
  nodes: GenerationCanvasNode[]
  edges: GenerationCanvasEdge[]
  updateNode: (nodeId: string, patch: { meta: Record<string, unknown> }, options?: { history?: boolean }) => void
}

/** ① 生成方式跟着参考走。 */
function promoteTargetMode(store: ConnectDerivationStore, sourceNodeId: string, targetNodeId: string, mode: GenerationCanvasEdgeMode | undefined): void {
  const source = store.nodes.find((n) => n.id === sourceNodeId)
  const target = store.nodes.find((n) => n.id === targetNodeId)
  if (!source || !target) return
  const nextModeId = resolveTargetModeForEdge(source, target, mode)
  if (!nextModeId) return
  const archetype = archetypeForNode(target)
  if (!archetype) return
  store.updateNode(
    targetNodeId,
    { meta: applyArchetypeModeSwitch((target.meta || {}) as Record<string, unknown>, archetype, nextModeId) },
    { history: false },
  )
}

/**
 * ② 视频比例默认值跟着输入走。参数控件按节点此刻的模型（同步读模型目录缓存，与生成框首帧同一份）；
 * 目录还没载入 → 不改（这一刻说不清这个模型有哪些比例档，不猜）。
 */
function seedTargetVideoAspect(store: ConnectDerivationStore, targetNodeId: string): void {
  const target = store.nodes.find((n) => n.id === targetNodeId)
  if (!target || !isVideoLikeGenerationNodeKind(target.kind)) return
  const meta = (target.meta || {}) as Record<string, unknown>
  const address = nodeSelectedModelAddress(meta)
  if (!address.modelKey) return
  const option = findModelOptionByIdentifier(peekCatalogModelOptions(getGenerationNodeCatalogKind(target.kind)) ?? [], address.modelKey, address.vendorKey)
  if (!option) return
  const controls = resolveRenderedControls(option, meta, isImageLikeGenerationNodeKind(target.kind), true)
  const patch = videoAspectSeedPatch({ nodeId: targetNodeId, nodes: store.nodes, edges: store.edges, controls, meta, respectExplicit: true })
  if (Object.keys(patch).length === 0) return
  store.updateNode(targetNodeId, { meta: { ...meta, ...patch } }, { history: false })
}

/** 连线手势的边已经建上之后调（每条新边一次）。传进来的 store 必须是**此刻**的（`get()`），两步之间会重读。 */
export function deriveTargetAfterConnect(
  getStore: () => ConnectDerivationStore,
  sourceNodeId: string,
  targetNodeId: string,
  mode: GenerationCanvasEdgeMode | undefined,
): void {
  promoteTargetMode(getStore(), sourceNodeId, targetNodeId, mode)
  seedTargetVideoAspect(getStore(), targetNodeId)
}
