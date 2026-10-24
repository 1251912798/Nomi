import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import i18n, { DEFAULT_LOCALE } from '../../i18n'
import { isUntitledPrompt, promptDisplayTitle } from './promptDisplay'

// 这两个字段会落盘。存储侧存稳定值(未命名 = 空串;来源由 origin 表达),显示名在这一层按界面语言取。
// 老库里躺着 2026-08-28 之前写进去的本地化字符串,读侧必须照旧认它们,否则存量条目会显示成一句
// 硬邦邦的中文标题(而不是「未命名」占位),换语言也回不来。
const userPrompt = (title: string) => ({ title, origin: 'user' as const, source: '我的' })

describe('promptDisplay', () => {
  describe('zh-CN', () => {
    it('空标题 / 老库里的本地化标题都算未命名', () => {
      expect(isUntitledPrompt('')).toBe(true)
      expect(isUntitledPrompt('   ')).toBe(true)
      expect(isUntitledPrompt(undefined)).toBe(true)
      expect(isUntitledPrompt('未命名提示词')).toBe(true)
      expect(isUntitledPrompt('Untitled prompt')).toBe(true)
      expect(isUntitledPrompt('黄昏剪影')).toBe(false)
    })

    it('未命名显占位,有名字显名字', () => {
      expect(promptDisplayTitle(userPrompt(''))).toBe('未命名提示词')
      expect(promptDisplayTitle(userPrompt('黄昏剪影'))).toBe('黄昏剪影')
    })
  })

  describe('en', () => {
    beforeAll(async () => {
      await i18n.changeLanguage('en')
    })
    afterAll(async () => {
      await i18n.changeLanguage(DEFAULT_LOCALE)
    })

    it('存量中文标题在英文界面显英文占位,不再漏出中文', () => {
      expect(promptDisplayTitle(userPrompt('未命名提示词'))).toBe('Untitled prompt')
      expect(promptDisplayTitle(userPrompt(''))).toBe('Untitled prompt')
    })

    it('用户自己起的名字不翻译', () => {
      expect(promptDisplayTitle(userPrompt('黄昏剪影'))).toBe('黄昏剪影')
    })
  })
})

// 2026-09-10 走查反馈回归:库投影曾写死 ["zh-CN"],切界面语言标题不跟。显示层从这里按 i18n 取 curation 双语字段。
describe('curation 双语显示(按界面语言取值)', () => {
  const curated = {
    title: '转台产品广告',
    source: '广告',
    origin: 'public' as const,
    curation: {
      title: { 'zh-CN': '转台产品广告', en: 'Sneaker, 360 Turntable Studio' },
      group: { 'zh-CN': '广告', en: 'Advertising' },
    },
  }

  it('中文界面取 zh-CN,英文界面取 en', () => {
    i18n.changeLanguage('zh-CN')
    expect(promptDisplayTitle(curated)).toBe('转台产品广告')
    i18n.changeLanguage('en')
    expect(promptDisplayTitle(curated)).toBe('Sneaker, 360 Turntable Studio')
    i18n.changeLanguage('zh-CN')
  })

  it('无 curation 的存量/用户条目回退原字段', () => {
    expect(promptDisplayTitle({ title: '我的提示词' })).toBe('我的提示词')
  })
})
