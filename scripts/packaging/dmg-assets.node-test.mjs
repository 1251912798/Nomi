// DMG 窗口资源门岗（check:icons 里的 auditDmgAssets）的反例：每一种「源头改了、图没重出」都要拦住，
// 没牵连的改动（别的 token、深色 token）要放行。夹具是临时目录里的迷你仓库，不碰真实仓库。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import zlib from 'node:zlib'
import { makeTempDir } from '../_test-temp.mjs'
import { decodeRgbaPng } from '../check-app-icons.cjs'
import { encodeRgbaPng } from '../generate-app-icon.cjs'
import {
  STAMP_KEY,
  auditDmgAssets,
  backgroundStamp,
  badgePng,
  itemsOutsideVisibleArea,
  readPngText,
  withPngText,
} from './dmg-assets.mjs'

const DMG = {
  title: '${productName} ${version}',
  background: 'build/dmg/background.png',
  badgeIcon: 'build/dmg/badge.png',
  iconSize: 128,
  iconTextSize: 13,
  contents: [
    { x: 200, y: 180, type: 'file' },
    { x: 520, y: 180, type: 'link', path: '/Applications' },
  ],
}

const TOKENS = `:root {
  --nomi-bg: oklch(0.985 0.003 90);
  --nomi-paper: oklch(1 0 0);
  --nomi-accent: oklch(0.55 0.13 250);
  --nomi-accent-soft: color-mix(in srgb, var(--nomi-accent) 12%, var(--nomi-paper));
  --nomi-danger: oklch(0.55 0.13 25);
}

:root[data-mantine-color-scheme="dark"] {
  --nomi-bg: oklch(0.18 0.006 80);
}
`

// 画布节点登记的替身：只留 NODE_ICONS 这一段，形状和 src/workbench/generationCanvas/nodes/renderRegistry.tsx 一样。
const NODE_REGISTRY = `const NODE_ICONS: Record<GenerationNodeIconKey, GenerationNodeIcon> = {
  text: IconTypography,
  character: IconUser,
  image: IconPhoto,
  video: IconVideo,
  audio: IconWaveSine,
}
`

function writeFile(root, relative, content) {
  const file = path.join(root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

const editFile = (root, relative, edit) => writeFile(root, relative, edit(fs.readFileSync(path.join(root, relative), 'utf8')))

const BACKGROUND_HTML = '<style>.frame { width: 720px; height: 440px; background: var(--nomi-bg) } .tip { background: var(--nomi-accent-soft) }</style>'

const blankPng = (width, height) => encodeRgbaPng({ width, height, rgba: Buffer.alloc(width * height * 4) })

/** 1024 的图标替身：中间一块实色，四角透明（真图标也是圆角外透明）。 */
function iconPng(shade) {
  const size = 1024
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 64; y < size - 64; y += 1) {
    for (let x = 64; x < size - 64; x += 1) rgba.set([shade, shade, shade, 255], (y * size + x) * 4)
  }
  return encodeRgbaPng({ width: size, height: size, rgba })
}

/** render:dmg-assets 里背景那半的替身：真渲染要浏览器和苹方，这里只出 720×440 画框尺寸的空白图，戳照真的盖。 */
function renderBackground(root) {
  const stamp = backgroundStamp(root)
  writeFile(root, 'build/dmg/background.png', withPngText(blankPng(720, 440), STAMP_KEY, stamp))
  writeFile(root, 'build/dmg/background@2x.png', withPngText(blankPng(1440, 880), STAMP_KEY, stamp))
}

function fixtureRepo(dmg = DMG) {
  const root = makeTempDir('nomi-dmg-assets-')
  writeFile(root, 'package.json', JSON.stringify({ build: { dmg } }))
  writeFile(root, 'src/theme/nomi-tokens.css', TOKENS)
  writeFile(root, 'src/workbench/generationCanvas/nodes/renderRegistry.tsx', NODE_REGISTRY)
  writeFile(root, 'build/dmg/background.html', BACKGROUND_HTML)
  writeFile(root, 'build/icon.png', iconPng(40))
  writeFile(root, 'build/dmg/badge.png', badgePng(root))
  renderBackground(root)
  return root
}

function setDmg(root, edit) {
  editFile(root, 'package.json', (text) => {
    const pkg = JSON.parse(text)
    edit(pkg.build.dmg)
    return JSON.stringify(pkg)
  })
}

test('刚出的图过门岗', () => {
  assert.deepEqual(auditDmgAssets(fixtureRepo()), { background: '720x440', badge: '1024x1024' })
})

test('改了 package.json 的图标坐标、尺寸或字号却没重渲：拦，说背景过期（弧线和媒体卡会和图标错位）', () => {
  for (const edit of [(dmg) => { dmg.contents[1].x = 540 }, (dmg) => { dmg.iconSize = 112 }, (dmg) => { dmg.iconTextSize = 12 }]) {
    const root = fixtureRepo()
    setDmg(root, edit)
    assert.throws(() => auditDmgAssets(root), /background\.png 过期了.*render:dmg-assets/)
    renderBackground(root)
    auditDmgAssets(root)
  }
})

test('改了卷名这类与背景无关的配置：放行', () => {
  const root = fixtureRepo()
  setDmg(root, (dmg) => { dmg.title = '${productName}' })
  auditDmgAssets(root)
})

test('改了背景源没重渲：拦', () => {
  const root = fixtureRepo()
  editFile(root, 'build/dmg/background.html', (html) => `${html}\n<p>new</p>`)
  assert.throws(() => auditDmgAssets(root), /过期了/)
})

test('背景用到的 token（含间接引用）改值要拦；没用到的、深色的 token 改值放行', () => {
  const root = fixtureRepo()
  editFile(root, 'src/theme/nomi-tokens.css', (css) => css.replace('--nomi-danger: oklch(0.55 0.13 25)', '--nomi-danger: oklch(0.6 0.13 25)'))
  editFile(root, 'src/theme/nomi-tokens.css', (css) => css.replace('--nomi-bg: oklch(0.18 0.006 80)', '--nomi-bg: oklch(0.2 0.006 80)'))
  auditDmgAssets(root)
  // --nomi-paper 没被背景直接用，但 --nomi-accent-soft 引用了它。
  editFile(root, 'src/theme/nomi-tokens.css', (css) => css.replace('--nomi-paper: oklch(1 0 0)', '--nomi-paper: oklch(0.99 0 0)'))
  assert.throws(() => auditDmgAssets(root), /过期了/)
})

test('背景用了浅色 :root 里没有的 token：渲染和门岗都拒绝', () => {
  const root = fixtureRepo()
  editFile(root, 'build/dmg/background.html', (html) => html.replace('var(--nomi-bg)', 'var(--nomi-missing)'))
  assert.throws(() => backgroundStamp(root), /--nomi-missing/)
  assert.throws(() => auditDmgAssets(root), /--nomi-missing/)
})

test('画布节点换了媒体图标没重渲：拦（DMG 上的卡和应用里的节点用同一套图标）；换了非媒体节点的图标：放行', () => {
  const root = fixtureRepo()
  const registry = 'src/workbench/generationCanvas/nodes/renderRegistry.tsx'
  editFile(root, registry, (source) => source.replace('character: IconUser', 'character: IconUserCircle'))
  auditDmgAssets(root)
  editFile(root, registry, (source) => source.replace('text: IconTypography', 'text: IconLetterCase'))
  assert.throws(() => auditDmgAssets(root), /background\.png 过期了/)
  renderBackground(root)
  auditDmgAssets(root)
})

test('画布节点登记里缺媒体图标：渲染和门岗都拒绝', () => {
  const root = fixtureRepo()
  editFile(root, 'src/workbench/generationCanvas/nodes/renderRegistry.tsx', (source) => source.replace('  video: IconVideo,\n', ''))
  assert.throws(() => backgroundStamp(root), /NODE_ICONS 里没有 video/)
  assert.throws(() => auditDmgAssets(root), /NODE_ICONS 里没有 video/)
})

test('换了应用图标没重出角标：拦', () => {
  const root = fixtureRepo()
  writeFile(root, 'build/icon.png', iconPng(200))
  assert.throws(() => auditDmgAssets(root), /badge\.png 过期了.*render:dmg-assets/)
  writeFile(root, 'build/dmg/badge.png', badgePng(root))
  auditDmgAssets(root)
})

test('角标是缩进图标网格的应用图标：四周 100px 透明，图在中间 824', () => {
  const root = fixtureRepo()
  const badge = decodeRgbaPng(fs.readFileSync(path.join(root, 'build/dmg/badge.png')), 'badge')
  const alphaAt = (x, y) => badge.rgba[(y * badge.width + x) * 4 + 3]
  // 替身图标在 1024 画布里实色区是 64..960，缩到 824 后落在 100 + 64×824/1024 ≈ 151 到 873。
  assert.equal(alphaAt(140, 512), 0)
  assert.equal(alphaAt(512, 140), 0)
  assert.equal(alphaAt(160, 512), 255)
  assert.equal(alphaAt(512, 865), 255)
  assert.equal(alphaAt(512, 885), 0)
})

test('角标缺 DPI（pHYs 块）：拦（dmgbuild 合成卷图标要读它，没有就打包失败）', () => {
  const root = fixtureRepo()
  const badgePath = path.join(root, 'build/dmg/badge.png')
  const stamp = readPngText(fs.readFileSync(badgePath), STAMP_KEY)
  fs.writeFileSync(badgePath, withPngText(blankPng(1024, 1024), STAMP_KEY, stamp))
  assert.throws(() => auditDmgAssets(root), /pHYs/)
})

test('badgeIcon 不指向生成的角标：拦（直接用满版应用图标会盖住大半个磁盘）', () => {
  const root = fixtureRepo()
  setDmg(root, (dmg) => { dmg.badgeIcon = 'build/icon.png' })
  assert.throws(() => auditDmgAssets(root), /badgeIcon/)
})

test('缺 @2x 或 @2x 不是 1x 的两倍：拦', () => {
  const root = fixtureRepo()
  const retina = path.join(root, 'build/dmg/background@2x.png')
  const stamp = readPngText(fs.readFileSync(retina), STAMP_KEY)
  fs.writeFileSync(retina, withPngText(blankPng(720, 440), STAMP_KEY, stamp))
  assert.throws(() => auditDmgAssets(root), /两倍：1440×880/)
  fs.rmSync(retina)
  assert.throws(() => auditDmgAssets(root), /缺 build\/dmg\/background@2x\.png/)
})

test('图标或文件名落进 macOS 26 看不见的底部 32pt、或出了窗口：拦', () => {
  const at = (x, y) => ({ ...DMG, contents: [{ x, y, type: 'file' }] })
  // 图标 128、文件名占 28：y=316 时文件名底正好压在可见区下沿 408，再往下 1pt 就看不全。
  assert.deepEqual(itemsOutsideVisibleArea(at(200, 316), 720, 440), [])
  assert.match(itemsOutsideVisibleArea(at(200, 317), 720, 440).join(), /看不见的底部 32pt/)
  assert.match(itemsOutsideVisibleArea(at(40, 180), 720, 440).join(), /横向出了窗口/)
  assert.match(itemsOutsideVisibleArea(at(200, 40), 720, 440).join(), /顶出了窗口上沿/)
  const low = { ...DMG, contents: [{ ...DMG.contents[0], y: 330 }, DMG.contents[1]] }
  assert.throws(() => auditDmgAssets(fixtureRepo(low)), /看不全/)
})

test('戳写进合法的 tEXt 块：CRC 对，同 key 重盖只留一块', () => {
  const twice = withPngText(withPngText(blankPng(2, 2), STAMP_KEY, 'one'), STAMP_KEY, 'two')
  assert.equal(readPngText(twice, STAMP_KEY), 'two')
  const stamps = []
  for (let offset = 8; offset < twice.length;) {
    const length = twice.readUInt32BE(offset)
    const type = twice.toString('ascii', offset + 4, offset + 8)
    if (type === 'tEXt') {
      stamps.push(twice.toString('latin1', offset + 8, offset + 8 + length))
      assert.equal(twice.readUInt32BE(offset + 8 + length), zlib.crc32(twice.subarray(offset + 4, offset + 8 + length)))
    }
    offset += 12 + length
  }
  assert.deepEqual(stamps, [`${STAMP_KEY}\0two`])
})
