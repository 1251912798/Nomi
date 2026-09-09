import fs from 'node:fs'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
import { execFileSync } from 'node:child_process'
import { quotePlanSample } from './c0-plan-sample-budget.mjs'
import { shots } from './c0-fixture.mjs'
import { scorePlanner, scoreLanePlanner } from './c0-r30.mjs'
import path from 'node:path'
import { prepareIsolation, readEventsLog } from '../../../evals/lib/isoApp.mjs'
import { publicPrices, quoteC0, assertAffordable, REAL_MODELS, requestQuote } from './c0-real-budget.mjs'

export async function createRealScheduler({ tempRoot, attemptDir, outputDir, report, plannerModel }) {
  const mixed = process.env.NOMI_C0_MEDIA_DRY_RUN === '1'
  if (mixed) outputDir = process.env.NOMI_C0_LEDGER_DIR ?? attemptDir
  const response = await fetch('https://apimart.ai/pricing', { signal: AbortSignal.timeout(30_000), redirect: 'error' })
  if (!response.ok) throw new Error('C0_PUBLIC_PRICE_UNAVAILABLE')
  const html = await response.text()
  fs.writeFileSync(path.join(attemptDir, 'public-pricing.html'), html)
  if (plannerModel && !mixed) throw new Error('C0_PLANNER_OVERRIDE_REQUIRES_MIXED_MODE')
  const quote = mixed ? quotePlanSample(publicPrices(html), plannerModel ?? REAL_MODELS.text) : quoteC0(publicPrices(html))
  const models = quote.models
  if (mixed) {
    const budget = Number(process.env.NOMI_C0_TEXT_BUDGET ?? 3)
    if (!Number.isFinite(budget) || budget <= 0 || budget > 3) throw Error('C0_BLOCKED_BUDGET')
    quote.budgetCny = budget
  }
  report.budgetCny = mixed ? quote.budgetCny : report.budgetCny
  report.mediaMode = mixed ? 'dry-run synthetic test signals; not a film' : 'real'
  quote.mediaDryRun = mixed
  report.plannerModel = models.text
  report.quote = quote
  // Reject before copying settings or decrypting credentials when a complete film is unaffordable.
  if (!mixed) assertAffordable(quote)
  const iso = prepareIsolation(tempRoot, { requireCatalog: true })
  const catalogFile = path.join(iso.settingsDir, 'model-catalog.json')
  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'))
  // Sample identity is user-selected and priced from the live official catalog; only the isolated copy changes.
  if (!catalog.models.some((m) => m.vendorKey === 'apimart' && m.modelKey === models.text)) {
    catalog.models.push({ vendorKey: 'apimart', modelKey: models.text, labelZh: models.text,
      kind: 'text', enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
  }
  for (const vendor of catalog.vendors) vendor.enabled = vendor.key === 'apimart'
  for (const model of catalog.models) model.enabled = model.vendorKey === 'apimart' && Object.values(models).includes(model.modelKey)
  for (const modelKey of Object.values(models)) {
    if (!catalog.models.some((m) => m.enabled && m.modelKey === modelKey)) throw new Error('C0_CONFIGURED_MODEL_UNAVAILABLE')
  }
  // Retain only encrypted APIMart credentials; never copy them into any fixture or report.
  catalog.apiKeysByVendor = { apimart: catalog.apiKeysByVendor.apimart }
  if (catalog.apiKeysByVendor.apimart?.enc !== 'safeStorage') throw new Error('C0_ENCRYPTED_SETTINGS_REQUIRED')
  fs.writeFileSync(catalogFile, JSON.stringify(catalog), { mode: 0o600 })
  const lockPath = path.join(outputDir, 'real-budget.lock')
  const lock = fs.openSync(lockPath, 'wx', 0o600)
  fs.closeSync(lock)
  const ledgerPath = path.join(outputDir, 'real-budget-ledger.json')
  const earlier = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : null
  const priorCost = mixed ? (earlier?.billedCny ?? earlier?.billedCnyAtBudgetRate ?? 0) : 0
  const priorReserved = mixed ? (earlier?.reservedCny ?? 0) : 0
  const firstRequest = mixed ? (earlier?.requests?.length ?? 0) : 0
  const mediaFiles = []
  if (mixed) for (const shot of shots) {
    const file = path.join(attemptDir, `synthetic-${shot.index}.mp4`)
    execFileSync(ffmpeg.path, ['-v','error','-y','-f','lavfi','-i', `testsrc2=size=640x360:rate=24,hue=h=${shot.index * 35}`, '-f','lavfi','-i', `sine=frequency=${220 + shot.index * 55}:sample_rate=44100`, '-t','8','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart', file], { stdio: 'pipe' })
    mediaFiles.push(file)
  }
  let app, planEvents = [], nativeMessages
  const readNativeMessages = async (projectRoot) => {
    // Reuse the candidate's versioned observer rather than duplicating the pi format reader.
    const observer = await import('../agent-lane-observer.mjs')
    return observer.readLaneTranscripts(projectRoot).flatMap(observer.laneMessages)
  }
  const bridge = path.join(tempRoot, 'c0-main.cjs')
  const snapshot = async () => {
    if (!app) return
    try {
      const ledger = await app.evaluate(() => globalThis.__c0Dispatch.snapshot())
      report.costCny = ledger.billedCnyAtBudgetRate - priorCost
      report.billedUsd = ledger.billedUsd
      report.billingAttribution = 'APIMart token balance delta; concurrent use of the same token may be included'
    } catch {
      report.costCny = null
      report.billingError = 'C0_BILLING_UNAVAILABLE'
      throw new Error('C0_BILLING_UNAVAILABLE')
    } finally {
      // Preserve reservations even if Electron died or the balance query failed.
      if (fs.existsSync(ledgerPath)) {
        const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
        report.outbound = ledger.requests.slice(firstRequest)
        report.paidCalls = report.outbound.length
        report.reservedCny = ledger.reservedCny - priorReserved
      }
    }
  }
  return {
    iso, model: models.video,
    get requests() { const file = path.join(attemptDir, 'model-requests.json'); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [] },
    async videoWaitQuote() {
      if (mixed) return { requests: shots.map(s => ({ model: models.video, duration: s.durationSec })), concurrency: 6, measuredMultiplier: 30, source: 'synthetic media, zero external dispatch' }
      const reserved = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')).requests.filter(r => r.model === REAL_MODELS.video)
      // Queued shots may not have reached dispatch: use the same reservation quote function.
      const planned = shots.map(s => requestQuote('https://api.apimart.ai/v1/videos/generations', 'POST',
        { model: REAL_MODELS.video, resolution: '768P', duration: s.durationSec, aspect_ratio: '16:9' }, quote))
      return { requests: reserved.length === planned.length ? reserved : planned,
        concurrency: 6, measuredMultiplier: 30, source: 'gate4b measured 120–240s per 8s video', ledgerPath }
    },
    async attach(launched) {
      app = launched.app
      fs.writeFileSync(bridge, `module.exports = import(${JSON.stringify(new URL('./c0-real-main.mjs', import.meta.url).href)});`, { mode: 0o600 })
      try { await app.evaluate(async (_electron, options) => {
        const module = await process.mainModule.require(options.bridge)
        globalThis.__c0Dispatch = await module.attachRealDispatch(options)
      }, { bridge, quote, ledgerPath, mediaFiles, requestsPath: path.join(attemptDir, 'model-requests.json') }) } finally { fs.rmSync(bridge, { force: true }) }
      await launched.win.evaluate(({ models }) => {
        localStorage.setItem('nomi.assistantModel', JSON.stringify({ vendorKey: 'apimart', modelKey: models.text }))
        window.dispatchEvent(new CustomEvent('nomi:assistant-model-changed'))
      }, { models })
    },
    preparePlan() {}, async planRequested() {},
    async assertNoGeneration(expect) {
      await snapshot()
      expect(report.outbound.filter((r) => r.model !== models.text)).toEqual([])
    },
    async planCompleted({ projectRoot, expect }) {
      if (fs.existsSync(path.join(projectRoot, '.nomi/agent-sessions'))) {
        await expect.poll(async () => {
          nativeMessages = await readNativeMessages(projectRoot)
          return scoreLanePlanner(nativeMessages, true).turns
        }, { timeout: 180_000 }).toBe('1/1 (100%)')
      } else {
        await expect.poll(() => readEventsLog(projectRoot).some((e) => e.type === 'agent.turn.finished'), { timeout: 180_000 }).toBe(true)
        planEvents = readEventsLog(projectRoot)
      }
    },
    verifyPlan(actual, expect) {
      expect(actual.every((s) => s.modelKey === REAL_MODELS.video && s.params?.resolution === '768P')).toBe(true)
      report.r30.real = nativeMessages ? scoreLanePlanner(nativeMessages, true) : scorePlanner(planEvents, true)
      fs.writeFileSync(path.join(attemptDir, 'r30-events.json'), JSON.stringify(planEvents.filter((e) => /^agent\.(turn\.|tool\.)/.test(e.type))
        .map((e) => ({ type: e.type, toolName: e.payload?.toolName, status: e.payload?.status, ok: e.payload?.ok,
          toolCallId: e.payload?.toolCallId, hasFinalText: Boolean(e.payload?.finalTextHead?.trim()) })), null, 2))
    },
    prepareGeneration() {}, async generationCompleted() { await snapshot() },
    async finish() { await snapshot() },
    async close() {
      try { await snapshot() } finally {
        fs.rmSync(iso.settingsDir, { recursive: true, force: true })
        fs.rmSync(lockPath, { force: true })
      }
    },
  }
}
