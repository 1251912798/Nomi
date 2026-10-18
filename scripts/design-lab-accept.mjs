#!/usr/bin/env node
// 从 CI 的 Design Lab (macOS) 运行取回新基线（2026-10-18）。
//
// 基线只认 CI 那台 macOS 机器（tests/ux/design-lab/visualMode.mjs）。CI 判红时会把
// test-results/（含每一格不符或缺失的 -actual.png）和 outputs/design-lab/runner.json
// 打包成 design-lab-evidence 产物；本脚本把它下载回来、按 acceptPlan 替换进 __baselines__，
// 并把 calibration.json 的 calibratedRunner 改成那台机器。下载、替换都在本地，人看过再提交——
// 工作流不拿写仓库的权限。
//
// 用法：pnpm run design-lab:accept -- --run <CI 运行号> [--screen <屏 id>]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { acceptPlan, describeRunner } from '../tests/ux/design-lab/visualMode.mjs'
import { execGhReadSync } from './lib/transientRetry.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_PATHS = Object.freeze({
  baselineRoot: path.join(repoRoot, 'tests/ux/design-lab/__baselines__'),
  calibrationFile: path.join(repoRoot, 'tests/ux/design-lab/calibration.json'),
  downloadRoot: path.join(repoRoot, 'outputs/design-lab'),
})
export const EVIDENCE_ARTIFACT = 'design-lab-evidence'

function argValue(argv, flag) {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function listFiles(root) {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else out.push(path.relative(root, full).split(path.sep).join('/'))
    }
  }
  if (fs.existsSync(root)) walk(root)
  return out
}

/** 下载走共用的瞬断重试边界（check:script-network-retry）；下载失败返回非零，不抛给调用方。 */
function downloadEvidence(runId, dir) {
  try {
    execGhReadSync(['run', 'download', runId, '-n', EVIDENCE_ARTIFACT, '-D', dir])
    return 0
  } catch (error) {
    console.error(String(error?.stderr || error?.message || error).trim())
    return 1
  }
}

/** 只改 calibratedRunner 那一行，其余格式原样保留（这份文件大量是人写的长说明）。 */
export function withCalibratedRunner(calibrationText, identity) {
  const pattern = /^ {2}"calibratedRunner": .*,$/m
  if (!pattern.test(calibrationText)) throw new Error('calibration.json 里找不到顶层 "calibratedRunner" 这一行')
  return calibrationText.replace(pattern, `  "calibratedRunner": ${JSON.stringify(identity)},`)
}

export function main(argv = process.argv.slice(2), { log = console.log, download, paths = DEFAULT_PATHS } = {}) {
  const { baselineRoot, calibrationFile, downloadRoot } = paths
  const runId = argValue(argv, '--run')
  const screen = argValue(argv, '--screen')
  if (!runId || !/^\d+$/.test(runId)) {
    log('用法：pnpm run design-lab:accept -- --run <CI 运行号> [--screen <屏 id>]（运行号在 PR 的 Design Lab (macOS) 任务链接里）')
    return 1
  }
  const target = path.join(downloadRoot, `accept-${runId}`)
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(target, { recursive: true })
  const fetched = (download ?? downloadEvidence)(runId, target)
  if (fetched !== 0) {
    log(`❌ 下载 ${EVIDENCE_ARTIFACT} 失败（运行 ${runId}）。这次运行可能是绿的（绿了不上传产物），或产物已过保留期。`)
    return 1
  }

  const files = listFiles(target)
  const plan = acceptPlan(files, { screen })
  for (const entry of plan) {
    const destination = path.join(baselineRoot, entry.to)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(path.join(target, entry.from), destination)
  }

  const runnerFile = files.find((file) => file.endsWith('outputs/design-lab/runner.json'))
  if (runnerFile) {
    const identity = JSON.parse(fs.readFileSync(path.join(target, runnerFile), 'utf8'))
    fs.writeFileSync(calibrationFile, withCalibratedRunner(fs.readFileSync(calibrationFile, 'utf8'), identity))
    log(`基准机：${describeRunner(identity)}（已写入 calibration.json 的 calibratedRunner）`)
  } else {
    log('⚠️ 产物里没有 runner.json，calibratedRunner 没动。')
  }

  log(`取回 ${plan.length} 张新基线${screen ? `（只取 ${screen} 屏）` : ''}：`)
  for (const entry of plan.slice(0, 20)) log(`  · ${entry.to}`)
  if (plan.length > 20) log(`  …… 另有 ${plan.length - 20} 张`)
  log(`差异图留在 ${path.relative(repoRoot, target) || target}/（-expected / -actual / -diff），提交前对一遍，并在 PR 里附前后对比。`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main())
