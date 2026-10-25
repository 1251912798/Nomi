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
import { useGenerationCanvasStore } from '../../generationCanvas/store/generationCanvasStore'
import { selectCanvasNodeById } from '../../generationCanvas/store/canvasNodeGenerationIndex'
import { useNodeExternalHighlightStore } from '../../generationCanvas/store/nodeExternalHighlightStore'
import { getGenerationNodeIcon } from '../../generationCanvas/nodes/renderRegistry'
import { GenerationWaitingSurface } from '../../generationCanvas/nodes/GenerationWaitingSurface'
import { GenerationStatusBar } from '../../generationCanvas/nodes/GenerationStatusBar'
import { NodeCornerPill } from '../../generationCanvas/nodes/ProductionShotPlaceholder'
import { productionShotCornerText, stoppedCopyOf, useProductionShotState } from '../../generationCanvas/nodes/productionShotCorner'
import { useGenerationFeedback } from '../../observability/useGenerationFeedback'
import type { GenerationFeedback } from '../../observability/generationFeedback'
import { NodeShotLabel, ShotNumberPill } from '../../generation/list/CanvasListLinks'
import { formatStoryboardShotLabel, isAutoStoryboardShotTitle, useStoryboardShotLabel } from '../../generation/list/storyboardLabels'
import { useModelLabels } from '../../generation/list/generationListModelLabels'
import { isPortraitAspect, nodePointerAspect, nodePointerFace, nodePointerGroupVisible, nodePointerLocatable, nodePointerSummary, nodePointerSummaryFacts, nodePointerTitleTails, pointerHoverStack, type NodePointerFace } from './nodePointerFace'
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
  /**
   * 宿主给的显式事实：这一镜这一次没成（付费卡交给画布却没发出去 / 参数被拒），值是状态条上那一个词。
   * 节点自己没有失败记录时也画失败脸（见 nodePointerFace）；不给就只读节点。
   */
  hostFailure?: string
  /** 宿主在当前一次出价里给这一格的状态词（例如失败态的「还没发」）。 */
  hostStatus?: string
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
  hostStatus?: string
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
  const face = nodePointerFace({ node, removed: subject.removed, canvasReady, feedback, productionState: production.state, ...(subject.hostFailure ? { hostFailure: subject.hostFailure } : {}) })
  const shotText = node ? (shotLabel ? formatStoryboardShotLabel(t, shotLabel) : null) : subject.fallbackLabel?.shot ?? null
  const rawTitle = node ? (shotLabel && isAutoStoryboardShotTitle(node.title, shotLabel.number) ? '' : node.title ?? '') : subject.fallbackLabel?.title ?? ''
  const title = rawTitle.trim()
  const facts = nodePointerSummaryFacts(node, modelLabel(node))
  const aspectText = facts.aspect
  return {
    node,
    face,
    name: [shotText, title].filter(Boolean).join(' ') || t('nodePointer.untitled'),
    shotText,
    title,
    status: faceStatusText(t, face),
    ...(subject.hostStatus ? { hostStatus: subject.hostStatus } : {}),
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

/**
 * 标题行：节点在就挂节点自己的 NodeShotLabel（改名两边一起变）；节点不在就用宿主的名字快照（已删除划线）。
 * `tailFrom`（组给的，见 nodePointerTitleTails）：从这儿起是「和兄弟格不一样的那一截」——前面那截公共开头先截（带省略号），这一截不截。
 * 在组的格子里，小动作（付费卡「不生成 ×」/「恢复」）露出来时标题行右边让出它的宽，小动作不压标题。
 */
function PointerLabel({ model, narrow, tailFrom = 0, reserveAccessory = false }: { model: PointerModel; narrow: boolean; tailFrom?: number; reserveAccessory?: boolean }): JSX.Element {
  const gone = model.face.kind === 'removed' || model.face.kind === 'unavailable'
  // 窄面板只留镜号（名字靠悬停提示）；没有镜号的节点照旧露名字。
  const hideTitle = narrow && Boolean(model.shotText)
  const tone = cn('font-semibold text-nomi-ink', gone && 'text-nomi-ink-40', model.face.kind === 'removed' && 'line-through')
  const split = tailFrom > 0 && tailFrom < model.title.length
  const titleNode = hideTitle || !model.title ? null : split ? (
    // 截中间：头一截可以截到只剩省略号，尾巴整截留着（尾巴自己比一格还宽时才在尾巴末端截）。whitespace-pre 留住两截之间那个空格。
    <span className={cn('flex min-w-0', tone)} data-node-pointer-title="">
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-pre">{model.title.slice(0, tailFrom)}</span>
      <span className="max-w-full shrink-0 overflow-hidden text-ellipsis whitespace-pre" data-node-pointer-title-tail="">{model.title.slice(tailFrom)}</span>
    </span>
  ) : (
    <span className={cn('min-w-0 truncate', tone)} data-node-pointer-title="">{model.title}</span>
  )
  return (
    <span
      className={cn(
        'flex h-[22px] min-w-0 items-center gap-1.5 text-caption',
        reserveAccessory && 'max-w-[calc(100%-24px)]',
      )}
      title={model.name}
    >
      {model.node && !gone
        ? <NodeShotLabel node={model.node}>{titleNode}</NodeShotLabel>
        : <>{model.shotText ? <ShotNumberPill className="text-nomi-ink-40">{model.shotText}</ShotNumberPill> : null}{titleNode}</>}
      {!model.shotText && !model.title ? <span className="min-w-0 truncate text-nomi-ink-60">{model.name}</span> : null}
    </span>
  )
}

/** 画面槽里的那一张脸。`thumb`（P2 的小缩略图）只留画面或等待面，状态交给行尾图标 / 边线。 */
function PointerFaceArt({ model, size, located, suppressAwaitingConfirmation = false }: { model: PointerModel; size: 'card' | 'cell' | 'thumb'; located: boolean; suppressAwaitingConfirmation?: boolean }): JSX.Element | null {
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
  const centerStatus = (label: string, icon?: React.ReactNode, tone?: string, located = false) => (
    <span className={cn('absolute left-1/2 top-1/2 z-[4] inline-flex max-w-[calc(100%-8px)] -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-nomi-paper/90 px-1.5 py-0.5 text-micro text-nomi-ink-60 shadow-nomi-sm', tone)} data-node-pointer-status="true" data-node-pointer-located={located ? 'true' : undefined}>
      {icon}
      <span className="min-w-0 truncate">{label}</span>
    </span>
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
        {/* 点过的那一项「已定位」压过制作小标。状态胶囊与节点图标合在缩略图中央；组里的小格只印和兄弟格不一样的那两种：排队中、还没生成（SpendCardQ1 板 ③⑤⑥）。
            「等你确认」不印——卡 / 那句话本身就在问，三格各印一遍是噪音（NodePointer 板 A2「全是草稿」只留圆托）；「已去掉，不生成」
            不印——付费卡上那一格淡下去、常驻「恢复」，再压一枚小标会和「恢复」挤在一起。单独一张照旧全印。 */}
        {face.kind === 'production' && !located && (model.hostStatus || face.state.phase === 'queued' || face.state.phase === 'not_generated' || (!suppressAwaitingConfirmation && face.state.phase === 'awaiting_confirmation'))
          ? centerStatus(model.hostStatus ?? productionShotCornerText(t, face.state)?.text ?? '', productionShotCornerText(t, face.state)?.queued ? <IconClock size={11} stroke={1.8} aria-hidden="true" className="shrink-0" /> : undefined)
          : null}
      </>
      break
  }
  return (
    <>
      {art}
      {located ? centerStatus(t('nodePointer.located'), <IconFocus2 size={11} stroke={1.8} aria-hidden="true" className="shrink-0" />, undefined, true) : null}
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
  /**
   * 只对单独一张 card：摘要放哪。`auto` = 竖版放画面右边分两行、横版放画面下一行；`side` = 一律放右边
   * （付费卡单段那一张：画面在左、模型 / 比例 · 时长 · 清晰度在右，SpendCardQ1 板 ①）。
   */
  layout?: 'auto' | 'side'
  /** 窄面板（≤320px）：标题行只留镜号，名字靠悬停提示。 */
  narrow?: boolean
  /** 组指向折叠：这一格的画面位置盖「还有 N 个」，点它展开（板 pointer.group.more）。 */
  overflow?: Readonly<{ hidden: number; onExpand: () => void }>
  /** 组指向用：悬停 / 聚焦、离开 / 失焦时报一声，组据此在下方那一行现算被悬停那一镜的摘要。 */
  onHover?: (hovering: boolean) => void
  /** 组指向用：把自己标题行上那个名字报给组（名字只在这里从节点现算），组据此算每一格「和兄弟不一样的那一截」。 */
  onTitle?: (title: string) => void
  /** 组给的：标题从这儿起是和兄弟格不一样的那一截（截中间，见 nodePointerTitleTails）。 */
  titleTail?: number
  /** 组格挂右上角小动作时，标题留出同一格的安全边。 */
  reserveAccessory?: boolean
  /** 卡面已经在父级标题提问时，隐藏子指向元素的「等你确认」小标。 */
  suppressAwaitingConfirmation?: boolean
}

export function NodePointer({ subject, density = 'card', frame = 'single', layout = 'auto', narrow = false, overflow, onHover, onTitle, titleTail, reserveAccessory = false, suppressAwaitingConfirmation = false }: NodePointerProps): JSX.Element {
  const { t } = useTranslation()
  const model = usePointerModel(subject)
  // 绘制前报上去：组拿到名字就在同一帧里算好截法，不先画一帧「几格截成一样」再跳。
  React.useLayoutEffect(() => { onTitle?.(model.title) }, [onTitle, model.title])
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
  const side = frame === 'single' && (model.portrait || layout === 'side') && !gone
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
    : <PointerFaceArt model={model} size={frame === 'cell' ? 'cell' : 'card'} located={located} suppressAwaitingConfirmation={suppressAwaitingConfirmation} />
  return (
    <button {...common} className={cn('flex w-full min-w-0 flex-col gap-1 rounded-nomi text-left text-caption', gone && 'cursor-default')}>
      <PointerLabel model={model} narrow={narrow} reserveAccessory={reserveAccessory} {...(titleTail ? { tailFrom: titleTail } : {})} />
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

/**
 * 组里一格挂的那个小动作（付费卡多段时的「不生成 ×」/「恢复」）。位置、什么时候露出来、这一格淡不淡下去都归组管——
 * 标题行要按它露没露出来让位，两处判据只能有一份。
 */
export type NodePointerCellAccessory = Readonly<{
  /** 宿主的那颗按钮本身（不带定位、不带藏起来的样式）。 */
  action: React.ReactNode
  /** 常驻（「恢复」）；false = 悬停 / 聚焦这一格时才露出来（「不生成 ×」）。 */
  pinned: boolean
  /** 这一格淡下去（盖在画面框上，不挡点击：指向元素照样点了去节点）。 */
  dimmed: boolean
}>

/**
 * 组里挂了小动作的那一格。小动作是格子的兄弟、不是格子里的按钮（按钮里不能套按钮），× 在缩略图右上角、恢复在缩略图中央：
 * 不压画面框里的状态胶囊，也不再占标题行；它露出来时由组统一控制，键盘从指向元素 Tab 一下照样走得到它。
 * 藏着的时候不接点击（看不见的钮不许挡住缩略图），键盘从指向元素 Tab 一下照样走得到它（聚焦在格子里就露出来）。
 */
function PointerCell({ pointer, accessory }: { pointer: React.ReactNode; accessory: NodePointerCellAccessory }): JSX.Element {
  return (
    <div
      className="group/pointer-cell relative min-w-0"
      data-node-pointer-cell=""
      data-accessory-pinned={accessory.pinned ? 'true' : undefined}
    >
      {pointer}
      {accessory.dimmed ? <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 top-[26px] rounded-nomi-sm bg-nomi-paper/60" data-node-pointer-cell-dimmed="true" /> : null}
      <span
        className={cn(
          accessory.pinned
            ? 'pointer-events-none absolute inset-x-0 top-[26px] z-[5] flex aspect-video items-center justify-center transition-opacity'
            : 'absolute right-0 top-[18px] z-[5] flex h-[22px] items-center transition-opacity',
          !accessory.pinned && 'pointer-events-none opacity-0 group-focus-within/pointer-cell:pointer-events-auto group-focus-within/pointer-cell:opacity-100 group-hover/pointer-cell:pointer-events-auto group-hover/pointer-cell:opacity-100',
        )}
        data-node-pointer-cell-accessory=""
      >
        {accessory.action}
      </span>
    </div>
  )
}

/** 组指向：一次说多个镜头。card 一行三格（下方一行是被悬停那一镜的摘要）；chip 嵌在一句话里；row 是一列（不折）。 */
export function NodePointerGroup({ subjects, density = 'card', narrow = false, max = 3, idleSummary, cellAccessory, suppressAwaitingConfirmation = false }: {
  subjects: readonly NodePointerSubject[]
  density?: NodePointerDensity
  narrow?: boolean
  max?: number
  /**
   * 只对 card：没有格子被悬停时下方那一行写什么（付费卡：这几段合起来的只读摘要「模型 · 比例 · 清晰度 · 共 Ns」）。
   * 缺席 = 一个不换行空格撑着行高（组单独用时）。悬停哪一格，那一行就换成那一镜的摘要，离开回到这一句。
   */
  idleSummary?: string
  /** 只对 card：每一格标题行右端挂一个宿主给的小动作（见 NodePointerCellAccessory / PointerCell）。缺席或返回 null = 这一格不挂。 */
  cellAccessory?: (subject: NodePointerSubject, index: number) => NodePointerCellAccessory | null
  /** 父级卡已经在标题行提问时，组格不重复显示等待确认小标。 */
  suppressAwaitingConfirmation?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const [expanded, setExpanded] = React.useState(false)
  // 被悬停 / 聚焦的格子：存 nodeId（先后到的排成一摞，离开的只拿掉自己），不存摘要——摘要每次渲染从节点现算，
  // 模型目录后到、节点改名都会跟着变（独立验收 V-d2-pointer 偏差 8：摘要曾拍成字符串存进 state，目录晚到就缺模型名）。
  const [hovered, setHovered] = React.useState<readonly string[]>([])
  // 每一格标题行上那个名字（各格自己从节点现算后报上来，见 NodePointer.onTitle），只拿来算截法。
  const [titles, setTitles] = React.useState<Readonly<Record<string, string>>>({})
  // 每一格一枚不变的回报函数：格子的 layout effect 只在名字真变了时才再报一次。
  const reporters = React.useRef(new Map<string, (title: string) => void>())
  const reporterFor = (key: string): ((title: string) => void) => {
    const known = reporters.current.get(key)
    if (known) return known
    const report = (title: string): void => setTitles((current) => (current[key] === title ? current : { ...current, [key]: title }))
    reporters.current.set(key, report)
    return report
  }
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
  const shown = subjects.slice(0, visible.shown)
  // 没有节点号的格子（还没落到画布上）用位置当键：几格同时缺号时键不撞。
  const keys = shown.map((subject, index) => subject.nodeId || `cell-${index}`)
  const tails = nodePointerTitleTails(keys.map((key) => titles[key] ?? ''))
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-node-pointer-group="card">
      <div className="grid min-w-0 grid-cols-3 gap-2">
        {shown.map((subject, index) => {
          const folded = Boolean(visible.hidden && index === visible.shown - 1)
          const key = keys[index]
          const accessory = cellAccessory && !folded ? cellAccessory(subject, index) : null
          const pointer = (
            <NodePointer
              subject={subject}
              frame="cell"
              narrow={narrow}
              overflow={folded ? { hidden: visible.hidden, onExpand: () => setExpanded(true) } : undefined}
              onHover={(hovering) => setHovered((stack) => pointerHoverStack(stack, subject.nodeId, hovering))}
              onTitle={reporterFor(key)}
              titleTail={tails[index]}
              reserveAccessory={Boolean(accessory)}
              suppressAwaitingConfirmation={suppressAwaitingConfirmation}
            />
          )
          return accessory
            ? <PointerCell key={key} pointer={pointer} accessory={accessory} />
            : <React.Fragment key={key}>{pointer}</React.Fragment>
        })}
      </div>
      {/* 摘要这一行常驻（没有悬停时放宿主那一句或一个空格撑着行高）：悬停 / 离开不改组的高度，不把下面的东西（「生成」钮）顶下去。 */}
      {hoveredSubject ? <PointerHoverSummary subject={hoveredSubject} /> : <PointerHoverLine text={idleSummary ?? null} idle />}
    </div>
  )
}

/**
 * 组下方那一行：被悬停那一镜的摘要；没有悬停时是宿主给的那一句（`idleSummary`），宿主也没给就是一个不换行空格——
 * 三种情况同一个 `<p>`、同一行高。
 */
function PointerHoverLine({ text, idle = false }: { text: string | null; idle?: boolean }): JSX.Element {
  return (
    <p
      className="m-0 min-w-0 truncate text-caption text-nomi-ink-60"
      data-node-pointer-hover-summary={text && !idle ? 'true' : undefined}
      data-node-pointer-group-summary={text && idle ? 'true' : undefined}
      title={text ?? undefined}
      aria-hidden={text ? undefined : true}
    >
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
