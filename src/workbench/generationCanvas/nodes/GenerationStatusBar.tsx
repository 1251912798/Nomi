import React from 'react'
import { useReducedProcessMotion } from './useReducedProcessMotion'
import { cn } from '../../../utils/cn'
import type { GenerationFeedback } from '../../observability/generationFeedback'

/** One atom, eight factual fillings. Geometry belongs to the node, never to progress. */
export function GenerationStatusBar({ feedback, overlay = false, action }: {
  feedback: GenerationFeedback
  overlay?: boolean
  action?: { label: string; onClick: () => void }
}): JSX.Element {
  const reduced = useReducedProcessMotion()
  const dot = React.useRef<HTMLSpanElement>(null)
  React.useEffect(() => {
    if (reduced || !feedback.active) return
    const animation = dot.current?.animate([{ opacity: 0.5 }, { opacity: 1 }, { opacity: 0.5 }], { duration: 1600, iterations: Infinity })
    return () => animation?.cancel()
  }, [reduced, feedback.active])
  const color = feedback.saved ? 'bg-nomi-success' : feedback.phase === 'failed' ? 'bg-nomi-danger'
    : feedback.late ? 'bg-nomi-warning' : feedback.phase === 'queued' ? 'bg-nomi-ink-30' : 'bg-nomi-accent'
  return (
    <span data-generation-status data-phase={feedback.phase} data-reduced-motion={reduced}
      className={cn('inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1 text-body font-medium leading-snug shadow-nomi-sm',
        overlay ? 'bg-[var(--nomi-overlay-chip)] text-nomi-media-ink' : 'bg-nomi-paper text-nomi-ink')}>
      <span ref={dot} data-process-dot className={cn('size-1.5 shrink-0 rounded-full', color)} aria-hidden />
      <span data-generation-message>{feedback.message}</span>
      {feedback.percent !== undefined ? <span className="font-nomi-mono tabular-nums">{Math.round(feedback.percent)}%</span> : null}
      {action ? <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); action.onClick() }} className="shrink-0 underline underline-offset-2">{action.label}</button> : null}
    </span>
  )
}
