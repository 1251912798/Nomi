import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpendConfirmStore } from '../generationCanvas/spend/spendConfirm'
import { handleCapabilityApply } from './capabilityApplyHandler'

// 2026-10-18 拆解前选模型：拆解的报价卡上，读图 / 转写各一行，显示拆解栏里选的那两个模型（目录里的显示名）。
// 以前只有一行 `apimart · gemini-3.5-flash`，转写用谁卡上根本看不到。

vi.mock('../../config/modelCatalogCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/modelCatalogCache')>()
  return {
    ...actual,
    peekCatalogModelOptions: (kind?: string, mode?: string) => kind === 'text'
      ? [{ value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', vendor: 'apimart', vendorName: 'APIMart', modelKey: 'gemini-3.5-flash' }]
      : kind === 'audio' && mode === 'transcribe'
        ? [{ value: 'whisper', label: 'Whisper large-v3-turbo', vendor: 'local-speech', vendorName: '本机', modelKey: 'whisper-large-v3-turbo' }]
        : [],
  }
})

beforeEach(() => { vi.restoreAllMocks() })

describe('拆解报价卡：每条腿一行', () => {
  it('读图 / 转写两行，用目录里的显示名，不再有那一行原始 vendor · modelKey', async () => {
    const confirm = vi.spyOn(useSpendConfirmStore.getState(), 'requestConfirm').mockResolvedValue(true)
    await handleCapabilityApply('spend.confirm', {
      intent: 'deconstruct', vendor: 'apimart', modelKey: 'gemini-3.5-flash', callCount: 4,
      legs: [
        { role: 'vision', vendor: 'apimart', modelKey: 'gemini-3.5-flash' },
        { role: 'transcribe', vendor: 'local-speech', modelKey: 'whisper-large-v3-turbo' },
      ],
    })
    const details = confirm.mock.calls[0][0].details ?? []
    expect(details).toEqual(expect.arrayContaining([
      { label: '读图', value: 'Gemini 3.5 Flash · APIMart' },
      { label: '转写', value: 'Whisper large-v3-turbo · 本机' },
    ]))
    expect(details.map((row) => row.value)).not.toContain('apimart · gemini-3.5-flash')
  })

  it('没有音轨（没有转写腿）：只有读图一行', async () => {
    const confirm = vi.spyOn(useSpendConfirmStore.getState(), 'requestConfirm').mockResolvedValue(true)
    await handleCapabilityApply('spend.confirm', {
      intent: 'deconstruct', vendor: 'apimart', modelKey: 'gemini-3.5-flash', callCount: 3,
      legs: [{ role: 'vision', vendor: 'apimart', modelKey: 'gemini-3.5-flash' }],
    })
    const labels = (confirm.mock.calls[0][0].details ?? []).map((row) => row.label)
    expect(labels).toContain('读图')
    expect(labels).not.toContain('转写')
  })

  it('目录里查不到的模型：退回原始身份，绝不编一个名字', async () => {
    const confirm = vi.spyOn(useSpendConfirmStore.getState(), 'requestConfirm').mockResolvedValue(true)
    await handleCapabilityApply('spend.confirm', {
      intent: 'deconstruct', vendor: 'relay', modelKey: 'mystery-vl', callCount: 2,
      legs: [{ role: 'vision', vendor: 'relay', modelKey: 'mystery-vl' }],
    })
    expect(confirm.mock.calls[0][0].details ?? []).toEqual(expect.arrayContaining([{ label: '读图', value: 'relay · mystery-vl' }]))
  })

  it('不分腿的生成卡不受影响：仍是那一行「模型」', async () => {
    const confirm = vi.spyOn(useSpendConfirmStore.getState(), 'requestConfirm').mockResolvedValue(true)
    await handleCapabilityApply('spend.confirm', { intent: 'image', vendor: 'apimart', modelKey: 'nano-banana-2' })
    expect(confirm.mock.calls[0][0].details ?? []).toEqual(expect.arrayContaining([{ label: '模型', value: 'apimart · nano-banana-2' }]))
  })
})
