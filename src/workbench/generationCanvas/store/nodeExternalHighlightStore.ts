import { create } from 'zustand'
import { declareStoreLifetime } from '../../project/storeLifetime'

// 画布外面正指着哪个节点（2026-10-23 D2 指向元素 P1「悬停两边同时亮」）。
//
// 写的人：聊天里的指向元素（`src/workbench/ai/pointer/`），悬停 / 聚焦时写、离开时清。
// 读的人：画布投影（`useGenerationCanvasReactFlowProjection`），把它投成节点的 `externalHighlight: 'hover'`。
// 「闪一下」不住这里：它是定位那一下的结果，仍由画布对焦那条路（FOCUS_GENERATION_NODE_EVENT）自己管时长。
//
// 刻意独立于画布主 store：这是高频瞬态（鼠标划过一排指向元素），绝不进节点数据、不进撤销、不落盘。

type NodeExternalHighlightState = {
  /** 此刻被悬停的指向元素指着的节点；没有 = null。 */
  hoverNodeId: string | null
  setHoverNodeId: (nodeId: string | null) => void
}

export const useNodeExternalHighlightStore = create<NodeExternalHighlightState>((set) => ({
  hoverNodeId: null,
  setHoverNodeId: (nodeId) => set((state) => (state.hoverNodeId === nodeId ? state : { hoverNodeId: nodeId })),
}))

/** 寿命：节点 id 是项目内标识，换项目即清。 */
export const nodeExternalHighlightStoreLifetime = declareStoreLifetime({
  store: 'useNodeExternalHighlightStore',
  fields: { hoverNodeId: 'project' },
  releaseProject: () => useNodeExternalHighlightStore.setState({ hoverNodeId: null }),
})
