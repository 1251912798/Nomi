import { makeTempDir } from './_test-temp.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { load } from 'js-yaml'
import { sourceIdentity, stampedBuild } from './package-build-stamp.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workflow = load(fs.readFileSync(path.join(repoRoot, '.github/workflows/nightly-walkthroughs.yml'), 'utf8'))

/** 工作流里每个会往仓库树写文件的目标：mkdir、重定向、tee、log= 赋值、汇总脚本参数、artifact 上传 / 下载路径。 */
function writeTargets() {
  const targets = new Set()
  const add = (raw) => {
    const value = raw.replace(/^["']|["']$/g, '')
    if (!value || /^[$&/-]/.test(value)) return
    targets.add(value.replace(/\/\*\*$/, '').replace(/\$\{[^}]*\}/g, 'x'))
  }
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps) {
      const run = step.run ?? ''
      for (const m of run.matchAll(/mkdir -p\s+(\S+)/g)) add(m[1])
      for (const m of run.matchAll(/(?:>>?|tee)\s*("[^"]+"|\S+)/g)) add(m[1])
      for (const m of run.matchAll(/\blog="([^"]+)"/g)) add(m[1])
      for (const m of run.matchAll(/--state\s+("[^"]+"|\S+)/g)) add(m[1])
      for (const m of run.matchAll(/nightly-walk-summary\.mjs\s+(\S+)\s+(\S+)/g)) { add(m[1]); add(m[2]) }
      if (step.with?.path) add(String(step.with.path))
    }
  }
  return [...targets].sort()
}

test('夜跑工作流写文件的每个目标都被 .gitignore 忽略，写进去后 sourceIdentity 不变（防输出目录漂移身份）', (t) => {
  const targets = writeTargets()
  for (const expected of ['nightly-walks', 'nightly-results', 'nightly-summary.md']) {
    assert.ok(targets.includes(expected), `表抽取空转或漏项（缺 ${expected}）：${targets.join('、')}`)
  }
  const root = makeTempDir('nomi-nightly-outputs-test-')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString().trim()
  git('init')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Fixture')
  fs.copyFileSync(path.join(repoRoot, '.gitignore'), path.join(root, '.gitignore'))
  fs.mkdirSync(path.join(root, 'src'))
  fs.writeFileSync(path.join(root, 'src/app.ts'), 'export {}')
  git('add', '.')
  git('commit', '-m', 'fixture')
  for (const output of ['dist', 'dist-electron']) fs.mkdirSync(path.join(root, output))
  stampedBuild(root, () => {})
  const before = sourceIdentity(root)
  const offenders = []
  for (const target of targets) {
    // 目标可能是目录也可能是文件：目录探其下一个文件，文件直接探；任一被忽略即算登记。
    const probe = path.extname(target) ? target : `${target}/probe.log`
    try { git('check-ignore', '-q', probe) } catch { offenders.push(target); continue }
    const file = path.join(root, probe)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'x')
  }
  assert.deepEqual(offenders, [], '这些夜跑输出目标没有被 .gitignore 忽略：先加进 .gitignore，否则 build 之后身份会漂移')
  assert.deepEqual(sourceIdentity(root), before)
})
