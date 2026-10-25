// 卡 / 大详情上「选了哪个模型」的显示名：和生成框同一个判据，不各读各的。
import React from 'react'
import { useModelOptionsState } from '../../../config/useModelOptions'
import { findModelOptionByIdentifier, requiredModeForGenerationNode, useGenerationModelOptionsState } from '../../generationCanvas/adapters/modelOptionsAdapter'
import { nodeSelectedModelAddress } from '../../generationCanvas/nodes/controls/parameterControlModel'
import type { ModelOption } from '../../../config/models'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../../generationCanvas/store/generationCanvasStore'

/**
 * 节点上选好的模型在目录里的那一行。和生成框同一个判据（modelOptionsAdapter.findModelOptionByIdentifier + 节点的模型地址）：
 * 目录里认得这个模型才算「已选」；认不得（没接供应商 / 已下架）就是没有。显示名（`useModelLabels`）与 Agent 付费卡逐镜估价
 * （`estimateNodePrice`，画布批量同一个函数）都从这一行来，不各查各的。
 */
export function useNodeModelOption(): (node: GenerationCanvasNode | undefined) => ModelOption | undefined {
  const image = useModelOptionsState('image').options
  const video = useModelOptionsState('video').options
  const audio = useModelOptionsState('audio').options
  return React.useCallback((node) => {
    if (!node) return undefined
    const address = nodeSelectedModelAddress(node.meta || {})
    if (!address.modelKey) return undefined
    return [image, video, audio].map((options) => findModelOptionByIdentifier(options, address.modelKey, address.vendorKey)).find(Boolean) ?? undefined
  }, [image, video, audio])
}

/**
 * 节点上选好的模型 → 显示名（`useNodeModelOption` 那一行的名字）。认不得就什么都不说——和生成框的「选择模型」说的是同一件事，
 * 不能头上像选好了、框里却是空的。
 */
export function useModelLabels(): (node: GenerationCanvasNode | undefined) => string {
  const optionOf = useNodeModelOption()
  return React.useCallback((node) => optionOf(node)?.label || '', [optionOf])
}

/** 大详情头上的模型名：读的就是生成框读的那份选项（同一个 hook、同一个 requiredMode）。 */
export function useNodeModelLabel(node: GenerationCanvasNode | undefined): string {
  const requiredMode = useGenerationCanvasStore((state) => (node ? requiredModeForGenerationNode(node, { nodes: state.nodes, edges: state.edges }) : undefined))
  const options = useGenerationModelOptionsState(node?.kind ?? 'image', requiredMode).options
  if (!node) return ''
  const address = nodeSelectedModelAddress(node.meta || {})
  return findModelOptionByIdentifier(options, address.modelKey, address.vendorKey)?.label || ''
}
