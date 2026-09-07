// Agent lane · 「用户在输入框里打了一句话，这句话是什么意思」——三态映射（纯函数）
//
// ── 它解决的真实摩擦（D1）──
// 用户看着一张「要不要让我改这段文稿」的卡，打了一句「不对，横屏」。今天的系统把这句话
// 当成**下一轮的新指令**排进队里：卡还在那儿等着，而模型直到用户再点一次「不要」才知道
// 他想说什么。用户的体感是「我说了它没听见」。
//
// 90% 的情况下，等待期打的那句话就是**对这张卡的回答**（方案 §1.3 那张表）。所以：
//
//   面板状态        默认动作                      次选（一个明确的按钮）
//   有卡在等   →   「不要」+ 这句话当 reason      「排到下一步」= steer
//   在跑没卡   →   steer（下一次请求前注入）      「等它做完再说」= followUp
//   空闲       →   新一轮 prompt                 —
//
// ── 为什么是一个纯函数，而不是几个 if 散在 composer 组件里 ──
// 这三行是**产品语义**，不是渲染细节：它决定用户那句话会不会花一次模型请求、会不会
// 让一张卡继续等下去。散进组件就只能靠截图证明，而截图证不了「这句话最后走了哪条路」。
// 放在中立契约层，是因为主进程侧的验收门（G3e）和渲染层的单测要用**同一份**判据——
// 两侧各写一份的话，面板说 steer、宿主做 followUp，而两边的测试都是绿的。
import type { LaneCommand, LaneProjection } from './laneContracts'

/** 输入框那一刻面对的是什么。顺序即优先级：等人的卡永远盖过「在跑」。 */
export type LaneComposerState = 'awaiting-approval' | 'running' | 'idle'

/**
 * 一个可选动作的身份。**它不是文案**——可见文字全部走 i18n（R15），这一层只说
 * 「这个按钮是哪一个」，让主进程与渲染层对同一个身份说同一句话。
 */
export const LANE_COMPOSER_OPTIONS = ['deny-with-reason', 'queue-steer', 'queue-follow-up', 'new-turn'] as const
export type LaneComposerOption = (typeof LANE_COMPOSER_OPTIONS)[number]

export interface LaneComposerChoice {
  readonly option: LaneComposerOption
  readonly command: LaneCommand
}

export interface LaneComposerIntent {
  readonly state: LaneComposerState
  /** 用户直接按回车会发生的事。 */
  readonly primary: LaneComposerChoice
  /** 那个明确的按钮。空闲态没有次选——「新一轮」没有第二种读法。 */
  readonly secondary?: LaneComposerChoice
}

export function laneComposerState(projection: LaneProjection): LaneComposerState {
  if (projection.pending) return 'awaiting-approval'
  return projection.running ? 'running' : 'idle'
}

/**
 * 把「当前状态 + 用户打的那句话」解成一次动作。
 *
 * `text` **一字不改**地穿过去：在「有卡在等」那一支它会成为模型看到的拒收理由
 * （pi 把 `before_tool` 的 `block.reason` 原样做成那次调用的 tool result），
 * 在另外两支它就是用户的话。任何在这里加前缀、加引号、加「用户说：」的做法，
 * 都是在替用户改口——而他正等着模型按他说的那句话重新规划。
 */
export function laneComposerIntent(projection: LaneProjection, text: string): LaneComposerIntent {
  const state = laneComposerState(projection)
  const pending = projection.pending
  if (state === 'awaiting-approval' && pending) {
    return {
      state,
      primary: {
        option: 'deny-with-reason',
        command: { kind: 'approval', toolCallId: pending.toolCallId, action: 'deny', reason: text },
      },
      // 次选是「排到下一步」：卡**仍然在等**，这句话排给下一次请求。
      // 它不是「拒绝得温柔一点」——它是「这句话跟这张卡无关」。
      secondary: { option: 'queue-steer', command: { kind: 'steer', text } },
    }
  }
  if (state === 'running') {
    return {
      state,
      primary: { option: 'queue-steer', command: { kind: 'steer', text } },
      secondary: { option: 'queue-follow-up', command: { kind: 'follow-up', text } },
    }
  }
  return { state, primary: { option: 'new-turn', command: { kind: 'prompt', text } } }
}
