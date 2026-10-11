import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupTestTemp, makeTempDir } from './_test-temp.mjs'

// 类级回归测试：裸 NUL 门岗。
//
// 钉的不是「那 9 个文件修好了没」（那是快照，改一行就过期），而是**不变量**：
// 源码里出现裸 NUL 就必须报红，且新写的、还没 git add 的文件同样算数——
// 后者正是写门岗时踩到的坑：第一版用 `git ls-files`（只列已跟踪），于是门岗扫不到自己，
// 脚本自身当时含裸 NUL 却报「全仓通过」。漏掉「新文件」等于对最常见的引入路径失明。
//
// 探针只写进临时夹具仓库（git init 的空仓），**绝不写真仓库**：2026-10-11 探针落在 scripts/ 下，
// 与推送前钩子并发的其它门岗列文件时撞车（存在时误报、刚删时 ENOENT），拦了一个无关分支的推送。
// 门岗用 `--root <dir>` 指向夹具。
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GATE = path.join(repoRoot, 'scripts', 'check-source-nul-bytes.mjs')
const NUL = String.fromCharCode(0)

// 门岗平时 <1s。2026-09-24 与 10-02 两次 CI 的 Unit job 都死在这个文件上（它是当时唯一没出结果的测试文件，
// 日志静默 1~2 小时直到人工取消）：execFileSync 同步阻塞事件循环，vitest 的 testTimeout 根本触发不了，
// 子进程一旦不返回，整个 worker 和整个 job 就跟着不返回。给同步子进程自带 timeout，卡住就杀掉并红在这里。
const CHILD_TIMEOUT_MS = 25_000
const GIT_OPTIONS = { timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL' } as const

let fixtureRoot: string | null = null

afterEach(() => {
  if (fixtureRoot) cleanupTestTemp(fixtureRoot)
  fixtureRoot = null
})

/** 建一个空的临时 git 仓（门岗用 git ls-files 列文件，需要最小的仓结构）。 */
function makeFixtureRepo(): string {
  const root = makeTempDir('nomi-nul-gate-')
  fixtureRoot = root
  execFileSync('git', ['init', '-q'], { cwd: root, ...GIT_OPTIONS })
  return root
}

/** 超时时留证据：门岗会逐个 readFileSync 未跟踪文件，卡住最可能是读到 FIFO / 设备 / 无限流 / 正在写的巨型文件。 */
function describeUntrackedFiles(root: string): string {
  try {
    const listed = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', ...GIT_OPTIONS })
    const files = listed.split(NUL).filter(Boolean).slice(0, 50)
    if (files.length === 0) return '（无未跟踪文件）'
    return files.map((relative) => {
      try {
        const stat = fs.lstatSync(path.join(root, relative))
        const kind = stat.isSymbolicLink() ? '软链接' : stat.isFile() ? '文件' : '其他'
        const target = stat.isSymbolicLink() ? ` -> ${fs.readlinkSync(path.join(root, relative))}` : ''
        return `- ${relative}  [${kind}, ${stat.size} 字节]${target}`
      } catch (error) {
        return `- ${relative}  [lstat 失败: ${(error as Error).message}]`
      }
    }).join('\n')
  } catch (error) {
    return `（列未跟踪文件也失败: ${(error as Error).message}）`
  }
}

/** 跑门岗：给 root 就扫夹具仓；不给就只读地扫真仓库（阳性对照）。 */
function runGate(root?: string): { code: number; output: string } {
  try {
    const stdout = execFileSync('node', root ? [GATE, '--root', root] : [GATE], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...GIT_OPTIONS })
    return { code: 0, output: stdout }
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string; code?: string }
    // 超时不是「门岗判红」：不能让它混进 code !== 0，否则下面的红例会在门岗根本没跑完时假绿。
    if (failure.code === 'ETIMEDOUT') throw new Error(`门岗子进程 ${CHILD_TIMEOUT_MS}ms 内没有返回，已被杀掉。超时当时的未跟踪文件（前 50 个）：\n${root ? describeUntrackedFiles(root) : '（真仓库）'}`)
    return { code: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` }
  }
}

/** 在夹具仓里写一个探针文件（默认不 git add）。 */
function writeProbe(root: string, name: string, contents: string): string {
  const file = path.join(root, `${name}.mjs`)
  fs.writeFileSync(file, contents)
  return file
}

describe('裸 NUL 字节门岗', () => {
  // 阳性对照在夹具仓上做（下一条）：真仓库全量扫描本身就是 check:nul-bytes 门岗，推送前和 CI 都会跑；
  // 自测里再扫一遍真仓库只会在推送前钩子满载时撞子进程超时，不多证明任何东西。
  it('夹具仓里只有干净文件 → 绿（对照：下面的红例确是探针触发的）', () => {
    const root = makeFixtureRepo()
    fs.writeFileSync(path.join(root, 'clean.mjs'), 'export const ok = 1\n')
    const { code, output } = runGate(root)
    expect(code, output).toBe(0)
    expect(output).toContain('扫了 1 个')
  })

  it('已跟踪文件里出现裸 NUL → 红，并指出文件与行号', () => {
    const root = makeFixtureRepo()
    writeProbe(root, 'nul-probe-tracked', `export const key = \`a\${1}${NUL}b\`\n`)
    execFileSync('git', ['add', 'nul-probe-tracked.mjs'], { cwd: root, ...GIT_OPTIONS })
    const { code, output } = runGate(root)
    expect(code).not.toBe(0)
    expect(output).toContain('nul-probe-tracked')
    expect(output).toContain('第 1 行')
  })

  // 门岗第一版就是栽在这一条上：只扫已跟踪文件，新文件完全免检。
  it('**未 git add 的新文件**同样受管（门岗曾因此扫不到自己）', () => {
    const root = makeFixtureRepo()
    const file = writeProbe(root, 'nul-probe-untracked', `const k = "x${NUL}y"\n`)
    const tracked = execFileSync('git', ['ls-files', '-z', path.relative(root, file)], { cwd: root, encoding: 'utf8', ...GIT_OPTIONS })
    expect(tracked.trim(), '这条测试的前提是该文件未被跟踪').toBe('')
    const { code, output } = runGate(root)
    expect(code).not.toBe(0)
    expect(output).toContain('nul-probe-untracked')
  })

  it('转义写法（\\0 / \\u0000）不算违规——运行期等价但文件仍是纯文本', () => {
    const root = makeFixtureRepo()
    writeProbe(root, 'nul-probe-escaped', 'export const a = `x\\0y`\nexport const b = `p\\u0000q`\n')
    const { code, output } = runGate(root)
    expect(code, output).toBe(0)
  })
})
