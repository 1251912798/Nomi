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
  const zh = zhAgentPanelV4 as unknown as Record<string, any>
  const en = enAgentPanelV4 as unknown as Record<string, any>
  it('zh 灰字与拍板原文一致', () => {
    expect(zh.permission).toEqual({ request: '请求批准', direct: '直接生成' })
    expect(zh.permissionWhy.request).toBe('改文案、摆节点这类能撤销的直接做；要花钱生成，或做撤销不了的事，先停下来等你确认。')
    expect(zh.permissionWhy.direct).toBe('要生成就直接开跑，不用一次次确认；同一个镜头连续失败、或要做计划外的生成时会停下来问你，随时可以点停止。')
  })
  it('en 同样只有两档', () => {
    expect(Object.keys(en.permission)).toEqual(['request', 'direct'])
    expect(Object.keys(en.permissionWhy)).toEqual(['request', 'direct'])
  })
  it('切档确认文案说清「会自动花钱」，且不含价格 / 预算 / 额度字样', () => {
    expect(zh.autoModeConfirmBody).toMatch(/花钱/)
    const all = JSON.stringify([zh.permission, zh.permissionWhy, zh.autoModeConfirmTitle, zh.autoModeConfirmBody, zh.brakeRetry, zh.brakeOutOfPlan])
    expect(all).not.toMatch(/价格|预算|额度|费用|¥|免费/)
    const allEn = JSON.stringify([en.permission, en.permissionWhy, en.autoModeConfirmTitle, en.autoModeConfirmBody, en.brakeRetry, en.brakeOutOfPlan])
    expect(allEn).not.toMatch(/price|budget|quota|credit|cost|free/i)
  })
  it('刹车触发时界面有文案：连续失败 / 计划外各一条（zh + en），含「继续」去向', () => {
    for (const bag of [zh, en]) {
      expect(typeof bag.brakeRetry?.title).toBe('string')
      expect(typeof bag.brakeOutOfPlan?.title).toBe('string')
      expect(typeof bag.brakeRetry?.continue).toBe('string')
      expect(typeof bag.brakeOutOfPlan?.continue).toBe('string')
    }
  })
})
