// 聊天里的指向元素（NodePointer 板，2026-10-23 D2）：代表画布上的一个节点，长得和节点一样，点一下去节点。
//
// 一个零件三种密度（P2 是 P1 的窄屏 / 行内形态，不是第二套）：
//   card = P1 镜像小卡（标题行在框外、画面同节点比例、下面一行只读摘要）；
//   row  = P2 列表行（小缩略图 + 标题行 + 摘要 + 行尾状态图标）；
//   chip = P2 句中小标签（圆缩略图 + 镜号 + 名字，嵌在 Agent 的话里自然折行）。
// 节点的数据一样都不存：只订自己那一个节点（不随整个画布重渲），脸的判序在 nodePointerFace.ts；
// 标题行、制作小标、状态条、等待面都挂节点自己的那几个组件 / 函数。悬停两边同亮，一律中性样式（不许蓝色描边，蓝只留在转圈上）。
// 先不接进聊天：第②步只在设计实验室搭全状态，第③步（新付费卡）才有第一个宿主。
import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { IconAlertTriangle, IconCheck, IconClock, IconClockSearch, IconFocus2, IconLinkOff, IconLoader2, IconMessage, IconPlayerPause } from '@tabler/icons-react'
import { useOverlayEscape } from '../../../design'
import { cn } from '../../../utils/cn'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import { getGenerationNodeExecutionKind } from '../../generationCanvas/model/generationNodeKinds'
import { useGenerationCanvasStore } from '../../generationCanvas/store/generationCanvasStore'
import { selectCanvasNodeById } from '../../generationCanvas/store/canvasNodeGenerationIndex'
import { useNodeExternalHighlightStore } from '../../generationCanvas/store/nodeExternalHighlightStore'
import { getGenerationNodeIcon } from '../../generationCanvas/nodes/renderRegistry'
import { GenerationWaitingSurface } from '../../generationCanvas/nodes/GenerationWaitingSurface'
import { GenerationStatusBar } from '../../generationCanvas/nodes/GenerationStatusBar'
import { NodeCornerPill, ProductionShotCornerLabel } from '../../generationCanvas/nodes/ProductionShotPlaceholder'
import { productionShotCornerText, stoppedCopyOf, useProductionShotState } from '../../generationCanvas/nodes/productionShotCorner'
import { useGenerationFeedback } from '../../observability/useGenerationFeedback'
import type { GenerationFeedback } from '../../observability/generationFeedback'
import { NodeShotLabel, ShotNumberPill } from '../../generation/list/CanvasListLinks'
import { formatStoryboardShotLabel, isAutoStoryboardShotTitle, useStoryboardShotLabel } from '../../generation/list/storyboardLabels'
import { useModelLabels } from '../../generation/list/generationListModelLabels'
import { formatSeconds, readAspect, readDurationSeconds } from '../../generation/list/generationListMediaFacts'
import { isPortraitAspect, nodePointerAspect, nodePointerFace, nodePointerGroupVisible, nodePointerLocatable, nodePointerSummary, pointerHoverStack, type NodePointerFace } from './nodePointerFace'
import { useNodePointerStore } from './nodePointerStore'
import { returnToChat, revealNodeFromChat } from './revealNodeFromChat'

export type NodePointerSubject = Readonly<{
  nodeId: string
  /** 宿主手里的名字快照：节点不在画布上时（已删除 / 占位）靠它说是哪一镜。 */
  fallbackLabel?: Readonly<{ shot?: string; title?: string }>
  /** 宿主给的显式事实：这个节点被删了（删除事件 / 制作脱离记录）。不给就不说「已删除」（板 D4）。 */
  removed?: boolean
  /** 宿主给的这一镜结局（例如付费卡的「没有发出去」）。失败时印在摘要行；不给就照常印模型摘要。 */
  outcome?: string
}>

export type NodePointerDensity = 'card' | 'row' | 'chip'

type Translate = ReturnType<typeof useTranslation>['t']

/** 组里一格的画面槽固定 16:9（宽的贴满宽、竖的贴满高并居中）；单个竖版槽高固定、宽按真比例。 */
const SLOT_ASPECT = 16 / 9
const SIDE_SLOT_HEIGHT = 96

type PointerModel = {
  node: GenerationCanvasNode | undefined
  face: NodePointerFace
  /** 读屏 / 悬停提示用的名字：镜号 + 标题。 */
  name: string
  shotText: string | null
  title: string
  status: string | null
  summary: (form: 'card' | 'row' | 'side') => readonly string[]
  aspect: number
  portrait: boolean
}

/** 读一个指向元素要的全部事实：只订这一个节点（selectCanvasNodeById 走单次派生索引，对象不变就不重渲）。 */
function usePointerModel(subject: NodePointerSubject): PointerModel {
  const { t } = useTranslation()
  const node = useGenerationCanvasStore((state) => selectCanvasNodeById(state, subject.nodeId))
  const canvasReady = useGenerationCanvasStore((state) => state.isReady)
  const feedback = useGenerationFeedback(node)
  const production = useProductionShotState(node)
  const modelLabel = useModelLabels()
  const shotLabel = useStoryboardShotLabel(node)
  const face = nodePointerFace({ node, removed: subject.removed, canvasReady, feedback, productionState: production.state })
  const shotText = node ? (shotLabel ? formatStoryboardShotLabel(t, shotLabel) : null) : subject.fallbackLabel?.shot ?? null
  const rawTitle = node ? (shotLabel && isAutoStoryboardShotTitle(node.title, shotLabel.number) ? '' : node.title ?? '') : subject.fallbackLabel?.title ?? ''
  const title = rawTitle.trim()
  const aspectText = readAspect(node)
  const execution = node ? getGenerationNodeExecutionKind(node.kind) : undefined
  const durationSec = node && (execution === 'video' || execution === 'audio') ? readDurationSeconds(node) : null
  const resolution = typeof node?.meta?.resolution === 'string' ? node.meta.resolution : null
  const facts = { model: modelLabel(node), aspect: aspectText, duration: durationSec ? formatSeconds(durationSec) : null, resolution }
  return {
    node,
    face,
    name: [shotText, title].filter(Boolean).join(' ') || t('nodePointer.untitled'),
    shotText,
    title,
    status: faceStatusText(t, face),
    summary: (form) => nodePointerSummary(facts, form),
    aspect: aspectText ? nodePointerAspect(aspectSize(aspectText)) : SLOT_ASPECT,
    portrait: isPortraitAspect(aspectText),
  }
}

function aspectSize(aspect: string): { width: number; height: number } {
  const [width, height] = aspect.split(':').map(Number)
  return { width, height }
}

/** 读屏和悬停提示里的「状态」：都是节点自己那几句（制作小标 / 状态条原话 / 可找回 / 已停原因）。 */
function faceStatusText(t: Translate, face: NodePointerFace): string | null {
  switch (face.kind) {
    case 'removed': return t('nodePointer.deleted')
    case 'generating':
    case 'failed': return face.feedback.message
    case 'recoverable': return t('shotTable.status.recoverable')
    case 'production': return productionShotCornerText(t, face.state)?.text ?? null
    case 'stopped': return t(stoppedCopyOf(face.state.stoppedReason).message)
    default: return null
  }
}

/** 读屏念的名字。失败时宿主给的结局（例如「没有发出去」）也要念：它是「这一镜有没有发出去、钱有没有花」的事实，不只念节点自己的原因。 */
function ariaLabel(t: Translate, model: PointerModel, outcome?: string): string {
  if (model.face.kind === 'removed') return t('nodePointer.ariaDeleted', { name: model.name })
  if (model.face.kind === 'unavailable') return t('nodePointer.ariaUnavailable', { name: model.name })
  if (outcome && model.status) return t('nodePointer.ariaOutcome', { name: model.name, status: model.status, outcome })
  const status = outcome ?? model.status
  return status ? t('nodePointer.aria', { name: model.name, status }) : t('nodePointer.ariaPlain', { name: model.name })
}

/** 悬停 / 聚焦时把画布上那个节点点亮；离开、失焦、卸载只清自己点亮的那一下（同一节点被两个指向元素指着时不互相清）。 */
function useHoverLink(nodeId: string, enabled: boolean): { hot: boolean; on: () => void; off: () => void } {
  const owner = React.useId()
  const [hot, setHot] = React.useState(false)
  const on = React.useCallback(() => {
    setHot(true)
    if (enabled) useNodeExternalHighlightStore.getState().claimHover(nodeId, owner)
  }, [enabled, nodeId, owner])
  const off = React.useCallback(() => {
    setHot(false)
    useNodeExternalHighlightStore.getState().releaseHover(owner)
  }, [owner])
  React.useEffect(() => () => useNodeExternalHighlightStore.getState().releaseHover(owner), [owner])
  return { hot, on, off }
}

/** 标题行：节点在就挂节点自己的 NodeShotLabel（改名两边一起变）；节点不在就用宿主的名字快照（已删除划线）。 */
function PointerLabel({ model, narrow }: { model: PointerModel; narrow: boolean }): JSX.Element {
  const gone = model.face.kind === 'removed' || model.face.kind === 'unavailable'
  // 窄面板只留镜号（名字靠悬停提示）；没有镜号的节点照旧露名字。
  const hideTitle = narrow && Boolean(model.shotText)
  const titleNode = hideTitle || !model.title ? null : (
    <span className={cn('min-w-0 truncate font-semibold text-nomi-ink', gone && 'text-nomi-ink-40', model.face.kind === 'removed' && 'line-through')}>{model.title}</span>
  )
  return (
    <span className="flex h-[22px] min-w-0 items-center gap-1.5 text-caption" title={model.name}>
      {model.node && !gone
        ? <NodeShotLabel node={model.node}>{titleNode}</NodeShotLabel>
        : <>{model.shotText ? <ShotNumberPill className="text-nomi-ink-40">{model.shotText}</ShotNumberPill> : null}{titleNode}</>}
      {!model.shotText && !model.title ? <span className="min-w-0 truncate text-nomi-ink-60">{model.name}</span> : null}
    </span>
  )
}

/** 画面槽里的那一张脸。`thumb`（P2 的小缩略图）只留画面或等待面，状态交给行尾图标 / 边线。 */
function PointerFaceArt({ model, size, located }: { model: PointerModel; size: 'card' | 'cell' | 'thumb'; located: boolean }): JSX.Element | null {
  const { t } = useTranslation()
  const face = model.face
  if (size === 'thumb') {
    if (face.kind === 'result' && face.preview.kind === 'image') return <img src={face.preview.src} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />
    if (face.kind === 'generating' || face.kind === 'processing') return <GenerationWaitingSurface motion="reduced" previewLabel="" audio={model.node?.kind === 'audio'} />
    return null
  }
  const KindIcon = model.node ? getGenerationNodeIcon(model.node.kind) : null
  // 小标在指向元素上贴得更近（板：4px），样子与节点那一枚同一个组件。
  const corner = 'left-1 top-1 max-w-[calc(100%-8px)] px-1.5'
  // 空卡圆托：NodeEmptyState 那一组 token（ink-05 底 + line 细环 + ink-80 图标），按板缩到 28px。
  const circle = (icon: React.ReactNode, tone?: string) => (
    <span className={cn('absolute left-1/2 top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-nomi-ink-05 text-nomi-ink-80 ring-1 ring-inset ring-nomi-line', tone)} aria-hidden="true">{icon}</span>
  )
  const statusBar = (feedback: GenerationFeedback) => (
    <span className="absolute bottom-1 left-1 flex max-w-[calc(100%-8px)] [&_[data-generation-message]]:truncate [&_[data-generation-status]]:max-w-full [&_[data-generation-status]]:px-1.5 [&_[data-generation-status]]:py-0.5 [&_[data-generation-status]]:text-micro">
      <GenerationStatusBar feedback={feedback} overlay />
    </span>
  )
  let art: React.ReactNode = null
  switch (face.kind) {
    case 'result':
      art = face.preview.kind === 'image'
        ? <img src={face.preview.src} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />
        : KindIcon ? circle(<KindIcon size={14} stroke={1.6} />) : null
      break
    case 'generating':
    case 'processing':
      art = <><GenerationWaitingSurface motion="reduced" previewLabel="" audio={model.node?.kind === 'audio'} />{face.kind === 'generating' ? statusBar(face.feedback) : null}</>
      break
    case 'failed':
      art = <>{circle(<IconAlertTriangle size={14} stroke={1.6} />, 'text-nomi-danger-ink')}{statusBar(face.feedback)}</>
      break
    case 'recoverable':
      art = <>{circle(<IconClockSearch size={14} stroke={1.6} />, 'text-nomi-ink-60')}{size === 'card' && !located ? <NodeCornerPill label={t('shotTable.status.recoverable')} className={corner} /> : null}</>
      break
    case 'stopped':
      art = circle(<IconPlayerPause size={14} stroke={1.6} />, 'bg-nomi-paper text-nomi-warning')
      break
    case 'removed':
      art = <>{circle(<IconLinkOff size={14} stroke={1.6} />, 'bg-transparent text-nomi-ink-40')}{size === 'card' ? <NodeCornerPill label={t('nodePointer.deleted')} className={corner} /> : null}</>
      break
    case 'unavailable':
      art = null
      break
    case 'production':
    case 'empty':
      art = <>
        {KindIcon ? circle(<KindIcon size={14} stroke={1.6} />) : null}
        {/* 组里的小格只留圆托（板 A2）；点过的那一项「已定位」压过制作小标。 */}
        {face.kind === 'production' && size === 'card' && !located ? <ProductionShotCornerLabel state={face.state} t={t} className={corner} /> : null}
      </>
      break
  }
  return (
    <>
      {art}
      {located ? <NodeCornerPill label={t('nodePointer.located')} icon={<IconFocus2 size={11} stroke={1.8} aria-hidden="true" className="shrink-0" />} className={corner} attributes={{ 'data-node-pointer-located': 'true' }} /> : null}
    </>
  )
}

/** 画面框的底色随脸走：失败不用粉底（板）；已停用节点同一个 warning 淡底；其余纸白 / ink-05。 */
function frameTone(face: NodePointerFace): string {
  if (face.kind === 'result' || face.kind === 'generating' || face.kind === 'processing') return 'bg-nomi-ink-05'
  if (face.kind === 'stopped') return 'bg-[color-mix(in_oklab,var(--nomi-warning)_6%,var(--nomi-paper))]'
  return 'bg-nomi-paper'
}

/** 节点画面在 16:9 槽里的位置：宽的贴满宽、竖的贴满高并居中（不裁不拉伸）。 */
function frameBox(aspect: number): React.CSSProperties {
  if (aspect >= SLOT_ASPECT) {
    const height = (SLOT_ASPECT / aspect) * 100
    return { left: 0, right: 0, top: `${(100 - height) / 2}%`, height: `${height}%` }
  }
  const width = (aspect / SLOT_ASPECT) * 100
  return { top: 0, bottom: 0, left: `${(100 - width) / 2}%`, width: `${width}%` }
}

export type NodePointerProps = {
  subject: NodePointerSubject
  density?: NodePointerDensity
  /** 只对 card：组里一格（固定 16:9 槽、不印摘要）还是单独一张。 */
  frame?: 'single' | 'cell'
  /** 窄面板（≤320px）：标题行只留镜号，名字靠悬停提示。 */
  narrow?: boolean
  /** 组指向折叠：这一格的画面位置盖「还有 N 个」，点它展开（板 pointer.group.more）。 */
  overflow?: Readonly<{ hidden: number; onExpand: () => void }>
  /** 组指向用：悬停 / 聚焦、离开 / 失焦时报一声，组据此在下方那一行现算被悬停那一镜的摘要。 */
  onHover?: (hovering: boolean) => void
}

export function NodePointer({ subject, density = 'card', frame = 'single', narrow = false, overflow, onHover }: NodePointerProps): JSX.Element {
  const { t } = useTranslation()
  const model = usePointerModel(subject)
  const locatable = nodePointerLocatable(model.face)
  const located = useNodePointerStore((state) => state.locatedNodeId === subject.nodeId) && locatable
  const hover = useHoverLink(subject.nodeId, locatable && !overflow)
  const gone = !locatable
  const failedOutcome = model.face.kind === 'failed' ? subject.outcome : undefined
  const enter = (): void => {
    hover.on()
    if (!overflow) onHover?.(true)
  }
  const leave = (): void => {
    hover.off()
    onHover?.(false)
  }
  const locate = (): void => {
    if (overflow) { overflow.onExpand(); return }
    if (!locatable) return
    void revealNodeFromChat({ nodeId: subject.nodeId, label: model.shotText ?? model.name })
  }
  const lit = hover.hot && locatable && !overflow
  const common = {
    type: 'button' as const,
    'data-node-pointer': density,
    'data-node-pointer-id': subject.nodeId,
    'data-node-pointer-face': model.face.kind,
    'data-node-pointer-hot': lit ? 'true' : undefined,
    'aria-label': overflow ? t('nodePointer.moreAria', { count: overflow.hidden }) : ariaLabel(t, model, failedOutcome),
    'aria-disabled': gone && !overflow ? true : undefined,
    'aria-expanded': overflow ? false : undefined,
    onClick: locate,
    onPointerEnter: enter,
    onPointerLeave: leave,
    onFocus: enter,
    onBlur: leave,
  }

  if (density === 'chip') {
    return (
      <button
        {...common}
        className={cn(
          // 嵌在一句话里：行高不跟着那句话走（leading 固定），镜号小胶囊按板缩到 18px 高。
          'inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-nomi-line bg-nomi-paper py-0 pl-[3px] pr-2.5 align-middle text-caption leading-[18px] text-nomi-ink transition-colors [&_[data-shot-number]]:py-0',
          lit && 'border-transparent bg-nomi-ink-05',
          model.face.kind === 'failed' && 'border-nomi-danger-edge',
          gone && 'cursor-default bg-nomi-ink-05 text-nomi-ink-40',
        )}
      >
        <span className={cn('relative size-[22px] shrink-0 overflow-hidden rounded-full ring-1 ring-inset ring-nomi-line', frameTone(model.face))}>
          <PointerFaceArt model={model} size="thumb" located={false} />
        </span>
        <PointerLabel model={model} narrow={narrow} />
      </button>
    )
  }

  if (density === 'row') {
    const second = model.face.kind === 'removed' ? t('nodePointer.deleted')
      : model.face.kind === 'failed' ? (failedOutcome ?? model.status)
        : gone ? null
          : model.summary('row')[0] ?? model.status
    return (
      <button
        {...common}
        className={cn(
          'flex min-h-10 w-full min-w-0 items-center gap-2 rounded-nomi border border-nomi-line bg-nomi-paper py-1 pl-1 pr-2 text-left text-caption transition-colors',
          lit && 'border-transparent bg-nomi-ink-05',
          model.face.kind === 'failed' && 'border-nomi-danger-edge',
          gone && 'cursor-default bg-nomi-ink-05',
        )}
      >
        <span className={cn('relative size-8 shrink-0 overflow-hidden rounded-nomi-sm ring-1 ring-inset ring-nomi-line', frameTone(model.face))}>
          <PointerFaceArt model={model} size="thumb" located={false} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <PointerLabel model={model} narrow={narrow} />
          {second ? <span className={cn('min-w-0 truncate text-nomi-ink-60', model.face.kind === 'failed' && 'text-nomi-danger-ink', model.face.kind === 'removed' && 'text-nomi-ink-40')} title={second}>{second}</span> : null}
        </span>
        <RowTrailing face={model.face} located={located} />
      </button>
    )
  }

  // card：标题行在框外、画面同节点比例、下面一行只读摘要；单个竖版时摘要放到画面右边分两行。
  const side = frame === 'single' && model.portrait && !gone
  const lines = frame === 'cell' ? []
    : model.face.kind === 'removed' ? [t('nodePointer.deletedHint')]
      : gone ? []
        : failedOutcome ? [failedOutcome]
          : model.face.kind === 'stopped' && model.status ? [model.status]
            : model.summary(side ? 'side' : 'card')
  // 悬停 / 聚焦：画面框外一圈 1.5px 深色细线 + 阴影抬一级（板 .p1.hot），不用蓝。任意属性写法见 externalHighlightShellClass 的注释。
  const frameClass = cn(
    'absolute overflow-hidden rounded-nomi-sm transition-shadow duration-200',
    frameTone(model.face),
    lit ? '[box-shadow:0_0_0_1.5px_var(--nomi-ink),var(--nomi-shadow-md)]' : 'ring-1 ring-inset ring-nomi-line',
  )
  const art = overflow
    ? <span className="absolute inset-0 grid place-items-center bg-nomi-ink-05 text-body-sm font-semibold text-nomi-ink-80" data-node-pointer-more={overflow.hidden}>{t('nodePointer.more', { count: overflow.hidden })}</span>
    : <PointerFaceArt model={model} size={frame === 'cell' ? 'cell' : 'card'} located={located} />
  return (
    <button {...common} className={cn('flex w-full min-w-0 flex-col gap-1 rounded-nomi text-left text-caption', gone && 'cursor-default')}>
      <PointerLabel model={model} narrow={narrow} />
      {side ? (
        <span className="flex min-w-0 items-start gap-3">
          <span className="relative shrink-0" style={{ height: SIDE_SLOT_HEIGHT, aspectRatio: String(model.aspect) }}>
            <span data-node-pointer-frame="" className={cn(frameClass, 'inset-0')}>{art}</span>
          </span>
          <span className="flex min-w-0 flex-col gap-0.5 pt-1 text-nomi-ink-60">
            {lines.map((line) => <span key={line} className="min-w-0 truncate" title={line}>{line}</span>)}
          </span>
        </span>
      ) : (
        <>
          <span className="relative block w-full" style={{ aspectRatio: String(SLOT_ASPECT) }}>
            <span data-node-pointer-frame="" className={frameClass} style={frameBox(model.aspect)}>{art}</span>
          </span>
          {lines[0] ? (
            <span className={cn('min-w-0 truncate text-nomi-ink-60', failedOutcome && 'text-nomi-danger-ink', model.face.kind === 'removed' && 'text-nomi-ink-40')} title={lines[0]}>{lines[0]}</span>
          ) : null}
        </>
      )}
    </button>
  )
}

/** P2 行尾的状态图标：✓ / 转圈（蓝只留在转圈上）/ 钟 / ⚠ / 断链；点过的那一行写「已定位」。 */
function RowTrailing({ face, located }: { face: NodePointerFace; located: boolean }): JSX.Element | null {
  const { t } = useTranslation()
  if (located) {
    return <span className="inline-flex shrink-0 items-center gap-1 text-micro text-nomi-ink-60" data-node-pointer-located="true"><IconFocus2 size={12} stroke={1.8} aria-hidden="true" />{t('nodePointer.located')}</span>
  }
  const queued = (face.kind === 'generating' && face.feedback.phase === 'queued') || (face.kind === 'production' && face.state.phase === 'queued')
  const icon = face.kind === 'result' ? <IconCheck size={14} stroke={1.8} className="text-nomi-ink-60" />
    : queued ? <IconClock size={14} stroke={1.8} className="text-nomi-ink-60" />
      : face.kind === 'generating' || face.kind === 'processing' ? <IconLoader2 size={14} stroke={1.8} className="animate-spin text-nomi-accent motion-reduce:animate-none" />
        : face.kind === 'failed' ? <IconAlertTriangle size={14} stroke={1.8} className="text-nomi-danger-ink" />
          : face.kind === 'removed' ? <IconLinkOff size={14} stroke={1.8} className="text-nomi-ink-40" />
            : face.kind === 'stopped' ? <IconPlayerPause size={14} stroke={1.8} className="text-nomi-warning" />
              : face.kind === 'recoverable' ? <IconClockSearch size={14} stroke={1.8} className="text-nomi-ink-60" />
                : null
  return icon ? <span className="grid shrink-0 place-items-center" aria-hidden="true">{icon}</span> : null
}

/** 组指向：一次说多个镜头。card 一行三格（下方一行是被悬停那一镜的摘要）；chip 嵌在一句话里；row 是一列（不折）。 */
export function NodePointerGroup({ subjects, density = 'card', narrow = false, max = 3 }: {
  subjects: readonly NodePointerSubject[]
  density?: NodePointerDensity
  narrow?: boolean
  max?: number
}): JSX.Element {
  const { t } = useTranslation()
  const [expanded, setExpanded] = React.useState(false)
  // 被悬停 / 聚焦的格子：存 nodeId（先后到的排成一摞，离开的只拿掉自己），不存摘要——摘要每次渲染从节点现算，
  // 模型目录后到、节点改名都会跟着变（独立验收 V-d2-pointer 偏差 8：摘要曾拍成字符串存进 state，目录晚到就缺模型名）。
  const [hovered, setHovered] = React.useState<readonly string[]>([])
  if (density === 'row') {
    return <div className="flex flex-col gap-1.5" data-node-pointer-group="row">{subjects.map((subject) => <NodePointer key={subject.nodeId} subject={subject} density="row" narrow={narrow} />)}</div>
  }
  const visible = nodePointerGroupVisible(subjects.length, max, expanded)
  const hoveredSubject = subjects.find((subject) => subject.nodeId === hovered[hovered.length - 1])
  if (density === 'chip') {
    return (
      <span data-node-pointer-group="chip">
        {subjects.slice(0, visible.shown).map((subject) => <React.Fragment key={subject.nodeId}><NodePointer subject={subject} density="chip" narrow={narrow} />{' '}</React.Fragment>)}
        {visible.hidden ? (
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-full border border-nomi-line bg-nomi-paper px-2.5 align-middle text-caption font-semibold text-nomi-ink"
            aria-label={t('nodePointer.moreAria', { count: visible.hidden })}
            aria-expanded={false}
            data-node-pointer-more={visible.hidden}
            onClick={() => setExpanded(true)}
          >
            {t('nodePointer.moreCompact', { count: visible.hidden })}
          </button>
        ) : null}
      </span>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-node-pointer-group="card">
      <div className="grid min-w-0 grid-cols-3 gap-2">
        {subjects.slice(0, visible.shown).map((subject, index) => (
          <NodePointer
            key={subject.nodeId}
            subject={subject}
            frame="cell"
            narrow={narrow}
            overflow={visible.hidden && index === visible.shown - 1 ? { hidden: visible.hidden, onExpand: () => setExpanded(true) } : undefined}
            onHover={(hovering) => setHovered((stack) => pointerHoverStack(stack, subject.nodeId, hovering))}
          />
        ))}
      </div>
      {/* 摘要这一行常驻（没有悬停时放一个空格撑着行高）：悬停 / 离开不改组的高度，不把下面的东西（第③步的「生成」钮）顶下去。 */}
      {hoveredSubject ? <PointerHoverSummary subject={hoveredSubject} /> : <PointerHoverLine text={null} />}
    </div>
  )
}

/** 组下方那一行：有内容就是被悬停那一镜的摘要，没有就是一个不换行空格——两种情况同一个 `<p>`、同一行高。 */
function PointerHoverLine({ text }: { text: string | null }): JSX.Element {
  return (
    <p className="m-0 min-w-0 truncate text-caption text-nomi-ink-60" data-node-pointer-hover-summary={text ? 'true' : undefined} aria-hidden={text ? undefined : true}>
      {text ?? '\u00a0'}
    </p>
  )
}

/** 被悬停那一镜的摘要（镜号 · 模型 · 比例 · 时长）：每次渲染从节点现算，不存。 */
function PointerHoverSummary({ subject }: { subject: NodePointerSubject }): JSX.Element {
  const model = usePointerModel(subject)
  return <PointerHoverLine text={[model.shotText ?? model.name, ...model.summary('card')].join(' · ')} />
}

/** 「回到对话」上那一枚圆缩略图（P2 形态）：读的还是那个节点。 */
function ReturnThumb({ nodeId }: { nodeId: string }): JSX.Element {
  const model = usePointerModel({ nodeId })
  return (
    <span className={cn('relative size-[22px] shrink-0 overflow-hidden rounded-full bg-nomi-paper', frameTone(model.face))} aria-hidden="true">
      <PointerFaceArt model={model} size="thumb" located={false} />
    </span>
  )
}

/**
 * 窄窗口里点了指向、对话收成小球之后，画布底部那一颗「回到对话」（板 pointer.narrow.back）。
 * P2 形态带着那一枚标签（「镜 02 · 回到对话」）；Esc 也回。没有可回的对话就不画。
 */
export function NodePointerReturnToChat({ withLabel = false, className }: { withLabel?: boolean; className?: string }): JSX.Element | null {
  const { t } = useTranslation()
  const target = useNodePointerStore((state) => state.returnTo)
  const ref = React.useRef<HTMLButtonElement>(null)
  useOverlayEscape(ref, Boolean(target), returnToChat)
  if (!target) return null
  // 看得见的字按设计系统 §1.8 规则 3 英文 ≤2 词（中文「回到对话」、英文「Back」）；读屏名 / 悬停名写全（英文「Back to chat」）。
  const text = withLabel ? t('nodePointer.backToChatWithLabel', { label: target.label }) : t('nodePointer.backToChat')
  const name = withLabel ? t('nodePointer.backToChatNameWithLabel', { label: target.label }) : t('nodePointer.backToChatName')
  return (
    <button
      ref={ref}
      type="button"
      aria-label={name}
      title={name}
      data-node-pointer-return="true"
      onClick={returnToChat}
      className={cn('inline-flex h-9 items-center gap-1.5 rounded-full bg-nomi-ink pl-3 pr-3.5 text-body-sm font-medium text-nomi-paper shadow-nomi-lg', withLabel && 'pl-1.5', className)}
    >
      {withLabel ? <ReturnThumb nodeId={target.nodeId} /> : <IconMessage size={16} stroke={1.8} aria-hidden="true" />}
      {text}
    </button>
  )
}
