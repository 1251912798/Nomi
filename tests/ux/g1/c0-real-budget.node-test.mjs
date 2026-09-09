import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestQuote, reserve, assertAffordable, REAL_MODELS, BUDGET_CNY } from './c0-real-budget.mjs'
const quote = { textRequestUsd: .01, maxOutputTokens: 16000, videoPerSecondUsd: .0714, imageUsd: .010625 }
test('full H3 film fits the approved budget and over-budget estimates fail closed', () => {
  assert.doesNotThrow(() => assertAffordable({ totalUpperCny: 64 * quote.videoPerSecondUsd * 7 }))
  assert.doesNotThrow(() => assertAffordable({ totalUpperCny: BUDGET_CNY }))
  assert.throws(() => assertAffordable({ totalUpperCny: BUDGET_CNY + .001 }), /BLOCKED_BUDGET/)
  assert.throws(() => assertAffordable({ totalUpperCny: NaN }), /BLOCKED_BUDGET/)
})
test('unquoted models, paid routes, parameters and cross-origin destinations are refused', () => {
  const body = { model: REAL_MODELS.video, resolution: '768P', duration: 8, aspect_ratio: '16:9' }
  assert.equal(requestQuote('https://api.apimart.ai/v1/videos/generations', 'POST', body, quote).duration, 8)
  for (const patch of [{ model: 'unknown' }, { resolution: '2K' }, { duration: 15 }, { n: 2 }, { video_urls: ['https://example.org/x'] }])
    assert.throws(() => requestQuote('https://api.apimart.ai/v1/videos/generations', 'POST', { ...body, ...patch }, quote), /UNQUOTED/)
  assert.throws(() => requestQuote('https://other.example/v1/videos/generations', 'POST', body, quote), /REFUSED/)
  assert.throws(() => requestQuote('https://api.apimart.ai/v1/chat/completions', 'POST', { model: REAL_MODELS.text }, quote), /OUTPUT_LIMIT/)
})
test('in-flight requests and failures retain reservations; persistence fails before send', () => {
  const ledger = { reservedCny: 0, requests: [] }, written = []
  for (let i = 0; i < BUDGET_CNY; i++) reserve(ledger, { upperUsd: 1 / 7 }, (l) => written.push(l.reservedCny))
  assert.deepEqual(written, Array.from({ length: BUDGET_CNY }, (_, i) => i + 1))
  assert.throws(() => reserve(ledger, { upperUsd: .001 }, () => {}), /BLOCKED_BUDGET/)
  assert.equal(ledger.requests.length, BUDGET_CNY)
  assert.throws(() => reserve({ reservedCny: 0, requests: [] }, { upperUsd: .1 }, () => { throw new Error('disk-full') }), /disk-full/)
})

test('dispatch reserves before forwarding, preserves real responses and never retries a failed send', async () => {
  const { budgetedFetch } = await import('./c0-real-budget.mjs')
  const ledger = { reservedCny: 0, requests: [] }, sent = []
  let writes = 0
  const dispatch = budgetedFetch({ quote, ledger, persist: () => { writes++ }, send: async (url, init) => {
    assert.ok(writes > 0)
    sent.push({ url, body: JSON.parse(init.body), redirect: init.redirect })
    return new Response('upstream-content', { status: 201 })
  } })
  const body = { model: REAL_MODELS.text, messages: [{ role: 'user', content: 'hello' }] }
  const result = await dispatch('https://api.apimart.ai/v1/chat/completions', { method: 'POST', body: JSON.stringify(body) })
  assert.equal(await result.text(), 'upstream-content')
  assert.equal(result.status, 201)
  assert.equal(sent[0].body.max_tokens, quote.maxOutputTokens)
  assert.equal(sent[0].redirect, 'error')
  assert.equal(ledger.requests[0].httpStatus, 201)
  assert.equal(JSON.stringify(ledger).includes('hello'), false)
  const before = ledger.reservedCny
  const fail = budgetedFetch({ quote, ledger, persist: () => {}, send: async () => { throw new Error('sensitive upstream detail') } })
  await assert.rejects(fail('https://api.apimart.ai/v1/chat/completions', { method: 'POST', body: JSON.stringify(body) }),
    (error) => error.message === 'C0_PROVIDER_REQUEST_FAILED')
  assert.ok(ledger.reservedCny > before)
  assert.equal(ledger.requests.length, 2)
})


test('mixed dispatch caps each quoted text tier at 3 and never forwards media', async () => {
  const { createDispatchWrapper } = await import('./c0-real-main.mjs')
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixed-boundary-'))
  try {
    const file = path.join(dir, 'signal.mp4'); fs.writeFileSync(file, 'synthetic')
    for (const text of ['gpt-5-nano', 'deepseek-v4-pro']) {
      const ledger = { reservedCny: 0, requests: [] }; let sent = 0, persisted = false
      const quote = { planOnly: true, mediaDryRun: true, models: { text, video: 'MiniMax-H3' }, rates: { input: .1, output: 1 }, maxOutputTokens: 8192, budgetCny: 3 }
      const dispatch = createDispatchWrapper({ quote, ledger, persist: () => { persisted = true }, mediaFiles: [file], ledgerPath: path.join(dir, text) })(async (_url, init) => {
        assert.ok(persisted); sent++; assert.equal(JSON.parse(init.body).max_tokens, 8192); return new Response('native')
      })
      const post = body => ({ method: 'POST', body: JSON.stringify(body) })
      assert.equal(await (await dispatch('https://api.apimart.ai/v1/chat/completions', post({ model: text, max_tokens: 16000, messages: [] }))).text(), 'native')
      assert.equal((await (await dispatch('https://api.apimart.ai/v1/videos/generations', post({ model: 'MiniMax-H3', resolution: '768P', duration: 8 }))).json()).data[0].url, 'data:video/mp4;base64,c3ludGhldGlj')
      ledger.reservedCny = 3
      await assert.rejects(dispatch('https://api.apimart.ai/v1/chat/completions', post({ model: text })), /BLOCKED_BUDGET/)
      await assert.rejects(dispatch('https://api.apimart.ai/v1/images/generations', post({ model: 'gpt-image-2' })), /REFUSED/)
      assert.equal(sent, 1)
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('transport evidence retains raw errors, HTTP prefixes and pre-dispatch budget refusals', async () => {
  const { createDispatchWrapper } = await import('./c0-real-main.mjs')
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transport-evidence-'))
  try {
    const ledger = { reservedCny: 0, requests: [] }
    const quote = { planOnly: true, mediaDryRun: true, models: { text: 'gpt-5-nano' }, rates: { input: .1, output: 1 }, maxOutputTokens: 8192, budgetCny: 3 }
    const wrap = createDispatchWrapper({ quote, ledger, persist() {}, ledgerPath: path.join(dir, 'ledger.json') })
    const url = 'https://api.apimart.ai/v1/chat/completions'
    const post = () => ({ method: 'POST', body: JSON.stringify({ model: 'gpt-5-nano', stream: true }) })
    const raw = Object.assign(new Error('socket failed'), { cause: new Error('ECONNRESET original') })
    await assert.rejects(wrap(async () => { throw raw })(url, post()), error => error === raw)
    const response = await wrap(async () => new Response('x'.repeat(400), { status: 429 }))(url, post())
    assert.equal(await response.text(), 'x'.repeat(400))
    await new Promise(resolve => setImmediate(resolve))
    ledger.reservedCny = 3
    await assert.rejects(wrap(async () => { assert.fail('must not send') })(url, post()), /C0_BLOCKED_BUDGET/)
    const rows = JSON.parse(fs.readFileSync(path.join(dir, 'transport-evidence.json')))
    assert.equal(rows.length, 3)
    assert.equal(rows[0].exception.message, raw.message)
    assert.equal(rows[0].exception.stack, raw.stack)
    assert.equal(rows[0].exception.cause.message, raw.cause.message)
    assert.equal(rows[0].httpStatus, null)
    assert.equal(rows[1].httpStatus, 429)
    assert.equal(rows[1].bodyPrefix, 'x'.repeat(300))
    assert.equal(rows[2].dispatched, false)
    assert.equal(rows[2].localReason.message, 'C0_BLOCKED_BUDGET')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('transport cancellation records the original signal reason and lifecycle without replacing it', async () => {
  const { createTransportEvidence } = await import('./c0-real-main.mjs')
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transport-abort-'))
  try {
    const evidencePath = path.join(dir, 'transport-evidence.json')
    const observe = createTransportEvidence({ evidencePath, redact: s => String(s).replaceAll('fake-secret', '[REDACTED]') })
    const controller = new AbortController(), reason = new Error('fake-secret cancelled by test reload')
    let entered
    const ready = new Promise(resolve => { entered = resolve })
    const call = observe(async (_input, init) => {
      entered()
      return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
    }, 'globalFetch')('https://api.apimart.ai/v1/chat/completions', { method: 'POST', body: '{}', signal: controller.signal })
    await ready
    observe.markLifecycle('C0_COLLECT_STAGE02_FAILED_REPAIR_RELOAD')
    controller.abort(reason)
    await assert.rejects(call, error => error === reason)
    const [row] = JSON.parse(fs.readFileSync(evidencePath))
    assert.equal(row.httpStatus, null)
    assert.equal(row.bodyPrefix, null)
    assert.equal(row.exception.message, '[REDACTED] cancelled by test reload')
    assert.equal(row.abortReason.message, row.exception.message)
    assert.equal(row.lifecycleAtAbort.reason, 'C0_COLLECT_STAGE02_FAILED_REPAIR_RELOAD')
    assert.equal(fs.readFileSync(evidencePath, 'utf8').includes('fake-secret'), false)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('stage02 waits through reasoning and tool turns, but stops on approval or native terminal', async () => {
  const { plannerObservation } = await import('./sweep-c0.mjs')
  assert.equal(plannerObservation([], false).terminal, false)
  const call = { role: 'assistant', stopReason: 'toolUse', content: [{ type: 'toolCall', id: 'read', name: 'read_full_text' }] }
  assert.equal(plannerObservation([call], false).status, '工具调用中')
  assert.equal(plannerObservation([call, { role: 'toolResult', toolCallId: 'read' }], false).status, '推理中')
  assert.equal(plannerObservation([call], true).outcome, 'approval')
  for (const stopReason of ['stop', 'error', 'aborted', 'length']) {
    assert.equal(plannerObservation([{ role: 'assistant', stopReason }], false).outcome, stopReason)
  }
})

test('mixed preflight refusals are evidence even before reaching paid budget dispatch', async () => {
  const { createDispatchWrapper } = await import('./c0-real-main.mjs')
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transport-refused-'))
  try {
    const dispatch = createDispatchWrapper({ quote: { mediaDryRun: true }, ledger: {}, persist() {}, ledgerPath: path.join(dir, 'ledger.json') })(() => assert.fail('refusal must not dispatch'))
    await assert.rejects(dispatch('https://other.example/anything'), /C0_MIXED_OUTBOUND_REFUSED/)
    const [row] = JSON.parse(fs.readFileSync(path.join(dir, 'transport-evidence.json')))
    for (const field of ['httpStatus', 'bodyPrefix', 'elapsedMs', 'viaProxy', 'route', 'exception', 'localReason', 'abortReason']) assert.ok(Object.hasOwn(row, field), field)
    assert.equal(row.dispatched, false)
    assert.equal(row.localReason.message, 'C0_MIXED_OUTBOUND_REFUSED')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('planner wait polls through nonterminal state and returns at approval with a derived ceiling', async () => {
  const { waitForPlannerTerminal } = await import('./sweep-c0.mjs')
  const { stationTimeout } = await import('../_station-budget.mjs')
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-state-'))
  try {
    let samples = 0
    const result = await waitForPlannerTerminal({ projectRoot: dir, directory: dir,
      approval: { isVisible: async () => ++samples > 1 }, win: { evaluate: async () => {} } })
    assert.equal(result.outcome, 'approval')
    assert.equal(result.budget, stationTimeout({ turns: 1, operations: 0 }))
    assert.equal(result.budget, 300_000)
    const progress = fs.readFileSync(path.join(dir, 'planner-progress.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
    assert.equal(progress[0].terminal, false)
    assert.equal(progress.at(-1).final, true)
    fs.mkdirSync(path.join(dir, '.nomi/events'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.nomi/events/log-1.jsonl'), JSON.stringify({ type: 'agent.turn.error', payload: { status: 'error' } }) + '\n')
    await assert.rejects(waitForPlannerTerminal({ projectRoot: dir, directory: dir,
      approval: { isVisible: async () => false }, win: { evaluate: async () => {} } }), /TERMINAL_WITHOUT_APPROVAL/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('export completion ignores decodable temporary files until atomic publication', async () => {
  const { completedExports } = await import('./sweep-timeline.mjs')
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-terminal-'))
  try {
    fs.mkdirSync(path.join(dir, 'exports'))
    const temporary = path.join(dir, 'exports/film.partial.mp4'), final = path.join(dir, 'exports/film.mp4')
    fs.writeFileSync(temporary, 'writing')
    assert.deepEqual(completedExports(dir), [])
    fs.renameSync(temporary, final)
    assert.deepEqual(completedExports(dir), [path.join('exports', 'film.mp4')])
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
