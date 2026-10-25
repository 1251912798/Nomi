// 监视器读付费卡标题「问的是几镜」（铁律 3 card-scope-mismatch 拿它比还没决定的镜数）。
// 原场景（2026-10-25 全功能走查 pb01 英文场）：两镜卡去掉一镜，标题是单数「Generate this image?」，没有数字，
// 监视器回落到出价里的镜数（D2 起含去掉的那一镜）读成 2，报了一条假的 card-scope-mismatch。
import { describe, expect, it } from 'vitest'

import { spendCardTitleCount, UI_LOCALES, uiTextWith } from './invariants.mjs'

const KEYS = ['agentPanelV4.spendParamsTitle', 'agentPanelV4.spendParamsTitleImage']

describe('spendCardTitleCount：照词典认标题问的是几镜', () => {
  for (const locale of UI_LOCALES) {
    for (const key of KEYS) {
      it(`${locale} · ${key}：单数标题认成 1，复数标题把数量交给按钮`, () => {
        const one = uiTextWith(locale, key, { count: 1 })
        const many = uiTextWith(locale, key, { count: 2 })
        expect(spendCardTitleCount(one, locale, 12), one).toBe(1)
        expect(spendCardTitleCount(many, locale, 12), many).toBeNull()
      })
    }
  }

  it('英文单数没有数字，照样认成 1', () => {
    const title = uiTextWith('en', 'agentPanelV4.spendParamsTitleImage', { count: 1 })
    expect(title).not.toMatch(/\d/)
    expect(spendCardTitleCount(title, 'en', 2)).toBe(1)
  })

  it('不是那一句问话 → null（不猜，交给监视器照实报）', () => {
    expect(spendCardTitleCount('Something else entirely', 'en', 3)).toBeNull()
    expect(spendCardTitleCount('', 'zh-CN', 3)).toBeNull()
  })
})
