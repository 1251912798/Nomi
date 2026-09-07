// 生成中遮罩的节点级接线（从 BaseGenerationNode 拆出，760>739 体积门倒逼 · R9）。
// 职责：判「这一次是不是带实时进度的本机任务」→ 是则给 GeneratingOverlay 喂
// 确定进度/人话/活预览/遮罩取消（P 轨 2026-08-01 拍板 A 位）；不是则渲染旧样默认遮罩（云任务零变化）。
//
// 「本机任务」现在有两条链，共用同一档呈现：ComfyUI 的 ws 逐节点进度，与本地深度处理
// （`video-depth-*`，2026-09-07）。它们都满足那一档的三个前提——有确定百分比、有人话阶段名、
// 能真的中断——所以这里判的是**这三件事成不成立**，不是「是不是 ComfyUI」。
import React from 'react'
import { GeneratingOverlay } from './render/CardCommon'
import { useNodeLivePreviewStore } from '../store/nodeLivePreviewStore'
import { requestTaskCancel } from '../runner/localTaskControl'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { canInterruptGenerationTask } from '../model/taskCancellation'
import { isVideoDepthProgressPhase } from '../videoDepth/videoDepthProgressPhase'

export function NodeGeneratingOverlay({ node }: { node: GenerationCanvasNode }): JSX.Element {
  const live =
    node.progress?.phase === 'comfyui-node'
    || node.progress?.phase === 'comfyui-queued'
    || isVideoDepthProgressPhase(node.progress?.phase)
      ? node.progress
      : null
  const previewUrl = useNodeLivePreviewStore((state) => state.byNode[node.id])
  const handleCancel = React.useCallback(() => requestTaskCancel(node), [node])
  if (!live) return <GeneratingOverlay onCancel={canInterruptGenerationTask(node) ? handleCancel : undefined} />
  return (
    <GeneratingOverlay
      percent={live.percent}
      message={live.message}
      previewUrl={previewUrl}
      onCancel={handleCancel}
    />
  )
}
