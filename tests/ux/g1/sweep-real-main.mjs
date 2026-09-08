// Test-side main-process dispatch boundary; credentials never leave Electron.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { CNY_PER_USD } from './c0-real-budget.mjs'
import { reserveSweepRequest } from './sweep-budget.mjs'
export async function attachSweepDispatch({ quote, ledgerPath, budgetCny, requestsPath }) {
  const require = createRequire(import.meta.url), { app } = require('electron')
  const compiled = path.join(app.getAppPath(), 'dist-electron')
  const transport = require(path.join(compiled, 'appFetch.js'))
  const original = transport.appFetch, globalOriginal = globalThis.fetch
  const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : { reservedCny: 0, requests: [] }
  const persist = () => fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), { mode: 0o600 })
  const { readCatalog } = require(path.join(compiled, 'catalog/catalogStore.js'))
  const { decryptApiKeyRecord } = require(path.join(compiled, 'catalog/secrets.js'))
  const key = decryptApiKeyRecord(readCatalog().apiKeysByVendor.apimart)
  if (!key) throw Error('SWEEP_CREDENTIAL_MISSING')
  const balance = async () => {
    const response = await original('https://api.apimart.ai/v1/balance', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000), redirect: 'error' })
    const data = await response.json()
    if (!response.ok || data.success !== true || !Number.isFinite(data.used_balance)) throw Error('SWEEP_BILLING_UNAVAILABLE')
    return data.used_balance
  }
  ledger.initialUsedUsd ??= await balance()
  const requests = []
  const wrap = send => async (input, init) => {
    const request = new Request(input instanceof Request ? input.clone() : input, init)
    const url = new URL(request.url)
    if (request.method !== 'POST' || url.origin !== 'https://api.apimart.ai' || url.pathname !== '/v1/chat/completions') throw Error('SWEEP_TEXT_ONLY_OUTBOUND_REFUSED')
    const body = await request.clone().json()
    body.max_tokens = Math.min(body.max_tokens ?? quote.maxOutputTokens, quote.maxOutputTokens)
    if (body.max_completion_tokens !== undefined) throw Error('SWEEP_UNKNOWN_OUTPUT_LIMIT')
    const row = reserveSweepRequest({ url: url.href, method: request.method, body, quote, ledger, persist, budgetCny })
    requests.push({ path: url.pathname, body })
    fs.writeFileSync(requestsPath, JSON.stringify(requests, null, 2), { mode: 0o600 })
    try {
      const response = await send(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(body), redirect: 'error', signal: request.signal })
      row.httpStatus = response.status
      const clone = response.clone()
      // Keep exact provider output for diagnostics; never record Authorization.
      const responseFile = `${requestsPath}.${requests.length}.response.txt`
      void clone.text().then(text => fs.writeFileSync(responseFile, text, { mode: 0o600 })).catch(() => {})
      persist()
      return response
    } catch { row.transportFailed = true; persist(); throw Error('SWEEP_PROVIDER_REQUEST_FAILED') }
  }
  transport.appFetch = wrap(original)
  globalThis.fetch = wrap(globalOriginal)
  persist()
  return { async snapshot() {
    ledger.billedUsd = Math.max(0, (await balance()) - ledger.initialUsedUsd)
    ledger.billedCny = ledger.billedUsd * CNY_PER_USD
    persist()
    return ledger
  } }
}
