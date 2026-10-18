import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestConfirm = vi.fn()

vi.mock('../generationCanvas/spend/spendConfirm', () => ({
  useSpendConfirmStore: { getState: () => ({ requestConfirm }) },
}))

import i18n from '../../i18n'
import { handleCapabilityApply } from './capabilityApplyHandler'
import { formatGateExpiry } from './generationGateConfirm'

describe('renderer generation gate confirmation', () => {
  beforeEach(() => {
    requestConfirm.mockReset().mockResolvedValue(true)
  })

  it('shows one plain-language confirmation with model, cost, project, references and expiry', async () => {
    const result = await handleCapabilityApply('generation.gate.confirm', {
      challengeId: 'challenge-1',
      projectName: '短片 A',
      shotSummary: '生成这一镜',
      model: 'model-x',
      referenceCount: 2,
      maximumCost: 5,
      currency: '¥',
      expiresAt: '2026-08-23T01:00:00.000Z',
    })

    expect(result).toEqual({ confirmed: true, challengeId: 'challenge-1' })
    expect(requestConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.any(String),
      message: expect.stringContaining('model-x'),
      source: 'agent',
      kind: 'generation',
      details: expect.arrayContaining([
        { label: expect.any(String), value: '短片 A' },
        { label: expect.any(String), value: 'model-x' },
        { label: expect.any(String), value: '2' },
        { label: expect.any(String), value: '¥5' },
      ]),
    }))
  })

  it('returns a decline without minting anything in the renderer', async () => {
    requestConfirm.mockResolvedValue(false)
    await expect(handleCapabilityApply('generation.gate.confirm', { challengeId: 'challenge-1', model: 'model-x', maximumCost: 5, expiresAt: '2026-08-23T01:00:00.000Z' }))
      .resolves.toEqual({ confirmed: false, challengeId: 'challenge-1' })
  })
})

describe('renderer generation gate: unknown price (C-3)', () => {
  it.each(['zh-CN', 'en'] as const)('maximumCost null prints Unknown, never a zero amount (%s)', async (lng) => {
    await i18n.changeLanguage(lng)
    requestConfirm.mockReset().mockResolvedValue(false)
    await handleCapabilityApply('generation.gate.confirm', {
      challengeId: 'challenge-u',
      projectName: 'P',
      shotSummary: 's',
      model: 'model-x',
      maximumCost: null,
      unknownShotCount: 1,
      currency: 'CNY',
    })
    const call = requestConfirm.mock.calls[0]![0] as { message: string; details: Array<{ value: string }> }
    const shown = `${call.message} ${call.details.map((d) => d.value).join(' ')}`
    expect(shown).not.toMatch(/CNY\s*0|¥\s*0/)
    expect(shown).toContain(i18n.t('runtime.capability.generationGateCostUnknown'))
    await i18n.changeLanguage('zh-CN')
  })
})

// 同一张确认卡的两个 bug（C-3 截图）：英文界面正文混中文；「有效期至」是原始 ISO 串。
describe('renderer generation gate card copy', () => {
  const payload = {
    challengeId: 'challenge-c', projectName: 'P', shotSummary: '生成这一镜', model: 'model-x', maximumCost: null,
    unknownShotCount: 1, currency: 'CNY', expiresAt: '2026-10-17T12:30:00.000Z',
  }
  const cjk = /[\u4e00-\u9fff]/

  it.each(['zh-CN', 'en'] as const)('unknown cost row is the exact label/value pair, sentence is dictionary-only, expiry is not ISO (%s)', async (lng) => {
    await i18n.changeLanguage(lng)
    requestConfirm.mockReset().mockResolvedValue(false)
    await handleCapabilityApply('generation.gate.confirm', payload)
    const call = requestConfirm.mock.calls[0]![0] as { message: string; details: Array<{ label: string; value: string }> }
    const row = (key: string) => call.details.find((d) => d.label === i18n.t(`runtime.capability.${key}`))
    expect(row('generationGateCost')).toEqual({ label: lng === 'en' ? 'Cost' : '费用', value: lng === 'en' ? 'Unknown' : '未知' })
    expect(call.details.map((d) => d.value).join(' ')).not.toMatch(/\d{4}-\d{2}-\d{2}T|Z\b/)
    expect(row('generationGateExpires')?.value).toBeTruthy()
    if (lng === 'en') {
      // 动作半句来自词典：英文界面正文里没有中文（镜头摘要是调用方内容，单独一行，不拼进句子）。
      expect(call.message).not.toMatch(cjk)
      expect(row('generationGateShot')?.value).toBe('生成这一镜')
    }
    await i18n.changeLanguage('zh-CN')
  })

  it('formatGateExpiry gives a short local time and passes unparseable text through', async () => {
    const out = formatGateExpiry('2026-10-17T12:30:00.000Z', 'en')
    expect(out).not.toContain('2026-10-17T')
    expect(out).toMatch(/\d{1,2}[:：]\d{2}/)
    expect(formatGateExpiry('not a time', 'en')).toBe('not a time')
  })
})

// 结构解的渲染端一半：费用那一行只由收到的 maximumCost 决定——数字 → 币种 + 该数字；缺席 / null / 非有限数 → 「未知」，
// 任何情况下都不会凭空出现别的数字（金额来源只有主进程的 reservationMaximumForDisplay，见 reservationAmountSingleExit.structure.test.ts）。
describe('renderer generation gate: cost row only comes from maximumCost', () => {
  const base = { challengeId: 'c', projectName: 'P', model: 'm', currency: 'CNY', unknownShotCount: 1 }
  it.each([
    { maximumCost: null, shown: 'unknown' },
    { maximumCost: undefined, shown: 'unknown' },
    { maximumCost: Number.NaN, shown: 'unknown' },
    { maximumCost: Number.POSITIVE_INFINITY, shown: 'unknown' },
    { maximumCost: 12, shown: 'CNY12' },
    { maximumCost: 0, shown: 'CNY0' },
  ])('maximumCost=$maximumCost → $shown', async ({ maximumCost, shown }) => {
    await i18n.changeLanguage('zh-CN')
    requestConfirm.mockReset().mockResolvedValue(false)
    await handleCapabilityApply('generation.gate.confirm', { ...base, maximumCost })
    const call = requestConfirm.mock.calls[0]![0] as { details: Array<{ label: string; value: string }> }
    const row = call.details.find((d) => d.label === i18n.t('runtime.capability.generationGateCost'))
    expect(row?.value).toBe(shown === 'unknown' ? i18n.t('runtime.capability.generationGateCostUnknown') : shown)
  })
})
