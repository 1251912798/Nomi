// `check:walkthrough-tool-args` 的阳性对照（R17：加规则必须先验它会红）。
//
// 阳性 1 逐字用的是 2026-09-18 的真实事故文本（`golden-path.e2e.mjs` 在 #814 改名后
// 还写着 `modelKey`，CI 报「草稿没有落成 3 个镜头节点」）。判据只有对着真事故红过，才算接住了它。
import assert from 'node:assert/strict'
import test from 'node:test'
import { collectWalkthroughToolArgViolations } from './walkthrough-tool-args-lib.mjs'

// 真相视图由调用方注入，正如生产里由 `MODEL_FACING_TOOL_SPECS` 派生。
const schemas = {
  draft_shots: {
    type: 'object', additionalProperties: false,
    properties: {
      operationId: { type: 'string' },
      shots: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: { title: { type: 'string' }, prompt: { type: 'string' }, modelId: { type: 'string' }, taskKind: { type: 'string' } },
        },
      },
    },
  },
  edit_timeline: {
    type: 'object', additionalProperties: false,
    properties: { baseRevision: { type: 'string' }, summary: { type: 'string' } },
  },
  // 宿主自己开了口子的一层：多余的键不算违规。
  make_artifact: {
    type: 'object', additionalProperties: true,
    properties: { title: { type: 'string' } },
  },
}
const run = (text) => collectWalkthroughToolArgViolations([{ path: 'tests/ux/probe.mjs', text }], schemas)

test('阳性 1 · 事故原句：#814 改名后走查还写 modelKey，嵌在 shots[] 里', () => {
  const result = run(`
    planCall.release({ type: 'tool', id: PLAN, name: 'draft_shots', args: {
      shots: SHOT_PROMPTS.map((prompt, position) => ({
        title: SHOT_TITLES[position], taskKind: 'text_to_image', modelKey: FIXTURE_IMAGE_MODEL, prompt,
      })),
    } })
  `)
  assert.equal(result.violations.length, 1)
  assert.equal(result.violations[0].verb, 'draft_shots')
  assert.equal(result.violations[0].key, 'shots[].modelKey', '必须报出嵌套路径——顶层扫一遍是抓不到这个 bug 的')
})

test('阳性 2 · 顶层键改名：revision → baseRevision', () => {
  const result = run(`call.release({ type: 'tool', name: 'edit_timeline', args: { revision: r, summary: 's' } })`)
  assert.equal(result.violations.length, 1)
  assert.equal(result.violations[0].key, 'revision')
})

test('阴性 1 · 改对了就不红', () => {
  const result = run(`
    planCall.release({ type: 'tool', id: PLAN, name: 'draft_shots', args: {
      shots: [{ title: 't', taskKind: 'text_to_image', modelId: M, prompt: 'p' }],
    } })
  `)
  assert.deepEqual(result.violations, [])
  assert.ok(result.checked > 0, '不红必须是「比对过且都对」，不能是「一个键都没扫到」')
})

test('阴性 2 · additionalProperties:true 的层，多余键是宿主允许的，不红', () => {
  const result = run(`call.release({ type: 'tool', name: 'make_artifact', args: { title: 't', whatever: 1 } })`)
  assert.deepEqual(result.violations, [])
})

test('阴性 3 · 不认识的动词名不管（那归 check:mcp-tool-refs 扫悬空名）', () => {
  const result = run(`call.release({ type: 'tool', name: 'some_helper', args: { anything: 1 } })`)
  assert.deepEqual(result.violations, [])
  assert.equal(result.sites, 0)
})

test('如实记账 · args 是变量时记成「没查」，不算绿', () => {
  const result = run(`call.release({ type: 'tool', name: 'draft_shots', args: createArgs })`)
  assert.deepEqual(result.violations, [])
  assert.equal(result.skipped.length, 1)
  assert.equal(result.skipped[0].reason, 'non-literal-args')
})

test('空转守卫的原料 · 什么都没扫到时 sites/checked 必须是 0，好让调用方红', () => {
  const result = run(`const x = 1`)
  assert.equal(result.sites, 0)
  assert.equal(result.checked, 0)
})

test('登记 · 故意给错的键：紧贴的登记注释（键名一致、理由非空）才放行，并如实记进 allowed', () => {
  const result = run(`
    call.release({ type: 'tool', name: 'draft_shots', args: { shots: [{ title: 't', /* walkthrough-tool-args: intentional-bad-key variant — 演自纠：真模型就把变体写进了这里 */ variant: 'fast' }] } })
  `)
  assert.equal(result.violations.length, 0)
  assert.equal(result.allowed.length, 1)
  assert.equal(result.allowed[0].key, 'shots[].variant')
  assert.match(result.allowed[0].reason, /自纠/)
})

test('登记 · 阴性：没有理由 / 键名对不上 / 登记在别的键上，都不放行；登记不沾光给别的坏键', () => {
  const noReason = run(`call.release({ name: 'draft_shots', args: { shots: [{ /* walkthrough-tool-args: intentional-bad-key variant — */ variant: 'fast' }] } })`)
  assert.equal(noReason.violations.length, 1)
  const wrongKey = run(`call.release({ name: 'draft_shots', args: { shots: [{ /* walkthrough-tool-args: intentional-bad-key other — 理由 */ variant: 'fast' }] } })`)
  assert.equal(wrongKey.violations.length, 1)
  const neighbour = run(`call.release({ name: 'draft_shots', args: { shots: [{ /* walkthrough-tool-args: intentional-bad-key variant — 理由 */ variant: 'fast', modelKey: 'x' }] } })`)
  assert.equal(neighbour.violations.length, 1)
  assert.equal(neighbour.violations[0].key, 'shots[].modelKey')
})
