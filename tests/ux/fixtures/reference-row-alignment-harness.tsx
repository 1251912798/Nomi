// 生成框「参考区这一排」的真组件（NodeParameterControls / NodeInputReferenceEntry），零额度：
// 目录桥是桩，节点灌进真 store，不发任何生成请求。用途：tests/ux/reference-row-alignment.test.mjs
// 量同一排所有虚线框的顶边与高度，并截图。
// 查询参数：kind=video|image|text  archetype=…  mode=…  fill=none|frames|refs  locale=zh-CN|en
import React, { type JSX } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../src/styles/index.css'
import { NomiPreviewHost } from '../../../src/design/previewHost'
import NodeParameterControls from '../../../src/workbench/generationCanvas/nodes/NodeParameterControls'
import NodeInputReferenceEntry from '../../../src/workbench/generationCanvas/nodes/NodeInputReferenceEntry'
import { useComposerControlProps } from './composerControlProps'
import { useGenerationCanvasStore } from '../../../src/workbench/generationCanvas/store/generationCanvasStore'
import { STILL_NEON, STILL_PORTRAIT, STILL_PROP } from '../../../src/devlab/designLab/storyboard/storyboardFixtures'
import type { GenerationCanvasNode } from '../../../src/workbench/generationCanvas/model/generationCanvasTypes'
import type { ModelCatalogHealthDto, ModelCatalogModelDto, ModelCatalogVendorDto } from '../../../src/workbench/api/modelCatalogApi'

const query = new URLSearchParams(location.search)
const kind = (query.get('kind') || 'video') as 'video' | 'image' | 'text'
const archetype = query.get('archetype') || 'seedance-2'
const mode = query.get('mode') || 't2v'
const fill = query.get('fill') || 'none'
const modelKey = query.get('model') || archetype
const catalogModels: ModelCatalogModelDto[] = [
  { modelKey, vendorKey: 'apimart', labelZh: archetype, kind: kind === 'image' ? 'image' : 'video', meta: { archetypeId: archetype }, enabled: true, published: true,
    publishedModes: ['text_to_video', 'image_to_video', 'text_to_image', 'image_edit'], availability: { usable: true }, createdAt: 'now', updatedAt: 'now' },
]
const catalogVendors: ModelCatalogVendorDto[] = [{ key: 'apimart', name: 'APIMart', enabled: true, authType: 'none', createdAt: 'now', updatedAt: 'now' }]
const catalogHealth: ModelCatalogHealthDto = { ok: true, counts: { vendors: 1, enabledVendors: 1, models: 1, enabledModels: 1, mappings: 1, enabledMappings: 1, enabledApiKeys: 0 }, byKind: [], issues: [] }
Object.assign(window, { nomiDesktop: { modelCatalog: {
  listModels: () => structuredClone(catalogModels),
  listVendors: () => structuredClone(catalogVendors),
  health: () => structuredClone(catalogHealth),
} } })

const stills = [STILL_PORTRAIT, STILL_NEON, STILL_PROP]
const sources: GenerationCanvasNode[] = stills.map((url, index) => ({
  id: `ref-${index + 1}`, kind: 'image', title: `参考 ${index + 1}`, categoryId: 'shots', position: { x: 0, y: index * 200 }, status: 'success',
  result: { id: `r-${index + 1}`, type: 'image', url, createdAt: 1 },
}) as GenerationCanvasNode)
const meta: Record<string, unknown> = kind === 'text' ? {} : { modelKey, modelVendor: 'apimart', archetype: { id: archetype, modeId: mode } }
if (fill === 'frames') Object.assign(meta, { firstFrameUrl: STILL_PORTRAIT, lastFrameUrl: STILL_NEON })
const target = { id: 'target', kind, title: '镜头', categoryId: 'shots', position: { x: 600, y: 0 }, status: 'idle', prompt: '', meta } as GenerationCanvasNode
useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [...sources, target], edges: [], groups: [] })
if (fill === 'refs') for (const source of sources.slice(0, 2)) useGenerationCanvasStore.getState().connectNodes(source.id, 'target', kind === 'text' ? 'reference' : 'character_ref')

function Stage(): JSX.Element {
  const node = useGenerationCanvasStore((state) => state.nodes.find((candidate) => candidate.id === 'target'))
  const controlProps = useComposerControlProps(node, 'target')
  return (
    <main className="min-h-screen bg-nomi-bg p-8 text-nomi-ink">
      <div className="w-[560px] rounded-nomi-lg border border-nomi-line bg-nomi-paper p-4" data-reference-row-stage={`${kind}:${archetype}:${mode}:${fill}`}>
        {kind === 'text' ? <NodeInputReferenceEntry nodeId="target" /> : node ? <NodeParameterControls node={node} section={(query.get('section') || 'references') as 'all' | 'references'} {...controlProps} /> : null}
      </div>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<NomiPreviewHost locale={query.get('locale') || 'zh-CN'}><Stage /></NomiPreviewHost>)
