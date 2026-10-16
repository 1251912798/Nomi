// 性能场景登记表（单一 owner，2026-10-11 用户拍板「每个新功能都要做性能分析，并自带以后能重跑的性能测试脚本」）。
// 一条一个文件：tests/perf/scenarios/<id>.json。本模块是登记表的唯一读写口：
//   · check:perf-scenarios（结构门岗）调 loadScenarios + validateScenarios；
//   · pnpm run perf:scenarios（scripts/perf-scenarios.mjs，统一跑法）调 DRIVERS + 统计函数；
//   · check:pr-judgement 的 `perf-scenario` 证据行（scripts/pr-judgement-lib.mjs）调 parsePerfEvidence + scenarioIds。
// 不自写剖析器：量具是现有的 Playwright + CDP + PerformanceObserver 脚本（DRIVERS 里列的那几个），本模块只管登记、跑、读、比。
import fs from 'node:fs'
import path from 'node:path'

export const SCENARIO_DIR = 'tests/perf/scenarios'
/** 可选的指标。登记表的 budget / baseline 对应 metrics[0]（主指标），其余指标只打印、不判。 */
export const METRICS = Object.freeze(['response', 'frameGapP95', 'longTasks', 'openToInteractive', 'mainRoundTripMax'])
export const MIN_RUNS = 5
/** 预算状态：proposed = 实现线提议、等安静窗口量完基线由协调定；approved = 已定。不写 = 已定（老条目）。 */
export const BUDGET_STATUSES = Object.freeze(['proposed', 'approved'])
/** 夜跑 / 对照基线时，中位数比基线差超过这个比例算退化。 */
export const REGRESSION_RATIO = 1.2
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

// ── 量具适配：登记表的 script 只能是这里列出的现有量具（新量具要先在这里写读结果的适配）──────────────────────
// buildArgs(args, { runs, label }) → node 的参数；resultFile(label) → 量具写出的结果文件（相对仓库根）；
// readRuns(payload, scenario) → { <metric>: number[] }（每次采样一个数）。
function firstRow(payload) {
  return (payload.results ?? []).find((row) => !row.skipped && Array.isArray(row.samples) && row.samples.length) ?? null
}

export const DRIVERS = Object.freeze({
  // 帧间隔 + 长任务：画布规模基准（tests/perf/canvas-scale-bench.mjs，自带 CDP 指标与 rAF 探针）；
  // 工作台场景（tests/perf/canvas-scale/workbenchScenarios.mjs）另有 responseMs（操作 → 界面到位）与主进程往返峰值。
  'tests/perf/canvas-scale-bench.mjs': {
    supports: ['frameGapP95', 'longTasks', 'response', 'mainRoundTripMax'],
    buildArgs: (script, args, { runs, label }) => [script, ...args, '--runs', String(runs), '--label', label],
    resultFile: (label) => `tests/perf/results/canvas-scale-${label}.json`,
    readRuns(payload) {
      const row = firstRow(payload)
      if (!row) return {}
      const pick = (key) => row.samples.map((sample) => sample[key]).filter(isNumber)
      return { frameGapP95: pick('frameP95Ms'), longTasks: pick('longTasks'), response: pick('responseMs'), mainRoundTripMax: pick('mainRoundTripMaxMs') }
    },
  },
  // 打开项目到能操作（分阶段计时，用户每天早上那一下 = cold）；带 --library-projects 时另量「回项目库 → 卡片全到位」（response）。
  'tests/ux/project-open-stages.e2e.mjs': {
    supports: ['openToInteractive', 'longTasks', 'response'],
    buildArgs: (script, args, { runs, label }) => [script, label, ...args, '--runs', String(runs)],
    resultFile: (label) => `tests/ux/perf-results/project-open-${label}.json`,
    readRuns(payload) {
      const cold = (payload.samples ?? []).filter((sample) => sample.kind === 'cold')
      return {
        openToInteractive: cold.map((sample) => sample.clickToMediaMs),
        longTasks: cold.map((sample) => sample.longTaskCount),
        response: cold.map((sample) => sample.backToLibraryMs).filter(isNumber),
      }
    },
  },
})

// ── 登记表读取与校验 ───────────────────────────────────────────────────────────────────────────────────────────
export function loadScenarios(root) {
  const dir = path.join(root, SCENARIO_DIR)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort().map((name) => {
    const file = `${SCENARIO_DIR}/${name}`
    try {
      return { file, data: JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) }
    } catch (error) {
      return { file, data: null, parseError: error instanceof Error ? error.message : String(error) }
    }
  })
}

export const scenarioIds = (entries) => entries.map((entry) => entry.data?.id).filter(Boolean)

/**
 * 登记表结构校验（门岗判据，纯函数）：
 *   id 唯一且与文件名一致；script 存在、且是 DRIVERS 里有适配的现有量具；metrics 来自固定集合且量具支持；
 *   budget 是正数；baseline 的 median / p95 / runs 是数字，runs ≥ MIN_RUNS，machine / date / commit 齐全。
 * exists(relPath) → boolean。返回错误行数组，空 = 通过。
 */
export function validateScenarios(entries, { exists, skipBaseline = false }) {
  const errors = []
  const seen = new Map()
  for (const { file, data, parseError } of entries) {
    const fail = (message) => errors.push(`${file}：${message}`)
    if (parseError || !data || typeof data !== 'object') { fail(`JSON 读不了${parseError ? `（${parseError}）` : ''}`); continue }
    if (typeof data.id !== 'string' || !ID_PATTERN.test(data.id)) fail('id 必须是小写字母数字加连字符')
    else {
      if (`${SCENARIO_DIR}/${data.id}.json` !== file) fail(`文件名要和 id 一致（${data.id}.json）`)
      if (seen.has(data.id)) fail(`id「${data.id}」和 ${seen.get(data.id)} 重复`)
      else seen.set(data.id, file)
    }
    if (typeof data.feature !== 'string' || data.feature.trim().length < 4) fail('feature 要用一句话写清是哪个功能')
    if (typeof data.scale !== 'string' || data.scale.trim().length < 2) fail('scale 要写最坏规模（例如「150 个图片节点」）')
    const driver = DRIVERS[data.script]
    if (typeof data.script !== 'string' || !exists(data.script)) fail(`script 不存在：${data.script ?? '(缺)'}`)
    else if (!driver) fail(`script ${data.script} 还没有适配：先在 scripts/perf-scenarios-lib.mjs 的 DRIVERS 里写它的参数与读结果（现有量具：${Object.keys(DRIVERS).join('、')}）`)
    if (!Array.isArray(data.args) || data.args.some((arg) => typeof arg !== 'string')) fail('args 必须是字符串数组')
    else if (data.args.some((arg) => arg === '--runs' || arg === '--label')) fail('args 里不要写 --runs / --label（统一跑法会按次数和标签补）')
    if (!Array.isArray(data.metrics) || data.metrics.length === 0 || data.metrics.some((metric) => !METRICS.includes(metric))) fail(`metrics 必须从 ${METRICS.join(' / ')} 里选（至少一项，第一项是主指标）`)
    else if (driver && data.metrics.some((metric) => !driver.supports.includes(metric))) fail(`量具 ${data.script} 只量 ${driver.supports.join(' / ')}，metrics 里有它量不出的`)
    if (!isNumber(data.budget) || data.budget <= 0) fail('budget 必须是正数（主指标的预算，单位 ms 或次数）')
    // 预算是「提议」还是「已定」：提议的预算必须写依据（感知阈值、同类场景的数字），协调量完基线后改成 approved。
    if (data.budgetStatus !== undefined && !BUDGET_STATUSES.includes(data.budgetStatus)) fail(`budgetStatus 只能是 ${BUDGET_STATUSES.join(' / ')}`)
    if (data.budgetStatus === 'proposed' && (typeof data.budgetBasis !== 'string' || data.budgetBasis.trim().length < 10)) fail('提议的预算（budgetStatus: proposed）要在 budgetBasis 写依据：人的感知阈值、现有同类场景的数字')
    const baseline = data.baseline
    if (skipBaseline) { /* 新场景第一次量基线：--smoke / --update-baseline 时不要求已有基线 */ } else if (!baseline || typeof baseline !== 'object') fail('缺 baseline（先跑 pnpm run perf:scenarios --id <id> --update-baseline）')
    else {
      for (const key of ['median', 'p95']) if (!isNumber(baseline[key])) fail(`baseline.${key} 必须是数字`)
      if (!isNumber(baseline.runs) || baseline.runs < MIN_RUNS) fail(`baseline.runs 必须是数字且 ≥ ${MIN_RUNS}`)
      for (const key of ['machine', 'date', 'commit']) if (typeof baseline[key] !== 'string' || !baseline[key].trim()) fail(`baseline.${key} 不能空`)
    }
  }
  return errors
}

// ── 统计与判定 ─────────────────────────────────────────────────────────────────────────────────────────────────
/** 线性插值分位数（与 project-open-stages 的 percentile 同口径）。 */
export function quantile(values, q) {
  const sorted = values.filter(isNumber).slice().sort((a, b) => a - b)
  if (!sorted.length) return null
  const index = (sorted.length - 1) * q
  const low = Math.floor(index)
  const high = Math.ceil(index)
  return Math.round((sorted[low] + (sorted[high] - sorted[low]) * (index - low)) * 10) / 10
}
export const summarizeRuns = (values) => ({ runs: values.filter(isNumber).length, median: quantile(values, 0.5), p95: quantile(values, 0.95) })

/** 对照预算与基线：超预算 = over-budget；中位数比基线差 >20% = regression；否则 ok。基线噪声大时只提示，不当失败。 */
export function judge(scenario, stats) {
  if (stats.median === null) return { status: 'no-data', note: '没采到数据' }
  if (stats.median > scenario.budget) return { status: 'over-budget', note: `中位数 ${stats.median} > 预算 ${scenario.budget}` }
  const base = scenario.baseline?.median
  if (isNumber(base) && base > 0 && stats.median > base * REGRESSION_RATIO) {
    return { status: scenario.baseline.noisy ? 'regression-noisy' : 'regression', note: `中位数 ${stats.median} 比基线 ${base} 差 ${Math.round((stats.median / base - 1) * 100)}%${scenario.baseline.noisy ? '（基线标了有噪声，只提示）' : ''}` }
  }
  return { status: 'ok', note: '' }
}

// ── PR 正文里的 perf-scenario 证据行 ──────────────────────────────────────────────────────────────────────────
/**
 * `- perf-scenario：<id> 中位数 X / p95 Y / 预算 Z`。返回 { ok, id?, reason? }。
 * 「未验证：原因」不算通过（新功能的硬要求：没有量具就先写量具）；确实与性能无关的改动写「不适用：理由」，理由要具体（≥6 字）。
 * knownIds 给了就核对：id 必须在登记表里。
 */
export function parsePerfEvidence(line, knownIds = null) {
  const text = String(line || '')
  const na = /不适用\s*[:：]\s*(\S.*)/.exec(text)
  if (na) return na[1].trim().length >= 6 ? { ok: true, notApplicable: true } : { ok: false, reason: '「不适用」要写具体理由（至少 6 个字，说清为什么这个改动碰不到交互 / 规模 / 长任务）' }
  if (/未验证\s*[:：]/.test(text)) return { ok: false, reason: '性能证据不接受「未验证」：没有量具就按 tests/perf/scenarios/ 的格式补一个场景，再交数字' }
  const match = /perf-scenario\s*[:：]\s*([a-z0-9][a-z0-9-]*)\s+中位数\s*([\d.]+)\s*(?:ms)?\s*\/\s*p95\s*([\d.]+)\s*(?:ms)?\s*\/\s*预算\s*([\d.]+)/i.exec(text)
  if (!match) return { ok: false, reason: '格式要写成「perf-scenario：<场景 id> 中位数 X / p95 Y / 预算 Z」' }
  const [, id] = match
  if (knownIds && !knownIds.includes(id)) return { ok: false, id, reason: `场景 id「${id}」不在登记表（${SCENARIO_DIR}/）里` }
  return { ok: true, id }
}
