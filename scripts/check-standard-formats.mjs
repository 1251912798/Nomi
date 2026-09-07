#!/usr/bin/env node
// 外部格式对齐门岗（R31，2026-09-07）。守一条不变量：
// **凡是外部也读写的东西，格式先对齐官方或事实标准，不许自己造一套自以为是的实现。**
//
// 起因（2026-09-07 用户拍板）：Agent Skills 的官方形态只有「文件夹 + SKILL.md + YAML frontmatter」，
// 我们在旁边另起了平行文件 `skill.json`。结果是别人的技能导不进来（2026-08-26 群里抱怨），
// 而当天的文案还在引导用户去造这个文件。**标准就摆在那儿，只是没有人在动手之前去看一眼。**
//
// 判据住在 scripts/standard-formats-lib.mjs（可被 node-test 喂假仓库）；本文件只负责
// 读登记表、扫盘、比基线、报红。登记表 = docs/engineering/standard-formats.json。
//
// 用法：
//   node scripts/check-standard-formats.mjs                  跑门岗
//   node scripts/check-standard-formats.mjs --update-baseline 重写债基线（只在登记新格式时用，且必须人工复核 diff）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  coverageOf,
  evaluateFixtures,
  evaluateTouchpoints,
  scanSources,
  validateRegistry,
} from './standard-formats-lib.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY_FILE = path.join(repoRoot, 'docs/engineering/standard-formats.json')
const BASELINE_FILE = path.join(repoRoot, 'scripts/standard-formats-baseline.json')
const SOURCE_EXTENSIONS = /\.(tsx?|mts|cts|mjs|cjs)$/
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'dist-electron', '.tmp', '.git'])
const TEST_FILE = /\.(test|spec|node-test)\.[cm]?[jt]sx?$/
/** 夹具引用只认测试文件——门岗脚本自己提到夹具路径不算「有人读它」。 */
const TEST_SEARCH_ROOTS = ['electron', 'src', 'tests', 'scripts', 'evals']

const rel = (file) => path.relative(repoRoot, file).split(path.sep).join('/')

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    console.error(`✖ 无法解析 ${rel(file)}：${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

function walk(dir, onFile) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, onFile)
    else onFile(full, entry.name)
  }
}

/** 生产代码才扫。门岗脚本和走查读的是自家基线与产物，不是和外界互通的格式。 */
function collectSources(registry) {
  const roots = Array.isArray(registry?.scan?.roots) && registry.scan.roots.length > 0
    ? registry.scan.roots
    : ['electron', 'src']
  const sources = new Map()
  for (const root of roots) {
    walk(path.join(repoRoot, root), (full, name) => {
      if (!SOURCE_EXTENSIONS.test(name) || TEST_FILE.test(name)) return
      sources.set(rel(full), fs.readFileSync(full, 'utf8'))
    })
  }
  return sources
}

/** 全仓测试文件的正文，用来回答「这份夹具有没有测试读它」。 */
function collectTestSources() {
  const texts = []
  for (const root of TEST_SEARCH_ROOTS) {
    walk(path.join(repoRoot, root), (full, name) => {
      if (!TEST_FILE.test(name)) return
      texts.push(fs.readFileSync(full, 'utf8'))
    })
  }
  return texts
}

const registry = readJson(REGISTRY_FILE)
const today = new Date().toISOString().slice(0, 10)
const registryErrors = validateRegistry(registry, { today })
if (registryErrors.length > 0) {
  console.error(`✖ ${rel(REGISTRY_FILE)} 登记表不合法：`)
  for (const error of registryErrors) console.error(`  - ${error}`)
  process.exit(1)
}

const hits = scanSources(collectSources(registry))
const covered = coverageOf(registry)

if (process.argv.includes('--update-baseline')) {
  const debt = [...hits.values()]
    .filter((hit) => !covered.has(hit.identity))
    .sort((a, b) => a.identity.localeCompare(b.identity))
    .map((hit) => ({
      identity: hit.identity,
      note: `${hit.file}:${hit.line} 解析 ${hit.formatFile}，尚未登记进 standard-formats.json`,
      plan: 'docs/engineering-rules.md#r31-外部格式协议契约必须对齐官方或事实标准',
      due: '2026-11-07',
    }))
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify({
    _comment: [
      '外部格式棘轮基线（R31）：登记的是**债**，不是豁免。只减不增。',
      '每条债 = 一个「解析了外部格式文件、但还没被登记表认领」的入口。',
      '还清一条 = 把那个格式登记进 docs/engineering/standard-formats.json（对齐标准 / 说明为什么没有可对齐的 /',
      '标成 internal 并写清凭什么说它不对外），然后从这里删掉那一行。',
      '身份 = 格式文件名::源码路径；不存行号（行号随无关改动漂移，改多了就没人看了）。',
    ],
    debt,
  }, null, 2)}\n`)
  console.log(`✅ 已重写 ${rel(BASELINE_FILE)}：${debt.length} 条债（请人工复核 diff 再提交）`)
  process.exit(0)
}

const baseline = readJson(BASELINE_FILE)
const testSources = collectTestSources()
const errors = [
  ...evaluateFixtures({
    registry,
    fixtureExists: (fixture) => fs.existsSync(path.join(repoRoot, fixture)),
    fixtureReferencedByTest: (fixture) => testSources.some((text) => text.includes(fixture)),
  }),
  ...evaluateTouchpoints({ hits, covered, baseline, today }),
]

if (errors.length > 0) {
  console.error('✖ 外部格式对齐门岗失败（R31：外部也读写的东西，格式先对齐标准）：')
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

const aligned = registry.formats.filter((format) => format.spec).length
const internal = registry.formats.filter((format) => format.kind === 'internal').length
const debtCount = (baseline.debt ?? []).length
  + registry.formats.filter((format) => format.debt !== undefined).length
console.log(`✅ 外部格式门岗：${registry.formats.length} 个格式在册（${aligned} 个指得到规范、${internal} 个内部豁免），`
  + `${hits.size} 个解析入口全部有主，${debtCount} 条偏差/未登记债在册且未过期`)
