// `check:model-schema` 的**规则自测**（R17：加规则必须先验它会红）。
//
// 门岗最危险的失败方向是**假绿**：规则写错了、永远不命中，而 CI 一片绿——
// 「缺失的门岗和从未存在过的门岗，在 CI 输出里长得一模一样」。所以每条规则都配一个
// **阳性对照**：一份刻意违规的 schema，断言它被抓到；再配一份合法的近邻，
// 断言它没被误伤。少了后者，一个「什么都判红」的规则也能通过。
//
// 这里测的是规则本体（`modelVisibleJsonSchema.ts` 的三个 collector），不是棘轮的读写——
// 棘轮那半是文件 IO，测它只会测到 `fs`。
import assert from 'node:assert/strict'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

// 本文件由 `pnpm exec tsx --test` 跑（见 package.json 的 `check:model-schema`）——
// 规则本体是 TS，而仓库里其余 node-test 走的是 `.mjs` 库。与其为了迁就 runner 把规则
// 抄一份 `.mjs`（那就是第二个真相源，正是本 PR 在消灭的东西），不如换 runner。
const rules = await import(
  pathToFileURL(path.join(repoRoot, 'electron/shared/agentCapabilities/modelVisibleJsonSchema.ts')).href
)

function structural(schema) {
  const out = []
  rules.collectStructuralFailures(schema, '', out)
  return out
}

function vendor(schema) {
  const out = []
  rules.collectVendorCompatibilityFailures(schema, '', out)
  return out
}

test('empty schema {} 被抓到；显式的空对象不被误伤', () => {
  assert.equal(structural({}).length, 1, '`{}` 说的是「随便填」——这正是 canvas.write 0/18 的形状')
  // 阳性对照的对偶：一个**不收参数**的工具是合法的，判它红会逼作者去编一个假字段。
  assert.deepEqual(structural({ type: 'object', properties: {}, additionalProperties: false }), [])
})

test('没有 items 的数组被抓到；有 items 的不被误伤', () => {
  assert.equal(structural({ type: 'array' }).length, 1)
  assert.deepEqual(structural({ type: 'array', items: { type: 'string' } }), [])
})

test('值也没类型的开放对象被抓到；值有类型的开放对象不被误伤', () => {
  // `z.record(z.unknown())` 的产物：键名开放、值「随便什么都行」。
  assert.equal(structural({ type: 'object', additionalProperties: {} }).length, 2)
  // `z.record(z.enum([...]))` 的产物：键名确实不可枚举（参数名由模型档案决定），但值说清了。
  // 把它一并判红会逼作者编一份假的键名清单——那比 `{}` 更糟，因为它看起来很具体。
  assert.deepEqual(structural({ type: 'object', additionalProperties: { type: 'string' } }), [])
})

test('根级 anyOf 被抓到；扁平对象不被误伤（G-01）', () => {
  const found = vendor({ anyOf: [{ type: 'object' }, { type: 'object' }] })
  assert.equal(found.length, 1)
  assert.match(found[0], /Anthropic/, '报错要说清「为什么这条在真机上会静默失效」，不是只说不合法')
  assert.deepEqual(vendor({ type: 'object', properties: { operation: { type: 'string', enum: ['a', 'b'] } } }), [])
})

test('任意位置的 const 被抓到；enum 形态不被误伤（G-05）', () => {
  assert.equal(vendor({ type: 'object', properties: { kind: { const: 'all' } } }).length, 1)
  // 上游 `StringEnum()` 的等价物就是这个形状——它必须通过，否则规则等于禁掉了正确写法。
  assert.deepEqual(vendor({ type: 'object', properties: { kind: { type: 'string', enum: ['all'] } } }), [])
})

test('`enum` 数组里的字符串不会被误当成 const', () => {
  // 判据要走 schema 结构，不能是「JSON 里出现了 const 这五个字母」。
  assert.deepEqual(vendor({ type: 'object', properties: { kind: { type: 'string', enum: ['const'] } } }), [])
})

test('运输分支（T1 的 JSON 文本那一支）不进模型可见 schema', async () => {
  const { z } = await import('zod')
  const { jsonTolerantArray } = await import(
    pathToFileURL(path.join(repoRoot, 'electron/shared/agentCapabilities/jsonArgTolerance.ts')).href
  )
  const schema = z.object({ nodes: jsonTolerantArray(z.array(z.object({ id: z.string() }).strict())) }).strict()
  const published = rules.toPublishedJsonSchema(schema)
  const nodes = published.properties.nodes
  assert.equal(nodes.anyOf, undefined, '字段级 anyOf 在 Google legacy 路径上同样不被支持')
  assert.equal(nodes.type, 'array', '留下的必须是结构化那一支，不是一元 anyOf 壳')
  // 阳性对照：不带运输分支的普通 union 不该被这条规则动。
  // （用两个 object 分支，不用 `string | number`——后者会被 zod-to-json-schema 优化成
  //  `{"type":["string","number"]}`，根本不产生 anyOf，那样这条对照就什么也没验到。）
  const plain = rules.toPublishedJsonSchema(
    z.object({ v: z.union([z.object({ a: z.string() }).strict(), z.object({ b: z.string() }).strict()]) }).strict(),
  )
  assert.equal(plain.properties.v.anyOf.length, 2, '只摘运输分支，不是见 anyOf 就拆')
})

// ── profile-schema-drift（阶段 5a 新增规则的阳性对照） ────────────────────────
//
// 这条规则量的不是「一个工具写得好不好」，是**两份说明书之间**的关系——所以它的假绿方式
// 也不一样：一个永远返回空数组的比较函数，和一个真在比的比较函数，在 CI 里长得一模一样。
// 下面每条都先证明它会红，再证明合法的近邻不被误伤。

const facing = await import(
  pathToFileURL(path.join(repoRoot, 'electron/shared/agentCapabilities/modelFacingTools.ts')).href
)

const objectSchema = (properties, required) => ({
  type: 'object', properties, ...(required ? { required } : {}), additionalProperties: false,
})

test('两个 profile 的同名别名 schema 不同 → 抓到；相同 → 不误伤', () => {
  const internal = { read_full_text: objectSchema({ content: { type: 'string', minLength: 1 } }, ['content']) }
  // 阳性对照 ①：MCP 侧手改一个字段名（`content` → `text`）——这正是「外部宿主拿到的说明书
  // 比内部的旧一点」在字节上的样子，而阶段 5a 之前没有任何东西会因此报错。
  const renamed = { read_full_text: objectSchema({ text: { type: 'string', minLength: 1 } }, ['text']) }
  const drift = facing.profileDriftBetween(internal, renamed)
  assert.equal(drift.length, 1)
  assert.match(drift[0], /read_full_text/, '报错要说清是哪个别名漂了，"schema 漂移了" 救不了任何人')
  assert.match(drift[0], /internal =/)
  assert.match(drift[0], /mcp {6}=/)

  // 阳性对照 ②：把一条约束**放松**（minLength 去掉）——比改名更隐蔽，一样要红。
  assert.equal(
    facing.profileDriftBetween(internal, { read_full_text: objectSchema({ content: { type: 'string' } }, ['content']) }).length,
    1,
  )
  // 对照的对偶：逐字相同（键序不同也算相同）不被误伤，否则规则等于禁掉了同源本身。
  assert.deepEqual(
    facing.profileDriftBetween(internal, {
      read_full_text: { additionalProperties: false, required: ['content'], properties: { content: { minLength: 1, type: 'string' } }, type: 'object' },
    }),
    [],
  )
})

test('一个别名只在一边存在 → 抓到，且说清少在哪一边', () => {
  const both = { a: objectSchema({}), b: objectSchema({}) }
  assert.match(facing.profileDriftBetween(both, { a: objectSchema({}) })[0], /b：只在内部 profile 上存在/)
  assert.match(facing.profileDriftBetween({ a: objectSchema({}) }, both)[0], /b：只在对外 MCP 上存在/)
})

test('广播出去的 inputSchema 必须是共享描述符算出来的那份（手写一份即红）', async () => {
  const registry = await import(
    pathToFileURL(path.join(repoRoot, 'electron/shared/agentCapabilities/modelFacingToolRegistry.ts')).href
  )
  const contracts = await import(
    pathToFileURL(path.join(repoRoot, 'electron/shared/agentCapabilities/registry.ts')).href
  )
  const tool = registry.mcpProfileTools().find((candidate) => candidate.contractId === 'document.read')
  const contract = contracts.CAPABILITY_CONTRACTS.find((candidate) => candidate.id === 'document.read')
  assert.ok(tool && contract)

  // 对照的对偶：真正广播出去的那份是算出来的 → 不红。
  assert.equal(facing.mcpProjectionDrift(contract, tool.specs, tool.inputSchema), undefined)
  // 阳性对照：在枚举里悄悄多塞一个值（对外多认一个动作，内部没有）。
  const tampered = JSON.parse(JSON.stringify(tool.inputSchema))
  tampered.properties.scope.enum = [...tampered.properties.scope.enum, 'outline']
  assert.match(facing.mcpProjectionDrift(contract, tool.specs, tampered) ?? '', /共享描述符重算的结果不同/)
})
