import { describe, expect, it } from 'vitest'
import { narrateProgress } from './narrate'
import i18n from '../../i18n'

describe('C1 honest narration boundary', () => {
  it('uses the approved phase wording and elapsed time from the first second', () => {
    expect(narrateProgress('queued')).toBe('排队中')
    expect(narrateProgress('generating', { elapsedMs: 1000 })).toBe('生成中 · 已等 1 秒')
    expect(narrateProgress('retrying', { elapsedMs: 18000 })).toContain('已等 18 秒')
    expect(narrateProgress('finalizing')).toBe('正在存到你电脑上')
  })
  it('omits unknown queue position and includes a real position', () => {
    expect(narrateProgress('comfyui-queued')).not.toMatch(/前面|%/)
    expect(narrateProgress('comfyui-queued', { queueAhead: 2 })).toBe('排队 · 前面 2 个')
  })
  it('keeps soft timeout in flight', () => {
    expect(narrateProgress('still-generating', { elapsedMs: 360000 })).toBe('比平时久 · 已等 6 分钟 · 仍在后台跑')
  })
  it('provides English from the same owner', async () => {
    await i18n.changeLanguage('en')
    try { expect(narrateProgress('generating', { elapsedMs: 1000 })).toBe('Generating · 1s elapsed') }
    finally { await i18n.changeLanguage('zh-CN') }
  })
})
