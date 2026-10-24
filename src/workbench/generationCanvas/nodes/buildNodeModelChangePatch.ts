import type { ModelOption } from '../../../config/models'
import { findModelOptionByIdentifier } from '../adapters/modelOptionsAdapter'
import type { GenerationCanvasEdge, GenerationCanvasNode } from '../model/generationCanvasTypes'
import { isImageLikeGenerationNodeKind, isVideoLikeGenerationNodeKind } from '../model/generationNodeKinds'
import { archetypeForNode, referenceDemandForRole, resolveModeForConnectedReferences, resolveModeForReferenceDemand, type ReferenceDemand } from '../agent/referenceEdgeCapability'
import { normalizeReferenceListMeta } from './controls/referenceList'
import { resolveReferencePlacement } from '../runner/referenceSlots'
import { replaceCustomCapabilityContractMeta } from '../../../../electron/shared/modelArchetypes'
import {
  buildModelControls,
  defaultPatchForControls,
  nodeSelectedModelAddress,
  removePreviousControlParams,
} from './controls/parameterControlModel'
import { applyArchetypeModeSwitch, currentArchetypeMode } from './controls/archetypeMeta'
import { resolveArchetypeForOption, resolveRenderedControls } from './nodeModelArchetype'
import { videoAspectSeedPatch } from './videoAspectSeed'
import { projectParameterReferenceSlots } from '../model/parameterReferenceSlots'

export type BuildNodeModelChangePatchInput = {
  node: GenerationCanvasNode
  nodes: readonly GenerationCanvasNode[]
  edges: readonly GenerationCanvasEdge[]
  modelOptions: readonly ModelOption[]
  value: string
  vendor?: string
}

export type NodeModelChangeSet = {
  retained: Array<{ key: string; value: unknown }>
  removed: Array<{ key: string; value: unknown }>
  changedDefaults: Array<{ key: string; from: unknown; to: unknown }>
}

/** Single source of truth for both the per-node picker and bulk model changes. */
export function buildNodeModelChangePatch({
  node,
  nodes,
  edges,
  modelOptions,
  value,
  vendor,
}: BuildNodeModelChangePatchInput): { meta: Record<string, unknown>; changeset: NodeModelChangeSet } {
  // 旧数据（按槽存的首 / 尾帧键）先按**换模型前**看得见的顺序落成规范的一份参考列表：之后列表就不再动了。
  const previousArchetype = archetypeForNode(node)
  const currentMeta = (previousArchetype
    ? normalizeReferenceListMeta(node.meta || {}, currentArchetypeMode(previousArchetype, node.meta || {}))
    : null) ?? node.meta ?? {}
  const currentAddress = nodeSelectedModelAddress(currentMeta)
  const currentOption = findModelOptionByIdentifier(
    modelOptions,
    currentAddress.modelKey,
    currentAddress.vendorKey,
  )
  const nextOption = findModelOptionByIdentifier(modelOptions, value, vendor)
  const isImageLike = isImageLikeGenerationNodeKind(node.kind)
  const isVideoLike = isVideoLikeGenerationNodeKind(node.kind)
  const previousControls = resolveRenderedControls(currentOption, currentMeta, isImageLike, isVideoLike)
  const controls = buildModelControls(nextOption?.meta, isImageLike, isVideoLike)
  const defaultPatch = defaultPatchForControls(controls)
  const previousKeys = new Set(previousControls.map((control) => control.key))
  const nextKeys = new Set(controls.map((control) => control.key))
  const changeset: NodeModelChangeSet = {
    retained: [...nextKeys]
      .filter((key) => previousKeys.has(key) && Object.prototype.hasOwnProperty.call(currentMeta, key)
        && (!Object.prototype.hasOwnProperty.call(defaultPatch, key) || Object.is(currentMeta[key], defaultPatch[key])))
      .map((key) => ({ key, value: currentMeta[key] })),
    removed: [...previousKeys]
      .filter((key) => !nextKeys.has(key) && Object.prototype.hasOwnProperty.call(currentMeta, key))
      .map((key) => ({ key, value: currentMeta[key] })),
    changedDefaults: [...nextKeys]
      .filter((key) => Object.prototype.hasOwnProperty.call(defaultPatch, key)
        && (!Object.prototype.hasOwnProperty.call(currentMeta, key) || !Object.is(currentMeta[key], defaultPatch[key])))
      .map((key) => ({ key, from: currentMeta[key], to: defaultPatch[key] })),
  }
  const nextArchetype = resolveArchetypeForOption(nextOption)
  // 换模型 = 重铺全部默认值（比例也在内，不让「明确选过」），默认值只问唯一出处。
  const aspectPatch = isVideoLike
    ? videoAspectSeedPatch({ nodeId: node.id, nodes, edges, controls, meta: currentMeta, respectExplicit: false })
    : {}

  const baseMeta = replaceCustomCapabilityContractMeta(
    removePreviousControlParams(currentMeta, previousControls),
    nextOption?.meta,
  )
  let nextMeta: Record<string, unknown> = {
    ...baseMeta,
    modelKey: nextOption?.modelKey || nextOption?.value || value || null,
    modelAlias: nextOption?.modelAlias || nextOption?.value || value || null,
    modelVendor: nextOption?.vendor || null,
    vendor: nextOption?.vendor || null,
    modelLabel: nextOption?.label || value || null,
    ...defaultPatch,
    ...aspectPatch,
    ...(isVideoLike
      ? { videoModel: nextOption?.value || value || null, videoModelVendor: nextOption?.vendor || null }
      : { imageModel: nextOption?.value || value || null, imageModelVendor: nextOption?.vendor || null }),
  }

  nextMeta = projectParameterReferenceSlots(nextMeta, nextOption?.meta)
  if (!nextArchetype) {
    delete nextMeta.archetype
  } else {
    const promotedModeId = resolveModeForConnectedReferences(
      { ...node, meta: nextMeta },
      nodes as GenerationCanvasNode[],
      edges as GenerationCanvasEdge[],
    )
    if (promotedModeId) nextMeta = applyArchetypeModeSwitch(nextMeta, nextArchetype, promotedModeId)
    // 上传 / 素材库放进来的图：参考列表本身不动，只按它们在**旧方式**里的用途（首帧、尾帧、参考）给**新档案**挑一个
    // 收得下的方式（不能借节点身上还没换掉的旧档案算）。落哪个槽、哪张「未用到」交给 resolveReferencePlacement 推导。
    else {
      const uploadMode = resolveModeForReferenceDemand(nextArchetype, nextMeta, uploadDemands({ ...node, meta: currentMeta }, nodes, edges))
      if (uploadMode) nextMeta = applyArchetypeModeSwitch(nextMeta, nextArchetype, uploadMode)
    }
  }

  return { meta: nextMeta, changeset }
}

/** 节点参考列表里每张图在**当前**方式下的用途（首帧 / 尾帧 / 参考；未用到按参考），换模型时拿来挑新方式。 */
function uploadDemands(node: GenerationCanvasNode, nodes: readonly GenerationCanvasNode[], edges: readonly GenerationCanvasEdge[]): ReferenceDemand[] {
  const placement = resolveReferencePlacement(node, [...nodes], [...edges])
  const roleOf = (kind: string) => (kind === 'first_frame' || kind === 'last_frame' ? kind : undefined)
  return [
    ...placement.slots.flatMap((slot) => slot.fills
      .filter((fill) => fill.origin.type === 'upload' && fill.url)
      .map(() => referenceDemandForRole(roleOf(slot.slotKind), 'image'))),
    ...placement.unused.map(() => referenceDemandForRole(undefined, 'image')),
  ]
}
