// 设计实验室 · 屏「付费卡」：SpendCardQ1 板 ①–⑧ 与连带状态（2026-10-24 D2 第③步）。
//
// 每一格都是真面板里那张卡：数据走生产钩子 `useAgentPanelSpendCard`（和真面板同一条路），卡体是指向元素 + 一行只读摘要
// （NodePointer 生产件），夹具只是画布节点、制作 Run 与宿主推过来的那一次出价（见 `spendCardLabKit.tsx`）。
// 卡上没有一个可改的东西：想改点指向元素去节点里改（设计系统 §1.0）。
//
// 板上的价格、型号、时长是占位示例；这里的价目挂在目录夹具上、走生产估价函数，页脚只印「N 段」（D5：界面不谈钱）。
import React, { type JSX } from 'react'
import type { LabState } from '../../labScreen'
import type { Locale } from '../../nodePointer/nodePointerLabKit'
import { SpendCardPanel, SpendCardStage, spendLabNodeId, type SpendLabScenario, type SpendLabScene, type SpendLabShot } from '../spendCardLabKit'

const SOURCE = 'docs/design/boards/2026-10-23/SpendCardQ1.board.json'

const undecided = (shot: 1 | 2 | 3, extra: Partial<SpendLabShot> = {}): SpendLabShot => ({ shot, offer: 'undecided', ...extra })
const pointer = (shot: 1 | 2 | 3): string => `[data-v4-block="spend-body"] [data-node-pointer-id="${spendLabNodeId(shot)}"]`

/** 三段 16:9（4 / 5 / 4 秒），每段同价。 */
const THREE: readonly SpendLabShot[] = [undecided(1, { duration: 4 }), undecided(2, { duration: 5 }), undecided(3, { duration: 4 })]

const SCENARIOS = {
  /** ① 单段：一个指向元素（画面左、摘要右）+ 页脚「1 段」+「取消 · 生成」。 */
  single: { shots: [undecided(1, { duration: 4 })], pricing: 'flat' },
  /** ② 三段：组指向 + 一行合起来的摘要（共 13s）+ 页脚「3 段」+「取消 · 生成 3 段」。 */
  batch: { shots: THREE, pricing: 'flat' },
  /** ③ 正在发出：镜 01 生成中、镜 02 正在提交、镜 03 排队等交；动作行只说怎么停。 */
  sending: {
    shots: [
      { shot: 1, duration: 4, offer: 'sent', node: 'generating' },
      { shot: 2, duration: 5, offer: 'handing_over', bound: true, node: 'submitting' },
      { shot: 3, duration: 4, offer: 'handing_over' },
    ],
  },
  /** ④ 完成：卡离开那一格，对话流里一句「✓ 已生成 3 段」+ 组指向（节点出结果了）。 */
  done: { done: true, shots: ([1, 2, 3] as const).map((shot) => ({ shot, duration: shot === 2 ? 5 : 4, offer: 'sent', node: 'done' })) },
  /** ④ 完成那一刻（卡刚关、那几段还在生成）：说「✓ 已发出 3 段」，不替还没发生的事下结论。 */
  doneSending: { done: true, shots: [{ shot: 1, offer: 'sent', node: 'done' }, { shot: 2, duration: 5, offer: 'sent', node: 'generating' }, { shot: 3, offer: 'sent', node: 'generating' }] },
  /** ⑤ 没有发出去（没花钱）：⚠ 镜 02 + 原因 + 别的几段此刻怎样；「先不发了 · 再试一次」。 */
  notSent: {
    shots: [
      { shot: 1, offer: 'sent', node: 'generating' },
      { shot: 2, duration: 5, offer: 'not_sent', failure: { kind: 'not_sent', code: 'provider_not_reached' } },
      undecided(3),
    ],
  },
  /** ⑥ 参数被拒：⚠ 镜 02 参数被拒；「先不发了 · ⊙ 去改镜 02」（点了定位到那个节点）。 */
  rejected: {
    shots: [
      { shot: 1, offer: 'sent', node: 'generating' },
      { shot: 2, duration: 5, offer: 'not_sent', failure: { kind: 'parameter_rejected', code: 'provider_rejected' } },
      undecided(3),
    ],
  },
  /** ⑦ 价格算不出：页脚整行不印（绝不写 0），主按钮照常可点。 */
  priceUnknown: { shots: THREE },
  /** ⑧ 逐镜不同（一段横版、两段竖版、时长 4 / 5 / 4）：摘要「… · 16:9 ×1 · 9:16 ×2」+「逐镜 · 3 镜」每镜价。 */
  mixed: { shots: [undecided(1, { duration: 4 }), undecided(2, { ratio: '9:16', duration: 5 }), undecided(3, { ratio: '9:16', duration: 4 })], pricing: 'by-duration' },
  /** 去掉了一段：那一格淡下去、常驻「恢复」，N 跟着减（Q1-A，可撤回）。 */
  excluded: { shots: [undecided(1, { duration: 4 }), { shot: 2, duration: 5, offer: 'removed' }, undecided(3, { duration: 4 })], pricing: 'flat' },
  /** 全去掉了：主按钮置灰、卡留着（还能恢复），要关卡点「取消」。 */
  allRemoved: { shots: ([1, 2, 3] as const).map((shot) => ({ shot, offer: 'removed' })) },
  /** 节点被删：指向元素「已删除」，算作不生成。 */
  deleted: { shots: [undecided(1, { duration: 4 }), undecided(2, { duration: 5 }), { shot: 3, offer: 'removed', deleted: true }], pricing: 'flat' },
  /** 节点上点过 ↑：卡认出这一镜已发，变「生成 2 段」。 */
  remaining: { shots: [{ shot: 1, offer: 'taken_by_canvas', node: 'generating' }, undecided(2, { duration: 5 }), undecided(3, { duration: 4 })], pricing: 'flat' },
  /** 结果未知：可能已经扣了钱，不说没花钱；下一步是去节点上核对，不是再发一次。 */
  unclear: { shots: [{ shot: 1, offer: 'sent', node: 'generating' }, { shot: 2, duration: 5, offer: 'unknown' }, undecided(3)] },
  /** 本机就判得出发不出去（提示词空着），一段能发的都没有：失败留在卡里，「去改镜 01」。 */
  blocked: { shots: [undecided(1, { emptyPrompt: true })] },
  /** 多段里有一段发不出去、其余照常可发：只多一行说明，主按钮不数它。 */
  blockedOne: { shots: [undecided(1, { duration: 4 }), undecided(2, { duration: 5, emptyPrompt: true }), undecided(3, { duration: 4 })] },
  /** 节点里换过模型：徽章不再说「Nomi 选的」。 */
  modelChanged: { shots: THREE, pricing: 'flat', draftedOther: true },
  /** 「直接生成」档的刹车：同一镜连续失败（标题下多一行原因）。 */
  brakeRetry: { shots: [undecided(1, { duration: 4 })], brake: 'retry-limit' },
  /** 「直接生成」档的刹车：计划外的镜头。 */
  brakeOutOfPlan: { shots: [undecided(1, { duration: 4 })], brake: 'out-of-plan' },
  /** 读不到待决出价：那张会说话的缺卡（节点都在画布上，读出价那一步坏了）。 */
  unreadable: { shots: THREE, unreadable: true },
} satisfies Record<string, SpendLabScenario>

function Cell({ scenario, locale = 'zh-CN', scene, width }: { scenario: SpendLabScenario; locale?: Locale; scene?: SpendLabScene; width?: number }): JSX.Element {
  return (
    <SpendCardStage scenario={scenario} locale={locale} {...(scene ? { scene } : {})}>
      <SpendCardPanel scenario={scenario} locale={locale} {...(width ? { width } : {})} />
    </SpendCardStage>
  )
}

export const SPEND_CARD_STATES: readonly LabState[] = [
  {
    id: 'spend-single',
    name: '① 单段：一个指向元素（画面左、摘要右）+ 取消 · 生成',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.single} />,
  },
  {
    id: 'spend-single-en',
    name: '① 单段（英文）',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.single} locale="en" />,
  },
  {
    id: 'spend-batch',
    name: '② 三段：组指向 + 合起来的摘要 + 页脚「3 段」+ 生成 3 段',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.batch} />,
  },
  {
    id: 'spend-batch-en',
    name: '② 三段（英文）',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.batch} locale="en" />,
  },
  {
    id: 'spend-batch-dark',
    name: '② 三段（暗色）',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    render: () => <Cell scenario={SCENARIOS.batch} />,
  },
  {
    id: 'spend-batch-en-dark',
    name: '② 三段（英文 · 暗色）',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    render: () => <Cell scenario={SCENARIOS.batch} locale="en" />,
  },
  {
    id: 'spend-batch-narrow',
    name: '② 三段 · 面板压窄到 300：指向元素只留镜号 + 缩略图',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.batch} width={300} />,
  },
  {
    id: 'spend-exclude-focus',
    name: '② 聚焦镜 02：露出「不生成 ×」，组下方换成这一镜的摘要',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.batch} scene={{ focus: pointer(2) }} />,
  },
  {
    id: 'spend-excluded',
    name: '去掉了镜 02：那一格淡下去、常驻「恢复」，生成 2 段',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.excluded} />,
  },
  {
    id: 'spend-all-removed',
    name: '全去掉了：主按钮置灰、卡留着还能恢复',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.allRemoved} />,
  },
  {
    id: 'spend-deleted',
    name: '镜 03 的节点被删：指向元素「已删除」，算作不生成',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.deleted} />,
  },
  {
    id: 'spend-remaining',
    name: '节点上点过 ↑：生成 2 段',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.remaining} />,
  },
  {
    id: 'spend-sending',
    name: '③ 正在发出 2/3 段：生成中 / 提交中 / 排队中，动作行只说怎么停',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.sending} />,
  },
  {
    id: 'spend-sending-en-dark',
    name: '③ 正在发出（英文 · 暗色）',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    render: () => <Cell scenario={SCENARIOS.sending} locale="en" />,
  },
  {
    id: 'spend-done',
    name: '④ 完成：卡离开那一格，对话流里「✓ 已生成 3 段」+ 组指向',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.done} />,
  },
  {
    id: 'spend-done-sending',
    name: '④ 完成那一刻（还在生成）：「✓ 已发出 3 段」',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.doneSending} />,
  },
  {
    id: 'spend-done-en-dark',
    name: '④ 完成（英文 · 暗色）',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    render: () => <Cell scenario={SCENARIOS.done} locale="en" />,
  },
  {
    id: 'spend-not-sent',
    name: '⑤ 镜 02 没有发出去：原因 + 别的几段怎样；先不发了 · 再试一次',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.notSent} />,
  },
  {
    id: 'spend-not-sent-en-dark',
    name: '⑤ 没有发出去（英文 · 暗色）',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    render: () => <Cell scenario={SCENARIOS.notSent} locale="en" />,
  },
  {
    id: 'spend-rejected',
    name: '⑥ 镜 02 参数被拒：先不发了 · ⊙ 去改镜 02',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.rejected} />,
  },
  {
    id: 'spend-rejected-en',
    name: '⑥ 参数被拒（英文）',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.rejected} locale="en" />,
  },
  {
    id: 'spend-unclear',
    name: '结果未知：不说没花钱，先不发了 · ⊙ 去看镜 02',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.unclear} />,
  },
  {
    id: 'spend-blocked',
    name: '本机就判得出发不出去（提示词空着）：去改镜 01',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.blocked} />,
  },
  {
    id: 'spend-blocked-one',
    name: '三段里一段发不出去：只多一行说明，生成 2 段',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.blockedOne} />,
  },
  {
    id: 'spend-price-unknown',
    name: '⑦ 价格算不出：页脚整行不印，主按钮照常可点',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.priceUnknown} />,
  },
  {
    id: 'spend-mixed',
    name: '⑧ 逐镜不同：一横两竖 + 「逐镜 · 3 镜」每镜价（展开）',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.mixed} scene={{ openPerShot: true }} />,
  },
  {
    id: 'spend-mixed-en',
    name: '⑧ 逐镜不同（英文，长文案）',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.mixed} locale="en" scene={{ openPerShot: true }} />,
  },
  {
    id: 'spend-model-changed',
    name: '节点里换过模型：徽章只说「生成」，不再说「Nomi 选的」',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.modelChanged} />,
  },
  {
    id: 'spend-brake-retry',
    name: '「直接生成」档刹车：同一镜连续失败（标题下多一行原因）',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.brakeRetry} />,
  },
  {
    id: 'spend-brake-out-of-plan-en',
    name: '「直接生成」档刹车：计划外的镜头（英文）',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.brakeOutOfPlan} locale="en" />,
  },
  {
    id: 'spend-unreadable',
    name: '读不到待决出价：会说话的缺卡（不是「没有」）',
    source: SOURCE,
    coverage: 'shell',
    render: () => <Cell scenario={SCENARIOS.unreadable} />,
  },
]
