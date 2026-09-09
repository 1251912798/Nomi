import React from 'react'
import { isVideoDepthProgressPhase } from '../videoDepth/videoDepthProgressPhase'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { useGenerationFeedback } from '../../observability/useGenerationFeedback'
import { GenerationStatusBar } from './GenerationStatusBar'

export function NodeGenerationStatus({ node }: { node: GenerationCanvasNode }): JSX.Element | null {
  const feedback = useGenerationFeedback(node)
  if (isVideoDepthProgressPhase(node.progress?.phase) || !feedback?.active) return null
  return <span className="inline-flex min-w-0 [&_[data-generation-status]]:bg-transparent [&_[data-generation-status]]:text-[length:inherit] [&_[data-generation-status]]:font-normal [&_[data-process-dot]]:bg-nomi-ink-30"><GenerationStatusBar feedback={feedback} /></span>
}
