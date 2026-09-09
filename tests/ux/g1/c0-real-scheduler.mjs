import { stationTimeout } from '../_station-budget.mjs'
import { watchCredential } from './credential-precheck.mjs'
import fs from 'node:fs'
import { quotePlanSample } from './c0-plan-sample-budget.mjs'
import { shots, createSyntheticC0Media } from './c0-fixture.mjs'
import { scorePlanner } from './c0-r30.mjs'
import path from 'node:path'
import { readLaneTranscripts, laneMessages } from '../agent-lane-observer.mjs'
import { prepareIsolation } from '../../../evals/lib/isoApp.mjs'
import { publicPrices, quoteC0, assertAffordable, REAL_MODELS, requestQuote } from './c0-real-budget.mjs'

export async function createRealScheduler({ tempRoot, attemptDir, outputDir, report, planOnly = false, plannerModel }) {
  const mixed = !planOnly && process.env.NOMI_C0_MEDIA_DRY_RUN === '1'
  if (mixed) outputDir = process.env.NOMI_C0_LEDGER_DIR ?? attemptDir
  const response = await fetch('https://apimart.ai/pricing', { signal: AbortSignal.timeout(30_000), redirect: 'error' })
  if (!response.ok) throw new Error('C0_PUBLIC_PRICE_UNAVAILABLE')
  const html = await response.text()
  fs.writeFileSync(path.join(attemptDir, 'public-pricing.html'), html)
  if (plannerModel && !planOnly && !mixed) throw new Error('C0_PLANNER_OVERRIDE_REQUIRES_MIXED_MODE')
  const quote = planOnly || mixed ? quotePlanSample(publicPrices(html), plannerModel ?? REAL_MODELS.text, { planOnly }) : quoteC0(publicPrices(html))
  const models = quote.models
  if (mixed) {
    const budget = Number(process.env.NOMI_C0_TEXT_BUDGET ?? 3)
    if (!Number.isFinite(budget) || budget <= 0 || budget > 3) throw Error('C0_BLOCKED_BUDGET')
    quote.budgetCny = budget
  }
  report.budgetCny = planOnly || mixed ? quote.budgetCny : report.budgetCny
  report.mediaMode = planOnly ? 'plan-only; no media dispatch' : mixed ? 'dry-run synthetic test signals; not a film' : 'real'
  quote.mediaDryRun = mixed
  report.plannerModel = models.text
  report.quote = quote
  // Reject before copying settings or decrypting credentials when a complete film is unaffordable.
  if (!planOnly && !mixed) assertAffordable(quote)
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
  const priorReserved = mixed ? (earlier?.reservedCny ?? 0) : 0
  const firstRequest = earlier?.requests?.length ?? 0
  const earlierCostCny = earlier?.billedCnyAtBudgetRate ?? 0
  const mediaFiles = mixed ? createSyntheticC0Media(path.join(attemptDir, 'fixture-media')) : []
  let app, credentialBlocked = false, planMessages = []
  const bridge = path.join(tempRoot, 'c0-main.cjs')
  const snapshot = async () => {
    if (!app || credentialBlocked) return
    try {
      const ledger = await app.evaluate(() => globalThis.__c0Dispatch.snapshot())
      report.costCny = Math.max(0, ledger.billedCnyAtBudgetRate - earlierCostCny)
      report.groupCostCny = ledger.billedCnyAtBudgetRate
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
      try { await watchCredential({ directory: attemptDir, kill: () => { credentialBlocked = true; app.process().kill('SIGKILL') }, run: credentialMarker => app.evaluate(async (_electron, options) => {
        const module = await process.mainModule.require(options.bridge)
        globalThis.__c0Dispatch = await module.attachRealDispatch(options)
      }, { bridge, quote, ledgerPath, mediaFiles, requestsPath: path.join(attemptDir, 'model-requests.json'), credentialMarker }) }) } finally { fs.rmSync(bridge, { force: true }) }
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
      const messages = () => readLaneTranscripts(projectRoot).flatMap(laneMessages)
      await expect.poll(() => scorePlanner(messages(), true).turns, { timeout: stationTimeout({ turns: 1, operations: 0 }) }).toBe('1/1 (100%)')
      planMessages = messages()
    },
    verifyPlan(actual, expect) {
      report.modelSelection = { total: actual.length, modelCorrect: actual.filter((s) => s.modelKey === models.video).length,
        tierCorrect: actual.filter((s) => s.modelKey === models.video && s.params?.resolution === '768P').length }
      report.r30.real = scorePlanner(planMessages, true)
      expect(actual.every((s) => s.modelKey === models.video && s.params?.resolution === '768P')).toBe(true)
      fs.writeFileSync(path.join(attemptDir, 'r30-native.json'), JSON.stringify(report.r30.real, null, 2))
    },
    prepareGeneration() {}, async generationCompleted() { await snapshot() },
    async finish() { await snapshot() },
    async close() {
      try {
        if (app && !credentialBlocked) await app.evaluate(() => globalThis.__c0Dispatch?.markLifecycle('C0_SCHEDULER_CLEANUP'))
        await snapshot()
      } finally {
        fs.rmSync(iso.settingsDir, { recursive: true, force: true })
        fs.rmSync(lockPath, { force: true })
      }
    },
  }
}
