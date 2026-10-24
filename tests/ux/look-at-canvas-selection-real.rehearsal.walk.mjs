#!/usr/bin/env node
// look-at-canvas-selection-real.paid.mjs 的 loopback 演练：**零额度、不出网**。
//
//   pnpm build && node tests/ux/look-at-canvas-selection-real.rehearsal.walk.mjs
//
// 同一份步骤本体（_lookAtCanvasSelectionSteps.mjs）、真 Electron、真接入页、真 IPC、真 Agent lane、真 look_at_canvas 排版、
// 真 transform_context；差别只有：凭据是一把假 key，APIMart 的地址被重定向到本机夹具，大脑是夹具里按剧本走的那个。
// 放行名单清空：就算哪一层没重定向，真请求也会被走查闸当场挡下。
// 它证的是「布场景 → 选中 → 发话 → 读到工具调用和回答 → 判分」这条管道走得通、判分判得对，不证真模型会怎么做。
// 大脑无状态：每一步只看夹具收到的那份请求体——也就是宿主真发给模型的那一份。五轮各演一种已知的样子：
//   ① 翻页、翻页时在正文里记笔记，再答（阳性对照：前一页在请求里还在不在都答得对）；
//   ② 照提示翻页、不记笔记、只按请求里看得见的答（如实对照：答对与否取决于答话那一刻前一页还在不在）；
//   ③ 只读第一页就答（阴性对照：少列后面那几镜）；④ 不看选区、把画布上的视频全列出来（阴性对照：多出干扰视频）；
//   ⑤ 先传越界的 selectedFrom、再按笔记翻页（成功，但有一次没写对）。
// 另一道对账：大脑每次答话时记下请求里看得见几个选中 id、几页被换成了说明；量具从转录 + 产品的 transform 算出的
// answerTimeView 必须与之逐轮相等——真付费那边没有请求体可看，靠的就是这个诊断。
// 摘要写 docs/evidence/2026-10-22-look-at-canvas-selection-truncation/paid/rehearsal.json（脚本化大脑，**不是模型分数**）。
import { expect } from './_assert.mjs'
import { BRAIN } from './_agentVideoPaid.mjs'
import { ENV_KEY_VAR } from './_paidEnvKey.mjs'
import { openPaidWalk } from './_paidRun.mjs'
import { flattenRequestText } from './agent-runtime-fixture.mjs'
import { createRuntimeWalk, toolNames } from './agent-runtime-walk-support.mjs'
import { LOOK_AT_CANVAS, SELECTION_ASK, selectionLinesOf } from './_lookAtCanvasSelectionScore.mjs'
import { SELECTION_PAGING_MARKER, runSelectionJourney, selectionEvidence, writeSelectionEvidence } from './_lookAtCanvasSelectionSteps.mjs'

const SCRIPT = 'look-at-canvas-selection-real.rehearsal.walk.mjs'
const FAKE_KEY = 'rehearsal-fake-key-0123456789abcdef'
const PLAN = ['pages-with-notes', 'pages-no-notes', 'first-page-only', 'all-canvas-videos', 'out-of-range-then-pages-with-notes']
const OMITTED_PREFIX = `[Earlier ${LOOK_AT_CANVAS} result omitted`
const startedAt = new Date().toISOString()

const lastUserText = (body) => flattenRequestText({ messages: (body.messages ?? []).filter((message) => message.role === 'user').slice(-1) })
const contentText = (content) => (typeof content === 'string' ? content : (Array.isArray(content) ? content.map((part) => part?.text ?? '').join('') : ''))
/** 这一轮之前的助手消息里，look_at_canvas 传过哪些 selectedFrom。 */
const requestedFroms = (body) => (body.messages ?? []).filter((message) => message.role === 'assistant')
  .flatMap((message) => message.tool_calls ?? []).filter((call) => call.function?.name === LOOK_AT_CANVAS)
  .map((call) => { try { return JSON.parse(call.function.arguments || '{}').selectedFrom } catch { return undefined } })
  .filter((value) => value !== undefined)

/**
 * 剧本大脑：按 `mode` 演一种样子。只认这一轮自己的 look_at_canvas 结果（工具调用号带轮次前缀），
 * 读到的选中 id 只取结果里「当前选中」那几行——和真模型能看到的是同一份文本。
 */
function installScriptedBrain(fixture) {
  let current = null
  const answers = new Map()
  fixture.respond({
    label: 'rehearsal brain · selection question',
    match: (body) => toolNames(body).includes(LOOK_AT_CANVAS) && lastUserText(body).includes(SELECTION_ASK),
    reply: (body) => {
      const { mode, round, scene } = current
      const total = scene.selectedIds.length
      const prefix = `rh${round}-look-`
      const messages = body.messages ?? []
      const results = messages.filter((message) => message.role === 'tool' && String(message.tool_call_id ?? '').startsWith(prefix))
        .map((message) => contentText(message.content))
      const ownText = messages.filter((message) => message.role === 'assistant').map((message) => contentText(message.content)).join('\n')
      const idsIn = (text) => { const lines = selectionLinesOf(text).join('\n'); return scene.selectedIds.filter((id) => lines.includes(id)) }
      const videosOf = (ids) => scene.nodes.filter((node) => node.kind === 'video' && ids.includes(node.id))
      const visible = [...new Set(results.flatMap(idsIn))]
      const latest = results.at(-1) ?? ''
      const latestRange = /本次列出第 (\d+)–(\d+) 个/.exec(latest)
      // 笔记：随下一次调用写进正文——「已读第 a–b 个，其中视频：……」。
      const note = latestRange ? `（笔记）已读选区第 ${latestRange[1]}–${latestRange[2]} 个，其中视频：${videosOf(idsIn(latest)).map((node) => node.title).join('、') || '无'}` : undefined
      const look = (args, text) => ({ type: 'tool', id: `${prefix}${results.length + 1}`, name: LOOK_AT_CANVAS, args, ...(text ? { text } : {}) })
      const answer = (nodes) => {
        answers.set(round, { visible, omitted: results.filter((text) => text.startsWith(OMITTED_PREFIX)).length })
        return { type: 'text', text: `你选中的节点里，视频节点有这些：\n${nodes.map((node) => node.title).join('\n')}` }
      }
      if (!results.length) return look({})
      if (mode === 'first-page-only') return answer(videosOf(visible))
      if (mode === 'all-canvas-videos') return answer(scene.nodes.filter((node) => node.kind === 'video'))
      const requested = new Set(requestedFroms(body))
      if (mode === 'pages-no-notes') {
        const hint = results.map((text) => Number(/selectedFrom: (\d+)/.exec(text)?.[1])).find((value) => Number.isInteger(value) && !requested.has(value))
        return hint === undefined ? answer(videosOf(visible)) : look({ selectedFrom: hint })
      }
      // 记笔记的两种：读到哪儿看自己的笔记 + 最新一页；读全了就按「笔记 ∪ 看得见的」答。
      if (mode === 'out-of-range-then-pages-with-notes' && !requested.has(total)) return look({ selectedFrom: total }, note)
      const readUpTo = Math.max(0, latestRange ? Number(latestRange[2]) : 0, ...[...ownText.matchAll(/已读选区第 \d+–(\d+) 个/g)].map((match) => Number(match[1])))
      if (readUpTo < total) return look({ selectedFrom: readUpTo }, note)
      const noted = scene.nodes.filter((node) => node.kind === 'video' && node.selected && ownText.includes(node.title)).map((node) => node.id)
      return answer(videosOf([...new Set([...noted, ...visible])]))
    },
  })
  // App 自己发起的其它文本调用（如有）：回一句短话，不计入剧本。
  fixture.respond({ label: 'rehearsal fallback · non-brain text call', match: () => true, reply: { type: 'text', text: '好的。' } })
  return { play(mode, round, scene) { current = { mode, round, scene } }, answers }
}

const paid = await openPaidWalk(SCRIPT, 'look-at-canvas-selection-rehearsal', [BRAIN], {
  env: { ...process.env, CI: '', NOMI_SPEND_OK: '1', [ENV_KEY_VAR]: FAKE_KEY },
  buildMarkers: [SELECTION_PAGING_MARKER],
  createWalk: (name, options) => createRuntimeWalk(name, {
    ...options, generationProvider: 'apimart', seedApimartKey: false, env: { ...options.env, NOMI_WALK_ALLOW_ORIGINS: '' },
  }),
})
const { walk } = paid
const brain = installScriptedBrain(walk.fixture)
const journey = { rounds: [] }
let failure
try {
  await runSelectionJourney(journey, {
    walk, rounds: PLAN.length, expectedModelKey: BRAIN.modelKey, modelLabel: () => paid.label(BRAIN.vendorKey, BRAIN.modelKey),
    beforeRound: async (round, scene) => brain.play(PLAN[round - 1], round, scene),
  })
  journey.rounds.forEach((record, index) => { record.rehearsalMode = PLAN[index] })
  // 每一轮的第一个请求：发话那一刻随句子一起送给模型的上下文里点到了几个画布节点（#1263 那扇门，这里只记不判）。
  journey.sendTimeContext = walk.fixture.requests
    .filter((request) => toolNames(request.body ?? {}).includes(LOOK_AT_CANVAS) && lastUserText(request.body).includes(SELECTION_ASK)
      && !(request.body.messages ?? []).some((message) => message.role === 'assistant'))
    .map((request) => {
      const text = lastUserText(request.body)
      // 「[Nomi current selection — read-only ContextSnapshot v…]」那一行之后是一行 JSON 数组（agentContextSnapshot.ts）。
      const handles = (() => { try { return JSON.parse(text.split('\n').find((line) => line.startsWith('[{')) ?? 'null') } catch { return null } })()
      return {
        canvasNodeHandles: (text.match(/canvas-node:/g) ?? []).length,
        canvasNodeTitles: Array.isArray(handles) ? handles.filter((handle) => String(handle?.id ?? '').startsWith('canvas-node:')).map((handle) => handle.display?.title ?? null) : null,
      }
    })
  const [withNotes, noNotes, firstOnly, allVideos, outOfRange] = journey.rounds
  const { scene } = journey
  const byTitle = new Map(scene.canvasOrder.map((node) => [node.title, node]))
  const truthTitles = scene.groundTruth
  expect(journey.gaugeProblems, '量具本身没出错').toEqual([])
  expect(journey.rounds.map((record) => record.harnessError), '每一轮都正常落地').toEqual(PLAN.map(() => null))
  for (const record of journey.rounds) {
    expect(record.calls[0]?.selectionLines?.[0] ?? '', `第 ${record.round} 轮：Agent 第一次读到的就是那 ${scene.total} 个选中`).toMatch(new RegExp(`^当前选中 ${scene.total} 个，本次列出第 1–${scene.firstPageListed} 个`))
    // 对账：量具从转录 + 产品 transform 算出来的「答话时眼里」= 大脑在真请求体里看到的。
    const seen = brain.answers.get(record.round)
    expect(Boolean(seen), `第 ${record.round} 轮大脑答过话`).toBe(true)
    expect(record.view, `第 ${record.round} 轮：answerTimeView 与夹具收到的最后一份请求对得上`).toMatchObject({ selectedIdsVisible: seen.visible.length, lookResultsOmitted: seen.omitted })
  }
  const firstPageTruth = truthTitles.length - scene.laterPageVideoTitles.length
  expect(withNotes.score, '① 翻页 + 笔记：两次都写对、读全选区、答对').toMatchObject({ lookAtCanvasCalls: 2, legalCalls: 2, paged: true, selectionRead: scene.total, missing: [], extra: [], success: true })
  expect(withNotes.calls.map((call) => call.args), '① 转录里记的是模型写的原样参数').toEqual([{}, { selectedFrom: scene.firstPageListed }])
  expect(withNotes.view.truthNotedBeforeAnswer, '① 第一页的真值视频都记进了笔记（笔记随调用写进正文，下一份请求里带着）').toBe(firstPageTruth)
  // ② 如实对照：答对 ⇔ 答话那一刻全部选中 id 都还看得见；少列的恰好是看不见的那几个。
  const unseen = truthTitles.filter((title) => !brain.answers.get(2).visible.includes(byTitle.get(title).id))
  expect(noNotes.score, '② 照提示翻页、不记笔记：调用都写对、转录里读全了').toMatchObject({ lookAtCanvasCalls: 2, legalCalls: 2, paged: true, selectionRead: scene.total, extra: [] })
  expect(noNotes.score.missing, '② 少列的恰好是答话那一刻看不见的那几个真值视频').toEqual(unseen)
  expect(noNotes.score.success, '② 成功与否 = 答话时看不看得见全部选中').toBe(noNotes.view.selectedIdsVisible === scene.total)
  expect(firstOnly.score, '③ 只读第一页：没翻页、少列后面那几镜的视频').toMatchObject({ lookAtCanvasCalls: 1, legalCalls: 1, paged: false, selectionRead: scene.firstPageListed, missing: scene.laterPageVideoTitles, extra: [], success: false })
  expect(allVideos.score, '④ 不看选区：多出画布上不选的视频').toMatchObject({ paged: false, missing: [], success: false })
  expect(allVideos.score.extra, '④ 多出来的恰好是那两个干扰视频').toEqual(scene.distractorVideoTitles.map((title) => ({ title, kind: 'video', selected: false })))
  expect(outOfRange.score, '⑤ 越界一次再按笔记翻页：三次调用两次写对、仍然答对').toMatchObject({ lookAtCanvasCalls: 3, legalCalls: 2, paged: true, success: true })
  expect(outOfRange.calls.map((call) => call.args), '⑤ 调用序列原样').toEqual([{}, { selectedFrom: scene.total }, { selectedFrom: scene.firstPageListed }])
  expect(outOfRange.score.illegalCalls, '⑤ 没写对的那一次是越界的 selectedFrom').toEqual([{ args: { selectedFrom: scene.total }, why: `selectedFrom=${scene.total} 不在有效范围 0–${scene.total - 1}` }])
  expect(outOfRange.calls[1].selectionLines[0], '⑤ 越界那一页宿主明说超出末尾、一个都没列').toContain('超出了选区末尾')
  expect(journey.numbers, '三个数从真转录算出来，和剧本对得上').toMatchObject({
    rounds: 5, toolWriteCorrect: '8/9', pagingRate: '3/5', turnSuccess: `${noNotes.score.success ? 3 : 2}/5`, roundsReadWholeSelection: '3/5', harnessErrors: 0,
  })
  expect(journey.canvasIntactAfter, '只读的一问：跑完画布上节点一个没少').toBe(scene.nodes)
  // 量具量到的产品现象（只记不判，交协调定）：翻页读全了，答话时前面那页却已不在发给模型的那份里。
  journey.findings = journey.rounds.filter((record) => record.score.paged && record.view && record.view.selectedIdsVisible < scene.total).map((record) => ({
    round: record.round, mode: record.rehearsalMode,
    finding: `转录里读到选区 ${record.score.selectionRead}/${scene.total}，答话时发给模型的那份里只看得见 ${record.view.selectedIdsVisible}/${scene.total}：`
      + `${record.view.lookResultsOmitted} 次 look_at_canvas 结果被换成了「已被后来的读取取代」的说明（electron/agentLane/laneSupersededReads.mts）`,
  }))
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await paid.finish(failure)
  const written = writeSelectionEvidence('rehearsal.json', {
    ...selectionEvidence({ script: SCRIPT, mode: 'rehearsal（夹具剧本大脑，不是模型分数）', startedAt, journey, walk, failure, model: `${BRAIN.vendorKey}/${BRAIN.modelKey}（地址重定向到本机夹具）` }),
    plan: PLAN, findings: journey.findings ?? null, sendTimeContext: journey.sendTimeContext ?? null,
  }, { secrets: [FAKE_KEY] })
  console.log(`[selection] 演练摘要：${written}`)
}
