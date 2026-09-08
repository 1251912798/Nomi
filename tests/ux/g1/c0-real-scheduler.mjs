import fs from 'node:fs'
import { quotePlanSample } from './c0-plan-sample-budget.mjs'
import { scorePlanner } from './c0-r30.mjs'
import path from 'node:path'
import { readLaneTranscripts, laneMessages } from '../agent-lane-observer.mjs'
import { prepareIsolation } from '../../../evals/lib/isoApp.mjs'
import { publicPrices, quoteC0, assertAffordable, REAL_MODELS } from './c0-real-budget.mjs'

export async function createRealScheduler({ tempRoot, attemptDir, outputDir, report, planOnly = false, plannerModel }) {
  const response = await fetch('https://apimart.ai/pricing', { signal: AbortSignal.timeout(30_000), redirect: 'error' })
  if (!response.ok) throw new Error('C0_PUBLIC_PRICE_UNAVAILABLE')
  const html = await response.text()
  fs.writeFileSync(path.join(attemptDir, 'public-pricing.html'), html)
  if (plannerModel && !planOnly) throw new Error('C0_PLANNER_OVERRIDE_REQUIRES_PLAN_ONLY')
  const quote = planOnly ? quotePlanSample(publicPrices(html), plannerModel ?? REAL_MODELS.text) : quoteC0(publicPrices(html))
  const models = quote.models
  report.budgetCny = planOnly ? 2 : report.budgetCny
  report.plannerModel = models.text
  report.quote = quote
  // Reject before copying settings or decrypting credentials when a complete film is unaffordable.
  if (!planOnly) assertAffordable(quote)
  const iso = prepareIsolation(tempRoot, { requireCatalog: true })
  const catalogFile = path.join(iso.settingsDir, 'model-catalog.json')
  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'))
  // Sample identity is user-selected and priced from the live official catalog; only the isolated copy changes.
  if (planOnly && !catalog.models.some((m) => m.vendorKey === 'apimart' && m.modelKey === models.text)) {
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
  const firstRequest = earlier?.requests?.length ?? 0
  const earlierCostCny = earlier?.billedCnyAtBudgetRate ?? 0
  let app, planMessages = []
  const bridge = path.join(tempRoot, 'c0-main.cjs')
  fs.writeFileSync(bridge, `module.exports = import(${JSON.stringify(new URL('./c0-real-main.mjs', import.meta.url).href)});`, { mode: 0o600 })
  const snapshot = async () => {
    if (!app) return
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
        report.reservedCny = ledger.reservedCny
      }
    }
  }
  return {
    iso, model: models.video,
    async attach(launched) {
      app = launched.app
      await app.evaluate(async (_electron, options) => {
        const module = await process.mainModule.require(options.bridge)
        globalThis.__c0Dispatch = await module.attachRealDispatch(options)
      }, { bridge, quote, ledgerPath })
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
      await expect.poll(() => scorePlanner(messages(), true).turns, { timeout: 180_000 }).toBe('1/1 (100%)')
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
      try { await snapshot() } finally {
        fs.rmSync(iso.settingsDir, { recursive: true, force: true })
        fs.rmSync(lockPath, { force: true })
      }
    },
  }
}
