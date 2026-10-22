#!/usr/bin/env node
// 性能场景统一跑法（用户 2026-10-11：「每个新功能都要做性能分析，并自带以后能重跑的性能测试脚本」）。
//   pnpm run perf:scenarios                         按登记表（tests/perf/scenarios/）逐个跑，每个 ≥5 次，出对照预算和基线的表
//   pnpm run perf:scenarios -- --id <id> --runs 7   只跑一个 / 改次数（不许少于 5）
//   pnpm run perf:scenarios -- --list               只列登记表，不跑
//   pnpm run perf:scenarios -- --smoke --id <id>    1 次冒烟，验证脚本跑得通（不判预算、不许写基线）
//   pnpm run perf:scenarios -- --update-baseline [--noisy]   把这次的数字写回基线（只许协调或验收线用；--noisy = 跑的时候别的线在忙）
//   pnpm run perf:scenarios -- --measure-only --out <文件>    只量不写（每个 ≥5 次、对照预算；不要求已有基线、也不写基线）：另一台机器（Mac 线）交数字用
//   --out <文件>                                    另存一份 JSON 报告（夜跑用）
// 量具全是现有的（Playwright + CDP + PerformanceObserver，见 scripts/perf-scenarios-lib.mjs 的 DRIVERS），这里只负责调、读、比。
// 窗口默认在屏幕外、只用临时目录，不连真实资料（量具自己保证）；先 pnpm run build。
// 退出码：有场景超预算 / 退化（基线没标噪声）/ 没采到数据 = 1。夜跑接法见 docs/engineering/perf-scenarios.md。
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sourceIdentity } from './package-build-stamp.mjs'
import { DRIVERS, MIN_RUNS, SCENARIO_DIR, judge, loadScenarios, summarizeRuns, validateScenarios } from './perf-scenarios-lib.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const argValue = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined }
const has = (name) => args.includes(name)

const entries = loadScenarios(repoRoot)
// 新场景第一次量基线：冒烟和写基线时允许还没有 baseline（门岗 check:perf-scenarios 仍然要求提交的登记表有基线）
const problems = validateScenarios(entries, { exists: (rel) => fs.existsSync(path.join(repoRoot, rel)), skipBaseline: has('--smoke') || has('--update-baseline') || has('--measure-only') || has('--list') })
if (problems.length) {
  console.error(`✖ 登记表不合格，先修（pnpm run check:perf-scenarios）：\n${problems.map((line) => `  · ${line}`).join('\n')}`)
  process.exit(1)
}
const scenarios = entries.map((entry) => entry.data)
const wanted = argValue('--id')
const picked = wanted ? scenarios.filter((scenario) => scenario.id === wanted) : scenarios
if (wanted && picked.length === 0) {
  console.error(`✖ 登记表里没有场景「${wanted}」。现有：${scenarios.map((scenario) => scenario.id).join('、') || '（空）'}`)
  process.exit(1)
}
if (has('--list')) {
  for (const scenario of scenarios) console.log(`${scenario.id}\t${scenario.metrics[0]} 预算 ${scenario.budget}${scenario.budgetStatus === 'proposed' ? '（提议）' : ''}${scenario.budgetDebt ? `（欠账：${scenario.budgetDebt.owner}）` : ''}${scenario.measurement?.state === 'pending' ? '（待测）' : ''}\t基线 ${scenario.baseline ? `${scenario.baseline.median}/${scenario.baseline.p95}` : '（还没量）'}${scenario.baseline?.noisy ? '（有噪声）' : ''}\t${scenario.feature}`)
  process.exit(0)
}

const smoke = has('--smoke')
const updateBaseline = has('--update-baseline')
const runs = smoke ? 1 : Number(argValue('--runs') || MIN_RUNS)
if (smoke && updateBaseline) { console.error('✖ --smoke 只验证脚本跑得通，不能写基线'); process.exit(1) }
if (has('--measure-only') && updateBaseline) { console.error('✖ --measure-only 只量不写，不能和 --update-baseline 一起用'); process.exit(1) }
if (!Number.isInteger(runs) || runs < (smoke ? 1 : MIN_RUNS)) { console.error(`✖ 每个场景至少跑 ${MIN_RUNS} 次取中位数和 p95（要冒烟请用 --smoke）`); process.exit(1) }

const git = (...gitArgs) => { try { return execFileSync('git', gitArgs, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return 'unknown' } }
const machine = `${os.platform()} ${os.arch()} ${os.cpus()[0]?.model?.trim() ?? 'cpu'} x${os.cpus().length} / ${Math.round(os.totalmem() / 2 ** 30)}GB`
// 结果要能对回「到底量的是哪棵树」（V-plibrary F5）：完整 HEAD、工作树是否有未提交改动、构建戳用的源码树 id（和 dist 核戳同一口径）。
const dirtyFiles = git('status', '--porcelain')
const report = { machine, commit: git('rev-parse', '--short', 'HEAD'), head: git('rev-parse', 'HEAD'), dirty: dirtyFiles === 'unknown' ? 'unknown' : dirtyFiles.length > 0, sourceTree: (() => { try { return sourceIdentity(repoRoot).tree } catch { return 'unknown' } })(), date: new Date().toISOString().slice(0, 10), runs, results: [] }

for (const scenario of picked) {
  // 待测场景（measurement.state = pending）：整表跑时跳过、说清还差什么；点名 --id 时照跑（量完写基线就转成已测）。
  if (scenario.measurement?.state === 'pending' && !wanted) {
    console.log(`\n⏸ ${scenario.id}：待测，跳过（${scenario.measurement.reason}）`)
    report.results.push({ id: scenario.id, metrics: { [scenario.metrics[0]]: summarizeRuns([]) }, budget: scenario.budget, verdict: { status: 'pending', note: scenario.measurement.reason } })
    continue
  }
  const driver = DRIVERS[scenario.script]
  const label = `perf-scenarios-${scenario.id}`
  const resultPath = path.join(repoRoot, driver.resultFile(label))
  fs.rmSync(resultPath, { force: true })
  console.log(`\n▶ ${scenario.id}（${scenario.feature}；规模 ${scenario.scale}；${runs} 次）`)
  const run = spawnSync(process.execPath, driver.buildArgs(scenario.script, scenario.args, { runs, label }), { cwd: repoRoot, stdio: 'inherit', env: process.env })
  let values = {}
  if (run.status === 0 && fs.existsSync(resultPath)) {
    try { values = driver.readRuns(JSON.parse(fs.readFileSync(resultPath, 'utf8')), scenario) } catch (error) { console.error(`  读结果失败：${error.message}`) }
  } else console.error(`  量具退出码 ${run.status}，结果文件${fs.existsSync(resultPath) ? '在' : '不在'}`)
  fs.rmSync(resultPath, { force: true })
  const stats = Object.fromEntries(scenario.metrics.map((metric) => [metric, summarizeRuns(values[metric] ?? [])]))
  const primary = stats[scenario.metrics[0]]
  const verdict = smoke ? { status: primary.runs ? 'smoke-ok' : 'no-data', note: '冒烟：不判预算' } : judge(scenario, primary)
  report.results.push({ id: scenario.id, metrics: stats, samples: values, budget: scenario.budget, baseline: scenario.baseline, verdict })
}

console.log(`\n机器：${machine}　提交：${report.commit}`)
console.log('| 场景 | 指标 | 次数 | 中位数 | p95 | 预算 | 基线 中位/p95 | 结论 |')
console.log('|---|---|---:|---:|---:|---:|---|---|')
for (const result of report.results) {
  const [first, ...rest] = Object.entries(result.metrics)
  const baseline = result.baseline ? `${result.baseline.median}/${result.baseline.p95}${result.baseline.noisy ? '（噪声）' : ''}` : '（无）'
  console.log(`| ${result.id} | ${first[0]} | ${first[1].runs} | ${first[1].median ?? '-'} | ${first[1].p95 ?? '-'} | ${result.budget} | ${baseline} | ${result.verdict.status}${result.verdict.note ? `：${result.verdict.note}` : ''} |`)
  for (const [metric, stat] of rest) console.log(`| | ${metric}（只看） | ${stat.runs} | ${stat.median ?? '-'} | ${stat.p95 ?? '-'} | | | |`)
}

if (updateBaseline) {
  for (const result of report.results) {
    const primary = result.metrics[Object.keys(result.metrics)[0]]
    if (!primary.runs || primary.runs < MIN_RUNS) { console.error(`✖ ${result.id} 采样不足 ${MIN_RUNS} 次，不写基线`); process.exitCode = 1; continue }
    const file = path.join(repoRoot, SCENARIO_DIR, `${result.id}.json`)
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    delete data.measurement
    data.baseline = { median: primary.median, p95: primary.p95, runs: primary.runs, machine, date: report.date, commit: report.commit, ...(has('--noisy') ? { noisy: true } : {}) }
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
    console.log(`已写基线：${path.relative(repoRoot, file)}${has('--noisy') ? '（标了 noisy）' : ''}`)
  }
}
const outFile = argValue('--out')
if (outFile) fs.writeFileSync(path.resolve(outFile), `${JSON.stringify(report, null, 2)}\n`)
const bad = report.results.filter((result) => ['over-budget', 'regression', 'no-data'].includes(result.verdict.status))
if (bad.length) { console.error(`\n✖ ${bad.length} 个场景没过：${bad.map((result) => `${result.id}（${result.verdict.status}）`).join('、')}`); process.exitCode = 1 }
