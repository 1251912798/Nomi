// 生成框 B3（I-b1a）走查：画布节点生成框 + 四个复用宿主，**真组件**、零额度。
//
// 一格 = 实验室里现役 `BaseGenerationNode` + `NodeGenerationComposer`（节点、连线、上传参考灌进真 store，
// 模型目录种缓存；见 src/devlab/designLab/nodeComposerBar/nodeComposerB3LabKit.tsx）。这里对**每个拍板元素**
// 量一条用户看得见的事实（尺寸 / 文字 / 悬停 / 点一下的结果），断言名 `board:ComposerB3/<元素 id>` 与清单一一对应。
//
// 同时产出证据图（docs/evidence/2026-10-19-b1a/）：每个格 × 中 / 英 × 明 / 暗，加悬停小提示、悬停大图、四个宿主。
//
// 用法：node tests/ux/composer-b3.walk.mjs        （EVIDENCE=0 只跑断言不截图）
import { stationTimeout } from './_station-budget.mjs'
import { expectAbsent, proveProbe } from './_assert.mjs'
import { uiText, uiTextPattern } from './full-walk/invariants.mjs'

const zh = (key) => uiText('zh-CN', key)
import { chromium } from 'playwright'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { REPO_ROOT } from './design-lab/labStates.mjs'
import { assertLabPortOwnership, labPortFor } from './design-lab/labServer.mjs'

const ROLE = 'walk-composer-b3'
const HOST = '127.0.0.1'
const PORT = labPortFor(ROLE)
const BASE = `http://${HOST}:${PORT}`
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs/evidence/2026-10-19-b1a')
const WITH_EVIDENCE = process.env.EVIDENCE !== '0'

const failures = []
const passed = []
/** 一条断言：名字就是清单里的 `board:ComposerB3/<id>`。 */
function check(name, ok, detail) {
  if (ok) { passed.push(name); console.log(`  ✓ ${name}`) } else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function waitForServer(url, timeoutMs = 90000) {
  const start = Date.now()
  for (;;) {
    try { const response = await fetch(url); if (response.ok || response.status === 404) return } catch { /* not up yet */ }
    if (Date.now() - start > timeoutMs) throw new Error('vite dev server 启动超时')
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

if (spawnSync('node', ['scripts/build-tailwind.mjs'], { cwd: REPO_ROOT, stdio: 'inherit' }).status !== 0) throw new Error('build-tailwind 失败')
assertLabPortOwnership(ROLE)
const vite = spawn(process.execPath, [path.join(REPO_ROOT, 'node_modules/vite/bin/vite.js'), '--host', HOST, '--port', String(PORT), '--strictPort'], { cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'pipe'] })
vite.stderr?.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`))
await waitForServer(BASE)
const browser = await chromium.launch({ headless: true })
const pageErrors = []

/** 打开一格，拿到页面。`extra` 追加 URL 参数（?scheme=dark&lang=en）。 */
async function open(screen, state, extra = '') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(`${state}: ${String(error).slice(0, 200)}`))
  await page.goto(`${BASE}/design-lab.html?screen=${screen}&frame=1&state=${state}${extra}`, { timeout: stationTimeout({ operations: 12 }) })
  await page.waitForFunction(() => window.__designLabReady === true, null, { timeout: stationTimeout({ operations: 6 }) })
  return { page, context }
}

const CARD = '.generation-canvas-v2-node__composer-card'
const FOOTER = `${CARD} [data-node-composer-footer]`
const box = (page, selector, index = 0) => page.evaluate(([sel, i]) => {
  const el = document.querySelectorAll(sel)[i]
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return { w: Math.round(rect.width), h: Math.round(rect.height), x: rect.x, y: rect.y }
}, [selector, index])
const text = (page, selector, index = 0) => page.evaluate(([sel, i]) => document.querySelectorAll(sel)[i]?.textContent?.trim() ?? null, [selector, index])
const count = (page, selector) => page.evaluate((sel) => document.querySelectorAll(sel).length, selector)
const PANEL_MODE = '[data-agent-parameter-panel] [data-agent-generation-mode]'
/** 真点：打开参数面板 → 点方式 → 收起（和用户同一条手势）。 */
async function pickMode(page, label) {
  await page.locator(`${CARD} [data-parameter-summary]`).click()
  await page.waitForSelector(PANEL_MODE, { timeout: stationTimeout() })
  await page.locator(`${PANEL_MODE} [role="radio"]`, { hasText: label }).first().click()
  await page.keyboard.press('Escape')
}
/** 面板里当前高亮的方式（必须和节点实际的方式一致）。 */
async function activeMode(page) {
  await page.locator(`${CARD} [data-parameter-summary]`).click()
  await page.waitForSelector(PANEL_MODE, { timeout: stationTimeout() })
  const label = await page.locator(`${PANEL_MODE} [role="radio"][aria-checked="true"]`).first().textContent()
  await page.keyboard.press('Escape')
  return label?.trim() ?? null
}
/** 真点：打开模型菜单 → 点某个模型。 */
async function swapModel(page, name) {
  // 有的格自带打开的模型菜单（B3j），别再点一下把它关掉。
  if (!(await page.locator('[role="option"]:visible').count())) await page.locator(`${FOOTER} [data-bar-segment="model-params"] [role="combobox"], ${FOOTER} [data-bar-segment="model-params"] button[aria-haspopup]`).first().click()
  await page.locator('[role="option"]:visible', { hasText: name }).first().click()
}
const refTiles = (page) => count(page, '[data-reference-row] [data-asset-tile]')

async function shot(page, screen, state, name) {
  if (!WITH_EVIDENCE) return
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  const target = page.locator(`[data-design-lab-shot="${state}"]`)
  await target.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), animations: 'disabled' })
}

try {
  const cells = {}
  const B3 = 'node-composer-bar'

  // ── B3a 视频 · 空 ─────────────────────────────────────────────
  {
    const { page, context } = await open(B3, 'b3a-video-empty')
    const card = await page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const s = getComputedStyle(el); return { radius: parseFloat(s.borderTopLeftRadius), shadow: s.boxShadow !== 'none', width: Math.round(el.getBoundingClientRect().width) } }, CARD)
    check('board:ComposerB3/node.card', Boolean(card) && card.radius >= 9 && card.radius <= 12 && card.shadow && card.width === 560, JSON.stringify(card))
    const pick = await box(page, '[data-reference-entry]')
    check('board:ComposerB3/ref.tool.canvas-pick', pick?.w === 40 && pick?.h === 40, JSON.stringify(pick))
    const plus = await box(page, '[data-reference-add-entry], [data-asset-add-tile]')
    check('board:ComposerB3/ref.tool.add', plus?.w === 40 && plus?.h === 40, JSON.stringify(plus))
    check('board:ComposerB3/prompt.editor', (await count(page, `${CARD} [data-prompt-box]`)) === 1)
    const bar = await page.evaluate((sel) => {
      const footer = document.querySelector(sel)
      if (!footer) return null
      const segs = [...footer.querySelectorAll('[data-bar-segment]')].map((el) => ({ name: el.getAttribute('data-bar-segment'), r: el.getBoundingClientRect() }))
      const centers = segs.map((s) => s.r.top + s.r.height / 2)
      return { names: segs.map((s) => s.name), spread: Math.max(...centers) - Math.min(...centers), leftRight: segs.map((s) => Math.round(s.r.left)) }
    }, FOOTER)
    check('board:ComposerB3/bar.container', Boolean(bar) && bar.spread <= 8, JSON.stringify(bar))
    check('board:ComposerB3/bar.layout.a', Boolean(bar) && bar.names.join('>') === 'model-params>prompt-tools>generate' && bar.leftRight[1] > bar.leftRight[0] + 150, JSON.stringify(bar))
    const modelText = await text(page, `${FOOTER} [data-bar-segment="model-params"] button`)
    check('board:ComposerB3/bar.model', /Seedance/.test(modelText ?? ''), String(modelText))
    const summary = await page.evaluate(() => document.querySelector('[data-parameter-summary]')?.getAttribute('data-parameter-summary') ?? '')
    check('board:ComposerB3/bar.params', /16:9 · \d{3,4}p · 5s/.test(summary) && !/参考|首尾帧|首帧/.test(summary), summary)
    const variant = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-bar-segment="model-params"] button`)].map((b) => b.textContent?.trim()), FOOTER)
    check('board:ComposerB3/params.group.variant', variant.some((label) => /变体/.test(label ?? '')), JSON.stringify(variant))
    const tools = await page.evaluate(() => [...document.querySelectorAll('[data-prompt-tool]')].map((el) => el.getAttribute('data-prompt-tool')))
    check('board:ComposerB3/bar.tool.presets', tools.length === 3 && tools.includes('effects'), JSON.stringify(tools))
    check('board:ComposerB3/bar.tool.translate', tools.includes('translate'), JSON.stringify(tools))
    check('board:ComposerB3/bar.tool.optimize', tools.includes('optimize'), JSON.stringify(tools))
    const mark = await page.evaluate(() => { const svg = document.querySelector('[data-prompt-tool="optimize"] svg'); return svg ? svg.querySelectorAll('rect, polygon').length : 0 })
    check('board:ComposerB3/bar.optimize.mark', mark >= 3, String(mark))
    const send = await page.evaluate(() => {
      const button = document.querySelector('[data-bar-segment="generate"]')
      if (!button) return null
      const r = button.getBoundingClientRect()
      const s = getComputedStyle(button)
      return { w: Math.round(r.width), h: Math.round(r.height), round: parseFloat(s.borderTopLeftRadius) >= 15, arrow: Boolean(button.querySelector('svg.tabler-icon-arrow-up')), tip: button.closest('span[title]')?.getAttribute('title') ?? '', text: button.textContent?.trim() ?? '' }
    })
    const sendOk = Boolean(send) && send.w === 30 && send.h === 30 && send.round && send.arrow && send.text === '' && /^生成$/.test(send.tip)
    check('board:ComposerB3/bar.send', sendOk, JSON.stringify(send))
    check('board:ComposerB3/bar.send.circle', sendOk, JSON.stringify(send))
    check('board:ComposerB3/bar.send.text', !send?.text, 'D2「生成」字钮作废：生成钮上没有字')
    check('board:ComposerB3/prompt.expand.hidden-when-short', (await count(page, '[data-prompt-expand-toggle]')) === 0, '提示词短的时候没有展开钮（点了没反应的控件不放）')
    await page.locator(`${CARD} [data-prompt-box] .ProseMirror`).click()
    await page.keyboard.type(Array.from({ length: 40 }, (_, i) => `第 ${i + 1} 行镜头描述`).join('\n').replace(/\n/g, ' '.repeat(0) + '\n'))
    await page.waitForSelector('[data-prompt-expand-toggle]', { timeout: stationTimeout() })
    await page.locator('[data-prompt-expand-toggle]').click()
    await page.waitForSelector('[data-prompt-expanded="true"]', { timeout: stationTimeout() })
    check('board:ComposerB3/prompt.expand', true, '装不下时右上出展开钮，点开后提示词区长到全文')
    await shot(page, B3, 'b3a-video-empty', 'B3a-zh-light')
    cells.b3a = true
    await context.close()
  }

  // ── B3b 参数面板（现有组件原样）────────────────────────────────
  {
    const { page, context } = await open(B3, 'b3b-video-params')
    const panel = await page.evaluate(() => {
      const el = document.querySelector('[data-agent-parameter-panel]')
      if (!el) return null
      const titles = [...el.querySelectorAll('div')].filter((d) => !d.children.length).map((d) => d.textContent?.trim()).filter(Boolean)
      const modes = [...el.querySelectorAll('[data-agent-generation-mode] [role="radio"]')].map((b) => b.textContent?.trim())
      return { modes, w: Math.round(el.getBoundingClientRect().width), titles, hint: [...el.querySelectorAll('[title]')].map((n) => n.getAttribute('title')) }
    })
    check('board:ComposerB3/params.popover', panel?.w === 320, JSON.stringify(panel))
    check('board:ComposerB3/params.group.mode', panel?.titles?.[0] === zh('generationCommon.parameters.generationMode') && panel.modes[0] === '参考' && !panel.modes.some((m) => /文生/.test(m ?? '')), JSON.stringify(panel))
    check('board:ComposerB3/params.mode.limit-tip', (panel?.hint ?? []).some((t) => /最多：.*张图.*段视频.*段音频/.test(t ?? '')), JSON.stringify(panel?.hint))
    check('board:ComposerB3/params.group.aspect', (panel?.titles ?? []).includes('比例'))
    check('board:ComposerB3/params.group.resolution', (panel?.titles ?? []).includes('清晰度'))
    check('board:ComposerB3/params.group.duration', (panel?.titles ?? []).includes('时长'))
    check('board:ComposerB3/params.group.audio', (panel?.titles ?? []).includes('生成音频'))
    const variantInPanel = (panel?.titles ?? []).includes('变体')
    check('board:ComposerB3/params.group.variant.bar-only', !variantInPanel, '变体不进面板：现有组件原样，是参数条上单独一颗')
    await shot(page, B3, 'b3b-video-params', 'B3b-zh-light')
    await context.close()
  }

  // ── B3c 参考 3 张 + 连入文字 + 悬停 ─────────────────────────────
  {
    const { page, context } = await open(B3, 'b3c-video-three-refs')
    const tiles = await page.evaluate(() => [...document.querySelectorAll('[data-reference-row] [data-asset-tile]')].map((el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } }))
    check('board:ComposerB3/ref.thumb', tiles.length === 3 && tiles.every((t) => t.w === 40 && t.h === 40) && (await page.evaluate(() => [...document.querySelectorAll('[data-reference-row] [data-asset-tile] *')].filter((el) => !el.children.length && /^\d+$/.test(el.textContent?.trim() ?? '')).length)) < 1, JSON.stringify(tiles))
    check('board:ComposerB3/ref.count-label', (await text(page, '[data-reference-tail]')) === '参考图 3 张')
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-storyboard-mention-chip]')].map((el) => ({ label: el.getAttribute('aria-label'), thumb: Math.round(el.querySelector('span')?.getBoundingClientRect().width ?? 0) })))
    check('board:ComposerB3/prompt.ref-chip', chips.length === 3 && chips.map((c) => c.label).join(',') === '女主肖像,海边小镇,树林' && chips.every((c) => c.thumb === 16), JSON.stringify(chips))
    const textChip = await page.evaluate(() => { const el = document.querySelector('[data-connected-text-chip]'); return { text: el?.textContent?.trim() ?? '', disconnect: Boolean(el?.querySelector('[data-connected-text-disconnect]')) } })
    check('board:ComposerB3/prompt.text-chip', /^连入文字 · 开场白/.test(textChip.text) && textChip.disconnect, JSON.stringify(textChip))
    // 悬停：先小提示，停满约 0.45 秒再出大图
    const first = page.locator('[data-reference-row] [data-asset-tile]').nth(0)
    check('board:ComposerB3/ref.thumb.remove.quiet', (await page.evaluate(() => getComputedStyle(document.querySelector('[data-asset-tile-remove]')).opacity)) === '0', '平时没有 ×')
    await first.hover()
    await page.waitForSelector('[data-asset-tile-tip]', { timeout: stationTimeout() })
    const tip = await text(page, '[data-asset-tile-tip]')
    check('board:ComposerB3/ref.thumb.tooltip', /女主肖像/.test(tip ?? '') && /断开连线/.test(tip ?? ''), String(tip))
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-asset-tile-remove]')).opacity === '1', null, { timeout: stationTimeout() })
    check('board:ComposerB3/ref.thumb.remove', (await page.evaluate(() => document.querySelector('[data-asset-tile-remove]').getAttribute('aria-label'))) === zh('assetLibrary.refRow.disconnect'))
    await shot(page, B3, 'b3c-video-three-refs', 'B3n-hover-tip-zh-light')
    await page.waitForSelector('[data-asset-tile-zoom]', { timeout: stationTimeout() })
    const zoom = await page.evaluate(() => { const el = document.querySelector('[data-asset-tile-zoom]'); const r = el.getBoundingClientRect(); const tile = document.querySelector('[data-reference-row] [data-asset-tile]').getBoundingClientRect(); return { rightOfTile: r.left >= tile.right, tipGone: !document.querySelector('[data-asset-tile-tip]'), caption: el.textContent?.trim() ?? '' } })
    check('keep.reference.hover-preview', zoom.rightOfTile && zoom.tipGone && /女主肖像/.test(zoom.caption), JSON.stringify(zoom))
    if (WITH_EVIDENCE) await page.screenshot({ path: path.join(EVIDENCE_DIR, 'B3n-hover-zoom-zh-light.png'), clip: { x: 0, y: 0, width: 1000, height: 720 } })
    await shot(page, B3, 'b3c-video-three-refs', 'B3c-zh-light')
    await context.close()
  }

  // ── B3d / B3f 首尾帧 ────────────────────────────────────────────
  {
    const { page, context } = await open(B3, 'b3d-video-first-last')
    const labels = await page.evaluate(() => [...document.querySelectorAll('[data-asset-slot-label]')].map((el) => el.textContent?.trim()))
    check('board:ComposerB3/ref.slot.first', labels[0] === '首帧')
    check('board:ComposerB3/ref.slot.last', labels[1] === zh('assetLibrary.refRow.lastFrameOptional') || labels[1] === '尾帧', JSON.stringify(labels))
    const swapBefore = await page.evaluate(() => [...document.querySelectorAll('[data-asset-slot]')].map((el) => el.querySelector('[data-asset-tile]') ? 'filled' : 'empty'))
    check('board:ComposerB3/ref.slot.swap', (await count(page, '[data-reference-swap]')) === 1 && swapBefore.join() === 'filled,empty', JSON.stringify(swapBefore))
    await page.locator('[data-reference-swap]').click()
    await page.waitForFunction(() => [...document.querySelectorAll('[data-asset-slot]')].map((el) => (el.querySelector('[data-asset-tile]') ? 'filled' : 'empty')).join() === 'empty,filled', null, { timeout: stationTimeout() })
    check('board:ComposerB3/ref.slot.swap.effect', true, '点对调：首帧的图落到尾帧')
    check('board:ComposerB3/compare.new-state', labels.length === 2 && (await count(page, '[data-reference-row] [data-reference-entry]')) === 1, 'B3k「新」：同一视频节点（首尾帧）的新排法 = 这一格')
    await shot(page, B3, 'b3d-video-first-last', 'B3d-zh-light')
    await context.close()
  }
  {
    const { page, context } = await open(B3, 'b3f-video-switch-first-last')
    check('board:ComposerB3/ref.slot.unused', (await count(page, '[data-reference-unused]')) === 1 && /未用到/.test((await text(page, '[data-reference-unused]')) ?? ''))
    check('board:ComposerB3/ref.tail.unused-note', (await text(page, '[data-reference-tail]')) === zh('assetLibrary.refRow.unusedNote'))
    await shot(page, B3, 'b3f-video-switch-first-last', 'B3f-zh-light')
    // ⑫（用户 10-22 拍板）：「未用到」那张也有同一颗悬停 ×（复用 ref.thumb.remove，不新增元素），点了就从节点上删掉它。
    const unusedTile = page.locator('[data-reference-unused] [data-asset-tile]').first()
    const before = { tiles: await refTiles(page), slots: await count(page, '[data-asset-slot] [data-asset-tile]') }
    await unusedTile.hover()
    const unusedRemove = page.locator('[data-reference-unused] [data-asset-tile-remove]').first()
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-reference-unused] [data-asset-tile-remove]')).opacity === '1', null, { timeout: stationTimeout() })
    await shot(page, B3, 'b3f-video-switch-first-last', 'B3f-unused-remove-hover-zh-light')
    await unusedRemove.click()
    await page.waitForFunction(() => !document.querySelector('[data-reference-unused]'), null, { timeout: stationTimeout() })
    const after = { tiles: await refTiles(page), slots: await count(page, '[data-asset-slot] [data-asset-tile]') }
    check('refslots.unused.remove', after.slots === before.slots && after.tiles === before.tiles - 1, JSON.stringify({ before, after }))
    await context.close()
  }

  // ── B3e 歧义提示：点「改首尾帧」，两张参考落到首帧 / 尾帧 ───────
  {
    const { page, context } = await open(B3, 'b3e-video-ambiguous')
    const tail = await text(page, '[data-reference-tail]')
    check('board:ComposerB3/ref.tail.ambiguity-hint', /参考图 2 张/.test(tail ?? '') && /要当首尾帧用？/.test(tail ?? '') && (await count(page, '[data-reference-hint-action="first-last"]')) === 1, String(tail))
    await shot(page, B3, 'b3e-video-ambiguous', 'B3e-zh-light')
    await page.locator('[data-reference-hint-action="first-last"]').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-asset-slot] [data-asset-tile]').length === 2, null, { timeout: stationTimeout() })
    check('board:ComposerB3/ref.tail.ambiguity-hint.effect', true, '点「改首尾帧」：两张参考落到首帧、尾帧')
    await context.close()
  }

  // ── B3g 图片 · 空：面板没有生成方式 ──────────────────────────────
  {
    const { page, context } = await open(B3, 'b3g-image-empty')
    const titles = await page.evaluate(() => [...document.querySelectorAll('[data-agent-parameter-panel] div')].filter((d) => !d.children.length).map((d) => d.textContent?.trim()))
    check('board:ComposerB3/params.mode.none-for-image', !titles.includes(zh('generationCommon.parameters.generationMode')), JSON.stringify(titles))
    check('board:ComposerB3/params.group.quality', titles.includes('清晰度') || titles.includes('画质'), JSON.stringify(titles))
    await shot(page, B3, 'b3g-image-empty', 'B3g-zh-light')
    await context.close()
  }

  // ── B3h 图片放 3 张图 ───────────────────────────────────────────
  {
    const { page, context } = await open(B3, 'b3h-image-three-refs')
    check('board:ComposerB3/ref.thumb.image', (await count(page, '[data-reference-row] [data-asset-tile]')) === 3 && (await text(page, '[data-reference-tail]')) === '参考图 3 张')
    await shot(page, B3, 'b3h-image-three-refs', 'B3h-zh-light')
    await context.close()
  }

  // ── B3i 模型不收参考图 ──────────────────────────────────────────
  {
    const { page, context } = await open(B3, 'b3i-image-no-ref-model')
    const entry = await page.evaluate(() => ({ pick: document.querySelector('[data-reference-entry]')?.hasAttribute('disabled'), title: document.querySelector('[data-reference-entry]')?.getAttribute('title') }))
    check('board:ComposerB3/ref.disabled-reason', entry.pick === true && /换个模型才能加参考图/.test(entry.title ?? ''), JSON.stringify(entry))
    check('board:ComposerB3/ref.tail.unsupported-note', /参考图 2 张 · 这个模型用不上，不会发出去/.test((await text(page, '[data-reference-tail]')) ?? ''))
    await shot(page, B3, 'b3i-image-no-ref-model', 'B3i-zh-light')
    await context.close()
  }

  // ── B3j 模型菜单 / 换模型之后 ───────────────────────────────────
  {
    const { page, context } = await open(B3, 'b3j-model-menu')
    const rows = await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((el) => ({ text: el.textContent?.trim() ?? '', h: Math.round(el.getBoundingClientRect().height) })))
    check('board:ComposerB3/modelmenu.row', rows.length >= 3 && rows.every((r) => r.h <= 34 && r.text.length < 24), JSON.stringify(rows))
    check('board:ComposerB3/modelmenu.footer-hide', /隐藏模型/.test(await page.evaluate(() => document.querySelector('[role="listbox"]')?.textContent ?? '')))
    check('board:ComposerB3/swap.before', (await count(page, '[data-asset-slot-label]')) === 2)
    await shot(page, B3, 'b3j-model-menu', 'B3j-menu-zh-light')
    await context.close()
  }
  {
    const { page, context } = await open(B3, 'b3j-after-swap')
    const body = await page.evaluate(() => document.querySelector('[data-reference-row]')?.textContent ?? '')
    check('board:ComposerB3/swap.after', (await count(page, '[data-reference-row] [data-asset-tile]')) === 2 && /参考图 2 张/.test(body) && !/换回|没有首尾帧/.test(await page.evaluate(() => document.querySelector('[data-reference-row]')?.textContent ?? '')))
    await shot(page, B3, 'b3j-after-swap', 'B3j-after-zh-light')
    await context.close()
  }

  // ── 转换（真点击）：参考 ↔ 首尾帧往返、换模型（上传的图 / 连线的图）——不是看摆好的终态，而是真点过去 ──
  {
    const { page, context } = await open(B3, 'b3s-video-three-uploads')
    check('board:ComposerB3/swap.roundtrip.before', (await refTiles(page)) === 3)
    await pickMode(page, '首尾帧')
    const mid = await page.evaluate(() => ({ slots: document.querySelectorAll('[data-asset-slot] [data-asset-tile]').length, unused: document.querySelectorAll('[data-reference-unused]').length }))
    await pickMode(page, '参考')
    const back = await refTiles(page)
    await pickMode(page, '首尾帧')
    await pickMode(page, '参考')
    check('board:ComposerB3/swap.roundtrip.click', mid.slots === 2 && mid.unused === 1 && back === 3 && (await refTiles(page)) === 3, JSON.stringify({ mid, back }))
    await shot(page, B3, 'b3s-video-three-uploads', 'B3s-roundtrip-zh-light')
    await context.close()
  }
  // ── 往返（参考图结构重写的验收线，2026-10-22）：节点上只存一份有序参考列表，换方式 / 换模型都不改它。
  //    中 / 英各真点一遍：3 张参考 → 首尾帧 → 参考；30 张（Seedance 2.5）→ Veo 3.1 → 切回，一张不少。
  // 「未用到」探针的基线：3 张上传切首尾帧时必有 1 张未用到——证明这个选择器测得到东西，下面「两条连线没有未用到」才算数。
  const unusedProbeProof = new Map()
  for (const [lang, langParam, scheme] of [['zh', '', 'light'], ['en', '&lang=en', 'dark']]) {
    const t = (key) => uiText(lang === 'zh' ? 'zh-CN' : 'en', key)
    const tag = `${lang}-${scheme}`
    const unusedTiles = (page) => count(page, '[data-reference-row] [data-reference-unused]')
    {
      const { page, context } = await open(B3, 'b3s-video-three-uploads', `${langParam}&scheme=${scheme}`)
      await pickMode(page, t('generationCommon.composerB3.modeFirstLast'))
      const mid = { slots: await count(page, '[data-asset-slot] [data-asset-tile]'), unused: await unusedTiles(page) }
      try { unusedProbeProof.set(tag, await proveProbe(page.locator('[data-reference-row] [data-reference-unused]'), `首尾帧方式下 3 张上传参考有 1 张淡显「未用到」（${tag}）`)) } catch { /* 基线不成立：下面的连线格会据此报红 */ }
      await shot(page, B3, 'b3s-video-three-uploads', `R1-3refs-firstlast-${tag}`)
      await pickMode(page, t('generationCommon.composerB3.modeReference'))
      const back = { tiles: await refTiles(page), unused: await unusedTiles(page) }
      await shot(page, B3, 'b3s-video-three-uploads', `R1-3refs-back-${tag}`)
      check(`refslots.roundtrip.three-refs.${tag}`, mid.slots === 2 && mid.unused === 1 && back.tiles === 3 && back.unused === 0, JSON.stringify({ mid, back }))
      await context.close()
    }
    {
      const { page, context } = await open(B3, 'b3r-video-30-refs', `${langParam}&scheme=${scheme}`)
      const before = await refTiles(page)
      await swapModel(page, 'Veo 3.1')
      await page.waitForSelector('[data-reference-row] [data-reference-unused]', { timeout: stationTimeout() })
      const there = { tiles: await refTiles(page), unused: await unusedTiles(page) }
      await shot(page, B3, 'b3r-video-30-refs', `R2-30refs-veo-${tag}`)
      await swapModel(page, 'Seedance 2.5')
      await page.waitForFunction(() => !document.querySelector('[data-reference-row] [data-reference-unused]'), null, { timeout: stationTimeout() })
      const back = { tiles: await refTiles(page), unused: await unusedTiles(page) }
      await shot(page, B3, 'b3r-video-30-refs', `R2-30refs-back-${tag}`)
      // 停在 Veo 3.1：在用 + 未用到 = 30（一张不删）；切回 Seedance 2.5：30 张都在用。
      check(`refslots.roundtrip.thirty-refs.${tag}`, before === 30 && there.tiles === 30 && there.unused > 0 && back.tiles === 30 && back.unused === 0, JSON.stringify({ before, there, back }))
      await context.close()
    }
  }

  // ── 连两条参考连线进首尾帧（用户 10-22 拍板 ⑪）：和上传一样依次落首帧、尾帧，没有「未用到」——中英各一遍 ──
  for (const [lang, langParam, scheme] of [['zh', '', 'light'], ['en', '&lang=en', 'dark']]) {
    const { page, context } = await open(B3, 'b3t-video-firstlast-two-ref-edges', `${langParam}&scheme=${scheme}`)
    await page.waitForSelector('[data-asset-slot] [data-asset-tile]', { timeout: stationTimeout() })
    const slots = await page.evaluate(() => [...document.querySelectorAll('[data-asset-slot]')].map((el) => (el.querySelector('[data-asset-tile]') ? 'filled' : 'empty')))
    const proof = unusedProbeProof.get(`${lang}-${scheme}`)
    let unusedAbsent = proof ? true : '「未用到」探针基线没立起来（上面 3 张往返那格）'
    if (proof) {
      try { await expectAbsent(page.locator('[data-reference-row] [data-reference-unused]'), { provenBy: proof, message: '两条参考连线都落进首尾帧，不该有「未用到」' }) } catch (error) { unusedAbsent = String(error?.message ?? error).split('\n')[0] }
    }
    await shot(page, B3, 'b3t-video-firstlast-two-ref-edges', `B3t-two-ref-edges-${lang}-${scheme}`)
    check(`refslots.edges.two-refs-into-first-last.${lang}-${scheme}`, slots.join() === 'filled,filled' && unusedAbsent === true, JSON.stringify({ slots, unusedAbsent }))
    await context.close()
  }

  // ── 旧工程残留先放一边（#1269 条件 4，协调 10-23 定、已报用户）：参考方式里以前藏着的首帧淡显「未用到」、悬停写「点一下用上」，
  //    点一下放回在用（参考行在用 +1、未用到 0）。挂在已有元素 ref.slot.unused 上，不新增元素。中 / 英 × 明 / 暗各一遍。
  for (const [lang, langParam, scheme] of [['zh', '', 'light'], ['zh', '', 'dark'], ['en', '&lang=en', 'light'], ['en', '&lang=en', 'dark']]) {
    const locale = lang === 'zh' ? 'zh-CN' : 'en'
    const tag = `${lang}-${scheme}`
    const { page, context } = await open(B3, 'b3u-video-legacy-parked', `${langParam}&scheme=${scheme}`)
    await page.waitForSelector('[data-reference-row] [data-reference-parked]', { timeout: stationTimeout() })
    const before = {
      tiles: await refTiles(page),
      inUse: await count(page, '[data-reference-row] [data-asset-tile]:not([data-reference-unused] [data-asset-tile])'),
      parked: await count(page, '[data-reference-row] [data-reference-parked]'),
      label: await text(page, '[data-reference-parked] > span'),
    }
    const parkedTile = page.locator('[data-reference-parked] [data-asset-tile]').first()
    await parkedTile.hover()
    await page.waitForSelector('[data-asset-tile-tip]', { timeout: stationTimeout() })
    const tip = await text(page, '[data-asset-tile-tip]')
    await shot(page, B3, 'b3u-video-legacy-parked', `B3u-legacy-parked-hover-${tag}`)
    const tipOk = new RegExp(uiTextPattern(uiText(locale, 'assetLibrary.refRow.useParked'))).test(tip ?? '')
    check(`board:ComposerB3/ref.slot.unused · 旧工程残留先放一边：淡显「未用到」，悬停写「点一下用上」（${tag}）`, before.parked === 1 && before.label === uiText(locale, 'assetLibrary.refRow.unused') && tipOk, JSON.stringify({ before, tip }))
    await parkedTile.click()
    await page.waitForFunction(() => !document.querySelector('[data-reference-row] [data-reference-unused]'), null, { timeout: stationTimeout() })
    await page.mouse.move(1, 1)
    const after = { tiles: await refTiles(page), unused: await count(page, '[data-reference-row] [data-reference-unused]') }
    await shot(page, B3, 'b3u-video-legacy-parked', `B3u-legacy-restored-${tag}`)
    check(`board:ComposerB3/ref.slot.unused · 点一下用上：放回在用，一张不少（${tag}）`, after.tiles === before.tiles && after.unused === 0, JSON.stringify({ before, after }))
    await context.close()
  }

  for (const [name, state] of [['Wan 2.7', 'b3j-model-menu'], ['Veo 3.1', 'b3j-model-menu'], ['Wan 2.7', 'b3j-swap-edges'], ['Veo 3.1', 'b3j-swap-edges']]) {
    const { page, context } = await open(B3, state)
    await swapModel(page, name)
    await page.waitForSelector('[data-reference-row]', { timeout: stationTimeout() })
    const tiles = await refTiles(page)
    const mode = await activeMode(page)
    const tail = (await text(page, '[data-reference-tail]')) ?? ''
    // 两张图都带过来了（显示在新模型的槽里），面板高亮的方式不是「看不见的文生」，也不是借来的别的方式
    check(`board:ComposerB3/swap.model.click.${state}.${name.replace(/\W/g, '')}`, tiles === 2 && Boolean(mode) && !/文生/.test(mode ?? ''), JSON.stringify({ tiles, mode, tail }))
    await shot(page, B3, state, `B3j-swap-${name.replace(/\W/g, '')}-${state === 'b3j-swap-edges' ? 'edges' : 'upload'}-zh-light`)
    await context.close()
  }

  // ── B3o 渠道直选 ────────────────────────────────────────────────
  {
    const { page, context } = await open(B3, 'b3o-model-menu-channel')
    const chips = await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((el) => el.querySelectorAll('button').length))
    check('keep.model.provider-pick', chips.some((n) => n >= 2), JSON.stringify(chips))
    await shot(page, B3, 'b3o-model-menu-channel', 'B3o-menu-zh-light')
    await context.close()
  }
  {
    const { page, context } = await open(B3, 'b3o-params-provider')
    const titles = await page.evaluate(() => [...document.querySelectorAll('[data-agent-parameter-panel] div')].filter((d) => !d.children.length).map((d) => d.textContent?.trim()))
    check('board:ComposerB3/params.group.provider', titles.includes('供应商'), JSON.stringify(titles))
    await shot(page, B3, 'b3o-params-provider', 'B3o-params-zh-light')
    await context.close()
  }

  // ── B3p 渠道缺方式 ──────────────────────────────────────────────
  {
    const { page, context } = await open(B3, 'b3p-channel-missing-mode')
    await page.waitForSelector('[data-testid="narrowed-mode-guidance"]', { timeout: stationTimeout() })
    const note = await page.evaluate(() => ({ text: document.querySelector('[data-testid="narrowed-mode-guidance"]')?.textContent ?? '', inRow: Boolean(document.querySelector('[data-reference-row] [data-testid="narrowed-mode-guidance"]')), link: document.querySelectorAll('[data-testid="narrowed-mode-guidance"] button').length }))
    check('board:ComposerB3/ref.tail.channel-missing-mode', /上没有/.test(note.text) && note.inRow && note.link === 2 && !/文生/.test(note.text), JSON.stringify(note))
    await shot(page, B3, 'b3p-channel-missing-mode', 'B3p-switch-zh-light')
    await context.close()
  }
  {
    const { page, context } = await open(B3, 'b3p-channel-missing-none')
    await page.waitForSelector('[data-testid="narrowed-mode-guidance"]', { timeout: stationTimeout() })
    check('board:ComposerB3/ref.tail.channel-missing-none', (await count(page, '[data-testid="narrowed-mode-guidance"] button')) === 1, '只有说明（和 × 关闭），没有换渠道的链接')
    await shot(page, B3, 'b3p-channel-missing-none', 'B3p-none-zh-light')
    await context.close()
  }

  // ── 数量 ────────────────────────────────────────────────────────
  {
    const { page, context } = await open(B3, 'b3q-image-quantity')
    const q = await page.evaluate(() => ({ text: document.querySelector('[data-bar-segment="quantity"]')?.textContent?.trim(), order: [...document.querySelectorAll('[data-node-composer-footer] [data-bar-segment]')].map((e) => e.getAttribute('data-bar-segment')) }))
    check('board:ComposerB3/bar.quantity', q.text === '1 张' && q.order.join('>') === 'model-params>prompt-tools>quantity>generate', JSON.stringify(q))
    await shot(page, B3, 'b3q-image-quantity', 'B3-quantity-zh-light')
    await context.close()
  }
  {
    // 没声明数量的模型：不出现
    const { page, context } = await open(B3, 'b3a-video-empty')
    check('board:ComposerB3/bar.quantity.absent', (await count(page, '[data-bar-segment="quantity"]')) === 0)
    await context.close()
  }

  // ── E1d 节点错误报告 ────────────────────────────────────────────
  {
    const { page, context } = await open(B3, 'e1d-node-error')
    check('board:ComposerB3/host.error-report', (await count(page, '[role="alert"]')) >= 1 && (await count(page, `${CARD} [data-reference-entry]`)) === 1 && (await count(page, `${CARD} [data-bar-segment="model-params"] button`)) >= 1)
    await shot(page, B3, 'e1d-node-error', 'E1d-zh-light')
    await context.close()
  }

  // ── 宿主：分镜行 / 列表详情 / Agent 输入框 ───────────────────────
  {
    const { page, context } = await open('storyboard-reuse', 'sbl-01-film-16x9-wide')
    const strip = await page.evaluate(() => ({ tiles: document.querySelectorAll('[data-storyboard-ref-thumb] [data-asset-tile]').length, chips: [...document.querySelectorAll('[data-storyboard-mention-chip]')].map((e) => e.getAttribute('aria-label')) }))
    check('board:ComposerB3/host.storyboard-row', strip.tiles >= 1 && strip.chips.length >= 1 && strip.chips.every((label) => !/^(图片|Image)\s?\d+$/.test(label ?? '')), JSON.stringify(strip))
    await shot(page, 'storyboard-reuse', 'sbl-01-film-16x9-wide', 'E1a-wide-zh-light')
    await context.close()
  }
  {
    const { page, context } = await open('storyboard-reuse', 'sbl-02-film-16x9-narrow')
    await shot(page, 'storyboard-reuse', 'sbl-02-film-16x9-narrow', 'E1a-narrow-zh-light')
    await context.close()
  }
  // E1a 三档宽（样张：宽 640 / 窄 400 / 最窄 320）× 中英：参考在提示词上一行、小图带名字、底栏「生成 ↑」
  for (const width of [640, 400, 320]) {
    for (const [lang, langParam] of [['zh', ''], ['en', '&lang=en']]) {
      const { page, context } = await open('storyboard-reuse', `sbl-e1a-${width}`, langParam)
      const facts = await page.evaluate(() => {
        const row = document.querySelector('[data-storyboard-row="1"]')
        const strip = row?.querySelector('[data-storyboard-refs="above"]')
        const editor = row?.querySelector('[data-prompt-box="true"], .ProseMirror')
        const generate = row?.querySelector('[data-storyboard-generate-state]')
        const bar = row?.querySelector('[data-storyboard-composer-bar]')
        const chips = [...(strip?.querySelectorAll('[data-storyboard-ref-thumb]') ?? [])].map((el) => ({ name: el.textContent?.trim() ?? '', h: Math.round(el.getBoundingClientRect().height) }))
        const sr = strip?.getBoundingClientRect()
        const er = editor?.getBoundingClientRect()
        const gr = generate?.getBoundingClientRect()
        const br = bar?.getBoundingClientRect()
        return {
          above: Boolean(sr && er && sr.bottom <= er.top + 1),
          chips,
          arrow: Boolean(generate?.querySelector('svg')),
          generateInsideBar: Boolean(gr && br && gr.right <= br.right + 1 && gr.bottom <= br.bottom + 1),
          clipped: row ? row.scrollWidth > row.clientWidth + 1 : true,
          density: row?.getAttribute('data-storyboard-row-density'),
          thumbAbove: (() => {
            const v = row?.querySelector('[data-storyboard-visual-column]')?.getBoundingClientRect()
            const c = row?.querySelector('[data-storyboard-content-column]')?.getBoundingClientRect()
            return Boolean(v && c && v.bottom <= c.top + 1)
          })(),
          paramsReadable: [...(bar?.querySelectorAll('[data-parameter-summary]') ?? [])].every((el) => el.getBoundingClientRect().width >= 60),
          // 字不截断（样张 E1a 320 档原注）：条里没有任何被省略号截掉的字
          truncated: [...(bar?.querySelectorAll('*') ?? [])].filter((el) => getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth).map((el) => el.textContent?.trim()),
          generateText: generate?.textContent?.trim() ?? '',
        }
      })
      check(`board:ComposerB3/host.storyboard-row.refs-above.${width}.${lang}`, facts.above && facts.chips.length >= 1 && facts.chips.every((c) => c.h === 28 && c.name) && facts.arrow && facts.generateInsideBar && !facts.clipped && facts.paramsReadable && !facts.truncated.length && (width >= 520 || (facts.density === 'compact' && facts.thumbAbove)), JSON.stringify(facts))
      // 英文图真是英文（此前分镜实验室屏不认 ?lang=en，英文图和中文图逐字节相同，几条「英文」断言是空跑）
      check(`board:ComposerB3/host.storyboard-row.lang.${width}.${lang}`, lang === 'en' ? facts.generateText === uiText('en', 'storyboardEditor.frame.generate') : facts.generateText === zh('storyboardEditor.frame.generate'), facts.generateText)
      await shot(page, 'storyboard-reuse', `sbl-e1a-${width}`, `E1a-${width}-${lang}-light`)
      if (lang === 'en' && WITH_EVIDENCE) {
        const hash = (name) => createHash('sha256').update(fs.readFileSync(path.join(EVIDENCE_DIR, name))).digest('hex')
        check(`board:ComposerB3/host.storyboard-row.en-differs.${width}`, hash(`E1a-${width}-en-light.png`) !== hash(`E1a-${width}-zh-light.png`), '英文图不许和中文图逐字节相同')
      }
      await context.close()
    }
  }
  {
    const { page, context } = await open('generation-list', 'list-detail-done')
    await page.waitForSelector('[data-composer-host] [data-bar-segment="generate"]', { timeout: stationTimeout() })
    const host = await page.evaluate(() => ({ host: document.querySelector('[data-composer-host]')?.getAttribute('data-composer-host'), ref: Boolean(document.querySelector('[data-composer-host] [data-reference-entry]')), plus: Boolean(document.querySelector('[data-composer-host] [data-reference-add-entry]')), send: document.querySelector('[data-bar-segment="generate"]')?.closest('span[title]')?.getAttribute('title') ?? '' }))
    check('board:ComposerB3/host.list-detail', host.host === 'inline' && host.ref && host.plus && /重新生成/.test(host.send), JSON.stringify(host))
    await shot(page, 'generation-list', 'list-detail-done', 'E1c-zh-light')
    await context.close()
  }
  {
    const { page, context } = await open('agent-panel-v4', 'v4-composer-reference-button')
    const agent = await page.evaluate(() => { const b = document.querySelector('[data-reference-entry]'); const r = b?.getBoundingClientRect(); return { w: Math.round(r?.width ?? 0), chips: [...document.querySelectorAll('[data-storyboard-mention-chip]')].map((e) => e.getAttribute('aria-label')) } })
    check('board:ComposerB3/host.agent-input-ref-button', agent.w === 28 && agent.chips.join() === '女主肖像,海边小镇', JSON.stringify(agent))
    await shot(page, 'agent-panel-v4', 'v4-composer-reference-button', 'E1b-zh-light')
    await context.close()
  }

  // ── 中 / 英 × 明 / 暗：每个格各查一遍（EVIDENCE=1 时顺手截图）：英文不漏中文、底栏字不被省略号截掉、参考行没有多出的滚动条 ──────────
  {
    const ids = ['b3a-video-empty', 'b3b-video-params', 'b3c-video-three-refs', 'b3d-video-first-last', 'b3e-video-ambiguous', 'b3f-video-switch-first-last', 'b3t-video-firstlast-two-ref-edges', 'b3g-image-empty', 'b3h-image-three-refs', 'b3i-image-no-ref-model', 'b3j-model-menu', 'b3j-after-swap', 'b3o-model-menu-channel', 'b3o-params-provider', 'b3p-channel-missing-mode', 'b3p-channel-missing-none', 'b3q-image-quantity', 'e1d-node-error']
    const short = (id) => id.replace(/^(b3[a-z]|e1d)-.*/, (m, p) => p).toUpperCase() + '-' + id.replace(/^(b3[a-z]|e1d)-/, '')
    for (const id of ids) {
      for (const [lang, langParam] of [['zh', ''], ['en', '&lang=en']]) {
        for (const scheme of ['light', 'dark']) {
          const { page, context } = await open(B3, id, `${langParam}&scheme=${scheme}`)
          const out = path.join(EVIDENCE_DIR, `${short(id)}-${lang}-${scheme}.png`)
          if (WITH_EVIDENCE && !(lang === 'zh' && scheme === 'light')) { // 中文浅色已在上面各格里截过
            if (/params|menu/.test(id)) await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 900, height: 720 }, animations: 'disabled' })
            else await page.locator(`[data-design-lab-shot="${id}"]`).screenshot({ path: out, animations: 'disabled' })
          }
          const clipped = await page.evaluate(() => [...document.querySelectorAll('.generation-canvas-v2-node__composer [data-node-composer-footer] *')].filter((el) => getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth).map((el) => el.textContent?.trim()))
          check(`board:ComposerB3/bar.no-truncation.${id}.${lang}.${scheme}`, !clipped.length, JSON.stringify(clipped))
          // ⑩（用户 10-22 拍板）：参考行格下的字（首帧 / 尾帧 / 未用到）互不重叠——英文「Last frame」「Unused」最长。
          const overlaps = await page.evaluate(() => {
            const labels = [...document.querySelectorAll('[data-reference-row] [data-asset-slot-label], [data-reference-row] [data-reference-unused] > span')]
              .map((el) => ({ text: el.textContent?.trim() ?? '', r: el.getBoundingClientRect() }))
            const hits = []
            for (let i = 0; i < labels.length; i += 1) for (let j = i + 1; j < labels.length; j += 1) {
              const a = labels[i].r; const b = labels[j].r
              if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) hits.push(`${labels[i].text}×${labels[j].text}`)
            }
            return hits
          })
          check(`refslots.labels.no-overlap.${id}.${lang}.${scheme}`, !overlaps.length, JSON.stringify(overlaps))
          const scroller = await page.evaluate(() => { const el = document.querySelector('[data-node-composer-references]'); return el ? { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, overflowY: getComputedStyle(el).overflowY } : null })
          if (scroller && id !== 'b3r-video-30-refs') check(`board:ComposerB3/ref.row.no-scrollbar.${id}.${lang}.${scheme}`, scroller.scrollHeight <= scroller.clientHeight, JSON.stringify(scroller))
          if (lang === 'en' && id === 'b3c-video-three-refs') {
            check('board:ComposerB3/en.reference-state', /3 references/.test((await text(page, '[data-reference-tail]')) ?? '') && /Connected text/.test((await page.evaluate(() => document.querySelector('[data-connected-text-chip]')?.textContent ?? ''))), '英文：参考 3 张含连线 + Connected text')
          }
          if (lang === 'en' && id === 'b3d-video-first-last') {
            const enLabels = await page.evaluate(() => [...document.querySelectorAll('[data-asset-slot-label]')].map((el) => el.textContent?.trim()))
            check('board:ComposerB3/en.first-last-state', enLabels.length === 2 && /^First/.test(enLabels[0]) && /^Last/.test(enLabels[1]), JSON.stringify(enLabels))
          }
          if (lang === 'en') {
            const cjk = await page.evaluate(() => [...document.querySelectorAll('.generation-canvas-v2-node__composer *')].filter((el) => !el.children.length && /[一-鿿]/.test(el.textContent ?? '') && !el.closest('[data-prompt-box]') && !el.closest('[data-reference-row] [data-storyboard-mention-chip]')).map((el) => el.textContent?.trim()))
            // 夹具里的用户内容（节点标题「开场白」、渠道名「渠道 A / B」）本来就是中文，不是界面文案。
            const allowed = (text) => !/[一-鿿]/.test((text ?? '').replace(/开场白|渠道 [AB]/g, ''))
            check(`board:ComposerB3/en.no-cjk.${id}`, !cjk.filter((t) => !allowed(t)).length, JSON.stringify(cjk))
          }
          await context.close()
        }
      }
    }
  }

  if (pageErrors.length) failures.push(`页面抛错 ${pageErrors.length} 条：${pageErrors.slice(0, 3).join(' | ')}`)
} finally {
  await browser.close()
  vite.kill('SIGTERM')
}

console.log(`\n通过 ${passed.length} 条${failures.length ? `，失败 ${failures.length} 条` : ''}`)
if (failures.length) {
  console.error(failures.map((f) => `  ✗ ${f}`).join('\n'))
  process.exit(1)
}
