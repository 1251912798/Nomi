import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { BUILD_CHAIN_SCRIPTS, findExcludedInputRefs } from './buildInputRefScan.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const scan = (rel, source) => findExcludedInputRefs([{ rel, source }])

test('red: src importing a docs file (?raw) is flagged', () => {
  expect(scan('src/ui/x.ts', "import guide from '../../docs/guide/intro.md?raw'\n")).toHaveLength(1)
})

test('red: other ways of reading an excluded path into the build are flagged', () => {
  const cases = [
    ["src/a.ts", "const all = import.meta.glob('../docs/**/*.md', { query: '?raw' })"],
    ["src/a.ts", "const u = new URL('../../tests/ux/walk.mjs', import.meta.url)"],
    ["electron/a.ts", "const t = fs.readFileSync(path.join(root, 'docs/plan/x.md'), 'utf8')"],
    ["electron/a.ts", "import notes from '../CHANGELOG.md?raw'"],
    ["vite.config.ts", "import x from './.github/foo.json'"],
    ["scripts/build-electron.mjs", "fs.copyFileSync('docs/a.md', 'dist-electron/a.md')"],
  ]
  for (const [rel, source] of cases) expect(scan(rel, source), source).toHaveLength(1)
})

test('green: the keep-exceptions, in-src files, comments and plain strings pass', () => {
  const cases = [
    ["src/devlab/k.tsx", "import notes from '../../../../docs/release-notes/v0.23.0.md?raw'"],
    ["src/devlab/k.ts", "export const VIDEO = new URL('../../../../tests/ux/fixtures/real-shot-640x360.mp4', import.meta.url).href"],
    ["src/ui/a.ts", "import skill from '../../agent-skills/nomi-add-model/SKILL.md?raw'"],
    ["src/ui/b.ts", "import readme from './README.md?raw'"], // src/README.md，不是根目录
    ["src/ui/c.ts", "// import guide from '../../docs/guide/intro.md?raw'"],
    ["src/ui/d.ts", "const source = 'docs/plan/2026-09-09-node-label-outside.md'"], // 只是文字，不读文件
    ["src/ui/d2.ts", "const IMPORT_SOURCE = 'docs/plan/2026-09-14-import-progress-reveal.md'"], // 字面里带 import 字样不算
    ["electron/ai/x.ts", 'const dir = path.join(cwd, ".agents")'], // 运行时相对用户目录，不是构建输入
    ["src/ui/e.test.ts", "import guide from '../../docs/guide/intro.md?raw'"], // 测试文件不进构建
  ]
  for (const [rel, source] of cases) expect(scan(rel, source), source).toEqual([])
})

test('the real build sources reference no excluded path', () => {
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push({ rel: path.relative(repoRoot, full).split(path.sep).join('/'), source: fs.readFileSync(full, 'utf8') })
    }
  }
  for (const dir of ['src', 'electron']) walk(path.join(repoRoot, dir))
  for (const file of ['vite.config.ts', 'tailwind.config.ts', 'postcss.config.js']) files.push({ rel: file, source: fs.readFileSync(path.join(repoRoot, file), 'utf8') })
  for (const rel of BUILD_CHAIN_SCRIPTS) files.push({ rel, source: fs.readFileSync(path.join(repoRoot, rel), 'utf8') })
  expect(findExcludedInputRefs(files)).toEqual([])
})
