import { watchCredential } from './credential-precheck.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { prepareIsolation } from '../../../evals/lib/isoApp.mjs'
import { publicPrices, REAL_MODELS } from './c0-real-budget.mjs'
export async function prepareRealText(profile) {
  const response = await fetch('https://apimart.ai/pricing', { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw Error('SWEEP_PRICE_UNAVAILABLE')
  const pricing = publicPrices(await response.text()).get(REAL_MODELS.text)?.pricing
  if (pricing?.unit !== 'usd_per_million_tokens' || pricing.tier_count !== 1) throw Error('SWEEP_PRICE_UNKNOWN')
  const maxInputTokens = pricing.limits?.max_input_tokens, maxOutputTokens = Math.min(1024, pricing.limits?.max_output_tokens)
  const textRequestUsd = (maxInputTokens * pricing.rates?.input + maxOutputTokens * pricing.rates?.output) / 1e6
  if (![textRequestUsd,maxInputTokens,maxOutputTokens].every(n => Number.isFinite(n) && n > 0)) throw Error('SWEEP_PRICE_UNKNOWN')
  const quote = { textRequestUsd, maxInputTokens, maxOutputTokens }
  const iso = prepareIsolation(profile)
  const file = path.join(iso.settingsDir, 'model-catalog.json'), catalog = JSON.parse(fs.readFileSync(file, 'utf8'))
  catalog.vendors = catalog.vendors.filter(v => v.key === 'apimart').map(v => ({ ...v, enabled: true }))
  catalog.models = catalog.models.filter(m => m.vendorKey === 'apimart' && m.modelKey === REAL_MODELS.text).map(m => ({ ...m, enabled: true }))
  if (!catalog.models.length) catalog.models.push({ modelKey: REAL_MODELS.text, vendorKey: 'apimart', labelZh: REAL_MODELS.text, kind: 'text', enabled: true, published: true })
  catalog.mappings = []
  catalog.apiKeysByVendor = { apimart: catalog.apiKeysByVendor.apimart }
  if (catalog.apiKeysByVendor.apimart?.enc !== 'safeStorage' || !catalog.models.length) throw Error('SWEEP_REAL_TEXT_CONFIG_MISSING')
  fs.writeFileSync(file, JSON.stringify(catalog), { mode: 0o600 })
  return { quote, iso }
}
export async function attachRealText(launched, { profile, quote, ledgerPath, budgetCny, requestsPath }) {
  const bridge = path.join(profile, 'sweep-main.cjs')
  fs.writeFileSync(bridge, `module.exports = import(${JSON.stringify(new URL('./sweep-real-main.mjs', import.meta.url).href)});`)
  try {
    await watchCredential({ directory: path.dirname(profile), kill: () => launched.app.process().kill('SIGKILL'), run: credentialMarker => launched.app.evaluate(async (_main, options) => {
      const module = await process.mainModule.require(options.bridge)
      globalThis.__sweepDispatch = await module.attachSweepDispatch(options)
    }, { bridge, quote, ledgerPath, budgetCny, requestsPath, credentialMarker }) })
  } finally {
    // The one-shot loader is executable scratch, not case evidence.
    fs.rmSync(bridge, { force: true })
  }
  await launched.win.evaluate(modelKey => {
    localStorage.setItem('nomi.assistantModel', JSON.stringify({ vendorKey: 'apimart', modelKey }))
    window.dispatchEvent(new CustomEvent('nomi:assistant-model-changed'))
  }, REAL_MODELS.text)
}

// Model identity is selected through the same picker as a user, after opening a project.
export async function selectPlannerInUi(win, model) {
  await win.locator('[data-v4-control="model"]').click()
  const row = win.locator('[data-v4-model-row]').filter({ has: win.getByRole('button', { name: '对话', exact: true }) })
  await row.getByRole('button', { name: '对话', exact: true }).click()
  await win.getByRole('option', { name: model, exact: true }).click()
  await win.locator('[data-v4-control="model"]').click()
}
