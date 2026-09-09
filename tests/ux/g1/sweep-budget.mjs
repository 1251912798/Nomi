import { requestQuote, reserve, CNY_PER_USD } from './c0-real-budget.mjs'
export function reserveSweepRequest({ url, method, body, quote, ledger, persist, budgetCny }) {
  if (!Number.isFinite(budgetCny) || budgetCny < 0 || budgetCny > 3) throw Error('SWEEP_INVALID_BUDGET')
  const target = new URL(url)
  if (method !== 'POST' || target.origin !== 'https://api.apimart.ai' || target.pathname !== '/v1/chat/completions') throw Error('SWEEP_TEXT_ONLY_OUTBOUND_REFUSED')
  const entry = requestQuote(url, method, body, quote)
  if (!Number.isFinite(ledger.reservedCny) || ledger.reservedCny + entry.upperUsd * CNY_PER_USD > budgetCny) throw Error('SWEEP_BUDGET_EXHAUSTED')
  return reserve(ledger, entry, persist)
}
