import React from 'react'
import { useNodeLivePreviewStore } from '../store/nodeLivePreviewStore'
import { isVideoDepthProgressPhase } from '../videoDepth/videoDepthProgressPhase'
import { useWorkbenchStore } from '../../workbenchStore'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { useGenerationFeedback } from '../../observability/useGenerationFeedback'
import { GenerationStatusBar } from './GenerationStatusBar'

export function NodeGenerationStatus({ node }: { node: GenerationCanvasNode }): JSX.Element | null {
  const zoom = useWorkbenchStore((state) => state.categoryViewports[state.activeCategoryId]?.zoom ?? 1)
  const readableScale = 1 / Math.min(1, Math.max(0.6, zoom))
  const preview = useNodeLivePreviewStore((state) => state.byNode[node.id])
  const feedback = useGenerationFeedback(node)
  if (isVideoDepthProgressPhase(node.progress?.phase) || !feedback?.active) return null
  return <span className="inline-flex origin-top-left" style={{ transform: `scale(${readableScale})`, maxWidth: `${100 / readableScale}%` }}><GenerationStatusBar feedback={feedback} overlay={Boolean(node.result?.url || preview)} /></span>
}
