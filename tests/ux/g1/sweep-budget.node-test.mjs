import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { reserveSweepRequest } from './sweep-budget.mjs'
import { attachRealText } from './sweep-real.mjs'
const quote = { textRequestUsd: .1, maxOutputTokens: 1024 }
const body = { model: 'gpt-5-nano', max_tokens: 1024 }
const url = 'https://api.apimart.ai/v1/chat/completions'
test('all attempts including concurrent retries reserve before dispatch and share the ceiling', async () => {
  const ledger = { reservedCny: 0, requests: [] }, persisted = []
  const attempt = async () => reserveSweepRequest({ url, method: 'POST', body, quote, ledger, budgetCny: 1,
    persist: () => persisted.push(structuredClone(ledger)) })
  const results = await Promise.allSettled([attempt(), attempt(), attempt()])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(ledger.requests.length, 1)
  assert.equal(persisted.length, 1)
  assert.ok(ledger.reservedCny <= 1)
})
test('media, foreign endpoints, unknown models and unknown budget cannot spend', () => {
  for (const variation of [
    { url: 'https://api.apimart.ai/v1/videos/generations' },
    { url: 'https://example.com/v1/chat/completions' },
    { url: url + '?redirect=1' }, { body: { ...body, model: 'unquoted' } },
    { body: { ...body, max_tokens: 2048 } }, { budgetCny: NaN }, { budgetCny: 4 },
  ]) {
    const ledger = { reservedCny: 0, requests: [] }
    assert.throws(() => reserveSweepRequest({ url, method: 'POST', body, quote, ledger, budgetCny: 3, persist() {}, ...variation }))
    assert.equal(ledger.reservedCny, 0)
    assert.equal(ledger.requests.length, 0)
  }
})
test('real-text bridge cleans executable scratch on both attachment success and failure', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-bridge-'))
  try {
    for (const fail of [false, true]) {
      const launched = { app: { async evaluate(_fn, options) {
        assert.equal(fs.existsSync(options.bridge), true)
        if (fail) throw Error('attach failed')
      } }, win: { async evaluate() {} } }
      const result = attachRealText(launched, { profile, quote, budgetCny: 3 })
      if (fail) await assert.rejects(result, /attach failed/)
      else await result
      assert.equal(fs.existsSync(path.join(profile, 'sweep-main.cjs')), false)
    }
  } finally { fs.rmSync(profile, { recursive: true, force: true }) }
})
