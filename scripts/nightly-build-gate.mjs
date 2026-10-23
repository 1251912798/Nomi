import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * 汇总表里「构建门」那一行的走查名与退出码。汇总脚本现在还不认它：会把它当成一条名为 build-gate、
 * 退出码 97、带日志路径的普通失败行列出来；构建门失败单独分栏在 #1294（PR-2）。
 */
export const BUILD_GATE_WALK = 'build-gate'
export const BUILD_GATE_STATUS = 97

/**
 * 夜跑每个 job 在走查 / 打包冒烟之前的构建自检：先建好输出目录（和 runner 之后的状态一致），
 * 打印工作树里未跟踪 / 已改的文件（只打印、不判红，下次身份漂移一眼看出是哪个文件），
 * 再跑和每条走查启动时同一条核对 `package-build-stamp.mjs verify`。失败写一行构建门记录并返回非 0。
 */
export function runBuildGate({ root, outDir, resultsFile, log = console.log, now = () => Date.now() }) {
  const started = now()
  fs.mkdirSync(path.join(root, outDir), { recursive: true })
  const run = (args) => spawnSync(args[0], args.slice(1), { cwd: root, encoding: 'utf8' })
  const status = run(['git', 'status', '--porcelain', '--untracked-files=all'])
  log(`git status --porcelain --untracked-files=all:\n${status.stdout || '(clean)'}`)
  const verify = run([process.execPath, path.join(root, 'scripts/package-build-stamp.mjs'), 'verify'])
  log(`${verify.stdout}${verify.stderr}`.trimEnd())
  if (verify.status === 0) return 0
  const logFile = `${outDir}/build-gate.log`
  fs.writeFileSync(path.join(root, logFile), `${status.stdout}\n${verify.stdout}${verify.stderr}`)
  const seconds = Math.round((now() - started) / 1000)
  fs.appendFileSync(path.join(root, resultsFile), `${BUILD_GATE_WALK}\t${BUILD_GATE_STATUS}\t${seconds}\t${logFile}\n`)
  log('构建自检失败：本 job 不启动走查（记为构建门失败）。')
  return 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [outDir = 'nightly-walks', resultsFile = `${outDir}/results-build-gate.tsv`] = process.argv.slice(2)
  process.exitCode = runBuildGate({ root: process.cwd(), outDir, resultsFile })
}
