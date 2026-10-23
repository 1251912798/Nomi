import { create } from 'zustand'
import { declareStoreLifetime } from '../../project/storeLifetime'

// 画布外面正指着哪个节点（2026-10-23 D2 指向元素「悬停两边同时亮」）。
//
// 写的人：聊天里的指向元素（`src/workbench/ai/pointer/`），悬停 / 聚焦时认领、离开 / 失焦 / 卸载时只放掉自己认领的那一下。
// 读的人：画布投影（`useGenerationCanvasReactFlowProjection`），把它投成节点的 `externalHighlight: 'hover'`。
// 「闪一下」不住这里：它是定位那一下的结果，仍由画布对焦那条路（FOCUS_GENERATION_NODE_EVENT）自己管时长。
//
// 为什么带认领者：同一个节点可能被两个指向元素指着（卡上一个、收据里一个），A 离开不能把 B 正亮着的清掉。
// 刻意独立于画布主 store：这是高频瞬态（鼠标划过一排指向元素），绝不进节点数据、不进撤销、不落盘。

type NodeExternalHighlightState = {
  /** 此刻被悬停 / 聚焦的指向元素指着的节点；没有 = null。 */
  hoverNodeId: string | null
  /** 谁认领的这一下（指向元素实例的 id）。 */
  hoverOwner: string | null
  claimHover: (nodeId: string, owner: string) => void
  /** 只放掉 `owner` 自己认领的那一下；别人已经接手了就什么都不做。 */
  releaseHover: (owner: string) => void
}

export const useNodeExternalHighlightStore = create<NodeExternalHighlightState>((set) => ({
  hoverNodeId: null,
  hoverOwner: null,
  claimHover: (nodeId, owner) => set((state) => (state.hoverNodeId === nodeId && state.hoverOwner === owner ? state : { hoverNodeId: nodeId, hoverOwner: owner })),
  releaseHover: (owner) => set((state) => (state.hoverOwner === owner ? { hoverNodeId: null, hoverOwner: null } : state)),
}))

/** 寿命：节点 id 是项目内标识，换项目即清。 */
export const nodeExternalHighlightStoreLifetime = declareStoreLifetime({
  store: 'useNodeExternalHighlightStore',
  fields: { hoverNodeId: 'project', hoverOwner: 'project' },
  releaseProject: () => useNodeExternalHighlightStore.setState({ hoverNodeId: null, hoverOwner: null }),
})
