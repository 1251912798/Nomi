import React from 'react'
import { createRoot } from 'react-dom/client'
import '../../../src/styles/index.css'
import { NomiAppProviders } from '../../../src/NomiAppProviders'
import { NomiColorSchemeProvider } from '../../../src/theme/NomiColorSchemeProvider'
import NodeParameterControls from '../../../src/workbench/generationCanvas/nodes/NodeParameterControls'
import { useGenerationCanvasStore } from '../../../src/workbench/generationCanvas/store/generationCanvasStore'
import { useComposerGraph } from '../../../src/workbench/generationCanvas/nodes/composerGraphSnapshot'
import { useComposerResidentData } from '../../../src/workbench/generationCanvas/nodes/composerResidentData'
import { useVendorMappingsReader } from '../../../src/workbench/generationCanvas/nodes/controls/useChannelCreateBody'
import { requiredModeForGenerationNode, useGenerationModelOptionsState } from '../../../src/workbench/generationCanvas/adapters/modelOptionsAdapter'

// The real catalog, real store and real controls; no network generation calls.
await window.nomiDesktop!.modelCatalog.upsertVendorApiKey('apimart', { apiKey: 'nomi-e2e-placeholder', enabled: true })
window.nomiDesktop!.modelCatalog.upsertVendor({ key: 'apimart', enabled: true })
useGenerationCanvasStore.getState().restoreSnapshot({
  nodes: [{ id: 'contract-video', kind: 'video', title: 'Hailuo 2.3', categoryId: 'shots', position: { x: 0, y: 0 }, size: { width: 320, height: 180 },
    meta: { modelKey: 'MiniMax-Hailuo-2.3', vendor: 'apimart', resolution: '768p', duration: 10,
      archetype: { id: 'hailuo-2.3', modeId: 't2v', variantId: 'standard' } } }],
  edges: [], selectedNodeIds: ['contract-video'], groups: [],
})
function Stage() {
  const node = useGenerationCanvasStore(state => state.nodes[0])
  // 与生产同一条路：生成框用同一份图快照 / 模型清单 / mapping 读取器喂给参数控件（#1231 起这三件是必传）。
  useComposerResidentData()
  const graph = useComposerGraph(node.id)
  const readMappings = useVendorMappingsReader()
  const modelOptionsState = useGenerationModelOptionsState('video', requiredModeForGenerationNode(node, graph))
  return <main className="min-h-screen bg-nomi-bg p-8 text-nomi-ink">
    <div className="w-fit rounded-nomi-lg border border-nomi-line bg-nomi-paper p-4" data-contract-stage>
      <NodeParameterControls node={node} section="references" graph={graph} modelOptionsState={modelOptionsState} readMappings={readMappings} />
      <NodeParameterControls node={node} section="parameters" graph={graph} modelOptionsState={modelOptionsState} readMappings={readMappings} />
    </div>
  </main>
}
createRoot(document.getElementById('root')!).render(<NomiColorSchemeProvider><NomiAppProviders><Stage /></NomiAppProviders></NomiColorSchemeProvider>)
