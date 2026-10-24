import { makeTempDir } from './_test-temp.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { BUILD_GATE_STATUS, BUILD_GATE_WALK, runBuildGate } from './nightly-build-gate.mjs'
import { sourceIdentity, stampedBuild } from './package-build-stamp.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoIgnore = fs.readFileSync(path.join(here, '..', '.gitignore'), 'utf8')

/** 一个带真 .gitignore、真 package-build-stamp.mjs 的最小仓库：夜跑 runner 的现场。 */
function fixture(t, { gitignore = repoIgnore } = {}) {
  const root = makeTempDir('nomi-nightly-gate-test-')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString().trim()
  git('init')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Fixture')
  fs.mkdirSync(path.join(root, 'scripts'))
  for (const file of ['package-build-stamp.mjs', '_test-temp.mjs']) fs.copyFileSync(path.join(here, file), path.join(root, 'scripts', file))
  fs.mkdirSync(path.join(root, 'src'))
  fs.writeFileSync(path.join(root, 'src/app.ts'), 'export {}')
  fs.writeFileSync(path.join(root, '.gitignore'), gitignore)
  git('add', '.')
  git('commit', '-m', 'fixture')
  for (const output of ['dist', 'dist-electron']) fs.mkdirSync(path.join(root, output))
  stampedBuild(root, () => {})
  return { root, git }
}

test('类根因复现：build 之后写进未忽略的输出目录会让源码身份漂移；.gitignore 登记后不漂移', (t) => {
  const bad = fixture(t, { gitignore: 'dist/\ndist-electron/\n' })
  const before = sourceIdentity(bad.root)
  fs.mkdirSync(path.join(bad.root, 'nightly-walks'))
  fs.writeFileSync(path.join(bad.root, 'nightly-walks/results-0.tsv'), '')
  assert.notDeepEqual(sourceIdentity(bad.root), before)

  const good = fixture(t)
  const stable = sourceIdentity(good.root)
  fs.mkdirSync(path.join(good.root, 'nightly-walks'))
  fs.writeFileSync(path.join(good.root, 'nightly-walks/results-0.tsv'), '')
  fs.writeFileSync(path.join(good.root, 'nightly-walks/a.walk.mjs.log'), 'x')
  assert.deepEqual(sourceIdentity(good.root), stable)
})

test('构建自检通过：返回 0，不写构建门记录，先打印 git status', (t) => {
  const { root } = fixture(t)
  const logs = []
  assert.equal(runBuildGate({ root, outDir: 'nightly-walks', resultsFile: 'nightly-walks/results-0.tsv', log: (m) => logs.push(m) }), 0)
  assert.equal(fs.existsSync(path.join(root, 'nightly-walks/results-0.tsv')), false)
  assert.match(logs[0], /git status --porcelain/)
})

test('构建自检失败：记一行构建门、返回非 0（调用方不再启动走查）', (t) => {
  const { root } = fixture(t)
  fs.rmSync(path.join(root, 'dist-electron/build-stamp.json'))
  assert.equal(runBuildGate({ root, outDir: 'nightly-walks', resultsFile: 'nightly-walks/results-2.tsv', log: () => {} }), 1)
  const rows = fs.readFileSync(path.join(root, 'nightly-walks/results-2.tsv'), 'utf8').trim().split('\n')
  assert.equal(rows.length, 1)
  const [walk, status, , log] = rows[0].split('\t')
  assert.equal(walk, BUILD_GATE_WALK)
  assert.equal(Number(status), BUILD_GATE_STATUS)
  assert.ok(fs.existsSync(path.join(root, log)))
})

test('身份漂移时：自检日志打印出是哪个文件，错误里给出构建时 / 当前两个 tree', (t) => {
  const { root } = fixture(t, { gitignore: 'dist/\ndist-electron/\n' })
  fs.mkdirSync(path.join(root, 'leaked'))
  fs.writeFileSync(path.join(root, 'leaked/out.log'), 'x')
  const logs = []
  assert.equal(runBuildGate({ root, outDir: 'leaked', resultsFile: 'leaked/results.tsv', log: (m) => logs.push(m) }), 1)
  const text = logs.join('\n')
  assert.match(text, /\?\? leaked\/out\.log/)
  assert.match(text, /构建时 tree=[0-9a-f]{40}，当前 tree=[0-9a-f]{40}/)
})
