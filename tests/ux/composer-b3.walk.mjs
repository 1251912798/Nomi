// 生成框 B3（I-b1a）走查：画布节点生成框 + 四个复用宿主，**真组件**、零额度。
//
// 一格 = 实验室里现役 `BaseGenerationNode` + `NodeGenerationComposer`（节点、连线、上传参考灌进真 store，
// 模型目录种缓存；见 src/devlab/designLab/nodeComposerBar/nodeComposerB3LabKit.tsx）。这里对**每个拍板元素**
// 量一条用户看得见的事实（尺寸 / 文字 / 悬停 / 点一下的结果），断言名 `board:ComposerB3/<元素 id>` 与清单一一对应。
//
// 同时产出证据图（docs/evidence/2026-10-19-b1a/）：每个格 × 中 / 英 × 明 / 暗，加悬停小提示、悬停大图、四个宿主。
//
// 用法：node tests/ux/composer-b3.walk.mjs        （EVIDENCE=0 只跑断言不截图）
import { chromium } from 'playwright'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
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
const browser = await chromium.launch({ headless: true })
const pageErrors = []

/** 打开一格，拿到页面。`extra` 追加 URL 参数（?scheme=dark&lang=en）。 */
async function open(screen, state, extra = '') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(`${state}: ${String(error).slice(0, 200)}`))
  await page.goto(`${BASE}/design-lab.html?screen=${screen}&frame=1&state=${state}${extra}`, { timeout: 180000 })
  await page.waitForFunction(() => window.__designLabReady === true, null, { timeout: 90000 })
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
    check('board:ComposerB3/bar.params', /16:9/.test(summary) && !/参考|首尾帧|首帧/.test(summary), summary)
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
    const sendOk = Boolean(send) && send.w === 30 && send.h === 30 && send.round && send.arrow && send.text === '' && /生成（Enter）/.test(send.tip)
    check('board:ComposerB3/bar.send', sendOk, JSON.stringify(send))
    check('board:ComposerB3/bar.send.circle', sendOk, JSON.stringify(send))
    check('board:ComposerB3/bar.send.text', !send?.text, 'D2「生成」字钮作废：生成钮上没有字')
    check('board:ComposerB3/prompt.expand.hidden-when-short', (await count(page, '[data-prompt-expand-toggle]')) === 0, '提示词短的时候没有展开钮（点了没反应的控件不放）')
    await page.locator(`${CARD} [data-prompt-box] .ProseMirror`).click()
    await page.keyboard.type(Array.from({ length: 40 }, (_, i) => `第 ${i + 1} 行镜头描述`).join('\n').replace(/\n/g, ' '.repeat(0) + '\n'))
    await page.waitForSelector('[data-prompt-expand-toggle]', { timeout: 10000 })
    await page.locator('[data-prompt-expand-toggle]').click()
    await page.waitForSelector('[data-prompt-expanded="true"]', { timeout: 5000 })
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
      const titles = [...el.querySelectorAll('div')].filter((d) => d.children.length === 0).map((d) => d.textContent?.trim()).filter(Boolean)
      const modes = [...el.querySelectorAll('[data-agent-generation-mode] [role="radio"]')].map((b) => b.textContent?.trim())
      return { modes, w: Math.round(el.getBoundingClientRect().width), titles, hint: [...el.querySelectorAll('[title]')].map((n) => n.getAttribute('title')) }
    })
    check('board:ComposerB3/params.popover', panel?.w === 320, JSON.stringify(panel))
    check('board:ComposerB3/params.group.mode', panel?.titles?.[0] === '生成方式' && panel.modes[0] === '参考' && !panel.modes.some((m) => /文生/.test(m ?? '')), JSON.stringify(panel))
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
    check('board:ComposerB3/ref.thumb', tiles.length === 3 && tiles.every((t) => t.w === 40 && t.h === 40) && (await count(page, '[data-asset-tile-badge]')) === 0, JSON.stringify(tiles))
    check('board:ComposerB3/ref.count-label', (await text(page, '[data-reference-tail]')) === '参考图 3 张')
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-storyboard-mention-chip]')].map((el) => ({ label: el.getAttribute('aria-label'), thumb: Math.round(el.querySelector('span')?.getBoundingClientRect().width ?? 0) })))
    check('board:ComposerB3/prompt.ref-chip', chips.length === 3 && chips.map((c) => c.label).join(',') === '女主肖像,海边小镇,树林' && chips.every((c) => c.thumb === 16), JSON.stringify(chips))
    const textChip = await page.evaluate(() => { const el = document.querySelector('[data-connected-text-chip]'); return { text: el?.textContent?.trim() ?? '', disconnect: Boolean(el?.querySelector('[data-connected-text-disconnect]')) } })
    check('board:ComposerB3/prompt.text-chip', /^连入文字 · 开场白/.test(textChip.text) && textChip.disconnect, JSON.stringify(textChip))
    // 悬停：先小提示，停满约 0.45 秒再出大图
    const first = page.locator('[data-reference-row] [data-asset-tile]').nth(0)
    check('board:ComposerB3/ref.thumb.remove.quiet', (await page.evaluate(() => getComputedStyle(document.querySelector('[data-asset-tile-remove]')).opacity)) === '0', '平时没有 ×')
    await first.hover()
    await page.waitForSelector('[data-asset-tile-tip]', { timeout: 5000 })
    const tip = await text(page, '[data-asset-tile-tip]')
    check('board:ComposerB3/ref.thumb.tooltip', /女主肖像/.test(tip ?? '') && /断开连线/.test(tip ?? ''), String(tip))
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-asset-tile-remove]')).opacity === '1', null, { timeout: 5000 })
    check('board:ComposerB3/ref.thumb.remove', (await page.evaluate(() => document.querySelector('[data-asset-tile-remove]').getAttribute('aria-label'))) === '断开连线')
    await shot(page, B3, 'b3c-video-three-refs', 'B3n-hover-tip-zh-light')
    await page.waitForSelector('[data-asset-tile-zoom]', { timeout: 5000 })
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
    check('board:ComposerB3/ref.slot.last', labels[1] === '尾帧（可不填）' || labels[1] === '尾帧', JSON.stringify(labels))
    const swapBefore = await page.evaluate(() => [...document.querySelectorAll('[data-asset-slot]')].map((el) => el.querySelector('[data-asset-tile]') ? 'filled' : 'empty'))
    check('board:ComposerB3/ref.slot.swap', (await count(page, '[data-reference-swap]')) === 1 && swapBefore.join() === 'filled,empty', JSON.stringify(swapBefore))
    await page.locator('[data-reference-swap]').click()
    await page.waitForFunction(() => [...document.querySelectorAll('[data-asset-slot]')].map((el) => (el.querySelector('[data-asset-tile]') ? 'filled' : 'empty')).join() === 'empty,filled', null, { timeout: 5000 })
    check('board:ComposerB3/ref.slot.swap.effect', true, '点对调：首帧的图落到尾帧')
    check('board:ComposerB3/compare.new-state', labels.length === 2 && (await count(page, '[data-reference-row] [data-reference-entry]')) === 1, 'B3k「新」：同一视频节点（首尾帧）的新排法 = 这一格')
    await shot(page, B3, 'b3d-video-first-last', 'B3d-zh-light')
    await context.close()
  }
  {
    const { page, context } = await open(B3, 'b3f-video-switch-first-last')
    check('board:ComposerB3/ref.slot.unused', (await count(page, '[data-reference-unused]')) === 1 && /未用到/.test((await text(page, '[data-reference-unused]')) ?? ''))
    check('board:ComposerB3/ref.tail.unused-note', (await text(page, '[data-reference-tail]')) === '首尾帧用不到，切回参考还在')
    await shot(page, B3, 'b3f-video-switch-first-last', 'B3f-zh-light')
    await context.close()
  }

  // ── B3e 歧义提示：点「改成首尾帧」，两张参考落到首帧 / 尾帧 ───────
  {
    const { page, context } = await open(B3, 'b3e-video-ambiguous')
    const tail = await text(page, '[data-reference-tail]')
    check('board:ComposerB3/ref.tail.ambiguity-hint', /参考图 2 张/.test(tail ?? '') && /要当首尾帧用？/.test(tail ?? '') && (await count(page, '[data-reference-hint-action="first-last"]')) === 1, String(tail))
    await shot(page, B3, 'b3e-video-ambiguous', 'B3e-zh-light')
    await page.locator('[data-reference-hint-action="first-last"]').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-asset-slot] [data-asset-tile]').length === 2, null, { timeout: 5000 })
    check('board:ComposerB3/ref.tail.ambiguity-hint.effect', true, '点「改成首尾帧」：两张参考落到首帧、尾帧')
    await context.close()
  }

  // ── B3g 图片 · 空：面板没有生成方式 ──────────────────────────────
  {
    const { page, context } = await open(B3, 'b3g-image-empty')
    const titles = await page.evaluate(() => [...document.querySelectorAll('[data-agent-parameter-panel] div')].filter((d) => d.children.length === 0).map((d) => d.textContent?.trim()))
    check('board:ComposerB3/params.mode.none-for-image', !titles.includes('生成方式'), JSON.stringify(titles))
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
    check('board:ComposerB3/modelmenu.footer-hide', /隐藏模型/.test(await page.evaluate(() => document.body.textContent ?? '')))
    check('board:ComposerB3/swap.before', (await count(page, '[data-asset-slot-label]')) === 2)
    await shot(page, B3, 'b3j-model-menu', 'B3j-menu-zh-light')
    await context.close()
  }
  {
    const { page, context } = await open(B3, 'b3j-after-swap')
    const body = await page.evaluate(() => document.querySelector('[data-reference-row]')?.textContent ?? '')
    check('board:ComposerB3/swap.after', (await count(page, '[data-reference-row] [data-asset-tile]')) === 2 && /参考图 2 张/.test(body) && !/换回|没有首尾帧/.test(await page.evaluate(() => document.body.textContent ?? '')))
    await shot(page, B3, 'b3j-after-swap', 'B3j-after-zh-light')
    await context.close()
  }

  // ── B3o 渠道直选 ────────────────────────────────────────────────
  {
    const { page, context } = await open(B3, 'b3o-model-menu-channel')
    const chips = await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((el) => el.querySelectorAll('button, [data-chip]').length))
    check('keep.model.provider-pick', chips.some((n) => n >= 2), JSON.stringify(chips))
    await shot(page, B3, 'b3o-model-menu-channel', 'B3o-menu-zh-light')
    await context.close()
  }
  {
    const { page, context } = await open(B3, 'b3o-params-provider')
    const titles = await page.evaluate(() => [...document.querySelectorAll('[data-agent-parameter-panel] div')].filter((d) => d.children.length === 0).map((d) => d.textContent?.trim()))
    check('board:ComposerB3/params.group.provider', titles.includes('供应商'), JSON.stringify(titles))
    await shot(page, B3, 'b3o-params-provider', 'B3o-params-zh-light')
    await context.close()
  }

  // ── B3p 渠道缺方式 ──────────────────────────────────────────────
  {
    const { page, context } = await open(B3, 'b3p-channel-missing-mode')
    await page.waitForSelector('[data-testid="narrowed-mode-guidance"]', { timeout: 10000 })
    const note = await page.evaluate(() => ({ text: document.querySelector('[data-testid="narrowed-mode-guidance"]')?.textContent ?? '', inRow: Boolean(document.querySelector('[data-reference-row] [data-testid="narrowed-mode-guidance"]')), link: document.querySelectorAll('[data-testid="narrowed-mode-guidance"] button').length }))
    check('board:ComposerB3/ref.tail.channel-missing-mode', /上没有/.test(note.text) && note.inRow && note.link === 2 && !/文生/.test(note.text), JSON.stringify(note))
    await shot(page, B3, 'b3p-channel-missing-mode', 'B3p-switch-zh-light')
    await context.close()
  }
  {
    const { page, context } = await open(B3, 'b3p-channel-missing-none')
    await page.waitForSelector('[data-testid="narrowed-mode-guidance"]', { timeout: 10000 })
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
  {
    const { page, context } = await open('generation-list', 'list-detail-done')
    await page.waitForSelector('[data-composer-host] [data-bar-segment="generate"]', { timeout: 20000 })
    const host = await page.evaluate(() => ({ host: document.querySelector('[data-composer-host]')?.getAttribute('data-composer-host'), ref: Boolean(document.querySelector('[data-composer-host] [data-reference-entry]')), send: document.querySelector('[data-bar-segment="generate"]')?.closest('span[title]')?.getAttribute('title') ?? '' }))
    check('board:ComposerB3/host.list-detail', host.host === 'inline' && host.ref && /重新生成/.test(host.send), JSON.stringify(host))
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

  // ── 中 / 英 × 明 / 暗：每个格各截一遍（证据）+ 英文不漏中文 ──────────
  if (WITH_EVIDENCE) {
    const ids = ['b3a-video-empty', 'b3b-video-params', 'b3c-video-three-refs', 'b3d-video-first-last', 'b3e-video-ambiguous', 'b3f-video-switch-first-last', 'b3g-image-empty', 'b3h-image-three-refs', 'b3i-image-no-ref-model', 'b3j-model-menu', 'b3j-after-swap', 'b3o-model-menu-channel', 'b3o-params-provider', 'b3p-channel-missing-mode', 'b3p-channel-missing-none', 'b3q-image-quantity', 'e1d-node-error']
    const short = (id) => id.replace(/^(b3[a-z]|e1d)-.*/, (m, p) => p).toUpperCase() + '-' + id.replace(/^(b3[a-z]|e1d)-/, '')
    for (const id of ids) {
      for (const [lang, langParam] of [['zh', ''], ['en', '&lang=en']]) {
        for (const scheme of ['light', 'dark']) {
          if (lang === 'zh' && scheme === 'light') continue // 已在上面截过
          const { page, context } = await open(B3, id, `${langParam}&scheme=${scheme}`)
          const out = path.join(EVIDENCE_DIR, `${short(id)}-${lang}-${scheme}.png`)
          if (/params|menu/.test(id)) await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 900, height: 720 }, animations: 'disabled' })
          else await page.locator(`[data-design-lab-shot="${id}"]`).screenshot({ path: out, animations: 'disabled' })
          if (lang === 'en' && id === 'b3c-video-three-refs') {
            check('board:ComposerB3/en.reference-state', /3 references/.test((await text(page, '[data-reference-tail]')) ?? '') && /Connected text/.test((await page.evaluate(() => document.querySelector('[data-connected-text-chip]')?.textContent ?? ''))), '英文：参考 3 张含连线 + Connected text')
          }
          if (lang === 'en' && id === 'b3d-video-first-last') {
            const enLabels = await page.evaluate(() => [...document.querySelectorAll('[data-asset-slot-label]')].map((el) => el.textContent?.trim()))
            check('board:ComposerB3/en.first-last-state', enLabels.length === 2 && /^First/.test(enLabels[0]) && /^Last/.test(enLabels[1]), JSON.stringify(enLabels))
          }
          if (lang === 'en') {
            const cjk = await page.evaluate(() => [...document.querySelectorAll('.generation-canvas-v2-node__composer *')].filter((el) => el.children.length === 0 && /[一-鿿]/.test(el.textContent ?? '') && !el.closest('[data-prompt-box]') && !el.closest('[data-reference-row] [data-storyboard-mention-chip]')).map((el) => el.textContent?.trim()))
            // 夹具里的用户内容（节点标题「开场白」、渠道名「渠道 A / B」）本来就是中文，不是界面文案。
            const allowed = (text) => !/[一-鿿]/.test((text ?? '').replace(/开场白|渠道 [AB]/g, ''))
            check(`board:ComposerB3/en.no-cjk.${id}`, cjk.filter((t) => !allowed(t)).length === 0, JSON.stringify(cjk))
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
