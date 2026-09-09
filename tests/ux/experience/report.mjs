import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJson, rubricFile, hash } from './collect.mjs'
import { judgeOffline, judgeInput, metricsFor, validateEvidence } from './judge.mjs'

export const baselineFile = new URL('./experience-baseline.json', import.meta.url)
const md = (value) =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ')
export function fingerprint(run) {
  return {
    ...run.identity.compatibility,
    viewport: run.steps[0].before.dom.viewport,
    theme: run.steps[0].before.dom.theme,
  }
}
export function measuredBaseline(run, rubric) {
  const rules = Object.assign({}, ...rubric.dimensions.map((d) => d.ratchet || {}))
  const metrics = Object.fromEntries(
    Object.entries(rules).map(([key, aggregation]) => {
      const values = run.steps.map((step) => metricsFor(step, rubric)[key])
      if (values.some((v) => !Number.isFinite(v) || v < 0))
        throw new Error(`Missing or invalid baseline metric: ${key}`)
      if (!['sum', 'max'].includes(aggregation)) throw new Error(`Unknown aggregation: ${aggregation}`)
      return [key, aggregation === 'max' ? Math.max(...values) : values.reduce((a, b) => a + b, 0)]
    }),
  )
  return { compatibility: fingerprint(run), metrics }
}
export function compareBaseline(current, previous) {
  if (!previous) return { status: 'unbaselined', regressions: [] }
  if (JSON.stringify(current.compatibility) !== JSON.stringify(previous.compatibility))
    return { status: 'incompatible', regressions: [] }
  if (
    JSON.stringify(Object.keys(current.metrics).sort()) !== JSON.stringify(Object.keys(previous.metrics).sort()) ||
    Object.values(previous.metrics).some((v) => !Number.isFinite(v) || v < 0)
  )
    throw new Error('Invalid or incompatible baseline metrics')
  const regressions = Object.keys(previous.metrics)
    .filter((k) => !Number.isFinite(current.metrics[k]) || current.metrics[k] > previous.metrics[k] + 0.000001)
    .map((metric) => ({ metric, before: previous.metrics[metric], after: current.metrics[metric] }))
  return { status: regressions.length ? 'regressed' : 'pass', regressions }
}
export function tightenBaseline(current, previous) {
  const result = compareBaseline(current, previous)
  if (['incompatible', 'regressed'].includes(result.status))
    throw new Error(`Baseline update rejected: ${result.status}`)
  return current
}

export function validateRunIdentity(run, manifest) {
  if (
    !manifest.runId ||
    !manifest.sourceHash ||
    !Object.keys(manifest.digests || {}).length ||
    run.identity?.runId !== manifest.runId ||
    run.identity?.applicationSha !== manifest.applicationSha ||
    run.identity?.compatibility?.sourceHash !== manifest.sourceHash
  )
    throw new Error('Run identity does not match manifest')
}

export async function writeReport({ outputDir, catalog, initialize = false }) {
  const rubric = await readJson(rubricFile)
  const manifest = await readJson(path.join(outputDir, 'manifest.json'))
  const baseline = await readJson(baselineFile)
  const reports = [],
    lines = [
      '# 真实旅程体验报告',
      '',
      `执行时间：${manifest.startedAt} · 应用 ${manifest.applicationSha} · loopback · 模型费用 0`,
      '',
      '机械规则通过仅表示代理检查通过；主观理解、舒适度仍待评审。初次基线记录现状，不代表认可。',
      '',
    ]
  let failed = false
  for (const id of manifest.selected) {
    const journey = catalog.journeys.find((j) => j.id === id)
    if (!journey) throw new Error(`Unknown journey ${id}`)
    const dir = path.join(outputDir, 'runs', id)
    try {
      const run = await readJson(path.join(dir, 'steps.json'))
      if (run.journey !== id || JSON.stringify(run.expectedSteps) !== JSON.stringify(journey.steps))
        throw new Error('Run does not match selected catalog journey')
      validateRunIdentity(run, manifest)
      for (const [file, expectedHash] of Object.entries(manifest.digests)) {
        const filePath = new URL(`../../../${file}`, import.meta.url)
        if (hash(await fs.readFile(filePath)) !== expectedHash)
          throw new Error('Measurement source changed since collection; recollect')
      }
      await validateEvidence(run, dir)
      const verdict = judgeOffline(run, rubric)
      const current = measuredBaseline(run, rubric),
        comparison = compareBaseline(current, baseline.journeys[id])
      if (initialize) baseline.journeys[id] = tightenBaseline(current, baseline.journeys[id])
      if (['regressed', 'incompatible'].includes(comparison.status)) failed = true
      const findings = verdict.dimensions.flatMap((d) =>
        d.violations.map((v) => ({
          dimension: d.id,
          ...v,
          owner: journey.owner,
          suggestion: `复核 ${d.label} 的截图与原始测量；${rubric.dimensions.find((r) => r.id === d.id).exemption}`,
          severity: null,
        })),
      )
      const report = { journey: id, outcome: run.outcome, verdict, comparison, findings }
      reports.push(report)
      await fs.writeFile(path.join(dir, 'judgement.json'), JSON.stringify(verdict, null, 2) + '\n')
      await fs.writeFile(path.join(dir, 'judge-request.json'), JSON.stringify(judgeInput(run, rubric), null, 2) + '\n')
      lines.push(
        `## ${journey.title}`,
        '',
        `首屏可操作代理：${run.startup?.firstActionableFromLaunchMs?.toFixed(0) ?? '未知'} ms（含测试观测开销；不是 TTI）。`,
        '',
        `任务：已完成 · ${run.steps.length} 个阶段 · 基线：${comparison.status} · [执行证据](runs/${id}/steps.json) · [Trace](runs/${id}/trace.zip)`,
        '',
        '| 维度 | 机械分（非体验分） | 主观分 | 结果 |',
        '| --- | --- | --- | --- |',
      )
      for (const d of verdict.dimensions) lines.push(`| ${d.label} | ${d.score ?? '—'} | 待评审 | ${md(d.reason)} |`)
      lines.push('', '| 度量 | 本次 | 原基线 |', '| --- | --- | --- |')
      for (const [key, value] of Object.entries(current.metrics))
        lines.push(`| ${key} | ${value.toFixed(2)} | ${baseline.journeys[id]?.metrics[key]?.toFixed(2) ?? '未建立'} |`)
      lines.push('', '| 维度 / 指标 | 证据 | 疑似 owner | 建议 |', '| --- | --- | --- | --- |')
      for (const finding of findings)
        lines.push(
          `| ${finding.dimension} / ${finding.metric}: ${finding.value} > ${finding.max} | [${finding.step}](runs/${id}/${finding.screenshot}) | ${finding.owner} | ${md(finding.suggestion)} |`,
        )
      lines.push(
        '',
        '主观分诊：每步下一行动、图标盲猜、文案复述、首屏目标、空间舒适均待人工/VLM；不以离线规则冒充通过。',
        '',
      )
    } catch (error) {
      failed = true
      reports.push({ journey: id, status: 'failed', error: error.message })
      lines.push(`## ${journey.title}`, '', `执行/证据失败：${md(error.message)}。不能评分或录入基线。`, '')
    }
  }
  lines.push(
    '## 本次未选中的登记',
    '',
    ...catalog.journeys
      .filter((j) => !manifest.selected.includes(j.id))
      .map((j) => `- ${j.id}：not-selected（未执行，不声称通过）`),
  )
  if (!manifest.selected.length || new Set(manifest.selected).size !== manifest.selected.length)
    throw new Error('Empty or duplicate execution selection')
  if (initialize && !failed) await fs.writeFile(baselineFile, JSON.stringify(baseline, null, 2) + '\n')
  await fs.writeFile(
    path.join(outputDir, 'report.json'),
    JSON.stringify({ reports, failed, rubricHash: hash(JSON.stringify(rubric)) }, null, 2) + '\n',
  )
  await fs.writeFile(path.join(outputDir, 'report.md'), lines.join('\n') + '\n')
  return { failed, reports }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2),
    root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)))
  const outputDir = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(root, 'artifacts/experience'))
  const catalog = await readJson(path.join(root, 'tests/ux/journeys/catalog.json'))
  const result = await writeReport({ outputDir, catalog, initialize: args.includes('--initialize-baseline') })
  console.log(`Experience report: ${path.join(outputDir, 'report.md')}`)
  if (result.failed) process.exitCode = 1
}
