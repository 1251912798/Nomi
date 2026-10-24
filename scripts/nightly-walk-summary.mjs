import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUILD_GATE_STATUS, BUILD_GATE_WALK } from './nightly-build-gate.mjs'
import { execGhReadSync, execGhWriteSync } from './lib/transientRetry.mjs'

export function readRows(root) {
  const rows = []
  if (!fs.existsSync(root)) return rows
  for (const file of fs.readdirSync(root, { recursive: true })) {
    if (!String(file).endsWith('.tsv')) continue
    for (const line of fs.readFileSync(path.join(root, file), 'utf8').split('\n').filter(Boolean)) {
      const [walk, status, seconds, log] = line.split('\t')
      rows.push({ walk, status: Number(status), seconds: Number(seconds), log })
    }
  }
  return rows.sort((a, b) => a.walk.localeCompare(b.walk))
}

/** 整体红阈值（失败率 > 20% 或失败数 > 30，分母不含跳过）；有任何一个 job 构建门失败也算整体红。想调就改这两个常量。 */
export const WAKE_FAIL_RATE = 0.2
export const WAKE_FAIL_COUNT = 30

/**
 * 环境特征表：失败日志命中任一条就归「环境」栏（不是产品回归）。条目来自 2026-10-22 那次夜跑的实测分布
 * （docs/research 的 R-nightly-broken）；新的环境类失败在这里加一行，不要在走查里各自吞。
 */
export const ENV_SIGNATURES = [
  { id: 'local-server-refused', pattern: /ECONNREFUSED|ERR_CONNECTION_REFUSED/, note: '本地服务（Vite 等）连接被拒' },
  { id: 'hardcoded-mac-path', pattern: /ENOENT[^\n]*\/Users\//, note: '写死的 macOS 项目路径不存在' },
  { id: 'module-not-found', pattern: /ERR_MODULE_NOT_FOUND/, note: 'TS / 模块解析失败' },
  { id: 'real-config-missing', pattern: /model-catalog[^\n]*(ENOENT|not found|missing|缺失)/i, note: '测试依赖真实模型配置，CI 上没有' },
  { id: 'real-media-missing', pattern: /ENOENT[^\n]*(Movies|Pictures|real-media)/i, note: '真实媒体目录不存在' },
]

/** 构建门特征：走查名 / 退出码是自检写的那行，或日志里是 assertFreshBuild 的拒跑文案（旧形态的 292 条）。 */
const BUILD_GATE_LOG = /构建产物比源码旧/

/** 一条失败属于哪一栏：gate（构建门）/ env（环境）/ product（产品；含超时、无日志）。 */
export function classifyRow(row, logText) {
  if (row.walk === BUILD_GATE_WALK || row.status === BUILD_GATE_STATUS) return { kind: 'gate', reason: '构建自检未过' }
  if (logText == null) return { kind: 'product', reason: '无日志' }
  if (BUILD_GATE_LOG.test(logText)) return { kind: 'gate', reason: '构建产物比源码旧（assertFreshBuild）' }
  const hit = ENV_SIGNATURES.find((entry) => entry.pattern.test(logText))
  if (hit) return { kind: 'env', reason: hit.note }
  return { kind: 'product', reason: row.status === 124 ? '超时' : '' }
}

/** 是否整体红：返回 { red, reasons }。 */
export function wakeVerdict({ failed, total, gate }) {
  const reasons = []
  if (gate > 0) reasons.push(`${gate} 个 job 构建门失败（没启动走查）`)
  if (total > 0 && failed / total > WAKE_FAIL_RATE) reasons.push(`失败率 ${(failed / total * 100).toFixed(1)}% > ${WAKE_FAIL_RATE * 100}%`)
  if (failed > WAKE_FAIL_COUNT) reasons.push(`失败 ${failed} 条 > ${WAKE_FAIL_COUNT}`)
  return { red: reasons.length > 0, reasons }
}

const COLUMN_TITLES = { gate: '构建 / 门岗', env: '环境', product: '产品' }

function columnSections(columns, withLog) {
  return ['gate', 'env', 'product'].flatMap((kind) => {
    const list = columns[kind]
    const lines = ['', `### ${COLUMN_TITLES[kind]}（${list.length}）`]
    if (!list.length) return lines.concat('无。')
    return lines.concat('| Walkthrough | Exit | Seconds | 判定 |', '|---|---:|---:|---|',
      ...list.map(({ row, reason }) => `| ${row.walk} | ${row.status} | ${row.seconds} | ${reason}${withLog && row.log ? `（${row.log}）` : ''} |`))
  })
}

function banner(wake) {
  return wake.red ? [`## 【夜跑整体红】：${wake.reasons.join('；')}`, ''] : []
}

/** readLog(row) 返回日志文本，读不到返回 null（归产品并标「无日志」，不静默吞）。 */
export function summarizeRows(rows, readLog = () => null) {
  const failed = rows.filter((row) => row.status !== 0 && row.status !== 125)
  const skipped = rows.filter((row) => row.status === 125)
  const columns = { gate: [], env: [], product: [] }
  for (const row of failed) {
    const verdict = classifyRow(row, readLog(row))
    columns[verdict.kind].push({ row, reason: verdict.reason })
  }
  const total = rows.length - skipped.length
  const wake = wakeVerdict({ failed: failed.length, total, gate: columns.gate.length })
  const counts = `Nightly walkthroughs: ${rows.length - failed.length}/${rows.length} passed; ${failed.length} failed; ${skipped.length} skipped.`
  const split = `失败分栏：构建 / 门岗 ${columns.gate.length}，环境 ${columns.env.length}，产品 ${columns.product.length}。`
  const lines = [
    ...banner(wake), counts, split,
    ...columnSections(columns, false),
    ...(skipped.length ? ['', `### 跳过（${skipped.length}）`, '| Walkthrough | Result | Seconds |', '|---|---:|---:|', ...skipped.map((row) => `| ${row.walk} | skipped | ${row.seconds} |`)] : []),
    '', '通过的不逐行列出；逐条结果见 nightly-walks-* artifacts。',
  ]
  return { failed, skipped, columns, wake, total, markdown: `${lines.join('\n')}\n` }
}

/** report job 下载 artifact 后目录被摊平：按文件名在结果根目录下找日志。 */
export function makeLogReader(root) {
  const byName = new Map()
  if (fs.existsSync(root)) for (const file of fs.readdirSync(root, { recursive: true })) byName.set(path.basename(String(file)), path.join(root, String(file)))
  return (row) => {
    const found = byName.get(path.basename(row.log ?? ''))
    try { return found && fs.statSync(found).isFile() ? fs.readFileSync(found, 'utf8') : null } catch { return null }
  }
}

function gh(args) {
  // 只有 issue list 是读：读走带重试的共用边界，评论 / 编辑 / 新建是写，只试一次。
  return args[0] === 'issue' && args[1] === 'list' ? execGhReadSync(args) : execGhWriteSync(args)
}

export const ISSUE_TITLE = '夜跑走查失败'
export const ISSUE_TITLE_RED = '【夜跑整体红】夜跑走查失败'

export function updateIssue({ result, repo, run = gh }) {
  // 按基础标题找（整体红的标题也含它），找到就改同一条 issue 的标题和正文，不新建第二条。
  const existing = JSON.parse(run(['issue', 'list', '--repo', repo, '--state', 'open', '--search', `${ISSUE_TITLE} in:title`, '--json', 'number,title']))
  const { failed, skipped, columns, wake, total } = result
  if (!failed.length) {
    if (existing.length) run(['issue', 'comment', String(existing[0].number), '--repo', repo, '--body', `夜跑 ${new Date().toISOString()} 已恢复：${total} 条全部通过（跳过 ${skipped.length} 条）。`])
    return
  }
  const title = wake.red ? ISSUE_TITLE_RED : ISSUE_TITLE
  const body = [
    ...banner(wake),
    `夜跑时间：${new Date().toISOString()}`,
    `失败 ${failed.length} 条（构建 / 门岗 ${columns.gate.length}，环境 ${columns.env.length}，产品 ${columns.product.length}），共 ${total + skipped.length} 条；跳过 ${skipped.length} 条。`,
    ...columnSections(columns, true),
    '', '完整结果见本次 workflow 的 nightly-walks-* artifacts。',
  ].join('\n')
  if (existing.length) run(['issue', 'edit', String(existing[0].number), '--repo', repo, '--title', title, '--body', body])
  else run(['issue', 'create', '--repo', repo, '--title', title, '--body', body])
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || 'nightly-results'
  const output = process.argv[3] || 'nightly-summary.md'
  const rows = readRows(root)
  const result = summarizeRows(rows, makeLogReader(root))
  fs.writeFileSync(output, result.markdown)
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.markdown)
  if (process.env.GH_REPO) updateIssue({ result, repo: process.env.GH_REPO })
}
