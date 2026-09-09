import { stationTimeout } from '../_station-budget.mjs'
import fs from 'node:fs'
import { expect } from '@playwright/test'
import { readEventsLog } from '../../../evals/lib/isoApp.mjs'
import path from 'node:path'
import { createWalkSession } from '../_assert.mjs'
import { startEvidence, saveCase, copyTranscripts, writeJson, scoreCollectedAgent } from './sweep-evidence.mjs'
import { repairStoryboard, c0RepairPlan } from './sweep-repair.mjs'

export function createC0Collection(directory, report) {
  let evidence, read, win, app, projectId, evidencePrefix = '', restart = 0
  const walk = createWalkSession({ mode: 'collect', cost: () => report.costCny ?? 0,
    persist: w => saveCase(directory, w), capture: async entry => {
      const captured = await evidence?.capture(entry)
      return captured ? { ...captured, screenshot: evidencePrefix + captured.screenshot, store: evidencePrefix + captured.store } : {}
    } })
  return {
    walk,
    async attach(launched, payload, getProjectId) {
      win = launched.win
      app = launched.app
      read = payload
      projectId = getProjectId
      evidencePrefix = restart ? 'restart/' : ''
      const dest = restart++ ? path.join(directory, 'restart') : directory
      fs.mkdirSync(dest, { recursive: true })
      evidence = await startEvidence({ ...launched, directory: dest, payload: () => read() })
    },
    async stop() {
      if (evidence) { const current = evidence; evidence = null; await current.stop() }
    },
    async step(id, action, expected, run, interruption) {
      if (id === '04' && process.env.NOMI_C0_MEDIA_DRY_RUN === '1') action = '确认并生成八段本地测试信号（媒体 dry-run，非成片）'
      const repair = id === '02' ? { name: `c0-script t2v eight-shot repair (${report.mode}; no reference cards; test-side only)`,
        run: async () => {
          await app.evaluate(() => globalThis.__c0Dispatch?.markLifecycle('C0_COLLECT_STAGE02_FAILED_REPAIR_RELOAD'))
          return repairStoryboard(win, projectId(), c0RepairPlan(report.mode))
        } } : undefined
      const row = await walk.station({ id, action, interruption, expected: `${action}：${expected}`, surface: Number(id) < 3 ? 'storyboard' : Number(id) < 5 ? 'canvas-node' : id === '06' ? 'export' : 'timeline', repair }, run)
      return row
    },
    finish(profile, requests) {
      writeJson(path.join(directory, 'model-requests.json'), requests.map(r => ({ path: r.path, body: r.body })))
      const files = copyTranscripts(profile, directory)
      writeJson(path.join(directory, 'r30.json'), scoreCollectedAgent({
        tools: JSON.parse(fs.readFileSync(path.join(directory, 'tools.json'), 'utf8')),
        stations: walk.stations, deviations: walk.deviations, stationId: '02',
        population: report.mode === 'real' ? 'real-text' : 'loopback', attempted: walk.stations.some(s => s.id === '02'),
      }))
      if (!files.length) walk.record(Error('当前运行时未落盘 pi 原生 JSONL；禁止用 Host 快照冒充'), { id: 'native-transcript', surface: 'agent-panel', reachedViaRepair: false })
      saveCase(directory, walk)
    },
  }
}

export function c0Invocation({ root, target, directory, realText = false, plannerModel = 'gpt-5-nano', budgetCny, packaged, env = process.env }) {
  return {
    args: [path.join(root, 'tests/ux/g1/c0-short-film.walk.mjs'),
      ...(realText ? ['--real', '--planner-model', plannerModel] : ['--dry-run']),
      ...(packaged ? ['--packaged', packaged] : [])],
    env: { ...env, NOMI_WALK_MODE: 'collect', NOMI_SWEEP_CASE_DIR: target,
      NOMI_C0_MEDIA_DRY_RUN: realText ? '1' : '0', NOMI_C0_TEXT_BUDGET: String(budgetCny), NOMI_C0_LEDGER_DIR: directory },
  }
}

// Observe turn state, not a fixed approval latency. Shared by both real planners.
export function plannerObservation(messages, approvalVisible) {
  if (approvalVisible) return { status: '等审批', terminal: true, outcome: 'approval' }
  const assistant = messages.findLast(message => message.role === 'assistant')
  if (['stop', 'error', 'aborted', 'length'].includes(assistant?.stopReason))
    return { status: assistant.stopReason === 'stop' ? '回合完成' : '回合失败', terminal: true, outcome: assistant.stopReason }
  const calls = messages.flatMap(message => message.role === 'assistant' && Array.isArray(message.content)
    ? message.content.filter(part => part.type === 'toolCall') : [])
  const pending = calls.filter(call => !messages.some(message => message.role === 'toolResult' && message.toolCallId === call.id))
  return { status: pending.length ? '工具调用中' : '推理中', terminal: false, outcome: null, pendingTools: pending.map(call => call.name) }
}

export async function waitForPlannerTerminal({ approval, projectRoot, win, directory }) {
  const budget = stationTimeout({ turns: 1, operations: 0 }), began = performance.now()
  let lastProgress = -15_000, observation
  const sample = async (final = false) => {
    const events = readEventsLog(projectRoot)
    const terminal = events.findLast(e => /^agent\.turn\.(finished|error)$/.test(e.type))
    const messages = events.flatMap(event => {
      if (event.type === 'agent.tool.proposed') return [{ role: 'assistant', stopReason: 'toolUse',
        content: [{ type: 'toolCall', id: event.payload?.toolCallId, name: event.payload?.toolName }] }]
      if (event.type === 'agent.tool.completed') return [{ role: 'toolResult', toolCallId: event.payload?.toolCallId }]
      return []
    })
    if (terminal) messages.push({ role: 'assistant', stopReason: terminal.type.endsWith('error') || terminal.payload?.status !== 'ok' ? 'error' : 'stop' })
    observation = { ...plannerObservation(messages, await approval.isVisible()),
      waitedMs: Math.round(performance.now() - began), budget,
      lastEvent: events.at(-1)?.type ?? null }
    if (final || observation.terminal || observation.waitedMs - lastProgress >= 15_000) {
      lastProgress = observation.waitedMs
      const row = { ...observation, final }
      fs.appendFileSync(path.join(directory, 'planner-progress.jsonl'), JSON.stringify(row) + '\n')
      console.log('C0_PLANNER_PROGRESS', JSON.stringify(row))
      // Renderer console and evaluation are also captured by the existing trace.
      await win.evaluate(row => console.info('C0_PLANNER_PROGRESS', JSON.stringify(row)), row)
    }
    return observation.terminal
  }
  try { await expect.poll(() => sample(), { timeout: budget, intervals: [1000] }).toBe(true) }
  catch (error) {
    await sample(true)
    if (!error.matcherResult) throw error
    if (!observation.terminal) throw Error('C0_STAGE02_NO_TERMINAL_300S: ' + JSON.stringify(observation))
  }
  await sample(true)
  if (observation.outcome !== 'approval') throw Error('C0_STAGE02_TERMINAL_WITHOUT_APPROVAL: ' + JSON.stringify(observation))
  return observation
}
