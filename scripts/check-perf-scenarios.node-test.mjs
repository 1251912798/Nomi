// check:perf-scenarios 的必红 / 必绿测试 + 登记表库（统计、判定、PR 证据行）的单测。
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { makeTempDir } from './_test-temp.mjs'
import { DRIVERS, judge, loadScenarios, parsePerfEvidence, quantile, scenarioIds, summarizeRuns, validateScenarios } from './perf-scenarios-lib.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const SCRIPT = 'tests/perf/canvas-scale-bench.mjs'

const goodScenario = (overrides = {}) => ({
  id: 'sample-drag',
  feature: '样例：拖动多个节点',
  script: SCRIPT,
  args: ['--scales', 'I150', '--scenarios', 'drag-nodes-20'],
  scale: '150 个图片节点',
  metrics: ['frameGapP95', 'longTasks'],
  budget: 33,
  baseline: { median: 20, p95: 24, runs: 5, machine: 'test', date: '2026-10-11', commit: 'abc1234' },
  ...overrides,
})

function fixtureRoot(scenarios, { withScript = true } = {}) {
  const root = makeTempDir('nomi-perf-scenarios-')
  fs.mkdirSync(path.join(root, 'tests/perf/scenarios'), { recursive: true })
  if (withScript) {
    fs.mkdirSync(path.join(root, 'tests/perf'), { recursive: true })
    fs.writeFileSync(path.join(root, SCRIPT), '')
  }
  for (const [name, data] of Object.entries(scenarios)) fs.writeFileSync(path.join(root, 'tests/perf/scenarios', name), typeof data === 'string' ? data : JSON.stringify(data))
  return root
}
const runGate = (root) => spawnSync(process.execPath, [path.join(here, 'check-perf-scenarios.mjs')], { encoding: 'utf8', env: { ...process.env, PERF_SCENARIOS_REPO_ROOT: root } })

test('门岗必红：缺 baseline 的场景', () => {
  const { baseline, ...noBaseline } = goodScenario()
  const run = runGate(fixtureRoot({ 'sample-drag.json': noBaseline }))
  assert.equal(run.status, 1)
  assert.match(run.stderr, /缺 baseline/)
})

test('门岗必红：budget / baseline 不是数字、runs 不足 5', () => {
  const run = runGate(fixtureRoot({ 'sample-drag.json': goodScenario({ budget: '33ms', baseline: { median: '20', p95: 24, runs: 3, machine: 'm', date: 'd', commit: 'c' } }) }))
  assert.equal(run.status, 1)
  assert.match(run.stderr, /budget 必须是正数/)
  assert.match(run.stderr, /baseline\.median 必须是数字/)
  assert.match(run.stderr, /baseline\.runs 必须是数字且 ≥ 5/)
})

test('门岗必红：script 不存在、script 没有适配、id 与文件名不一致、id 重复', () => {
  const missing = runGate(fixtureRoot({ 'sample-drag.json': goodScenario() }, { withScript: false }))
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /script 不存在/)
  const root = fixtureRoot({
    'sample-drag.json': goodScenario(),
    'other.json': goodScenario({ id: 'sample-drag' }),
    'unadapted.json': goodScenario({ id: 'unadapted', script: 'tests/perf/handmade-profiler.mjs' }),
  })
  fs.writeFileSync(path.join(root, 'tests/perf/handmade-profiler.mjs'), '')
  const run = runGate(root)
  assert.equal(run.status, 1)
  assert.match(run.stderr, /文件名要和 id 一致/)
  assert.match(run.stderr, /重复/)
  assert.match(run.stderr, /还没有适配/)
})

test('门岗必红：metrics 量具量不出、args 自带 --runs', () => {
  const run = runGate(fixtureRoot({ 'sample-drag.json': goodScenario({ metrics: ['openToInteractive'], args: ['--runs', '3'] }) }))
  assert.equal(run.status, 1)
  assert.match(run.stderr, /量不出/)
  assert.match(run.stderr, /不要写 --runs/)
})

test('门岗必红：预算状态不认识、提议的预算没写依据', () => {
  const run = runGate(fixtureRoot({
    'sample-drag.json': goodScenario({ budgetStatus: 'maybe' }),
    'no-basis.json': goodScenario({ id: 'no-basis', budgetStatus: 'proposed' }),
  }))
  assert.equal(run.status, 1)
  assert.match(run.stderr, /budgetStatus 只能是/)
  assert.match(run.stderr, /budgetBasis 写依据/)
  const ok = runGate(fixtureRoot({ 'sample-drag.json': goodScenario({ budgetStatus: 'proposed', budgetBasis: '60Hz 下 p95 不超过两帧（33ms）' }) }))
  assert.equal(ok.status, 0, ok.stderr)
})

test('画布规模基准的读结果：工作台场景的响应与主进程往返按样本读出，缺的数不凑 0', () => {
  const payload = { results: [{ samples: [
    { frameP95Ms: 12, longTasks: 0, responseMs: 80, mainRoundTripMaxMs: 40 },
    { frameP95Ms: 14, longTasks: 1, responseMs: 95 },
  ] }] }
  const runs = DRIVERS['tests/perf/canvas-scale-bench.mjs'].readRuns(payload)
  assert.deepEqual(runs, { frameGapP95: [12, 14], longTasks: [0, 1], response: [80, 95], mainRoundTripMax: [40] })
  const open = DRIVERS['tests/ux/project-open-stages.e2e.mjs'].readRuns({ samples: [
    { kind: 'cold', clickToMediaMs: 900, longTaskCount: 2, backToLibraryMs: 210 },
    { kind: 'reopen', clickToMediaMs: 500, longTaskCount: 0 },
  ] })
  assert.deepEqual(open, { openToInteractive: [900], longTasks: [2], response: [210] })
})

test('门岗必绿：字段齐全的场景', () => {
  const run = runGate(fixtureRoot({ 'sample-drag.json': goodScenario() }))
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /1 个场景/)
})

test('仓库真实登记表通过门岗，且每个场景的量具都有适配', () => {
  const entries = loadScenarios(repoRoot)
  assert.ok(entries.length >= 2, '至少有两个种子场景')
  assert.deepEqual(validateScenarios(entries, { exists: (rel) => fs.existsSync(path.join(repoRoot, rel)) }), [])
  for (const entry of entries) assert.ok(DRIVERS[entry.data.script], entry.file)
})

test('统计：中位数与 p95 同 project-open-stages 的线性插值口径', () => {
  assert.equal(quantile([10, 20, 30, 40, 50], 0.5), 30)
  assert.equal(quantile([10, 20, 30, 40, 50], 0.95), 48)
  assert.deepEqual(summarizeRuns([5, null, 15, 25]), { runs: 3, median: 15, p95: 24 })
  assert.equal(quantile([], 0.5), null)
})

test('判定：超预算、退化 >20%、噪声基线只提示', () => {
  const scenario = goodScenario()
  assert.equal(judge(scenario, { median: 40, p95: 50 }).status, 'over-budget')
  assert.equal(judge(scenario, { median: 25, p95: 30 }).status, 'regression') // 比基线 20 差 25%
  assert.equal(judge(scenario, { median: 22, p95: 30 }).status, 'ok')
  assert.equal(judge(goodScenario({ baseline: { ...scenario.baseline, noisy: true } }), { median: 25, p95: 30 }).status, 'regression-noisy')
  assert.equal(judge(scenario, { median: null, p95: null }).status, 'no-data')
})

test('PR 证据行：格式、未验证不算通过、不适用要有理由、id 必须在登记表里', () => {
  const known = ['sample-drag']
  assert.deepEqual(parsePerfEvidence('- perf-scenario：sample-drag 中位数 20 / p95 24 / 预算 33', known), { ok: true, id: 'sample-drag' })
  assert.deepEqual(parsePerfEvidence('- perf-scenario: sample-drag 中位数 20ms / p95 24ms / 预算 33ms', known), { ok: true, id: 'sample-drag' })
  assert.equal(parsePerfEvidence('- perf-scenario：未验证：没有量具', known).ok, false)
  assert.match(parsePerfEvidence('- perf-scenario：未验证：没有量具', known).reason, /不接受「未验证」/)
  assert.equal(parsePerfEvidence('- perf-scenario：sample-drag 很快', known).ok, false)
  assert.equal(parsePerfEvidence('- perf-scenario：ghost 中位数 1 / p95 2 / 预算 3', known).ok, false)
  assert.equal(parsePerfEvidence('- perf-scenario：不适用：只改了一行文案', known).ok, true)
  assert.equal(parsePerfEvidence('- perf-scenario：不适用：无', known).ok, false)
  assert.deepEqual(scenarioIds([{ data: { id: 'a' } }, { data: null }]), ['a'])
})
