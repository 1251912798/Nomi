#!/usr/bin/env node
// 真模型数字（R13.1 / R13.3）：用户对 Agent 说「照第 2、3 镜复刻」，Agent 读不读得到分镜表的行、起草的是不是那几行。
//
//   pnpm run build
//   node tests/ux/agent-shot-table-remake-real.paid.mjs --rehearsal        零花费演练（夹具大脑）：只验摆现场 / 发话 / 读转录 / 收尾
//   NOMI_SPEND_OK=1 node tests/ux/agent-shot-table-remake-real.paid.mjs   真模型（NOMI_REAL_LABEL=branch / main 可选）
//
// 为什么要它：2026-10-18 用户拍板分镜表不自带「生成选中镜头」按钮，改成 Agent 读表、用户说怎么做。
// 修复前 canvas.read 只给分镜表一个标题（行全不可见）；这次把行 / 列 / 勾选投进读面（canvasReadShotTable.ts），
// 并改了 look_at_canvas 的说明书。工具面一改，「外观绿」不等于接好了——这条拿同一批话在真模型上量。
//
// 只花文本模型的 token：大脑是用户目录里最便宜的那一档文本模型；图片模型只是被授权「出现在目录里」，
// **每一轮都停在付费卡、从不点生成**。每一轮新开对话、删掉上一轮的草稿节点（参考片和分镜表留着）。
// 硬上限：整场大脑调用（lane 转录里的 assistant 消息数）累计到 MODEL_CALL_CAP 就不再开下一轮。
//
// 现场怎么摆的（如实）：参考片是走真 IPC 导入的仓库夹具视频；分镜表是 `_shotTableRemakeFixture.mjs` 那张手写的 5 镜表，
// 经 E2E 画布桥写进画布（被量的是「读表 → 起草」，不是读图腿；现拆一次要花读图的钱、每次内容不同，量不出抄的是哪一行）。
// 勾选也经同一个桥写进 `view.selectedRowIds`——与点复选框写的是同一个字段。
//
// 量四件事（PR 正文要写的数）：
//   读到了表      这一轮在起草之前调了 look_at_canvas（读面里才有行）
//   工具写对率    这一轮没有任何一次工具调用被宿主拒
//   抄对了行      起草的镜头数 = 要的镜数，且每一镜的提示词带着对应那一行独有的主体词、没混进别的行
//   回合成功率    读到了 + 抄对了 + 没出错
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_TIMEOUT_MS, expect } from './_assert.mjs'
import { openPaidWalk, readProductionRuns } from './_paidRun.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { laneMessages, readLaneTranscripts } from './agent-lane-observer.mjs'
import { REMAKE_SHOTS, remakeShotTableMeta } from './_shotTableRemakeFixture.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, COMPOSER, COMPOSER_INPUT,
  chooseAssistantModel, closeSpendCard, composerText, createRuntimeWalk, newConversation, openCanvas, sendCanvas, waitForV4TurnIdle,
} from './agent-runtime-walk-support.mjs'
import { FIXTURE_TEXT_MODEL_LABEL } from './agent-runtime-fixture.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const REHEARSAL = process.argv.includes('--rehearsal')
if (REHEARSAL) process.argv.splice(process.argv.indexOf('--rehearsal'), 1)
const LABEL = REHEARSAL ? 'rehearsal' : process.env.NOMI_REAL_LABEL || 'run'
const VIDEO_FIXTURE = path.join(repoRoot, 'tests/ux/fixtures/canvas-follow-hand-1080p15.mp4')
/** 用户目录里最便宜的那一档文本模型（flash 档）；默认大脑是 v4-pro。 */
const BRAIN = { vendorKey: 'apimart', modelKey: process.env.NOMI_REAL_BRAIN || 'deepseek-v4-flash' }
const IMAGE = { vendorKey: 'apimart', modelKey: 'gemini-3.1-flash-image-preview' }
/** 用户给的花费上限：大脑调用总数（不问就能花的那一档）。 */
const MODEL_CALL_CAP = 20
/** 下一轮开跑前还得剩这么多次（一轮通常 4–5 次：读画布 / 列模型 / 起草 / 生成 / 收尾）。 */
const ROUND_RESERVE = 5

/** 每一镜独有的主体词（中文是表里的原词；英文是模型把提示词译成英文时的说法）。 */
const MARKERS = REMAKE_SHOTS.map((shot, index) => ({
  shot: index + 1,
  pattern: new RegExp([shot.marker, ['rim ?light|backlight|backlit', 'rain ?drop|droplet', 'convenience store', 'crosswalk|zebra', 'smil'][index]].join('|'), 'i'),
}))

const CASES = [
  { id: 'R1', ask: '照第 2、3 镜复刻，给我出图', tick: [], want: [2, 3] },
  { id: 'R2', ask: '把我在分镜表里勾的那几镜复刻成图片', tick: [4, 5], want: [4, 5] },
  { id: 'R3', ask: 'Remake shot 1 from the shot table as an image.', tick: [], want: [1] },
]
const ONLY = (process.env.NOMI_REAL_ONLY || '').split(',').map((id) => id.trim()).filter(Boolean)
for (const id of ONLY) if (!CASES.some((item) => item.id === id)) throw new Error(`NOMI_REAL_ONLY 里的 ${id} 不在用例表里`)
const SELECTED = ONLY.length ? CASES.filter((item) => ONLY.includes(item.id)) : CASES
const REJECTED = /Validation failed for tool|capability_input_invalid|generation_input_invalid|Unrecognized key\(s\)|must be (array|string|number|object)|Required/i

async function sendAccepted(win, text) {
  const input = win.locator(`${CANVAS_PANEL} ${COMPOSER_INPUT}`)
  const running = win.locator(`${CANVAS_PANEL} ${COMPOSER}[data-mode="running"]`)
  const accepted = async () => (await running.count()) > 0 || (await composerText(input).catch(() => '')).trim() === ''
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await sendCanvas(win, text)
    if (await expect.poll(accepted, { timeout: DEFAULT_TIMEOUT_MS }).toBe(true).then(() => true, () => false)) return attempt
  }
  throw new Error('composer did not accept the message after 3 attempts')
}

/** 参考片（真 IPC 导入）+ 那张 5 镜拆解表。返回两个节点 id。 */
async function seedCanvas(win) {
  const b64 = fs.readFileSync(VIDEO_FIXTURE).toString('base64')
  const seeded = await win.evaluate(async ({ b64, meta }) => {
    const projectId = /projectId=([^&]+)/.exec(location.href)?.[1]
    if (!projectId) return { error: 'no active projectId in url' }
    const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const saved = await window.nomiDesktop.assets.importFile({ projectId, bytes: binary.buffer, contentType: 'video/mp4', fileName: 'rain-reference.mp4', kind: 'upload' })
    if (!saved.ok) return { error: saved.failure.reason }
    const store = window.__nomiCanvasStore?.getState()
    if (!store) return { error: 'E2E canvas bridge missing (localStorage __nomiE2E)' }
    const video = store.addNode({ kind: 'video', title: '雨夜红伞.mp4', position: { x: 80, y: 120 } })
    store.updateNode(video.id, { result: { id: `seed-${Date.now()}`, type: 'video', url: saved.asset.data?.url, createdAt: Date.now() } })
    const tableMeta = JSON.parse(meta.replace('__SOURCE__', video.id))
    const table = store.addNode({ kind: 'shot_table', title: '雨夜红伞 · 拆解', position: { x: 80, y: 480 }, exactPosition: true, meta: tableMeta })
    store.connectNodes(video.id, table.id)
    const now = window.__nomiCanvasStore.getState()
    return { videoId: video.id, tableId: table.id, nodes: now.nodes.map((node) => ({ id: node.id, kind: node.kind, categoryId: node.categoryId, position: node.position, hasTable: Boolean(node.meta?.shotTable) })) }
  }, { b64, meta: JSON.stringify(remakeShotTableMeta({ sourceNodeId: '__SOURCE__' })) })
  if (seeded.error) throw new Error(`摆现场失败：${seeded.error}`)
  return seeded
}

/** 删掉上一轮的草稿节点、把表的勾选设成这一轮的样子。 */
async function resetRound(win, keep, tick) {
  return win.evaluate(({ keep, tick }) => {
    const store = window.__nomiCanvasStore.getState()
    for (const node of store.nodes) if (!keep.includes(node.id)) store.deleteNode(node.id)
    const table = window.__nomiCanvasStore.getState().nodes.find((node) => node.kind === 'shot_table')
    const current = table.meta.shotTable
    store.updateNode(table.id, { meta: { ...table.meta, shotTable: { ...current, view: { ...current.view, selectedRowIds: tick.map((shot) => `fact-${shot}`) }, revision: current.revision + 1, updatedAt: new Date().toISOString() } } })
    return window.__nomiCanvasStore.getState().nodes.length
  }, { keep, tick })
}

// 零花费演练：夹具大脑（不碰真实资料、不出网），只证明摆现场 / 发话 / 读转录 / 收尾这条流程跑得通。
const rehearsalWalk = REHEARSAL ? await createRuntimeWalk(`agent-shot-table-remake-${LABEL}`) : null
const paid = REHEARSAL
  ? { walk: rehearsalWalk, label: () => FIXTURE_TEXT_MODEL_LABEL, finish: (error) => rehearsalWalk.finish(error, { unscriptedFixture: true }) }
  : await openPaidWalk('agent-shot-table-remake-real.paid.mjs', `agent-shot-table-remake-real-${LABEL}`, [BRAIN, IMAGE], {
    // 产物里必须有这次的读面（紧凑文本的字面量会原样进主进程产物）。
    buildMarkers: ['复刻某一镜时，以那一镜的 imagePrompt'],
  })
const { walk } = paid
let failure
try {
  const { win } = await walk.start({ first: true })
  await win.evaluate(() => localStorage.setItem('__nomiE2E', '1'))
  const { projectRoot } = await walk.newProject()
  await openCanvas(win)
  await chooseAssistantModel(win, paid.label(BRAIN.vendorKey, BRAIN.modelKey), CANVAS_PANEL)
  await win.waitForFunction(() => Boolean(window.__nomiCanvasStore), undefined, { timeout: DEFAULT_TIMEOUT_MS })
  const { videoId, tableId, nodes: seededNodes } = await seedCanvas(win)
  walk.report.seededNodes = seededNodes
  console.log(`[remake ${LABEL}] 现场：${JSON.stringify(seededNodes)}`)
  await expect(win.locator('[data-testid="shot-table-node"]').first(), '分镜表节点在画布上').toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
  await walk.snap('00-seeded')

  const seen = new Set()
  const seenRuns = new Set()
  const rounds = []
  let modelCalls = 0
  for (const item of SELECTED) {
    if (modelCalls + ROUND_RESERVE > MODEL_CALL_CAP) {
      console.log(`[remake ${LABEL}] 停：已用 ${modelCalls} 次大脑调用，再开一轮可能超过上限 ${MODEL_CALL_CAP}`)
      rounds.push({ id: item.id, ask: item.ask, skipped: 'model-call-cap' })
      continue
    }
    const draftArgs = []
    const record = { id: item.id, ask: item.ask, tick: item.tick, want: item.want, calls: [], rejected: [], said: '', modelCalls: 0, cardShown: false, error: null }
    try {
      await resetRound(win, [videoId, tableId], item.tick)
      await newConversation(win, CANVAS_PANEL)
      await expect(win.locator(`${CANVAS_PANEL} [data-v4-block="empty"]`), '新对话的空态').toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
      const noShare = win.getByRole('button', { name: '不分享', exact: true }).first()
      if (await noShare.isVisible().catch(() => false)) await noShare.click()
      record.sendAttempts = await sendAccepted(win, item.ask)
      const card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
      await expect.poll(async () => (await card.isVisible().catch(() => false)) || (await win.locator(`${CANVAS_PANEL} ${COMPOSER}:not([data-mode="running"])`).count()) > 0,
        { timeout: stationTimeout({ turns: 3 }), message: '这一轮迟迟没落地' }).toBe(true)
      record.cardShown = await card.isVisible().catch(() => false)
      await walk.snap(`${item.id}-landed`)
      if (record.cardShown) await closeSpendCard(card, `${item.id}：到此为止，不点生成，关掉这张卡`).catch(() => undefined)
      await waitForV4TurnIdle(win, { panel: CANVAS_PANEL, doneTimeout: stationTimeout({ turns: 2 }) }).catch(() => undefined)
    } catch (error) {
      record.error = String(error?.message ?? error).split('\n')[0]
    }
    // 工具轨迹从磁盘上的 lane transcript 读，不信面板文字。
    for (const session of readLaneTranscripts(projectRoot)) {
      // 会话身份 = 转录头里的 sessionId（readLaneTranscripts 不返回 filePath / name；2026-10-19 首跑用了那两个键，
      // 三轮共用一个 "undefined|" 前缀，按下标去重的大脑调用数少记了 6 次——真数以 spendReceipt 的 replies 为准）。
      const key = `${session.sessionId}|`
      laneMessages(session).forEach((message, index) => {
        if (message.role === 'assistant') {
          if (!seen.has(`${key}assistant:${index}`)) { seen.add(`${key}assistant:${index}`); record.modelCalls += 1 }
          for (const part of Array.isArray(message.content) ? message.content : []) {
            if (part?.type === 'text' && typeof part.text === 'string' && !seen.has(`${key}text:${part.text}`)) { seen.add(`${key}text:${part.text}`); record.said += part.text }
            if (part?.type !== 'toolCall' || seen.has(key + part.id)) continue
            seen.add(key + part.id)
            record.calls.push({ tool: part.name, args: JSON.stringify(part.arguments ?? {}).slice(0, 1200) })
            if (part.name === 'draft_shots') draftArgs.push(part.arguments ?? {})
          }
        } else if (message.role === 'toolResult' && !seen.has(key + message.toolCallId)) {
          seen.add(key + message.toolCallId)
          const text = (Array.isArray(message.content) ? message.content : []).filter((part) => part?.type === 'text').map((part) => part.text).join('\n')
          if (message.isError === true) record.rejected.push({ tool: message.toolName ?? null, argRefusal: REJECTED.test(text), why: text.replace(/\s+/g, ' ').slice(0, 300) })
        }
      })
    }
    modelCalls += record.modelCalls
    const tools = record.calls.map((call) => call.tool)
    const firstDraft = tools.indexOf('draft_shots')
    record.readTable = tools.includes('look_at_canvas') && (firstDraft < 0 || tools.indexOf('look_at_canvas') < firstDraft)
    // 这一轮起草的镜：盘上新出现的 Run 里的镜头提示词（宿主真正会派发的那一份）。
    const fresh = readProductionRuns(projectRoot).filter((run) => !seenRuns.has(run.runId))
    for (const run of fresh) seenRuns.add(run.runId)
    const shots = fresh.flatMap((run) => run.generationPlan?.shots ?? []).filter((shot) => shot.role !== 'anchor')
    // 盘上读不出提示词（Run 形状变了 / 草稿被拒）时退到 draft_shots 的参数：那是模型亲手写的那一份。
    const fromRun = shots.map((shot) => String(shot.prompt ?? shot.candidate?.prompt ?? shot.candidate?.parameters?.prompt ?? ''))
    const fromArgs = draftArgs.flatMap((args) => (Array.isArray(args.shots) ? args.shots : []).filter((shot) => shot?.role !== 'anchor').map((shot) => String(shot?.prompt ?? '')))
    const prompts = fromRun.some(Boolean) ? fromRun : fromArgs
    record.promptSource = fromRun.some(Boolean) ? 'run' : fromArgs.length ? 'draft_shots-args' : 'none'
    record.drafted = prompts.map((prompt) => prompt.slice(0, 160))
    const matchedShots = (prompt) => MARKERS.filter((marker) => marker.pattern.test(prompt)).map((marker) => marker.shot)
    record.draftShotMatches = prompts.map(matchedShots)
    const covered = new Set(record.draftShotMatches.flat())
    record.copiedRightRows = prompts.length === item.want.length
      && item.want.every((shot) => covered.has(shot))
      && [...covered].every((shot) => item.want.includes(shot))
    record.toolWriteCorrect = record.rejected.length === 0
    record.turnSuccess = record.readTable && record.copiedRightRows && !record.error
    rounds.push(record)
    console.log(`[remake ${LABEL}] ${item.id}「${item.ask}」读表=${record.readTable} 起草=${prompts.length} 镜(${record.promptSource}) 命中=${JSON.stringify(record.draftShotMatches)} 抄对=${record.copiedRightRows} 被拒=${record.rejected.length} 大脑调用=${record.modelCalls} 工具=${tools.join('>')}${record.error ? ' 错误=' + record.error : ''}`)
  }

  const ran = rounds.filter((round) => !round.skipped)
  const count = (predicate) => ran.filter(predicate).length
  walk.report.numbers = {
    label: LABEL,
    brain: `${BRAIN.vendorKey}/${BRAIN.modelKey}`,
    rounds: `${ran.length}/${rounds.length}`,
    readTable: `${count((r) => r.readTable)}/${ran.length}`,
    toolWriteCorrect: `${count((r) => r.toolWriteCorrect)}/${ran.length}`,
    copiedRightRows: `${count((r) => r.copiedRightRows)}/${ran.length}`,
    turnSuccess: `${count((r) => r.turnSuccess)}/${ran.length}`,
    cardShown: `${count((r) => r.cardShown)}/${ran.length}`,
    modelCalls,
    modelCallCap: MODEL_CALL_CAP,
  }
  walk.report.rounds = rounds
  console.log(`[remake ${LABEL}] ${JSON.stringify(walk.report.numbers)}`)
  fs.writeFileSync(path.join(walk.report.outputDir, `shot-table-remake-real-${LABEL}.json`), JSON.stringify({ numbers: walk.report.numbers, rounds }, null, 2))
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await paid.finish(failure)
}
