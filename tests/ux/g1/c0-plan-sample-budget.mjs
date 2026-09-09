// Test-only text reservation boundary for plan-only and mixed sweep; one ledger spans the run.
import { REAL_MODELS, CNY_PER_USD } from './c0-real-budget.mjs'
export function quotePlanSample(prices, model, { planOnly = false } = {}) {
  if (!['gpt-5-nano', 'deepseek-v4-pro'].includes(model)) throw new Error('C0_SAMPLE_MODEL_REFUSED')
  const pricing = prices.get(model)?.pricing
  if (pricing?.unit !== 'usd_per_million_tokens' || pricing?.tier_count !== 1
    || ![pricing.rates?.input, pricing.rates?.output, pricing.limits?.max_output_tokens].every(n => Number.isFinite(n) && n > 0)) throw new Error('C0_SAMPLE_PRICE_UNKNOWN')
  return { planOnly, models: { ...REAL_MODELS, text: model }, rates: pricing.rates,
    maxOutputTokens: Math.min(pricing.limits.max_output_tokens, model === 'gpt-5-nano' ? 16000 : 8192), budgetCny: planOnly ? 2 : 3, source: 'https://apimart.ai/pricing', checkedAt: new Date().toISOString() }
}
export const planSampleFetch = ({ send, quote, ledger, persist }) => async (input, init) => {
  const request = new Request(input instanceof Request ? input.clone() : input, init)
  const url = new URL(request.url)
  if (request.method !== 'POST' || url.origin !== 'https://api.apimart.ai'
    || url.pathname !== '/v1/chat/completions' || url.search) throw new Error('C0_SAMPLE_OUTBOUND_REFUSED')
  const body = await request.clone().json()
  if (body.model !== quote.models.text || body.max_completion_tokens !== undefined) throw new Error('C0_SAMPLE_MODEL_REFUSED')
  body.max_tokens = Math.min(body.max_tokens ?? quote.maxOutputTokens, quote.maxOutputTokens)
  if (!Number.isInteger(body.max_tokens) || body.max_tokens < 1) throw Error('C0_OUTPUT_LIMIT_REQUIRED')
  if (!Number.isFinite(quote.budgetCny) || quote.budgetCny <= 0 || quote.budgetCny > (quote.planOnly ? 2 : 3)) throw Error('C0_BLOCKED_BUDGET')
  // UTF-8 bytes upper-bound ordinary byte-token input, including schema/message wrappers.
  const inputBytes = Buffer.byteLength(JSON.stringify(body), 'utf8')
  const upperUsd = (inputBytes * quote.rates.input + body.max_tokens * quote.rates.output) / 1e6
  const reservedCny = ledger.reservedCny + upperUsd * CNY_PER_USD
  if (!Number.isFinite(upperUsd) || upperUsd <= 0 || !Number.isFinite(ledger.reservedCny) || ledger.reservedCny < 0 || !Number.isFinite(reservedCny) || reservedCny > quote.budgetCny) throw new Error('C0_BLOCKED_BUDGET')
  const row = { model: body.model, path: url.pathname, inputBytes, maxTokens: body.max_tokens, upperUsd, started: new Date().toISOString() }
  ledger.requests.push(row)
  ledger.reservedCny = reservedCny
  persist()
  try {
    const response = await send(request.url, { method: 'POST', headers: request.headers, signal: request.signal, body: JSON.stringify(body), redirect: 'error' })
    row.httpStatus = response.status
    persist()
    return response
  } catch {
    row.transportFailed = true
    persist()
    throw new Error('C0_PROVIDER_REQUEST_FAILED')
  }
}
