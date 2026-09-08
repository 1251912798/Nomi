#!/usr/bin/env node
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, promisify } from 'node:util'
import { execFileSync, execFile } from 'node:child_process'
import { createWalkSession } from '../tests/ux/_assert.mjs'
import { launchNomiApp } from '../tests/ux/_launchApp.mjs'
import { createAgentRuntimeFixture } from '../tests/ux/agent-runtime-fixture.mjs'
import { DOCUMENT } from '../tests/ux/agent-runtime-walk-support.mjs'
import { startEvidence, copyTranscripts, writeJson, saveCase, saveReport } from '../tests/ux/g1/sweep-evidence.mjs'
import { prepareRealText, attachRealText } from '../tests/ux/g1/sweep-real.mjs'
import { inspectMcp } from '../tests/ux/g1/sweep-mcp.mjs'
import { runSurface } from '../tests/ux/g1/sweep-surfaces.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { values } = parseArgs({ options: { packaged: { type: 'string' }, 'real-text': { type: 'boolean' },
  budget: { type: 'string', default: '3' }, case: { type: 'string' }, help: { type: 'boolean' } } })
if (values.help) {
  console.log('pnpm run sweep [--packaged /absolute/Nomi.app] [--budget 3] [--case C0] [--real-text]')
  process.exit(0)
}
const budgetCny = Number(values.budget)
if (!Number.isFinite(budgetCny) || budgetCny < 0 || budgetCny > 3) throw Error('Sweep budget must be 0–3 CNY')
const runId = new Date().toISOString().replaceAll(':', '-'), directory = path.join(root, 'artifacts/sweep', runId)
fs.mkdirSync(directory, { recursive: true })
const cases = JSON.parse(fs.readFileSync(path.join(root, 'tests/ux/g1/cases.json'), 'utf8'))
const runs = [], skipped = []
if (values.case && !cases.some(c => c.id === values.case)) throw Error(`Unknown case: ${values.case}`)
const sourceFiles = ['scripts/sweep.mjs', 'tests/ux/_assert.mjs', 'tests/ux/_collect.mjs', ...fs.readdirSync(path.join(root, 'tests/ux/g1')).filter(f => /\.(mjs|json)$/.test(f)).map(f => `tests/ux/g1/${f}`)]
writeJson(path.join(directory, 'source-files.json'), Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])))
writeJson(path.join(directory, 'run.json'), { runId, sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), budgetCny, mode: values['real-text'] ? 'real-text' : 'loopback', packaged: values.packaged ?? null })
for (const entry of cases) for (const input of entry.inputs) {
  const id = `${entry.id}-${input.id}`
  if (values.case && values.case !== entry.id) continue
  if (input.status !== 'runnable-now') { skipped.push({ id, status: input.status, reason: input.reason }); continue }
  const target = path.join(directory, id), profile = path.join(target, 'profile')
  fs.mkdirSync(target, { recursive: true })
  const record = { id, surface: input.surface, costCny: 0, stations: [], deviations: [] }
  runs.push(record)
  let launched, fixture, evidence, projectId, real, billingVerified = false
  const realText = values['real-text'] && ['agent-panel', 'storyboard'].includes(input.surface) && Boolean(input.text)
  const ledgerPath = path.join(directory, 'real-budget-ledger.json')
  const priorBilled = fs.existsSync(ledgerPath) ? (JSON.parse(fs.readFileSync(ledgerPath, 'utf8')).billedCny ?? 0) : 0
  const priorReserved = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')).reservedCny : 0
  const payload = async () => projectId ? (await launched.win.evaluate(id => window.nomiDesktop.projects.readAsync(id), projectId)).payload : null
  const walk = createWalkSession({ mode: 'collect', cost: () => fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')).reservedCny : 0, capture: row => evidence?.capture(row), persist: w => {
    Object.assign(record, { stations: w.stations, deviations: w.deviations }); saveCase(target, w)
  } })
  const station = (id, expected, fn) => walk.station({ id, surface: input.surface, expected }, fn)
  console.log(`SWEEP ${id}`)
  if (input.executor === 'c0') {
    let childError
    try {
      await promisify(execFile)(process.execPath, [path.join(root, 'tests/ux/g1/c0-short-film.walk.mjs'), '--dry-run', ...(values.packaged ? ['--packaged', values.packaged] : [])],
        { cwd: root, env: { ...process.env, NOMI_WALK_MODE: 'collect', NOMI_SWEEP_CASE_DIR: target }, maxBuffer: 1024 * 1024 })
    } catch (error) { childError = error }
    for (const key of ['stations', 'deviations']) if (fs.existsSync(path.join(target, `${key}.json`))) record[key] = JSON.parse(fs.readFileSync(path.join(target, `${key}.json`), 'utf8'))
    Object.assign(walk, { stations: record.stations, deviations: record.deviations })
    if (childError) walk.record(Error(`C0 child failed: ${childError.code ?? 'unknown'}`), { id: 'c0-process', surface: 'storyboard' })
    if (!fs.existsSync(path.join(target, 'trace.zip'))) fs.writeFileSync(path.join(target, 'trace-unavailable.md'), 'C0 tracing did not finish; see deviations.json.\n')
    saveReport(directory, runs, skipped, budgetCny)
    continue
  }
  try {
    if (realText) real = await prepareRealText(profile)
    else fixture = await createAgentRuntimeFixture({ rootDir: root, settingsDir: path.join(profile, 'settings') })
    await station('launch', '独立 profile 启动真实 Electron', async () => {
      let executablePath = values.packaged
      if (executablePath?.endsWith('.app')) executablePath = path.join(executablePath, 'Contents/MacOS/Nomi')
      launched = await launchNomiApp({ name: id, tempRoot: profile, capabilityDir: path.join(profile, 'capability'), settleMs: 0,
        ...(executablePath ? { executablePath } : {}),
        env: { NOMI_RENDERER_URL: '', VITE_DEV_SERVER_URL: '', NOMI_DESKTOP_DEV: '', NOMI_E2E_PRODUCTION_FIXTURE: '0', NOMI_DISABLE_AUTO_UPDATE: '1' } })
      if (real) await attachRealText(launched, { profile, quote: real.quote, ledgerPath, budgetCny, requestsPath: path.join(target, 'model-requests.json') })
      evidence = await startEvidence({ ...launched, directory: target, payload })
      launched.win.setDefaultTimeout(5000)
      await launched.win.evaluate(() => {
        localStorage.setItem('nomi:locale:v1', 'zh-CN')
        for (const key of ['nomi:splash:v1','nomi:journey-tour:v1','nomi:canvas-gesture-hint:v1']) localStorage.setItem(key, 'seen')
      })
      await launched.win.reload({ waitUntil: 'domcontentloaded' })
      await launched.win.getByRole('button', { name: /^新建空白项目/ }).click()
      await launched.win.locator(DOCUMENT).waitFor()
      const projects = await launched.win.evaluate(() => window.nomiDesktop.projects.listAsync())
      projectId = projects[0].id
    })
    await runSurface({ walk, win: launched?.win, input, fixture, realText, directory: target, payload, projectId })
    if (launched && input.surface === 'mcp') await inspectMcp({ profile, directory: target, projectId, packaged: values.packaged, input, walk })
    await station('agent-evidence', '原生转录、请求与工具结果可复盘', async () => {
      // Request bodies are original provider input; authentication headers are never copied.
      if (fixture) writeJson(path.join(target, 'model-requests.json'), fixture.requests.map(r => ({ path: r.path, body: r.body })))
      const files = copyTranscripts(profile, target)
      const agentAttempt = ['agent-panel','storyboard'].includes(input.surface) && Boolean(input.text)
      const tools = JSON.parse(fs.readFileSync(path.join(target, 'tools.json'), 'utf8'))
      writeJson(path.join(target, 'r30.json'), { population: realText ? 'real-text' : 'loopback',
        firstTool: { numerator: tools[0]?.ok ? 1 : 0, denominator: tools.length ? 1 : 0 },
        turns: { numerator: agentAttempt && tools[0]?.ok && !walk.deviations.length ? 1 : 0, denominator: agentAttempt ? 1 : 0 },
        note: realText ? 'Text-only real provider; media prohibited' : 'Synthetic provider; not real-model acceptance' })
      if (agentAttempt && !files.length) throw Error('当前旧运行时没有 pi 原生 JSONL；请求已存，原生转录缺失')
    })
    await station('feel', '复用 main 的体感扫描', async () => {
      const file = path.join(root, 'tests/ux/_feel.mjs')
      if (!fs.existsSync(file)) throw Error('main 尚无 _feel.mjs（#662）；体感扫描未执行')
      const { scanFeel } = await import(new URL('../tests/ux/_feel.mjs', import.meta.url))
      writeJson(path.join(target, 'feel.json'), await scanFeel(launched.win, { label: id }))
    })

  } catch (error) { walk.record(error, { id: 'assembly', surface: input.surface, reachedViaRepair: false }) }
  finally {
    try { if (real && launched) { await launched.app.evaluate(async () => globalThis.__sweepDispatch.snapshot()); billingVerified = true } }
    catch (e) { walk.record(Error('SWEEP_BILLING_UNAVAILABLE'), { id: 'billing', surface: input.surface }) }
    try { if (evidence) await evidence.stop() } catch (e) { walk.record(e, { id: 'trace-stop', surface: input.surface }) }
    try { if (launched) await launched.close() } catch (e) { walk.record(e, { id: 'close', surface: input.surface }) }
    try { if (fixture) await fixture.close() } catch (e) { walk.record(e, { id: 'fixture-close', surface: input.surface }) }
    if (real && fs.existsSync(ledgerPath)) {
      const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
      record.reservedCny = ledger.reservedCny - priorReserved
      record.costCny = billingVerified && Number.isFinite(ledger.billedCny) ? ledger.billedCny - priorBilled : null
      record.costBasis = 'provider token balance delta; shared-token concurrent usage may be included'
      writeJson(path.join(target, 'cost.json'), { costCny: record.costCny, reservedCny: record.reservedCny, basis: record.costBasis })
      fs.rmSync(path.join(profile, 'settings'), { recursive: true, force: true })
    }
    if (realText) fs.rmSync(path.join(profile, 'settings'), { recursive: true, force: true })
    if (!fs.existsSync(path.join(target, 'trace.zip'))) fs.writeFileSync(path.join(target, 'trace-unavailable.md'), 'Electron/tracing did not start or failed; see deviations.json.\n')
    saveCase(target, walk)
    saveReport(directory, runs, skipped, budgetCny)
  }
}
saveReport(directory, runs, skipped, budgetCny)
console.log(`SWEEP_REPORT ${path.join(directory, 'report.md')}`)
// Completed collection can contain product failures; consumers must inspect deviations, not exit status.
