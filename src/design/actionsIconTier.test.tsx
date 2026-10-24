import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { IconDownload, IconListCheck } from '@tabler/icons-react'
import { describe, expect, it } from 'vitest'
import { WorkbenchButton, WorkbenchIconButton } from './actions'
import { ICON_TIER_CHEVRON_CLASS, ICON_TIER_CLASSES } from './iconTiers'

// 按钮说了算（用户 2026-10-24 拍板）：工作区按钮用 iconTier 给直接子图标定档位，图标自己不传 size / stroke。
// 这里锁三件事：默认档逐字不变（存量按钮一像素不动）、档位真的换掉 [&>svg] 那一串、下拉箭头是按钮自己画的直接子 svg。
// 渲染尺寸（getBoundingClientRect / computed stroke-width）在真 App 走查里量：tests/ux/icons-f1.walk.mjs。
/** 静态标记里属性值是转义过的（`&` → `&amp;`、`>` → `&gt;`），比类名前先还原。 */
const classOf = (html: string): string => (/class="([^"]*)"/.exec(html)?.[1] ?? '')
  .replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&quot;', '"').replaceAll('&amp;', '&')
const ALL_TIER_CLASSES = Object.values(ICON_TIER_CLASSES).flatMap((value) => value.split(' '))
const tierTokensIn = (className: string): string[] => className.split(/\s+/).filter((token) => ALL_TIER_CLASSES.includes(token))

describe('WorkbenchButton / WorkbenchIconButton 的图标档位', () => {
  it('不传 iconTier = tool 档，class 里只有历史那一串 16 / 2', () => {
    const button = classOf(renderToStaticMarkup(<WorkbenchButton><IconDownload />导出</WorkbenchButton>))
    const iconButton = classOf(renderToStaticMarkup(<WorkbenchIconButton label="下载" icon={<IconDownload />} />))
    for (const className of [button, iconButton]) {
      expect(tierTokensIn(className)).toEqual(['[&>svg]:size-4', '[&>svg]:stroke-2'])
      expect(className).not.toContain('data-button-chevron')
    }
  })

  it.each(['corner', 'bar', 'empty'] as const)('iconTier="%s" 换掉整串档位类，不和 tool 并存', (tier) => {
    const expected = ICON_TIER_CLASSES[tier].split(' ')
    const button = classOf(renderToStaticMarkup(<WorkbenchButton iconTier={tier}><IconListCheck /></WorkbenchButton>))
    const iconButton = classOf(renderToStaticMarkup(<WorkbenchIconButton iconTier={tier} label="任务" icon={<IconListCheck />} />))
    expect(tierTokensIn(button)).toEqual(expected)
    expect(tierTokensIn(iconButton)).toEqual(expected)
  })

  it('iconTier 不漏到 DOM 上', () => {
    const html = renderToStaticMarkup(<><WorkbenchButton iconTier="bar">x</WorkbenchButton><WorkbenchIconButton iconTier="bar" label="x" icon={<IconListCheck />} /></>)
    expect(html.toLowerCase()).not.toContain('icontier')
  })

  it('chevron：按钮自己在末尾画箭头，是直接子 svg（没有包裹层），尺寸归按钮的角标档类', () => {
    const html = renderToStaticMarkup(<WorkbenchButton iconTier="bar" chevron><IconListCheck /><span>布局</span></WorkbenchButton>)
    expect(classOf(html)).toContain(ICON_TIER_CHEVRON_CLASS)
    // 最后一个直接子节点就是箭头 svg：它紧贴着 </button>，前面是标签的 </span>。
    expect(html).toMatch(/<\/span><svg[^>]*data-button-chevron=""[^>]*>.*<\/svg><\/button>$/)
    expect(html.match(/data-button-chevron=""/g)).toHaveLength(1)
    // 箭头的尺寸归按钮的角标档类（Tabler 默认 24 的属性会被它盖掉，类名编译结果见 iconTiers.test.ts），读屏跳过它。
    expect(html).toMatch(/<svg[^>]*data-button-chevron=""[^>]*aria-hidden="true"|<svg[^>]*aria-hidden="true"[^>]*data-button-chevron=""/)
  })

  it('没有 chevron 的按钮不带箭头类，也不画箭头', () => {
    const html = renderToStaticMarkup(<WorkbenchButton iconTier="bar"><IconListCheck /></WorkbenchButton>)
    expect(classOf(html)).not.toContain('data-button-chevron')
    expect(html).not.toContain('tabler-icon-chevron-down')
  })
})
