import React from 'react'
import { useTranslation } from 'react-i18next'

// 原生 range 提供鼠标、触控、方向键/Home/End；领域选区约束由宿主统一处理。
const HANDLE = 'pointer-events-none absolute left-0 top-0 m-0 h-14 w-full appearance-none bg-transparent outline-none [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-14 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-transparent [&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-nomi-ink disabled:[&::-webkit-slider-thumb]:cursor-default'
export function VideoTrimFilmstrip({ children, duration, range, time, disabled, labels, onChange, onSeek }: {
  children: React.ReactNode; duration: number; range: { start: number; end: number }; time: number; disabled: boolean; labels: { seek: string; start: string; end: string }
  onChange: (edge: 'start' | 'end', value: number) => void; onSeek: (value: number) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const seconds = (value: number, digits = 1) => t('generationCommon.videoTrim.seconds', { value: value.toFixed(digits) })
  const root = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(340)
  React.useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el); setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])
  const start = 14 + range.start / duration * (width - 28)
  const end = 14 + range.end / duration * (width - 28)
  return <div ref={root} className="relative h-14 w-full min-w-0 shrink-0" data-edit-filmstrip>
    <button type="button" disabled={disabled} aria-label={labels.seek} className="absolute inset-0 flex overflow-hidden rounded-nomi-sm bg-nomi-ink-10" onPointerDown={(event) => { if (disabled) return; event.currentTarget.setPointerCapture(event.pointerId); const box = event.currentTarget.getBoundingClientRect(); onSeek(Math.max(range.start, Math.min(range.end, (event.clientX - box.left - 14) / (box.width - 28) * duration))) }} onPointerMove={(event) => { if (event.buttons === 1 && event.currentTarget.hasPointerCapture(event.pointerId)) { const box = event.currentTarget.getBoundingClientRect(); onSeek(Math.max(range.start, Math.min(range.end, (event.clientX - box.left - 14) / (box.width - 28) * duration))) } }} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); onSeek(Math.max(range.start, Math.min(range.end, time + (event.key === 'ArrowRight' ? 0.1 : -0.1)))) } }}>
      {children}
    </button>
    <div className="pointer-events-none absolute inset-y-0 left-0 rounded-l-nomi-sm bg-nomi-media-veil/60" style={{ width: start }} />
    <div className="pointer-events-none absolute inset-y-0 right-0 rounded-r-nomi-sm bg-nomi-media-veil/60" style={{ width: width - end }} />
    <div className="pointer-events-none absolute inset-y-0 border-y border-nomi-media-ink" style={{ left: start, width: end - start }} />
    <span className="pointer-events-none absolute inset-y-1 w-px bg-nomi-accent" style={{ left: 14 + time / duration * (width - 28) }} />
    {[start, end].map((left, index) => <span key={index} className="pointer-events-none absolute inset-y-0 w-1.5 -translate-x-1/2 rounded-nomi-sm bg-nomi-media-ink" style={{ left }} data-trim-grip={index === 0 ? 'start' : 'end'} />)}
    {(['start', 'end'] as const).map((edge) => <input key={edge} type="range" min={0} max={duration} step={0.1} value={range[edge]} disabled={disabled} aria-label={labels[edge]} aria-valuetext={seconds(range[edge])} className={HANDLE} onChange={(event) => onChange(edge, Number(event.target.value))} data-trim-handle={edge} />)}
    <span className="pointer-events-none absolute top-3 z-10 -translate-x-1/2 rounded-nomi-sm bg-nomi-overlay-chip px-2 py-1 text-caption tabular-nums text-nomi-media-ink" style={{ left: (start + end) / 2 }} data-selection-duration>{seconds(range.end - range.start, 2)}</span>
  </div>
}
