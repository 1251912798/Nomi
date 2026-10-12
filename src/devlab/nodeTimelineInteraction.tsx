// exploration: production toolbar components with an isolated, in-memory interaction model.
// This entry is separate from index.html and does not participate in the application build.
import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { IconArrowBackUp, IconMoonStars, IconPhoto, IconSun, IconTimeline, IconVideo } from '@tabler/icons-react'
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/fraunces/wght.css'
import '../styles/index.css'
import '../workbench/generationCanvas/styles/generationCanvas.css'
import { NomiAppProviders } from '../NomiAppProviders'
import { NomiColorSchemeProvider } from '../theme/NomiColorSchemeProvider'
import { useNomiColorScheme } from '../theme/colorScheme'
import i18n from '../i18n'
import { LabCanvasViewport } from './designLab/labCanvasViewport'
import ImageQuickActionsToolbar from '../workbench/generationCanvas/quickActions/ImageQuickActionsToolbar'
import { TOOLBAR_ICON } from '../workbench/generationCanvas/nodes/NodeFloatingToolbar'
import NodeResultDownloadButton from '../workbench/generationCanvas/nodes/NodeResultDownloadButton'
import { NodeVideoSessionProvider } from '../workbench/generationCanvas/nodes/NodeVideoSession'
import { useNodeVideoSession } from '../workbench/generationCanvas/nodes/useNodeVideoSession'
import { installCatalogBridge } from './designLab/nodeComposerBar/nodeComposerBarLabKit'
import { useGenerationCanvasStore } from '../workbench/generationCanvas/store/generationCanvasStore'
import type { GenerationCanvasNode } from '../workbench/generationCanvas/model/generationCanvasTypes'
import { cn } from '../utils/cn'

const IMAGE = '/docs/design-explorations/node-timeline-media/frame.png'
const VIDEO = '/tests/ux/fixtures/real-shot-640x360.mp4'
const MIME = 'application/x-nomi-timeline-exploration'
type Kind = 'image' | 'video'
type Clip = { id: number; kind: Kind; start: number; duration: number }
const nodes: Record<Kind, GenerationCanvasNode> = {
  image: { id: 'preview-image', kind: 'image', title: '画面 01', categoryId: 'shots', position: { x: 0, y: 0 }, status: 'success', result: { id: 'image-1', type: 'image', url: IMAGE, createdAt: 1 } },
  video: { id: 'preview-video', kind: 'video', title: '镜头 02', categoryId: 'shots', position: { x: 0, y: 0 }, status: 'success', result: { id: 'video-1', type: 'video', url: VIDEO, createdAt: 1, durationSeconds: 5 } },
}
const noop = () => undefined
const icon = { size: TOOLBAR_ICON.size, stroke: TOOLBAR_ICON.stroke }

function VideoPreview({ select }: { select: () => void }) {
  const session = useNodeVideoSession()
  return <video ref={session.setPlayer} src={VIDEO} poster={IMAGE} controls playsInline className="h-full w-full object-cover" onPointerDown={(event) => { event.stopPropagation(); select() }} onFocus={select} />
}

function MediaCard({ kind, selected, select, append, onDragging }: { kind: Kind; selected: boolean; select: () => void; append: (kind: Kind) => void; onDragging: (kind: Kind | null) => void }) {
  const node = nodes[kind]
  const card = <div data-preview-node={kind} className="group/node relative w-[340px] max-w-[calc(100vw-48px)] shrink-0" onPointerDown={select}
    onClickCapture={(event) => {
      if (!(event.target as Element).closest('[data-toolbar-action="add-to-timeline"]')) return
      event.preventDefault(); event.stopPropagation(); append(kind)
    }}
    onDragStartCapture={(event) => {
      if (!(event.target as Element).closest('[data-toolbar-action="add-to-timeline"]')) return
      event.stopPropagation(); event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(MIME, kind); onDragging(kind)
    }}
    onDragEnd={() => onDragging(null)}>
    {selected ? kind === 'image' ? <ImageQuickActionsToolbar reportFeedback={noop} node={node} editGrid={null} imageOpBusy={false} onGridSplit={noop} onCrop={noop} onTransform={noop} onRemoveBackground={noop} onPreview={noop} onOpenProvenance={noop} onQuickAction={noop} /> : <NodeResultDownloadButton reportFeedback={noop} node={node} selected onPreview={noop} onOpenProvenance={noop} /> : null}
    <div className={cn('relative aspect-video overflow-hidden rounded-nomi bg-nomi-ink-05 shadow-nomi-md ring-1 ring-nomi-line')}>
      {kind === 'image' ? <img src={IMAGE} draggable={false} alt="图片节点" className="h-full w-full object-cover" /> : <VideoPreview select={select} />}
    </div>
    <div className="mt-2 flex items-center gap-1.5 text-body-sm text-nomi-ink-60">{kind === 'image' ? <IconPhoto {...icon} /> : <IconVideo {...icon} />}<span>{node.title}</span></div>
  </div>
  return kind === 'video' ? <NodeVideoSessionProvider node={node} writable>{card}</NodeVideoSessionProvider> : card
}

function App() {
  const { isDark, toggleColorScheme } = useNomiColorScheme()
  const [selected, setSelected] = useState<Kind>('image')
  const [clips, setClips] = useState<Clip[]>([])
  const [history, setHistory] = useState<Clip[][]>([])
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState<Kind | null>(null)
  const [dropTime, setDropTime] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [english, setEnglish] = useState(false)
  const nextId = useRef(0)
  const tracks = useRef<HTMLDivElement>(null)
  const en = (zh: string, eng: string) => english ? eng : zh
  useEffect(() => { installCatalogBridge(); useGenerationCanvasStore.setState({ nodes: Object.values(nodes), edges: [], selectedNodeIds: [nodes.image.id] }); void i18n.changeLanguage('zh-CN') }, [])
  useEffect(() => { if (!message) return; const timeout = window.setTimeout(() => setMessage(''), 2600); return () => window.clearTimeout(timeout) }, [message])
  const add = (kind: Kind, start?: number) => {
    setHistory((old) => [...old, clips])
    const end = Math.max(0, ...clips.map((clip) => clip.start + clip.duration))
    setClips((old) => [...old, { id: ++nextId.current, kind, start: start ?? end, duration: kind === 'image' ? 3 : 5 }])
    setOpen(true); setDropTime(null); setDragging(null)
    setMessage(start === undefined ? en('已加入时间轴末尾', 'Added to end of timeline') : en('已加入时间轴指定位置', 'Added at selected position'))
  }
  const undo = () => { if (!history.length) return; setClips(history[history.length - 1]); setHistory((old) => old.slice(0, -1)); setMessage(en('已撤销', 'Undone')) }
  const timeAt = (clientX: number) => Math.max(0, Math.round((clientX - (tracks.current?.getBoundingClientRect().left ?? 0) - 80) / 60 * 2) / 2)
  return <div className="flex h-screen min-h-[640px] flex-col overflow-hidden bg-nomi-paper font-sans text-nomi-ink">
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-nomi-line px-6">
      <div className="flex items-center gap-4"><span className="font-serif text-xl">Nomi</span><span className="text-body-sm text-nomi-ink-60">{en('生成画布', 'Canvas')}</span></div>
      <div className="flex items-center gap-3"><span className="text-micro text-nomi-ink-40">{en('交互预览', 'Interaction preview')} · exploration</span><button className="rounded-nomi-sm px-2 py-1 text-body-sm hover:bg-nomi-ink-05" onClick={() => { const next = !english; setEnglish(next); void i18n.changeLanguage(next ? 'en' : 'zh-CN') }}>中 / EN</button><button className="rounded-nomi-sm p-2 hover:bg-nomi-ink-05" aria-label={en('切换明暗', 'Toggle theme')} onClick={toggleColorScheme}>{isDark ? <IconSun {...icon} /> : <IconMoonStars {...icon} />}</button></div>
    </header>
    <main className="generation-canvas-v2__stage group/canvas relative flex min-h-0 flex-1 items-center justify-center overflow-auto" style={{ position: 'relative', inset: 'auto', height: 'auto' }} onPointerDown={(event) => { if (event.target === event.currentTarget) setMessage('') }}>
      <LabCanvasViewport><div className="flex flex-wrap items-center justify-center gap-x-24 gap-y-32 px-6 pb-8 pt-28">
        {(['image', 'video'] as const).map((kind) => <MediaCard key={kind} kind={kind} selected={selected === kind} select={() => setSelected(kind)} append={(next) => add(next)} onDragging={setDragging} />)}
      </div></LabCanvasViewport>
      {message ? <div role="status" className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-nomi border border-nomi-line bg-nomi-paper px-4 py-2 text-body-sm shadow-nomi-md">{message}</div> : null}
    </main>
    <section className="shrink-0 border-t border-nomi-line bg-nomi-paper" onDragOver={(event) => { if (dragging) { event.preventDefault(); setOpen(true) } }}>
      <div className="flex h-12 items-center justify-between px-5"><button aria-expanded={open} className="flex items-center gap-2 text-body-sm" onClick={() => setOpen((value) => !value)}><IconTimeline {...icon} /><span>{en('时间轴', 'Timeline')}</span><span className="text-nomi-ink-40">{clips.length} {en('段', 'clips')} · {Math.max(0, ...clips.map((clip) => clip.start + clip.duration))}s</span></button><div className="flex items-center gap-2"><button aria-label={en('撤销', 'Undo')} title={en('撤销', 'Undo')} disabled={!history.length} className="rounded-nomi-sm p-2 hover:bg-nomi-ink-05 disabled:opacity-30" onClick={undo}><IconArrowBackUp {...icon} /></button><button className="px-2 text-body-sm text-nomi-ink-60 hover:text-nomi-ink" onClick={() => { setHistory([]); setClips([]); setOpen(false); setMessage('') }}>{en('重试', 'Reset')}</button></div></div>
      {open ? <div ref={tracks} data-preview-timeline className={cn('relative h-[190px] overflow-x-auto border-t border-nomi-line', dragging && 'bg-nomi-accent-soft')}
        onDragOver={(event) => { if (!dragging) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDropTime(timeAt(event.clientX)) }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTime(null) }}
        onDrop={(event) => { event.preventDefault(); const kind = event.dataTransfer.getData(MIME); if (kind === 'image' || kind === 'video') add(kind, timeAt(event.clientX)) }}>
        <div className="relative ml-20 h-8 min-w-[900px] border-b border-nomi-line text-micro text-nomi-ink-40">{Array.from({ length: 16 }, (_, i) => <span key={i} className="absolute top-2" style={{ left: i * 60 }}>{i}s</span>)}</div>
        {(['video', 'image'] as const).map((kind) => <div key={kind} className="relative flex h-[70px] min-w-[980px] border-b border-nomi-line"><div className="flex w-20 shrink-0 items-center justify-center gap-1.5 border-r border-nomi-line text-micro text-nomi-ink-60">{kind === 'image' ? <IconPhoto {...icon} /> : <IconVideo {...icon} />}{en(kind === 'image' ? '图片' : '视频', kind === 'image' ? 'Image' : 'Video')}</div><div className="relative flex-1">{clips.filter((clip) => clip.kind === kind).map((clip) => <div key={clip.id} data-preview-clip={kind} className="absolute top-2 h-[54px] overflow-hidden rounded-nomi-sm border border-nomi-line bg-nomi-ink-05" style={{ left: clip.start * 60, width: clip.duration * 60 }}><img alt="" src={IMAGE} className="h-full w-full object-cover opacity-80" /><span className="absolute inset-x-0 bottom-0 bg-nomi-paper/90 px-2 py-0.5 text-micro">{nodes[kind].title} · {clip.duration}s</span></div>)}</div></div>)}
        {dropTime !== null && dragging ? <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-nomi-accent" style={{ left: 80 + dropTime * 60 }}><span className="absolute left-1 top-0 rounded-nomi-sm bg-nomi-accent px-1.5 py-1 text-micro text-nomi-paper">{dropTime}s</span></div> : null}
        {!clips.length && !dragging ? <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 text-body-sm text-nomi-ink-40">{en('从工具栏加入图片或视频', 'Add an image or video from its toolbar')}</span> : null}
      </div> : null}
    </section>
  </div>
}

createRoot(document.getElementById('root')!).render(<NomiColorSchemeProvider><NomiAppProviders><App /></NomiAppProviders></NomiColorSchemeProvider>)
