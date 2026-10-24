import { makeTempDir } from './_test-temp.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { load } from 'js-yaml'
import { stampedBuild, verifyBuild } from './package-build-stamp.mjs'
import { TREE_GUARD_STATUS, guardWalkTree, runGuardCli } from './nightly-walk-tree-guard.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 一份带真 .gitignore 的小仓：构建过、戳是好的——等于夜跑批开头构建自检通过的那一刻。 */
function fixture(t) {
  const root = makeTempDir('nomi-tree-guard-test-')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString().trim()
  git('init')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Fixture')
  fs.copyFileSync(path.join(repoRoot, '.gitignore'), path.join(root, '.gitignore'))
  for (const [file, text] of [['src/app.ts', 'export {}'], ['src/old.ts', 'export const old = 1'], ['tests/ux/fixtures/clip.txt', 'f'], ['docs/a.md', 'a']]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), text)
  }
  git('add', '.')
  git('commit', '-m', 'fixture')
  for (const output of ['dist', 'dist-electron']) fs.mkdirSync(path.join(root, output))
  stampedBuild(root, () => {})
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), text)
  }
  return { root, write }
}

test('走查只写被忽略的输出目录：树不变、不判红', (t) => {
  const { root, write } = fixture(t)
  for (const file of ['tests/ux/shots/walk/01.png', 'artifacts/feel/x.json', '.tmp/walk-fail/x.png', 'nightly-walks/x.log']) write(file, 'x')
  const logs = []
  const result = guardWalkTree({ root, walk: 'tests/ux/quiet.walk.mjs', log: (line) => logs.push(line) })
  assert.equal(result.status, 0)
  assert.deepEqual(logs, [])
})

test('走查写进源码树（10-24 那种：仓库根下没忽略的截图目录）：判红、逐个点名、按它之前的树还原，下一条不连坐', (t) => {
  const { root, write } = fixture(t)
  write('.node-toolbar-one-row-lab/zh-1-image-bar.png', 'png')
  write('src/app.ts', 'export const broken = true')
  fs.rmSync(path.join(root, 'src/old.ts'))
  write('tests/ux/fixtures/written-by-walk.mp4', 'mp4')
  write('tests/ux/shots/walk/ok.png', 'ignored output is not named')
  const logs = []
  const result = guardWalkTree({ root, walk: 'tests/ux/culprit.walk.mjs', restore: true, log: (line) => logs.push(line) })
  assert.equal(result.status, TREE_GUARD_STATUS)
  assert.equal(result.restored, true)
  assert.deepEqual(result.changes.map(({ status, path: file }) => `${status} ${file}`).sort(), [
    'A .node-toolbar-one-row-lab/zh-1-image-bar.png',
    'A tests/ux/fixtures/written-by-walk.mp4',
    'D src/old.ts',
    'M src/app.ts',
  ])
  assert.ok(logs.some((line) => line.includes('tests/ux/culprit.walk.mjs')), logs.join('\n'))
  assert.ok(logs.some((line) => line.includes('A .node-toolbar-one-row-lab/zh-1-image-bar.png')), logs.join('\n'))
  // 还原到位：构建戳重新成立，新增的没了，改掉 / 删掉的回来了；被忽略的输出原样留着（证据）。
  verifyBuild(root)
  assert.equal(fs.existsSync(path.join(root, '.node-toolbar-one-row-lab/zh-1-image-bar.png')), false)
  assert.equal(fs.readFileSync(path.join(root, 'src/app.ts'), 'utf8'), 'export {}')
  assert.equal(fs.readFileSync(path.join(root, 'src/old.ts'), 'utf8'), 'export const old = 1')
  assert.equal(fs.existsSync(path.join(root, 'tests/ux/shots/walk/ok.png')), true)
  const next = guardWalkTree({ root, walk: 'tests/ux/next.walk.mjs', baseline: result.baseline, restore: true, log: () => {} })
  assert.equal(next.status, 0)
})

test('不还原时照样点名判红；基线跟着前移，下一条不被冤枉', (t) => {
  const { root, write } = fixture(t)
  write('.some-walk-lab/a.png', 'png')
  const first = guardWalkTree({ root, walk: 'tests/ux/culprit.walk.mjs', restore: false, log: () => {} })
  assert.equal(first.status, TREE_GUARD_STATUS)
  assert.deepEqual(first.changes, [{ status: 'A', path: '.some-walk-lab/a.png' }])
  assert.throws(() => verifyBuild(root), /A \.some-walk-lab\/a\.png/, '构建戳的报错自己点名差异')
  const next = guardWalkTree({ root, walk: 'tests/ux/next.walk.mjs', baseline: first.baseline, log: () => {} })
  assert.equal(next.status, 0)
})

test('命令行：本机不许 --restore；基线写进 --state，第二条读它', (t) => {
  const { root, write } = fixture(t)
  const state = 'nightly-walks/tree-guard-0.state'
  assert.throws(() => runGuardCli({ root, argv: ['--walk', 'w', '--state', state, '--restore'], env: {}, log: () => {} }), /只在 CI/)
  write('.culprit-lab/a.png', 'png')
  assert.equal(runGuardCli({ root, argv: ['--walk', 'tests/ux/culprit.walk.mjs', '--state', state, '--restore'], env: { CI: 'true' }, log: () => {} }), TREE_GUARD_STATUS)
  assert.equal(fs.existsSync(path.join(root, '.culprit-lab/a.png')), false)
  const baseline = fs.readFileSync(path.join(root, state), 'utf8').trim()
  assert.match(baseline, /^[0-9a-f]{40}$/)
  assert.equal(runGuardCli({ root, argv: ['--walk', 'tests/ux/next.walk.mjs', '--state', state, '--restore'], env: { CI: 'true' }, log: () => {} }), 0)
})

test('夜跑工作流在每条走查之后都跑这道核对，且它能把这条判红', () => {
  const workflow = load(fs.readFileSync(path.join(repoRoot, '.github/workflows/nightly-walkthroughs.yml'), 'utf8'))
  const step = workflow.jobs.walks.steps.find((entry) => entry.name === 'Run non-paid walkthrough batch')
  assert.ok(step, '找不到夜跑走查那一步')
  const lines = step.run.split('\n').map((line) => line.trim())
  const walkLine = lines.findIndex((line) => /node "\$walk"/.test(line))
  const guardLine = lines.findIndex((line) => line.startsWith('node scripts/nightly-walk-tree-guard.mjs'))
  const recordLine = lines.findIndex((line) => line.startsWith('printf') && line.includes('results-'))
  assert.ok(walkLine >= 0 && guardLine > walkLine && recordLine > guardLine, '核对必须在走查之后、写结果行之前')
  assert.match(lines[guardLine], /--walk "\$walk"/)
  assert.match(lines[guardLine], /--state "nightly-walks\/tree-guard-\$\{BATCH\}\.state"/)
  assert.match(lines[guardLine], /--restore/)
  assert.ok(lines.slice(guardLine, recordLine).some((line) => /status=\$guard/.test(line)), '核对红了要改写这一条的结果')
})
