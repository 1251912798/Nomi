#!/usr/bin/env node
import { makeTempDir } from './_test-temp.mjs'
// push 闸（scripts/claude-hooks/pre-push-check.sh）的行为测试（2026-10-24 推送前的本机门岗戳删除后改写）。
//
// 2026-10-24 用户拍板「改成 CI 把关：推分支前本机只跑快检，完整门岗交给 CI，合并照旧只认 CI 全绿和
// main 上的收据」。推送前把关的是 git 的 pre-push 快检（scripts/pre-push-contracts.mjs）；这个 hook 只剩
// 一件事：跳过 git 钩子的推送写法照常放行，但把绕口记进被推那棵树的 .claude/push-bypass.log，交
// check:push-bypass 审计。设计卡 docs/plan/2026-10-24-push-gate-ci.md。
//
// 为什么值得为一个 hook 写测试：它的失效是**静默**的——放行得和正常放行一模一样，留痕记错了树也不报错，
// 只有事后才看得见（记错的树下一次推送被拦，真绕口的那棵却没人审）。
// 每条用例都在临时 git 仓的真实 worktree 上跑真实 hook（喂真实的 PreToolUse JSON），不 mock git——
// 这个 hook 的栖息地正是「git worktree 的路径 / 远端跟踪分支语义」，mock 掉就测不到了。
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, test } from 'node:test'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOOK = path.join(repoRoot, 'scripts', 'claude-hooks', 'pre-push-check.sh')
/** 2026-10-24 之前 `pnpm run gates` 全过才盖的那枚戳的文件名。这里故意种下它，证明它不再改变任何判决。 */
const OLD_STAMP_BASENAME = 'nomi-gates-ok'

let sandbox
/** @type {{root: string, gitDir: string}} */
let treeA
/** @type {{root: string, gitDir: string}} */
let treeB

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

/** 起一棵带 origin/main 的 worktree（不需要真远端：直接写 refs/remotes/origin/main），带一个远端还不认识的代码提交。 */
function makeWorktree(base, name) {
  const root = path.join(sandbox, name)
  git(base, 'worktree', 'add', '-q', '-b', `probe/${name}`, root, 'origin/main')
  fs.writeFileSync(path.join(root, 'probe.ts'), 'export const probe = 1\n')
  git(root, 'add', 'probe.ts')
  git(root, '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'probe: code change')
  return { root: git(root, 'rev-parse', '--show-toplevel'), gitDir: git(root, 'rev-parse', '--absolute-git-dir') }
}

/** 跑一次真实 hook，返回 {status, stderr}。cwd 模拟 harness 报的会话目录。 */
function runHook(command, cwd = sandbox, hook = HOOK) {
  const result = spawnSync('bash', [hook], {
    input: JSON.stringify({ cwd, tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    // 清掉真实会话的 CLAUDE_PROJECT_DIR，免得测试被跑测试的那棵树污染。
    env: { ...process.env, CLAUDE_PROJECT_DIR: '', HOOK_CWD: '' },
  })
  return { status: result.status, stderr: result.stderr || '' }
}

const bypassLogOf = (root) => path.join(root, '.claude', 'push-bypass.log')

function clearBypassLogs(...roots) {
  for (const root of roots) fs.rmSync(bypassLogOf(root), { force: true })
}

function bypassRecords(root) {
  const logPath = bypassLogOf(root)
  return fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean) : []
}

function assertBypassRecord(root, command) {
  const records = bypassRecords(root)
  assert.equal(records.length > 0, true, `目标 worktree 应有留痕：${bypassLogOf(root)}`)
  const branch = git(root, 'branch', '--show-current')
  const sha = git(root, 'rev-parse', 'HEAD')
  const commandForLog = command.slice(0, 200)
  const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  assert.match(
    records[0],
    new RegExp(
      `\\|bypass\\|branch=${escaped(branch)}\\|sha=${escaped(sha)}\\|worktree=${escaped(root)}\\|cmd=${escaped(commandForLog)}\\|confirmed=no$`,
    ),
  )
}

function plantOldStamp(tree) {
  const head = git(tree.root, 'rev-parse', 'HEAD')
  fs.writeFileSync(path.join(tree.gitDir, OLD_STAMP_BASENAME), `sha=${head}\nworktree=${tree.root}\ntier=focused\nstamped_at=${new Date().toISOString()}\n`)
}

function removeOldStamp(tree) {
  fs.rmSync(path.join(tree.gitDir, OLD_STAMP_BASENAME), { force: true })
}

before(() => {
  sandbox = makeTempDir('nomi-push-gate-')
  const origin = path.join(sandbox, 'origin')
  fs.mkdirSync(origin)
  git(origin, 'init', '-q', '-b', 'main')
  git(origin, 'config', 'user.email', 'probe@example.com')
  git(origin, 'config', 'user.name', 'probe')
  fs.writeFileSync(path.join(origin, 'seed.ts'), 'export const seed = 0\n')
  git(origin, 'add', '-A')
  git(origin, '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'seed')
  // 假装有远端：hook 只读远端跟踪分支这些 ref，不需要真的能连上。
  git(origin, 'update-ref', 'refs/remotes/origin/main', git(origin, 'rev-parse', 'HEAD'))
  treeA = makeWorktree(origin, 'tree-a')
  treeB = makeWorktree(origin, 'tree-b')
})

after(() => {
  if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true })
})

describe('普通推送一律放行：推送前把关的是 git 的 pre-push 快检，这里不再要求任何本机凭据', () => {
  test('有代码改动、本树从没跑过 pnpm run gates（没有任何戳）→ 放行，且不留痕', () => {
    removeOldStamp(treeA)
    clearBypassLogs(treeA.root)
    for (const [command, cwd] of [
      [`cd ${treeA.root} && git push`, sandbox],
      ['git push origin HEAD:x', treeA.root],
      ['git push -u origin HEAD', treeA.root],
    ]) {
      const { status, stderr } = runHook(command, cwd)
      assert.equal(status, 0, `${command} 应放行：${stderr}`)
    }
    assert.deepEqual(bypassRecords(treeA.root), [], '普通推送不留痕')
  })

  test('写法不同、判法相同：git -C <别的树> / 多个 cd / git -c k=v / git --no-pager → 放行，不留痕', () => {
    clearBypassLogs(treeA.root, treeB.root)
    for (const command of [
      `git -C ${treeB.root} push`,
      `cd ${treeA.root} && cd ${treeB.root} && git push`,
      `cd ${treeB.root} && git -c core.pager=cat push`,
      `git -C ${treeB.root} --no-pager push origin HEAD:x`,
    ]) {
      const { status, stderr } = runHook(command, treeA.root)
      assert.equal(status, 0, `${command} 应放行：${stderr}`)
    }
    assert.deepEqual(bypassRecords(treeA.root), [])
    assert.deepEqual(bypassRecords(treeB.root), [])
  })

  test('种下一枚旧版本机门岗戳也不改变任何判决（有戳不算数，没戳也不拦）', () => {
    const commands = [`cd ${treeA.root} && git push`, `cd ${treeA.root} && git push --no-verify`, `git -C ${treeA.root} --git-dir=x push --no-verify`]
    const verdicts = (planted) => {
      if (planted) plantOldStamp(treeA)
      else removeOldStamp(treeA)
      return commands.map((command) => {
        clearBypassLogs(treeA.root)
        const { status } = runHook(command, sandbox)
        return { command, status, records: bypassRecords(treeA.root).length }
      })
    }
    const without = verdicts(false)
    const withStamp = verdicts(true)
    removeOldStamp(treeA)
    assert.deepEqual(withStamp, without, '旧戳在不在，退出码与留痕必须完全一样')
    assert.deepEqual(without.map(({ status, records }) => [status, records]), [[0, 0], [0, 1], [2, 0]])
  })

  test('不是推送的命令 → 放行', () => {
    for (const command of [`cd ${treeA.root} && git status`, 'echo "git push --no-verify"', 'grep -rn "git push" docs/']) {
      assert.equal(runHook(command, treeA.root).status, 0, command)
    }
  })
})

describe('push 绕口留痕：跳过 git 钩子的推送照常放行，但必须归因到每一棵被推的树', () => {
  test('cd 目标树 → 记录目标树的 branch、sha、worktree', () => {
    const command = `cd ${treeA.root} && git -c core.hooksPath=/dev/null push`
    clearBypassLogs(sandbox, treeA.root)
    assert.equal(runHook(command).status, 0)
    assertBypassRecord(treeA.root, command)
  })

  test('git -C 目标树 → 记录 -C 指定树而不是会话 cwd', () => {
    const command = `git -C ${treeB.root} -c core.hooksPath=/dev/null push`
    clearBypassLogs(sandbox, treeA.root, treeB.root)
    assert.equal(runHook(command, treeA.root).status, 0)
    assertBypassRecord(treeB.root, command)
    assert.deepEqual(bypassRecords(treeA.root), [], '会话目录那棵树不该被记')
  })

  test('一条命令多次 push → 每棵目标树各写一条自己的留痕', () => {
    const command = `cd ${treeA.root} && git -c core.hooksPath=/dev/null push && cd ${treeB.root} && git -c core.hooksPath=/dev/null push`
    clearBypassLogs(sandbox, treeA.root, treeB.root)
    assert.equal(runHook(command).status, 0)
    assert.equal(bypassRecords(treeA.root).length, 1)
    assert.equal(bypassRecords(treeB.root).length, 1)
    assertBypassRecord(treeA.root, command)
    assertBypassRecord(treeB.root, command)
  })

  test('--no-verify：写在子命令后、子命令前、多个 cd 之后都记进真正被推的那棵树', () => {
    for (const [command, target] of [
      [`cd ${treeB.root} && git push --no-verify`, treeB],
      [`git -C ${treeB.root} --no-verify push`, treeB],
      [`cd ${treeB.root} && cd ${treeA.root} && git push origin HEAD:x --no-verify`, treeA],
    ]) {
      clearBypassLogs(sandbox, treeA.root, treeB.root)
      assert.equal(runHook(command).status, 0, command)
      assertBypassRecord(target.root, command)
      const other = target === treeA ? treeB : treeA
      assert.deepEqual(bypassRecords(other.root), [], `${command} 不该记进另一棵树`)
    }
  })

  test('环境变量形式的 core.hooksPath 覆盖 → 同样留痕', () => {
    const command = `cd ${treeA.root} && GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git push`
    clearBypassLogs(treeA.root)
    assert.equal(runHook(command).status, 0)
    assertBypassRecord(treeA.root, command)
  })

  test('有绕口写法却归因不了（--git-dir / --work-tree / 引号不配对）→ exit 2，一条都不记；同样的命令去掉绕口 → 放行', () => {
    for (const [bypass, plain] of [
      [`cd ${treeA.root} && git --git-dir=${treeA.gitDir} push --no-verify`, `cd ${treeA.root} && git --git-dir=${treeA.gitDir} push`],
      [`cd ${treeA.root} && git --work-tree ${treeA.root} -c core.hooksPath=/dev/null push`, `cd ${treeA.root} && git --work-tree ${treeA.root} push`],
      [`cd ${treeA.root} && git push --no-verify "unbalanced`, `cd ${treeA.root} && git push "unbalanced`],
    ]) {
      clearBypassLogs(treeA.root)
      const blocked = runHook(bypass)
      assert.equal(blocked.status, 2, `${bypass} 应 fail-closed：${blocked.stderr}`)
      assert.match(blocked.stderr, /记不下来的绕口不放行/)
      assert.deepEqual(bypassRecords(treeA.root), [], '归因不了就一条都不写，不留半截现场')
      assert.equal(runHook(plain).status, 0, `${plain} 没有绕口写法，应放行`)
    }
  })

  test('命令理解层缺失：有绕口写法 → exit 2；普通推送 → 放行', () => {
    const lonely = makeTempDir('nomi-push-gate-nolib-')
    try {
      const hookCopy = path.join(lonely, 'pre-push-check.sh')
      fs.copyFileSync(HOOK, hookCopy)
      const blocked = runHook(`cd ${treeA.root} && git push --no-verify`, sandbox, hookCopy)
      assert.equal(blocked.status, 2)
      assert.match(blocked.stderr, /命令理解层/)
      assert.equal(runHook(`cd ${treeA.root} && git push`, sandbox, hookCopy).status, 0)
    } finally {
      fs.rmSync(lonely, { recursive: true, force: true })
    }
  })
})

// 2026-09-27 发版 tag 那份合同立的判据（--not --remotes）：已经在某个远端跟踪分支上的提交，再推（打 tag、推到别的
// 远端分支）不带新内容。本机门岗戳删掉后它只决定一件事：这种推送跳过快检不用留痕——没有新东西上远端，漏不掉任何检查。
describe('不带新内容的推送不留痕', () => {
  test('HEAD 的提交都已在远端跟踪分支上 → 跳过钩子也不记；多一个新提交就照记', () => {
    const origin = path.join(sandbox, 'origin')
    const tree = makeWorktree(origin, 'tree-c')
    clearBypassLogs(tree.root)
    assert.equal(runHook(`cd ${tree.root} && git push --no-verify`).status, 0)
    assert.equal(bypassRecords(tree.root).length, 1, '有远端不认识的新提交，跳过钩子必须留痕')

    git(origin, 'update-ref', 'refs/remotes/origin/feature-c', git(tree.root, 'rev-parse', 'HEAD'))
    clearBypassLogs(tree.root)
    assert.equal(runHook(`cd ${tree.root} && git push --no-verify origin v1.2.3`).status, 0)
    assert.deepEqual(bypassRecords(tree.root), [], '提交已在远端跟踪分支上，不带新内容，不该留痕')

    fs.writeFileSync(path.join(tree.root, 'probe-new.ts'), 'export const fresh = 1\n')
    git(tree.root, 'add', 'probe-new.ts')
    git(tree.root, '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'probe: brand new code')
    assert.equal(runHook(`cd ${tree.root} && git push --no-verify`).status, 0)
    assert.equal(bypassRecords(tree.root).length, 1, '出现远端不认识的新提交，仍要留痕')
  })
})
