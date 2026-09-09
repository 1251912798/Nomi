import { describe, expect, it } from 'vitest'
import { planSampleFetch, quotePlanSample } from './c0-plan-sample-budget.mjs'

const prices = new Map([['gpt-5-nano', { pricing: { unit: 'usd_per_million_tokens', tier_count: 1, limits: { max_output_tokens: 8192 }, rates: { input: .05, output: .4 } } }]])
const endpoint = 'https://api.apimart.ai/v1/chat/completions'
const options = { method: 'POST', body: JSON.stringify({ model: 'gpt-5-nano', messages: [{ role: 'user', content: '八镜' }] }) }

describe('stage 02 sample budget', () => {
  it('persists reservation before dispatch and refuses generation or unpriced models', async () => {
    const quote = quotePlanSample(prices, 'gpt-5-nano', { planOnly: true })
    const ledger = { requests: [], reservedCny: 0 }
    const order = []
    const fetch = planSampleFetch({ quote, ledger, persist: () => order.push('persist'), send: async (_url, init) => {
      order.push('send')
      expect(JSON.parse(init.body).max_tokens).toBe(8192)
      return new Response('{}')
    } })
    await fetch(endpoint, options)
    expect(order).toEqual(['persist', 'send', 'persist'])
    await expect(fetch('https://api.apimart.ai/v1/videos/generations', options)).rejects.toThrow('C0_SAMPLE_OUTBOUND_REFUSED')
    await expect(fetch(endpoint, { ...options, body: JSON.stringify({ model: 'other' }) })).rejects.toThrow('C0_SAMPLE_MODEL_REFUSED')
    expect(ledger.requests).toHaveLength(1)
  })

  it('refuses before sending when a prior sample has exhausted the shared ledger', async () => {
    const quote = quotePlanSample(prices, 'gpt-5-nano', { planOnly: true })
    const fetch = planSampleFetch({ quote, ledger: { requests: [], reservedCny: 2 },
      persist: () => { throw new Error('must not persist') }, send: () => { throw new Error('must not send') } })
    await expect(fetch(endpoint, options)).rejects.toThrow('C0_BLOCKED_BUDGET')
    expect(() => quotePlanSample(new Map(), 'gpt-5-nano')).toThrow('C0_SAMPLE_PRICE_UNKNOWN')
  })
})
