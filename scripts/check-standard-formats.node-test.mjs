// 外部格式对齐门岗自己的测试（R31）。喂假登记表和假仓库，不依赖真实存量——
// 门岗的测试如果只能跑真实登记表，它就只测得到「今天的存量」，测不到「明天新增一个自造格式会不会红」（R17）。
//
// 覆盖四条判据：
//   (a) 夹具必须存在，且必须有测试引用它；
//   (b) 未登记的外部格式解析入口报红（含棘轮只减不增）；
//   (c) 偏差没写理由报红；
//   (d) 债到期报红。
// 外加一条必须证明**不会**红的：登记齐全的格式与在册未到期的债一路绿。
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  coverageOf,
  evaluateFixtures,
  evaluateTouchpoints,
  looksLikeFormatName,
  scanSources,
  validateRegistry,
} from './standard-formats-lib.mjs'

const TODAY = '2026-09-07'

/** 一份最小的合法登记表：一个对齐了标准的外部格式 + 一个内部豁免。 */
function registry(overrides = {}) {
  return {
    formats: [
      {
        name: 'agent-skill',
        kind: 'external-standard',
        files: ['SKILL.md'],
        spec: 'https://code.claude.com/docs/en/skills',
        upstreamVersion: '2026-09-07',
        fixtures: ['tests/fixtures/standard-formats/agent-skill/SKILL.md'],
        readers: ['electron/skills/skillStore.ts'],
        writers: [],
      },
      {
        name: 'nomi-project-file',
        kind: 'internal',
        files: ['project.json'],
        why: '只被本机主进程读写，不导出、不给别的程序读',
        readers: ['electron/jsonFile.ts'],
        writers: ['electron/jsonFile.ts'],
      },
    ],
    ...overrides,
  }
}

const emptyBaseline = { debt: [] }

test('(a) 夹具不存在 / 没有测试引用它，两种都红', () => {
  const reg = registry()
  const missing = evaluateFixtures({
    registry: reg,
    fixtureExists: () => false,
    fixtureReferencedByTest: () => true,
  })
  assert.equal(missing.length, 1)
  assert.match(missing[0], /不存在/)

  const unread = evaluateFixtures({
    registry: reg,
    fixtureExists: () => true,
    fixtureReferencedByTest: () => false,
  })
  assert.equal(unread.length, 1)
  assert.match(unread[0], /没有任何测试引用它/)

  const ok = evaluateFixtures({
    registry: reg,
    fixtureExists: () => true,
    fixtureReferencedByTest: () => true,
  })
  assert.deepEqual(ok, [])
})

test('(a) 声称对齐标准却一份官方夹具都没有 → 登记表就不合法', () => {
  const reg = registry()
  delete reg.formats[0].fixtures
  const errors = validateRegistry(reg, { today: TODAY })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /缺官方夹具/)

  // 抓不到夹具是允许的**在途状态**，但必须登记成带到期日的债，不许静默省掉。
  reg.formats[0].debt = { what: '还没抓到官方样例', why: '上游文档在改版', plan: 'docs/x.md', due: '2026-10-07' }
  assert.deepEqual(validateRegistry(reg, { today: TODAY }), [])
})

test('(b) 启发式只认「别人也叫得出的名字」，认得出路径前缀与模板插值', () => {
  assert.equal(looksLikeFormatName('SKILL.md'), true)
  assert.equal(looksLikeFormatName('.mcp.json'), true)
  assert.equal(looksLikeFormatName('skill.json'), true)
  assert.equal(looksLikeFormatName('config.toml'), true)
  // 我们自己模块的私有产物不该被拦——噪音是门岗的死因（R17）。
  assert.equal(looksLikeFormatName('provider-adapters.json'), false)
  assert.equal(looksLikeFormatName('snapshot-v1.json'), false)

  const hits = scanSources(new Map([
    ['electron/a.ts', 'const x = JSON.parse(read(path.join(dir, "skill.json")))'],
    ['electron/b.ts', 'const y = JSON.parse(read(`${dir}/settings.json`))'],
    ['electron/c.ts', 'const z = JSON.parse(read("provider-adapters.json"))'],
    ['electron/d.ts', 'const w = read("skill.json") // 只读不解析，不算解析入口'],
    ['electron/e.ts', '// 注释里提到 "skill.json" 不算\nconst v = JSON.parse(read(other))'],
  ]))
  assert.deepEqual([...hits.keys()].sort(), [
    'settings.json::electron/b.ts',
    'skill.json::electron/a.ts',
  ])
})

test('(b) 未登记的解析入口报红；登记后转绿；基线只减不增', () => {
  const reg = registry()
  const covered = coverageOf(reg)
  const hits = scanSources(new Map([
    ['electron/skills/skillStore.ts', 'JSON.parse(read("SKILL.md")); JSON.parse(read("skill.json"))'],
  ]))

  const unregistered = evaluateTouchpoints({ hits, covered, baseline: emptyBaseline, today: TODAY })
  assert.equal(unregistered.length, 1)
  assert.match(unregistered[0], /未登记的外部格式解析入口/)
  assert.match(unregistered[0], /skill\.json/)

  // ① 登记进登记表 → 绿
  const withFormat = registry()
  withFormat.formats.push({
    name: 'nomi-skill-manifest',
    kind: 'non-aligned',
    files: ['skill.json'],
    spec: 'https://code.claude.com/docs/en/skills',
    upstreamVersion: '2026-09-07',
    readers: ['electron/skills/skillStore.ts'],
    writers: [],
    debt: { what: '平行文件', why: '在途收敛', plan: 'refactor/x', due: '2026-10-07' },
  })
  assert.deepEqual(
    evaluateTouchpoints({ hits, covered: coverageOf(withFormat), baseline: emptyBaseline, today: TODAY }),
    [],
  )

  // ② 登记进基线当债 → 也绿
  const baseline = { debt: [{ identity: 'skill.json::electron/skills/skillStore.ts', plan: 'docs/x.md', due: '2026-10-07' }] }
  assert.deepEqual(evaluateTouchpoints({ hits, covered, baseline, today: TODAY }), [])

  // ③ 债还清了却忘了删基线 → 红（棘轮只减不增）
  const stale = evaluateTouchpoints({ hits: new Map(), covered, baseline, today: TODAY })
  assert.equal(stale.length, 1)
  assert.match(stale[0], /棘轮只减不增/)
})

test('(c) 偏差缺 reason 报红；non-aligned 缺收敛债报红；nomi-defined 缺 searched 报红', () => {
  const noReason = registry()
  noReason.formats[0].deviations = [{ what: '只解析四个键' }]
  assert.match(validateRegistry(noReason, { today: TODAY })[0], /deviation 缺 reason/)

  const emptyReason = registry()
  emptyReason.formats[0].deviations = [{ what: '只解析四个键', reason: '   ' }]
  assert.match(validateRegistry(emptyReason, { today: TODAY })[0], /偏好不是理由/)

  const nonAligned = registry()
  nonAligned.formats.push({
    name: 'nomi-skill-manifest',
    kind: 'non-aligned',
    files: ['skill.json'],
    spec: 'https://code.claude.com/docs/en/skills',
    upstreamVersion: '2026-09-07',
    readers: ['electron/skills/skillStore.ts'],
  })
  assert.match(validateRegistry(nonAligned, { today: TODAY })[0], /必须绑一条带到期日的收敛债/)

  const selfMade = registry()
  selfMade.formats.push({
    name: 'nomi-skill-envelope',
    kind: 'nomi-defined',
    files: ['.nomiskill.json'],
    readers: ['electron/skills/skillPackage.ts'],
  })
  assert.match(validateRegistry(selfMade, { today: TODAY })[0], /必须写 searched/)
})

test('(d) 债到期报红——登记表里的偏差债和基线里的未登记债，两边都要过期就红', () => {
  const expired = registry()
  expired.formats[0].debt = { what: 'x', why: 'y', plan: 'docs/x.md', due: '2026-08-01' }
  const errors = validateRegistry(expired, { today: TODAY })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /到期仍未清/)

  const hits = scanSources(new Map([['electron/a.ts', 'JSON.parse(read("plugin.json"))']]))
  const baselineExpired = { debt: [{ identity: 'plugin.json::electron/a.ts', plan: 'docs/x.md', due: '2026-08-01' }] }
  const baselineErrors = evaluateTouchpoints({
    hits, covered: new Set(), baseline: baselineExpired, today: TODAY,
  })
  assert.equal(baselineErrors.length, 1)
  assert.match(baselineErrors[0], /到期仍未登记/)

  // 缺 plan / 缺 due 也红：欠账没有方案和到期日 = 永久豁免（R28）。
  const noPlan = { debt: [{ identity: 'plugin.json::electron/a.ts', due: '2026-10-07' }] }
  assert.match(
    evaluateTouchpoints({ hits, covered: new Set(), baseline: noPlan, today: TODAY })[0],
    /plan 必须指向收敛方案/,
  )
})

test('必须证明不会红的那条：登记齐全 + 债在册未过期 → 一条错都没有', () => {
  const reg = registry()
  reg.formats[0].deviations = [{ what: '只解析四个键', reason: '领域约束：Nomi 没有那套工具名空间' }]
  reg.formats.push({
    name: 'mcp-tool-json-schema',
    kind: 'external-standard',
    wire: true,
    files: [],
    wireContract: 'MCP tools/list 的 inputSchema',
    spec: 'https://json-schema.org/draft-07/schema',
    upstreamVersion: 'draft-07',
    readers: ['electron/capabilityCore/mcpArgValidation.ts'],
    debt: { what: '还没抓官方响应样例', why: '要连一次真实往返', plan: 'docs/x.md', due: '2026-10-07' },
  })
  assert.deepEqual(validateRegistry(reg, { today: TODAY }), [])
})
