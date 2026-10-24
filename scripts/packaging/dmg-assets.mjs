// DMG 安装窗口的美术资源与布局合同。
//
// 三张图由源头派生、入库（pnpm run render:dmg-assets 一次出齐），派生时把「源头指纹」盖进 PNG 的 tEXt 块：
//   build/dmg/background.png + background@2x.png ← build/dmg/background.html（浏览器渲染，用设计系统 token）
//   build/dmg/badge.png ← build/icon.png（缩进 macOS 图标网格，给卷图标做角标）
// check:icons 拿戳和现在的源头比：改了坐标、背景源、背景用到的 token 或应用图标却没重出图，门岗就红，
// 不会等到发版才在用户屏幕上错位。
//
// 布局只有一份：package.json 的 build.dmg。electron-builder 照它摆图标，渲染背景时把同一份注入页面
// （window.dmgLayout），背景上的弧线和媒体卡照它画。窗口尺寸 = 1x 背景图的像素尺寸（electron-builder 就是这么定的），
// 由背景源里画框的尺寸决定，也不另存。
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import zlib from 'node:zlib'
import { decodeRgbaPng } from '../check-app-icons.cjs'
import { encodeRgbaPng, resizeRgba } from '../generate-app-icon.cjs'

export const STAMP_KEY = 'nomi:dmg-asset'
export const BACKGROUND_SOURCE = 'build/dmg/background.html'
export const TOKENS_SOURCE = 'src/theme/nomi-tokens.css'
export const APP_ICON = 'build/icon.png'
export const BADGE = 'build/dmg/badge.png'
// 背景上的媒体卡只有这三种：颜色是时间轴三条媒体轨的 token（--nomi-track-*），图标和画布节点同一个来源。
export const MEDIA_KINDS = ['text', 'image', 'video']
const MEDIA_ICON_SOURCE = 'src/workbench/generationCanvas/nodes/renderRegistry.tsx'
// macOS 26 的 Finder 把标题栏算进 .DS_Store 写的窗口高度，背景图底部这么高的一条看不见
// （2026-10-24 macOS 26.5.1 实测：写 720×420，内容区只露 720×388）。老系统会露出来，所以这条当出血，不放内容。
export const MACOS26_HIDDEN_BOTTOM = 32
// 图标下沿到文件名底的距离：13pt 标签实测字形底在图标下沿下方 25.5pt，选中时的高亮再多出约 2pt。
export const LABEL_BLOCK = 28
// macOS 图标网格：1024 的画布里图像占 824，四周留透明边。角标源图照它缩；走查照它算 Finder 里图标实际画到哪。
export const MACOS_ICON_GRID = Object.freeze({ canvas: 1024, art: 824 })
// 角标源图：应用图标缩进图标网格。满版图标直接做角标会盖住大半个磁盘。
const BADGE_SIZE = MACOS_ICON_GRID.canvas
const BADGE_ART = MACOS_ICON_GRID.art

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function pngChunks(bytes) {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('不是 PNG')
  const chunks = []
  let offset = 8
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    chunks.push({ type, start: offset, end: offset + 12 + length, data: bytes.subarray(offset + 8, offset + 8 + length) })
    offset += 12 + length
    if (type === 'IEND') break
  }
  return chunks
}

export function pngSize(bytes) {
  const header = pngChunks(bytes).find((chunk) => chunk.type === 'IHDR')
  return { width: header.data.readUInt32BE(0), height: header.data.readUInt32BE(4) }
}

const textKey = (chunk) => chunk.data.toString('latin1', 0, chunk.data.indexOf(0))

export function readPngText(bytes, key) {
  const chunk = pngChunks(bytes).find((candidate) => candidate.type === 'tEXt' && textKey(candidate) === key)
  return chunk ? chunk.data.toString('latin1', key.length + 1) : null
}

/** 在第一个 `before` 类型的块前插入一个块；`drop` 选中的旧块去掉。 */
function insertPngChunk(bytes, type, data, before, drop = () => false) {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  typeAndData.copy(chunk, 4)
  chunk.writeUInt32BE(zlib.crc32(typeAndData), 8 + data.length)
  const parts = [PNG_SIGNATURE]
  let inserted = false
  for (const existing of pngChunks(bytes)) {
    if (drop(existing)) continue
    if (!inserted && existing.type === before) {
      parts.push(chunk)
      inserted = true
    }
    parts.push(bytes.subarray(existing.start, existing.end))
  }
  return Buffer.concat(parts)
}

/** 返回插好 tEXt 块的新 PNG（同 key 的旧块先去掉）。值是 ASCII JSON，tEXt 的 Latin-1 够用。 */
export function withPngText(bytes, key, value) {
  const data = Buffer.concat([Buffer.from(key, 'latin1'), Buffer.from([0]), Buffer.from(value, 'latin1')])
  return insertPngChunk(bytes, 'tEXt', data, 'IEND', (chunk) => chunk.type === 'tEXt' && textKey(chunk) === key)
}

const hasPngChunk = (bytes, type) => pngChunks(bytes).some((chunk) => chunk.type === type)

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')

/** electron-builder 实际会用的布局：图标尺寸、标签字号、每个条目的中心坐标。 */
export function configLayout(dmg) {
  return {
    iconSize: dmg.iconSize,
    iconTextSize: dmg.iconTextSize,
    contents: (dmg.contents || []).map((item) => ({ type: item.type, x: item.x, y: item.y })),
  }
}

/** 渲染背景时注入页面的布局（window.dmgLayout）：图标坐标照抄配置，再带上 macOS 26 看不见的底部高度。 */
export function injectedLayout(dmg) {
  return { ...configLayout(dmg), hiddenBottom: MACOS26_HIDDEN_BOTTOM }
}

export function readDmgConfig(repoRoot) {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  if (!pkg.build?.dmg) throw new Error('package.json 的 build 里没有 dmg 段')
  return pkg.build.dmg
}

/** 背景源用到的浅色 token（连同它们引用的 token）的值。只盯用到的，别的 token 改了不牵连 DMG。 */
function usedTokenValues(html, tokensCss) {
  const block = /^:root\s*\{([\s\S]*?)^\}/m.exec(tokensCss)
  if (!block) throw new Error(`${TOKENS_SOURCE} 里找不到浅色的 :root 块`)
  const defined = new Map([...block[1].matchAll(/(--nomi-[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]))
  const used = {}
  const pending = [...html.matchAll(/var\((--nomi-[\w-]+)/g)].map((match) => match[1])
  while (pending.length > 0) {
    const name = pending.pop()
    if (Object.hasOwn(used, name)) continue
    if (!defined.has(name)) throw new Error(`${BACKGROUND_SOURCE} 用了 ${name}，${TOKENS_SOURCE} 的浅色 :root 里没有`)
    used[name] = defined.get(name)
    for (const match of used[name].matchAll(/var\((--nomi-[\w-]+)/g)) pending.push(match[1])
  }
  return Object.fromEntries(Object.entries(used).sort(([a], [b]) => a.localeCompare(b)))
}

/** 媒体卡的图标（Tabler 组件名）：只认画布节点登记 NODE_ICONS，节点换了图标，DMG 背景跟着过期。 */
export function mediaIconNames(repoRoot) {
  const source = fs.readFileSync(path.join(repoRoot, MEDIA_ICON_SOURCE), 'utf8')
  const block = /const NODE_ICONS[^{]*\{([\s\S]*?)\n\}/.exec(source)
  if (!block) throw new Error(`${MEDIA_ICON_SOURCE} 里找不到 NODE_ICONS`)
  const registered = new Map([...block[1].matchAll(/^\s*(\w+):\s*(Icon\w+),?\s*$/gm)].map((match) => [match[1], match[2]]))
  return Object.fromEntries(MEDIA_KINDS.map((kind) => {
    if (!registered.has(kind)) throw new Error(`${MEDIA_ICON_SOURCE} 的 NODE_ICONS 里没有 ${kind}`)
    return [kind, registered.get(kind)]
  }))
}

const tablerVersion = () => createRequire(import.meta.url)('@tabler/icons-react/package.json').version

/** 背景图应盖的戳：当前配置的布局 + 背景源指纹 + 背景用到的 token 值 + 媒体卡图标（名字和图标库版本）。 */
export function backgroundStamp(repoRoot, dmg = readDmgConfig(repoRoot)) {
  const html = fs.readFileSync(path.join(repoRoot, BACKGROUND_SOURCE), 'utf8')
  const tokens = usedTokenValues(html, fs.readFileSync(path.join(repoRoot, TOKENS_SOURCE), 'utf8'))
  const icons = { library: `@tabler/icons-react@${tablerVersion()}`, ...mediaIconNames(repoRoot) }
  return JSON.stringify({ layout: configLayout(dmg), source: sha256(html), tokens, icons })
}

function badgeStamp(icon) {
  return JSON.stringify({ icon: sha256(icon), size: BADGE_SIZE, art: BADGE_ART })
}

/**
 * 角标源图：应用图标缩到 BADGE_ART，居中放进透明的 BADGE_SIZE 画布，盖上应用图标的指纹。
 * 带 72 dpi 的 pHYs 块：dmgbuild 合成卷图标时要读图的 DPI（ImageIO 的 DPIWidth），PNG 没有这个块就读不到，打包直接失败
 * （2026-10-24 本机 electron-builder 26.15.3 / dmgbuild 1.6.7 实测 KeyError: 'DPIWidth'）。
 */
export function badgePng(repoRoot) {
  const icon = fs.readFileSync(path.join(repoRoot, APP_ICON))
  const art = resizeRgba(decodeRgbaPng(icon, APP_ICON), BADGE_ART)
  const inset = (BADGE_SIZE - BADGE_ART) / 2
  const rgba = Buffer.alloc(BADGE_SIZE * BADGE_SIZE * 4)
  for (let y = 0; y < BADGE_ART; y += 1) {
    art.rgba.copy(rgba, ((y + inset) * BADGE_SIZE + inset) * 4, y * BADGE_ART * 4, (y + 1) * BADGE_ART * 4)
  }
  const pixelsPerMeter = Math.round(72 / 0.0254)
  const physical = Buffer.alloc(9)
  physical.writeUInt32BE(pixelsPerMeter, 0)
  physical.writeUInt32BE(pixelsPerMeter, 4)
  physical[8] = 1
  const png = insertPngChunk(encodeRgbaPng({ width: BADGE_SIZE, height: BADGE_SIZE, rgba }), 'pHYs', physical, 'IDAT')
  return withPngText(png, STAMP_KEY, badgeStamp(icon))
}

/** 每个条目（图标 + 文件名）都要落在 macOS 26 看得见的区域里。返回越界说明，空数组 = 都在。 */
export function itemsOutsideVisibleArea(dmg, width, height) {
  const half = dmg.iconSize / 2
  const visibleHeight = height - MACOS26_HIDDEN_BOTTOM
  const problems = []
  for (const item of dmg.contents || []) {
    const name = item.type === 'link' ? item.path : item.type
    if (item.x - half < 0 || item.x + half > width) problems.push(`${name} 横向出了窗口（x=${item.x}，窗口宽 ${width}）`)
    if (item.y - half < 0) problems.push(`${name} 顶出了窗口上沿（y=${item.y}）`)
    const bottom = item.y + half + LABEL_BLOCK
    if (bottom > visibleHeight) {
      problems.push(`${name} 的文件名落进了 macOS 26 看不见的底部 ${MACOS26_HIDDEN_BOTTOM}pt（文件名底 ${bottom} > ${visibleHeight}）`)
    }
  }
  return problems
}

/** 两档背景的输出路径：electron-builder 只认和 1x 同名的 @2x.png。 */
export function backgroundTargets(dmg) {
  assert.match(dmg.background, /\.png$/, 'build.dmg.background 要是 PNG：electron-builder 只认同名 @2x.png 合成高分屏背景')
  return [{ file: dmg.background, scale: 1 }, { file: dmg.background.replace(/\.png$/, '@2x.png'), scale: 2 }]
}

/** check:icons 的 DMG 部分：背景两档和角标都在、尺寸对、戳和现在的源头一致，图标和文件名都在看得见的区域里。 */
export function auditDmgAssets(repoRoot) {
  const dmg = readDmgConfig(repoRoot)
  const expectedBackground = backgroundStamp(repoRoot, dmg)
  const sizes = []
  for (const { file } of backgroundTargets(dmg)) {
    const filePath = path.join(repoRoot, file)
    assert.ok(fs.existsSync(filePath), `缺 ${file}：跑 pnpm run render:dmg-assets`)
    const bytes = fs.readFileSync(filePath)
    assert.equal(
      readPngText(bytes, STAMP_KEY),
      expectedBackground,
      `${file} 过期了（布局、背景源、背景用到的 token 或媒体卡图标改过）：跑 pnpm run render:dmg-assets`,
    )
    sizes.push(pngSize(bytes))
  }
  const [{ width, height }, retina] = sizes
  assert.deepEqual(retina, { width: width * 2, height: height * 2 }, `@2x 背景应是 1x 的两倍：${width * 2}×${height * 2}`)
  const outside = itemsOutsideVisibleArea(dmg, width, height)
  assert.deepEqual(outside, [], `DMG 窗口里有条目看不全：${outside.join('；')}`)

  assert.equal(dmg.badgeIcon, BADGE, `build.dmg.badgeIcon 要指向生成的 ${BADGE}`)
  const badge = fs.readFileSync(path.join(repoRoot, BADGE))
  assert.deepEqual(pngSize(badge), { width: BADGE_SIZE, height: BADGE_SIZE }, `${BADGE} 应是 ${BADGE_SIZE}×${BADGE_SIZE}`)
  assert.ok(hasPngChunk(badge, 'pHYs'), `${BADGE} 缺 DPI（pHYs 块）：dmgbuild 合成卷图标要读它，没有会让打包失败`)
  assert.equal(
    readPngText(badge, STAMP_KEY),
    badgeStamp(fs.readFileSync(path.join(repoRoot, APP_ICON))),
    `${BADGE} 过期了（应用图标改过）：跑 pnpm run render:dmg-assets`,
  )
  return { background: `${width}x${height}`, badge: `${BADGE_SIZE}x${BADGE_SIZE}` }
}
