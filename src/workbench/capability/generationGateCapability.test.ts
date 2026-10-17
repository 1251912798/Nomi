import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestConfirm = vi.fn()

vi.mock('../generationCanvas/spend/spendConfirm', () => ({
  useSpendConfirmStore: { getState: () => ({ requestConfirm }) },
}))

import { handleCapabilityApply } from './capabilityApplyHandler'

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
  it.each(['zh-CN', 'en'] as const)('maximumCost null prints 费用未知, never a zero amount (%s)', async (lng) => {
    const { default: i18n } = await import('../../i18n')
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
