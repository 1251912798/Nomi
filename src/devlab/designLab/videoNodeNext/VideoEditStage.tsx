// 实验室交互编排：真实视频/选段预览，分析与输出为临时演示数据，不接 IPC 或项目落盘。
import React from 'react'
import { IconCamera, IconCheck, IconPlayerPause, IconPlayerPlay, IconX, IconVolume, IconVolumeOff, IconAdjustmentsHorizontal, IconArrowBackUp } from '@tabler/icons-react'
import { WorkbenchButton, WorkbenchIconButton, NomiLoadingMark } from '../../../design'
import { NomiSegmented } from '../../../design/NomiSegmented'
import { NomiImage } from '../../../design/media'
import { evenFrameSeconds } from '../../../workbench/generationCanvas/nodes/shotCutSelection'
import { frameTimecode } from '../../../workbench/generationCanvas/nodes/frameTimecode'
import { holdDesignLabReady } from '../labReadyHold'
import { LabStage, NextVideoToolbar, useLocaleHold, useSeededSource, videoSourceNode } from './videoNodeNextToolbarKit'
import type { VnLocale } from './videoNodeNextCopy'
import { EditFilmstrip } from './videoEditFilmstrip'
import { VIDEO, THUMBS } from './videoNodeNextFixtures'

const INK = 'text-nomi-media-ink hover:text-nomi-media-ink hover:bg-nomi-media-ink/20 shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-nomi-media-ink'
const SEGMENTS = [{ start: 0, end: 1.3 }, { start: 1.3, end: 3.1 }, { start: 3.1, end: 5 }]
type Segment = { start: number; end: number }
type Output = Segment & { id: number; type: 'image' | 'video'; image: string }
type Phase = 'idle' | 'analyzing' | 'review' | 'running' | 'error' | 'empty' | 'partial' | 'unavailable'
export type EditInitial = 'capture' | 'capture-done' | 'capture-error' | 'open' | 'selected' | 'preview' | 'done' | 'running' | 'error' | 'analyzing' | 'review' | 'split-done' | 'empty' | 'partial' | 'unavailable' | 'loading' | 'capped'
type Props = { locale: VnLocale; initial?: EditInitial; mode?: 'image' | 'video'; narrow?: boolean; zoom?: number }
const thumb = (seconds: number): string => THUMBS[Math.min(7, Math.floor(seconds / 5 * 8))] ?? THUMBS[0]!
const seed = (segments: Segment[], type: Output['type']): Output[] => segments.map((segment, id) => ({ ...segment, id, type, image: thumb(segment.start) }))

export function VideoEditStage({ locale, initial = 'open', mode: initialMode = 'video', narrow = false, zoom = 1 }: Props): React.JSX.Element {
  const zh = locale === 'zh-CN'
  const c = (cn: string, en: string): string => zh ? cn : en
  const node = React.useMemo(() => ({ ...videoSourceNode(locale), title: zh ? '雨中来客' : 'Visitor in the rain' }), [locale, zh])
  const seeded = useSeededSource(node)
  const localeReady = useLocaleHold(locale)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const readyRelease = React.useRef<(() => void) | null>(null)
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const serial = React.useRef(100)
  const [editing, setEditing] = React.useState(!initial.startsWith('capture') && !['done', 'split-done'].includes(initial))
  const [phase, setPhase] = React.useState<Phase>(initial === 'capped' ? 'review' : ['analyzing', 'review', 'running', 'error', 'empty', 'partial', 'unavailable'].includes(initial) ? initial as Phase : 'idle')
  const [ready, setReady] = React.useState(false)
  const [seeking, setSeeking] = React.useState(false)
  const [broken, setBroken] = React.useState(initial === 'unavailable')
  const [playing, setPlaying] = React.useState(false)
  const [muted, setMuted] = React.useState(true)
  const [time, setTime] = React.useState(initial.startsWith('capture') ? 2.2 : 1)
  const [duration, setDuration] = React.useState(5)
  const [range, setRange] = React.useState<Segment>(initial === 'open' ? { start: 0, end: 5 } : { start: 1, end: 4 })
  const [advanced, setAdvanced] = React.useState(false)
  const [mode, setMode] = React.useState(initialMode)
  const [sensitivity, setSensitivity] = React.useState('auto')
  const [uniform, setUniform] = React.useState(false)
  const [capped, setCapped] = React.useState(initial === 'capped')
  const [previewSegment, setPreviewSegment] = React.useState<Segment>(initialMode === 'image' ? SEGMENTS[1]! : SEGMENTS[0]!)
  const [selected, setSelected] = React.useState([0, 1, 2])
  const [progress, setProgress] = React.useState(48)
  const [captureError, setCaptureError] = React.useState(initial === 'capture-error')
  const [capturing, setCapturing] = React.useState(false)
  const [outputs, setOutputs] = React.useState<Output[]>(() => initial === 'done' ? seed([{ start: 1, end: 4 }], 'video') : initial === 'split-done' ? seed(SEGMENTS, initialMode) : initial === 'partial' ? seed([SEGMENTS[0]!], initialMode) : [])
  const [lastBatch, setLastBatch] = React.useState<number[]>([])
  const width = narrow ? 260 : 400
  const height = width * 9 / 16
  const left = 90
  const top = 200
  const busy = phase === 'analyzing' || phase === 'running'
  const enabled = ready && !broken && initial !== 'loading'
  const detected = sensitivity === 'low' ? [{ start: 0, end: 3.1 }, { start: 3.1, end: 5 }] : sensitivity === 'high' ? [{ start: 0, end: 1.3 }, { start: 1.3, end: 2.2 }, { start: 2.2, end: 3.1 }, { start: 3.1, end: 5 }] : SEGMENTS
  const available = capped ? detected.filter((segment) => segment.end <= 3.1) : detected
  const segments = uniform && mode === 'image' ? evenFrameSeconds(duration, 3).map((start) => ({ start, end: Math.min(duration, start + 0.1) })) : mode === 'video' ? available : detected.slice(1).filter((segment) => !capped || segment.start <= 3.1)
  const activeRange = phase === 'review' ? previewSegment : range
  const resultsStart = left + width * zoom + 70
  const resultWidth = outputs.length > 1 ? 210 : width

  const stopTimer = (): void => { if (timer.current) clearInterval(timer.current); timer.current = null }
  const pause = (): void => { videoRef.current?.pause(); setPlaying(false) }
  const seek = (seconds: number): void => {
    const video = videoRef.current
    if (!video || !ready) return
    pause(); video.currentTime = Math.max(0, Math.min(duration - 0.001, seconds)); setTime(seconds)
  }
  const cancel = (): void => { stopTimer(); setPhase('idle'); setProgress(0) }
  const close = (): void => { cancel(); pause(); setEditing(false); setAdvanced(false) }
  React.useLayoutEffect(() => {
    readyRelease.current = holdDesignLabReady('video-edit:real-media')
    return () => { readyRelease.current?.(); if (timer.current) clearInterval(timer.current) }
  }, [])
  React.useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { close(); document.querySelector<HTMLButtonElement>('[data-toolbar-action="trim"]')?.focus() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  const append = (items: Omit<Output, 'id'>[]): void => {
    const next = items.map((item) => ({ ...item, id: serial.current++ }))
    setOutputs((previous) => [...previous, ...next]); setLastBatch(next.map((item) => item.id))
  }
  const capture = (): void => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || video.seeking || capturing) return
    pause(); setCapturing(true)
    try {
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No canvas')
      context.drawImage(video, 0, 0)
      append([{ start: video.currentTime, end: video.currentTime, type: 'image', image: canvas.toDataURL('image/png') }]); setCaptureError(false)
    } catch { setCaptureError(true) }
    requestAnimationFrame(() => setCapturing(false))
  }
  const boundary = (edge: 'first' | 'last'): void => {
    const video = videoRef.current
    if (!video || !enabled || busy) return
    const seconds = edge === 'first' ? 0 : Math.max(0, duration - 0.1)
    if (Math.abs(video.currentTime - seconds) < 0.001) capture()
    else { video.addEventListener('seeked', capture, { once: true }); seek(seconds) }
  }
  const run = (nextPhase: 'analyzing' | 'running', done: () => void): void => {
    if (timer.current) return
    pause(); setPhase(nextPhase); setProgress(0);
    let value = 0
    timer.current = setInterval(() => {
      value += 10; setProgress(value)
      if (value >= 100) { stopTimer(); done() }
    }, 110)
  }
  const analyze = (nextSensitivity = sensitivity): void => { setUniform(false); setAdvanced(false); run('analyzing', () => { setPhase('review'); const first = mode === 'image' ? (nextSensitivity === 'low' ? SEGMENTS[2]! : SEGMENTS[1]!) : nextSensitivity === 'low' ? { start: 0, end: 3.1 } : SEGMENTS[0]!; setPreviewSegment(first); seek(first.start); setSelected([0, 1, 2, 3]) }) }
  const submit = (smart = false): void => {
    const chosen = smart ? segments.filter((_, index) => selected.includes(index)) : [range]
    if (!chosen.length || !enabled || busy) return
    const type = smart ? mode : 'video'
    run('running', () => { append(chosen.map((item) => ({ ...item, type, image: thumb(item.start) }))); setPhase('idle'); setEditing(false) })
  }
  const retry = (): void => {
    if (phase === 'partial') run('running', () => { append(SEGMENTS.slice(1).map((item) => ({ ...item, type: mode, image: thumb(item.start) }))); setPhase('idle'); setEditing(false) })
    else if (phase === 'unavailable') { setPhase('idle'); setBroken(false); videoRef.current?.load() }
    else submit(false)
  }
  const changeRange = (edge: 'start' | 'end', seconds: number): void => {
    if (!Number.isFinite(seconds)) return
    const value = Math.round(Math.max(edge === 'start' ? 0 : range.start + 0.1, Math.min(edge === 'start' ? range.end - 0.1 : duration, seconds)) * 10) / 10
    setRange((previous) => ({ ...previous, [edge]: value })); seek(value)
  }
  const togglePlay = (): void => {
    const video = videoRef.current
    if (!video) return
    if (!video.paused) { pause(); return }
    if (editing && (video.currentTime < activeRange.start || video.currentTime >= activeRange.end)) video.currentTime = activeRange.start
    void video.play().catch(() => { setBroken(true); setPhase('unavailable') })
  }
  React.useEffect(() => {
    if (!playing || !editing) return
    let frame = 0
    const tick = (): void => {
      if (videoRef.current && videoRef.current.currentTime >= activeRange.end) pause()
      else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, editing, activeRange.end])

  return <LabStage width={Math.max(980, resultsStart + Math.max(0, outputs.length * (resultWidth + 28) - 28) + 20)} height={phase === 'review' ? (advanced || capped ? 1080 : 900) : 760} zoom={zoom}>
    <div className="absolute inset-0" onPointerDown={(event) => { if (event.target === event.currentTarget && editing) close() }} data-video-edit-exploration>
      <span className="absolute left-5 top-4 text-caption text-nomi-ink-40">{c('交互样张 · 真实视频预览，分析与输出为演示', 'Interactive study · real preview, simulated analysis and outputs')}</span>
      <div className="group/node absolute z-10" data-frame-source data-edit-source style={{ left, top, width, height, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
        {seeded && localeReady ? <NextVideoToolbar node={node} locale={locale} onTrim={() => { if (editing) submit(); else { pause(); setEditing(true); cancel() } }} trimActive={editing} captureDisabled={!enabled || busy || seeking} onBoundaryCapture={boundary} onShotCuts={() => { setEditing(true); analyze() }} /> : null}
        <span className="absolute -top-7 left-0 max-w-full truncate text-caption text-nomi-ink-60">{node.title}</span>
        <div className="relative h-full w-full overflow-hidden rounded-nomi bg-nomi-ink-05 shadow-nomi-md ring-1 ring-nomi-accent">
          <video ref={videoRef} src={VIDEO} playsInline muted={muted} preload="auto" className="h-full w-full object-contain"
            onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration); event.currentTarget.currentTime = initial.startsWith('capture') ? 2.2 : initial === 'open' ? 0 : initial === 'review' || initial === 'capped' ? previewSegment.start : 1 }}
            onLoadedData={() => { setReady(true); if (initial === 'preview') void videoRef.current?.play().catch(() => setPlaying(false)); readyRelease.current?.() }} onSeeking={() => setSeeking(true)} onSeeked={() => { setSeeking(false); if (initial === 'capture-done' && serial.current === 100) capture() }}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
            onError={() => { setBroken(true); setPhase('unavailable'); readyRelease.current?.() }} />
          {initial === 'loading' && <div role="status" className="absolute inset-0 grid place-content-center bg-nomi-media-veil/60 text-nomi-media-ink"><NomiLoadingMark size={24} /><span className="mt-2 text-caption">{c('正在读取视频', 'Loading video')}</span></div>}
          <WorkbenchIconButton className={`absolute left-2 top-2 bg-nomi-overlay-chip ${INK}`} icon={muted ? <IconVolumeOff /> : <IconVolume />} label={c(muted ? '取消静音' : '静音', muted ? 'Unmute' : 'Mute')} onClick={() => setMuted(!muted)} />
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-nomi-media-veil to-transparent px-2 pb-2 pt-8 text-nomi-media-ink" data-frame-controls style={{ width: `${zoom * 100}%`, transform: `scale(${1 / zoom})`, transformOrigin: 'bottom left' }}>
            <WorkbenchIconButton icon={playing ? <IconPlayerPause /> : <IconPlayerPlay />} label={c(playing ? '暂停' : '播放', playing ? 'Pause' : 'Play')} className={INK} onClick={togglePlay} disabled={!enabled || busy} />
            {!narrow && zoom === 1 && <span className="text-caption tabular-nums" data-frame-time>{frameTimecode(time)}</span>}
            <input type="range" aria-label={c('播放进度', 'Playback position')} min={editing ? activeRange.start : 0} max={editing ? activeRange.end : duration} step={0.01} value={Math.max(editing ? activeRange.start : 0, Math.min(editing ? activeRange.end : duration, time))} className="h-5 min-w-0 flex-1 cursor-pointer accent-nomi-media-ink" disabled={!enabled || busy} onChange={(event) => seek(Number(event.target.value))} />
            {!narrow && zoom === 1 && <span className="text-caption tabular-nums">{frameTimecode(duration)}</span>}
            <WorkbenchIconButton icon={capturing ? <NomiLoadingMark size={16} /> : <IconCamera />} label={c('截取当前帧', 'Capture current frame')} className={INK} disabled={!enabled || busy || capturing || seeking} onClick={capture} data-frame-capture />
          </div>
        </div>
        <div style={{ width, transform: `scale(${1 / zoom})`, transformOrigin: 'top left', marginTop: 14 / zoom }}>
          {editing ? <section aria-label={c('剪辑', 'Trim')} data-edit-panel className="relative space-y-2">
            <div className="flex flex-col gap-2">
              <EditFilmstrip thumbs={THUMBS} duration={duration} range={activeRange} time={time} disabled={!enabled || busy || phase === 'review'} locale={locale} onChange={changeRange} onSeek={seek} />
            </div>
            {busy && <div className="flex items-center justify-end gap-1" role="status"><span className="text-caption text-nomi-ink-60">{phase === 'analyzing' ? c('正在分析', 'Analyzing') : c('正在处理', 'Processing')} {progress}%</span><WorkbenchIconButton icon={<IconX />} label={c('取消处理', 'Cancel processing')} onClick={cancel} /></div>}
            {busy && <progress className="h-1 w-full accent-nomi-accent" max={100} value={progress} aria-label={c('处理进度', 'Processing progress')} />}
            {phase === 'review' && <div className="space-y-3 rounded-nomi border border-nomi-line bg-nomi-paper p-3 shadow-nomi-sm" data-shot-review>
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-caption text-nomi-ink-60">{c('选择保留的镜头', 'Choose shots to keep')}</span><WorkbenchIconButton icon={<IconAdjustmentsHorizontal />} label={c('检测设置', 'Detection settings')} onClick={() => setAdvanced(!advanced)} /></div>
              <NomiSegmented value={mode} options={[{ value: 'video', label: c('视频片段', 'Video clips') }, { value: 'image', label: c('镜头图片', 'Shot images') }]} onChange={(value) => { setMode(value as 'image' | 'video'); setUniform(false); setPreviewSegment(detected[value === 'image' ? 1 : 0]!); seek(detected[value === 'image' ? 1 : 0]!.start); setSelected([0, 1, 2, 3]) }} ariaLabel={c('输出类型', 'Output type')} density="compact" />
              {capped && <div role="status" className="space-y-2 text-caption text-nomi-ink-60"><p>{c('已分析 0:00–0:03.1，后续 1.9 秒尚未分析', 'Analyzed 0:00–0:03.1. The remaining 1.9s is not covered.')}</p><WorkbenchButton size="sm" onClick={() => { setCapped(false); analyze() }}>{c('继续分析', 'Analyze remaining footage')}</WorkbenchButton></div>}
              {advanced && <div className="space-y-2"><span className="text-caption text-nomi-ink-60">{c('检测灵敏度', 'Detection sensitivity')}</span><NomiSegmented value={sensitivity} options={[{ value: 'auto', label: c('自动', 'Auto') }, { value: 'low', label: c('较少', 'Fewer') }, { value: 'high', label: c('较多', 'More') }]} onChange={(value) => { setSensitivity(value); analyze(value) }} ariaLabel={c('灵敏度', 'Sensitivity')} density="compact" /></div>}
              <div className="grid grid-cols-3 gap-2">{segments.map((segment, index) => <button key={segment.start} type="button" aria-pressed={selected.includes(index)} onClick={() => { setSelected((previous) => previous.includes(index) ? previous.filter((v) => v !== index) : [...previous, index]); setPreviewSegment(segment); seek(segment.start) }} className={`relative overflow-hidden rounded-nomi-sm border-2 text-left ${selected.includes(index) ? 'border-nomi-accent' : 'border-nomi-line opacity-60'}`} data-shot-choice={index}><NomiImage src={thumb(segment.start)} alt="" className="aspect-video w-full object-cover" /><span className="block px-1 py-1 text-micro tabular-nums text-nomi-ink-60">{frameTimecode(segment.start)}{mode === 'video' ? `–${frameTimecode(segment.end)}` : ''}</span>{selected.includes(index) && <IconCheck className="absolute right-1 top-1 rounded-full bg-nomi-accent text-nomi-paper" size={16} />}</button>)}</div>
              <div className="flex flex-wrap items-center justify-between gap-2"><WorkbenchButton size="sm" onClick={() => setSelected(selected.filter((index) => index < segments.length).length >= segments.length ? [] : segments.map((_, i) => i))}>{selected.filter((index) => index < segments.length).length >= segments.length ? c('取消全选', 'Deselect all') : c('全选', 'Select all')}</WorkbenchButton><WorkbenchButton size="sm" disabled={!selected.some((index) => index < segments.length)} onClick={() => submit(true)} data-split-confirm>{c('生成', 'Create')} {selected.filter((index) => index < segments.length).length} {mode === 'video' ? c('段视频', 'clips') : c('张图片', 'images')}</WorkbenchButton></div>
            </div>}
            {['error', 'partial', 'unavailable', 'empty'].includes(phase) && <div role="alert" className="space-y-2 rounded-nomi border border-nomi-line bg-nomi-paper p-3 text-caption text-nomi-ink-60">
              <p>{phase === 'empty' ? c('没有检测到镜头切换', 'No scene changes detected') : phase === 'partial' ? c('已完成 1 段，另 2 段未完成', '1 clip ready; 2 could not be created') : phase === 'unavailable' ? c('视频暂时无法读取', 'Video could not be loaded') : c('剪辑未完成，选区已保留', 'Trim failed. Your range is preserved.')}</p>
              {phase === 'empty' ? <div className="flex flex-wrap gap-2"><WorkbenchButton size="sm" onClick={() => { setSensitivity('high'); analyze('high') }}>{c('放宽检测', 'Broaden detection')}</WorkbenchButton><WorkbenchButton size="sm" onClick={() => { setMode('image'); setUniform(true); setPhase('review'); setPreviewSegment({ start: evenFrameSeconds(duration, 3)[0]!, end: evenFrameSeconds(duration, 3)[0]! + 0.1 }); seek(evenFrameSeconds(duration, 3)[0]!); setSelected([0, 1, 2]) }}>{c('均匀抽帧', 'Extract evenly spaced frames')}</WorkbenchButton></div> : <WorkbenchButton size="sm" onClick={retry}>{phase === 'partial' ? c('重试未完成片段', 'Retry remaining clips') : c('重试', 'Retry')}</WorkbenchButton>}
            </div>}
          </section> : null}
          {!editing && broken && <div role="alert" className="mt-3 flex items-center gap-2 text-caption text-nomi-ink-60"><span>{c('视频暂时无法读取', 'Video could not be loaded')}</span><WorkbenchButton size="sm" onClick={retry}>{c('重新加载', 'Reload video')}</WorkbenchButton></div>}
          {captureError && <div role="alert" className="mt-3 flex items-center gap-2 text-caption text-nomi-ink-60"><span>{c('截帧失败', 'Capture failed')}</span><WorkbenchButton size="sm" onClick={capture}>{c('重试', 'Retry')}</WorkbenchButton></div>}
          {lastBatch.length > 0 && <WorkbenchButton size="sm" className="mt-3" onClick={() => { setOutputs((previous) => previous.filter((output) => !lastBatch.includes(output.id))); setLastBatch([]) }}><IconArrowBackUp size={15} />{c('撤销', 'Undo')}</WorkbenchButton>}
        </div>
      </div>
      {outputs.map((output, index) => <React.Fragment key={output.id}>
        <svg className="pointer-events-none absolute inset-0 h-full w-full text-nomi-ink-30" aria-hidden><path d={`M ${left + width * zoom} ${top + height * zoom / 2} C ${resultsStart - 30} ${top + height * zoom / 2}, ${resultsStart + index * (resultWidth + 28) - 30} ${top + resultWidth * 9 / 32}, ${resultsStart + index * (resultWidth + 28)} ${top + resultWidth * 9 / 32}`} fill="none" stroke="currentColor" strokeWidth={1.5} /></svg>
        <div className="absolute z-10" style={{ left: resultsStart + index * (resultWidth + 28), top, width: resultWidth }} data-edit-result data-frame-result={output.type === 'image' ? true : undefined} data-captured-seconds={output.start} data-start={output.start} data-end={output.end} data-type={output.type}>
          <span className="absolute -top-7 left-0 text-caption text-nomi-ink-60">{output.type === 'image' ? c('截帧', 'Frame') : c('剪辑结果', 'Trimmed clip')} · {output.type === 'image' ? frameTimecode(output.start) : `${(output.end - output.start).toFixed(1)}s`}</span>
          <div className="aspect-video overflow-hidden rounded-nomi bg-nomi-ink-05 shadow-nomi-md ring-1 ring-nomi-line">
            {output.type === 'image' ? <NomiImage eager src={output.image} alt={`${c('截帧', 'Frame')} ${frameTimecode(output.start)}`} className="h-full w-full object-cover" /> : <DerivedClip output={output} locale={locale} />}
          </div>
        </div>
      </React.Fragment>)}
    </div>
  </LabStage>
}

// 结果仍用源文件做选段预览：控制条只暴露所选区间，不冒充已导出的媒体。
function DerivedClip({ output, locale }: { output: Output; locale: VnLocale }): React.JSX.Element {
  const ref = React.useRef<HTMLVideoElement>(null)
  const [at, setAt] = React.useState(output.start)
  const [playing, setPlaying] = React.useState(false)
  const length = output.end - output.start
  React.useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = (): void => {
      const video = ref.current
      if (!video) return
      setAt(video.currentTime)
      if (video.currentTime >= output.end) { video.pause(); video.currentTime = output.start }
      else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, output.start, output.end])
  return <div className="relative h-full w-full">
    <video ref={ref} src={VIDEO} poster={output.image} muted playsInline preload="auto" className="h-full w-full object-contain" onLoadedMetadata={(event) => { event.currentTarget.currentTime = output.start }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => setAt(event.currentTarget.currentTime)} />
    <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-nomi-media-veil to-transparent px-1 pb-1 pt-4 text-nomi-media-ink">
      <WorkbenchIconButton className={INK} label={locale === 'zh-CN' ? playing ? '暂停片段' : '播放片段' : playing ? 'Pause clip' : 'Play clip'} icon={playing ? <IconPlayerPause /> : <IconPlayerPlay />} onClick={() => { const v = ref.current; if (!v) return; if (!v.paused) v.pause(); else { if (v.currentTime >= output.end) v.currentTime = output.start; void v.play().catch(() => setPlaying(false)) } }} />
      <input type="range" min={output.start} max={output.end} step={0.01} value={at} aria-label={locale === 'zh-CN' ? '片段播放进度' : 'Clip playback position'} className="h-5 min-w-0 flex-1 accent-nomi-media-ink" onChange={(event) => { if (ref.current) { ref.current.pause(); ref.current.currentTime = Number(event.target.value); setAt(Number(event.target.value)) } }} />
      <span className="text-micro tabular-nums">{length.toFixed(1)}s</span>
    </div>
  </div>
}
