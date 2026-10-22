// 2026-10-22 scripts / tests/ux / evals 进 ESLint（之前整片 ignore）的几条保险：
// ① 这三片真的不再被忽略（.mjs / .cjs / .ts 都算）；
// ② 「isVisible / isHidden 带 timeout」在代表路径上都红——flat config 里后面的块会整条覆盖 no-restricted-syntax，
//    哪个块漏拼了全仓选择器，那片文件上这条就静默失效，所以按路径逐个核，而不是只核一个文件；
// ③ 走查里的未定义标识符由 ESLint no-undef 管（替掉 check-walkthroughs 里手写的那一套，夜跑 I05 的形状照搬过来）；
// ④ lint:changed 对批量抑制的两条判据：存量变少要收紧、冻结总数不许涨。
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

import { CANVAS_SHELL_FILE } from './canvas-store-subscriptions.mjs'
import { judgeLint, judgeSuppressionGrowth, judgeUnprunedSuppressions } from './lint-changed.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NO_WAIT = 'isVisible / isHidden do not wait'

let eslint
beforeAll(() => {
  eslint = new ESLint({ cwd: root })
})

const lint = async (relativePath, source) => {
  const [result] = await eslint.lintText(source, { filePath: path.join(root, relativePath) })
  return result.messages
}

describe('scripts / tests/ux / evals 在 ESLint 范围内', () => {
  it.each(['scripts/a.mjs', 'scripts/a.cjs', 'scripts/a.ts', 'tests/ux/a.walk.mjs', 'tests/ux/fixtures/a.tsx', 'evals/journeys/a.mjs', 'evals/a.ts'])('%s 不被忽略', async (file) => {
    expect(await eslint.isPathIgnored(path.join(root, file))).toBe(false)
  })
})

describe('Playwright isVisible / isHidden 不等待：带 timeout 就红', () => {
  const source = [
    'export async function probe(page, timeout) {',
    "  const a = await page.locator('#a').isVisible({ timeout: 8000 })",
    "  const b = await page.locator('#b').isHidden({ timeout })",
    "  const c = await page.isVisible('#c', { timeout: 1 })",
    "  const d = await page.locator('#d').waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false)",
    "  const e = await page.locator('#e').isVisible()",
    '  return [a, b, c, d, e]',
    '}',
    '',
  ].join('\n')

  it.each([
    'tests/ux/a.walk.mjs',
    'tests/ux/a.paid.mjs',
    'tests/ux/full-walk/playbooks/a.walk.mjs',
    'tests/ux/a.cjs',
    'scripts/a.mjs',
    'scripts/a.ts',
    'evals/journeys/a.mjs',
    'evals/a.ts',
    'tests/perf/a.mjs',
    'docs/design/a.mjs',
    'src/a.ts',
    'src/a.test.ts',
    'electron/a.ts',
    'electron/quitTeardown.ts',
    CANVAS_SHELL_FILE,
  ])('%s：三种写法都红，waitFor 与不带 timeout 的不红', async (file) => {
    const hits = (await lint(file, source)).filter((message) => message.ruleId === 'no-restricted-syntax' && message.message.startsWith(NO_WAIT))
    expect(hits.map((message) => message.line)).toEqual([2, 3, 4])
  })
})

describe('走查里的未定义标识符：ESLint no-undef（夜跑 I05 的形状）', () => {
  const undefinedNames = async (file, ...rows) => (await lint(file, rows.join('\n') + '\n'))
    .filter((message) => message.ruleId === 'no-undef')
    .map((message) => message.message.match(/'([^']+)'/)?.[1])

  it('阳性对照：漏 import / 漏声明的标识符被报出来', async () => {
    expect(await undefinedNames('tests/ux/clip.walk.mjs', 'await canvasSetZoomPercent(win, 50)')).toEqual(['canvasSetZoomPercent', 'win'])
    expect(await undefinedNames('evals/journeys/a.mjs', 'const run = {}', "await expectVisible(run.newProjectEntry(win), 'x')")).toEqual(['expectVisible', 'win'])
  })

  it('补了 import / 声明就不报；Node 全局与页内（浏览器）全局都认；.cjs 认 require / module', async () => {
    expect(await undefinedNames('tests/ux/a.walk.mjs', "import { canvasSetZoomPercent } from './_shell.mjs'", 'export async function f(win) { await canvasSetZoomPercent(win, 50) }')).toEqual([])
    expect(await undefinedNames('tests/ux/a.walk.mjs', 'export const dir = process.cwd()', 'export const h = (win) => win.evaluate(() => document.body.scrollHeight + window.innerWidth)')).toEqual([])
    expect(await undefinedNames('tests/ux/a.cjs', "const fs = require('node:fs')", 'module.exports = { fs, ok: typeof document }')).toEqual([])
  })

  it('加载即崩的写法直接红：语法错误、重复声明（2026-09-02 解冲突留下的那种）', async () => {
    const [fatal] = await lint('tests/ux/a.walk.mjs', 'const x = (\n')
    expect(fatal).toMatchObject({ fatal: true, severity: 2 })
    // .mjs 也走 typescript-eslint 的解析器，它不在解析期拒重复声明，由 no-redeclare 报成错误——同样红。
    const redeclared = await lint('tests/ux/a.walk.mjs', 'const A = 1\nconst A = 2\nexport { A }\n')
    expect(redeclared.some((message) => message.severity === 2 && message.line === 2)).toBe(true)
  })
})

describe('lint:changed 对批量抑制的判据', () => {
  const frozen = { 'scripts/a.mjs': { 'no-unused-vars': { count: 2 } }, 'tests/ux/b.mjs': { 'no-empty': { count: 1 } } }

  it('冻结总数不许涨；搬家（换文件、总数不变）和减少都放行', () => {
    expect(judgeSuppressionGrowth(frozen, frozen)).toEqual([])
    expect(judgeSuppressionGrowth(frozen, { 'scripts/renamed.mjs': { 'no-unused-vars': { count: 2 } }, 'tests/ux/b.mjs': { 'no-empty': { count: 1 } } })).toEqual([])
    expect(judgeSuppressionGrowth(frozen, { 'scripts/a.mjs': { 'no-unused-vars': { count: 1 } } })).toEqual([])
    const [grown] = judgeSuppressionGrowth(frozen, { ...frozen, 'scripts/c.mjs': { 'no-unused-vars': { count: 1 } } })
    expect(grown).toContain('no-unused-vars：2 → 3')
    expect(judgeSuppressionGrowth({}, { 'scripts/c.mjs': { 'no-undef': { count: 1 } } })[0]).toContain('no-undef：0 → 1')
  })

  it('存量变少却没收紧 → 拦，并给出收紧命令；超出冻结数时只报错误、不重复报「没收紧」', () => {
    expect(judgeUnprunedSuppressions([{ file: 'scripts/a.mjs', suppressedByRule: { 'no-unused-vars': 2 } }], frozen)).toEqual([])
    const [stale] = judgeUnprunedSuppressions([{ file: 'scripts/a.mjs', suppressedByRule: { 'no-unused-vars': 1 } }], frozen)
    expect(stale).toContain('冻结 2，实际 1')
    expect(stale).toContain('pnpm exec eslint --prune-suppressions')
    const over = [{ ruleId: 'no-unused-vars', severity: 2, line: 1, column: 1, message: 'x' }]
    expect(judgeUnprunedSuppressions([{ file: 'scripts/a.mjs', suppressedByRule: {}, head: over }], frozen)).toEqual([])
    const [error] = judgeLint([{ file: 'scripts/a.mjs', head: over, base: [] }], frozen)
    expect(error).toContain('no-unused-vars 冻结了 2 处存量')
  })
})
