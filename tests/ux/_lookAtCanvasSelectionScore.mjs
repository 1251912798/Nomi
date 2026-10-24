// look_at_canvas「当前选中」翻页的真模型量具（PR #1283，R13.3）：场景、ground truth、转录读法与判分。
// 全是纯函数（单测 _lookAtCanvasSelectionScore.test.mjs 钉着），不起 App、不花钱；真付费走查与零花费演练共用这一份。
//
// 场景（设计卡 ★1 的真实任务）：一张画布 20 镜，每镜一张首帧图 + 一个视频节点，这 40 个全选；另放 4 个不选的
// 干扰节点（2 首帧图 + 2 视频），插在画布顺序的中间和末尾。40 个选中的 id 行明显超过 look_at_canvas 的 id 预算——
// 第一页列不全，要按结果里点名的 selectedFrom 往后翻才读得全（场景能不能逼出翻页，由 sceneProjectionFacts 用
// 产品自己的排版函数算，不在这里抄预算常量）。
// 问的话只读、不花钱、不改画布：「我选中的这些里，哪几个是视频节点？把标题都列出来」。
// ground truth = 40 个选中里那 20 个视频节点的标题：只读第一页的答案会少列最后几镜；
// 不看选区、把画布上的视频全列出来的答案会多出 2 个干扰视频。
//
// 标题 = 「首帧·」/「视频·」+ 一个全场唯一的四字短语（短语就是判分的键）：模型抄标题时加不加前缀都认得出，
// 四字短语之间互不包含，也不含「首帧视频」四个字，拼在一起不会误中。
import { laneMessageText, laneMessages } from './agent-lane-observer.mjs'

export const SELECTION_ASK = '我选中的这些里，哪几个是视频节点？把标题都列出来'
export const LOOK_AT_CANVAS = 'look_at_canvas'

/** 20 镜：[首帧短语, 视频短语]。全部选中。 */
const SELECTED_SHOTS = Object.freeze([
  ['晨雾码头', '渔船出港'], ['缆绳绕桩', '汽笛压浪'], ['灯塔初亮', '灯塔夜航'], ['礁石浪花', '海鸥掠水'], ['渔网晾晒', '老街叫卖'],
  ['石桥细雨', '油纸伞下'], ['茶馆清晨', '说书开场'], ['戏台灯笼', '锣鼓开戏'], ['竹林小径', '竹叶翻飞'], ['稻田白鹭', '风吹稻浪'],
  ['古井青苔', '木桶打水'], ['铁轨尽头', '绿皮火车'], ['站台送别', '车窗挥手'], ['隧道出口', '天光乍现'], ['天桥黄昏', '车流成河'],
  ['霓虹招牌', '雨夜街头'], ['邮筒旁边', '信封落地'], ['书摊午后', '翻书声响'], ['钟楼正午', '鸽群起飞'], ['雪山日出', '冰湖倒影'],
])
/** 两镜干扰：不选。一镜插在第 10 镜之后，一镜在末尾。 */
const DISTRACTOR_SHOTS = Object.freeze([['松林木屋', '炉火噼啪'], ['沙丘驼队', '极光夜空']])

const shotNodes = ([framePhrase, videoPhrase], selected) => [
  { key: framePhrase, kind: 'image', role: 'first_frame', title: `首帧·${framePhrase}`, selected },
  { key: videoPhrase, kind: 'video', role: 'video', title: `视频·${videoPhrase}`, selected },
]

/** 画布顺序：第 1–10 镜、干扰甲、第 11–20 镜、干扰乙。选区顺序 = 选中节点的画布顺序。 */
export function selectionSceneSpec() {
  return Object.freeze([
    ...SELECTED_SHOTS.slice(0, 10).flatMap((shot) => shotNodes(shot, true)),
    ...shotNodes(DISTRACTOR_SHOTS[0], false),
    ...SELECTED_SHOTS.slice(10).flatMap((shot) => shotNodes(shot, true)),
    ...shotNodes(DISTRACTOR_SHOTS[1], false),
  ].map((node) => Object.freeze(node)))
}

/**
 * 布好之后的场景：spec 的每一项配上画布真给的 id（顺序同 spec）。selectedIds 的顺序 = 画布顺序，与 selectNodes 传进去的一致。
 * @param {ReadonlyArray<{key:string, kind:string, role:string, title:string, selected:boolean}>} spec
 * @param {readonly string[]} ids
 */
export function sceneFromIds(spec, ids) {
  if (ids.length !== spec.length || new Set(ids).size !== ids.length) throw new Error(`场景 id 对不上：spec ${spec.length} 个，拿到 ${ids.length} 个（去重后 ${new Set(ids).size}）`)
  const nodes = spec.map((node, index) => Object.freeze({ ...node, id: ids[index] }))
  return Object.freeze({ nodes: Object.freeze(nodes), selectedIds: Object.freeze(nodes.filter((node) => node.selected).map((node) => node.id)) })
}

/** ground truth：选中的视频节点（键 = 四字短语），按画布顺序。 */
export function groundTruthKeys(scene) {
  return scene.nodes.filter((node) => node.selected && node.kind === 'video').map((node) => node.key)
}

/**
 * 场景能不能逼出翻页：用**产品自己的**排版（canvas.read 投影 + look_at_canvas 的紧凑文本）算第一页列了几个、翻几页读完、
 * 后面那几页里有没有选中的视频、画布上有没有不选的视频、节点清单有没有被截。花钱之前算；不成立就拒跑（一分钱不花）。
 * `projector` = { projectCanvasRead, projectCanvasForAgent }（走查里由 tsx 从 electron/shared 载入，单测里直接 import）。
 */
export function sceneProjectionFacts(scene, snapshot, projector) {
  const result = projector.projectCanvasRead(snapshot)
  const selectedIds = result.selectedNodeIds ?? []
  const pages = []
  let from = 0
  let firstText = ''
  for (let guard = 0; guard < 64; guard += 1) {
    const projection = projector.projectCanvasForAgent(result, { selectedFrom: from })
    if (guard === 0) firstText = projection.text
    const { listed, total } = projection.selection
    pages.push({ from, listed })
    if (listed <= 0 || from + listed >= total) break
    from += listed
  }
  const total = selectedIds.length
  const firstPageListed = pages[0]?.listed ?? 0
  const laterIds = new Set(selectedIds.slice(firstPageListed))
  const byId = new Map(scene.nodes.map((node) => [node.id, node]))
  return {
    total,
    selectionMatchesScene: selectedIds.length === scene.selectedIds.length && selectedIds.every((id, index) => id === scene.selectedIds[index]),
    pages,
    firstPageListed,
    pagingNeeded: firstPageListed < total,
    readAllByPaging: pages.reduce((sum, page) => sum + page.listed, 0) === total,
    laterPageVideoTitles: [...laterIds].map((id) => byId.get(id)).filter((node) => node?.kind === 'video').map((node) => node.title),
    distractorVideoTitles: scene.nodes.filter((node) => !node.selected && node.kind === 'video').map((node) => node.title),
    nodeListComplete: scene.nodes.every((node) => firstText.includes(node.id) && firstText.includes(node.title)),
    firstPageText: firstText,
  }
}

/** sceneProjectionFacts 的判据：空清单 = 这张画布测得到翻页。 */
export function sceneProblems(facts, scene) {
  const problems = []
  if (!facts.selectionMatchesScene) problems.push('画布读到的选区与布场景时选的那一批不一致（顺序或成员）')
  if (facts.total !== scene.selectedIds.length) problems.push(`选中 ${facts.total} 个，场景要 ${scene.selectedIds.length} 个`)
  if (!facts.pagingNeeded) problems.push(`第一页就列全了选区（${facts.firstPageListed}/${facts.total}）——这张画布测不到翻页`)
  if (!facts.readAllByPaging) problems.push(`顺着 selectedFrom 翻页读不全选区：${JSON.stringify(facts.pages)}`)
  if (!facts.laterPageVideoTitles.length) problems.push('后面几页里没有选中的视频节点——只读第一页也答得对，测不到翻页')
  if (!facts.distractorVideoTitles.length) problems.push('画布上没有不选的视频节点——不看选区、把视频全列出来也答得对')
  if (!facts.nodeListComplete) problems.push('look_at_canvas 的节点清单被截断了：有节点的 id / 标题不在第一页文本里，模型认不出它的种类')
  return problems
}

// ── 转录读法（lane 落盘的 pi JSONL，见 agent-lane-observer.mjs）──────────────────────────────

const textOf = (content) => (Array.isArray(content) ? content : [])
  .filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('\n')
const thinkingOf = (content) => (Array.isArray(content) ? content : [])
  .filter((part) => part?.type === 'thinking' && typeof part.thinking === 'string').map((part) => part.thinking).join('\n')

/**
 * 一轮（一个新对话）的转录 → 工具调用序列 + 最终回答。
 * 调用按出现先后，参数是**模型写出来的原样**（宿主的 prepareArguments 只在执行时用，不改转录）；结果按 toolCallId 对回。
 * 最终回答 = 最后一条助手消息的正文——只有它不再调工具时才算（停在工具调用上的一轮没有最终回答）。
 */
export function roundTranscript(sessions) {
  const calls = []
  const byId = new Map()
  const assistantTexts = []
  const userTexts = []
  const models = new Set()
  let last = null
  for (const session of sessions) {
    for (const message of laneMessages(session)) {
      if (message.role === 'user' || message.role === 'nomi.input') { userTexts.push(laneMessageText(message)); continue }
      if (message.role === 'assistant') {
        last = message
        models.add(`${message.provider ?? '?'}/${message.model ?? '?'}`)
        const parts = Array.isArray(message.content) ? message.content : []
        for (const part of parts) {
          if (part?.type !== 'toolCall') continue
          const call = { id: part.id, name: part.name, args: part.arguments ?? null, resultText: null, isError: null }
          calls.push(call)
          byId.set(part.id, call)
        }
        const text = textOf(parts)
        if (text.trim()) assistantTexts.push(text)
        continue
      }
      if (message.role === 'toolResult') {
        const call = byId.get(message.toolCallId)
        if (!call) { calls.push({ id: message.toolCallId, name: message.toolName ?? null, args: null, resultText: textOf(message.content), isError: message.isError === true, orphan: true }); continue }
        call.resultText = textOf(message.content)
        call.isError = message.isError === true
      }
    }
  }
  const lastParts = Array.isArray(last?.content) ? last.content : []
  const finalAnswer = last && !lastParts.some((part) => part?.type === 'toolCall') ? textOf(lastParts) : ''
  return { calls, finalAnswer, assistantTexts, userTexts, models: [...models], lastStopReason: last?.stopReason ?? null }
}

/** 这一轮落地了没有：最后一条助手消息不是停在工具调用上（stop / error / aborted / length 都算落地）。 */
export function roundSettled(sessions) {
  const messages = sessions.flatMap((session) => laneMessages(session))
  const last = messages.at(-1)
  return Boolean(last && last.role === 'assistant' && last.stopReason && last.stopReason !== 'toolUse')
}

// ── 判分 ─────────────────────────────────────────────────────────────────────

/** look_at_canvas 结果里「当前选中」那一两行（选区的账与本页列出的 id 都在这里；节点清单里的 id 不算）。 */
export function selectionLinesOf(resultText) {
  return String(resultText ?? '').split('\n').filter((line) => line.startsWith('当前选中'))
}

/**
 * 一次 look_at_canvas 调用写对了没有（工具写对率的分子）。合法 = 宿主没报错，且参数里没有 selectedFrom、
 * 或 selectedFrom 是整数并落在 0 … 选中总数−1。null、字符串、小数、负数、越过末尾都算没写对（宿主容忍了也一样：量的是模型写得对不对）。
 */
export function lookAtCanvasCallLegality(call, total) {
  if (call.isError === true) return { legal: false, why: '宿主把这次调用退回了（isError）' }
  const args = call.args ?? {}
  if (typeof args !== 'object' || Array.isArray(args)) return { legal: false, why: `参数不是对象：${JSON.stringify(args)}` }
  if (!Object.hasOwn(args, 'selectedFrom')) return { legal: true }
  const value = args.selectedFrom
  if (!Number.isInteger(value)) return { legal: false, why: `selectedFrom 不是整数：${JSON.stringify(value)}` }
  if (value < 0 || value > total - 1) return { legal: false, why: `selectedFrom=${value} 不在有效范围 0–${total - 1}` }
  return { legal: true }
}

const squash = (text) => String(text ?? '').replace(/\s+/g, '')

/** 回答里点到了哪些节点（按四字短语认）。 */
export function answeredKeys(answer, scene) {
  const text = squash(answer)
  return scene.nodes.filter((node) => text.includes(node.key)).map((node) => node.key)
}

/**
 * 一轮的分：
 *   工具写对 = 合法的 look_at_canvas 调用数 / look_at_canvas 调用数；
 *   翻页 = 有一次合法调用传了 0 < selectedFrom < 总数（真的往后读）；
 *   读到的选区 = 各次结果的「当前选中」行里出现过的选中 id（去重）；
 *   回合成功 = 最终回答点到的节点集合与 ground truth 完全一致（不多不少）。
 */
export function scoreSelectionRound({ scene, transcript }) {
  const total = scene.selectedIds.length
  const looks = transcript.calls.filter((call) => call.name === LOOK_AT_CANVAS)
  const verdicts = looks.map((call) => ({ args: call.args, ...lookAtCanvasCallLegality(call, total) }))
  const paged = looks.some((call, index) => verdicts[index].legal && Number.isInteger(call.args?.selectedFrom) && call.args.selectedFrom > 0)
  const read = new Set()
  for (const call of looks) {
    const lines = selectionLinesOf(call.resultText).join('\n')
    for (const id of scene.selectedIds) if (lines.includes(id)) read.add(id)
  }
  const truth = groundTruthKeys(scene)
  const answered = answeredKeys(transcript.finalAnswer, scene)
  const byKey = new Map(scene.nodes.map((node) => [node.key, node]))
  const missing = truth.filter((key) => !answered.includes(key)).map((key) => byKey.get(key).title)
  const extra = answered.filter((key) => !truth.includes(key)).map((key) => {
    const node = byKey.get(key)
    return { title: node.title, kind: node.kind, selected: node.selected }
  })
  return {
    lookAtCanvasCalls: looks.length,
    legalCalls: verdicts.filter((verdict) => verdict.legal).length,
    illegalCalls: verdicts.filter((verdict) => !verdict.legal).map(({ args, why }) => ({ args, why })),
    paged,
    selectionRead: read.size,
    selectionTotal: total,
    otherTools: transcript.calls.filter((call) => call.name !== LOOK_AT_CANVAS).map((call) => call.name),
    answeredCount: answered.length,
    missing,
    extra,
    success: answered.length > 0 && missing.length === 0 && extra.length === 0,
  }
}

/**
 * 诊断（不进三个数）：答话那一刻模型眼里还剩什么。发给模型的消息先过宿主的 transform_context——laneHost 在那里用
 * omitSupersededReads 把「同一资源后来又读过一次」的旧读取结果换成一行说明；转录不改，光看转录看不出来。
 * 这里把**同一个产品函数**（调用方注入 `transform(messages)`）套在最终回答之前的那些消息上，再数：
 *   selectedIdsVisible —— 没被换掉的 look_at_canvas 结果里，「当前选中」行还剩几个选中 id；
 *   lookResultsOmitted —— 几次 look_at_canvas 结果被换成了说明；
 *   truthNotedBeforeAnswer —— 答话之前模型自己在正文里记下了几个 ground truth 视频（记了笔记，前一页被换掉也不丢）；
 *   truthInReasoningBeforeAnswer —— 同上，记在思考块里的（思考块随不随请求回传看供应商适配：pi 的 openai-completions
 *     对 reasoning_content 一类的思考会回传）。
 * 回合失败时靠它分得清：是没翻页，还是翻了页、前面那页在它眼里已经没了；眼里没了却答对，看这两个数。
 */
export function answerTimeView({ scene, sessions, transform }) {
  const messages = sessions.flatMap((session) => laneMessages(session))
  const answerAt = messages.findLastIndex((message) => message.role === 'assistant')
  if (answerAt < 0) return null
  const context = messages.slice(0, answerAt)
  const sent = transform(context)
  const visible = new Set()
  let lookResults = 0
  let omitted = 0
  sent.forEach((message, index) => {
    if (message?.role !== 'toolResult' || message.toolName !== LOOK_AT_CANVAS) return
    lookResults += 1
    const text = textOf(message.content)
    if (text !== textOf(context[index]?.content)) omitted += 1
    const lines = selectionLinesOf(text).join('\n')
    for (const id of scene.selectedIds) if (lines.includes(id)) visible.add(id)
  })
  const truth = groundTruthKeys(scene)
  const assistants = context.filter((message) => message.role === 'assistant')
  const truthIn = (read) => answeredKeys(assistants.map((message) => read(message.content)).join('\n'), scene).filter((key) => truth.includes(key)).length
  return {
    lookResults,
    lookResultsOmitted: omitted,
    selectedIdsVisible: visible.size,
    selectionTotal: scene.selectedIds.length,
    truthNotedBeforeAnswer: truthIn(textOf),
    truthInReasoningBeforeAnswer: truthIn(thinkingOf),
  }
}

/** 几轮合起来的三个数（PR 正文要写的）+ 诊断用的几个计数。分母：工具写对率按调用数，翻页率与回合成功率按轮数。 */
export function summarizeSelectionRounds(records) {
  const scores = records.map((record) => record.score)
  const sum = (pick) => scores.reduce((total, score) => total + (score ? pick(score) : 0), 0)
  const count = (predicate) => records.filter(predicate).length
  const rounds = records.length
  return {
    rounds,
    toolWriteCorrect: `${sum((score) => score.legalCalls)}/${sum((score) => score.lookAtCanvasCalls)}`,
    pagingRate: `${count((record) => record.score?.paged)}/${rounds}`,
    turnSuccess: `${count((record) => record.score?.success)}/${rounds}`,
    roundsWithoutLookAtCanvas: count((record) => !record.score?.lookAtCanvasCalls),
    roundsReadWholeSelection: `${count((record) => record.score && record.score.selectionRead === record.score.selectionTotal)}/${rounds}`,
    // 读全了不等于答话时还看得见：前面的页可能已在发给模型的那份里被换成了说明（answerTimeView）。
    roundsSawWholeSelectionAtAnswer: `${count((record) => record.view && record.view.selectedIdsVisible === record.view.selectionTotal)}/${rounds}`,
    harnessErrors: count((record) => Boolean(record.harnessError)),
  }
}
