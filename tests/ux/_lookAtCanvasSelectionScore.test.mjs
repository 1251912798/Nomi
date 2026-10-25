import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { projectCanvasRead } from '../../electron/shared/agentCapabilities/canvasRead'
import { projectCanvasForAgent } from '../../electron/shared/agentCapabilities/canvasReadCompact'
import {
  LOOK_AT_CANVAS, SELECTION_ASK, answeredKeys, lookAtCanvasCallLegality, roundSettled, roundTranscript,
  sceneFromIds, sceneProblems, sceneProjectionFacts, scoreSelectionRound, selectionSceneSpec, summarizeSelectionRounds,
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

  // 答案 = 列出来的条目 + 没明说「没选中」的散文行：列全选区后顺手说明「画布上另有 X 没被选中」不是多列。
  const listed = videoTitles(scene).map((title, index) => `${index + 1}. ${title}`).join('\n')

  it('列表全对、末尾明说另外两个没选中：成功', () => {
    for (const tail of [
      '画布上还有「视频·炉火噼啪」和「视频·极光夜空」两个视频节点没有被选中。',
      '画布上还有两个未选中的：视频·炉火噼啪、视频·极光夜空。',
      '另外画布上还有「视频·炉火噼啪」和「视频·极光夜空」两个视频节点，但它们没在你的选中范围内。',
      'The canvas also has 视频·炉火噼啪 and 视频·极光夜空, which are not selected.',
    ]) expect(score(scene, [{ args: {} }], `选中 40 个节点中，视频节点共 20 个：\n\n${listed}\n\n${tail}`)).toMatchObject({ missing: [], extra: [], success: true })
  })

  it('不分条、一段话答全并明说没选中的：成功', () => {
    const prose = `选中的视频节点有：${videoTitles(scene).join('、')}。\n画布上另有视频·炉火噼啪、视频·极光夜空，没有被选中。`
    expect(score(scene, [{ args: {} }], prose)).toMatchObject({ extra: [], success: true })
  })

  it('列表里混进没选中的算失败，条目上标了「未选中」也照算', () => {
    expect(score(scene, [{ args: {} }], `${listed}\n21. 视频·炉火噼啪`).extra).toEqual([{ title: '视频·炉火噼啪', kind: 'video', selected: false }])
    expect(score(scene, [{ args: {} }], `${listed}\n- 视频·极光夜空（未选中）`).success).toBe(false)
  })

  it('列表全对、散文里又说干扰节点也选中了：失败', () => {
    expect(score(scene, [{ args: {} }], `${listed}\n另外视频·炉火噼啪也在你选中的里面。`).success).toBe(false)
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
    const live = { harnessError: null, score: { legalCalls: 1, lookAtCanvasCalls: 1, success: true, selectionRead: 40, selectionTotal: 40 }, view: { selectedIdsVisible: 40 } }
    const none = { harnessError: null, score: { legalCalls: 0, lookAtCanvasCalls: 0, success: false, selectionRead: 0, selectionTotal: 40 }, view: { selectedIdsVisible: 0 } }
    expect(summarizeSelectionRounds([live, none])).toEqual({
      rounds: 2, toolWriteCorrect: '1/1', turnSuccess: '1/2', roundsWithoutLookAtCanvas: 1,
      roundsReadLiveCanvas: 1, roundsReadWholeSelection: '1/2', roundsSawWholeSelectionAtAnswer: '1/2', harnessErrors: 0,
    })
  })
})
