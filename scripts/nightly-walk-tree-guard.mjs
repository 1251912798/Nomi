import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { identityChanges, sourceIdentity } from './package-build-stamp.mjs'

/**
 * 夜跑每条走查跑完之后的「源码树没被写」核对（2026-10-24 立）。
 *
 * 起因：夜跑 run 40035294026 的 b3 批里，一条走查把截图写进了仓库根下一个没被 .gitignore 忽略的目录。
 * 构建戳的源码身份（sourceIdentity，`git add -A` 算）随之漂移，后面 23 条走查起 App 时全被 assertFreshBuild
 * 拒跑，日志里没有一个字指向真凶。判据就用构建戳自己那套源码身份：走查前后不等 = 这条走查改了构建输入。
 *   · 这条判红（退出码 TREE_GUARD_STATUS），点名它新增 / 改动 / 删掉的每一个路径；
 *   · `--restore`（只在 CI）：按「这条走查之前」的树还原这些路径——新增的删掉，改动 / 删掉的从那棵树里取回，
 *     再核一次。还原成功，后面的走查照常跑，不再连坐。
 * 基线存在 `--state` 文件里：第一条走查的基线是构建戳那棵树（批开头的构建自检已证明两者相等），之后每条的
 * 基线是上一条核完后的树——就算还原失败，也只记在改树的那一条头上，不冤枉下一条。
 * 写进被忽略目录（tests/ux/shots、artifacts、.tmp、nightly-walks…）不算：那些不进构建身份，也不会连坐。
 */
export const TREE_GUARD_STATUS = 96

const STAMP_FILE = path.join('dist', 'build-stamp.json')

export function readStampTree(root) {
  const stamp = JSON.parse(fs.readFileSync(path.join(root, STAMP_FILE), 'utf8'))
  if (!stamp.tree) throw new Error(`${STAMP_FILE} 里没有 tree——先跑构建`)
  return stamp.tree
}

/** 把 changes 里的路径还原成 tree 里的样子。只动这几个路径，不碰别的。 */
export function restoreToTree(root, tree, changes) {
  for (const { status, path: file } of changes) {
    if (status === 'A') fs.rmSync(path.join(root, file), { force: true })
    else execFileSync('git', ['restore', `--source=${tree}`, '--worktree', '--', `:(literal)${file}`], { cwd: root, stdio: 'pipe' })
  }
}

/**
 * 核一条走查。baseline 缺省 = 构建戳的树。返回 `{ status, baseline, changes, restored }`：
 * status 0 = 树没变；TREE_GUARD_STATUS = 这条走查改了构建输入。baseline 是下一条走查该用的基线。
 */
export function guardWalkTree({ root, walk, baseline, restore = false, log = console.log }) {
  const before = baseline ?? readStampTree(root)
  const now = sourceIdentity(root).tree
  if (now === before) return { status: 0, baseline: before, changes: [], restored: false }
  const changes = identityChanges(root, before, now) ?? []
  log(`[tree-guard] ✗ ${walk} 改了构建输入（源码树 ${before} → ${now}）。不拦的话，后面的走查起 App 时全会被构建戳拒跑：`)
  for (const { status, path: file } of changes) log(`[tree-guard]   ${status} ${file}`)
  if (!changes.length) log('[tree-guard]   （列不出差异：基线那棵树不在本仓对象库里）')
  log('[tree-guard] 修法：走查的输出写进被忽略的目录（tests/ux/shots/<走查名>、artifacts/、.tmp/）或系统临时目录，不写进仓库。')
  if (!restore) return { status: TREE_GUARD_STATUS, baseline: now, changes, restored: false }
  restoreToTree(root, before, changes)
  const after = sourceIdentity(root).tree
  const restored = after === before
  log(restored
    ? '[tree-guard] 已按这条走查之前的源码树还原，后面的走查照常跑。'
    : `[tree-guard] ✗ 还原失败（还原后 tree=${after}）：后面的走查会被构建戳拒跑，先修这一条。`)
  return { status: TREE_GUARD_STATUS, baseline: restored ? before : after, changes, restored }
}

export function parseGuardArgs(argv) {
  const options = { walk: null, state: null, restore: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--walk') options.walk = argv[++index]
    else if (arg === '--state') options.state = argv[++index]
    else if (arg === '--restore') options.restore = true
    else throw new Error(`不认识的参数：${arg}（用法：--walk <走查> --state <基线文件> [--restore]）`)
  }
  if (!options.walk || !options.state) throw new Error('必须给 --walk 和 --state')
  return options
}

export function runGuardCli({ root, argv, env = process.env, log = console.log }) {
  const options = parseGuardArgs(argv)
  // 还原会把「构建之后」的源码改动一起抹掉：本机跑只报告，还原只在 CI 的一次性检出上做。
  if (options.restore && env.CI !== 'true') throw new Error('--restore 只在 CI（CI=true）上用：本机还原会抹掉你构建之后改的源码')
  const statePath = path.resolve(root, options.state)
  const baseline = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8').trim() || undefined : undefined
  const result = guardWalkTree({ root, walk: options.walk, baseline, restore: options.restore, log })
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, `${result.baseline}\n`)
  return result.status
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runGuardCli({ root: process.cwd(), argv: process.argv.slice(2) })
  } catch (error) {
    console.error(`[tree-guard] ${error.message}`)
    process.exitCode = 2
  }
}
