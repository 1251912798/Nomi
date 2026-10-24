// 把库条目自带的参考图落到一个节点上（提示词库「放上画布」用；设计卡 Q9：总是新建 + 带参考图 + 选中）。
//
// 规则与节点生成框里「提示词预设」那一条是同一把尺子：
// 当前生成方式收不下 image_ref 先促到能收的模式（与建边 auto-promote 同一个判据），再走 addAssetUrlToNode 单源写入（去重 / 上限同一处）；
// 模型任何模式都不吃图参考 → 返回 'unsupported'，由调用方诚实地说「只放了文字」，不写死数据。
// 刚建出来、还没挑模型的卡（模型在生成框第一次挂载时才挑，useNodeModelAutoSelect）：图先放进「图片参考」那一格（与手动上传同一个键），
// 挑模型时按「卡上已有参考图」读改图 / 图生视频的默认偏好，第一次定生成方式时促到收得下它的模式（referenceDemandsBeforeFirstMode）。
import type { NodeWriteAccess } from './nodeWriteAccess'
import { applyArchetypeModeSwitch, withUnplacedArrayReferences } from './controls/archetypeMeta'
import { archetypeForNode, resolveModeForReferenceDemand } from '../agent/referenceEdgeCapability'
import { nodeSelectedModelAddress } from './controls/parameterControlModel'
import { addAssetUrlToNode } from './nodeAssetWrite'
import type { AspectRatioPlacementOutcome } from '../../../../electron/shared/aspectRatioValue'

export type PromptReferenceOutcome = AspectRatioPlacementOutcome

export function applyPromptReferenceImages(nodeId: string, referenceUrls: readonly string[], access: NodeWriteAccess): PromptReferenceOutcome {
  const urls = referenceUrls.filter(Boolean)
  if (!urls.length) return 'none'
  const target = access.latestNode(nodeId)
  if (!target) return 'unsupported'
  const meta = (target.meta || {}) as Record<string, unknown>
  // 与生成框「这张卡还没选模型 → 自动挑默认」同一个判据（useNodeModelAutoSelect 的 selectedModelValue）。
  if (!nodeSelectedModelAddress(meta).modelKey) {
    if (access.canWrite?.() === false) return 'unsupported'
    access.updateNode(nodeId, { meta: withUnplacedArrayReferences(meta, 'image', urls) })
    return 'placed'
  }
  const archetype = archetypeForNode(target)
  if (archetype) {
    const promotedModeId = resolveModeForReferenceDemand(archetype, meta, [{ slots: ['image_ref'], asset: 'image' }])
    if (promotedModeId) access.updateNode(nodeId, { meta: applyArchetypeModeSwitch(meta, archetype, promotedModeId) })
  }
  const outcomes = urls.map((url) => addAssetUrlToNode(nodeId, 'image', url, access))
  return outcomes.every((outcome) => outcome.status === 'no-slot') ? 'unsupported' : 'placed'
}
