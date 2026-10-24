// look_at_canvas 选区翻页量具的判分与场景检查：用产品自己的排版造出真实的工具结果文本，不起 App、不花钱。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { omitSupersededReads } from '../../electron/agentLane/laneSupersededReads.mts'
import { projectCanvasRead } from '../../electron/shared/agentCapabilities/canvasRead'
import { projectCanvasForAgent } from '../../electron/shared/agentCapabilities/canvasReadCompact'
import { modelFacingToolSpecs } from '../../electron/shared/agentCapabilities/modelFacingToolRegistry'
import {
  LOOK_AT_CANVAS, answerTimeView, answeredKeys, groundTruthKeys, lookAtCanvasCallLegality, roundSettled, roundTranscript, sceneFromIds, sceneProblems,
  sceneProjectionFacts, scoreSelectionRound, selectionSceneSpec, summarizeSelectionRounds,
} from './_lookAtCanvasSelectionScore.mjs'
import { SELECTION_PAGING_MARKER } from './_lookAtCanvasSelectionSteps.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const projector = { projectCanvasRead, projectCanvasForAgent }

/** 与画布 store 同形状的 id（canvasIds.ts：gen-v2-<kind>-<时间戳 36 进制 8 位>-<4 位>），26 个字符。 */
const realisticIds = (spec) => spec.map((node, index) => `gen-v2-${node.kind}-${(1_792_000_000_000 + index * 7919).toString(36)}-${(46_656 + index * 37).toString(36)}`)

function seededScene({ ids } = {}) {
  const spec = selectionSceneSpec()
  return sceneFromIds(spec, ids ?? realisticIds(spec))
}

/** store.readSnapshot() 的形状：首帧图带分镜首帧标记、不领镜号；视频按出生顺序领镜号。 */
function snapshotOf(scene) {
  let shot = 0
  return {
    nodes: scene.nodes.map((node, index) => ({
      id: node.id, kind: node.kind, title: node.title, prompt: '', status: 'idle', categoryId: 'shots',
      position: { x: 80 + (index % 11) * 300, y: 120 + Math.floor(index / 11) * 380 },
      ...(node.role === 'first_frame' ? { meta: { storyboardKeyframe: true } } : { meta: {}, shotIndex: (shot += 1) }),
    })),
    edges: [], groups: [], selectedNodeIds: [...scene.selectedIds],
  }
}

/** 产品给这一页的真文本（与 laneCanvasTools 同一个调用：look_at_canvas 永远按可翻页排版）。 */
function lookResult(scene, selectedFrom) {
  return projectCanvasForAgent(projectCanvasRead(snapshotOf(scene)), { selectedFrom: selectedFrom ?? 0 }).text
}

/** 造一轮转录：calls = [{ args, note?, thinking? }]，每次都是 look_at_canvas，结果用产品真文本（note / thinking = 随这次调用写的正文 / 思考）；answer = 最后一句话。 */
function sessionsFor(scene, calls, answer, { model = 'deepseek-v4-pro' } = {}) {
  const messages = [{ role: 'user', content: [{ type: 'text', text: '我选中的这些里，哪几个是视频节点？把标题都列出来' }] }]
  calls.forEach((call, index) => {
    const id = `call-${index + 1}`
    messages.push({ role: 'assistant', provider: 'apimart', model, stopReason: 'toolUse', content: [
      ...(call.thinking ? [{ type: 'thinking', thinking: call.thinking }] : []),
      ...(call.note ? [{ type: 'text', text: call.note }] : []), { type: 'toolCall', id, name: call.name ?? LOOK_AT_CANVAS, arguments: call.args },
    ] })
    messages.push({ role: 'toolResult', toolCallId: id, toolName: call.name ?? LOOK_AT_CANVAS, isError: call.isError === true,
      content: [{ type: 'text', text: call.resultText ?? lookResult(scene, call.args?.selectedFrom) }] })
  })
  if (answer !== null) messages.push({ role: 'assistant', provider: 'apimart', model, stopReason: 'stop', content: [{ type: 'text', text: answer }] })
  return [{ entries: messages.map((message) => ({ type: 'message', message })) }]
}

const videoTitles = (scene, predicate = () => true) => scene.nodes.filter((node) => node.kind === 'video' && predicate(node)).map((node) => node.title)
const score = (scene, calls, answer) => scoreSelectionRound({ scene, transcript: roundTranscript(sessionsFor(scene, calls, answer)) })

describe('场景：一张逼得出翻页的画布', () => {
  it('44 个节点、选中 40 个（20 首帧图 + 20 视频），另有 2 个不选的视频、2 个不选的首帧图', () => {
    const spec = selectionSceneSpec()
    expect(spec).toHaveLength(44)
    expect(spec.filter((node) => node.selected)).toHaveLength(40)
    expect(spec.filter((node) => node.selected && node.kind === 'video')).toHaveLength(20)
    expect(spec.filter((node) => !node.selected).map((node) => node.kind).sort()).toEqual(['image', 'image', 'video', 'video'])
    // 干扰节点插在画布顺序的中间和末尾，不是挤在一头。
    expect(spec.map((node, index) => (node.selected ? null : index)).filter((index) => index !== null)).toEqual([20, 21, 42, 43])
  })

  it('判分的键互不包含、不含「首帧视频」四个字，标题唯一：抄标题加不加前缀都认得出、拼在一起也不会误中', () => {
    const spec = selectionSceneSpec()
    const keys = spec.map((node) => node.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(spec.map((node) => node.title)).size).toBe(spec.length)
    for (const key of keys) {
      expect(key).toMatch(/^[一-鿿]{4}$/)
      expect(key).not.toMatch(/[首帧视频]/)
      expect(keys.filter((other) => other !== key && other.includes(key))).toEqual([])
    }
  })

  it('ground truth = 选中的 20 个视频（不含干扰视频），按画布顺序', () => {
    const scene = seededScene()
    const truth = groundTruthKeys(scene)
    expect(truth).toHaveLength(20)
    expect(truth.map((key) => scene.nodes.find((node) => node.key === key)).every((node) => node.kind === 'video' && node.selected)).toBe(true)
  })

  it('产品自己的排版：第一页列不全，顺着 selectedFrom 两页读全；后一页有选中的视频，画布上有不选的视频，节点清单没被截', () => {
    const scene = seededScene()
    const facts = sceneProjectionFacts(scene, snapshotOf(scene), projector)
    expect(facts).toMatchObject({ total: 40, selectionMatchesScene: true, pagingNeeded: true, readAllByPaging: true, nodeListComplete: true })
    expect(facts.pages).toEqual([{ from: 0, listed: facts.firstPageListed }, { from: facts.firstPageListed, listed: 40 - facts.firstPageListed }])
    expect(facts.laterPageVideoTitles.length).toBeGreaterThan(0)
    expect(facts.distractorVideoTitles).toEqual(['视频·炉火噼啪', '视频·极光夜空'])
    expect(sceneProblems(facts, scene)).toEqual([])
    // 构建标记就是模型在第一页末尾看到的那句话的固定前缀。
    expect(facts.firstPageText).toContain(SELECTION_PAGING_MARKER)
  })

  it('反例：id 短到一页放得下，场景检查拒跑（这张画布测不到翻页）', () => {
    const spec = selectionSceneSpec()
    const scene = sceneFromIds(spec, spec.map((_, index) => `n${index}`))
    const problems = sceneProblems(sceneProjectionFacts(scene, snapshotOf(scene), projector), scene)
    expect(problems.join('\n')).toMatch(/第一页就列全了选区/)
    expect(problems.join('\n')).toMatch(/后面几页里没有选中的视频/)
  })

  it('反例：画布读到的选区与布场景时选的不一致，场景检查拒跑', () => {
    const scene = seededScene()
    const snapshot = snapshotOf(scene)
    snapshot.selectedNodeIds = snapshot.selectedNodeIds.slice(0, 39)
    expect(sceneProblems(sceneProjectionFacts(scene, snapshot, projector), scene).join('\n')).toMatch(/选区与布场景时选的那一批不一致/)
  })

  it('构建标记是本 PR 产品源码里的固定字面量', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'electron/shared/agentCapabilities/canvasReadCompact.ts'), 'utf8')
    expect(source).toContain(SELECTION_PAGING_MARKER)
  })
})

describe('工具写对：look_at_canvas 的参数合法', () => {
  const total = 40
  it.each([
    [{}, true], [{ selectedFrom: 0 }, true], [{ selectedFrom: 32 }, true], [{ selectedFrom: 39 }, true],
    [{ selectedFrom: 40 }, false], [{ selectedFrom: -1 }, false], [{ selectedFrom: 1.5 }, false], [{ selectedFrom: '32' }, false], [{ selectedFrom: null }, false],
  ])('%j → %s', (args, legal) => {
    expect(lookAtCanvasCallLegality({ args, isError: false }, total).legal).toBe(legal)
  })

  it('宿主退回的调用一律不算写对；不认识的键不影响 selectedFrom 的判定', () => {
    expect(lookAtCanvasCallLegality({ args: { selectedFrom: 32 }, isError: true }, total)).toEqual({ legal: false, why: '宿主把这次调用退回了（isError）' })
    expect(lookAtCanvasCallLegality({ args: { scope: 'full' }, isError: false }, total).legal).toBe(true)
  })
})

describe('一轮的判分（工具结果是产品真文本）', () => {
  const scene = seededScene()
  const facts = sceneProjectionFacts(scene, snapshotOf(scene), projector)
  const pagedCalls = [{ args: {} }, { args: { selectedFrom: facts.firstPageListed } }]
  const allTruth = videoTitles(scene, (node) => node.selected).join('\n')

  it('照提示翻页、读全、不多不少地答：成功', () => {
    expect(score(scene, pagedCalls, `视频节点有：\n${allTruth}`)).toMatchObject({
      lookAtCanvasCalls: 2, legalCalls: 2, paged: true, selectionRead: 40, selectionTotal: 40, missing: [], extra: [], answeredCount: 20, success: true,
    })
  })

  it('抄标题时去掉前缀、加空格、换顿号分隔也认得出', () => {
    const loose = scene.nodes.filter((node) => node.selected && node.kind === 'video').map((node) => ` ${node.key.slice(0, 2)} ${node.key.slice(2)} `).join('、')
    expect(score(scene, pagedCalls, loose).success).toBe(true)
  })

  it('反例：少列一个算失败', () => {
    const titles = videoTitles(scene, (node) => node.selected)
    const result = score(scene, pagedCalls, titles.slice(0, -1).join('\n'))
    expect(result).toMatchObject({ success: false, missing: [titles.at(-1)], extra: [] })
  })

  it('反例：多列一个干扰节点（画布上不选的视频）算失败', () => {
    const result = score(scene, pagedCalls, `${allTruth}\n视频·炉火噼啪`)
    expect(result).toMatchObject({ success: false, missing: [], extra: [{ title: '视频·炉火噼啪', kind: 'video', selected: false }] })
  })

  it('反例：没翻页、只答前一页的算失败（也不算翻页）', () => {
    const firstPage = new Set(scene.selectedIds.slice(0, facts.firstPageListed))
    const answer = videoTitles(scene, (node) => firstPage.has(node.id)).join('\n')
    const result = score(scene, [{ args: {} }], answer)
    expect(result).toMatchObject({ lookAtCanvasCalls: 1, legalCalls: 1, paged: false, selectionRead: facts.firstPageListed, extra: [], success: false })
    expect(result.missing).toEqual(facts.laterPageVideoTitles)
  })

  it('反例：把选中的首帧图也当视频列出来算失败', () => {
    const result = score(scene, pagedCalls, `${allTruth}\n首帧·晨雾码头`)
    expect(result).toMatchObject({ success: false, extra: [{ title: '首帧·晨雾码头', kind: 'image', selected: true }] })
  })

  it('越界的 selectedFrom 不算写对，也不算翻页；之后照提示翻页仍可答对', () => {
    const result = score(scene, [{ args: {} }, { args: { selectedFrom: 40 } }, { args: { selectedFrom: facts.firstPageListed } }], allTruth)
    expect(result).toMatchObject({ lookAtCanvasCalls: 3, legalCalls: 2, paged: true, success: true })
    expect(result.illegalCalls).toEqual([{ args: { selectedFrom: 40 }, why: 'selectedFrom=40 不在有效范围 0–39' }])
    const onlyOutOfRange = score(scene, [{ args: {} }, { args: { selectedFrom: 40 } }], allTruth)
    expect(onlyOutOfRange.paged).toBe(false)
  })

  it('回合成功只看最终答案；读没读、翻没翻另记——停在工具调用上、没有最终回答的一轮算失败', () => {
    // 没读画布却答对：按定义算回合成功，但翻页与读到的选区都是 0（这一场里模型不读就不知道后几页是谁，真跑里不该出现）。
    expect(score(scene, [], allTruth)).toMatchObject({ lookAtCanvasCalls: 0, paged: false, selectionRead: 0, success: true })
    expect(score(scene, pagedCalls, null)).toMatchObject({ answeredCount: 0, success: false })
  })

  it('答案为空或只有寒暄：不算成功', () => {
    expect(score(scene, pagedCalls, '好的，我看一下。').success).toBe(false)
    expect(answeredKeys('', scene)).toEqual([])
  })
})

describe('转录读法', () => {
  const scene = seededScene()

  it('调用按先后、参数原样、结果按 id 对回；最终回答只认最后一条不再调工具的助手消息', () => {
    const transcript = roundTranscript(sessionsFor(scene, [{ args: {} }, { args: { selectedFrom: 32 } }], '答案'))
    expect(transcript.calls.map((call) => [call.name, call.args, call.isError])).toEqual([[LOOK_AT_CANVAS, {}, false], [LOOK_AT_CANVAS, { selectedFrom: 32 }, false]])
    expect(transcript.calls[0].resultText).toContain('当前选中 40 个')
    expect(transcript.finalAnswer).toBe('答案')
    expect(transcript.models).toEqual(['apimart/deepseek-v4-pro'])
    expect(roundTranscript(sessionsFor(scene, [{ args: {} }], null)).finalAnswer).toBe('')
  })

  it('落地判定：停在工具调用上 = 没落地；stop / error / aborted = 落地', () => {
    expect(roundSettled(sessionsFor(scene, [{ args: {} }], null).map((session) => ({ entries: session.entries.slice(0, 2) })))).toBe(false)
    expect(roundSettled(sessionsFor(scene, [{ args: {} }], '答案'))).toBe(true)
    const errored = [{ entries: [{ type: 'message', message: { role: 'assistant', stopReason: 'error', content: [] } }] }]
    expect(roundSettled(errored)).toBe(true)
    expect(roundSettled([])).toBe(false)
  })
})

describe('答话那一刻模型眼里还剩什么（诊断，不进三个数）', () => {
  const scene = seededScene()
  const twoPages = [{ args: {} }, { args: { selectedFrom: 32 } }]
  const identity = (messages) => messages
  /** 照产品那条说明的样子：后来又读了一次的旧结果换成一行字。 */
  const dropFirstLook = (messages) => {
    const first = messages.findIndex((message) => message.role === 'toolResult' && message.toolName === LOOK_AT_CANVAS)
    return messages.map((message, index) => (index === first ? { ...message, content: [{ type: 'text', text: '[Earlier look_at_canvas result omitted]' }] } : message))
  }

  it('两页原样都在：40 个选中 id 都看得见，一页都没被换掉', () => {
    expect(answerTimeView({ scene, sessions: sessionsFor(scene, twoPages, '答案'), transform: identity }))
      .toEqual({ lookResults: 2, lookResultsOmitted: 0, selectedIdsVisible: 40, selectionTotal: 40, truthNotedBeforeAnswer: 0, truthInReasoningBeforeAnswer: 0 })
  })

  it('反例：前一页被换成说明——转录里读全了，答话时眼里只剩后一页的 8 个', () => {
    const sessions = sessionsFor(scene, twoPages, '答案')
    expect(scoreSelectionRound({ scene, transcript: roundTranscript(sessions) }).selectionRead).toBe(40)
    expect(answerTimeView({ scene, sessions, transform: dropFirstLook })).toMatchObject({ lookResults: 2, lookResultsOmitted: 1, selectedIdsVisible: 8 })
  })

  it('答话之前自己在正文 / 思考里记下的真值视频分开数（最终回答本身不算）；记的是首帧图或干扰视频不算', () => {
    const noted = videoTitles(scene, (node) => node.selected).slice(0, 16)
    const calls = [
      { args: {} },
      { args: { selectedFrom: 32 }, note: `第 1–32 个里的视频：${noted.join('、')}；首帧·晨雾码头；视频·炉火噼啪`, thinking: `前一页的视频有 ${noted.slice(0, 5).join('、')}` },
    ]
    const view = answerTimeView({ scene, sessions: sessionsFor(scene, calls, videoTitles(scene, (node) => node.selected).join('\n')), transform: dropFirstLook })
    expect(view).toMatchObject({ selectedIdsVisible: 8, truthNotedBeforeAnswer: 16, truthInReasoningBeforeAnswer: 5 })
  })

  it('没有任何助手消息：没有答话那一刻，返回 null', () => {
    expect(answerTimeView({ scene, sessions: [], transform: identity })).toBeNull()
  })

  it('套上产品自己的 transform（laneHost 的 omitSupersededReads + 内部工具声明）：认得出 look_at_canvas 的结果并如实报数', () => {
    const transform = (messages) => omitSupersededReads(messages, modelFacingToolSpecs('internal'))
    const view = answerTimeView({ scene, sessions: sessionsFor(scene, twoPages, '答案'), transform })
    // 两页算不算「同一资源」由产品定：不算 → 40 个都在；算 → 前一页被换掉、只剩 8 个。量具只负责如实数出是哪一种。
    expect(view.lookResults).toBe(2)
    expect([[0, 40], [1, 8]]).toContainEqual([view.lookResultsOmitted, view.selectedIdsVisible])
  })
})

describe('几轮合起来的三个数', () => {
  it('工具写对率按调用数，翻页率与回合成功率按轮数；量具出错的一轮照样进分母', () => {
    const scene = seededScene()
    const round = (calls, answer, extra = {}) => ({ score: score(scene, calls, answer), harnessError: null, ...extra })
    const truth = videoTitles(scene, (node) => node.selected).join('\n')
    const view = (selectedIdsVisible) => ({ lookResults: 2, lookResultsOmitted: selectedIdsVisible === 40 ? 0 : 1, selectedIdsVisible, selectionTotal: 40, truthNotedBeforeAnswer: 0, truthInReasoningBeforeAnswer: 0 })
    const numbers = summarizeSelectionRounds([
      round([{ args: {} }, { args: { selectedFrom: 32 } }], truth, { view: view(40) }),
      round([{ args: {} }], truth.split('\n').slice(0, 16).join('\n')),
      round([{ args: {} }, { args: { selectedFrom: 40 } }, { args: { selectedFrom: 32 } }], truth, { view: view(8) }),
      round([], '', { harnessError: '这一轮没落地' }),
    ])
    expect(numbers).toEqual({
      rounds: 4, toolWriteCorrect: '5/6', pagingRate: '2/4', turnSuccess: '2/4', roundsWithoutLookAtCanvas: 1, roundsReadWholeSelection: '2/4',
      roundsSawWholeSelectionAtAnswer: '1/4', harnessErrors: 1,
    })
  })
})
