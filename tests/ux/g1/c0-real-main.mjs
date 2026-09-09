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
  const proxy = require(path.join(compiled, 'systemProxy.js'))
  const observe = createTransportEvidence({ evidencePath: path.join(path.dirname(requestsPath), 'transport-evidence.json'),
    redact: value => String(value).split(key).join('[REDACTED]'),
    proxyState: () => { const status = proxy.getProxyStatus(); return { viaProxy: Boolean(status.activeUrl), source: status.source, mode: status.mode,
      route: status.activeUrl ? 'PROXY (address omitted)' : 'DIRECT', limitation: 'application routing; transparent TUN cannot be observed' } } })
  const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
    : { reservedCny: 0, requests: [], initialUsedUsd: null, billedUsd: null }
  const persist = () => fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), { mode: 0o600 })
  const balance = async () => {
    try {
      const response = await observe(originalAppFetch, 'appFetch:balance')('https://api.apimart.ai/v1/balance', {
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
  const wrap = createDispatchWrapper({ quote, ledger, persist, requestsPath, mediaFiles, ledgerPath, observe })
  transport.appFetch = wrap(originalAppFetch, 'appFetch')
  globalThis.fetch = wrap(originalGlobalFetch, 'globalFetch')
  return {
    markLifecycle(reason) { observe.markLifecycle(reason) },
    async snapshot() {
      ledger.billedUsd = Math.max(ledger.billedUsd ?? 0, (await balance()) - ledger.initialUsedUsd)
      ledger.billedCnyAtBudgetRate = ledger.billedUsd * CNY_PER_USD
      if (quote.mediaDryRun) ledger.billedCny = ledger.billedCnyAtBudgetRate
      persist()
      return ledger
    },
  }
}

export function createDispatchWrapper({ quote, ledger, persist, requestsPath, mediaFiles = [], ledgerPath, observe = createTransportEvidence({ evidencePath: ledgerPath && path.join(path.dirname(ledgerPath), 'transport-evidence.json') }) }) {
  const wrapFetch = quote.mediaDryRun ? planSampleFetch : budgetedFetch
  const requests = requestsPath && fs.existsSync(requestsPath) ? JSON.parse(fs.readFileSync(requestsPath, 'utf8')) : []
  let mediaIndex = 0
  const wrap = (send, transportName = 'test-send') => observe(send, transportName, observedSend => {
    const paid = wrapFetch({ send: async (input, init) => {
      const request = new Request(input instanceof Request ? input.clone() : input, init)
      const body = request.method === 'POST' ? await request.clone().json() : undefined
      requests.push({ path: new URL(request.url).pathname, body })
      if (requestsPath) fs.writeFileSync(requestsPath, JSON.stringify(requests, null, 2))
      return observedSend(input, init)
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
  })
  return wrap
}

// Record below the budget wrapper (raw network failure) and above it (local refusal).
// A separate row per invocation also preserves concurrent calls and SDK retries.
export function createTransportEvidence({ evidencePath, redact = String, proxyState = () => ({ viaProxy: null, route: 'unknown' }) } = {}) {
  const rows = evidencePath && fs.existsSync(evidencePath) ? JSON.parse(fs.readFileSync(evidencePath, 'utf8')) : []
  const save = () => { if (evidencePath) fs.writeFileSync(evidencePath, JSON.stringify(rows, null, 2), { mode: 0o600 }) }
  const errorInfo = error => error == null ? null : { name: error.name ?? null, message: redact(error.message ?? error),
    stack: error.stack ? redact(error.stack) : null, code: error.code ?? null, cause: error.cause ? errorInfo(error.cause) : null }
  let lifecycle = null
  const observe = (send, transportName, budget = fn => fn) => async (input, init) => {
    const started = performance.now(), request = new Request(input instanceof Request ? input.clone() : input, init)
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    const row = { id: rows.length + 1, started: new Date().toISOString(), transportName, path: new URL(request.url).pathname,
      dispatched: false, httpStatus: null, bodyPrefix: null, elapsedMs: null, ...proxyState(),
      exception: null, localReason: null, abortReason: null, lifecycleAtStart: lifecycle }
    rows.push(row); save()
    const abort = () => { row.abortReason = errorInfo(signal.reason); row.abortElapsedMs = Math.round(performance.now() - started); row.lifecycleAtAbort = lifecycle; save() }
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    let originalError
    const observedSend = async (target, options) => {
      const outgoing = new Request(target, options)
      const body = outgoing.method === 'POST' ? await outgoing.clone().text() : ''
      const parsed = body ? JSON.parse(body) : {}
      Object.assign(row, { requestBytes: Buffer.byteLength(body), model: parsed.model ?? null, maxTokens: parsed.max_tokens ?? null,
        stream: parsed.stream ?? false, toolsCount: parsed.tools?.length ?? 0, dispatched: true, ...proxyState() }); save()
      try {
        const response = await send(target, options)
        Object.assign(row, { httpStatus: response.status, elapsedMs: Math.round(performance.now() - started) }); save()
        // Drain a clone asynchronously for transport liveness; retain only a bounded prefix.
        void (async () => {
          const reader = response.clone().body?.getReader(), decoder = new TextDecoder()
          let prefix = ''
          row.streamBytes = 0; row.streamState = 'reading'; save()
          try {
            if (reader) while (true) {
              const { done, value } = await reader.read()
              if (done) { row.streamState = 'completed'; row.streamEndElapsedMs = Math.round(performance.now() - started); break }
              row.streamBytes += value.byteLength
              row.lastChunkElapsedMs = Math.round(performance.now() - started)
              if (Array.from(prefix).length < 300) prefix = Array.from(prefix + decoder.decode(value, { stream: true })).slice(0, 300).join('')
              row.bodyPrefix = Array.from(redact(prefix)).slice(0, 300).join(''); save()
            }
            row.bodyPrefix = Array.from(redact(prefix)).slice(0, 300).join('')
          } catch (error) { row.streamState = 'failed'; row.bodyReadException = errorInfo(error); row.bodyPrefix = Array.from(redact(prefix)).slice(0, 300).join('') }
          finally { row.prefixElapsedMs = Math.round(performance.now() - started); save(); if (reader) void reader.cancel().catch(() => {}) }
        })().catch(error => { row.observerException = errorInfo(error); save() })
        return response
      } catch (error) { originalError = error; row.exception = errorInfo(error); throw error }
    }
    try { return await budget(observedSend)(input, init) }
    catch (error) {
      row.elapsedMs = Math.round(performance.now() - started)
      if (!row.dispatched) { row.localReason = errorInfo(error); row.exception = errorInfo(error) }
      else if (!row.exception) row.exception = errorInfo(error)
      row.wrapperException = originalError && error !== originalError ? errorInfo(error) : null
      save()
      throw originalError ?? error
    }
  }
  observe.markLifecycle = reason => { lifecycle = { reason, at: new Date().toISOString() } }
  return observe
}
