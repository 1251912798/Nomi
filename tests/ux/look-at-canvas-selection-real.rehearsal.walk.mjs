#!/usr/bin/env node
// look_at_canvas 选区节点行标记的零额度演练：真 Electron、真 IPC、真 Agent lane，模型由本机夹具按剧本回答。
import { expect } from './_assert.mjs'
import { BRAIN } from './_agentVideoPaid.mjs'
import { ENV_KEY_VAR } from './_paidEnvKey.mjs'
import { openPaidWalk } from './_paidRun.mjs'
import { flattenRequestText } from './agent-runtime-fixture.mjs'
import { createRuntimeWalk, toolNames } from './agent-runtime-walk-support.mjs'
import { LOOK_AT_CANVAS, SELECTION_ASK } from './_lookAtCanvasSelectionScore.mjs'
import { runSelectionJourney, selectionEvidence, writeSelectionEvidence } from './_lookAtCanvasSelectionSteps.mjs'

const SCRIPT = 'look-at-canvas-selection-real.rehearsal.walk.mjs'
const FAKE_KEY = 'rehearsal-fake-key-0123456789abcdef'
const SELECTION_MARKER = '节点行里标了「选中」'
const startedAt = new Date().toISOString()

const lastUserText = (body) => flattenRequestText({ messages: (body.messages ?? []).filter((message) => message.role === 'user').slice(-1) })
const contentText = (content) => (typeof content === 'string' ? content : (Array.isArray(content) ? content.map((part) => part?.text ?? '').join('') : ''))

function installMarkedRowBrain(fixture) {
  let current = null
  fixture.respond({
    label: 'rehearsal brain · node-row selection marker',
    match: (body) => toolNames(body).includes(LOOK_AT_CANVAS) && lastUserText(body).includes(SELECTION_ASK),
    reply: (body) => {
      const { round, scene } = current
      const prefix = `rh${round}-look-`
      const results = (body.messages ?? []).filter((message) => message.role === 'tool' && String(message.tool_call_id ?? '').startsWith(prefix)).map((message) => contentText(message.content))
      if (!results.length) return { type: 'tool', id: `${prefix}1`, name: LOOK_AT_CANVAS, args: {} }
      const latest = results.at(-1)
      const visible = scene.nodes.filter((node) => node.selected && latest.split('\n').some((line) => line.startsWith('- ') && line.includes('| 选中') && line.includes(node.id)))
      return { type: 'text', text: `你选中的节点里，视频节点有这些：\n${visible.filter((node) => node.kind === 'video').map((node) => node.title).join('\n')}` }
    },
  })
  fixture.respond({
    label: 'rehearsal brain · snapshot-only selection',
    match: (body) => !body.messages.some((message) => message.role === 'tool') && !lastUserText(body).includes(SELECTION_ASK),
    reply: (body) => {
      // 只从本次 user 消息里的 ContextSnapshot 读标题；不闭包读取 scene，避免夹具替模型作答。
      const titles = [...lastUserText(body).matchAll(/"title":"(视频·[^"]+)"/g)].map((match) => match[1])
      return { type: 'text', text: titles.length ? titles.join('\n') : '快照中没有视频节点标题' }
    },
  })
  fixture.respond({ label: 'rehearsal fallback · non-brain text call', match: () => true, reply: { type: 'text', text: '好的。' } })
  return { play(round, scene) { current = { round, scene } } }
}

const paid = await openPaidWalk(SCRIPT, 'look-at-canvas-selection-rehearsal', [BRAIN], {
  env: { ...process.env, CI: '', NOMI_SPEND_OK: '1', [ENV_KEY_VAR]: FAKE_KEY },
  buildMarkers: [SELECTION_MARKER],
  createWalk: (name, options) => createRuntimeWalk(name, {
    ...options, generationProvider: 'apimart', seedApimartKey: false, env: { ...options.env, NOMI_WALK_ALLOW_ORIGINS: '' },
  }),
})
const { walk } = paid
const brain = installMarkedRowBrain(walk.fixture)
const journey = { rounds: [] }
let failure
try {
  await runSelectionJourney(journey, {
    walk, rounds: 5, expectedModelKey: BRAIN.modelKey, modelLabel: () => paid.label(BRAIN.vendorKey, BRAIN.modelKey),
    includeSnapshotOnly: true,
    beforeRound: async (round, scene) => brain.play(round, scene),
  })
  expect(journey.gaugeProblems, '量具本身没出错').toEqual([])
  expect(journey.rounds.map((record) => record.harnessError), '每一轮都正常落地').toEqual([null, null, null, null, null])
  expect(journey.snapshotOnly?.harnessError, '快照专用档正常落地').toBeNull()
  expect(journey.snapshotOnly?.score, '快照专用档只靠消息快照答对').toMatchObject({ lookAtCanvasCalls: 0, selectionTotal: 12, otherTools: [], missing: [], extra: [], success: true })
  for (const record of journey.rounds) {
    expect(record.calls[0]?.selectionLines?.[0] ?? '', `第 ${record.round} 轮的选区账`).toContain(SELECTION_MARKER)
    expect(record.score, `第 ${record.round} 轮按节点行标记答对`).toMatchObject({ lookAtCanvasCalls: 1, legalCalls: 1, selectionRead: 40, selectionTotal: 40, missing: [], extra: [], success: true })
    expect(record.view, `第 ${record.round} 轮答话时看全选中行`).toMatchObject({ lookResults: 1, lookResultsOmitted: 0, selectedIdsVisible: 40 })
  }
  expect(journey.numbers).toMatchObject({ rounds: 5, toolWriteCorrect: '5/5', turnSuccess: '5/5', snapshotOnlySuccess: '1/1', roundsReadWholeSelection: '5/5', roundsSawWholeSelectionAtAnswer: '5/5', harnessErrors: 0 })
  expect(journey.canvasIntactAfter).toBe(44)
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await paid.finish(failure)
  const written = writeSelectionEvidence('rehearsal.json', selectionEvidence({ script: SCRIPT, mode: 'rehearsal（夹具剧本大脑，不是模型分数）', startedAt, journey, walk, failure, model: `${BRAIN.vendorKey}/${BRAIN.modelKey}（地址重定向到本机夹具）` }), { secrets: [FAKE_KEY] })
  console.log(`[selection] 演练摘要：${written}`)
}
