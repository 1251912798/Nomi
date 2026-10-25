// look_at_canvas「当前选中」的真模型量具：选区事实由节点行上的「选中」标记承载。
// 真付费走查与零花费演练共用这份场景、转录读法和判分；本文件不起 App、不花钱。
import { laneMessageText, laneMessages } from './agent-lane-observer.mjs'

export const SELECTION_ASK = '我选中的这些里，哪几个是视频节点？把标题都列出来'
export const LOOK_AT_CANVAS = 'look_at_canvas'
// 真实用户会把同一意图说成很多种话；量具保留这些句子，防止只用一条演示 prompt 就宣称工具会用。
export const SELECTION_PROMPTS = Object.freeze([
  '把我选中的这些镜头都改成夜景。', '逐个说出我刚才框选的镜头标题。', '我选中的视频里，哪些是夜景？',
  '给这批片段统一加字幕。', '只处理我选中的画布节点。', '把选中的镜头按顺序列出来。',
  '这次发送时我到底选了多少个？', '把选区里的视频和图片分开说。', '只告诉我选中的前三个标题。',
  '看当前画布，不看发送时选区。', '时间轴上我勾的片段总时长是多少？', '把文稿选中的段落拆成镜头。',
  '我刚才 @ 的参考分别是什么？', '先不要改，确认这批选区里有没有音频。', '按我发送那一刻的选择生成一个清单。',
  '我发送后又换了选择，仍按刚才那一批回答。', '读完所有选中的片段，再告诉我最短的一个。',
  '只读画布选区，不要读实时画布。', '选区太大时告诉我总数和还没读到的部分。', '继续读取上一页的选区。',
  '这条消息没有选区时不要猜，告诉我怎么继续。', '游标失效时从第一页重新读。',
])

const SELECTED_SHOTS = Object.freeze([
  ['晨雾码头', '渔船出港'], ['缆绳绕桩', '汽笛压浪'], ['灯塔初亮', '灯塔夜航'], ['礁石浪花', '海鸥掠水'], ['渔网晾晒', '老街叫卖'],
  ['石桥细雨', '油纸伞下'], ['茶馆清晨', '说书开场'], ['戏台灯笼', '锣鼓开戏'], ['竹林小径', '竹叶翻飞'], ['稻田白鹭', '风吹稻浪'],
  ['古井青苔', '木桶打水'], ['铁轨尽头', '绿皮火车'], ['站台送别', '车窗挥手'], ['隧道出口', '天光乍现'], ['天桥黄昏', '车流成河'],
  ['霓虹招牌', '雨夜街头'], ['邮筒旁边', '信封落地'], ['书摊午后', '翻书声响'], ['钟楼正午', '鸽群起飞'], ['雪山日出', '冰湖倒影'],
])
const DISTRACTOR_SHOTS = Object.freeze([['松林木屋', '炉火噼啪'], ['沙丘驼队', '极光夜空']])

const shotNodes = ([framePhrase, videoPhrase], selected) => [
  { key: framePhrase, kind: 'image', role: 'first_frame', title: `首帧·${framePhrase}`, selected },
  { key: videoPhrase, kind: 'video', role: 'video', title: `视频·${videoPhrase}`, selected },
]

export function selectionSceneSpec() {
  return Object.freeze([
    ...SELECTED_SHOTS.slice(0, 10).flatMap((shot) => shotNodes(shot, true)),
    ...shotNodes(DISTRACTOR_SHOTS[0], false),
    ...SELECTED_SHOTS.slice(10).flatMap((shot) => shotNodes(shot, true)),
    ...shotNodes(DISTRACTOR_SHOTS[1], false),
  ].map((node) => Object.freeze(node)))
}

export function sceneFromIds(spec, ids) {
  if (ids.length !== spec.length || new Set(ids).size !== ids.length) throw new Error(`场景 id 对不上：spec ${spec.length} 个，拿到 ${ids.length} 个`)
  const nodes = spec.map((node, index) => Object.freeze({ ...node, id: ids[index] }))
  return Object.freeze({ nodes: Object.freeze(nodes), selectedIds: Object.freeze(nodes.filter((node) => node.selected).map((node) => node.id)) })
}

export function groundTruthKeys(scene) {
  return scene.nodes.filter((node) => node.selected && node.kind === 'video').map((node) => node.key)
}

const textOf = (content) => (Array.isArray(content) ? content : [])
  .filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('\n')
const thinkingOf = (content) => (Array.isArray(content) ? content : [])
  .filter((part) => part?.type === 'thinking' && typeof part.thinking === 'string').map((part) => part.thinking).join('\n')

const markedIdsFromText = (text, scene) => {
  const ids = new Set()
  for (const line of String(text ?? '').split('\n')) {
    if (!line.startsWith('- ') || !line.includes('| 选中')) continue
    const id = line.slice(2).split(' | ')[0]
    if (scene.selectedIds.includes(id)) ids.add(id)
  }
  return ids
}

export function sceneProjectionFacts(scene, snapshot, projector) {
  const result = projector.projectCanvasRead(snapshot)
  const projection = projector.projectCanvasForAgent(result)
  const marked = markedIdsFromText(projection.text, scene)
  const byId = new Map(scene.nodes.map((node) => [node.id, node]))
  return {
    total: result.selectedNodeIds?.length ?? 0,
    selectionMatchesScene: (result.selectedNodeIds ?? []).length === scene.selectedIds.length
      && (result.selectedNodeIds ?? []).every((id, index) => id === scene.selectedIds[index]),
    markedSelectedCount: marked.size,
    allSelectedMarked: marked.size === scene.selectedIds.length,
    selectionLine: projection.text.split('\n').find((line) => line.startsWith('当前选中')) ?? '',
    distractorVideoTitles: scene.nodes.filter((node) => !node.selected && node.kind === 'video').map((node) => node.title),
    nodeListComplete: scene.nodes.every((node) => projection.text.includes(node.id) && projection.text.includes(node.title)),
    firstText: projection.text,
    byId,
  }
}

export function sceneProblems(facts, scene) {
  const problems = []
  if (!facts.selectionMatchesScene) problems.push('画布读到的选区与布场景时选的那一批不一致')
  if (facts.total !== scene.selectedIds.length) problems.push(`选中 ${facts.total} 个，场景要 ${scene.selectedIds.length} 个`)
  if (!facts.allSelectedMarked) problems.push(`节点行只标了 ${facts.markedSelectedCount}/${scene.selectedIds.length} 个选中节点`)
  if (!facts.distractorVideoTitles.length) problems.push('画布上没有不选的视频节点')
  if (!facts.nodeListComplete) problems.push('look_at_canvas 的节点清单被截断了')
  return problems
}

export function roundTranscript(sessions) {
  const calls = []
  const byId = new Map()
  const assistantTexts = []
  const userTexts = []
  const models = new Set()
  let last = null
  for (const session of sessions) for (const message of laneMessages(session)) {
    if (message.role === 'user' || message.role === 'nomi.input') { userTexts.push(laneMessageText(message)); continue }
    if (message.role === 'assistant') {
      last = message
      models.add(`${message.provider ?? '?'}/${message.model ?? '?'}`)
      const parts = Array.isArray(message.content) ? message.content : []
      for (const part of parts) if (part?.type === 'toolCall') {
        const call = { id: part.id, name: part.name, args: part.arguments ?? {}, resultText: null, isError: null }
        calls.push(call); byId.set(part.id, call)
      }
      const text = textOf(parts); if (text.trim()) assistantTexts.push(text)
      continue
    }
    if (message.role === 'toolResult') {
      const call = byId.get(message.toolCallId)
      if (!call) { calls.push({ id: message.toolCallId, name: message.toolName ?? null, args: {}, resultText: textOf(message.content), isError: message.isError === true, orphan: true }); continue }
      call.resultText = textOf(message.content); call.isError = message.isError === true
    }
  }
  const lastParts = Array.isArray(last?.content) ? last.content : []
  return { calls, finalAnswer: last && !lastParts.some((part) => part?.type === 'toolCall') ? textOf(lastParts) : '', assistantTexts, userTexts, models: [...models], lastStopReason: last?.stopReason ?? null }
}

export function roundSettled(sessions) {
  const messages = sessions.flatMap((session) => laneMessages(session))
  const last = messages.at(-1)
  return Boolean(last && last.role === 'assistant' && last.stopReason && last.stopReason !== 'toolUse')
}

export function selectionLinesOf(resultText) {
  return String(resultText ?? '').split('\n').filter((line) => line.startsWith('当前选中'))
}

export function lookAtCanvasCallLegality(call) {
  if (call.isError === true) return { legal: false, why: '宿主把这次调用退回了（isError）' }
  const args = call.args
  if (args === null || args === undefined) return { legal: false, why: 'look_at_canvas 应不带参数对象' }
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length) return { legal: false, why: 'look_at_canvas 应不带参数' }
  return { legal: true }
}

const squash = (text) => String(text ?? '').replace(/\s+/g, '')
// 答案 = 列出来的条目（编号 / 项目符号 / 表格行）+ 没明说「没选中」的散文行。
// 列全选区后顺手说明「画布上另有 X 没被选中」是对用户有用的补充，不算多列；列表项上标了「未选中」照样算多列。
const LIST_ITEM = /^\s*(?:[-*•·]|\d+\s*[.、)）]|[（(]\d+[)）]|\|)/
const NOT_SELECTED = /未被?选中|没有?被?选中|[不没]在(?:你的)?选[中区]|not selected|unselected|not in your selection|outside your selection/i
export function answeredKeys(answer, scene) {
  const text = String(answer ?? '').split('\n')
    .filter((line) => LIST_ITEM.test(line) || !NOT_SELECTED.test(line))
    .map(squash).join('\n')
  return scene.nodes.filter((node) => text.includes(node.key)).map((node) => node.key)
}

export function scoreSelectionRound({ scene, transcript }) {
  const looks = transcript.calls.filter((call) => call.name === LOOK_AT_CANVAS)
  const verdicts = looks.map((call) => lookAtCanvasCallLegality(call))
  const read = new Set()
  for (const call of looks) for (const id of markedIdsFromText(call.resultText, scene)) read.add(id)
  const truth = groundTruthKeys(scene)
  const answered = answeredKeys(transcript.finalAnswer, scene)
  const byKey = new Map(scene.nodes.map((node) => [node.key, node]))
  const missing = truth.filter((key) => !answered.includes(key)).map((key) => byKey.get(key).title)
  const extra = answered.filter((key) => !truth.includes(key)).map((key) => {
    const node = byKey.get(key); return { title: node.title, kind: node.kind, selected: node.selected }
  })
  return {
    lookAtCanvasCalls: looks.length,
    readPath: looks.length ? 'look_at_canvas' : 'none',
    legalCalls: verdicts.filter((verdict) => verdict.legal).length,
    illegalCalls: verdicts.filter((verdict) => !verdict.legal).map(({ why }) => ({ args: {}, why })),
    selectionRead: read.size, selectionTotal: scene.selectedIds.length,
    otherTools: transcript.calls.filter((call) => call.name !== LOOK_AT_CANVAS).map((call) => call.name),
    answeredCount: answered.length, missing, extra, success: answered.length > 0 && missing.length === 0 && extra.length === 0,
  }
}

const SELECTION_IDS_BY_TOOL = Object.freeze({
  [LOOK_AT_CANVAS]: (text, scene) => markedIdsFromText(text, scene),
})
const readsSelection = (message) => message?.role === 'toolResult' && message.toolName === LOOK_AT_CANVAS

export function answerTimeView({ scene, sessions, transform }) {
  const messages = sessions.flatMap((session) => laneMessages(session))
  const answerAt = messages.findLastIndex((message) => message.role === 'assistant')
  if (answerAt < 0) return null
  const context = messages.slice(0, answerAt)
  const sent = transform(context)
  const originalResults = context.filter(readsSelection)
  let resultIndex = 0
  const visible = new Set(); let lookResults = 0; let omitted = 0
  for (const message of sent) {
    if (!readsSelection(message)) continue
    const original = originalResults[resultIndex++]
    lookResults += 1
    const text = textOf(message.content)
    if (!original || original.toolName !== message.toolName || text !== textOf(original.content)) { omitted += 1; continue }
    for (const id of SELECTION_IDS_BY_TOOL[message.toolName](text, scene)) visible.add(id)
  }
  const before = messages.slice(0, answerAt).filter((message) => message.role === 'assistant')
  const spoken = before.flatMap((message) => [textOf(message.content), thinkingOf(message.content)]).join('\n')
  const truthNotedBeforeAnswer = groundTruthKeys(scene).filter((key) => spoken.includes(key)).length
  return { lookResults, lookResultsOmitted: omitted, selectedIdsVisible: visible.size, selectionTotal: scene.selectedIds.length, truthNotedBeforeAnswer, truthInReasoningBeforeAnswer: 0 }
}

export function summarizeSelectionRounds(records) {
  const valid = records.filter((record) => !record.harnessError)
  const count = (predicate) => valid.filter(predicate).length
  return {
    rounds: records.length,
    toolWriteCorrect: `${valid.reduce((sum, record) => sum + record.score.legalCalls, 0)}/${valid.reduce((sum, record) => sum + record.score.lookAtCanvasCalls, 0)}`,
    turnSuccess: `${count((record) => record.score.success)}/${records.length}`,
    roundsWithoutLookAtCanvas: count((record) => record.score.lookAtCanvasCalls === 0),
    roundsReadLiveCanvas: count((record) => record.score.lookAtCanvasCalls > 0),
    roundsReadWholeSelection: `${count((record) => record.score.selectionRead === record.score.selectionTotal)}/${records.length}`,
    roundsSawWholeSelectionAtAnswer: `${count((record) => record.view?.selectedIdsVisible === record.score.selectionTotal)}/${records.length}`,
    harnessErrors: records.filter((record) => record.harnessError).length,
  }
}
