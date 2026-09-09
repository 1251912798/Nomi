// Running input defaults to native steering. The host records the user entry before
// releasing an approval wait; explicit secondary input (Alt+Enter) is follow-up.
// This pure mapping is shared by the renderer client and runtime tests.
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
  /** 显式次级手势。空闲态没有次选——「新一轮」没有第二种读法。 */
  readonly secondary?: LaneComposerChoice
}

export function laneComposerState(projection: LaneProjection): LaneComposerState {
  if (projection.pending) return 'awaiting-approval'
  return projection.running ? 'running' : 'idle'
}

/** Preserve the user's words; the host owns approval wake-up and pi owns queue order. */
export function laneComposerIntent(projection: LaneProjection, text: string): LaneComposerIntent {
  const state = laneComposerState(projection)
  if (state !== 'idle') {
    return {
      state,
      primary: { option: 'queue-steer', command: { kind: 'steer', text } },
      secondary: { option: 'queue-follow-up', command: { kind: 'follow-up', text } },
    }
  }
  return { state, primary: { option: 'new-turn', command: { kind: 'prompt', text } } }
}
