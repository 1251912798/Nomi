// Agent lane · 「这一刻该对用户说哪句话」→ i18n 键（纯映射，唯一 owner）
//
// 它只做一件事：把中立契约层的**身份**（`LaneComposerOption`、`LaneCancelQueuedResult`）
// 换成一个 i18n 键。翻译在 `src/i18n/locales/agentPanelV4.ts`，取词的是组件。
//
// **为什么这层要单独存在，而不是在组件里写一串 `?:`**：这些身份是主进程和渲染层
// 共用的词表（`laneComposerIntent.ts` / `laneContracts.ts`），而「每个身份都有一句话」
// 这件事必须是穷尽的——`Record<身份, 键>` 让漏掉一个变成**编译错误**，
// 写在组件里的 `?:` 漏掉一个只会在那一刻渲染出空白（R28：防线建在最早能拦住的那层）。
import type { LaneCancelQueuedResult } from '../../../../electron/shared/agentLane/laneContracts'
import type { LaneComposerOption } from '../../../../electron/shared/agentLane/laneComposerIntent'

/**
 * 撤回一条排队插话之后，那一行该说什么。
 *
 * **`already_consumed` 有它自己的一句话**，这是这张表存在的主要理由：用户点了「撤回」，
 * 而模型上一次请求前刚好把那句话吃进去了。把它画成「已取消」等于告诉用户一件没发生的事——
 * 他会奇怪接下来的回复为什么带着那句话的影响。
 */
export const LANE_CANCEL_QUEUED_LABEL_KEYS: Readonly<Record<LaneCancelQueuedResult, string>> = Object.freeze({
  cancelled: 'agentPanelV4.laneQueueCancelled',
  already_consumed: 'agentPanelV4.laneQueueAlreadyConsumed',
  not_found: 'agentPanelV4.laneQueueNotFound',
})

/**
 * composer 上那个**次选按钮**的文字（主动作是回车，不需要按钮）。
 *
 * 四个身份都在表里，包括空闲态的 `new-turn`——它今天不会出现在按钮上（空闲态没有次选），
 * 但把它留空会让这张表从「穷尽」退化成「大部分」，而下一个人得先读一遍 `laneComposerIntent`
 * 才知道哪一格是故意空的。
 */
export const LANE_COMPOSER_OPTION_LABEL_KEYS: Readonly<Record<LaneComposerOption, string>> = Object.freeze({
  'deny-with-reason': 'agentPanelV4.laneOptionDenyWithReason',
  'queue-steer': 'agentPanelV4.laneOptionQueueSteer',
  'queue-follow-up': 'agentPanelV4.laneOptionQueueFollowUp',
  'new-turn': 'agentPanelV4.laneOptionNewTurn',
})
