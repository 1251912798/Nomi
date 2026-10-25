// 生成 composer 往哪里写。
//
// 默认答案是画布 store——画布上那张卡改的就是画布上那个节点。写口被提成一个可替换的接缝，
// 而不是让每个控件自己去订 store：生成框把它包一层只读闸（`readOnly` 宿主）再交给参考区 / @ 引用 / 拖放，
// 下面的控件一条写入调用、不按宿主分叉。
//
// 只有两件事经过这个接缝：**改这个节点**、**读这个节点的最新样子**（增量 patch 要在最新值上
// 合并，读渲染快照会丢写）。连边、删节点、建节点那些改的是画布结构而不是这一次生成的载荷，
// 必须显式持有 canvas connectNodes 权能。
//
// 2026-09-10 到 D2（用户 2026-10-23 拍板）之间，Agent 面板的付费确认卡也挂过整件生成框、接过这个接缝
// （写它自己的草稿账本，点「生成」才投影回画布）。付费卡上不再有参数控件，那一半随旧卡一起删了；
// 聊天卡片模块引不到这里，由依赖规则 `chat-card-no-import-node-editor` 拦着。
import React from 'react'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import type { CanvasMutationOptions } from '../store/canvasGuards'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

export type NodeWriteAccess = Readonly<{
  canWrite?: () => boolean
  /**
   * 连边权能 = **改这张图**的授权。
   *
   * ⚠️ 它**不是**「这个节点有哪些边」的判别式。2026-09-21 之前 `useNodeMentionSource` 就是这么用的：
   * 没有 `connectNodes` 的宿主（当时的付费确认卡）把「这个节点有哪些参考」当成**边不存在**来算——
   * 连线接进来的首帧 / 参考卡既不在 @ 候选里，也不进参考槽计数，可执行时那些边照样会被读进请求体。
   * 读边和写边是两件事：谁都读同一张图，只有改图要授权。
   */
  connectNodes?: ReturnType<typeof useGenerationCanvasStore.getState>['connectNodes']
  updateNode: (nodeId: string, patch: Partial<GenerationCanvasNode>, options?: CanvasMutationOptions) => void
  /** 这个节点**此刻**的样子。增量 patch 必须基于它合并，不能基于渲染快照 prop。 */
  latestNode: (nodeId: string) => GenerationCanvasNode | undefined
}>

const NodeWriteAccessContext = React.createContext<NodeWriteAccess | null>(null)

export const NodeWriteAccessProvider = NodeWriteAccessContext.Provider

/** 默认写入面 = 画布 store。没有 Provider 时走这条（生成框自己再包一层只读闸往下传）。 */
export function useNodeWriteAccess(): NodeWriteAccess {
  const override = React.useContext(NodeWriteAccessContext)
  const storeUpdateNode = useGenerationCanvasStore((state) => state.updateNode)
  const storeAccess = React.useMemo<NodeWriteAccess>(() => Object.freeze({
    updateNode: storeUpdateNode,
    connectNodes: (...args) => useGenerationCanvasStore.getState().connectNodes(...args),
    latestNode: (nodeId: string) => useGenerationCanvasStore.getState().nodes.find((node) => node.id === nodeId),
  }), [storeUpdateNode])
  return override ?? storeAccess
}
