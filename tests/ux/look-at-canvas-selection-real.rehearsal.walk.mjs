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
const SELECTION_BUILD_MARKER = '节点行里标了「选中」'
const OMITTED_CANVAS_BUILD_MARKER = 'call look_at_canvas with no arguments'
const startedAt = new Date().toISOString()

const lastUserText = (body) => flattenRequestText({ messages: (body.messages ?? []).filter((message) => message.role === 'user').slice(-1) })

function installMarkedRowBrain(fixture) {
  let current = null
  fixture.respond({
    label: 'rehearsal brain · node-row selection marker',
    match: (body) => toolNames(body).includes(LOOK_AT_CANVAS) && lastUserText(body).includes(SELECTION_ASK),
    reply: () => {
      const { scene } = current
      return { type: 'text', text: `你选中的节点里，视频节点有这些：\n${scene.nodes.filter((node) => node.selected && node.kind === 'video').map((node) => node.title).join('\n')}` }
    },
  })
  fixture.respond({ label: 'rehearsal fallback · non-brain text call', match: () => true, reply: { type: 'text', text: '好的。' } })
  return { play(round, scene) { current = { round, scene } } }
}

const paid = await openPaidWalk(SCRIPT, 'look-at-canvas-selection-rehearsal', [BRAIN], {
  env: { ...process.env, CI: '', NOMI_SPEND_OK: '1', [ENV_KEY_VAR]: FAKE_KEY },
  buildMarkers: [SELECTION_BUILD_MARKER, OMITTED_CANVAS_BUILD_MARKER],
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
    beforeRound: async (round, scene) => brain.play(round, scene),
  })
  expect(journey.gaugeProblems, '量具本身没出错').toEqual([])
  expect(journey.rounds, '主档 5 轮真实 Electron 演练').toHaveLength(5)
  for (const record of journey.rounds) {
    expect(record.harnessError, '主档正常落地').toBeNull()
    expect(record.score, '主档通过节点行选中标记读全选区').toMatchObject({ selectionTotal: 40, success: true })
  }
  expect(journey.numbers).toMatchObject({ rounds: 5, turnSuccess: '5/5', harnessErrors: 0 })
  expect(journey.canvasIntactAfter).toBe(journey.scene.nodes)
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await paid.finish(failure)
  const written = writeSelectionEvidence('rehearsal.json', selectionEvidence({ script: SCRIPT, mode: 'rehearsal（夹具剧本大脑，不是模型分数）', startedAt, journey, walk, failure, model: `${BRAIN.vendorKey}/${BRAIN.modelKey}（地址重定向到本机夹具）` }), { secrets: [FAKE_KEY] })
  console.log(`[selection] 演练摘要：${written}`)
}
