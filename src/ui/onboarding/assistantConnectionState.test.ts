import { describe, expect, it } from 'vitest'
import { ASSISTANT_ACTIVE_WINDOW_MS, resolveAssistantConnection, formatUsageAgo, type AssistantVerifyPhase } from './assistantActivationState'

const NOW = 10_000_000
const base = {
  target: 'claude' as const, installed: true, staleShape: false, elsewhere: false,
  verifyPhase: 'ok' as AssistantVerifyPhase, trustedHosts: [] as string[], usage: null, now: NOW,
}
const used = (agoMs: number, inFlight = 0) => ({ lastSeenAt: NOW - agoMs, lastCall: { at: NOW - agoMs }, inFlight })

// 卡头五种徽章 × 状态框 × 小圆点：每一行是一种真实处境（画布 v5）。
describe('AI 助手连接 · 状态矩阵', () => {
  const rows: Array<[string, Parameters<typeof resolveAssistantConnection>[0], string, string, string | null]> = [
    ['没接入', { ...base, installed: false }, 'none', 'none', null],
    ['刚调用过', { ...base, usage: used(5_000) }, 'using', 'using', 'green'],
    ['有调用还没跑完（哪怕很久以前开始）', { ...base, usage: used(5 * 60_000, 1) }, 'using', 'using', 'green'],
    ['三小时前来过', { ...base, usage: used(3 * 3_600_000) }, 'recent', 'connected', 'green'],
    ['只握手没调用过', { ...base, usage: { lastSeenAt: NOW - 1000, lastCall: null, inFlight: 0 } }, 'recent', 'connected', 'green'],
    ['写了配置、实连通、助手没来过', { ...base }, 'written', 'pending', 'yellow'],
    ['写了配置、实连还没回来', { ...base, verifyPhase: 'checking' }, 'written', 'checking', 'yellow'],
    ['没有验证能力（老 preload）', { ...base, verifyPhase: null }, 'written', 'pending', 'yellow'],
    ['宿主自己还要批准（Cursor）没来过', { ...base, target: 'cursor' }, 'host-approval', 'pending', 'yellow'],
    ['Cursor 真调用过 = 已经批准', { ...base, target: 'cursor', usage: used(2_000) }, 'using', 'using', 'green'],
    ['实连失败', { ...base, verifyPhase: 'broken' }, 'broken', 'broken', 'yellow'],
    ['过时的配置形状', { ...base, staleShape: true, verifyPhase: null }, 'broken', 'broken', 'yellow'],
    ['配置指向另一份 Nomi', { ...base, elsewhere: true, verifyPhase: null }, 'elsewhere', 'pending', 'yellow'],
  ]
  it.each(rows)('%s', (_name, input, box, badge, dot) => {
    const out = resolveAssistantConnection(input)
    expect({ box: out.box, badge: out.badge, dot: out.dot }).toEqual({ box, badge, dot })
  })

  it('配置坏了就是坏了：哪怕它刚刚来过，也不显示成「正在使用」（失效优先）', () => {
    expect(resolveAssistantConnection({ ...base, verifyPhase: 'broken', usage: used(1_000) }).box).toBe('broken')
  })

  it('「正在使用」的窗口正好是一分钟，与「刚刚」同一条线', () => {
    expect(resolveAssistantConnection({ ...base, usage: used(ASSISTANT_ACTIVE_WINDOW_MS - 1) }).box).toBe('using')
    expect(resolveAssistantConnection({ ...base, usage: used(ASSISTANT_ACTIVE_WINDOW_MS) }).box).toBe('recent')
  })

  it('徽章绿只给「正在使用 / 已接入」，其余都是待办', () => {
    for (const [, input, , badge] of rows) {
      const out = resolveAssistantConnection(input)
      expect(out.headerStatus).toBe(badge === 'using' || badge === 'connected' ? 'ok' : 'todo')
    }
  })
})

describe('相对时间', () => {
  it.each([
    [10_000, 'zh-CN', '刚刚'],
    [3 * 60_000, 'zh-CN', '3分钟前'],
    [3 * 3_600_000, 'zh-CN', '3小时前'],
    [2 * 86_400_000, 'en', '2 days ago'],
    [3 * 3_600_000, 'en', '3 hours ago'],
  ])('%i ms · %s', (ago, locale, expected) => {
    expect(formatUsageAgo(NOW - ago, NOW, locale, '刚刚')).toContain(expected)
  })
})
