import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpendConfirmStore } from '../generationCanvas/spend/spendConfirm'
import { handleCapabilityApply } from './capabilityApplyHandler'

// 付费确认卡按 intent 分流的现状（特征测试，2026-10-27，改分流之前钉住）：
// · 凭据验证（credential-probe）走自己的卡模块 credentialProbeSpendCard.ts：用户自己点的、不挂节点；
// · 不认识的 intent 落进通用卡：机器人图标、「AI 助手想生成一个素材」、节点行「新节点」、产物行。
// 浏览器「提取提示词」若不给专用卡、直接套通用卡，卡上就是第二格那样，每一句都不对：
// 不是 AI 助手发起的，也不生成素材，更没有节点。
// 分流改成按 intent 查表时（docs/plan/2026-10-27-browser-extract-grant.md §3.4），第一格不许变；
// 第二格等提取专用卡落地时翻过来。

beforeEach(() => { vi.restoreAllMocks() })

describe('付费确认卡按 intent 分流（现状）', () => {
  it('凭据验证：走自己的卡（用户发起、一行模型一行次数），不印节点行', async () => {
    const confirm = vi.spyOn(useSpendConfirmStore.getState(), 'requestConfirm').mockResolvedValue(true)
    await expect(handleCapabilityApply('spend.confirm', {
      intent: 'credential-probe', vendor: 'apimart', modelKey: 'gpt-image-2', callCount: 1,
    })).resolves.toEqual({ confirmed: true })
    expect(confirm).toHaveBeenCalledTimes(1)
    const card = confirm.mock.calls[0][0]
    expect(card).toMatchObject({ kind: 'generation', source: 'user', title: '验证 apimart 的密钥', confirmLabel: '确认并验证' })
    expect(card.details).toEqual([
      { label: '模型', value: 'apimart · gpt-image-2' },
      { label: '调用次数', value: '1' },
    ])
  })

  it('不认识的 intent（今天的「提取提示词」就是这样）：落进通用卡，写成 AI 助手想生成一个素材、挂在「新节点」上', async () => {
    const confirm = vi.spyOn(useSpendConfirmStore.getState(), 'requestConfirm').mockResolvedValue(false)
    await expect(handleCapabilityApply('spend.confirm', {
      intent: 'prompt-extraction', vendor: 'relay', modelKey: 'mystery-vl', callCount: 1,
      nodeId: 'browser-prompt-extraction-1',
      legs: [{ role: 'vision', vendor: 'relay', modelKey: 'mystery-vl' }],
    })).resolves.toEqual({ confirmed: false })
    const card = confirm.mock.calls[0][0]
    expect(card).toMatchObject({ source: 'agent', title: 'AI 助手想生成一个素材' })
    expect(card.details).toEqual([
      { label: '节点', value: '新节点' },
      { label: '读图', value: 'relay · mystery-vl' },
      { label: '产物', value: '一个素材' },
    ])
  })
})
