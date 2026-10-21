import { makeTempDir } from './_test-temp.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { assertFreshBuild, invalidateBuild, sourceIdentity, stampedBuild, verifyBuild } from './package-build-stamp.mjs'

const cli = fileURLToPath(new URL('./package-build-stamp.mjs', import.meta.url))
function fixture(t) {
  const root = makeTempDir('nomi-package-stamp-test-')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString().trim()
  git('init')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Fixture')
  fs.writeFileSync(path.join(root, '.gitignore'), 'dist/\ndist-electron/\n')
  fs.writeFileSync(path.join(root, 'source.txt'), 'initial')
  for (const [file, text] of [
    ['src/app.ts', 'export {}'], ['package.json', '{}'], ['pnpm-lock.yaml', 'lock'], ['README.md', 'r'],
    ['docs/plan/p.md', 'p'], ['docs/release-notes/v1.md', 'notes'], ['tests/ux/walk.mjs', 'w'], ['tests/ux/fixtures/f.txt', 'f'],
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), text)
  }
  git('add', '.')
  git('commit', '-m', 'fixture')
  for (const output of ['dist', 'dist-electron']) fs.mkdirSync(path.join(root, output))
  return { root, git, build: () => stampedBuild(root, () => {}) }
}

test('correct stamps pass; stale renderer or electron stamp fails at CLI before packaging', t => {
  const { root, build } = fixture(t)
  build()
  assert.equal(spawnSync(process.execPath, [cli, 'verify'], { cwd: root }).status, 0)
  for (const output of ['dist', 'dist-electron']) {
    build()
    const stamp = path.join(root, output, 'build-stamp.json')
    const data = JSON.parse(fs.readFileSync(stamp))
    fs.writeFileSync(stamp, JSON.stringify({ ...data, tree: '0'.repeat(40) }))
    const result = spawnSync(process.execPath, [cli, 'verify'], { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /先 `pnpm build`/)
    console.log(`STALE ${output}: exit=${result.status} ${result.stderr.trim()}`)
  }
})

for (const change of ['staged', 'unstaged', 'untracked', 'missing', 'malformed', 'partial']) {
  test(`${change} change invalidates build`, t => {
    const { root, git, build } = fixture(t)
    build()
    if (change === 'staged' || change === 'unstaged') {
      fs.writeFileSync(path.join(root, 'source.txt'), change)
      if (change === 'staged') git('add', '.')
    }
    if (change === 'untracked') fs.writeFileSync(path.join(root, 'new-source.txt'), 'new')
    if (change === 'missing') fs.unlinkSync(path.join(root, 'dist-electron/build-stamp.json'))
    if (change === 'malformed') fs.writeFileSync(path.join(root, 'dist/build-stamp.json'), '{')
    if (change === 'partial') invalidateBuild(root)
    assert.throws(() => verifyBuild(root), /pnpm build/)
  })
}

test('dirty content is hashed, actual index is preserved, later dirty edits invalidate', t => {
  const { root, git, build } = fixture(t)
  const index = git('write-tree')
  fs.writeFileSync(path.join(root, 'source.txt'), 'dirty one')
  build()
  assert.equal(git('write-tree'), index)
  fs.writeFileSync(path.join(root, 'source.txt'), 'dirty two')
  assert.throws(() => verifyBuild(root), /pnpm build/)
  assert.notEqual(sourceIdentity(root).tree, index)
})

test('failed build and source edits during build leave no usable stamp', t => {
  const { root, build } = fixture(t)
  build()
  assert.throws(() => stampedBuild(root, () => { throw new Error('compiler failed') }), /compiler failed/)
  assert.throws(() => verifyBuild(root), /pnpm build/)
  assert.throws(() => stampedBuild(root, () => fs.writeFileSync(path.join(root, 'source.txt'), 'during build')), /构建期间/)
  assert.throws(() => verifyBuild(root), /pnpm build/)
})

test('both packaging scripts verify before electron-builder; partial builds invalidate', () => {
  const { scripts } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)))
  for (const name of ['dist', 'dist:mac:dir']) assert.match(scripts[name], /package-build-stamp\.mjs verify && .*electron-builder/)
  assert.match(scripts.build, /package-build-stamp\.mjs build/)
  assert.match(scripts['build:renderer'], /package-build-stamp\.mjs invalidate &&/)
  assert.match(fs.readFileSync(new URL('./build-electron.mjs', import.meta.url), 'utf8'), /invalidateBuild\(repoRoot\)/)
})

// G-walk-build：走查 / e2e / perf 起跑前的统一核对。旧戳、没有戳都拒跑并给出「先 pnpm run build」，戳一致才放行。
test('assertFreshBuild: no stamp refuses, stale stamp refuses, matching stamp passes', t => {
  const { root, build } = fixture(t)
  assert.throws(() => assertFreshBuild(root), /构建产物比源码旧（或没有构建），先跑 pnpm run build/)
  build()
  assert.equal(typeof assertFreshBuild(root).tree, 'string')
  fs.writeFileSync(path.join(root, 'source.txt'), 'edited after build')
  assert.throws(() => assertFreshBuild(root), /构建产物比源码旧（或没有构建），先跑 pnpm run build/)
  build()
  assert.doesNotThrow(() => assertFreshBuild(root))
})

// 指纹只算会影响构建产物的输入：构建之后写证据、提交文档 / 测试，戳仍新鲜；改 src / 依赖清单，过期。
const writeAt = (root, file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text) }
for (const [name, act] of [
  ['evidence written under docs/evidence', ({ root }) => writeAt(root, 'docs/evidence/2026-10-22/shot.png', 'png')],
  ['an existing docs file edited', ({ root }) => writeAt(root, 'docs/plan/p.md', 'edited')],
  ['a docs change committed after the build', ({ root, git }) => { writeAt(root, 'docs/plan/new.md', 'n'); git('add', '.'); git('commit', '-m', 'docs') }],
  ['an empty commit after the build', ({ git }) => git('commit', '--allow-empty', '-m', 'empty')],
  ['a walk script edited', ({ root }) => writeAt(root, 'tests/ux/walk.mjs', 'edited')],
  ['root markdown edited', ({ root }) => writeAt(root, 'README.md', 'edited')],
]) {
  test(`stays fresh: ${name}`, t => {
    const f = fixture(t)
    f.build()
    act(f)
    assert.doesNotThrow(() => assertFreshBuild(f.root))
  })
}
for (const [name, act] of [
  ['a src file edited', ({ root }) => writeAt(root, 'src/app.ts', 'export const x = 1')],
  ['a new src file', ({ root }) => writeAt(root, 'src/new.ts', 'x')],
  ['package.json edited', ({ root }) => writeAt(root, 'package.json', '{"a":1}')],
  ['the lockfile edited', ({ root }) => writeAt(root, 'pnpm-lock.yaml', 'lock2')],
  ['release notes (imported ?raw by src) edited', ({ root }) => writeAt(root, 'docs/release-notes/v1.md', 'notes2')],
  ['a test fixture (referenced by src/devlab) edited', ({ root }) => writeAt(root, 'tests/ux/fixtures/f.txt', 'f2')],
  ['a src change committed after the build', ({ root, git }) => { writeAt(root, 'src/app.ts', 'export const y = 2'); git('add', '.'); git('commit', '-m', 'src') }],
]) {
  test(`goes stale: ${name}`, t => {
    const f = fixture(t)
    f.build()
    act(f)
    assert.throws(() => assertFreshBuild(f.root), /pnpm run build/)
  })
}

test('a v1 stamp (head + dirty) is void', t => {
  const f = fixture(t)
  f.build()
  for (const output of ['dist', 'dist-electron']) {
    const stamp = path.join(f.root, output, 'build-stamp.json')
    fs.writeFileSync(stamp, JSON.stringify({ ...JSON.parse(fs.readFileSync(stamp)), version: 1 }))
  }
  assert.throws(() => assertFreshBuild(f.root), /pnpm run build/)
})

test('build: src edited during the build fails; docs written during the build do not', t => {
  const f = fixture(t)
  assert.throws(() => stampedBuild(f.root, () => writeAt(f.root, 'src/app.ts', 'changed mid-build')), /构建期间/)
  assert.throws(() => assertFreshBuild(f.root), /pnpm run build/)
  assert.doesNotThrow(() => stampedBuild(f.root, () => writeAt(f.root, 'docs/evidence/mid-build.png', 'png')))
  assert.doesNotThrow(() => assertFreshBuild(f.root))
})
