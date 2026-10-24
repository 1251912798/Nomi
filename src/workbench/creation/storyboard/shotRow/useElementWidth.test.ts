import { afterEach, describe, expect, it, vi } from 'vitest'
import { readElementWidth } from './useElementWidth'

afterEach(() => { vi.unstubAllGlobals() })

describe('readElementWidth', () => {
  const element = { clientWidth: 280 } as HTMLElement

  it('padding 档就是 clientWidth（分镜行容器、导演台顶栏的默认档）', () => {
    expect(readElementWidth(element, 'padding')).toBe(280)
  })

  it('content 档减掉左右内边距：素材库抽屉的滚动容器带 px-3，卡片只能占 256', () => {
    vi.stubGlobal('getComputedStyle', () => ({ paddingLeft: '12px', paddingRight: '12px' }))
    expect(readElementWidth(element, 'content')).toBe(256)
  })

  it('读不到内边距按 0 算', () => {
    vi.stubGlobal('getComputedStyle', () => ({ paddingLeft: '', paddingRight: '' }))
    expect(readElementWidth(element, 'content')).toBe(280)
  })
})
