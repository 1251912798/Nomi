// 「用例 / 钩子不许设比 vitest 全局更短的超时」这条 ESLint 规则的两条保险：
// ① eslint.config.mjs 里的下限与 vitest.config.ts 的 testTimeout / hookTimeout 同值（改一边忘了另一边就红）；
// ② 规则真的接在测试文件上：更短的超时报错，等于全局 / 不传不报。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

import { COLD_IMPORT_BASELINE_PATH, coldImportSelectors, VITEST_TIMEOUT_FLOOR_MS } from '../eslint.config.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('vitest timeout floor', () => {
  it('ESLint 下限与 vitest.config.ts 的全局超时同值', () => {
    const config = fs.readFileSync(path.join(root, 'vitest.config.ts'), 'utf8')
    const read = (key) => Number(config.match(new RegExp(`\\b${key}:\\s*([\\d_]+)`))?.[1]?.replaceAll('_', ''))
    expect(read('testTimeout')).toBe(VITEST_TIMEOUT_FLOOR_MS)
    expect(read('hookTimeout')).toBe(VITEST_TIMEOUT_FLOOR_MS)
  })

  it('测试文件里更短的超时被拦，等于全局或不传不拦', async () => {
    const eslint = new ESLint({ cwd: root })
    const source = [
      "import { beforeAll, it, test } from 'vitest'",
      "it('short', async () => {}, 15_000)",
      "test.each([1])('short each %s', async () => {}, 5000)",
      "it('short option', async () => {}, { timeout: 10_000 })",
      "beforeAll(async () => {}, 20_000)",
      "it('floor', async () => {}, 30_000)",
      "it('default', async () => {})",
      '',
    ].join('\n')
    const [result] = await eslint.lintText(source, { filePath: path.join(root, 'electron', 'timeoutFloorProbe.test.ts') })
    const lines = result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.line)
    expect(lines).toEqual([2, 3, 4, 5])
  }, 60_000)
})

// 「用例体 / 钩子里不许 await import」这条规则的保险：
// ① 规则真的接在测试文件上（用例 / 钩子里的动态 import 报错；顶层静态 import、vi.mock 工厂、写了理由注释的不报）；
// ② 存量基线只许减不许增：基线里每个文件必须真的还在、真的还有违规（迁完了就得从 JSON 里删掉），每条有理由。
// 「新增」那一半由 ESLint 本身守——基线外的测试文件一违规就红。
describe('test cold import ban', () => {
  it('用例体 / 钩子里的动态 import 被拦；静态 import、vi.mock 工厂、带理由的豁免不拦', async () => {
    const eslint = new ESLint({ cwd: root })
    const source = [
      "import { beforeEach, it, test, vi } from 'vitest'",
      "import { a } from './a'",
      "vi.mock('./b', async () => { const m = await import('./c'); return m })",
      "beforeEach(async () => {",
      "  const { b } = await import('./b')",
      '})',
      "it('x', async () => {",
      "  const { c } = await import('./c')",
      '})',
      "test.each([1])('y', async () => {",
      "  await import('./d')",
      '})',
      "it('restart', async () => {",
      "  // eslint-disable-next-line no-restricted-syntax -- 重启模拟",
      "  await import('./e')",
      '})',
      'void a',
      '',
    ].join('\n')
    const [result] = await eslint.lintText(source, { filePath: path.join(root, 'electron', 'coldImportProbe.test.ts') })
    const lines = result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.line)
    expect(lines).toEqual([5, 8, 11])
  }, 60_000)

  it('基线只减不增：每个文件还在、还有违规，且写了理由', async () => {
    const baseline = JSON.parse(fs.readFileSync(path.join(root, COLD_IMPORT_BASELINE_PATH), 'utf8')).files
    const files = Object.keys(baseline)
    for (const reason of Object.values(baseline)) expect(typeof reason === 'string' && reason.length > 0).toBe(true)
    const eslint = new ESLint({
      cwd: root,
      overrideConfig: [{ files: ['**/*.test.{ts,tsx}'], rules: { 'no-restricted-syntax': ['error', ...coldImportSelectors] } }],
    })
    const results = await eslint.lintFiles(files)
    const clean = results
      .filter((r) => !r.messages.some((m) => m.ruleId === 'no-restricted-syntax'))
      .map((r) => path.relative(root, r.filePath).split(path.sep).join('/'))
    expect(clean, `这些文件已经没有用例体 / 钩子里的 await import 了，从 ${COLD_IMPORT_BASELINE_PATH} 里删掉它们`).toEqual([])
  }, 180_000)
})
