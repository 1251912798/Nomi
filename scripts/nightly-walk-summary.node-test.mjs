import { makeTempDir } from './_test-temp.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILD_GATE_STATUS, BUILD_GATE_WALK } from './nightly-build-gate.mjs'
import { ENV_SIGNATURES, ISSUE_TITLE, ISSUE_TITLE_RED, WAKE_FAIL_COUNT, WAKE_FAIL_RATE, classifyRow, makeLogReader, summarizeRows, updateIssue, wakeVerdict } from './nightly-walk-summary.mjs'

const row = (walk, status = 1, log = `${walk}.log`) => ({ walk, status, seconds: 3, log })
const passing = (n) => Array.from({ length: n }, (_, i) => row(`p${i}.walk.mjs`, 0))
const failing = (n, prefix = 'f') => Array.from({ length: n }, (_, i) => row(`${prefix}${i}.walk.mjs`))

test('skipped exit 125 is separate from failures and not in the denominator', () => {
  const { failed, skipped, markdown, total } = summarizeRows([row('a.walk.mjs', 0), row('b.walk.mjs', 125), row('c.walk.mjs', 124)], () => 'boom')
  assert.deepEqual(skipped.map((r) => r.walk), ['b.walk.mjs'])
  assert.deepEqual(failed.map((r) => r.walk), ['c.walk.mjs'])
  assert.equal(total, 2)
  assert.match(markdown, /2\/3 passed; 1 failed; 1 skipped/)
  assert.match(markdown, /b\.walk\.mjs \| skipped/)
  assert.match(markdown, /c\.walk\.mjs \| 124/)
})

test('build-gate row is its own column and always wakes', () => {
  const { columns, wake, markdown } = summarizeRows([row(BUILD_GATE_WALK, BUILD_GATE_STATUS), ...passing(5)])
  assert.equal(columns.gate.length, 1)
  assert.equal(columns.product.length, 0)
  assert.equal(wake.red, true)
  assert.match(markdown, /夜跑整体红.*构建门失败/)
  assert.match(markdown, /### 构建 \/ 门岗（1）/)
})

test('legacy assertFreshBuild failures (10-22 shape) land in the gate column', () => {
  const log = 'Error: 构建产物比源码旧（或没有构建），先跑 pnpm run build'
  assert.equal(classifyRow(row('x.walk.mjs'), log).kind, 'gate')
})

test('every environment signature classifies a fixture log as environment', () => {
  const fixtures = {
    'local-server-refused': 'Error: connect ECONNREFUSED 127.0.0.1:5173',
    'hardcoded-mac-path': "ENOENT: no such file or directory, open '/Users/aoqimin/Documents/Nomi Projects/x/.nomi/project.json'",
    'module-not-found': "Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'x'",
    'real-config-missing': 'model-catalog.json ENOENT',
    'real-media-missing': "ENOENT: no such file '/home/runner/Movies/real-media'",
  }
  assert.deepEqual(Object.keys(fixtures).sort(), ENV_SIGNATURES.map((e) => e.id).sort(), '特征表新增条目要补夹具')
  for (const [id, log] of Object.entries(fixtures)) assert.equal(classifyRow(row('x.walk.mjs'), log).kind, 'env', id)
})

test('unknown failures, timeouts and missing logs are product; missing log is labelled', () => {
  assert.deepEqual(classifyRow(row('x.walk.mjs'), 'AssertionError: expected 1'), { kind: 'product', reason: '' })
  assert.equal(classifyRow(row('x.walk.mjs', 124), 'still running').reason, '超时')
  assert.deepEqual(classifyRow(row('x.walk.mjs'), null), { kind: 'product', reason: '无日志' })
})

test('wake thresholds: boundaries of count and rate, zero failures, skipped excluded', () => {
  assert.equal(wakeVerdict({ failed: 0, total: 100, gate: 0 }).red, false)
  assert.equal(wakeVerdict({ failed: WAKE_FAIL_COUNT, total: 1000, gate: 0 }).red, false)
  assert.equal(wakeVerdict({ failed: WAKE_FAIL_COUNT + 1, total: 1000, gate: 0 }).red, true)
  assert.equal(wakeVerdict({ failed: 2, total: 10, gate: 0 }).red, false) // 恰 20%
  assert.equal(wakeVerdict({ failed: 3, total: 11, gate: 0 }).red, true) // 27%
  assert.equal(WAKE_FAIL_RATE, 0.2)
  const quiet = summarizeRows([...failing(2), ...passing(8), ...Array.from({ length: 50 }, (_, i) => row(`s${i}.walk.mjs`, 125))])
  assert.equal(quiet.wake.red, false)
})

test('10-22 shape (307 of 335 failed, 292 gate) is overall red with the split visible', () => {
  const rows = [...Array.from({ length: 292 }, (_, i) => row(`g${i}.walk.mjs`)), ...failing(15), ...passing(28)]
  const { columns, wake, markdown } = summarizeRows(rows, (r) => (r.walk.startsWith('g') ? '构建产物比源码旧' : 'assert'))
  assert.deepEqual([columns.gate.length, columns.env.length, columns.product.length], [292, 0, 15])
  assert.equal(wake.red, true)
  assert.match(markdown, /失败分栏：构建 \/ 门岗 292，环境 0，产品 15/)
  assert.doesNotMatch(markdown, /p0\.walk\.mjs/, '通过的只计数不逐行')
})

function fakeGh(existing) {
  const calls = []
  const run = (args) => { calls.push(args); return args[1] === 'list' ? JSON.stringify(existing) : '' }
  return { calls, run }
}

test('overall red retitles the existing issue via edit and never creates a second one', () => {
  const result = summarizeRows([...failing(40), ...passing(5)])
  const { calls, run } = fakeGh([{ number: 7, title: ISSUE_TITLE }])
  updateIssue({ result, repo: 'o/r', run })
  const edit = calls.find((a) => a[1] === 'edit')
  assert.ok(edit)
  assert.equal(edit[edit.indexOf('--title') + 1], ISSUE_TITLE_RED)
  assert.equal(calls.some((a) => a[1] === 'create'), false)
  assert.ok(calls[0].includes(`${ISSUE_TITLE} in:title`))
})

test('not red keeps the base title; no existing issue creates one; recovery only comments', () => {
  const small = summarizeRows([...failing(1), ...passing(20)])
  const a = fakeGh([{ number: 7, title: ISSUE_TITLE_RED }])
  updateIssue({ result: small, repo: 'o/r', run: a.run })
  assert.equal(a.calls.find((c) => c[1] === 'edit')[a.calls.find((c) => c[1] === 'edit').indexOf('--title') + 1], ISSUE_TITLE)
  const b = fakeGh([])
  updateIssue({ result: small, repo: 'o/r', run: b.run })
  assert.ok(b.calls.some((c) => c[1] === 'create'))
  const c = fakeGh([{ number: 7, title: ISSUE_TITLE }])
  updateIssue({ result: summarizeRows(passing(3)), repo: 'o/r', run: c.run })
  assert.deepEqual(c.calls.map((x) => x[1]), ['list', 'comment'])
})

test('makeLogReader finds flattened artifact logs by file name and returns null when absent', () => {
  const root = makeTempDir('nomi-nightly-logs-')
  fs.writeFileSync(path.join(root, 'a.walk.mjs.log'), 'hello')
  const read = makeLogReader(root)
  assert.equal(read({ log: 'nightly-walks/a.walk.mjs.log' }), 'hello')
  assert.equal(read({ log: 'nightly-walks/missing.log' }), null)
  fs.rmSync(root, { recursive: true, force: true })
})
