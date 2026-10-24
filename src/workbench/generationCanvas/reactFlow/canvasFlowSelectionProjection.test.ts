import { describe, expect, it } from 'vitest'
import {
  projectGenerationFlowEdges,
  projectGenerationFlowNodes,
  type FlowEdgeProjection,
  type FlowNodeProjection,
} from './generationCanvasReactFlowAdapter'
import { sameGenerationFlowNodeRender } from '../nodes/flowNodeRenderGate'
import type { NodeProps } from '@xyflow/react'
import type { GenerationFlowNode } from './generationCanvasReactFlowAdapter'
import type { GenerationCanvasEdge, GenerationCanvasNode } from '../model/generationCanvasTypes'

// 不变式（D-perf 可疑点 a，10-16）：一次选中、或一张卡的状态写入，只让变了的那几张卡和挨着它们的边换对象；
// 投影对没变的节点 / 边交出上一次的同一个对象；而且「只有选区变了」时，投影不许把整张图再走一遍。
// 计数用 Proxy 数「读了输入数组的几个下标」：选中一张卡读的下标数只能跟选区大小走，不能跟画布上有几张卡走。

const N = 200

function node(id: string, x: number): GenerationCanvasNode {
  return { id, kind: 'image', title: id, position: { x, y: 0 }, size: { width: 100, height: 80 } }
}

function graph(count: number): { nodes: GenerationCanvasNode[]; edges: GenerationCanvasEdge[] } {
  const nodes = Array.from({ length: count }, (_, index) => node(`n${index}`, index * 300))
  // 链 + 每第 5 张多一条回边：边数约 1.2N，选中一张卡时挨着它的只有 1–3 条。
  const edges: GenerationCanvasEdge[] = []
  for (let index = 1; index < count; index += 1) edges.push({ id: `e${index}`, source: `n${index - 1}`, target: `n${index}` })
  for (let index = 5; index < count; index += 5) edges.push({ id: `b${index}`, source: `n${index}`, target: `n${index - 5}` })
  return { nodes, edges }
}

/** 包一层只读 Proxy，数投影读了数组的几个元素下标（length / 迭代器也算一次读）。 */
function counted<T>(items: readonly T[]): { list: readonly T[]; reads: () => number; reset: () => void } {
  let reads = 0
  const list = new Proxy(items as T[], {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads += 1
      return Reflect.get(target, key, receiver)
    },
  })
  return { list, reads: () => reads, reset: () => { reads = 0 } }
}

function nodeInput(nodes: readonly GenerationCanvasNode[], selected: ReadonlySet<string>) {
  return { nodes, selected, readOnly: false, appearingNodeIds: undefined, focusFlashNodeId: null, pointerHoverNodeId: null }
}

function edgeInput(
  edges: readonly GenerationCanvasEdge[],
  nodeById: ReadonlyMap<string, GenerationCanvasNode>,
  incidentNodeId: string | null,
  selectedEdgeId: string | null = null,
) {
  return { edges, nodeById, aggregateByEdgeId: undefined, readOnly: false, selectedEdgeId, incidentNodeId }
}

describe('选区只是投影上的一层：选中一张卡不重走整张图', () => {
  it('选中一张卡：没变的节点 === 上一次的，且投影读的节点数跟选区走、不跟 N 走', () => {
    const { nodes } = graph(N)
    const input = counted(nodes)
    const first: FlowNodeProjection = projectGenerationFlowNodes(null, nodeInput(input.list, new Set()))
    input.reset()

    const selected = projectGenerationFlowNodes(first, nodeInput(input.list, new Set(['n7'])))
    expect(input.reads()).toBeLessThanOrEqual(2)
    expect(selected.output).not.toBe(first.output)
    expect(selected.output[7]).not.toBe(first.output[7])
    expect(selected.output[7].selected).toBe(true)
    expect(selected.output[7].data.primarySelection).toBe(true)
    const changed = selected.output.filter((flowNode, index) => flowNode !== first.output[index])
    expect(changed.map((flowNode) => flowNode.id)).toEqual(['n7'])

    // 换选另一张：只动旧的和新的两张。
    input.reset()
    const moved = projectGenerationFlowNodes(selected, nodeInput(input.list, new Set(['n120'])))
    expect(input.reads()).toBeLessThanOrEqual(4)
    const movedChanged = moved.output.filter((flowNode, index) => flowNode !== selected.output[index]).map((flowNode) => flowNode.id)
    expect(movedChanged.sort()).toEqual(['n120', 'n7'])
    expect(moved.output[7]).toMatchObject({ selected: false, data: { primarySelection: false } })
  })

  it('单选 → 多选：原来那张丢掉「唯一选中」（缩放把手 / 生成框），新加的一张选中，其余不动', () => {
    const { nodes } = graph(N)
    const one = projectGenerationFlowNodes(projectGenerationFlowNodes(null, nodeInput(nodes, new Set())), nodeInput(nodes, new Set(['n3'])))
    const two = projectGenerationFlowNodes(one, nodeInput(nodes, new Set(['n3', 'n4'])))
    expect(two.output[3]).toMatchObject({ selected: true, data: { primarySelection: false } })
    expect(two.output[4]).toMatchObject({ selected: true, data: { primarySelection: false } })
    expect(two.output.filter((flowNode, index) => flowNode !== one.output[index]).map((flowNode) => flowNode.id).sort()).toEqual(['n3', 'n4'])
  })

  it('选区没变（同一个 Set）就交回同一个投影对象', () => {
    const { nodes } = graph(10)
    const selected = new Set(['n1'])
    const first = projectGenerationFlowNodes(null, nodeInput(nodes, selected))
    expect(projectGenerationFlowNodes(first, nodeInput(nodes, selected))).toBe(first)
  })

  it('选中一张卡：只有挨着它的边换对象，边层读的输入边数为 0（走上一版的下标表）', () => {
    const { nodes, edges } = graph(N)
    const nodeById = new Map(nodes.map((item) => [item.id, item]))
    const input = counted(edges)
    const first: FlowEdgeProjection = projectGenerationFlowEdges(null, edgeInput(input.list, nodeById, null))
    input.reset()

    const selected = projectGenerationFlowEdges(first, edgeInput(input.list, nodeById, 'n10'))
    expect(input.reads()).toBe(0)
    const changed = selected.output.filter((edge, index) => edge !== first.output[index]).map((edge) => edge.id).sort()
    // n10 的入边 e10、出边 e11、回边 b10（n10→n5）与 b15（n15→n10）。
    expect(changed).toEqual(['b10', 'b15', 'e10', 'e11'])
    expect(selected.output.filter((edge) => edge.data?.incident).map((edge) => edge.id).sort()).toEqual(changed)
  })

  it('多选之间换来换去（选区始终 ≥2 张）：边层一条都不碰，交回同一个数组', () => {
    const { nodes, edges } = graph(N)
    const nodeById = new Map(nodes.map((item) => [item.id, item]))
    const first = projectGenerationFlowEdges(null, edgeInput(edges, nodeById, null))
    // 多选时没有「唯一选中」，incidentNodeId 一直是 null。
    expect(projectGenerationFlowEdges(first, edgeInput(edges, nodeById, null))).toBe(first)
  })

  it('选中一条边：只换那一条（和上一条被放掉的）', () => {
    const { nodes, edges } = graph(N)
    const nodeById = new Map(nodes.map((item) => [item.id, item]))
    const first = projectGenerationFlowEdges(null, edgeInput(edges, nodeById, null))
    const picked = projectGenerationFlowEdges(first, edgeInput(edges, nodeById, null, 'e50'))
    expect(picked.output.filter((edge, index) => edge !== first.output[index]).map((edge) => edge.id)).toEqual(['e50'])
    const repicked = projectGenerationFlowEdges(picked, edgeInput(edges, nodeById, null, 'e60'))
    expect(repicked.output.filter((edge, index) => edge !== picked.output[index]).map((edge) => edge.id).sort()).toEqual(['e50', 'e60'])
  })
})

describe('别的卡在写生成进度：没变的卡和边保持同一个对象', () => {
  it('一张卡的进度写入（immer 式：只换这张卡的对象和外层数组）只换这一张的投影', () => {
    const { nodes, edges } = graph(N)
    const nodeById = new Map(nodes.map((item) => [item.id, item]))
    const firstNodes = projectGenerationFlowNodes(null, nodeInput(nodes, new Set(['n3'])))
    const firstEdges = projectGenerationFlowEdges(null, edgeInput(edges, nodeById, 'n3'))

    const progressed = { ...nodes[42], status: 'running' as const, progress: { phase: 'running', percent: 40 } } as GenerationCanvasNode
    const nextNodes = nodes.map((item, index) => (index === 42 ? progressed : item))
    const nextNodeById = new Map(nextNodes.map((item) => [item.id, item]))
    const projectedNodes = projectGenerationFlowNodes(firstNodes, nodeInput(nextNodes, firstNodes.selected))
    expect(projectedNodes.output.filter((flowNode, index) => flowNode !== firstNodes.output[index]).map((flowNode) => flowNode.id)).toEqual(['n42'])

    // 卡壳的 memo 比较器：没换对象的卡不重渲（React Flow 把同一个 data 交回来）。
    const props = (flowNode: GenerationFlowNode) => ({ id: flowNode.id, data: flowNode.data, selected: Boolean(flowNode.selected), width: flowNode.width, height: flowNode.height }) as unknown as NodeProps<GenerationFlowNode>
    expect(sameGenerationFlowNodeRender(props(firstNodes.output[41]), props(projectedNodes.output[41]))).toBe(true)
    expect(sameGenerationFlowNodeRender(props(firstNodes.output[42]), props(projectedNodes.output[42]))).toBe(false)

    const projectedEdges = projectGenerationFlowEdges(firstEdges, edgeInput(edges, nextNodeById, 'n3'))
    expect(projectedEdges.output.filter((edge, index) => edge !== firstEdges.output[index]).map((edge) => edge.id).sort()).toEqual(['e42', 'e43'])
  })
})
