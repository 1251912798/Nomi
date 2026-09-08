import React from 'react'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { useGenerationFeedback } from '../../observability/useGenerationFeedback'
import { GenerationStatusBar } from './GenerationStatusBar'
import { useReducedProcessMotion } from './useReducedProcessMotion'

export function NodeGenerationStatus({ node }: { node: GenerationCanvasNode }): JSX.Element | null {
  const zoom = useGenerationCanvasStore((state) => state.canvasZoom)
  const readableScale = 1 / Math.min(1, Math.max(0.6, zoom))
  const feedback = useGenerationFeedback(node)
  const reduced = useReducedProcessMotion()
  const [visible, setVisible] = React.useState(false)
  const element = React.useRef<HTMLSpanElement>(null)
  // Only acknowledge a result observed completing, not every old result when panning back into view.
  const wasActive = React.useRef(feedback?.active ?? false)
  React.useEffect(() => {
    if (feedback?.active) { wasActive.current = true; setVisible(true); return }
    if (!feedback?.saved || !wasActive.current) { setVisible(false); return }
    wasActive.current = false
    setVisible(true)
    let fade: Animation | undefined
    const timeout = setTimeout(() => {
      if (reduced) { setVisible(false); return }
      fade = element.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' })
      if (fade) fade.onfinish = () => setVisible(false)
      else setVisible(false)
    }, reduced ? 4000 : 2000)
    return () => { clearTimeout(timeout); fade?.cancel() }
  }, [feedback?.active, feedback?.saved, reduced])
  if (!feedback || feedback.phase === 'failed' || (!feedback.active && !visible)) return null
  return <span ref={element} className="inline-flex origin-top-left" style={{ transform: `scale(${readableScale})`, maxWidth: `${100 / readableScale}%` }}><GenerationStatusBar feedback={feedback} overlay={Boolean(node.result?.url)} /></span>
}
