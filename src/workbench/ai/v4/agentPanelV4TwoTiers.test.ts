import { describe, expect, it } from 'vitest'
import * as logic from './agentPanelV4Logic'
import * as types from './agentPanelV4Types'
import { enAgentPanelV4, zhAgentPanelV4 } from '../../../i18n/locales/agentPanelV4'

// 线 L19 第一轮 · 必红：面板侧（设计卡格 ★1 / ★4 / 切档确认 / 文案）。

describe('挡位列表：两档，请求批准是默认', () => {
  it('PERMISSION_TIERS === [request, direct]，默认 request', () => {
    expect([...types.PERMISSION_TIERS]).toEqual(['request', 'direct'])
    expect(types.DEFAULT_PERMISSION_TIER).toBe('request')
  })
  it('两档映射到合同', () => {
    expect(logic.approvalPolicyForTier('request' as never).mode).toBe('request')
    expect(logic.approvalPolicyForTier('direct' as never).mode).toBe('direct')
  })
})

describe('切档确认：只有切进「直接生成」才弹', () => {
  const needs = (from: string, to: string) =>
    (logic as unknown as { tierSwitchNeedsConfirm: (a: string, b: string) => boolean }).tierSwitchNeedsConfirm(from, to)
  it('request → direct 弹；direct → request 不弹；同档不弹', () => {
    expect(needs('request', 'direct')).toBe(true)
    expect(needs('direct', 'request')).toBe(false)
    expect(needs('direct', 'direct')).toBe(false)
  })
})

describe('文案：每档一行灰字，说清会发生什么；不出现价格 / 预算 / 额度', () => {
  // 词典的形状按「可能还没有这些键」来读（第一轮必红时它们不存在），所以先抹成这份最小形状再断言。
  type TierCopy = Readonly<{
    permission: Readonly<Record<string, string>>
    permissionWhy: Readonly<Record<string, string>>
    autoModeConfirmTitle: string
    autoModeConfirmBody: string
    brakeRetry?: Readonly<{ title?: unknown }>
    brakeOutOfPlan?: Readonly<{ title?: unknown }>
    brakeStopped?: Readonly<{ title?: unknown }>
  }>
  const zh = zhAgentPanelV4 as unknown as TierCopy
  const en = enAgentPanelV4 as unknown as TierCopy
  // 不抄整句：check:test-copy-literals 禁止测试一字不差地复制词典文案（两份真相）；这里钉的是拍板的每一个事实。
  it('zh 每档一行灰字，说的是拍板的事实', () => {
    expect(Object.keys(zh.permission)).toEqual(['request', 'direct'])
    // 请求批准：能撤销的直接做；要生成、做撤销不了的事先停下等确认。
    expect(zh.permissionWhy.request).toMatch(/能撤销的直接做/)
    expect(zh.permissionWhy.request).toMatch(/要生成.*撤销不了.*确认/)
    // 直接生成：直接开跑不用逐次确认；连续失败 / 计划外会停；随时可停止。
    expect(zh.permissionWhy.direct).toMatch(/直接开跑/)
    expect(zh.permissionWhy.direct).toMatch(/不用一次次确认/)
    expect(zh.permissionWhy.direct).toMatch(/连续失败/)
    expect(zh.permissionWhy.direct).toMatch(/计划外/)
    expect(zh.permissionWhy.direct).toMatch(/停止/)
    expect(zh.permissionWhy.request).not.toBe(zh.permissionWhy.direct)
  })
  // 已知限制如实说（2026-10-16 协调裁定 A）：按文稿里的分镜方案出图走的是另一条确认路，两档下都仍会每批问一次。
  it('直接生成的灰字与切档确认都说清「按文稿方案出图仍会每批问一次」（zh + en）', () => {
    for (const text of [zh.permissionWhy.direct, zh.autoModeConfirmBody]) expect(text).toMatch(/文稿.*分镜方案.*每批问一次/)
    for (const text of [en.permissionWhy.direct, en.autoModeConfirmBody]) expect(text).toMatch(/storyboard plan.*still asks once per batch/)
  })
  it('en 同样只有两档', () => {
    expect(Object.keys(en.permission)).toEqual(['request', 'direct'])
    expect(Object.keys(en.permissionWhy)).toEqual(['request', 'direct'])
  })
  it('切档确认文案说清「会直接开跑、不再逐次问」，且不含价格 / 预算 / 额度 / 花钱字样', () => {
    expect(zh.autoModeConfirmBody).toMatch(/直接开跑.*不再逐次问/)
    const all = JSON.stringify([zh.permission, zh.permissionWhy, zh.autoModeConfirmTitle, zh.autoModeConfirmBody, zh.brakeRetry, zh.brakeOutOfPlan, zh.brakeStopped])
    expect(all).not.toMatch(/价格|预算|额度|费用|花钱|¥|免费/)
    const allEn = JSON.stringify([en.permission, en.permissionWhy, en.autoModeConfirmTitle, en.autoModeConfirmBody, en.brakeRetry, en.brakeOutOfPlan, en.brakeStopped])
    expect(allEn).not.toMatch(/price|budget|quota|credit|cost|free/i)
  })
  it('刹车触发时报价卡多一行说明（zh + en）：连续失败 / 计划外 / 已停止各一条', () => {
    for (const bag of [zh, en]) {
      for (const key of ['brakeRetry', 'brakeOutOfPlan', 'brakeStopped'] as const) expect(typeof bag[key]?.title).toBe('string')
    }
  })
})
