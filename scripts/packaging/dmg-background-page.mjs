// 打开 DMG 背景源页，注入和出图时一样的两样东西：package.json build.dmg 的布局（window.dmgLayout）、
// 画布节点同款的媒体卡图标（window.dmgIcons）。出图脚本和走查共用这一个入口，走查看到的就是出图用的那一页。
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BACKGROUND_SOURCE, injectedLayout, mediaIconNames } from './dmg-assets.mjs'

/** 媒体卡图标的 SVG：画布节点登记 NODE_ICONS 里的 Tabler 组件按默认属性渲染，尺寸和线宽由背景源定。 */
export async function mediaIconMarkup(repoRoot) {
  const icons = {}
  for (const [kind, name] of Object.entries(mediaIconNames(repoRoot))) {
    const { default: Icon } = await import(`@tabler/icons-react/dist/esm/icons/${name}.mjs`)
    icons[kind] = renderToStaticMarkup(createElement(Icon))
  }
  return icons
}

/** 在 browser 里开一页背景源（scale = 设备像素比），字体就绪后返回。用完由调用方关。 */
export async function openBackgroundPage(browser, repoRoot, dmg, scale = 1) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: scale })
  await page.addInitScript((injected) => Object.assign(window, injected), {
    dmgLayout: injectedLayout(dmg),
    dmgIcons: await mediaIconMarkup(repoRoot),
  })
  await page.goto(pathToFileURL(path.join(repoRoot, BACKGROUND_SOURCE)).href, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  return page
}
