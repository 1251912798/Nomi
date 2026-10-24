// 出齐 DMG 安装窗口的三张图（规格和门岗见 ./dmg-assets.mjs）：
//   build/dmg/background.html → package.json build.dmg.background（1x）和同名 @2x.png，electron-builder 打包时合成多分辨率 TIFF
//   build/icon.png → build/dmg/badge.png
// 只在 macOS 上跑：背景里中文那行用系统的苹方，别的系统上渲染出来字形不对。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import {
  BADGE,
  STAMP_KEY,
  backgroundStamp,
  backgroundTargets,
  badgePng,
  itemsOutsideVisibleArea,
  pngSize,
  readDmgConfig,
  withPngText,
} from './dmg-assets.mjs'
import { openBackgroundPage } from './dmg-background-page.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
if (process.platform !== 'darwin') throw new Error('DMG 背景只在 macOS 上渲染：中文那行要用系统苹方')

const dmg = readDmgConfig(root)
const rendered = []
const browser = await chromium.launch({ headless: true })
try {
  for (const { file, scale } of backgroundTargets(dmg)) {
    const page = await openBackgroundPage(browser, root, dmg, scale)
    rendered.push({ file, png: await page.locator('.frame').screenshot({ type: 'png' }) })
    await page.close()
  }
} finally {
  await browser.close()
}

const { width, height } = pngSize(rendered[0].png)
const outside = itemsOutsideVisibleArea(dmg, width, height)
if (outside.length > 0) throw new Error(`DMG 窗口里有条目看不全：${outside.join('；')}`)
const stamp = backgroundStamp(root, dmg)
for (const { file, png } of rendered) {
  fs.writeFileSync(path.join(root, file), withPngText(png, STAMP_KEY, stamp))
  const size = pngSize(png)
  console.log(`Rendered ${file} ${size.width}x${size.height}`)
}
fs.writeFileSync(path.join(root, BADGE), badgePng(root))
console.log(`Generated ${BADGE}`)
