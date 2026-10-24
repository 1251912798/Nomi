#!/usr/bin/env node
// push 绕口留痕门岗（2026-09-03；2026-10-24 判据改成不认任何本机凭据）。
//
// 起因：编排者连续多次用 `git -c core.hooksPath=/dev/null push` 绕过 native pre-push 钩子
// （门岗链），且这些推送来自子 agent worktree，Claude Code PreToolUse
// 钩子在那些会话里**不激活**——两层防线同时失效。
//
// 设计原则：「留痕而非禁止」——禁止只会逼出更脏的绕法；留痕让绕口行为变得可审计。
// 推送阶段跳过快检的代价至多是多一轮 CI（完整门岗在 CI，CI 全绿才合并），而快检自己坏了 /
// 本机环境不对时推上去交给 CI 判是合法出路；提交阶段没有合法场景，那边是拒绝
// （docs/lessons/commit-bypass-must-be-blocked-not-audited.md）。
//
// 机制：
//   1. Claude Code PreToolUse(Bash) 钩子（scripts/claude-hooks/pre-push-check.sh）认出跳过 git 钩子的推送写法
//      （`--no-verify`、`-c core.hooksPath=` 及其环境变量形式），在被推的那棵树的 `.claude/push-bypass.log`
//      追加一条记录（含分支/SHA/时间/命令）。
//   2. 本门岗（`check:push-bypass`）读 push-bypass.log：每条 confirmed=no 的记录都报红。
//      它在推送前快检（scripts/pre-push-contracts.mjs）里每次都跑，所以没确认的绕口会拦下这棵树的下一次正常推送。
//   3. 人看过之后用 `--accept <sha>` 标记确认，或用 `--clear-confirmed` 删除已确认的行，减少噪音。
//
// 为什么不再自动确认（2026-10-24）：以前「那棵树里有同一 SHA 的本机门岗戳（本机 `pnpm run gates` 全过才盖）」
// 就自动确认。用户拍板改成 CI 把关——推送前本机只跑快检，完整门岗交给 CI——这枚戳连同签发方整套删除，
// 本机从此没有任何「完整门岗过了」的凭据，那个结论只在 CI 上。所以这里**不读任何本机文件来放行**：
// 有戳不算数，没戳也不因此判红；确认只能是人看过之后的 `--accept`（看 CI 在那个 SHA 上是否全绿，
// 或在那棵树补跑一次快检）。
//
// 日志格式（每行）：
//   <ISO-timestamp>|bypass|branch=<branch>|sha=<sha>|worktree=<path>|cmd=<cmd>|confirmed=no
//
// 门岗判定：confirmed=yes 的行不计入红灯；confirmed=no 的行一律报红。
// 门岗本身是「零容忍」的——没有棘轮基线，每条未确认绕口当场报红。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 测试时可通过 NOMI_BYPASS_LOG_OVERRIDE 注入隔离路径，避免污染真实 .claude/push-bypass.log
const BYPASS_LOG = process.env.NOMI_BYPASS_LOG_OVERRIDE ?? path.join(repoRoot, '.claude', 'push-bypass.log')

// ── 解析命令行 ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const acceptIdx = args.indexOf('--accept')
const acceptSha = acceptIdx !== -1 ? args[acceptIdx + 1] : null
const clearConfirmed = args.includes('--clear-confirmed')

// ── 日志不存在 → 零绕口 → 直接通过 ─────────────────────────────────────────
if (!fs.existsSync(BYPASS_LOG)) {
  console.log('check:push-bypass: 无绕口记录，通过。')
  process.exit(0)
}

const raw = fs.readFileSync(BYPASS_LOG, 'utf8')
let lines = raw.split('\n').filter((l) => l.trim())

// ── --clear-confirmed：删掉已确认的行 ────────────────────────────────────────
if (clearConfirmed) {
  const before = lines.length
  lines = lines.filter((l) => !l.includes('confirmed=yes'))
  fs.writeFileSync(BYPASS_LOG, lines.join('\n') + (lines.length ? '\n' : ''))
  console.log(`check:push-bypass: 已删除 ${before - lines.length} 条已确认记录。`)
  if (lines.length === 0) { process.exit(0) }
}

// ── --accept <sha>：把指定 SHA 的记录标记为已确认 ────────────────────────────
if (acceptSha) {
  let changed = 0
  lines = lines.map((l) => {
    if (l.includes(`sha=${acceptSha}`) && l.includes('confirmed=no')) {
      changed++
      return l.replace('confirmed=no', 'confirmed=yes')
    }
    return l
  })
  if (changed > 0) {
    fs.writeFileSync(BYPASS_LOG, lines.join('\n') + '\n')
    console.log(`check:push-bypass: 已确认 SHA ${acceptSha} 的 ${changed} 条绕口记录。`)
  } else {
    console.warn(`check:push-bypass: 未找到 sha=${acceptSha} 且 confirmed=no 的记录。`)
  }
  // Re-read after mutation and continue to check
  lines = fs.readFileSync(BYPASS_LOG, 'utf8').split('\n').filter((l) => l.trim())
}

// ── 每条未确认记录都报红（不读任何本机凭据来自动放行，见文件头）────────────────
const unconfirmed = lines.filter((l) => l.includes('confirmed=no'))

if (unconfirmed.length === 0) {
  console.log('check:push-bypass: 所有绕口记录已确认，通过。')
  process.exit(0)
}

const red = unconfirmed.map((line) => {
  const fields = Object.fromEntries(
    line.split('|').slice(1).map((f) => {
      const eq = f.indexOf('=')
      return eq === -1 ? [f, ''] : [f.slice(0, eq), f.slice(eq + 1)]
    })
  )
  return { branch: fields.branch, sha: fields.sha, worktree: fields.worktree, cmd: fields.cmd }
})

console.error(`\n⛔ check:push-bypass：${red.length} 条 push 绕口还没确认（那几次推送跳过了 git 的 pre-push 快检）\n`)
for (const { branch, sha, worktree, cmd } of red) {
  console.error(`  分支: ${branch || '(未知)'}`)
  console.error(`  SHA:  ${sha ? sha.slice(0, 12) : '(未知)'}`)
  console.error(`  路径: ${worktree || '(未知)'}`)
  console.error(`  命令: ${cmd || '(未知)'}`)
  console.error()
}
console.error('处置方式：')
console.error('  1. 先看那次推送为什么跳过快检，再确认它没漏掉问题：CI 在该 SHA 上全绿，')
console.error('     或在那棵树补跑一次快检 `node scripts/pre-push-contracts.mjs` 通过；然后')
console.error('     node ./scripts/check-push-bypass.mjs --accept <sha>')
console.error('  2. 清理已确认的记录：')
console.error('     node ./scripts/check-push-bypass.mjs --clear-confirmed')
console.error('  （本机不再有「完整门岗过了」的凭据，任何戳都不会自动确认；完整门岗的结论只在 CI 上。）')
console.error()
process.exit(1)
