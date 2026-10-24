import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { projectCanvasRead } from '../../electron/shared/agentCapabilities/canvasRead'
import { projectCanvasForAgent } from '../../electron/shared/agentCapabilities/canvasReadCompact'
import {
  LOOK_AT_CANVAS, READ_SELECTION, SELECTION_ASK, SNAPSHOT_ONLY_ASK, answerTimeView, answeredKeys, lookAtCanvasCallLegality, roundSettled, roundTranscript,
  sceneFromIds, sceneProblems, sceneProjectionFacts, scoreSelectionRound, scoreSnapshotOnlyRound, selectionSceneSpec, summarizeSelectionRounds,
} from './_lookAtCanvasSelectionScore.mjs'
import { SELECTION_MARKER } from './_lookAtCanvasSelectionSteps.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const projector = { projectCanvasRead, projectCanvasForAgent }
const realisticIds = (spec) => spec.map((node, index) => `gen-v2-${node.kind}-${(1_792_000_000_000 + index * 7919).toString(36)}-${(46_656 + index * 37).toString(36)}`)
const seededScene = () => { const spec = selectionSceneSpec(); return sceneFromIds(spec, realisticIds(spec)) }
const snapshotOf = (scene) => ({
  nodes: scene.nodes.map((node, index) => ({ id: node.id, kind: node.kind, title: node.title, prompt: '', status: 'idle', categoryId: 'shots', position: { x: index, y: 0 }, ...(node.role === 'first_frame' ? { meta: { storyboardKeyframe: true } } : {}) })),
  edges: [], groups: [], selectedNodeIds: [...scene.selectedIds],
})
const videoTitles = (scene) => scene.nodes.filter((node) => node.selected && node.kind === 'video').map((node) => node.title)
const sessionsFor = (scene, calls, answer) => {
  const messages = [{ role: 'user', content: [{ type: 'text', text: SELECTION_ASK }] }]
  calls.forEach((call, index) => {
    const id = `call-${index + 1}`
    messages.push({ role: 'assistant', provider: 'apimart', model: 'deepseek-v4-pro', stopReason: 'toolUse', content: [{ type: 'toolCall', id, name: LOOK_AT_CANVAS, arguments: call.args ?? {} }] })
    messages.push({ role: 'toolResult', toolCallId: id, toolName: LOOK_AT_CANVAS, isError: call.isError === true, content: [{ type: 'text', text: projectCanvasForAgent(projectCanvasRead(snapshotOf(scene))).text }] })
  })
  if (answer !== null) messages.push({ role: 'assistant', provider: 'apimart', model: 'deepseek-v4-pro', stopReason: 'stop', content: [{ type: 'text', text: answer }] })
  return [{ entries: messages.map((message) => ({ type: 'message', message })) }]
}
const score = (scene, calls, answer) => scoreSelectionRound({ scene, transcript: roundTranscript(sessionsFor(scene, calls, answer)) })

describe('场景：选区行内标记一次列全', () => {
  it('44 个节点中 40 个选中，所有选中节点行都带标记且排在前面', () => {
    const scene = seededScene()
    const facts = sceneProjectionFacts(scene, snapshotOf(scene), projector)
    expect(facts).toMatchObject({ total: 40, selectionMatchesScene: true, markedSelectedCount: 40, allSelectedMarked: true, nodeListComplete: true })
    expect(facts.selectionLine).toContain(SELECTION_MARKER)
    expect(sceneProblems(facts, scene)).toEqual([])
  })

  it('构建标记是本 PR 产品源码里的固定字面量，main 没有', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'electron/shared/agentCapabilities/canvasReadCompact.ts'), 'utf8')
    expect(source).toContain(SELECTION_MARKER)
  })
})

describe('工具写对：look_at_canvas 只收空对象', () => {
  it.each([[{}, true], [{ scope: 'full' }, false], [{ offset: 32 }, false], [null, false]])('%j → %s', (args, legal) => {
    expect(lookAtCanvasCallLegality({ args, isError: false }).legal).toBe(legal)
  })
})

describe('一轮判分', () => {
  const scene = seededScene()
  const allTruth = videoTitles(scene).join('\n')

  it('按节点行标记答对：一次读取即可成功', () => {
    expect(score(scene, [{ args: {} }], allTruth)).toMatchObject({ lookAtCanvasCalls: 1, legalCalls: 1, selectionRead: 40, selectionTotal: 40, missing: [], extra: [], success: true })
  })

  it('少列一个算失败', () => {
    const result = score(scene, [{ args: {} }], videoTitles(scene).slice(0, -1).join('\n'))
    expect(result).toMatchObject({ success: false, missing: [videoTitles(scene).at(-1)], extra: [] })
  })

  it('多列一个干扰节点算失败', () => {
    expect(score(scene, [{ args: {} }], `${allTruth}\n视频·炉火噼啪`).extra).toEqual([{ title: '视频·炉火噼啪', kind: 'video', selected: false }])
  })

  it('没有最终回答的回合算失败', () => {
    expect(score(scene, [{ args: {} }], null).success).toBe(false)
    expect(answeredKeys('', scene)).toEqual([])
  })

  it('快照专用档拒绝工具，并确认用户消息本身带齐选中标题', () => {
    const messages = [{ role: 'user', content: [{ type: 'text', text: `${SNAPSHOT_ONLY_ASK}\n${allTruth}` }] }, {
      role: 'assistant', provider: 'apimart', model: 'deepseek-v4-pro', stopReason: 'stop', content: [{ type: 'text', text: allTruth }],
    }]
    const transcript = roundTranscript([{ entries: messages.map((message) => ({ type: 'message', message })) }])
    expect(scoreSnapshotOnlyRound({ scene, transcript })).toMatchObject({ lookAtCanvasCalls: 0, otherTools: [], snapshotMessagesWithWholeSelection: 1, missing: [], extra: [], success: true })
  })
})

describe('转录和汇总', () => {
  const scene = seededScene()
  it('调用参数和结果按 id 对回', () => {
    const transcript = roundTranscript(sessionsFor(scene, [{ args: {} }], '答案'))
    expect(transcript.calls.map((call) => [call.name, call.args, call.isError])).toEqual([[LOOK_AT_CANVAS, {}, false]])
    expect(transcript.calls[0].resultText).toContain(SELECTION_MARKER)
    expect(transcript.finalAnswer).toBe('答案')
  })

  it('停在工具调用上 = 没落地；stop = 落地', () => {
    expect(roundSettled(sessionsFor(scene, [{ args: {} }], null))).toBe(false)
    expect(roundSettled(sessionsFor(scene, [{ args: {} }], '答案'))).toBe(true)
  })

  it('汇总删除翻页率，只保留工具、读面路径、成功和可见性数字', () => {
    const live = { harnessError: null, score: { legalCalls: 1, lookAtCanvasCalls: 1, readSelectionCalls: 0, success: true, selectionRead: 40, selectionTotal: 40 }, view: { selectedIdsVisible: 40 } }
    const paged = { harnessError: null, score: { legalCalls: 0, lookAtCanvasCalls: 0, readSelectionCalls: 2, success: true, selectionRead: 40, selectionTotal: 40 }, view: { selectedIdsVisible: 40 } }
    expect(summarizeSelectionRounds([live, paged])).toEqual({
      rounds: 2, toolWriteCorrect: '1/1', turnSuccess: '2/2', roundsWithoutLookAtCanvas: 1,
      roundsReadSelection: 1, roundsReadLiveCanvas: 1, roundsWithoutSelectionRead: 0,
      roundsReadWholeSelection: '2/2', roundsSawWholeSelectionAtAnswer: '2/2', harnessErrors: 0,
    })
  })
})

describe('答话那一刻还看得见的选区', () => {
  const scene = seededScene()
  const half = Math.ceil(scene.selectedIds.length / 2)
  // 两页 read_selection（前一半、后一半）再作答，和真模型走的路径同形。
  const pagedSessions = () => {
    const messages = [{ role: 'user', content: [{ type: 'text', text: SELECTION_ASK }] }]
    const pages = [scene.selectedIds.slice(0, half), scene.selectedIds.slice(half)]
    pages.forEach((ids, index) => {
      const id = `page-${index + 1}`
      messages.push({ role: 'assistant', provider: 'apimart', model: 'deepseek-v4-pro', stopReason: 'toolUse', content: [{ type: 'toolCall', id, name: READ_SELECTION, arguments: {} }] })
      messages.push({ role: 'toolResult', toolCallId: id, toolName: READ_SELECTION, isError: false, content: [{ type: 'text', text: JSON.stringify({ handles: ids.map((targetId) => ({ targetId })) }) }] })
    })
    messages.push({ role: 'assistant', provider: 'apimart', model: 'deepseek-v4-pro', stopReason: 'stop', content: [{ type: 'text', text: videoTitles(scene).join('\n') }] })
    return [{ entries: messages.map((message) => ({ type: 'message', message })) }]
  }

  it('read_selection 按页读回的句柄也算看得见', () => {
    const view = answerTimeView({ scene, sessions: pagedSessions(), transform: (messages) => messages })
    expect(view).toMatchObject({ lookResults: 2, lookResultsOmitted: 0, selectedIdsVisible: scene.selectedIds.length })
  })

  it('发出去之前被换成旧读结果的那一页不算', () => {
    const elideFirstPage = (messages) => messages.map((message) => (message.toolCallId === 'page-1' ? { ...message, content: [{ type: 'text', text: '（旧读结果已省略）' }] } : message))
    const view = answerTimeView({ scene, sessions: pagedSessions(), transform: elideFirstPage })
    expect(view).toMatchObject({ lookResults: 2, lookResultsOmitted: 1, selectedIdsVisible: scene.selectedIds.length - half })
  })
})
