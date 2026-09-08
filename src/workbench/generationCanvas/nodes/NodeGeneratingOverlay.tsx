import React from 'react'
import { GeneratingOverlay, GeneratingCancelButton } from './render/CardCommon'
import { GenerationWaitingSurface } from './GenerationWaitingSurface'
import { useGenerationFeedback } from '../../observability/useGenerationFeedback'
import { useNodeLivePreviewStore } from '../store/nodeLivePreviewStore'
import { requestTaskCancel } from '../runner/localTaskControl'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { canInterruptGenerationTask } from '../model/taskCancellation'
import { isVideoDepthProgressPhase } from '../videoDepth/videoDepthProgressPhase'

export function NodeGeneratingOverlay({ node }: { node: GenerationCanvasNode }): JSX.Element | null {
  const feedback = useGenerationFeedback(node)
  const previewUrl = useNodeLivePreviewStore((state) => state.byNode[node.id])
  const handleCancel = React.useCallback(() => requestTaskCancel(node), [node])
  // Local depth processing has its separately approved top bar; it is not a model generation stage.
  if (isVideoDepthProgressPhase(node.progress?.phase)) return <GeneratingOverlay
    percent={node.progress?.percent} message={node.progress?.message} previewUrl={previewUrl} onCancel={handleCancel} placement="top" />
  if (!feedback?.active) return null
  return <div className="absolute inset-0 z-[1] pointer-events-none" data-generating-placement="surface">
    <GenerationWaitingSurface audio={node.kind === 'audio'} previewUrl={previewUrl} previewLabel={feedback.previewLabel} percent={feedback.percent} />
    {canInterruptGenerationTask(node) ? <div className="absolute right-3 bottom-3"><GeneratingCancelButton onCancel={handleCancel} /></div> : null}
  </div>
}
