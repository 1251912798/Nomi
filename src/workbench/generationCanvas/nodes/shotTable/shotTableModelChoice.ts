import { readShotTable, type DeconstructionShotTableDocument } from '../../../../../electron/shared/canvas/shotTable'
import type { GenerationCanvasNode } from '../../model/generationCanvasTypes'

export type DeconstructModelChoice = Pick<DeconstructionShotTableDocument['source'], 'visionModel' | 'transcribeModel'>

/**
 * 新建拆解表时默认用哪两个模型：**这个项目里最近一次拆解选过的**（2026-10-18 拆解前选模型「默认上次选的」）。
 *
 * 为什么从画布上的表推，而不是另存一份「上次的选择」：选择本来就记在表上（`source.visionModel` /
 * `source.transcribeModel`，重拆与单镜重试都读它），再存一份就是第二个真相源，两边迟早对不上。
 * 代价：新项目没有表可推，默认就是「自动选择」——这是诚实的「还没选过」，不是猜。
 * 「最近」按表的 `updatedAt` 比；两个模型各取各自最近一次有值的，用户只换过读图时转写仍沿用更早的选择。
 */
export function lastDeconstructModelChoice(nodes: readonly GenerationCanvasNode[], excludeNodeId?: string): DeconstructModelChoice {
  let vision: { at: string; value: NonNullable<DeconstructModelChoice['visionModel']> } | undefined
  let transcribe: { at: string; value: NonNullable<DeconstructModelChoice['transcribeModel']> } | undefined
  for (const node of nodes) {
    if (node.kind !== 'shot_table' || node.id === excludeNodeId) continue
    const table = readShotTable(node.meta)
    if (!table || table.source.kind !== 'deconstruction') continue
    const at = table.updatedAt
    if (table.source.visionModel && (!vision || at > vision.at)) vision = { at, value: table.source.visionModel }
    if (table.source.transcribeModel && (!transcribe || at > transcribe.at)) transcribe = { at, value: table.source.transcribeModel }
  }
  return {
    ...(vision ? { visionModel: vision.value } : {}),
    ...(transcribe ? { transcribeModel: transcribe.value } : {}),
  }
}
