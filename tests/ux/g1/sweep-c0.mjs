import fs from 'node:fs'
import path from 'node:path'
import { createWalkSession } from '../_assert.mjs'
import { startEvidence, saveCase, copyTranscripts, writeJson, scoreCollectedAgent } from './sweep-evidence.mjs'
import { repairStoryboard } from './sweep-repair.mjs'
import { shots } from './c0-fixture.mjs'

export function createC0Collection(directory, report) {
  let evidence, read, win, projectId, evidencePrefix = '', restart = 0
  const walk = createWalkSession({ mode: 'collect', cost: () => report.costCny ?? 0,
    persist: w => saveCase(directory, w), capture: async entry => {
      const captured = await evidence?.capture(entry)
      return captured ? { ...captured, screenshot: evidencePrefix + captured.screenshot, store: evidencePrefix + captured.store } : {}
    } })
  return {
    walk,
    async attach(launched, payload, getProjectId) {
      win = launched.win
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
      const repair = id === '02' ? { name: 'c0-fixture storyboard seed (test-side only)',
        run: () => repairStoryboard(win, projectId(), { title: '日落前的一分钟', shots }) } : undefined
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
