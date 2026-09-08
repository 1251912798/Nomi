import React from 'react'
import { cn } from '../../../utils/cn'
import { useReducedProcessMotion } from './useReducedProcessMotion'

/** Clearly a placeholder, never a guessed image or guessed waveform. */
export function GenerationWaitingSurface({ audio = false, previewUrl, previewLabel, percent }: {
  audio?: boolean
  previewUrl?: string
  previewLabel: string
  percent?: number
}): JSX.Element {
  const reduced = useReducedProcessMotion()
  const sheen = React.useRef<HTMLDivElement>(null)
  const [frame, setFrame] = React.useState<string>()
  React.useEffect(() => {
    if (reduced || frame) return
    const animation = sheen.current?.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(100%)' }], { duration: 2400, iterations: Infinity })
    return () => animation?.cancel()
  }, [reduced, frame])
  const acceptFrame = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const element = event.currentTarget
    if (reduced) { setFrame(previewUrl); return }
    const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'forwards' })
    animation.onfinish = () => { if (element.isConnected) setFrame(previewUrl) }
  }
  return (
    <div data-generation-waiting data-process-motion={reduced ? 'reduced' : 'full'}
      className="absolute inset-0 overflow-hidden rounded-nomi bg-nomi-ink-05 pointer-events-none">
      {!frame ? <div ref={sheen} data-process-sheen className="absolute inset-0 bg-[linear-gradient(105deg,transparent_30%,var(--nomi-accent-soft)_50%,transparent_70%)]" /> : null}
      {audio ? <div data-process-audio-waiting className="absolute inset-x-4 top-1/2 flex h-8 -translate-y-1/2 items-center justify-center gap-1" aria-hidden>
        {Array.from({ length: 24 }, (_, index) => <span key={index} className="h-6 w-1 shrink-0 rounded-full bg-nomi-ink-30" />)}
      </div> : null}
      {frame ? <img src={frame} alt="" className="absolute inset-0 size-full object-contain" draggable={false} /> : null}
      {previewUrl && previewUrl !== frame ? <img key={previewUrl} src={previewUrl} alt="" onLoad={acceptFrame}
        className="absolute inset-0 size-full object-contain opacity-0" draggable={false} /> : null}
      {frame ? <>
        <div data-process-preview-scrim className="absolute inset-0 bg-[var(--nomi-scrim)]" />
        <span className="absolute bottom-3 left-3 rounded-full bg-[var(--nomi-overlay-chip)] px-3 py-1 text-body text-nomi-media-ink">{previewLabel}</span>
      </> : null}
      {percent !== undefined ? <div data-process-progress className="absolute inset-x-0 bottom-0 h-1 bg-nomi-ink-10">
        <div className={cn('h-full bg-nomi-accent', !reduced && 'transition-[width] duration-200')} style={{ width: `${percent}%` }} />
      </div> : null}
    </div>
  )
}
