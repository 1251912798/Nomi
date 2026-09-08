import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const DEFAULT_CANVAS_SCENARIO_TIMEOUT_MS = 8 * 60_000
export const PERFORMANCE_CANVAS_SCENARIO_TIMEOUT_MS = 20 * 60_000
export const MAX_CANVAS_SCENARIO_LOG_BYTES = 32 * 1024 * 1024

export const CRITICAL_CANVAS_SCENARIOS = [
  { id: 'gestures', script: 'tests/ux/canvas-drag-pan-gestures.walk.mjs' },
  { id: 'group-ports', script: 'tests/ux/group-ports.walk.mjs' },
  { id: 'card-stack-persistence', script: 'tests/ux/canvas-card-stack.walk.mjs' },
  { id: 'read-only-reload', script: 'tests/ux/react-flow-read-only.walk.mjs' },
]

export const FULL_CANVAS_SCENARIOS = [
  ...CRITICAL_CANVAS_SCENARIOS,
  { id: 'shortcuts', script: 'tests/ux/canvas-shortcuts.walk.mjs' },
  { id: 'node-context-menu', script: 'tests/ux/canvas-node-context-menu.walk.mjs' },
  { id: 'blank-context-menu', script: 'tests/ux/canvas-context-menu-click.walk.mjs' },
  { id: 'batch-production', script: 'tests/ux/canvas-batch-production.walk.mjs' },
  { id: 'selection-toolbar', script: 'tests/ux/selection-toolbar-vendor.walk.mjs' },
  { id: 'group-baseline', script: 'tests/ux/group-baseline.walk.mjs' },
  { id: 'group-reference-direction', script: 'tests/ux/group-reference-direction.walk.mjs' },
  { id: 'canvas-landing', script: 'tests/ux/p4-s5-canvas-landing.e2e.mjs' },
  { id: 'canvas-reconcile', script: 'tests/ux/p4-s5-canvas-reconcile.e2e.mjs' },
]

// This persistence walk uses a viewport-bound drag target; keep it isolated
// from another Electron window's compositor scheduling while other walks run
// in two bounded workers.
export const SERIAL_CANVAS_SCENARIO_IDS = new Set(['card-stack-persistence'])

export const PERFORMANCE_CANVAS_SCENARIOS = [
  {
    id: 'medium-canvas-performance',
    script: 'tests/ux/canvas-performance-benchmark.e2e.mjs',
    args: ['validation-gate', '--scale', 'M', '--runs', '1'],
    timeoutMs: PERFORMANCE_CANVAS_SCENARIO_TIMEOUT_MS,
  },
]

// CI 把 full 档拆成两个并行 runner 跑（quality-gate.yml 的 canvas-acceptance matrix）。
// 分桶按 2026-09-02 run 33609025386 实测耗时做 LPT 装箱：shard1≈162.5s、shard2≈162.9s。
// 桶是显式清单而不是 index 取模：新场景加进 FULL_CANVAS_SCENARIOS 却没分桶时，
// 每个 shard 启动即 fail-closed 抛错（见 assertFullCanvasShardPartition），场景不可能被静默漏跑。
export const FULL_CANVAS_SHARDS = Object.freeze([
  Object.freeze(['gestures', 'read-only-reload', 'blank-context-menu', 'group-baseline', 'group-reference-direction', 'canvas-reconcile']),
  Object.freeze(['group-ports', 'card-stack-persistence', 'shortcuts', 'node-context-menu', 'batch-production', 'selection-toolbar', 'canvas-landing']),
])

export function assertFullCanvasShardPartition(scenarios = FULL_CANVAS_SCENARIOS, shards = FULL_CANVAS_SHARDS) {
  const assigned = shards.flat()
  const assignedSet = new Set(assigned)
  const scenarioIds = scenarios.map((scenario) => scenario.id)
  const scenarioIdSet = new Set(scenarioIds)
  const duplicated = assigned.filter((id, index) => assigned.indexOf(id) !== index)
  const unknown = assigned.filter((id) => !scenarioIdSet.has(id))
  const missing = scenarioIds.filter((id) => !assignedSet.has(id))
  if (duplicated.length || unknown.length || missing.length) {
    throw new Error(
      `full canvas shard partition is broken: `
        + `missing=[${missing.join(', ')}] unknown=[${unknown.join(', ')}] duplicated=[${duplicated.join(', ')}]. `
        + `Every FULL_CANVAS_SCENARIOS id must appear in exactly one FULL_CANVAS_SHARDS bucket.`,
    )
  }
}

export function parseCanvasShard(spec) {
  const match = /^([0-9]+)\/([0-9]+)$/.exec(String(spec ?? ''))
  if (!match) throw new Error(`invalid canvas shard spec: ${JSON.stringify(spec)} (expected <index>/<total>, e.g. 1/2)`)
  const index = Number(match[1])
  const total = Number(match[2])
  if (total !== FULL_CANVAS_SHARDS.length) {
    throw new Error(`canvas shard total ${total} does not match FULL_CANVAS_SHARDS (${FULL_CANVAS_SHARDS.length})`)
  }
  if (index < 1 || index > total) throw new Error(`canvas shard index ${index} out of range 1..${total}`)
  return { index, total }
}

export function scenariosForProfile(profile, { shard } = {}) {
  if (shard && profile !== 'full') {
    throw new Error(`canvas shard is only supported for the full profile, not: ${profile}`)
  }
  if (profile === 'critical') return CRITICAL_CANVAS_SCENARIOS
  if (profile === 'full') {
    if (!shard) return FULL_CANVAS_SCENARIOS
    assertFullCanvasShardPartition()
    const bucket = new Set(FULL_CANVAS_SHARDS[shard.index - 1])
    return FULL_CANVAS_SCENARIOS.filter((scenario) => bucket.has(scenario.id))
  }
  if (profile === 'performance') return PERFORMANCE_CANVAS_SCENARIOS
  throw new Error(`unknown canvas suite profile: ${profile}`)
}

function text(value) {
  if (value === undefined || value === null) return ''
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value)
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
}

export function summarizeCanvasScenarioFailure({ error, stdout, stderr }) {
  const lines = stripAnsi([text(error), text(stderr), text(stdout)].filter(Boolean).join('\n'))
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
  const marker = lines.findIndex((line) => /WALK FAIL|(?:^|\s)(?:Error|TimeoutError):|❌|ELIFECYCLE|\bFAIL\b/.test(line))
  const relevant = marker >= 0 ? lines.slice(Math.max(0, marker - 2), marker + 10) : lines.slice(-12)
  return relevant.join('\n').slice(0, 4000) || 'scenario exited without an error message'
}

function scenarioLogPath(outputDir, scenarioId) {
  if (!outputDir) return null
  const safeId = scenarioId.replace(/[^a-zA-Z0-9._-]+/g, '-')
  return path.join(outputDir, `${safeId}.log`)
}

function spawnScenario(executable, args, options) {
  return new Promise((resolve) => {
    execFile(executable, args, options, (error, stdout, stderr) => {
      // execFile distinguishes maxBuffer failures by code; only a killed child
      // without an exit code represents our configured timeout.
      if (error?.killed && error.code === null && error.signal === options.killSignal) error.code = 'ETIMEDOUT'
      resolve({
        status: error ? (Number.isInteger(error.code) ? error.code : 1) : 0,
        signal: error?.signal ?? null,
        error, stdout, stderr,
      })
    })
  })
}

export async function runCanvasScenario(scenario, {
  cwd = repoRoot,
  env = process.env,
  spawnProcess = spawnScenario,
  timeoutMs,
  outputDir,
  stdoutWriter = process.stdout,
  stderrWriter = process.stderr,
} = {}) {
  const resolvedTimeoutMs = timeoutMs ?? scenario.timeoutMs ?? DEFAULT_CANVAS_SCENARIO_TIMEOUT_MS
  const startedAt = Date.now()
  const child = await spawnProcess(process.execPath, [scenario.script, ...(scenario.args || [])], {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: MAX_CANVAS_SCENARIO_LOG_BYTES,
    timeout: resolvedTimeoutMs,
    killSignal: 'SIGKILL',
  })
  const stdout = text(child.stdout)
  const stderr = text(child.stderr)
  if (stdout) stdoutWriter.write(stdout)
  if (stderr) stderrWriter.write(stderr)
  const timedOut = child.error?.code === 'ETIMEDOUT'
  if (timedOut) console.error(`[canvas] ${scenario.id} exceeded ${resolvedTimeoutMs}ms and was terminated`)
  const exitCode = child.status ?? 1
  const error = child.error ? String(child.error.message || child.error) : null
  const absoluteLogPath = scenarioLogPath(outputDir, scenario.id)
  if (absoluteLogPath) {
    fs.mkdirSync(path.dirname(absoluteLogPath), { recursive: true })
    const command = [process.execPath, scenario.script, ...(scenario.args || [])].map((arg) => JSON.stringify(arg)).join(' ')
    fs.writeFileSync(absoluteLogPath, [
      `$ ${command}`,
      stdout ? `\n[stdout]\n${stdout.trimEnd()}` : '',
      stderr ? `\n[stderr]\n${stderr.trimEnd()}` : '',
      error ? `\n[spawn error]\n${error}` : '',
      '',
    ].filter((chunk) => chunk !== '').join('\n'))
  }
  return {
    id: scenario.id,
    script: scenario.script,
    args: scenario.args || [],
    exitCode,
    signal: child.signal,
    timedOut,
    timeoutMs: resolvedTimeoutMs,
    error,
    logPath: absoluteLogPath ? path.relative(cwd, absoluteLogPath).split(path.sep).join('/') : null,
    failureSummary: exitCode === 0 ? null : summarizeCanvasScenarioFailure({ error, stdout, stderr }),
    durationMs: Date.now() - startedAt,
  }
}

export async function runCanvasScenarios(scenarios, { concurrency = 1, runScenario = runCanvasScenario, ...options } = {}) {
  if (![1, 2].includes(concurrency)) throw new Error('canvas concurrency must be 1 or 2')
  const results = new Array(scenarios.length)
  const serial = scenarios.filter((scenario) => SERIAL_CANVAS_SCENARIO_IDS.has(scenario.id))
  const parallel = scenarios.filter((scenario) => !SERIAL_CANVAS_SCENARIO_IDS.has(scenario.id))
  if (serial.length) {
    for (const scenario of serial) results[scenarios.indexOf(scenario)] = await runScenario(scenario, options)
  }
  scenarios = parallel
  let next = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, scenarios.length) }, async () => {
    while (next < scenarios.length) {
      const index = next++
      console.log(`[canvas] ${scenarios[index].id}`)
      results[index] = await runScenario(scenarios[index], options)
    }
  }))
  return results
}

export async function runCanvasSuite(profile, { cwd = repoRoot, env = process.env, shard = null, concurrency = profile === 'full' && !shard ? 2 : 1 } = {}) {
  if ((profile !== 'full' || shard) && concurrency !== 1) throw new Error('two workers require unsharded full canvas')
  if (![1, 2].includes(concurrency)) throw new Error('canvas concurrency must be 1 or 2')
  const startedAt = Date.now()
  const suiteLabel = shard ? `${profile} ${shard.index}/${shard.total}` : profile
  const outputName = shard ? `${profile}-${shard.index}of${shard.total}` : profile
  const outputDir = path.join(cwd, 'outputs', 'canvas-acceptance', outputName)
  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.mkdirSync(outputDir, { recursive: true })
  const results = await runCanvasScenarios(scenariosForProfile(profile, { shard }), { cwd, env, outputDir, concurrency })

  const summary = {
    profile,
    concurrency,
    wallMs: Date.now() - startedAt,
    shard: shard ? `${shard.index}/${shard.total}` : null,
    passed: results.filter((result) => result.exitCode === 0).length,
    failed: results.filter((result) => result.exitCode !== 0).length,
    results,
  }
  fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2))
  return { ...summary, suiteLabel }
}

export function parseCanvasSuiteArgv(argv) {
  const [profile = 'critical', ...rest] = argv
  let shard = null
  let concurrency
  for (let index = 0; index < rest.length; index += 1) {
    // npm 吃掉 `--` 分隔符，pnpm 会原样转发（CI 实测：`pnpm run … -- --shard 1/2`
    // 到达脚本时是 `full -- --shard 1/2`）。按 CLI 惯例把独立的 `--` 当作
    // 选项结束符跳过；其余未知参数照旧 fail-closed。
    if (rest[index] === '--') continue
    if (rest[index] === '--concurrency') {
      const value = rest[++index]
      if (!['1', '2'].includes(value)) throw new Error('canvas concurrency must be 1 or 2')
      concurrency = Number(value)
      continue
    }
    if (rest[index] === '--shard') {
      shard = parseCanvasShard(rest[index + 1])
      index += 1
      continue
    }
    throw new Error(`unknown canvas suite argument: ${rest[index]}`)
  }
  return { profile, shard, ...(concurrency === undefined ? {} : { concurrency }) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { profile, shard, concurrency } = parseCanvasSuiteArgv(process.argv.slice(2))
    const summary = await runCanvasSuite(profile, { shard, concurrency })
    console.log(`\ncanvas-${summary.suiteLabel}: ${summary.failed === 0 ? 'PASS' : 'FAIL'} (${summary.passed}/${summary.results.length})`)
    process.exit(summary.failed === 0 ? 0 : 1)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
