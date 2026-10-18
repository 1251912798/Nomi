// 夹具渲染 NodeParameterControls 时的入参来源——与生产生成框（NodeGenerationComposer）同一条路：
// 工作台根预热内存数据，图快照 / 模型清单 / mapping 读取器都从生产 hook 取。
// 参数控件新增必填入参时只改这里，夹具不再各抄一份（此前 asset-tile-badges、reference-row-alignment、model-contract-limits 各抄过）。
import { useComposerGraph } from '../../../src/workbench/generationCanvas/nodes/composerGraphSnapshot'
import { useComposerResidentData } from '../../../src/workbench/generationCanvas/nodes/composerResidentData'
import { useVendorMappingsReader } from '../../../src/workbench/generationCanvas/nodes/controls/useChannelCreateBody'
import { requiredModeForGenerationNode, useGenerationModelOptionsState } from '../../../src/workbench/generationCanvas/adapters/modelOptionsAdapter'
import type { GenerationCanvasNode } from '../../../src/workbench/generationCanvas/model/generationCanvasTypes'

export function useComposerControlProps(node: GenerationCanvasNode | undefined, nodeId: string) {
  useComposerResidentData()
  const graph = useComposerGraph(nodeId)
  const readMappings = useVendorMappingsReader()
  const modelOptionsState = useGenerationModelOptionsState(node?.kind ?? 'video', node ? requiredModeForGenerationNode(node, graph) : undefined)
  return { graph, modelOptionsState, readMappings }
}
