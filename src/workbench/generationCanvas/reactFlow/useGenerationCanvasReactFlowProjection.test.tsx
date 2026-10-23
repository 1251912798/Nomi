// 「聊天里悬停指向元素 → 画布上那个节点亮」这一条接线的测试（NodePointer 板 canvas.node.highlight，独立验收 V-d2-pointer 条件 2）。
//
// 适配器单测（generationCanvasReactFlowAdapter.test.ts）钉的是纯函数：给了 `pointerHoverNodeId` 就出 `hover`。
// 这里钉的是**把 store 接到投影上的那一行**：悬停 store 的 `hoverNodeId` 一变，真 hook 里对应节点的 `externalHighlight` 就变。
// 删掉那一行订阅（悬停永远到不了真画布），纯函数的测试照样全绿——所以要在 hook 这一层再钉一遍。
//
// 测试宿主没有 DOM：用仓库已有的 react-reconciler 测试渲染器直接渲染 hook，写悬停走指向元素真用的那个写口（claimHover / releaseHover）。
import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReactTestRenderer } from '../../ai/v4/testReactRenderer'
import type { GenerationCanvasEdge, GenerationCanvasNode } from '../model/generationCanvasTypes'
import { useNodeExternalHighlightStore } from '../store/nodeExternalHighlightStore'
import type { GenerationFlowNode } from './generationCanvasReactFlowAdapter'
import { useGenerationCanvasReactFlowProjection } from './useGenerationCanvasReactFlowProjection'

const node = (id: string, x: number): GenerationCanvasNode => ({ id, kind: 'image', title: id, position: { x, y: 0 }, size: { width: 100, height: 80 } })

// hook 的 useMemo 认引用：这些入参在一次测试里必须是同一个对象，否则每次渲染都算「结构变了」。
const NODES = [node('a', 0), node('b', 300), node('c', 600)]
const EDGES: GenerationCanvasEdge[] = []
const EDGE_NODES = new Map<string, GenerationCanvasNode>()
const NO_SELECTION: string[] = []

type Extra = { focusFlashNodeId?: string | null }

function Probe({ sink, focusFlashNodeId = null }: { sink: { flowNodes: GenerationFlowNode[] }; focusFlashNodeId?: string | null }): null {
  const { flowNodes } = useGenerationCanvasReactFlowProjection({
    nodes: NODES, edges: EDGES, edgeNodeById: EDGE_NODES, selectedNodeIds: NO_SELECTION, selectedEdgeId: null, readOnly: false, focusFlashNodeId,
  })
  sink.flowNodes = flowNodes
  return null
}

function mount(extra: Extra = {}) {
  const sink = { flowNodes: [] as GenerationFlowNode[] }
  const renderer = createReactTestRenderer()
  const render = (patch: Extra = extra) => {
    renderer.render(<Probe sink={sink} {...patch} />)
    renderer.flushPassiveEffects()
  }
  /** store 变了之后让 React 把订阅带来的更新跑完。 */
  const settle = async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    renderer.flushPassiveEffects()
  }
  render()
  return { sink, render, settle, close: () => renderer.close() }
}

const highlights = (sink: { flowNodes: GenerationFlowNode[] }) => sink.flowNodes.map((flowNode) => flowNode.data.externalHighlight)

// 回到出厂状态（不点字段名：认领怎么记是 store 自己的事，这里只关心「没人悬停」）。
const resetHover = () => useNodeExternalHighlightStore.setState(useNodeExternalHighlightStore.getInitialState(), true)
beforeEach(resetHover)
afterEach(resetHover)

describe('canvas projection · a hovered chat pointer lights its node (S5, canvas.node.highlight)', () => {
  it('claiming a hover on the store turns that node into `hover` and nothing else; releasing puts it back', async () => {
    const view = mount()
    try {
      expect(highlights(view.sink)).toEqual([null, null, null])
      const before = [...view.sink.flowNodes]

      useNodeExternalHighlightStore.getState().claimHover('b', 'pointer-1')
      await view.settle()
      expect(highlights(view.sink)).toEqual([null, 'hover', null])
      // 只有被点名的那一张换了对象，别的卡交回同一个（React Flow 靠对象身份决定重不重渲）。
      expect(view.sink.flowNodes[0]).toBe(before[0])
      expect(view.sink.flowNodes[2]).toBe(before[2])
      expect(view.sink.flowNodes[1]).not.toBe(before[1])

      useNodeExternalHighlightStore.getState().releaseHover('pointer-1')
      await view.settle()
      expect(highlights(view.sink)).toEqual([null, null, null])
    } finally {
      view.close()
    }
  })

  it('the hover follows the pointer from one node to the next', async () => {
    const view = mount()
    try {
      const { claimHover, releaseHover } = useNodeExternalHighlightStore.getState()
      claimHover('a', 'pointer-1')
      await view.settle()
      releaseHover('pointer-1')
      claimHover('c', 'pointer-2')
      await view.settle()
      expect(highlights(view.sink)).toEqual([null, null, 'hover'])
    } finally {
      view.close()
    }
  })

  it('a focus flash on the same node wins over the hover, and the hover comes back when the flash ends', async () => {
    const view = mount()
    try {
      useNodeExternalHighlightStore.getState().claimHover('b', 'pointer-1')
      await view.settle()
      view.render({ focusFlashNodeId: 'b' })
      expect(highlights(view.sink)).toEqual([null, 'flash', null])
      view.render({ focusFlashNodeId: null })
      expect(highlights(view.sink)).toEqual([null, 'hover', null])
    } finally {
      view.close()
    }
  })
})
