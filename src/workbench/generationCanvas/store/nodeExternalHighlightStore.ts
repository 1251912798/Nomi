import { create } from 'zustand'
import { declareStoreLifetime } from '../../project/storeLifetime'

// 画布外面正指着哪个节点（2026-10-23 D2 指向元素「悬停两边同时亮」）。
//
// 写的人：聊天里的指向元素（`src/workbench/ai/pointer/`），悬停 / 聚焦时认领、离开 / 失焦 / 卸载时只放掉自己认领的那一条。
// 读的人：画布投影（`useGenerationCanvasReactFlowProjection`），把它投成节点的 `externalHighlight: 'hover'`。
// 「闪一下」不住这里：它是定位那一下的结果，仍由画布对焦那条路（FOCUS_GENERATION_NODE_EVENT）自己管时长。
//
// 为什么是一摞认领、不是一个槽：同一个节点可能被几个指向元素指着（卡上一个、收据里一个），谁先到谁后到、谁先走谁后走都有可能。
// 只有一个槽的时候，后到者一走就把先到者还亮着的清掉（2026-10-24 独立验收 V-d2-pointer 探针 E3）。
// 现在每个指向元素最多一条认领，亮谁看最后到的那一条，它走了就退回前一条——任何一个走，都只拿掉它自己的。
// 刻意独立于画布主 store：这是高频瞬态（鼠标划过一排指向元素），绝不进节点数据、不进撤销、不落盘。

type HoverClaim = Readonly<{
  /** 谁认领的（指向元素实例的 id）。 */
  owner: string
  nodeId: string
}>

type NodeExternalHighlightState = {
  /** 此刻被悬停 / 聚焦的指向元素指着的节点：认领里最后到的那一条；没有 = null。 */
  hoverNodeId: string | null
  /** 认领（先到的在前）。每个指向元素最多一条；亮谁看最后一条。 */
  claims: readonly HoverClaim[]
  /** 认领（同一个指向元素再认领就换成新的一条，排到最后）。 */
  claimHover: (nodeId: string, owner: string) => void
  /** 只拿掉 `owner` 自己的那一条；没有就什么都不做。别人的认领原样留着，正亮着的节点不变。 */
  releaseHover: (owner: string) => void
}

function settled(claims: readonly HoverClaim[]): Pick<NodeExternalHighlightState, 'claims' | 'hoverNodeId'> {
  return { claims, hoverNodeId: claims.length ? claims[claims.length - 1]!.nodeId : null }
}

export const useNodeExternalHighlightStore = create<NodeExternalHighlightState>((set) => ({
  hoverNodeId: null,
  claims: [],
  claimHover: (nodeId, owner) => set((state) => {
    const last = state.claims[state.claims.length - 1]
    if (last?.owner === owner && last.nodeId === nodeId) return state
    return settled([...state.claims.filter((claim) => claim.owner !== owner), { owner, nodeId }])
  }),
  releaseHover: (owner) => set((state) => (
    state.claims.some((claim) => claim.owner === owner) ? settled(state.claims.filter((claim) => claim.owner !== owner)) : state
  )),
}))

/** 寿命：节点 id 是项目内标识，换项目即清。 */
export const nodeExternalHighlightStoreLifetime = declareStoreLifetime({
  store: 'useNodeExternalHighlightStore',
  fields: { hoverNodeId: 'project', claims: 'project' },
  releaseProject: () => useNodeExternalHighlightStore.setState({ hoverNodeId: null, claims: [] }),
})
