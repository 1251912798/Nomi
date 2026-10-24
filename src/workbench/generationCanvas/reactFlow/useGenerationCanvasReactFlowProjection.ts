import React from 'react'
import { useNodeExternalHighlightStore } from '../store/nodeExternalHighlightStore'
import type { GenerationCanvasEdge, GenerationCanvasNode } from '../model/generationCanvasTypes'
import {
  projectGenerationFlowEdges,
  projectGenerationFlowNodes,
  type FlowEdgeProjection,
  type FlowNodeProjection,
  type GenerationFlowEdge,
  type GenerationFlowNode,
} from './generationCanvasReactFlowAdapter'

/** 画布壳交给视口层的投影输入：全是「结构」，不含选区（选区由视口层自己订阅，壳不因选中重渲）。 */
export type CanvasFlowProjectionInput = {
  nodes: readonly GenerationCanvasNode[]
  edges: readonly GenerationCanvasEdge[]
  /** 边两端的节点表（含折叠编组的代理节点）。 */
  edgeNodeById: ReadonlyMap<string, GenerationCanvasNode>
  aggregateByEdgeId?: ReadonlyMap<string, { groupId: string; direction: 'input' | 'output' }>
  selectedEdgeId: string | null
  readOnly: boolean
  appearingNodeIds?: ReadonlySet<string>
  focusFlashNodeId?: string | null
}

export function useGenerationCanvasReactFlowProjection({
  nodes,
  edges,
  edgeNodeById,
  aggregateByEdgeId,
  selectedNodeIds,
  selectedEdgeId,
  readOnly,
  appearingNodeIds,
  focusFlashNodeId,
}: CanvasFlowProjectionInput & { selectedNodeIds: readonly string[] }): {
  flowNodes: GenerationFlowNode[]
  flowEdges: GenerationFlowEdge[]
} {
  const selectedSet = React.useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])
  // 边只关心「唯一选中的那张卡」（挨着它的边高亮）；多选之间换来换去，边层一条都不碰。
  const incidentNodeId = selectedSet.size === 1 ? selectedSet.values().next().value ?? null : null
  // React Flow recomputes edge anchors from its node internals. During a drag the
  // node positions change every frame, but edge identity, labels and modes do not.
  // Keep those structural inputs referentially stable so the edge layer does not
  // rebuild every SVG path on each pointer sample.
  const edgeStructureKey = React.useMemo(
    () => edges.map((edge) => [edge.id, edge.source, edge.target, edge.mode, edge.viaGroupId, edge.order].join(':')).join('|'),
    [edges],
  )
  const stableEdgesRef = React.useRef<{ key: string; value: readonly GenerationCanvasEdge[] }>({ key: '', value: [] })
  const stableEdges = React.useMemo(() => {
    if (stableEdgesRef.current.key === edgeStructureKey) return stableEdgesRef.current.value
    stableEdgesRef.current = { key: edgeStructureKey, value: edges }
    return edges
  }, [edgeStructureKey, edges])
  const edgeNodeStructureKey = React.useMemo(
    () => Array.from(edgeNodeById.values())
      .map((node) => [node.id, node.kind, node.title, node.status, node.typeId, node.result?.type].join(':'))
      .join('|'),
    [edgeNodeById],
  )
  const stableEdgeNodesRef = React.useRef<{ key: string; value: ReadonlyMap<string, GenerationCanvasNode> }>({ key: '', value: new Map() })
  const stableEdgeNodes = React.useMemo(() => {
    if (stableEdgeNodesRef.current.key === edgeNodeStructureKey) return stableEdgeNodesRef.current.value
    stableEdgeNodesRef.current = { key: edgeNodeStructureKey, value: edgeNodeById }
    return edgeNodeById
  }, [edgeNodeStructureKey, edgeNodeById])
  const aggregateStructureKey = React.useMemo(
    () => Array.from((aggregateByEdgeId ?? new Map()).entries())
      .map(([edgeId, aggregate]) => [edgeId, aggregate.groupId, aggregate.direction].join(':'))
      .join('|'),
    [aggregateByEdgeId],
  )
  const stableAggregateRef = React.useRef<{ key: string; value?: ReadonlyMap<string, { groupId: string; direction: 'input' | 'output' }> }>({ key: '' })
  const stableAggregateByEdgeId = React.useMemo(() => {
    if (stableAggregateRef.current.key === aggregateStructureKey) return stableAggregateRef.current.value
    stableAggregateRef.current = { key: aggregateStructureKey, value: aggregateByEdgeId }
    return aggregateByEdgeId
  }, [aggregateByEdgeId, aggregateStructureKey])
  // 选区是叠在结构投影上的一层：结构没变时，选区变化只换选中过 / 被选中的那几张卡（见 projectGenerationFlowNodes）。
  const nodeProjectionRef = React.useRef<FlowNodeProjection | null>(null)
  // 聊天里的指向元素正悬停着哪个节点（D2 P1）：只有前后被指的两张卡重投，别的卡交回同一个对象。
  const pointerHoverNodeId = useNodeExternalHighlightStore((state) => state.hoverNodeId)
  const flowNodes = React.useMemo(() => {
    nodeProjectionRef.current = projectGenerationFlowNodes(nodeProjectionRef.current, {
      nodes,
      selected: selectedSet,
      readOnly,
      appearingNodeIds,
      focusFlashNodeId,
      pointerHoverNodeId,
    })
    return nodeProjectionRef.current.output
  }, [appearingNodeIds, focusFlashNodeId, nodes, pointerHoverNodeId, readOnly, selectedSet])
  const edgeProjectionRef = React.useRef<FlowEdgeProjection | null>(null)
  const flowEdges = React.useMemo(() => {
    edgeProjectionRef.current = projectGenerationFlowEdges(edgeProjectionRef.current, {
      edges: stableEdges,
      nodeById: stableEdgeNodes,
      aggregateByEdgeId: stableAggregateByEdgeId,
      readOnly,
      selectedEdgeId,
      incidentNodeId,
    })
    return edgeProjectionRef.current.output
  }, [incidentNodeId, readOnly, selectedEdgeId, stableAggregateByEdgeId, stableEdgeNodes, stableEdges])

  return { flowNodes, flowEdges }
}
