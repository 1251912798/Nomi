import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'))
const plan = readFileSync(new URL('../../../docs/plan/2026-09-08-g1-use-case-suite.md', import.meta.url), 'utf8')
const fields = [
  'id', 'title', 'dimension', 'friction', 'user_quote', 'expected_experience',
  'surfaces', 'inputs', 'capabilities', 'status', 'status_reason', 'gaps', 'evidence', 'r30', 'budget_cny', 'emotion_log',
]
const statuses = ['runnable-now', 'needs-stage-4', 'capability-gap']
const dimensions = ['core', 'tools', 'mcp', 'skill', 'research', 'material', 'long-running']
const capabilities = ['工具', 'MCP', 'skill', '沙箱脚本', '浏览器', '生成模型', '剪辑', '导出']

function nonempty(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`)
  assert.ok(value.trim(), `${label} must not be empty`)
}

test('every case has complete, well-typed fields and a bounded budget', () => {
  assert.ok(Array.isArray(cases) && cases.length > 0, 'cases must be a nonempty array')
  for (const entry of cases) {
    for (const field of fields) assert.ok(Object.hasOwn(entry, field), `${entry.id}: missing ${field}`)
    assert.deepEqual(Object.keys(entry).sort(), [...fields].sort(), `${entry.id}: unexpected fields`)
    for (const field of fields.filter((key) => !['surfaces', 'inputs', 'capabilities', 'gaps', 'budget_cny'].includes(key))) {
      nonempty(entry[field], `${entry.id}.${field}`)
    }
    assert.match(entry.id, /^[A-Z][0-9]+$/, 'id must be a stable case code')
    assert.ok(statuses.includes(entry.status), `${entry.id}: invalid status`)
    assert.ok(dimensions.includes(entry.dimension), `${entry.id}: invalid dimension`)
    assert.ok(['applicable', 'not-applicable'].includes(entry.r30), `${entry.id}: invalid R30 applicability`)
    assert.ok(Array.isArray(entry.capabilities) && entry.capabilities.length > 0, `${entry.id}: capabilities required`)
    for (const capability of entry.capabilities) assert.ok(capabilities.includes(capability), `${entry.id}: unknown capability`)
    assert.ok(Number.isFinite(entry.budget_cny) && entry.budget_cny >= 0 && entry.budget_cny <= 5, `${entry.id}: budget must be 0–5 CNY`)
    assert.ok(Array.isArray(entry.gaps), `${entry.id}: gaps must be an array`)
    assert.equal(entry.gaps.length > 0, entry.status === 'capability-gap', `${entry.id}: status and gaps must agree`)
    for (const gap of entry.gaps) {
      assert.deepEqual(Object.keys(gap).sort(), ['id', 'missing', 'layer', 'disposition'].sort())
      for (const field of ['id', 'missing', 'layer']) nonempty(gap[field], `${entry.id}.gap.${field}`)
      assert.match(gap.id, /^G-[A-Z]+$/)
      assert.equal(gap.disposition, '先记录不做')
    }
  }
})

test('case ids are unique and every registered case has one document card', () => {
  assert.equal(new Set(cases.map(({ id }) => id)).size, cases.length, 'duplicate case ids')
  const headings = [...plan.matchAll(/^### ([A-Z][0-9]+) · (.+)$/gm)].map((match) => ({ id: match[1], title: match[2] }))
  assert.deepEqual(headings, cases.map(({ id, title }) => ({ id, title })), 'document cards must match registry order and titles')
})

test('C0 is the one runnable core case; every experience dimension has 2–4 cases', () => {
  const core = cases.filter(({ dimension }) => dimension === 'core')
  assert.equal(core.length, 1)
  assert.equal(core[0].id, 'C0')
  assert.equal(core[0].status, 'runnable-now')
  for (const dimension of dimensions.slice(1)) {
    const count = cases.filter((entry) => entry.dimension === dimension).length
    assert.ok(count >= 2 && count <= 4, `${dimension}: expected 2–4 cases, got ${count}`)
  }
  for (const entry of cases.filter(({ dimension }) => dimension === 'long-running')) {
    assert.equal(entry.status, 'needs-stage-4')
    assert.match(entry.status_reason, /goal-v1/)
  }
})

test('every capability gap is in section 4 with its owner and affected case, and no ledger row is orphaned', () => {
  const section = plan.match(/^## §4 缺口账本\n([\s\S]*?)(?=^## )/m)
  assert.ok(section, 'section 4 gap ledger is required')
  const rows = new Map()
  for (const line of section[1].split('\n').filter((value) => value.startsWith('| G-'))) {
    const [id, missing, layer, affected, stage] = line.split('|').slice(1, -1).map((cell) => cell.trim())
    assert.ok(!rows.has(id), `duplicate ledger gap ${id}`)
    for (const value of [missing, layer, affected, stage]) nonempty(value, `ledger ${id}`)
    rows.set(id, { layer, affected: affected.split(/[,、\s]+/), stage })
  }
  const registered = new Set()
  for (const entry of cases) {
    for (const gap of entry.gaps) {
      registered.add(gap.id)
      const row = rows.get(gap.id)
      assert.ok(row, `${entry.id}: ${gap.id} missing from section 4`)
      assert.equal(row.layer, gap.layer, `${gap.id}: owner mismatch`)
      assert.ok(row.affected.includes(entry.id), `${gap.id}: affected cases must include ${entry.id}`)
      assert.match(row.stage, /先记录不做/)
    }
  }
  assert.deepEqual([...rows.keys()].sort(), [...registered].sort(), 'ledger contains unregistered gaps')
  for (const [id, row] of rows) {
    const affected = cases.filter((entry) => entry.gaps.some((gap) => gap.id === id)).map((entry) => entry.id)
    assert.deepEqual([...row.affected].sort(), affected.sort(), `${id}: affected cases mismatch`)
  }
})

 test('every surface has at least three runnable input variations', () => {
  for (const surface of ['agent-panel','storyboard','canvas-node','timeline','export','settings','mcp','skill-library','prompt-library']) {
    const inputs = cases.flatMap(c => c.inputs.map(i => ({ ...i, id: c.id + '-' + i.id }))).filter(i => i.surface === surface && i.status === 'runnable-now')
    assert.ok(inputs.length >= 3, surface)
    assert.equal(new Set(inputs.map(i => i.id)).size, inputs.length)
  }
  for (const c of cases) for (const input of c.inputs) {
    assert.ok(c.surfaces.includes(input.surface))
    assert.ok(statuses.includes(input.status))
    nonempty(input.coverage, 'coverage')
    nonempty(input.reason, 'reason')
  }
  for (const surface of ['timeline', 'export', 'settings']) {
    const scenarios = new Set(cases.flatMap(c => c.inputs).filter(i => i.surface === surface && i.status === 'runnable-now').map(i => i.scenario))
    assert.ok(scenarios.size >= 3 && !scenarios.has(undefined), `${surface}: inputs must drive three distinct host states`)
  }
})
