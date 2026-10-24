// 画布规模基准（tests/perf/canvas-scale-bench.mjs）的「工作台」场景：卡顿场景表（tests/perf/scenarios/）里
// 不是「一个手势在 N 个节点上的帧间隔」的那几类——点一下到界面到位（response）、长文打字、时间轴、
// 以及「后台在忙时操作画布」。共用同一份夹具、同一个启动器、同一个帧探针（startWindow / stopWindow），
// 不另起 harness（P0：Playwright + CDP + PerformanceObserver，不自写剖析器）。
//
// 每个场景返回 { raw, responseMs?, ... }：raw 是帧探针在被测那一段的读数（帧间隔、长任务、DOM 变动），
// responseMs 是「操作 → 界面到位再过两帧」（见 responseTimer.mjs）。准备动作不进窗口。
//
// 需要后台负载的两条（生成中 / Agent 流式）由 launchExtras 在起 App 之前把本机假供应商装进隔离设置目录：
// 零花费、零外网（主进程网络闸 walkthrough-network-guard 只放行本机）。
import fs from 'node:fs'
import path from 'node:path'
import { armResponse, takeResponse } from './responseTimer.mjs'
import { findCanvasBlankPoint, revealArrivals } from '../../ux/_canvasHit.mjs'
import { addCanvasNode, canvasAddBar, ensureAgentPanelOpen, revealCanvasDock } from '../../ux/_shell.mjs'
import { uiText } from '../../ux/full-walk/invariants.mjs'

/** 本模块提供的场景名（canvas-scale-bench 的 --scenarios 可选值的一部分）。 */
export const WORKBENCH_SCENARIOS = Object.freeze([
  'select-composer',
  'select-shot-table',
  'shot-table-row-height',
  'create-node-burst',
  'switch-stages',
  'switch-canvas-list',
  'document-typing',
  'text-node-typing',
  'creation-ai-rewrite-result',
  'timeline-play',
  'timeline-scrub',
  'pan-while-generating',
  'pan-while-agent-streaming',
  'library-skill-open',
  'library-prompt-open',
  'library-prompt-scroll',
  'library-prompt-search',
])

const sleep = (page, ms) => page.waitForTimeout(ms)
const round = (value) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : null)
const quantile = (values, q) => {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (!sorted.length) return null
  return round(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))])
}
const GENERATING_NODES = 6
const LONG_DOCUMENT_PARAGRAPHS = 400
// 画布文本节点打字：一张写了 60 段（约 3000 字）的文本节点，和规模夹具里的媒体节点同画布。
const TEXT_NODE_ID = 'perf-text-node'
const TEXT_NODE_PARAGRAPHS = 60
// 写作区 AI 编辑场景：2000 段文稿，选中 180 段（约 8000 字）。
const REWRITE_DOCUMENT_PARAGRAPHS = 2000
const REWRITE_SELECTED_PARAGRAPHS = 180
const STREAM_TEXT = '镜头缓缓推进，雨夜的街道上霓虹倒映在积水里，主角撑伞穿过人群。'.repeat(40)

// ——— 起 App 之前：夹具补料 / 假供应商 ————————————————————————————————————————

/**
 * 场景需要的额外启动条件。返回 { launch: launchNomiApp 的额外选项, close(): 收尾 }。
 * fixture 是 createCanvasPerformanceFixture 的返回；root 是本次（规模 × 场景）独占的临时目录。
 */
export async function prepareWorkbenchLaunch(scenario, { fixture, root, repoRoot }) {
  if (scenario === 'document-typing') {
    seedLongDocument(fixture)
    return { launch: {}, close: async () => {} }
  }
  if (scenario === 'text-node-typing') {
    seedTextNode(fixture)
    return { launch: {}, close: async () => {} }
  }
  if (scenario === 'creation-ai-rewrite-result') {
    seedLongDocument(fixture, REWRITE_DOCUMENT_PARAGRAPHS)
    return { launch: {}, close: async () => {} }
  }
  if (scenario.startsWith('library-')) {
    // 技能库 / 提示词库（设计卡 docs/plan/2026-10-23-skill-prompt-library-layout.md ★7）：零外网（网络闸只放行本机，
    // 远端示例媒体照样「发出去」、被闸拦下，媒体请求数照数）；提示词场景把公开库撑到最坏规模（5 个来源 × 280 = 1400 条）。
    const settingsDir = path.join(root, 'settings')
    fs.mkdirSync(settingsDir, { recursive: true })
    const publicPrompts = scenario.startsWith('library-prompt') ? seedPublicPromptCache(settingsDir, repoRoot) : 0
    return {
      launch: { settingsDir, mainRequire: [path.join(repoRoot, 'scripts', 'walkthrough-network-guard.cjs')], env: { NOMI_TEST_NETWORK_GUARD: '1' } },
      publicPrompts,
      close: async () => {},
    }
  }
  if (scenario === 'pan-while-generating' || scenario === 'pan-while-agent-streaming') {
    const settingsDir = path.join(root, 'settings')
    fs.mkdirSync(settingsDir, { recursive: true })
    const guard = {
      mainRequire: [path.join(repoRoot, 'scripts', 'walkthrough-network-guard.cjs')],
      env: { NOMI_TEST_NETWORK_GUARD: '1' },
    }
    if (scenario === 'pan-while-generating') {
      const { createProcessFixture } = await import('../../ux/process-feedback-real-fixture.mjs')
      const provider = await createProcessFixture(repoRoot, settingsDir)
      return { launch: { settingsDir, ...guard }, provider, close: () => provider.close() }
    }
    const { createAgentRuntimeFixture, FIXTURE_TEXT_MODEL, FIXTURE_VENDOR } = await import('../../ux/agent-runtime-fixture.mjs')
    const provider = await createAgentRuntimeFixture({ rootDir: repoRoot, settingsDir })
    // 常驻应答：每一句都回一段慢慢吐的长正文（约 2400 字，12 字一帧、40ms 一帧 ≈ 8 秒）。
    provider.respond({ label: 'perf stream', match: () => true, reply: { type: 'stream', text: STREAM_TEXT, chunkChars: 12, intervalMs: 40 } })
    return {
      launch: {
        settingsDir,
        ...guard,
        initialLocalStorage: { 'nomi.assistantModel': JSON.stringify({ vendorKey: FIXTURE_VENDOR, modelKey: FIXTURE_TEXT_MODEL }) },
      },
      provider,
      close: () => provider.close(),
    }
  }
  return { launch: {}, close: async () => {} }
}

/** 给夹具项目塞一份长文稿（约 2 万字）并设为当前文稿：「文稿里长文打字」量的就是它。 */
function seedLongDocument(fixture, paragraphCount = LONG_DOCUMENT_PARAGRAPHS) {
  const manifest = path.join(fixture.projectRoot, '.nomi', 'project.json')
  const record = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  const paragraph = (index) => ({ type: 'paragraph', content: [{ type: 'text', text: `第 ${index + 1} 段：夜里的街道，雨一直在下，霓虹灯在积水里碎成一片一片，她没有回头，伞沿压得很低。` }] })
  const document = {
    id: 'perf-long-document', version: 1, title: 'Long document', updatedAt: Date.now(),
    contentJson: { type: 'doc', content: Array.from({ length: paragraphCount }, (_, index) => paragraph(index)) },
  }
  record.payload = { ...record.payload, workbenchDocuments: [document], activeDocumentId: document.id }
  fs.writeFileSync(manifest, JSON.stringify(record, null, 1))
}

/** 给夹具画布加一张长文本节点（约 3000 字），放在网格左侧：「画布文本节点里打字」量的就是它。 */
function seedTextNode(fixture) {
  const manifest = path.join(fixture.projectRoot, '.nomi', 'project.json')
  const record = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  const paragraph = (index) => ({ type: 'paragraph', content: [{ type: 'text', text: `第 ${index + 1} 行：雨夜站台，她回头看了一眼，列车进站的灯扫过积水。` }] })
  const canvas = record.payload.generationCanvas
  const node = {
    id: TEXT_NODE_ID, kind: 'text', categoryId: 'shots', title: 'Perf text', status: 'idle',
    position: { x: -460, y: 80 }, exactPosition: true, size: { width: 360, height: 480 },
    references: [], history: [], runs: [], meta: { userResized: true },
    contentJson: { type: 'doc', content: Array.from({ length: TEXT_NODE_PARAGRAPHS }, (_, index) => paragraph(index)) },
  }
  record.payload = { ...record.payload, generationCanvas: { ...canvas, nodes: [...(canvas.nodes ?? []).filter((candidate) => candidate.id !== TEXT_NODE_ID), node] } }
  fs.writeFileSync(manifest, JSON.stringify(record, null, 1))
}

const LIBRARY_PUBLIC_PER_SOURCE = 280

/**
 * 公开库撑到最坏规模：主进程在网络闸下返回「内置 + 地板」，地板优先读设置目录里的磁盘缓存（promptLibraryStore.ts）。
 * 拿打包快照（5 个来源 × 30 条）按来源循环复制到每源 280 条，写成那份缓存——数据形状与线上拉回来的一致。
 */
function seedPublicPromptCache(settingsDir, repoRoot) {
  const seed = JSON.parse(fs.readFileSync(path.join(repoRoot, 'electron', 'promptLibrary', 'promptLibrarySeed.json'), 'utf8'))
  const bySource = new Map()
  for (const prompt of seed) bySource.set(prompt.sourceId, [...(bySource.get(prompt.sourceId) ?? []), prompt])
  const prompts = []
  for (const [sourceId, rows] of bySource) {
    for (let index = 0; index < LIBRARY_PUBLIC_PER_SOURCE; index += 1) {
      const base = rows[index % rows.length]
      const lap = Math.floor(index / rows.length)
      prompts.push({ ...base, id: `${sourceId}-${index + 1}`, title: lap ? `${base.title} · ${lap + 1}` : base.title })
    }
  }
  fs.writeFileSync(path.join(settingsDir, 'prompt-library-cache.json'), JSON.stringify({ at: Date.now(), prompts }))
  return prompts.length
}

// ——— 场景 ——————————————————————————————————————————————————————————————

/**
 * @param {import('playwright').Page} page
 * @param {string} scenario
 * @param {{ app, fixture, runIndex: number, state: object, startWindow, stopWindow, stageBox, extras }} ctx
 *   state：同一个 App 实例里跨采样保留的东西（例如生成框的懒加载块是否已经拉过）。
 */
export async function runWorkbenchScenario(page, scenario, ctx) {
  if (scenario === 'select-composer') return selectComposer(page, ctx)
  if (scenario === 'select-shot-table') return selectShotTable(page, ctx)
  if (scenario === 'shot-table-row-height') return shotTableRowHeight(page, ctx)
  if (scenario === 'create-node-burst') return createNodeBurst(page, ctx)
  if (scenario === 'switch-stages') return switchStages(page, ctx)
  if (scenario === 'switch-canvas-list') return switchCanvasList(page, ctx)
  if (scenario === 'document-typing') return documentTyping(page, ctx)
  if (scenario === 'text-node-typing') return textNodeTyping(page, ctx)
  if (scenario === 'creation-ai-rewrite-result') return creationAiRewriteResult(page, ctx)
  if (scenario === 'timeline-play') return timelinePlay(page, ctx)
  if (scenario === 'timeline-scrub') return timelineScrub(page, ctx)
  if (scenario === 'pan-while-generating') return panWhileGenerating(page, ctx)
  if (scenario === 'pan-while-agent-streaming') return panWhileAgentStreaming(page, ctx)
  if (scenario === 'library-skill-open') return libraryOpen(page, ctx, 'skills')
  if (scenario === 'library-prompt-open') return libraryOpen(page, ctx, 'prompts')
  if (scenario === 'library-prompt-scroll') return libraryScroll(page, ctx)
  if (scenario === 'library-prompt-search') return librarySearch(page, ctx)
  throw new Error(`未知工作台场景 ${scenario}`)
}

async function clearSelection(page) {
  await page.keyboard.press('Escape')
  const blank = await findCanvasBlankPoint(page)
  if (blank) await page.mouse.click(blank.x, blank.y)
  await sleep(page, 300)
}

/** 视口里第 skip 张能点到卡身正中的卡（不同采样点不同的卡，避免「同一张卡第二次」的缓存）。 */
async function hittableNode(page, skip) {
  return page.evaluate((skipCount) => {
    const stage = document.querySelector('.generation-canvas-v2__stage')?.getBoundingClientRect()
    if (!stage) return null
    const margin = 80
    const candidates = []
    for (const node of document.querySelectorAll('article[data-node-id]')) {
      const rect = node.getBoundingClientRect()
      const x = Math.round(rect.left + rect.width / 2)
      const y = Math.round(rect.top + Math.min(rect.height / 2, 40))
      if (x < stage.left + margin || x > stage.right - margin || y < stage.top + margin || y > stage.bottom - 260) continue
      const hit = document.elementFromPoint(x, y)
      if (hit && node.contains(hit)) candidates.push({ id: node.getAttribute('data-node-id'), x, y })
    }
    return candidates.length ? { ...candidates[skipCount % candidates.length], candidates: candidates.length } : null
  }, skip)
}

/** ① 选中节点 → 生成框真内容可见。第一次选中（拉懒加载块 + 读默认模型偏好）单独记 coldResponseMs，不进主数。 */
async function selectComposer(page, ctx) {
  await clearSelection(page)
  if (!ctx.state.composerWarm) {
    const first = await hittableNode(page, 997)
    if (!first) return { skipped: '视口里没有能点到的卡' }
    await armResponse(page, { predicate: 'composerReady', arg: first.id, early: 'composerAny' })
    await page.mouse.click(first.x, first.y)
    const cold = await takeResponse(page)
    ctx.state.composerWarm = true
    ctx.state.coldResponseMs = cold.ms
    await clearSelection(page)
  }
  const target = await hittableNode(page, ctx.runIndex)
  if (!target) return { skipped: '视口里没有能点到的卡' }
  await armResponse(page, { predicate: 'composerReady', arg: target.id, early: 'composerAny' })
  await ctx.startWindow(page)
  await page.mouse.click(target.x, target.y)
  const response = await takeResponse(page)
  const raw = await ctx.stopWindow(page)
  await clearSelection(page)
  return {
    raw,
    responseMs: response.ms,
    firstFeedbackMs: response.earlyMs,
    // 这个 App 里第一次选中（拉懒加载块、读默认模型偏好）的数：每个样本都带上，便于和热的那几次对照。
    coldResponseMs: ctx.state.coldResponseMs ?? null,
    storeWrites: response.storeWrites,
    selected: 1,
    path: `click → composer（${target.candidates} 张可点）`,
  }
}

/** 拆解表卡头的可点位置（卡头是拖拽把手，点它只选中节点、不勾任何镜头）。 */
async function shotTableHeaderPoint(page) {
  return page.evaluate(() => {
    const header = document.querySelector('article[data-kind="shot_table"] header')
    if (!header) return null
    const rect = header.getBoundingClientRect()
    const x = Math.round(rect.left + rect.width * 0.6)
    const y = Math.round(rect.top + rect.height / 2)
    const hit = document.elementFromPoint(x, y)
    return hit && header.contains(hit) ? { id: header.closest('article').getAttribute('data-node-id'), x, y } : null
  })
}

/** bench 每次采样前都「适应视图」：把鼠标停在拆解表卡头上滚轮放大到工作缩放（≥0.95），和「点卡出生成框」同一种缩放。 */
async function frameShotTable(page) {
  const header = await page.evaluate(() => {
    const rect = document.querySelector('article[data-kind="shot_table"] header')?.getBoundingClientRect()
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null
  })
  if (!header) return { skipped: '画布上没有拆解表（夹具规模要用 T200）' }
  await page.mouse.move(header.x, header.y)
  for (let tick = 0; tick < 40; tick += 1) {
    const zoom = await page.evaluate(() => {
      const viewport = document.querySelector('.react-flow__viewport')
      return viewport ? new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a : null
    })
    if (zoom !== null && zoom >= 0.95) break
    await page.mouse.wheel(0, -120)
    await sleep(page, 60)
  }
  await sleep(page, 500)
  return {}
}

/** ①b 选中拆解表 → 上方浮条 + 下方拆解栏可见（拆解前选模型，2026-10-18）。夹具 T200：一张 200 镜的表 + 100 张图片卡。 */
async function selectShotTable(page, ctx) {
  await clearSelection(page)
  const framed = await frameShotTable(page)
  if (framed.skipped) return framed
  const target = await shotTableHeaderPoint(page)
  if (!target) return { skipped: '拆解表卡头不在视口里 / 被盖住' }
  await armResponse(page, { predicate: 'shotTableEngaged', arg: target.id })
  await ctx.startWindow(page)
  await page.mouse.click(target.x, target.y)
  const response = await takeResponse(page)
  const raw = await ctx.stopWindow(page)
  await clearSelection(page)
  return { raw, responseMs: response.ms, storeWrites: response.storeWrites, selected: 1, path: 'click header → toolbar + deconstruct bar' }
}

/**
 * ①c 拆解表行高「标准 → 大」：点浮条上的「+」到 200 行都按新行高排好。准备（选中表）与复位（点「−」回标准）不进窗口。
 * 表身不做窗口化，行高一换 200 行全重渲——这正是要看的那一下。
 */
async function shotTableRowHeight(page, ctx) {
  await clearSelection(page)
  const framed = await frameShotTable(page)
  if (framed.skipped) return framed
  const target = await shotTableHeaderPoint(page)
  if (!target) return { skipped: '拆解表卡头不在视口里 / 被盖住' }
  await page.mouse.click(target.x, target.y)
  const host = page.locator(`.react-flow__node[data-id="${target.id}"]`)
  const control = host.locator('[data-shot-table-row-height]')
  await control.waitFor({ state: 'visible', timeout: 10_000 })
  if (await control.getAttribute('data-shot-table-row-height') !== 'standard') throw new Error('拆解表行高不是「标准」，上一次采样没复位')
  const taller = control.locator('button').last()
  await armResponse(page, { predicate: 'shotTableRowHeight', arg: { nodeId: target.id, step: 'large', px: 92 } })
  await ctx.startWindow(page)
  await taller.click()
  const response = await takeResponse(page)
  const raw = await ctx.stopWindow(page)
  await control.locator('button').first().click()
  await host.locator('[data-shot-table-row-height="standard"]').waitFor({ state: 'visible', timeout: 10_000 })
  await clearSelection(page)
  return { raw, responseMs: response.ms, storeWrites: response.storeWrites, path: 'toolbar + → 200 rows at large' }
}

/** ④ 连续新建 5 张图片卡：每一下「点加节点条 → 新卡出现」，主数取最慢那一下。 */
async function createNodeBurst(page, ctx) {
  await clearSelection(page)
  const button = canvasAddBar(page).locator('[data-add-intent="image"]').first()
  const times = []
  const before = await page.evaluate(() => (window.__nomiCanvasStore?.getState().nodes ?? []).map((node) => node.id))
  await ctx.startWindow(page)
  for (let index = 0; index < 5; index += 1) {
    // 新卡建出来是选中的，它的生成框会盖住加节点条——真人先点空白再点（revealCanvasDock 就是这么做的）。
    await revealCanvasDock(page, button, 'add image node')
    const count = await page.evaluate(() => document.querySelectorAll('.react-flow__node').length)
    await armResponse(page, { predicate: 'nodeCountAbove', arg: count })
    await button.click()
    times.push((await takeResponse(page)).ms)
  }
  const raw = await ctx.stopWindow(page)
  // 删掉这一轮建的卡（经 E2E 画布桥，和 canvas-follow-hand 同一个做法），下一次采样从同一张画布开始。
  const created = await page.evaluate((known) => {
    const store = window.__nomiCanvasStore
    if (!store) throw new Error('画布 store 桥没挂（localStorage __nomiE2E=1 才挂），删不掉这一轮新建的卡')
    const fresh = store.getState().nodes.map((node) => node.id).filter((id) => !known.includes(id))
    for (const id of fresh) store.getState().deleteNode(id)
    return fresh.length
  }, before)
  await clearSelection(page)
  return { raw, responseMs: Math.max(...times), createTimesMs: times, created, path: 'canvas add bar × 5' }
}

const STAGE_BUTTON = (mode) => `.nomi-stepper__step[data-mode="${mode}"]`

async function switchTo(page, mode) {
  await armResponse(page, { trigger: 'click', predicate: 'stageReady', arg: mode })
  await page.locator(STAGE_BUTTON(mode)).first().click()
  return (await takeResponse(page)).ms
}

/** ⑤ 生成 → 创作 → 预览 → 生成：每一步「点顶栏阶段 → 那一页到位」，主数取这一圈里最慢的一步。 */
async function switchStages(page, ctx) {
  await clearSelection(page)
  await ctx.startWindow(page)
  const toCreation = await switchTo(page, 'creation')
  await sleep(page, 400)
  const toPreview = await switchTo(page, 'preview')
  await sleep(page, 400)
  const toGeneration = await switchTo(page, 'generation')
  const raw = await ctx.stopWindow(page)
  await sleep(page, 400)
  return { raw, responseMs: Math.max(toCreation, toPreview, toGeneration), toCreation, toPreview, toGeneration, path: 'stepper' }
}

/** ⑤ 画布 ⇄ 列表：点顶栏视图切换钮，到位计时；主数取两向里慢的那一向。 */
async function switchCanvasList(page, ctx) {
  await clearSelection(page)
  const switcher = page.locator('[data-generation-view-switcher]').first()
  await ctx.startWindow(page)
  await armResponse(page, { trigger: 'click', predicate: 'stageReady', arg: 'list' })
  await switcher.click()
  const toList = (await takeResponse(page)).ms
  await sleep(page, 400)
  await armResponse(page, { trigger: 'click', predicate: 'stageReady', arg: 'generation' })
  await switcher.click()
  const toCanvas = (await takeResponse(page)).ms
  const raw = await ctx.stopWindow(page)
  await sleep(page, 400)
  return { raw, responseMs: Math.max(toList, toCanvas), toList, toCanvas, path: 'view switcher' }
}

/**
 * ⑦ 文稿长文打字：在约 2 万字的文稿末尾连打 40 个字符（每 60ms 一个，像正常打字）。
 * 每一键：keydown 的时间戳 → 编辑器 DOM 改了之后再过两帧 = 这一键的「按到看见」。主数取 p95。
 */
async function documentTyping(page, ctx) {
  if (!ctx.state.onCreation) {
    await switchTo(page, 'creation')
    ctx.state.onCreation = true
  }
  const editor = page.locator('.workbench-creation .ProseMirror').first()
  // 前提要成立：编辑器里真是那份长文稿（不是空白新文稿），否则量的是另一件事。
  const paragraphs = await editor.evaluate((element) => element.querySelectorAll(':scope > p').length)
  if (paragraphs < LONG_DOCUMENT_PARAGRAPHS) return { skipped: `创作页编辑器里只有 ${paragraphs} 段，长文稿没有载入（要 ${LONG_DOCUMENT_PARAGRAPHS} 段）` }
  await editor.click()
  await page.keyboard.press('Control+End')
  await sleep(page, 300)
  await page.evaluate(() => {
    const root = document.querySelector('.workbench-creation .ProseMirror')
    const rec = { keys: [], pending: null }
    rec.onKey = (event) => { if (event.key.length === 1) rec.pending = event.timeStamp }
    rec.mo = new MutationObserver(() => {
      if (rec.pending === null) return
      const t0 = rec.pending
      rec.pending = null
      // 和 responseTimer 同一个口径：改完之后再过两帧（第二帧开始时，上一帧的样式 / 布局 / 绘制已经做完）。
      requestAnimationFrame(() => requestAnimationFrame((ts) => rec.keys.push(ts - t0)))
    })
    rec.mo.observe(root, { childList: true, subtree: true, characterData: true })
    document.addEventListener('keydown', rec.onKey, true)
    window.__nomiTypingProbe = rec
  })
  await ctx.startWindow(page)
  await page.keyboard.type('the rain keeps falling on the night street', { delay: 60 })
  await sleep(page, 200)
  const raw = await ctx.stopWindow(page)
  const keys = await page.evaluate(() => {
    const rec = window.__nomiTypingProbe
    rec.mo.disconnect()
    document.removeEventListener('keydown', rec.onKey, true)
    return rec.keys
  })
  // 40 个字符里至少 30 个要量到「改了 DOM 再上屏」：少于这个数说明键没打进这份文稿（焦点跑了），数字不作数。
  if (keys.length < 30) return { skipped: `40 个字符只量到 ${keys.length} 次编辑器改动，键没打进文稿` }
  return { raw, responseMs: quantile(keys, 0.95), keyMaxMs: round(Math.max(...keys)), keys: keys.length, paragraphs, path: `creation document（${paragraphs} 段）` }
}

/**
 * 画布文本节点里打字（2026-10-23 用户「文本节点感觉有点卡」）：同一个口径——每一键「keydown → 节点正文改完后再过两帧」，
 * 连打 40 个字符（每 60ms 一个），主数取 p95。光标放进正文用编辑器自己的 focus 命令（适应视图下节点很小，点不准），
 * 之后全是真键盘。
 */
async function textNodeTyping(page, ctx) {
  const selector = `[data-node-id="${TEXT_NODE_ID}"] .ProseMirror`
  const editor = page.locator(selector).first()
  // 适应视图下 96 个节点走轻量渲染（canvasNodeLevelOfDetail：>80 个且缩放 <0.55），没有编辑器。
  // 像人一样：指着这张文本节点滚轮放大到 ~1 倍，再写字。
  const zoomOf = () => page.evaluate(() => {
    const viewport = document.querySelector('.react-flow__viewport')
    return viewport ? new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a : null
  })
  for (let tick = 0; tick < 40; tick += 1) {
    const zoom = await zoomOf()
    if (zoom !== null && zoom >= 0.95) break
    const box = await page.locator(`.react-flow__node[data-id="${TEXT_NODE_ID}"]`).first().boundingBox()
    if (!box) return { skipped: '画布上找不到长文本节点' }
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 120))
    await page.mouse.wheel(0, -120)
    await sleep(page, 60)
  }
  await editor.waitFor({ state: 'attached' })
  const paragraphs = await editor.evaluate((element) => element.querySelectorAll(':scope > p').length)
  if (paragraphs < TEXT_NODE_PARAGRAPHS) return { skipped: `文本节点正文只有 ${paragraphs} 段，夹具里的长文本节点没有载入（要 ${TEXT_NODE_PARAGRAPHS} 段）` }
  await page.evaluate((query) => document.querySelector(query).editor.commands.focus('end'), selector)
  await sleep(page, 300)
  await page.evaluate((query) => {
    const root = document.querySelector(query)
    const rec = { keys: [], pending: null }
    rec.onKey = (event) => { if (event.key.length === 1) rec.pending = event.timeStamp }
    rec.mo = new MutationObserver(() => {
      if (rec.pending === null) return
      const t0 = rec.pending
      rec.pending = null
      requestAnimationFrame(() => requestAnimationFrame((ts) => rec.keys.push(ts - t0)))
    })
    rec.mo.observe(root, { childList: true, subtree: true, characterData: true })
    document.addEventListener('keydown', rec.onKey, true)
    window.__nomiTypingProbe = rec
  }, selector)
  await ctx.startWindow(page)
  await page.keyboard.type('the rain keeps falling on the night street', { delay: 60 })
  await sleep(page, 200)
  const raw = await ctx.stopWindow(page)
  const keys = await page.evaluate(() => {
    const rec = window.__nomiTypingProbe
    rec.mo.disconnect()
    document.removeEventListener('keydown', rec.onKey, true)
    return rec.keys
  })
  // 打完把光标挪出正文（失焦落盘），下一次采样从同样的「未编辑」状态开始。
  await clearSelection(page)
  if (keys.length < 30) return { skipped: `40 个字符只量到 ${keys.length} 次正文改动，键没打进文本节点` }
  return { raw, responseMs: quantile(keys, 0.95), keyMaxMs: round(Math.max(...keys)), keys: keys.length, paragraphs, path: `canvas text node（${paragraphs} 段）` }
}

/**
 * 写作区「选中 8000 字 → AI 编辑」：两个用户可感的时刻，主数取最慢的那个（预算同为 100ms）——
 *   ① 点浮条上的「AI 编辑」→ 输入条出现；
 *   ② 结果回来 → 就地画出新旧对比（划线 / 标出来 / 段尾 ✓ ✕）。
 * 模型那一头不走（零花费）：结果由页内按编辑器自己的插件通道写入（和 controller 收到模型回包后做的是同一笔 patch 事务），
 * 所以 ② 量的是真实的「比较 + 生成装饰 + 浏览器上屏」，不含网络。选区是真的、点击是真鼠标。
 */
async function creationAiRewriteResult(page, ctx) {
  if (!ctx.state.onCreation) {
    await switchTo(page, 'creation')
    ctx.state.onCreation = true
  }
  const editor = page.locator('.workbench-creation .ProseMirror').first()
  const paragraphs = await editor.evaluate((element) => element.querySelectorAll(':scope > p').length)
  if (paragraphs < REWRITE_DOCUMENT_PARAGRAPHS) return { skipped: `创作页编辑器里只有 ${paragraphs} 段，长文稿没有载入（要 ${REWRITE_DOCUMENT_PARAGRAPHS} 段）` }
  await editor.click()
  // 上一个采样留下的选区先收起来：同一段再选一次，浮条才会重新出现。
  await page.evaluate(() => document.querySelector('.workbench-creation .ProseMirror').editor.commands.setTextSelection(1))
  await sleep(page, 300)
  const selectedChars = await page.evaluate((count) => {
    const tiptap = document.querySelector('.workbench-creation .ProseMirror').editor
    const doc = tiptap.state.doc
    let from = 0
    let to = 0
    let seen = 0
    doc.forEach((node, offset) => {
      seen += 1
      if (seen === 900) from = offset + 1
      if (seen === 900 + count - 1) to = offset + node.nodeSize - 1
    })
    tiptap.commands.setTextSelection({ from, to })
    // 选区起点要在视口中间：浮条贴在选区上方，起点在屏外浮条就在屏外，真人点不到。
    document.querySelector('.workbench-creation .ProseMirror').children[899].scrollIntoView({ block: 'center' })
    return doc.textBetween(from, to, ' ').length
  }, REWRITE_SELECTED_PARAGRAPHS)
  if (selectedChars < 6000) return { skipped: `选区只有 ${selectedChars} 字，没选中预期的段落` }
  await sleep(page, 400)
  // ① 点「AI 编辑」。
  await armResponse(page, { trigger: 'pointerdown', predicate: 'rewriteBarReady' })
  await ctx.startWindow(page)
  await page.locator('.workbench-selection-popover__tool--ai').first().click()
  const opened = await takeResponse(page)
  await sleep(page, 300)
  // ② 结果回来：同一笔 patch 事务（插件通道），起表用页内自定义事件。
  await armResponse(page, { trigger: 'nomi-perf-trigger', predicate: 'rewriteResultReady' })
  const dispatched = await page.evaluate((runIndex) => {
    const tiptap = document.querySelector('.workbench-creation .ProseMirror').editor
    const plugin = tiptap.state.plugins.find((candidate) => String(candidate.key).startsWith('nomiAiRewrite'))
    const session = plugin?.getState(tiptap.state)?.session
    if (!session) return false
    const result = session.original.replace(/霓虹灯/g, '灯火' + runIndex).replace(/碎成一片一片/g, '碎了').replace(/伞沿压得很低/g, '伞压得低')
    const tr = tiptap.state.tr.setMeta(plugin.spec.key, { type: 'patch', id: session.id, patch: { status: 'result', result } })
    document.dispatchEvent(new Event('nomi-perf-trigger'))
    tiptap.view.dispatch(tr)
    return true
  }, ctx.runIndex)
  if (!dispatched) return { skipped: '点了「AI 编辑」但没有会话（条没开起来）' }
  const drawn = await takeResponse(page)
  const raw = await ctx.stopWindow(page)
  // 收尾：Esc 放弃（会话关掉），下一个采样从干净状态开始。
  await page.keyboard.press('Escape')
  await sleep(page, 300)
  return {
    raw,
    responseMs: Math.max(opened.ms, drawn.ms),
    openMs: opened.ms,
    drawMs: drawn.ms,
    selectedChars,
    paragraphs,
    path: `creation document（${paragraphs} 段，选 ${selectedChars} 字）→ 点 AI 编辑 / 结果上屏`,
  }
}

async function ensurePreview(page, ctx) {
  if (ctx.state.onPreview) return
  await switchTo(page, 'preview')
  ctx.state.onPreview = true
  await sleep(page, 800)
}

/** ⑩ 预览播放 4 秒的帧间隔。 */
async function timelinePlay(page, ctx) {
  await ensurePreview(page, ctx)
  const play = page.locator('.workbench-preview-player__play').first()
  const pauseLabel = uiText('zh-CN', 'timelinePreview.pause')
  await ctx.startWindow(page)
  await play.click()
  await sleep(page, 4000)
  // 前提：真的在播（按钮变成「暂停」）。没播起来的 4 秒只是一段静止画面的帧间隔，不作数。
  const playing = (await play.getAttribute('aria-label')) === pauseLabel
  const raw = await ctx.stopWindow(page)
  if (playing) await play.click()
  await sleep(page, 400)
  if (!playing) return { skipped: '点了播放，4 秒后按钮仍不是「暂停」：没播起来' }
  return { raw, path: 'preview play' }
}

/** ⑩ 在时间轴标尺上来回拖播放头 2 秒（真鼠标），量帧间隔。 */
async function timelineScrub(page, ctx) {
  await ensurePreview(page, ctx)
  // 标尺这一行的左边一格是轨道名的占位（sticky），按下去不 scrub；能 scrub 的是 ruler-content 在滚动口里露出来的那一段。
  const box = await page.evaluate(() => {
    const content = document.querySelector('.workbench-preview .workbench-timeline__ruler-content')?.getBoundingClientRect()
    const port = document.querySelector('.workbench-preview .workbench-timeline__tracks')?.getBoundingClientRect()
    const spacer = document.querySelector('.workbench-preview .workbench-timeline__ruler-spacer')?.getBoundingClientRect()
    if (!content || !port) return null
    const x = Math.max(content.left, port.left, spacer ? spacer.right : -Infinity)
    const right = Math.min(content.right, port.right)
    return right - x > 120 ? { x, y: content.top, width: right - x, height: content.height } : null
  })
  if (!box) return { skipped: '预览页没有露出来的时间轴标尺' }
  const y = box.y + box.height / 2
  const left = box.x + 24
  const span = Math.max(80, Math.min(box.width - 48, 900))
  const playheadX = () => page.evaluate(() => document.querySelector('.workbench-preview .workbench-timeline__playhead')?.getBoundingClientRect().left ?? null)
  await page.mouse.move(left, y)
  await page.mouse.down()
  await ctx.startWindow(page)
  const steps = 120
  let travel = 0
  const start = await playheadX()
  for (let index = 1; index <= steps; index += 1) {
    const ratio = (1 - Math.cos((index / steps) * Math.PI * 2)) / 2
    await page.mouse.move(left + span * ratio, y, { steps: 1 })
    if (index === steps / 2) travel = Math.abs(((await playheadX()) ?? 0) - (start ?? 0))
    await sleep(page, 14)
  }
  const raw = await ctx.stopWindow(page)
  await page.mouse.up()
  await sleep(page, 300)
  // 前提：播放头真的跟着手走了（拖到一半时离起点至少 100px）；拖的不是标尺就不作数。
  if (start === null || travel < 100) return { skipped: `拖标尺时播放头只走了 ${Math.round(travel)}px，拖的不是时间轴标尺` }
  return { raw, playheadTravelPx: Math.round(travel), path: 'timeline ruler scrub' }
}

/**
 * 主进程往返采样：手势进行的同时每 100ms 往主进程发一次空调用，记往返时间。
 * 渲染线程的帧间隔说「画面卡没卡」，这个数说「主进程（生成队列、轮询、落盘都在这里）有没有被占住」。
 */
function startMainSampler(app) {
  const samples = []
  let running = true
  const loop = (async () => {
    while (running) {
      const started = Date.now()
      await app.evaluate(() => 1).catch(() => undefined)
      samples.push(Date.now() - started)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  })()
  return async () => {
    running = false
    await loop
    return { mainRoundTripMaxMs: samples.length ? Math.max(...samples) : null, mainRoundTripP95Ms: quantile(samples, 0.95), mainSamples: samples.length }
  }
}

/** 在画布空白处平移一圈（空格 + 拖，和 canvas-scale-bench 的 pan 同一个手势），同时采主进程往返。 */
async function panCircle(page, ctx) {
  const stage = await ctx.stageBox(page)
  // 偏左：生成页的 Agent 面板展开时在右边。空格平移在节点上方也成立（React Flow 的 panActivationKeyCode）。
  const origin = { x: stage.x + stage.width * 0.35, y: stage.y + stage.height * 0.42 }
  // 焦点留在输入框里时按空格是在打字，不是平移：先把焦点放掉。
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  await page.mouse.move(origin.x, origin.y)
  await page.keyboard.down('Space')
  await page.mouse.down()
  const stopMain = startMainSampler(ctx.app)
  const viewportOffset = () => page.evaluate(() => {
    const viewport = document.querySelector('.react-flow__viewport')
    const matrix = viewport ? new DOMMatrixReadOnly(getComputedStyle(viewport).transform) : null
    return matrix ? { x: matrix.m41, y: matrix.m42 } : null
  })
  const before = await viewportOffset()
  let moved = 0
  await ctx.startWindow(page)
  const steps = 120
  for (let index = 1; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2
    await page.mouse.move(origin.x + Math.sin(angle) * 80, origin.y + (1 - Math.cos(angle)) * 40, { steps: 1 })
    if (index === steps / 2) {
      const half = await viewportOffset()
      moved = before && half ? Math.hypot(half.x - before.x, half.y - before.y) : 0
    }
    await sleep(page, 14)
  }
  const raw = await ctx.stopWindow(page)
  const main = await stopMain()
  await page.mouse.up()
  await page.keyboard.up('Space')
  await sleep(page, 250)
  // 前提：画布真的跟着手平移了（走到半圈时视口至少挪了 40px）；没平移就是在量一张静止的画布。
  if (moved < 40) return { skipped: `平移手势走到半圈视口只挪了 ${Math.round(moved)}px，画布没跟着平移` }
  return { raw, panMovedPx: Math.round(moved), ...main }
}

/**
 * ⑧ 多个节点同时在生成时平移画布。准备（不计时，每个 App 一次）：用加节点条建 6 张视频卡，各写一句提示词点「生成」，
 * 本机假供应商受理后一直回「生成中」（不放行），于是整段采样里 6 个任务都在主进程的队列 / 轮询里。
 * 用视频不用图片：快道（云端生图）的轮询硬上限是 2 分钟，到点按设计落「可找回」（catalogTaskActions 的 resolvePollBudget），
 * 一组采样还没量完图片卡就已经不在生成中了；慢道（视频）是 20 分钟，也正是用户「好几条视频同时在跑」的那个现场。
 */
async function panWhileGenerating(page, ctx) {
  const provider = ctx.extras.provider
  if (!ctx.state.generating) {
    const generate = uiText('zh-CN', 'generationCommon.composer.generateAsset')
    for (let index = 0; index < GENERATING_NODES; index += 1) {
      const before = provider.jobs.length
      await addCanvasNode(page, 'video')
      await revealArrivals(page)
      const editor = page.locator('[data-composer-host="canvas"] .ProseMirror[contenteditable="true"]:visible').first()
      await editor.waitFor({ timeout: 20_000 })
      await editor.fill(`perf generating ${index + 1}: a girl looking at the bridge by the river at dusk`)
      await page.locator('[data-composer-host="canvas"]').getByRole('button', { name: generate, exact: true }).first().click()
      const deadline = Date.now() + 30_000
      while (Date.now() < deadline && provider.jobs.length <= before) await sleep(page, 200)
      if (provider.jobs.length <= before) throw new Error(`第 ${index + 1} 张卡点「生成」后假供应商没收到任务`)
    }
    await clearSelection(page)
    ctx.state.generating = true
  }
  // 前提：6 张卡此刻都还在「生成中」——按画布数据的状态数（等待面只挂在视口里的卡上，数 DOM 会漏）。
  const statuses = await page.evaluate(() => {
    const counts = {}
    for (const node of window.__nomiCanvasStore?.getState().nodes ?? []) {
      if (!node.status || node.status === 'success' || node.status === 'idle') continue
      counts[node.status] = (counts[node.status] || 0) + 1
    }
    return counts
  })
  const running = (statuses.running || 0) + (statuses.queued || 0)
  if (running < GENERATING_NODES) return { skipped: `只有 ${running} 张卡在生成中（要 ${GENERATING_NODES} 张）；画布上各状态：${JSON.stringify(statuses)}` }
  const result = await panCircle(page, ctx)
  return { ...result, generating: running, jobs: provider.jobs.length, path: `pan while ${running} generating` }
}

/**
 * ⑨ Agent 流式输出时平移画布。每次采样：在生成页的 Agent 面板发一句话，本机假模型约 8 秒慢慢吐一段长正文；
 * 第一段字出现在面板里之后开始平移。
 */
async function panWhileAgentStreaming(page, ctx) {
  const panel = '[data-agent-resident="true"][data-agent-panel="true"][data-agent-surface="generation"]'
  await clearSelection(page)
  await ensureAgentPanelOpen(page)
  const input = page.locator(`${panel} [data-v4-control="input"]`).first()
  const assistantSelector = `${panel} [data-v4-block="assistant"]`
  // 上一轮的回答块还在面板里：要盯的是这一轮新长出来的那一块，不是 .last() 碰巧指到的旧块。
  const before = await page.locator(assistantSelector).count()
  await input.click()
  await input.fill(`perf stream ${ctx.runIndex}: describe the next shot`)
  await page.locator(`${panel} [data-v4-control="send"]`).first().click()
  await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length > count && (document.querySelectorAll(selector)[count].textContent?.length ?? 0) > 0, { selector: assistantSelector, count: before }, { timeout: 30_000 })
  const assistant = page.locator(assistantSelector).nth(before)
  const charsBefore = await assistant.evaluate((element) => element.textContent?.length ?? 0)
  const result = await panCircle(page, ctx)
  const charsAfter = await assistant.evaluate((element) => element.textContent?.length ?? 0)
  // 等这一轮吐完再进下一次采样：下一次要从「没有在流式」的同一起点开始。
  await page.locator(`${panel} [data-v4-block="composer"][data-mode="running"]`).first().waitFor({ state: 'hidden', timeout: 60_000 })
  // 前提：平移的那 2 秒里正文确实在往外吐（字数在涨）；吐完了才平移就不是这个场景。
  if (charsAfter - charsBefore < 100) return { skipped: `平移期间 Agent 正文只多了 ${charsAfter - charsBefore} 个字，不是在流式输出时操作` }
  return { ...result, streamedCharsDuringPan: charsAfter - charsBefore, path: 'pan while agent streaming' }
}

// ——— 技能库 / 提示词库（左栏抽屉；设计卡 ★7）——————————————————————————————————————

const LIBRARY_RAIL = (item) => `[data-shell-rail-item="${item}"]`
const LIBRARY_DRAWER = (item) => `[data-shell-drawer="${item}"]`
const LIBRARY_QUERY = 'cinematic'
// 滚动量的最坏情况：一个几乎人人都中的字母，所有组全部摊开（约 1400 张卡、两列 700 行），不是只露一行的首页。
const LIBRARY_SCROLL_QUERY = 'e'

/** 数这一段里浏览器发出的媒体请求（Playwright request 事件里 image / media 类型；被网络闸拦下的远端也算发出去了）。 */
function countMediaRequests(page) {
  const urls = []
  const listener = (request) => {
    const type = request.resourceType()
    if (type === 'image' || type === 'media') urls.push(request.url())
  }
  page.on('request', listener)
  return () => {
    page.off('request', listener)
    const remote = urls.filter((url) => /^https?:/i.test(url) && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/i.test(url))
    return { total: urls.length, remote: remote.length }
  }
}

async function closeLibraryDrawer(page, item) {
  if (await page.locator(LIBRARY_DRAWER(item)).count()) {
    await page.locator(LIBRARY_RAIL(item)).first().click()
    await page.locator(LIBRARY_DRAWER(item)).waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  }
  await sleep(page, 300)
}

async function ensureLibraryDrawer(page, item, card) {
  if (!(await page.locator(LIBRARY_DRAWER(item)).count())) await page.locator(LIBRARY_RAIL(item)).first().click()
  await page.locator(`${LIBRARY_DRAWER(item)} ${card}`).first().waitFor({ timeout: 30_000 })
}

/** 抽屉里此刻挂着几张卡、几张在视口里、挂着几个媒体元素（虚拟列表只挂视口附近的；收起的组、屏外的卡不挂）。 */
async function libraryMounted(page, item) {
  return page.evaluate((selector) => {
    const drawer = document.querySelector(selector)
    const scroll = drawer?.querySelector('[data-library-scroll]')
    const box = scroll?.getBoundingClientRect()
    const cards = [...(drawer?.querySelectorAll('[data-skill-card], [data-prompt-card]') ?? [])]
    const visibleCards = box ? cards.filter((card) => {
      const rect = card.getBoundingClientRect()
      return rect.bottom > box.top && rect.top < box.bottom
    }).length : 0
    return { cards: cards.length, visibleCards, media: drawer ? drawer.querySelectorAll('img[src], video[src]').length : 0 }
  }, LIBRARY_DRAWER(item))
}

/**
 * 点左栏「Skill」/「提示词」→ 抽屉里第一张卡可见再过两帧（responseTimer 的 libraryDrawerReady）。
 * 这个 App 里第一次打开（拉懒加载块、读库）单独记 coldResponseMs；媒体请求数从点下去数到首屏画完后 600ms。
 */
async function libraryOpen(page, ctx, item) {
  await closeLibraryDrawer(page, item)
  const stopCounting = countMediaRequests(page)
  await armResponse(page, { predicate: 'libraryDrawerReady', arg: item })
  await ctx.startWindow(page)
  await page.locator(LIBRARY_RAIL(item)).first().click()
  const response = await takeResponse(page)
  await sleep(page, 600)
  const raw = await ctx.stopWindow(page)
  const requests = stopCounting()
  const mounted = await libraryMounted(page, item)
  if (ctx.state.coldResponseMs === undefined) ctx.state.coldResponseMs = response.ms
  await closeLibraryDrawer(page, item)
  return {
    raw,
    responseMs: response.ms,
    coldResponseMs: ctx.state.coldResponseMs,
    mediaRequests: requests.total,
    remoteMediaRequests: requests.remote,
    mountedMedia: mounted.media,
    mountedCards: mounted.cards,
    visibleCards: mounted.visibleCards,
    path: `rail → ${item} drawer${ctx.extras?.publicPrompts ? `（公开库 ${ctx.extras.publicPrompts} 条）` : ''}`,
  }
}

/** 提示词抽屉搜索：逐键打「cinematic」，每一键「keydown → 输入框和列表都换成这一键的结果再过两帧」，主数取 p95。 */
async function librarySearch(page, ctx) {
  await ensureLibraryDrawer(page, 'prompts', '[data-prompt-card]')
  const input = page.locator(`${LIBRARY_DRAWER('prompts')} input[type="search"]`).first()
  await input.fill('')
  await sleep(page, 400)
  await input.click()
  const times = []
  let typed = ''
  await ctx.startWindow(page)
  for (const char of LIBRARY_QUERY) {
    typed += char
    await armResponse(page, { trigger: 'keydown', predicate: 'libraryQueryShown', arg: { item: 'prompts', query: typed } })
    await page.keyboard.type(char)
    times.push((await takeResponse(page)).ms)
  }
  const raw = await ctx.stopWindow(page)
  const matchedCards = await page.locator(`${LIBRARY_DRAWER('prompts')} [data-prompt-card]`).count()
  await input.fill('')
  await sleep(page, 300)
  return {
    raw,
    responseMs: quantile(times, 0.95),
    keyMaxMs: round(Math.max(...times)),
    keys: times.length,
    matchedCards,
    path: `prompts drawer search「${LIBRARY_QUERY}」（公开库 ${ctx.extras?.publicPrompts ?? 0} 条）`,
  }
}

/** 提示词抽屉滚动：搜一个几乎全中的字母（所有组摊开、约 1400 张卡），在列表上滚轮往下 40 格，量帧间隔与长任务。 */
async function libraryScroll(page, ctx) {
  await ensureLibraryDrawer(page, 'prompts', '[data-prompt-card]')
  const input = page.locator(`${LIBRARY_DRAWER('prompts')} input[type="search"]`).first()
  if ((await input.inputValue()) !== LIBRARY_SCROLL_QUERY) {
    await input.fill(LIBRARY_SCROLL_QUERY)
    await sleep(page, 600)
  }
  const scroll = page.locator(`${LIBRARY_DRAWER('prompts')} [data-library-scroll]`).first()
  await scroll.evaluate((element) => { element.scrollTop = 0 })
  await sleep(page, 500)
  const box = await scroll.boundingBox()
  if (!box) return { skipped: '提示词抽屉的列表没有挂上' }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await ctx.startWindow(page)
  for (let step = 0; step < 40; step += 1) {
    await page.mouse.wheel(0, 240)
    await sleep(page, 16)
  }
  await sleep(page, 300)
  const raw = await ctx.stopWindow(page)
  const scrolledPx = await scroll.evaluate((element) => Math.round(element.scrollTop))
  const mounted = await libraryMounted(page, 'prompts')
  if (scrolledPx < 2000) return { skipped: `列表只滚了 ${scrolledPx}px，不是在长列表上滚` }
  return { raw, scrolledPx, mountedCards: mounted.cards, mountedMedia: mounted.media, path: `prompts drawer scroll（搜「${LIBRARY_SCROLL_QUERY}」全部摊开，公开库 ${ctx.extras?.publicPrompts ?? 0} 条）` }
}
