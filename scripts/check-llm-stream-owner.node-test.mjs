import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeTempDir } from './_test-temp.mjs'
import { bannedDependencies, bannedImports, oneShotCalls, scan } from './check-llm-stream-owner.mjs'

const BANNED = {
  '具名导入': 'import { streamText } from "ai";',
  '类型导入也不行（包已删）': 'import type { LanguageModelV1 } from "ai";',
  '@ai-sdk 子包': "import { createOpenAI } from '@ai-sdk/openai'",
  '默认导入': "import ai from 'ai'",
  'import x = require': "import ai = require('ai')",
  'require': 'const { streamText } = require("ai")',
  '动态 import': 'const m = await import("@ai-sdk/anthropic")',
  '重导出': "export * from 'ai'",
  '类型位置的 import()': 'type M = import("ai").LanguageModelV1',
}
const ALLOWED = {
  '注释里提到': '// import { streamText } from "ai"\nconst x = 1',
  '字符串里提到': 'const s = "import { streamText } from ai"',
  '名字像但不是': 'import { x } from "aii"; import y from "./ai"',
  'pi-ai': "import { createModels } from '@earendil-works/pi-ai'",
}
for (const [name, source] of Object.entries(BANNED)) {
  test(`拦：${name}`, () => assert.ok(bannedImports(source).length > 0))
}
for (const [name, source] of Object.entries(ALLOWED)) {
  test(`不误报：${name}`, () => assert.deepEqual(bannedImports(source), []))
}

test('直接对模型发一次：x.streamSimple / x.completeSimple / x["streamSimple"] 都认得', () => {
  assert.equal(oneShotCalls('models.streamSimple(m, c, o).result()').length, 1)
  assert.equal(oneShotCalls('await models.completeSimple(m, c)').length, 1)
  assert.equal(oneShotCalls('models["streamSimple"](m, c)').length, 1)
  assert.deepEqual(oneShotCalls('// models.streamSimple(m)\nconst streamSimple = 1'), [])
})

test('依赖里出现 ai / @ai-sdk/* 即红', () => {
  assert.deepEqual(bannedDependencies({ dependencies: { ai: '^4', '@earendil-works/pi-ai': '1' }, devDependencies: { '@ai-sdk/openai': '1' } }),
    ['dependencies.ai', 'devDependencies.@ai-sdk/openai'])
  assert.deepEqual(bannedDependencies({ dependencies: { '@earendil-works/pi-ai': '1' } }), [])
})

test('扫盘：owner 与传输包装放行，别处直接调模型、任何地方引 ai 都红，测试文件不算', () => {
  const root = makeTempDir('llm-owner-')
  const put = (rel, body) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body) }
  put('electron/agentLane/laneModelCall.mts', 'models.streamSimple(m, c, o)')
  put('electron/agentLane/laneProviderGuard.mts', 'base.streamSimple(m, c, o)')
  put('electron/other/rogue.ts', 'models.streamSimple(m, c, o)')
  put('src/x/rogue.mjs', 'const m = await import("ai")')
  put('tests/x/helper.mjs', 'import { generateText } from "ai"')
  put('electron/other/rogue.test.ts', 'import { streamText } from "ai"; models.streamSimple(m)')
  put('package.json', JSON.stringify({ dependencies: { ai: '^4.3.19' } }))
  assert.deepEqual(scan(root).map((entry) => entry.file).sort(), ['electron/other/rogue.ts', 'package.json', 'src/x/rogue.mjs', 'tests/x/helper.mjs'])
})
