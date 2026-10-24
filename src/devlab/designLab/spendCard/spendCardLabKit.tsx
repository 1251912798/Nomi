// 设计实验室 · 屏「付费卡」（SpendCardQ1 板 ①–⑧ 与连带状态，2026-10-24 D2 第③步）的取景台。
//
// 格子里挂的全是生产件，实验室只喂三样夹具：
//   · 画布节点（现役画布 store）——卡上每一个字都从节点现读（模型名、比例、时长、清晰度、价、分镜号、本机预检）；
//   · 制作 Run（落地投影缓存）——指向元素上的「等你确认 / 排队中 / 已去掉」、收据下那几镜都从它派生；
//   · 宿主推过来的那一次出价（`PendingSpendRead`）——和主进程投影同一个形状。
// 卡由生产钩子 `useAgentPanelSpendCard` 算（和真面板同一条路），卡体是 `AgentPanelV4SpendCardBody`（指向元素 = NodePointer
// 生产件），卡壳与面板是 `AgentPanelV4Panel`；完成那一格的收据由两层真投影（pi 转录 → `projectLaneSnapshot` → `laneViewModel`）
// 跑出来。卡上点什么都不会发出去：实验室没有宿主（按下去会弹「没有连上」那一句，这是既定语义）。
//
// 主进程那份投影（`projectPendingSpendConfirm`）跑在 Node 里，浏览器跑不了，所以出价这一份由夹具按同一个形状写出来；
// Run 与出价从同一份场景生成——两边说的是同一件事，指向元素上的样子与卡上的话不会各说各的。
import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { GenerationHandOverFailure, PendingSpendConfirm, PendingSpendRead, PendingSpendShot } from '../../../desktop/productionRunBridgeTypes'
import type { GenerationCanvasNode } from '../../../workbench/generationCanvas/model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../../../workbench/generationCanvas/store/generationCanvasStore'
import { useNodeExternalHighlightStore } from '../../../workbench/generationCanvas/store/nodeExternalHighlightStore'
import { useWorkbenchStore } from '../../../workbench/workbenchStore'
import { useProductionCanvasLandingStore } from '../../../workbench/production/productionCanvasLandingStore'
import { useNodePointerStore } from '../../../workbench/ai/pointer/nodePointerStore'
import { AgentPanelV4Panel, type AgentPanelV4PanelProps } from '../../../workbench/ai/v4/AgentPanelV4Panel'
import { V4Intervention } from '../../../workbench/ai/v4/AgentPanelV4Cards'
import { useV4Labels } from '../../../workbench/ai/v4/agentPanelV4Labels'
import { AgentPanelV4SpendCardBody } from '../../../workbench/ai/v4/AgentPanelV4SpendCardBody'
import { V4AutoModeBanner } from '../../../workbench/ai/v4/AgentPanelV4AutoMode'
import { useAgentPanelSpendCard } from '../../../workbench/ai/v4/useAgentPanelSpendCard'
import type { V4FlowItem } from '../../../workbench/ai/v4/agentPanelV4Types'
import { readableToolName, readableToolSummary } from '../../../workbench/ai/resident/residentToolDisplay'
import type { ModelOptionPricing } from '../../../config/models'
import { peekCatalogHealth, peekCatalogModelOptions, seedModelCatalogForTests } from '../../../config/modelCatalogCache'
import { LabLocaleGate } from '../labLocaleGate'
import { holdDesignLabReady } from '../labReadyHold'
import { DESIGN_ID, DOCUMENT_ID, L, LabHover, design, installPointerCatalog, useLabSettled, type Locale } from '../nodePointer/nodePointerLabKit'
import { shotArt } from '../generationList/generationListArt'
import { laneFlowItems, laneSnapshotGenerateDone } from '../v4/laneDrivenFixtures'
import { collapseV4Flow } from '../../../workbench/ai/v4/agentPanelV4Collapse'
import { labViewModelLabels, useV4Fixtures, V4_LAB_SLOT_HANDLERS, V4_PANEL_WIDTH } from '../v4/agentPanelV4LabKit'

export const SPEND_CARD_CELL_WIDTH = V4_PANEL_WIDTH + 48
export const SPEND_CARD_CELL_HEIGHT = 700

const PROJECT_ID = 'design-lab-spend-card'
const RUN_ID = 'lab-spend-run'
const OPERATION_ID = 'lab-spend-op'
const PRESENTATION_ID = `${RUN_ID}:presentation:1`
const AT = '2026-10-24T12:00:00.000Z'
/** Agent 起草时选的模型：节点上还是它，卡上就说「Nomi 选的」。 */
const DRAFTED = Object.freeze({ providerId: 'apimart', modelId: 'seedance-2' })
/** 「节点里换过模型」那一格：Agent 起草时选的是另一个，节点上现在是 Seedance。 */
const DRAFTED_OTHER = Object.freeze({ providerId: 'apimart', modelId: 'kling-3.0' })
/**
 * 价目只来自目录（`shotPricingRule` 不变量 ①），挂在 Seedance 那一行上，走生产估价函数 `estimateNodePrice`：
 *   · flat：只有基价——每段同价，页脚印「N 段」、不出逐镜明细（板 ②）；
 *   · by-duration：5 秒档加价——各段价格不同，出「逐镜 · N 镜」明细（板 ⑧，样张上的 ¥0.70 / ¥0.88）。
 * 缺席 = 目录里没有价目（多数模型的常态）：合计整行不印（板 ⑦）。
 */
const PRICING: Record<'flat' | 'by-duration', ModelOptionPricing> = {
  flat: { cost: 0.7, enabled: true, specCosts: [] },
  'by-duration': { cost: 0.7, enabled: true, specCosts: [{ specKey: 'duration:5', cost: 0.18, enabled: true }] },
}

export type SpendLabShot = Readonly<{
  /** 分镜里第几镜：节点标题、「镜 NN」都从这里来。 */
  shot: 1 | 2 | 3
  ratio?: '16:9' | '9:16'
  duration?: number
  offer: PendingSpendShot['offer']
  failure?: GenerationHandOverFailure
  /** 节点自己在画布上的样子（交出去的那几镜在画布上跑）。缺席 = 空闲。 */
  node?: 'submitting' | 'generating' | 'done'
  /** 正在交（handing_over）的这一镜已经绑上了画布那一次运行；缺席 = 还在排队等交。 */
  bound?: boolean
  /** 节点已经从画布上删了。 */
  deleted?: boolean
  /** 提示词是空的：本机预检判得出发不出去。 */
  emptyPrompt?: boolean
}>

export type SpendLabScenario = Readonly<{
  shots: readonly SpendLabShot[]
  brake?: NonNullable<PendingSpendConfirm['brake']>['reason']
  /** 读不到待决出价（那张会说话的缺卡）。 */
  unreadable?: boolean
  pricing?: keyof typeof PRICING
  /** 卡已经自己关了（完成）：出价关着，对话流里那一行 `generate` 收据下挂那一句与组指向。 */
  done?: boolean
  /** 节点里换过模型：Agent 起草时选的不是节点上现在这个。 */
  draftedOther?: boolean
}>

const TITLES: Record<1 | 2 | 3, readonly [string, string]> = {
  1: ['纸船出发', 'Paper boat departs'],
  2: ['越过落叶', 'Past the leaves'],
  3: ['漂向远处', 'Drifting away'],
}
const PROMPTS: Record<1 | 2 | 3, readonly [string, string]> = {
  1: ['清晨的小河，一只纸船被轻轻放进水里，镜头贴着水面跟着它出发', 'A paper boat is set on a quiet morning stream; the camera follows it at water level'],
  2: ['纸船穿过漂在水面的落叶，叶子擦过船身，慢慢转了个弯', 'The boat threads through floating leaves that brush its sides as it turns'],
  3: ['远景：纸船越漂越远，变成河面上一个小白点', 'Wide shot: the boat drifts away until it is a small white dot on the river'],
}
const TONES: Record<1 | 2 | 3, string> = { 1: '#c9d6dc|#93a9b8', 2: '#3d4f5c|#c7a46a', 3: '#a8b9a0|#5d7a63' }

const shotIdOf = (shot: Pick<SpendLabShot, 'shot'>): string => `lab-shot-${shot.shot}`
export const spendLabNodeId = (shot: 1 | 2 | 3): string => `lab-spend-node-${shot}`

function labNode(shot: SpendLabShot, locale: Locale): GenerationCanvasNode {
  const ratio = shot.ratio ?? '16:9'
  const portrait = ratio === '9:16'
  return {
    id: spendLabNodeId(shot.shot),
    kind: 'video',
    categoryId: 'shots',
    title: L(locale, TITLES[shot.shot][0], TITLES[shot.shot][1]),
    prompt: shot.emptyPrompt ? '' : L(locale, PROMPTS[shot.shot][0], PROMPTS[shot.shot][1]),
    position: { x: 0, y: 0 },
    size: portrait ? { width: 192, height: 340 } : { width: 340, height: 192 },
    status: shot.node === 'done' ? 'success' : shot.node ? 'running' : 'idle',
    // 「提交中」= 节点自己的运行记录走到把任务发给模型那一步（状态条读的就是这一格）；不带开始时间，截图不随墙钟变。
    ...(shot.node === 'submitting' ? { progress: { phase: 'requesting', updatedAt: 1 } } : {}),
    // 无头 Chromium 不解 H.264：结果给成首帧图（指向元素读的也正是这一张）。
    ...(shot.node === 'done' ? { result: { id: `lab-spend-art-${shot.shot}`, type: 'image' as const, url: shotArt(shot.shot, ratio, TONES[shot.shot]), createdAt: 1 } } : {}),
    meta: {
      modelKey: DRAFTED.modelId, modelVendor: DRAFTED.providerId, aspect_ratio: ratio, duration: shot.duration ?? 4, resolution: '480p',
      storyboardDesignId: DESIGN_ID, shotId: `s${shot.shot}`, productionRunId: RUN_ID, productionShotId: shotIdOf(shot),
    },
  } as GenerationCanvasNode
}

/** 这一次出价交到哪一步（`GenerationPresentation.handOvers` 那一笔）。还没决定 / 去掉了 / 节点上自己拿走了的没有这一笔。 */
function handOversOf(shot: SpendLabShot) {
  const base = { shotId: shotIdOf(shot), by: 'gesture' as const, at: AT }
  const canvasRunId = `canvas-${shotIdOf(shot)}`
  switch (shot.offer) {
    case 'handing_over': return [shot.bound ? { ...base, canvasRunId } : base]
    case 'sent': return [{ ...base, canvasRunId, settled: { at: AT, outcome: 'accepted' as const } }]
    case 'unknown': return [{ ...base, canvasRunId, settled: { at: AT, outcome: 'unknown' as const } }]
    case 'not_sent': return [{ ...base, canvasRunId, settled: { at: AT, outcome: 'not_sent' as const, ...(shot.failure ? { failure: shot.failure } : {}) } }]
    default: return []
  }
}

/** 画布认领了这一镜的这一次尝试：交给画布的（via handover）、节点上自己点的（via node，带着认领那一刻开着的出价）。 */
function claimOf(shot: SpendLabShot) {
  const claim = { by: 'canvas' as const, attempt: 1, claimedAt: AT, presentationId: PRESENTATION_ID }
  if (shot.offer === 'taken_by_canvas') return { claim: { ...claim, via: 'node' as const } }
  if (shot.offer === 'sent' || shot.offer === 'unknown' || (shot.offer === 'handing_over' && shot.bound)) {
    return { claim: { ...claim, via: 'handover' as const, canvasRunId: `canvas-${shotIdOf(shot)}` } }
  }
  return {}
}

/** 落地投影缓存里的那份 Run：出价（开着 / 已关）、去掉了哪几镜、交到哪一步——节点上的小标、收据下那几镜从它派生。 */
function labRun(scenario: SpendLabScenario) {
  const candidate = { candidateId: 'lab-spend-candidate', revision: 1, moduleId: 'm', providerId: DRAFTED.providerId, modelId: DRAFTED.modelId, mode: 't2v', prompt: '', parameters: {}, references: [] }
  return {
    runId: RUN_ID, projectId: PROJECT_ID, status: 'running', jobs: [], gates: [], origin: { host: 'nomi' },
    generationPlan: {
      operationId: OPERATION_ID, state: 'draft', candidate, nodeId: 'lab-spend-plan', updatedAt: AT,
      shots: scenario.shots.map((shot) => ({
        shotId: shotIdOf(shot), nodeId: spendLabNodeId(shot.shot), candidate: { ...candidate, candidateId: shotIdOf(shot) }, updatedAt: AT,
        ...(shot.deleted ? { canvasDetached: true } : {}),
        ...claimOf(shot),
      })),
      presentations: [{
        presentationId: PRESENTATION_ID, presentationEpoch: 1, shotIds: scenario.shots.map(shotIdOf), openedAt: AT, fromGate: 0,
        removed: scenario.shots.filter((shot) => shot.offer === 'removed' && !shot.deleted).map((shot) => ({ shotId: shotIdOf(shot), at: AT })),
        handOvers: scenario.shots.flatMap(handOversOf),
        ...(scenario.done ? { closed: { at: AT, by: 'handed_to_canvas' } } : {}),
      }],
    },
  }
}

/** 主进程推过来的那一笔（`projectPendingSpendConfirm` 的形状）。卡关了就没有这一笔。 */
function labRead(scenario: SpendLabScenario): PendingSpendRead {
  if (scenario.unreadable) return { surface: 'unreadable', reason: 'surface-unavailable' }
  if (scenario.done) return { surface: 'ready', rows: [] }
  const pending: PendingSpendConfirm = {
    projectId: PROJECT_ID, runId: RUN_ID, operationId: OPERATION_ID, planVersion: 1, quoteId: 'lab-spend-quote',
    presentationId: PRESENTATION_ID, presentationEpoch: 1, currency: 'CNY',
    ...(scenario.brake ? { brake: { reason: scenario.brake } } : {}),
    shots: scenario.shots.map((shot) => ({
      shotId: shotIdOf(shot), nodeId: spendLabNodeId(shot.shot), index: shot.shot, kind: 'video' as const,
      draftedModel: scenario.draftedOther ? DRAFTED_OTHER : DRAFTED, offer: shot.offer,
      ...(shot.failure ? { failure: shot.failure } : {}),
    })),
  }
  return { surface: 'ready', rows: [pending] }
}

/**
 * 只读目录桥（沿用指向元素那一屏：共用夹具的行 + 主进程投影会给的「能用」）；要价目的格子再把 Seedance 那一行的价目
 * 种进同一份缓存（只替最外面那次取数，认档案 / 估价仍是现役代码）。
 */
function installSpendCatalog(pricing: ModelOptionPricing | undefined): void {
  installPointerCatalog()
  const health = peekCatalogHealth()
  if (!pricing || !health) return
  const priced = (mode: 'text_to_video' | 'image_to_video') => (peekCatalogModelOptions('video', mode) ?? [])
    .map((option) => ((option.modelKey ?? option.value) === DRAFTED.modelId ? { ...option, pricing } : option))
  seedModelCatalogForTests(health, [
    { kind: 'video', requiredMode: 'text_to_video', options: priced('text_to_video') },
    { kind: 'video', requiredMode: 'image_to_video', options: priced('image_to_video') },
  ])
}

export type SpendLabScene = Readonly<{
  /** 悬停哪几个指向元素（CSS 选择器；派一次 pointerover，组下方那一行与画布高亮跟着走）。 */
  hover?: readonly string[]
  /**
   * 聚焦哪一个（CSS 选择器）。「不生成 ×」是悬停 / 聚焦才露的（CSS 的 :hover / :focus-within）：合成的指针事件点不亮 :hover，
   * 实验室替键盘聚焦一下——那正是板上「悬停 / 聚焦」的后一半。
   */
  focus?: string
  /** 把「逐镜 · N 镜」那一块折叠展开（替手点一下）。 */
  openPerShot?: boolean
}>

/** 替手点一下「逐镜 · N 镜」：原生 `<details>` 没有受控的开关，实验室只把它打开，长相由组件自己画。 */
function LabOpenPerShot(): null {
  React.useEffect(() => {
    const release = holdDesignLabReady('spend-card:open-per-shot')
    const frame = window.requestAnimationFrame(() => {
      const fold = document.querySelector('[data-v4-block="price-per-item"]')
      if (fold instanceof HTMLDetailsElement) fold.open = true
      window.requestAnimationFrame(release)
    })
    return () => { window.cancelAnimationFrame(frame); release() }
  }, [])
  return null
}

/** 替键盘聚焦一个元素（指向元素是按钮，聚焦它 = Tab 走到它）。 */
function LabFocus({ target }: { target: string }): null {
  React.useEffect(() => {
    const release = holdDesignLabReady(`spend-card:focus:${target}`)
    const frame = window.requestAnimationFrame(() => {
      const element = document.querySelector(target)
      if (element instanceof HTMLElement) element.focus()
      window.requestAnimationFrame(release)
    })
    return () => { window.cancelAnimationFrame(frame); release() }
  }, [target])
  return null
}

/**
 * 一格的根：灌夹具（分镜方案、画布节点、Run）、钉语言；目录与结果图落定才放旗。
 * 画布先整写一次再放节点：「画布载入完」只由 restoreSnapshot 这一个写口举起，卡要它才知道节点不在就是删了。
 * `bare`：嵌进别的屏的整块面板格子里（不另加底衬，语言跟着那一屏）。
 */
export function SpendCardStage({ scenario, locale: pinned = 'zh-CN', scene = {}, bare = false, children }: {
  scenario: SpendLabScenario
  locale?: Locale
  scene?: SpendLabScene
  bare?: boolean
  children: React.ReactNode
}): JSX.Element {
  const { i18n } = useTranslation()
  // 嵌进别的屏时语言跟着那一屏（节点标题与界面同一种语言）；自己这一屏按格子钉的那一种。
  const locale: Locale = bare ? (i18n.language.startsWith('en') ? 'en' : 'zh-CN') : pinned
  React.useMemo(() => installSpendCatalog(scenario.pricing ? PRICING[scenario.pricing] : undefined), [scenario.pricing])
  const [seeded, setSeeded] = React.useState(false)
  React.useLayoutEffect(() => {
    useWorkbenchStore.setState({ activeCategoryId: 'shots', storyboardDesignsByDocumentId: { [DOCUMENT_ID]: [design(locale)] } })
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [] }, PROJECT_ID)
    useGenerationCanvasStore.setState({ nodes: scenario.shots.filter((shot) => !shot.deleted).map((shot) => labNode(shot, locale)), edges: [], groups: [] })
    useProductionCanvasLandingStore.getState().setRuns(PROJECT_ID, { [RUN_ID]: labRun(scenario) } as never)
    useNodeExternalHighlightStore.setState({ hoverNodeId: null, claims: [], flashNodeIds: [] })
    useNodePointerStore.setState({ locatedNodeId: null, returnTo: null })
    setSeeded(true)
  }, [scenario, locale])
  useLabSettled(seeded)
  const content = seeded ? <>{children}{scene.hover?.map((target) => <LabHover key={target} target={target} />)}{scene.openPerShot ? <LabOpenPerShot /> : null}{scene.focus ? <LabFocus target={scene.focus} /> : null}</> : null
  if (bare) return <>{content}</>
  return (
    <LabLocaleGate locale={locale}>
      <div data-design-lab-stage="spend-card" className="relative bg-nomi-bg p-6 text-nomi-ink">{content}</div>
    </LabLocaleGate>
  )
}

/**
 * 只有介入槽那一格（词表那一屏「⑤ 介入槽 · 付费」用：每种 kind 一格单件）。数据同样走生产钩子，卡体同样是生产卡体。
 */
export function SpendCardSlot({ scenario }: { scenario: SpendLabScenario }): JSX.Element | null {
  const read = React.useMemo(() => labRead(scenario), [scenario])
  const spend = useAgentPanelSpendCard(read)
  const labels = useV4Labels()
  if (!spend.slot) return null
  return (
    <V4Intervention
      {...V4_LAB_SLOT_HANDLERS}
      onConfirm={spend.primary}
      onReject={spend.discard}
      data={spend.slot}
      {...(spend.body ? { body: <AgentPanelV4SpendCardBody {...spend.body} /> } : {})}
      labels={labels.intervention}
    />
  )
}

/** Agent 那一句（起草完了，卡在下面问）。 */
const SENTENCE = (locale: Locale, count: number) => L(locale, `已在画布上起草了 ${count} 个镜头，确认就开始生成。`, `Drafted ${count} ${count === 1 ? 'shot' : 'shots'} on the canvas. Confirm to start generating.`)

/**
 * 两层投影要的词表：和面板同一份（`labViewModelLabels`），工具那一行的人话名字换成生产那一份（`readableToolName`），
 * 收据才和真面板一个样。
 */
function useSpendLaneLabels() {
  const fx = useV4Fixtures()
  return React.useMemo(() => ({
    ...labViewModelLabels(fx, ''),
    toolLabel: (name: string, args: unknown) => readableToolName(fx.t, name, args),
    toolSummary: (name: string, args: unknown) => readableToolSummary(fx.t, name, args),
  }), [fx])
}

/**
 * 真面板里那张卡：上面对话流（Agent 那一句；完成态是那一轮——用户那句话、收起的过程行、过程行下面露着的那一句与组指向）、
 * 介入槽里那张卡、下面输入框。卡与收据都由生产件从夹具现算（`useAgentPanelSpendCard`、`laneViewModel`、`collapseV4Flow`），
 * 这里一个字都不手写。
 */
export function SpendCardPanel({ scenario, locale = 'zh-CN', width = V4_PANEL_WIDTH, height = 640, flow, composer, contextUsed = 36000 }: {
  scenario: SpendLabScenario
  locale?: Locale
  width?: number
  height?: number
  /** 换掉上面那段对话（嵌进别的屏的整块面板格子时用那一屏自己的对话）。 */
  flow?: readonly V4FlowItem[]
  composer?: AgentPanelV4PanelProps['composer']
  /** 上下文环用了多少（取景布景）。 */
  contextUsed?: number
}): JSX.Element {
  const read = React.useMemo(() => labRead(scenario), [scenario])
  const spend = useAgentPanelSpendCard(read)
  const fx = useV4Fixtures()
  const laneLabels = useSpendLaneLabels()
  const { t } = useTranslation()
  const lead = React.useMemo<readonly V4FlowItem[]>(() => flow ?? (scenario.done
    // 和真面板同一条路：两层投影出流水，再按回合把工作折成一行过程（收据在折起来的那一行里，那一句与组指向露在外面）。
    ? collapseV4Flow(laneFlowItems(laneSnapshotGenerateDone(OPERATION_ID, scenario.shots.map(shotIdOf), locale === 'en'), laneLabels), t)
    : [{ kind: 'assistant', text: SENTENCE(locale, scenario.shots.length), status: 'complete' }]), [flow, scenario, locale, laneLabels, t])
  const body = spend.body ? <AgentPanelV4SpendCardBody {...spend.body} narrow={width <= 320} /> : null
  // 刹车只在「直接生成」档出现：输入框停在这一档、上沿那条常驻提醒也在，和真面板同一个样子。
  const brakeComposer = scenario.brake ? {
    composer: { ...composer, permission: 'direct' as const },
    composerBanner: (
      <V4AutoModeBanner
        label={t('agentPanelV4.permission.direct')}
        note={t('agentPanelV4.autoModeBannerNote')}
        revertLabel={t('agentPanelV4.autoModeBannerRevert')}
        dismissLabel={t('agentPanelV4.autoModeBannerDismiss')}
        onRevert={() => undefined}
        onDismiss={() => undefined}
      />
    ),
  } : (composer ? { composer } : {})
  return (
    <AgentPanelV4Panel
      flow={lead}
      slotHandlers={{ ...V4_LAB_SLOT_HANDLERS, onConfirm: spend.primary, onReject: spend.discard }}
      {...(spend.slot ? { slot: spend.slot } : {})}
      {...(spend.slot && body ? { slotBody: body } : {})}
      context={{ ...fx.context, used: contextUsed }}
      width={width}
      height={height}
      {...brakeComposer}
    />
  )
}
