// DMG 安装窗口走查：拍板图 docs/design/boards/2026-10-24-dmg-install-window/DmgInstallWindow.board.json 的实现断言。
// 两段，都只读：
//   ① 背景源：用出图脚本同一个入口（scripts/packaging/dmg-background-page.mjs）打开 build/dmg/background.html，
//      查弧线、三张媒体卡（顺序、媒体轨颜色、画布节点同款图标）、中英提示，以及它们不压 Finder 画的图标和文件名、
//      不落进 macOS 26 看不见的底部。入库的 PNG 是不是这一页出的，由 check:icons 的戳管。
//   ② 真 DMG（--dmg <路径>，只在 macOS 上）：像用户一样双击打开，问 Finder 窗口多大、图标多大、两个条目在哪，
//      再查卷名、卷图标、背景图两档；--shot 截下窗口。只弹出这次自己打开的卷；这个 DMG 已经挂着就不跑（那不是第一次打开的样子）。
//   没给 --dmg 时第②段每项记 SKIP，不算通过。
//
// 用法：node tests/ux/dmg-install-window.walk.mjs [--dmg release/Nomi-mac-arm64.dmg] [--shot]
// 输出：每项一行 PASS / FAIL / SKIP，任一 FAIL 非零退出；截图写到 tests/ux/shots/dmg-install-window/。
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import {
  LABEL_BLOCK,
  MACOS26_HIDDEN_BOTTOM,
  MACOS_ICON_GRID,
  MEDIA_KINDS,
  backgroundTargets,
  mediaIconNames,
  pngSize,
  readDmgConfig,
} from '../../scripts/packaging/dmg-assets.mjs'
import { openBackgroundPage } from '../../scripts/packaging/dmg-background-page.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dmgArg = process.argv.indexOf('--dmg')
const dmgPath = dmgArg > 0 ? path.resolve(process.argv[dmgArg + 1]) : null
const shot = process.argv.includes('--shot')
const output = path.join(root, 'tests/ux/shots/dmg-install-window')

// 拍板时定的提示原文（和 README / docs/quickstart.md 的路径一致）。
const HINT_LINES = [
  '第一次打开若被拦：系统设置 › 隐私与安全性 › 仍要打开',
  'Blocked on first open? System Settings › Privacy & Security › Open Anyway',
]

const results = []
async function check(name, body) {
  try {
    await body()
    results.push({ name, status: 'PASS' })
    console.log(`PASS ${name}`)
  } catch (error) {
    results.push({ name, status: 'FAIL' })
    console.log(`FAIL ${name} — ${error.message}`)
  }
}
function skip(name, reason) {
  results.push({ name, status: 'SKIP' })
  console.log(`SKIP ${name} — ${reason}`)
}

const dmg = readDmgConfig(root)
const [{ width, height }, retina] = backgroundTargets(dmg).map(({ file }) => pngSize(fs.readFileSync(path.join(root, file))))
const app = dmg.contents.find((item) => item.type === 'file')
const applications = dmg.contents.find((item) => item.type === 'link')
const half = dmg.iconSize / 2
// Finder 里图标实际画到的方块（图标网格四周的透明边不算），和图标下面文件名占的条。
const inset = dmg.iconSize * (MACOS_ICON_GRID.canvas - MACOS_ICON_GRID.art) / 2 / MACOS_ICON_GRID.canvas
const finderDrawn = [app, applications].flatMap((item) => [
  { what: `${item.type === 'file' ? 'Nomi' : 'Applications'} 图标`, x: item.x - half + inset, y: item.y - half + inset, width: dmg.iconSize - inset * 2, height: dmg.iconSize - inset * 2 },
  { what: `${item.type === 'file' ? 'Nomi' : 'Applications'} 文件名`, x: item.x - 90, y: item.y + half, width: 180, height: LABEL_BLOCK },
])
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const kebab = (iconName) => iconName.replace(/^Icon/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

// ① 背景源
const browser = await chromium.launch({ headless: true })
let scene
try {
  const page = await openBackgroundPage(browser, root, dmg)
  scene = await page.evaluate(() => {
    const frame = document.querySelector('.frame').getBoundingClientRect()
    const box = (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x - frame.x, y: r.y - frame.y, width: r.width, height: r.height }
    }
    const tokenFill = (token) => {
      const probe = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      probe.style.fill = `var(${token})`
      document.querySelector('.scene').append(probe)
      const value = getComputedStyle(probe).fill
      probe.remove()
      return value
    }
    return {
      frame: { width: frame.width, height: frame.height },
      arc: box(document.querySelector('.arc')),
      cards: Array.from(document.querySelectorAll('.scene > g > g')).map((card) => ({
        className: card.getAttribute('class'),
        box: box(card),
        fill: getComputedStyle(card.querySelector('.chip')).fill,
        icon: Array.from(card.querySelector('.glyph svg').classList).find((name) => name.startsWith('tabler-icon-')),
      })),
      trackFills: { text: tokenFill('--nomi-track-text'), image: tokenFill('--nomi-track-image'), video: tokenFill('--nomi-track-video') },
      hint: box(document.querySelector('.hint')),
      hintLines: Array.from(document.querySelectorAll('.hint span')).map((line) => ({ text: line.textContent, box: box(line) })),
    }
  })
  await page.close()
} finally {
  await browser.close()
}

await check('背景画框就是窗口：1x 背景图的尺寸，@2x 正好两倍 · board:DmgInstallWindow/dmg.window', () => {
  assert.deepEqual(scene.frame, { width, height }, '背景源的画框和入库的 1x 背景图尺寸不一致')
  assert.deepEqual(retina, { width: width * 2, height: height * 2 })
})

await check('弧线从 Nomi 一侧连到「应用程序」一侧，压在图标上方 · board:DmgInstallWindow/dmg.flight-arc', () => {
  assert.ok(scene.arc.x > app.x, `弧线起点 ${scene.arc.x} 没在 Nomi 图标中线 ${app.x} 右边`)
  assert.ok(scene.arc.x + scene.arc.width < applications.x, `弧线终点 ${scene.arc.x + scene.arc.width} 没在「应用程序」中线 ${applications.x} 左边`)
  const iconTop = Math.min(app.y, applications.y) - half + inset
  assert.ok(scene.arc.y + scene.arc.height <= iconTop, `弧线最低点 ${scene.arc.y + scene.arc.height} 压到了图标（图标画到 ${iconTop}）`)
})

await check('三张媒体卡：文本 → 图片 → 视频，媒体轨颜色、画布节点同款图标，不压 Finder 画的东西 · board:DmgInstallWindow/dmg.media-cards', () => {
  const icons = mediaIconNames(root)
  assert.deepEqual(scene.cards.map((card) => card.className), MEDIA_KINDS.map((kind) => `card-${kind}`), '媒体卡的种类或顺序不对')
  scene.cards.forEach((card, index) => {
    const kind = MEDIA_KINDS[index]
    assert.equal(card.fill, scene.trackFills[kind], `${kind} 卡的颜色不是 --nomi-track-${kind}`)
    assert.equal(card.icon, `tabler-icon-${kebab(icons[kind])}`, `${kind} 卡的图标不是画布节点的 ${icons[kind]}`)
    const hit = finderDrawn.find((area) => overlaps(card.box, area))
    assert.equal(hit, undefined, `${kind} 卡压到了 ${hit?.what}`)
    assert.ok(card.box.y >= 0 && card.box.x >= 0 && card.box.x + card.box.width <= width, `${kind} 卡出了画框`)
  })
})

await check('中英两行「第一次打开被拦」提示：原文对，在文件名下面、macOS 26 看得见的区域里 · board:DmgInstallWindow/dmg.first-open-hint', () => {
  assert.deepEqual(scene.hintLines.map((line) => line.text), HINT_LINES)
  const labelsBottom = Math.max(app.y, applications.y) + half + LABEL_BLOCK
  assert.ok(scene.hint.y >= labelsBottom, `提示顶 ${scene.hint.y} 压到了文件名（文件名底 ${labelsBottom}）`)
  assert.ok(scene.hint.y + scene.hint.height <= height - MACOS26_HIDDEN_BOTTOM, `提示底 ${scene.hint.y + scene.hint.height} 落进了 macOS 26 看不见的底部 ${MACOS26_HIDDEN_BOTTOM}pt`)
  for (const line of scene.hintLines) assert.ok(line.box.x >= 16 && line.box.x + line.box.width <= width - 16, `「${line.text}」贴边或出了画框`)
})

// ② 真 DMG
const DMG_CHECKS = [
  '窗口：Finder 里的大小 = 1x 背景图，图标视图，没有工具栏和状态栏 · board:DmgInstallWindow/dmg.window',
  '卷名 = package.json 的 build.dmg.title（产品名 + 版本，不带架构后缀） · board:DmgInstallWindow/dmg.title',
  '卷图标：磁盘 + Nomi 角标（不再是应用图标本身） · board:DmgInstallWindow/dmg.volume-icon',
  'Nomi 图标：位置、尺寸、文件名字号照 build.dmg · board:DmgInstallWindow/dmg.app-icon',
  '「应用程序」替身：指向 /Applications，位置照 build.dmg · board:DmgInstallWindow/dmg.applications',
  '背景图：1x + 2x 两档合成一张 TIFF · board:DmgInstallWindow/dmg.window',
]

const attachedImages = () => JSON.parse(execFileSync('/bin/sh', ['-c', 'hdiutil info -plist | plutil -convert json -o - -'], { encoding: 'utf8' })).images
const mountOf = (image) => (image?.['system-entities'] ?? []).map((entity) => entity['mount-point']).find(Boolean)
const finder = (script) => execFileSync('osascript', ['-e', `tell application "Finder"\n${script}\nend tell`], { encoding: 'utf8' }).trim()
const appleString = (text) => `"${text.replace(/["\\]/g, '\\$&')}"`

async function waitFor(what, probe, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`等不到${what}（${timeoutMs / 1000}s）`)
    await delay(250)
  }
}

if (!dmgPath) {
  for (const name of DMG_CHECKS) skip(name, '没给 --dmg：打包后用 --dmg <DMG 路径> 跑这一段')
} else if (process.platform !== 'darwin') {
  for (const name of DMG_CHECKS) skip(name, '真 DMG 只能在 macOS 上打开')
} else {
  const image = fs.realpathSync(dmgPath)
  const already = mountOf(attachedImages().find((entry) => entry['image-path'] === image))
  if (already) throw new Error(`${image} 已经挂在 ${already}：先弹出再跑，走查要看第一次打开的样子`)
  execFileSync('open', [image])
  const mountPoint = await waitFor('卷挂上', () => mountOf(attachedImages().find((entry) => entry['image-path'] === image)))
  const volume = path.basename(mountPoint)
  try {
    await waitFor('Finder 打开窗口', () => finder(`exists window ${appleString(volume)}`) === 'true')
    const [left, top, right, bottom, view, toolbar, statusbar, iconSize, textSize, labelPosition, appX, appY, linkX, linkY] = finder(`set d to disk ${appleString(volume)}
set w to container window of d
set o to icon view options of w
return {bounds of w, current view of w, toolbar visible of w, statusbar visible of w, icon size of o, text size of o, label position of o, position of item "Nomi.app" of d, position of item "Applications" of d}`).split(', ')

    await check(DMG_CHECKS[0], () => {
      assert.deepEqual({ width: right - left, height: bottom - top }, { width, height })
      assert.deepEqual({ view, toolbar, statusbar }, { view: 'icon view', toolbar: 'false', statusbar: 'false' })
    })
    await check(DMG_CHECKS[1], () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
      const macros = { productName: pkg.build.productName ?? pkg.productName, version: pkg.version }
      const title = dmg.title.replace(/\$\{(\w+)\}/g, (macro, key) => {
        assert.ok(Object.hasOwn(macros, key), `build.dmg.title 用了走查不认识的宏 ${macro}`)
        return macros[key]
      })
      assert.equal(volume, title)
    })
    await check(DMG_CHECKS[2], () => {
      const volumeIcon = fs.readFileSync(path.join(mountPoint, '.VolumeIcon.icns'))
      const finderInfo = execFileSync('xattr', ['-px', 'com.apple.FinderInfo', mountPoint], { encoding: 'utf8' }).replace(/\s+/g, '')
      assert.ok(Number.parseInt(finderInfo.slice(16, 18), 16) & 0x04, '卷根目录没有「自定义图标」标记，Finder 不会用 .VolumeIcon.icns')
      const appIcon = fs.readFileSync(path.join(mountPoint, 'Nomi.app/Contents/Resources/icon.icns'))
      assert.ok(!volumeIcon.equals(appIcon), '卷图标就是应用图标：桌面上的盘会像「已经装好的 Nomi」')
    })
    await check(DMG_CHECKS[3], () => {
      assert.deepEqual([Number(appX), Number(appY)], [app.x, app.y])
      assert.deepEqual([Number(iconSize), Number(textSize), labelPosition], [dmg.iconSize, dmg.iconTextSize, 'bottom'])
    })
    await check(DMG_CHECKS[4], () => {
      assert.equal(fs.readlinkSync(path.join(mountPoint, 'Applications')), applications.path)
      assert.deepEqual([Number(linkX), Number(linkY)], [applications.x, applications.y])
    })
    await check(DMG_CHECKS[5], () => {
      const info = execFileSync('tiffutil', ['-info', path.join(mountPoint, '.background.tiff')], { encoding: 'utf8' })
      const layers = Array.from(info.matchAll(/Image Width: (\d+) Image Length: (\d+)/g), (match) => ({ width: Number(match[1]), height: Number(match[2]) }))
      assert.deepEqual(layers, [{ width, height }, retina])
    })
    if (shot) {
      fs.mkdirSync(output, { recursive: true })
      const appearance = spawnSync('defaults', ['read', '-g', 'AppleInterfaceStyle'], { encoding: 'utf8' }).stdout.trim() === 'Dark' ? 'dark' : 'light'
      finder(`activate\nset index of window ${appleString(volume)} to 1`)
      await delay(800)
      const file = path.join(output, `finder-${appearance}.png`)
      execFileSync('screencapture', ['-x', '-R', `${left},${top},${right - left},${bottom - top}`, file])
      console.log(`shot ${path.relative(root, file)}`)
    }
  } finally {
    // 只弹出这次自己打开的卷；Finder 刚关窗时可能还占着，退几次，不加 -force。
    let detached = false
    for (let attempt = 0; attempt < 5 && !detached; attempt += 1) {
      detached = spawnSync('hdiutil', ['detach', mountPoint], { encoding: 'utf8' }).status === 0
      if (!detached) await delay(1000)
    }
    if (!detached) console.log(`WARN 卷 ${mountPoint} 没弹出，手动弹出`)
  }
}

const failed = results.filter((result) => result.status === 'FAIL')
const skipped = results.filter((result) => result.status === 'SKIP')
console.log(`\n${results.length - failed.length - skipped.length} PASS / ${failed.length} FAIL / ${skipped.length} SKIP`)
if (failed.length > 0) process.exit(1)
