import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateUxScenarios } from './scenarios.mjs'
import { machineFromRun, renderScorecard, validateScorecard } from './scorecard.mjs'

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const catalog = readJson('tests/ux/journeys/catalog.json')
const exists = (file) => fs.existsSync(path.join(root, file))
const clone = (value) => JSON.parse(JSON.stringify(value))

test('场景清单：真目录通过，8–12 条，候选和可执行都有', () => {
  assert.deepEqual(validateUxScenarios(catalog, { fileExists: exists }), [])
  assert.ok(catalog.scenarios.length >= 8 && catalog.scenarios.length <= 12)
  assert.ok(catalog.scenarios.some((s) => s.status === 'research-candidate'))
  assert.ok(catalog.scenarios.some((s) => s.status === 'executable'))
})

test('场景清单：候选不进 journeys（旧 runner 只读 journeys，不会执行候选）', () => {
  const candidates = new Set(catalog.scenarios.filter((s) => s.status === 'research-candidate').map((s) => s.id))
  for (const journey of catalog.journeys) assert.equal(candidates.has(journey.id), false, journey.id)
})

test('场景清单：坏例必须红', () => {
  const bad = (mutate) => {
    const c = clone(catalog)
    mutate(c)
    return validateUxScenarios(c, { fileExists: exists })
  }
  assert.match(bad((c) => delete c.scenarios[0].failureGuard).join('\n'), /failureGuard/)
  assert.match(bad((c) => (c.scenarios[0].source = { kind: '拍脑袋', ref: 'x' })).join('\n'), /source/)
  assert.match(bad((c) => (c.scenarios[0].frequencyEvidence = '高频')).join('\n'), /高频/)
  assert.match(bad((c) => (c.scenarios[0].status = 'done')).join('\n'), /status/)
  assert.match(bad((c) => (c.scenarios[0].journey = 'agent-panel-nope')).join('\n'), /journey/)
  assert.match(bad((c) => (c.scenarios[0].id = c.scenarios[1].id)).join('\n'), /id 重复/)
  const candidate = (c) => c.scenarios.find((s) => s.status === 'research-candidate')
  assert.match(bad((c) => (candidate(c).walk = 'tests/ux/contextual-node-guidance.walk.mjs')).join('\n'), /研究候选不能挂/)
  assert.match(bad((c) => c.scenarios.push(...Array.from({ length: 5 }, (_, i) => ({ ...clone(c.scenarios[0]), id: `extra-${i}` })))).join('\n'), /上限/)
  assert.match(validateUxScenarios({ journeys: [], scenarios: [{ ...clone(catalog.scenarios.find((s) => s.walk)), walk: 'tests/ux/not-there.walk.mjs' }] }, { fileExists: exists }).join('\n'), /walk/)
})

const cards = ['pr1264-rewrite', 'pr1181-node-guidance'].map((name) => ({ name, file: `docs/evidence/2026-10-21-ux-scorecard/${name}.scorecard` }))

test('成绩单样例：合格，且页面就是记录渲染出来的（不许手改页面）', () => {
  for (const { file } of cards) {
    const card = readJson(`${file}.json`)
    assert.deepEqual(validateScorecard(card), [], file)
    assert.equal(fs.readFileSync(path.join(root, `${file}.md`), 'utf8'), renderScorecard(card), file)
    assert.ok(catalog.scenarios.some((s) => s.id === card.scenarioId), `${file} 的场景 id 不在清单里`)
  }
})

test('成绩单样例：没有真人数据时是 null，不是 AI 填的数；失败保留', () => {
  for (const { file } of cards) {
    const card = readJson(`${file}.json`)
    assert.equal(card.human.seq, null)
    assert.deepEqual(Object.values(card.human.events), [null, null, null, null])
    assert.ok(card.machine.attempts.some((a) => a.result === 'fail'), `${file} 没有保留失败`)
  }
})

test('成绩单：不出总分、AI 不能打 SEQ、失败不能没有后果、没采的指标要说为什么', () => {
  const base = readJson(`${cards[0].file}.json`)
  const problems = (mutate) => {
    const card = clone(base)
    mutate(card)
    return validateScorecard(card).join('\n')
  }
  assert.match(problems((c) => (c.overall = 5.5)), /总分/)
  assert.match(problems((c) => (c.total = 12)), /总分/)
  assert.match(problems((c) => (c.human.seq = [{ participant: 'agent', task: 'x', score: 6, rater: 'ai' }])), /AI 不许替人打分/)
  assert.match(problems((c) => (c.human.seq = [{ participant: 'p1', task: 'x', score: 9, rater: 'human' }])), /1–7/)
  assert.equal(problems((c) => (c.human.seq = [{ participant: 'p1', task: 'x', score: 5, rater: 'human' }])), '')
  assert.match(problems((c) => delete c.human), /human/)
  assert.match(problems((c) => (c.machine.attempts[1].note = '')), /失败了/)
  assert.match(problems((c) => (c.machine.metrics[2].note = '')), /没采到/)
  assert.match(problems((c) => (c.machine.metrics[0].basis = 'vibes')), /basis/)
  assert.match(problems((c) => (c.human.events.misclicks = 3)), /observer/)
  assert.match(problems((c) => (c.machine.attempts = [])), /attempts/)
})

test('成绩单：人工事件有数时才显示数；SEQ 有真人分才显示分', () => {
  const card = readJson(`${cards[0].file}.json`)
  card.human = { seq: [{ participant: 'p1', task: card.scenarioId, score: 5, rater: 'human' }], events: { misclicks: 1, backtracks: 0, helpRequests: 0, firstAttemptSuccess: { n: 1, d: 3 } }, observer: '协调会话' }
  const page = renderScorecard(card)
  assert.match(page, /SEQ（1–7）：5，参与者 p1/)
  assert.match(page, /首次尝试成功：1 \/ 3（真人观察）/)
  assert.doesNotMatch(page, /总分[:：]s*d|综合分/)
})

test('采集器接入：machineFromRun 保留失败步骤和没走到的步骤，完成数不虚高', () => {
  const dom = { viewport: { width: 1440, height: 842, dpr: 1 }, theme: 'light' }
  const step = (id, status, extra = {}) => ({ id, status, before: { dom }, metrics: { clicks: 1, inputs: 0, keys: 0, panelSwitches: 0, confirmations: 0, completionMs: 100, feedbackMs: null }, ...extra })
  const run = {
    status: 'failed',
    error: 'boom',
    expectedSteps: ['a', 'b', 'c'],
    identity: { runId: 'r1', applicationSha: 'abc', compatibility: { platform: 'win32' } },
    steps: [step('a', 'completed'), step('b', 'failed', { error: 'button missing' })],
  }
  const machine = machineFromRun(run)
  assert.equal(machine.source, 'collector')
  assert.deepEqual(machine.attempts.map((a) => [a.label, a.result]), [['a', 'pass'], ['b', 'fail'], ['c', 'fail'], ['成功终点断言', 'fail']])
  assert.equal(machine.metrics.find((m) => m.name === '点击').current, 2)
  assert.equal(machine.metrics.find((m) => m.name === '最慢的一步反馈').current, null)
  assert.ok(machine.metrics.every((m) => m.basis === 'measured' && m.n === 1))
  assert.equal(machine.env.window, '1440×842@1')
})
