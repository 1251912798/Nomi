import { decryptForDispatch } from './credential-main.mjs'
// Loaded through a file-backed bridge inside the candidate Electron main process.
// Credentials never cross this boundary. Production catalog/transport modules come from app.asar.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { planSampleFetch } from './c0-plan-sample-budget.mjs'
import { budgetedFetch, CNY_PER_USD } from './c0-real-budget.mjs'
export async function attachRealDispatch({ quote, ledgerPath, mediaFiles = [], requestsPath, credentialMarker }) {
  const require = createRequire(import.meta.url)
  const { app } = require('electron')
  const compiled = path.join(app.getAppPath(), 'dist-electron')
  const { readCatalog } = require(path.join(compiled, 'catalog/catalogStore.js'))
  const { decryptApiKeyRecord } = require(path.join(compiled, 'catalog/secrets.js'))
  const key = decryptForDispatch({ record: readCatalog().apiKeysByVendor?.apimart, decrypt: decryptApiKeyRecord, credentialMarker })
  const transport = require(path.join(compiled, 'appFetch.js'))
  const originalAppFetch = transport.appFetch
  const originalGlobalFetch = globalThis.fetch
  const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
    : { reservedCny: 0, requests: [], initialUsedUsd: null, billedUsd: null }
  const persist = () => fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), { mode: 0o600 })
  const balance = async () => {
    try {
      const response = await originalAppFetch('https://api.apimart.ai/v1/balance', {
        headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000), redirect: 'error',
      })
      const data = await response.json()
      if (!response.ok || data.success !== true || !Number.isFinite(data.used_balance)
        || !Number.isFinite(data.used_credits) || Math.abs(data.used_credits - data.used_balance * 10) > .00001)
        throw new Error('invalid')
      return data.used_balance
    } catch { throw new Error('C0_BILLING_UNAVAILABLE') }
  }
  ledger.initialUsedUsd ??= await balance()
  persist()
  const wrap = createDispatchWrapper({ quote, ledger, persist, requestsPath, mediaFiles, ledgerPath })
  transport.appFetch = wrap(originalAppFetch)
  globalThis.fetch = wrap(originalGlobalFetch)
  return {
    async snapshot() {
      ledger.billedUsd = Math.max(ledger.billedUsd ?? 0, (await balance()) - ledger.initialUsedUsd)
      ledger.billedCnyAtBudgetRate = ledger.billedUsd * CNY_PER_USD
      if (quote.mediaDryRun) ledger.billedCny = ledger.billedCnyAtBudgetRate
      persist()
      return ledger
    },
  }
}

export function createDispatchWrapper({ quote, ledger, persist, requestsPath, mediaFiles = [], ledgerPath }) {
  const wrapFetch = quote.mediaDryRun ? planSampleFetch : budgetedFetch
  const requests = requestsPath && fs.existsSync(requestsPath) ? JSON.parse(fs.readFileSync(requestsPath, 'utf8')) : []
  let mediaIndex = 0
  const wrap = send => {
    const paid = wrapFetch({ send: async (input, init) => {
      const request = new Request(input instanceof Request ? input.clone() : input, init)
      const body = request.method === 'POST' ? await request.clone().json() : undefined
      requests.push({ path: new URL(request.url).pathname, body })
      if (requestsPath) fs.writeFileSync(requestsPath, JSON.stringify(requests, null, 2))
      return send(input, init)
    }, quote, ledger, persist })
    return async (input, init) => {
      if (!quote.mediaDryRun) return paid(input, init)
      const request = new Request(input instanceof Request ? input.clone() : input, init), url = new URL(request.url)
      if (url.origin !== 'https://api.apimart.ai' || request.method !== 'POST' || url.search) throw Error('C0_MIXED_OUTBOUND_REFUSED')
      const body = await request.clone().json()
      if (url.pathname === '/v1/videos/generations') {
        if (body.model !== quote.models.video || body.resolution !== '768P' || body.duration !== 8 || mediaIndex >= mediaFiles.length) throw Error('C0_MIXED_MEDIA_REFUSED')
        const file = mediaFiles[mediaIndex++]
        fs.appendFileSync(ledgerPath + '.synthetic-media.jsonl', JSON.stringify({ body, file, synthetic: true }) + '\n')
        return Response.json({ data: [{ url: 'data:video/mp4;base64,' + fs.readFileSync(file).toString('base64') }] })
      }
      if (url.pathname === '/v1/chat/completions' && JSON.stringify(body.messages ?? []).includes('资深影视分镜审片')) {
        const content = JSON.stringify({ reason: '媒体 dry-run 测试信号，不评价成片', scores: { identity: 0, composition: 0, continuity: 0, action: 0 } })
        const chunk = (delta, finish_reason) => 'data: ' + JSON.stringify({ id: 'synthetic-review', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta, finish_reason }] }) + '\n\n'
        return body.stream ? new Response(chunk({ role: 'assistant', content }, null) + chunk({}, 'stop') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } }) : Response.json({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] })
      }
      return paid(input, init)
    }
  }
  return wrap
}
