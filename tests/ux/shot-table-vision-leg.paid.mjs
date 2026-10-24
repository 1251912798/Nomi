#!/usr/bin/env node
// 分镜表「读图腿」真实任务验证（2026-10-11 走查 §1；2026-10-18 拆解前选模型改成先建表再拆）——建表不花钱 → 拆解栏选读图模型 →
// 「拆解」→ 短片（≤30 次调用）不弹报价卡、直接逐镜读图（用户 10-18 拍板「短片不弹，长片才弹」）→ 调用的模型 = 所选，失败原话看得见。
//
// 用法（三种模式，从便宜到贵）：
//
//   1) 零花费（夹具回环供应商，不碰任何真实资料）——任何人随时可跑，验流程本身：
//        node tests/ux/shot-table-vision-leg.paid.mjs --fixture [--rate-limit-probe]
//      读图模型 = 夹具那一个；`--rate-limit-probe` 让夹具对每次读图回 429 原话（验顶上一行是原话）。
//
//   2) 真实资料副本，**停在「拆解」之前**（不发任何付费请求）：
//        NOMI_SPEND_OK=1 node tests/ux/shot-table-vision-leg.paid.mjs --vision-model <id>
//      会拷一份带凭据的隔离副本（_realProfile.mjs：断开副本里指向真实项目的登记；跑前跑后对用户资料目录做指纹比对，
//      有差异立刻红），走生产构建，窗口在屏幕外。流程走到「拆解」之前：建表零请求、选好模型、本地数镜，停下不点（零花费）。
//
//   3) 真付费（只有显式 NOMI_PAID_CONFIRM=1 才点「确认」）：
//        NOMI_SPEND_OK=1 NOMI_PAID_CONFIRM=1 node tests/ux/shot-table-vision-leg.paid.mjs --vision-model <id> [--rate-limit-probe]
//      `--rate-limit-probe`：<id> 选一个免费限流的读图模型，验证顶上一行是 429 原话（而不是空白或笼统的「没读出」）。
//
//   列出能选的读图模型（只打 id，不打任何密钥；读真实目录文件，只在你自己的机器上跑）：
//        node tests/ux/shot-table-vision-leg.paid.mjs --list-models
//
// 最坏花费（模式 3）：从仓库夹具 canvas-follow-hand-1080p15.mp4 截一小段（--clip-start / --clip-seconds，默认 4.3s 起 1.8s、去音轨，
// 所以没有转写）；每镜 1 次读图调用（一镜 3 帧同一次请求）。**开拆前用本地切点（同一个 detectShotCuts）先数镜**——超过 4 次脚本不点「拆解」直接退出；
// 脚本在主进程订阅 undici 出站（diagnostics_channel）计数，读图调用超过 4 次立刻停走查；令牌本身只覆盖报价里那几次。拆解逐镜 `maxRetries: 0`，限流不会重试放大。
// 未确认（没设 NOMI_PAID_CONFIRM）一分钱不花：停在「拆解」之前，供应商一个请求都没有。
import fs from 'node:fs'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clickOrFail, expect, holdAbsent, waitForVisualQuiescence } from './_assert.mjs'
import { SPEND_DIALOG, openPaidWalk } from './_paidRun.mjs'
import { readRealCatalog } from './_realProfile.mjs'
import { createRuntimeWalk } from './agent-runtime-walk-support.mjs'
import { FIXTURE_TEXT_MODEL, FIXTURE_TEXT_MODEL_LABEL, FIXTURE_VENDOR } from './agent-runtime-fixture.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { uiText } from './full-walk/invariants.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const VIDEO_FIXTURE = path.join(repoRoot, 'tests/ux/fixtures/canvas-follow-hand-1080p15.mp4')
const EVIDENCE_DIR = path.join(repoRoot, 'docs/evidence/2026-10-11-canvas-ux-8/paid')
const VISION_CAP = 4
const RATE_LIMIT_TEXT = "You've reached the API rate limit for free users"

// ── 参数：先取走自己的开关，剩下的交给走查入口（它只认 --packaged）──
const argv = process.argv.slice(2)
const flag = (name) => { const i = argv.indexOf(name); if (i < 0) return false; argv.splice(i, 1); return true }
const valueOf = (name) => { const i = argv.indexOf(name); if (i < 0) return null; const [, value] = argv.splice(i, 2); return value ?? null }
const LIST_MODELS = flag('--list-models')
const FIXTURE = flag('--fixture')
const RATE_PROBE = flag('--rate-limit-probe')
const VISION_ARG = valueOf('--vision-model')
// 从夹具里截一小段（默认 4.3s 起 1.8s、去音轨）：整段 15 秒在默认低阈值下会切出 7 镜，最坏花费不可控；截小段 = 镜数少、没有转写。
const CLIP_START = Number(valueOf('--clip-start') ?? 4.3)
const CLIP_SECONDS = Number(valueOf('--clip-seconds') ?? 1.8)
process.argv.splice(2, process.argv.length - 2, ...argv)
const CONFIRM = FIXTURE || process.env.NOMI_PAID_CONFIRM === '1'

/** 目录里「启用、能读图」的文本模型。免费 / 限流没有可靠的目录信号，所以只做排除启发（key / 名字里带 free / agnes），最终由你判断。 */
function visionCandidates(catalog) {
  const vendors = new Map((catalog.vendors ?? []).map((vendor) => [vendor.key, vendor]))
  return (catalog.models ?? [])
    .filter((model) => model.kind === 'text' && model.enabled && vendors.get(model.vendorKey)?.enabled)
    .filter((model) => model.meta?.supportsImageInput === true || /gemini|gpt-4o|gpt-4\.1|claude|qwen.*vl|vision/i.test(`${model.modelKey} ${model.modelAlias ?? ''}`))
    .map((model) => ({
      id: `${model.vendorKey}/${model.modelKey}`,
      likelyFree: /free|agnes/i.test(`${model.vendorKey} ${model.modelKey} ${model.labelZh ?? ''}`) || /免费/.test(model.labelZh ?? ''),
    }))
}

if (LIST_MODELS) {
  const rows = visionCandidates(readRealCatalog())
  console.log('能读图的文本模型（id = 供应商/模型；likelyFree 只是按名字的猜测，不是价格事实）：')
  for (const row of rows) console.log(`  ${row.id}${row.likelyFree ? '   [likelyFree]' : ''}`)
  console.log(`共 ${rows.length} 个。${rows.some((row) => !row.likelyFree) ? '用 --vision-model <id> 传非 likelyFree 的那个。' : ''}`)
  process.exit(0)
}

// ── 选定读图模型 ──
let model
let paid = null
let walk
if (FIXTURE) {
  if (VISION_ARG) console.log('[note] --fixture 忽略 --vision-model：读图模型固定为夹具那一个')
  model = { vendorKey: FIXTURE_VENDOR, modelKey: FIXTURE_TEXT_MODEL, labelZh: FIXTURE_TEXT_MODEL_LABEL }
  walk = await createRuntimeWalk('shot-table-vision-leg-fixture')
} else {
  if (!VISION_ARG) throw new Error('缺 --vision-model <id>（用 --list-models 看能选的；或 --fixture 走零花费）')
  const wanted = VISION_ARG.includes('/') ? VISION_ARG : null
  const rows = (readRealCatalog().models ?? []).filter((row) => row.kind === 'text' && row.enabled
    && (wanted ? `${row.vendorKey}/${row.modelKey}` === wanted : row.modelKey === VISION_ARG))
  if (rows.length !== 1) throw new Error(rows.length === 0 ? `目录里没有启用的文本模型 ${VISION_ARG}` : `${VISION_ARG} 在多家都有，请用 供应商/模型 的写法`)
  model = { vendorKey: rows[0].vendorKey, modelKey: rows[0].modelKey, labelZh: rows[0].labelZh ?? rows[0].modelKey }
  paid = await openPaidWalk('shot-table-vision-leg.paid.mjs', 'shot-table-vision-leg', [model], { buildMarkers: [uiText('zh-CN', 'shotTable.node.idleHint')] })
  walk = paid.walk
}
const L = (key) => uiText('zh-CN', key)
const report = walk.report
report.mode = FIXTURE ? 'fixture' : CONFIRM ? 'paid-confirmed' : 'paid-stop-at-quote'
report.rateLimitProbe = RATE_PROBE
report.visionModel = `${model.vendorKey}/${model.modelKey}`

if (FIXTURE) {
  const okJson = JSON.stringify({ shotSize: '特写', mood: '平静', visual: '夹具回的画面描述', onScreenText: '', imagePrompt: 'p', motionPrompt: 'm' })
  walk.fixture.respond({
    label: 'deconstruct-vision',
    match: (body) => JSON.stringify(body?.messages ?? []).includes('拆解'),
    reply: RATE_PROBE
      ? { type: 'http-error', status: 429, json: { error: { message: RATE_LIMIT_TEXT, type: 'rate_limit_error' } } }
      : { type: 'text', text: okJson },
  })
}

let failure
try {
  const { win, app } = await walk.start({ first: true })
  if (paid) await paid.lockToAuthorizedModels(win)
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  const snap = async (label) => {
    const file = await walk.snap(label)
    fs.copyFileSync(file, path.join(EVIDENCE_DIR, `${FIXTURE ? 'fixture' : 'paid'}-${path.basename(file)}`))
    return file
  }

  // ① 新建项目 + 导入真实短视频（走真 IPC，和用户拖进来同一条路）
  await win.evaluate(() => localStorage.setItem('__nomiE2E', '1'))
  await walk.newProject()
  await clickOrFail(win.locator('[data-mode="generation"]'), '生成 tab')
  await win.waitForFunction(() => Boolean(window.__nomiCanvasStore), undefined, { timeout: stationTimeout() })
  if (!fs.existsSync(VIDEO_FIXTURE)) throw new Error(`仓库里没有现成的真实短视频夹具：${VIDEO_FIXTURE}`)
  const clipFile = path.join(os.tmpdir(), `nomi-vision-leg-clip-${process.pid}.mp4`)
  const ffmpegPath = createRequire(import.meta.url)('@ffmpeg-installer/ffmpeg').path
  const cut = spawnSync(ffmpegPath, ['-v', 'error', '-y', '-ss', String(CLIP_START), '-t', String(CLIP_SECONDS), '-i', VIDEO_FIXTURE, '-an', '-vf', 'scale=640:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clipFile])
  if (cut.status !== 0) throw new Error(`截夹具小段失败：${String(cut.stderr)}`)
  const seeded = await win.evaluate(async ({ b64 }) => {
    const projectId = /projectId=([^&]+)/.exec(location.href)?.[1]
    if (!projectId) return { error: 'no projectId in url' }
    const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const saved = await window.nomiDesktop.assets.importFile({ projectId, bytes: binary.buffer, contentType: 'video/mp4', fileName: 'reference.mp4', kind: 'upload' })
    if (!saved.ok) return { error: saved.failure.reason }
    const url = saved.asset.data?.url || ''
    if (!url) return { error: 'asset import failed' }
    const store = window.__nomiCanvasStore.getState()
    const video = store.addNode({ kind: 'video', title: '参考片', position: { x: 120, y: 160 } })
    store.updateNode(video.id, { result: { id: `seed-${Date.now()}`, type: 'video', url, createdAt: Date.now(), durationSeconds: 2 } })
    return { videoId: video.id }
  }, { b64: fs.readFileSync(clipFile).toString('base64') })
  if (!seeded.videoId) throw new Error(`导入视频失败：${JSON.stringify(seeded)}`)
  const videoNode = win.locator(`[data-node-id="${seeded.videoId}"]`)
  await expect(videoNode).toBeVisible({ timeout: stationTimeout() })
  await waitForVisualQuiescence(win)

  // ② 调用计数器：订阅 undici 的 diagnostics_channel（App 唯一出站入口 appFetch 在模块加载时抓了原生 fetch，
  //    补丁 globalThis.fetch 是拦不到它的——2026-10-11 真付费实测计数全 0 就是这个）。只计数、不拦截：
  //    上限由两处守住——开拆前本地数镜 > 上限就不点「拆解」；令牌只覆盖这一批那几次（spendGrant 的 maxAttemptsPerNode）。
  //    夹具模式下同时数夹具收到的请求，两个数必须相等——用地面真值证明计数器本身是对的。
  await app.evaluate(() => {
    const counts = { vision: 0, transcribe: 0, other: 0 }
    globalThis.__paidCounts = counts
    const channels = process.getBuiltinModule('node:diagnostics_channel')
    channels.subscribe('undici:request:create', ({ request }) => {
      if (request?.method !== 'POST') return
      const target = String(request.path ?? '')
      if (/\/audio\/transcriptions/.test(target)) counts.transcribe += 1
      else if (/\/chat\/completions|\/v1\/messages|generateContent/.test(target)) {
        counts.vision += 1
      }
      else counts.other += 1
    })
  })
  const callCounts = async () => app.evaluate(() => ({ ...globalThis.__paidCounts }))

  // ③ 选中视频 → 浮条「拆解 ▾ → 拆成镜头表」：**只建表、不开拆**（2026-10-18 拆解前选模型）——没有报价卡、一个请求都不发
  await videoNode.click()
  await clickOrFail(win.getByRole('button', { name: L('generationCommon.videoToolbar.breakDown'), exact: true }).first(), '浮条「拆解」')
  await clickOrFail(win.getByRole('menuitem', { name: new RegExp(`^${L('generationCommon.videoToolbar.shotTable')}`) }), '菜单「拆成镜头表」')
  const dialog = win.locator(SPEND_DIALOG)
  const table = win.locator('[data-testid="shot-table-node"]').first()
  await expect(table).toBeAttached({ timeout: stationTimeout() })
  await holdAbsent(dialog, '建表不弹报价卡')
  // 出站计数器本身由夹具模式对过地面真值（计数 = 夹具收到的请求数），这里比的是整只计数器，不是界面上的「不存在」。
  expect(await callCounts(), '建表 = 一个付费请求都没发').toEqual({ vision: 0, transcribe: 0, other: 0 })
  // 新表落在源视频右边、可能在屏外：画布不自动挪视口，点边缘「新节点在右侧」框进来（useCanvasArrivalHint）
  const arrival = win.locator('[data-canvas-arrival-hint]')
  if (await arrival.count()) await clickOrFail(arrival.first(), '边缘「新节点在右侧」')
  await waitForVisualQuiescence(win)
  const bar = win.locator('.react-flow__node:has([data-testid="shot-table-node"]) [data-shot-table-composer="deconstruct"]').first()
  await expect(bar, '新表被选中，下方拆解栏出现').toBeVisible({ timeout: stationTimeout() })

  // ④ 下方拆解栏「读图」选所选模型
  const picker = bar.getByRole('button', { name: L('shotTable.visionModel') }).or(bar.getByRole('combobox', { name: L('shotTable.visionModel') })).first()
  await clickOrFail(picker, '拆解栏「读图」')
  await clickOrFail(win.getByRole('option', { name: new RegExp(model.labelZh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first(), `选读图模型「${model.labelZh}」`)
  await expect(picker).toContainText(model.labelZh)

  // ⑤ 开拆前先数镜（本地切点，零成本，和拆解用的是同一个 detectShotCuts）：读图调用 = 镜数。
  //    2026-10-18 用户拍板「短片不弹，长片才弹」——≤30 次调用不再有报价卡，所以上限只能在点「拆解」之前守。
  const preShots = await win.evaluate(async ({ videoId }) => {
    const projectId = /projectId=([^&]+)/.exec(location.href)?.[1]
    const node = window.__nomiCanvasStore.getState().nodes.find((candidate) => candidate.id === videoId)
    const detected = await window.nomiDesktop.video.detectShotCuts({ videoUrl: node.result.url, projectId })
    return (detected.cuts?.length ?? 0) + 1
  }, { videoId: seeded.videoId })
  report.preCountShots = preShots
  console.log(`[pre] 本地切点数出 ${preShots} 镜 = ${preShots} 次读图（上限 ${VISION_CAP}）`)
  const overCap = preShots > VISION_CAP
  if (overCap) console.log(`[stop] ${preShots} 次 > 上限 ${VISION_CAP}：不点「拆解」。换个小段重试（--clip-start / --clip-seconds）。`)

  if (!CONFIRM || overCap) {
    expect(await callCounts(), '没点「拆解」：供应商一个付费请求都没有').toEqual({ vision: 0, transcribe: 0, other: 0 })
    if (!overCap) console.log('[stop] 未设 NOMI_PAID_CONFIRM=1：停在「拆解」之前，零花费。')
    if (overCap) process.exitCode = 2
    report.verified = ['create-table-sends-nothing', 'picker-sets-model', 'pre-count-within-cap']
  } else {
    // ⑥ 点「拆解」：短片不弹报价卡，直接开拆 → 等结果 → 打印每镜状态 / 顶上一行原话 / 实际调用次数
    await clickOrFail(bar.locator('[data-testid="shot-table-restart-deconstruction"]'), '拆解栏「拆解」', { noWaitAfter: true })
    await holdAbsent(dialog, `≤30 次调用（这次 ${preShots} 次）不弹报价卡`)
    const tableState = () => win.evaluate(() => {
      const node = window.__nomiCanvasStore.getState().nodes.find((candidate) => candidate.kind === 'shot_table')
      const doc = node?.meta?.shotTable
      return doc ? { status: doc.source.status, error: doc.source.errorMessage ?? null, rows: doc.rows.map((row) => ({ order: row.order, visionFailed: Boolean(row.visionFailed), failureReason: row.failureReason ?? null, shotSize: row.cells?.shotSize ?? '' })) } : null
    })
    await expect.poll(async () => {
      const counts = await callCounts()
      if (counts.vision > VISION_CAP) throw new Error(`读图调用 ${counts.vision} 次，超过上限 ${VISION_CAP}，立刻停`)
      return (await tableState())?.status ?? 'none'
    }, { message: '拆解跑完（ready / failed）', timeout: stationTimeout({ turns: 2 }) }).toMatch(/^(ready|failed)$/)
    await waitForVisualQuiescence(win)
    const finalState = await tableState()
    const counts = await callCounts()
    const summary = table.locator('[data-testid="shot-table-vision-failure-summary"]')
    const summaryText = (await summary.isVisible().catch(() => false)) ? (await summary.textContent())?.trim() : null
    console.log(`[result] 表状态：${finalState.status} · 顶栏原话：${summaryText ?? '(无失败行)'}${finalState.error ? ` · 整次错误：${finalState.error}` : ''}`)
    for (const row of finalState.rows) console.log(`  镜 ${row.order}：${row.visionFailed ? `没读出（${row.failureReason ?? '无原因'}）` : `读出 · 景别「${row.shotSize}」`}`)
    console.log(`[calls] 实际调用：读图 ${counts.vision} 次 · 转写 ${counts.transcribe} 次${FIXTURE ? '（undici 出站计数，夹具模式已与夹具收到的请求对账）' : '（undici 出站计数）'}`)
    Object.assign(report, { finalTableStatus: finalState.status, rows: finalState.rows, summaryLine: summaryText, calls: counts })
    expect(counts.vision, `读图调用 ≤ ${VISION_CAP}`).toBeLessThanOrEqual(VISION_CAP)
    // 拆解栏选的 = 实际发出去的（短片不再有报价卡）。主进程的出站请求体是流式发的、诊断通道拿不到（10-18 实测 bodyChunkSent 零块），
    // 所以对账分两路：夹具模式拿夹具收到的请求体逐条比；真付费模式靠构造（同一份 plan 既是报价行也是调用，deconstructVideo 单测钉）
    // 加供应商后台账单人工核对——这一条在报告里明写，不假装自动对过。
    if (FIXTURE) {
      const sent = walk.fixture.requests.map((request) => request.body?.model ?? 'unknown')
      console.log(`[calls] 夹具收到的读图请求 model：${[...new Set(sent)].join('、')}`)
      expect(sent.length > 0 && sent.every((value) => value === model.modelKey), '读图请求发给的就是拆解栏选的模型').toBe(true)
      report.visionModelsSent = [...new Set(sent)]
    } else {
      report.visionModelReconciliation = '真付费：请求体诊断通道不可见；按构造（同一份 plan）+ 供应商后台账单人工核对'
    }
    if (FIXTURE) expect(counts.vision, '计数器 = 夹具实际收到的请求数（地面真值）').toBe(walk.fixture.requests.length)
    else expect(counts.vision, '计数器看到了读图请求（不是 0）').toBeGreaterThan(0)
    await snap(RATE_PROBE ? 'result-rate-limit' : 'result')
    if (RATE_PROBE) {
      expect(finalState.rows.every((row) => row.visionFailed), '限流探针：每一镜都没读出').toBe(true)
      expect(summaryText ?? '', '限流探针：顶上一行是供应商原话（429 / 限流）').toMatch(/rate limit|429|限流/i)
      report.verified = ['rate-limit-reason-on-top-line']
    } else {
      expect(finalState.rows.some((row) => !row.visionFailed && row.shotSize), '至少有一镜读出了景别').toBe(true)
      report.verified = ['create-table-sends-nothing', 'picker-sets-model', 'no-quote-card-for-short-clip', FIXTURE ? 'called-model-equals-chip' : 'called-model-by-construction-only', 'shots-read', 'calls-within-cap']
    }
  }
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  if (paid) await paid.finish(failure)
  else await walk.finish(failure, { unscriptedFixture: true })
}
