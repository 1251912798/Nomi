// 「Agent 做一段视频 → 付费卡点生成 → 片子落节点 → 英文 + 重开还在」整条路的步骤本体，唯一一份（2026-10-18）。
// 真付费走查（agent-video-landing.paid.mjs）与零额度演练（agent-video-landing-paid.rehearsal.walk.mjs）都只调它：
// 接入 → 开项目 → 开画布 → Agent 出卡 → 核草稿是最便宜那一档 → 点生成 → 片子落节点 → 任务面板 → 英文 + 重开。
// 为什么顺序也收在这里：接入（lockToAuthorizedModels）与开项目谁先谁后，以前每份走查各记各的，
// 记错一次（项目库页上接入）就是一场超时；现在只有这一处写它，演练一走就知道这个顺序走不走得通。
//
// 两处只在演练里才有的差别由参数给：duringObservation（夹具压着出片，先验观察窗）、realMedia（真供应商才核片长 / 音轨）。
import { DEFAULT_TIMEOUT_MS, clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { BRAIN, CHEAP_VIDEO_TERMS, cheapVideoProblems, plannedShots, probeLandedMedia } from './_agentVideoPaid.mjs'
import { readProductionRuns } from './_paidRun.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { uiText } from './full-walk/invariants.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, INTERVENTION_CONFIRM,
  chooseAssistantModel, closeSpendCard, openCanvas, readProject, sendCanvas,
} from './agent-runtime-walk-support.mjs'

/** 单次观察窗（默认 300s）压到 15s：真视频一般要一两分钟，窗口一定会过——这正是 ② 要证的。 */
export const OBSERVATION_WINDOW_MS = 15_000
export const ASK = `做一个 4 秒的视频镜头：一只纸船在雨后的水洼里慢慢漂，清晨的光。只要这一镜，用 ${CHEAP_VIDEO_TERMS}。直接生成。`
const MODEL_TURN_MS = stationTimeout({ turns: 1 })
/** 真视频出片的安全上限（完成信号是节点 data-status=success，不是这个数）。 */
const VIDEO_LANDS_MS = stationTimeout({ turns: 2 })
/** 任务面板里「供应商长时间没有返回新状态」那句的词典键（文案按键取，不抄）。 */
const STALE_KEY = 'generationCommon.production.status.providerStale'
const TASK_TRIGGER = '[data-task-center-trigger="true"]'

/**
 * 等付费卡，但面板里一出现报错卡（AgentPanelV4Receipt.tsx 的 `data-v4-block="errorbar"`）就立刻失败并带上报错文字，
 * 不再傻等满 MODEL_TURN_MS（10-18 大脑模型 404，面板 20 秒就红了，走查却等了 315 秒）。超时和断言与原来一致。
 */
async function waitSpendCardOrFailOnErrorBar(win, card) {
  const errorBar = win.locator(`${CANVAS_PANEL} [data-v4-block="errorbar"]`).first()
  let settled = false
  const watcher = (async () => {
    const deadline = Date.now() + MODEL_TURN_MS
    while (!settled && Date.now() < deadline) {
      if (await errorBar.isVisible().catch(() => false)) {
        const text = ((await errorBar.innerText().catch(() => '')) || '').trim()
        throw new Error(`Agent 面板出现报错卡，不用再等付费卡了：${text}`)
      }
      await win.waitForTimeout(500).catch(() => {})
    }
    return new Promise(() => {})
  })()
  watcher.catch(() => {})
  try {
    await Promise.race([
      expect(card, 'Agent 起草并请求生成之后，付费卡摆在面板里等人').toBeVisible({ timeout: MODEL_TURN_MS }),
      watcher,
    ])
  } finally {
    settled = true
  }
}

/**
 * @param {{ paid: Awaited<ReturnType<typeof import('./_paidRun.mjs').openPaidWalk>>, win: import('playwright').Page,
 *   askText?: string, realMedia?: boolean, duringObservation?: (ctx: { node: import('playwright').Locator }) => Promise<void> }} options
 */
export async function runAgentVideoLanding({ paid, win, askText = ASK, realMedia = true, duringObservation }) {
  const { walk } = paid
  await paid.lockToAuthorizedModels(win)
  const { projectId, projectRoot } = await walk.newProject()
  await openCanvas(win)
  await chooseAssistantModel(win, paid.label(BRAIN.vendorKey, BRAIN.modelKey), CANVAS_PANEL)

  await sendCanvas(win, askText)
  const card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
  await waitSpendCardOrFailOnErrorBar(win, card)
  // ── 花钱之前：卡上要花的那一笔（等人答的那个 Run）就是被授权的那一档，而且只有一镜 ──
  // 模型可能起草了不止一次（每次一个 Run）；卡上等人的是最后调 generate 的那一份。多出来的草稿不花钱，如实记下。
  const runs = readProductionRuns(projectRoot).filter((run) => run.generationPlan)
  const run = runs.at(-1)
  const shots = plannedShots(run)
  const problems = shots.flatMap((shot) => cheapVideoProblems(shot.candidate).map((problem) => `${shot.shotId}：${problem}`))
  walk.report.draft = {
    runs: runs.length, runId: run?.runId,
    shots: shots.map((shot) => ({ shotId: shot.shotId, providerId: shot.candidate?.providerId, modelId: shot.candidate?.modelId,
      variantId: shot.candidate?.variantId, parameters: shot.candidate?.parameters })),
    // 卡上印给用户看的「变体」——和宿主要派发的那一档对照（两者不一致 = 看到的不是要付的）。
    cardVariant: (await card.locator('[aria-label="变体"]').first().getAttribute('title').catch(() => null)) ?? null,
  }
  await walk.snap('video-01-zh-spend-card-before-confirm')
  if (shots.length !== 1 || problems.length) {
    await closeSpendCard(card, '草稿不是被授权的那一档，关卡不花钱')
    walk.report.blockedBeforeSpend = problems
    throw new Error(`付费前拦下（一分钱没花，卡已关）：宿主要派发的不是被授权的 Seedance 2.0 fast · 480p · 4s · 无音频——`
      + `${shots.length} 镜；${problems.join('；')}；卡上显示的变体是 ${walk.report.draft.cardVariant}`)
  }
  await expect.poll(async () => (await readProject(win, projectId)).payload.generationCanvas.nodes
    .filter((node) => node.kind === 'video' && node.meta?.productionRunId === run.runId).length, { message: '草稿落成画布上一个视频节点', timeout: DEFAULT_TIMEOUT_MS }).toBe(1)
  const nodeId = (await readProject(win, projectId)).payload.generationCanvas.nodes
    .find((node) => node.kind === 'video' && node.meta?.productionRunId === run.runId).id
  const node = win.locator(`[data-node-id="${nodeId}"]`)

  // ── ① 确认 → 节点上是普通生成那张等待画面 ──
  const confirmedAt = Date.now()
  await clickOrFail(card.locator(INTERVENTION_CONFIRM), '付费卡上的主按钮', { noWaitAfter: true })
  const waiting = node.locator('[data-generating-placement="surface"]')
  await expect(waiting, '① 节点上是普通生成那张等待画面（GenerationWaitingSurface）').toBeVisible({ timeout: stationTimeout({ operations: 4 }) })
  await expect(node, '① 节点自己的状态就是「生成中」——与普通生成同一份状态').toHaveAttribute('data-status', 'running')
  const waitingProof = await proveProbe(waiting, '等待画面这个探针测得到')
  await expectAbsent(node.locator('.generation-canvas-v2-node__generating-overlay'), { provenBy: waitingProof, message: '①「整卡模糊 + N 字标」那第二套等待画面不在这个节点上' })
  await walk.snap('video-02-zh-waiting-ordinary-surface')

  // ② 仅演练：夹具把片子压在门口，这里先确认「观察窗过了 Nomi 还在问、没有再交一次」，再放行出片。真付费没有这个闸（供应商自己慢）。
  if (duringObservation) await duringObservation({ node })
  // ── ② + ③ 真视频出片：节点变结果（窗口过了还在问，才等得到这一刻）──
  await expect(node, '③ 供应商一出片，节点就变成结果——不是永远转圈').toHaveAttribute('data-status', 'success', { timeout: VIDEO_LANDS_MS })
  const landedAfterMs = Date.now() - confirmedAt
  await expectAbsent(waiting, { provenBy: waitingProof, message: '③ 出片之后等待画面收起来' })
  const finalRun = readProductionRuns(projectRoot).find((candidate) => candidate.runId === run.runId)
  const providerTasks = new Set((finalRun.jobs ?? []).map((job) => job.providerTaskId).filter(Boolean))
  expect(providerTasks.size, '只花了一笔：这一镜恰好一个供应商任务（观察窗过了只查不交）').toBe(1)
  const landed = (await readProject(win, projectId)).payload.generationCanvas.nodes.find((item) => item.id === nodeId)
  const artifact = (finalRun.artifacts ?? []).find((item) => item.kind === 'video' && item.status !== 'rejected')
  expect(artifact?.projectRelativePath, '③ 真 mp4 落进了项目素材库').toMatch(/\.mp4$/)
  expect(landed.result?.url, '③ 节点结果是素材库的永久地址（不是会过期的签名预览链）')
    .toBe(`nomi-local://asset/${encodeURIComponent(projectId)}/${artifact.projectRelativePath.split('/').map(encodeURIComponent).join('/')}`)
  const media = await probeLandedMedia(projectRoot, projectId, landed.result.url)
  walk.report.landed = { nodeId, landedAfterMs, observationWindowMs: OBSERVATION_WINDOW_MS, providerTaskIds: [...providerTasks], media }
  expect(media.probe.kind, '③ 落盘的是一段能解码的视频').toBe('video')
  // 片长 / 有无音频只有真供应商按被授权的那一档出的片才有意义；演练的片子是夹具固定的那一段。
  if (realMedia) {
    expect(Math.abs(media.probe.durationSeconds - 4) < 0.5, `③ 片长就是授权的 4 秒（实测 ${media.probe.durationSeconds}s）`).toBe(true)
    expect(media.probe.hasAudio, '③ 授权的是无音频那一档').toBe(false)
  }
  // ② 的判据：出片晚于一个观察窗 = 窗口过后宿主还在问、而且问到了。早于窗口出片就诚实地记「没触发」，不假装验过。
  walk.report.observationWindowExercised = landedAfterMs > OBSERVATION_WINDOW_MS
  await walk.snap('video-03-zh-landed')

  await clickOrFail(win.locator(TASK_TRIGGER), '打开任务面板')
  const runCard = win.locator('[data-production-task-card]').first()
  await expect(runCard, '③ 任务面板里有这次制作').toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
  await expect(runCard.locator('[data-production-status-title]'), '③ 不再说供应商长时间没有返回新状态').not.toHaveText(uiText('zh-CN', STALE_KEY))
  await expect(runCard, '③ 生成阶段记为完成（不再是 0 / N）').not.toContainText(/\b0 \/ \d+ 已完成/)
  await walk.snap('video-04-zh-task-panel-after-landing')
  await win.keyboard.press('Escape')

  // ── ④ 英文 + 重开：片子还在 ──
  await win.evaluate(() => localStorage.setItem('nomi:locale:v1', 'en'))
  await win.reload()
  await expect(win.locator(`[data-node-id="${nodeId}"]`), '④ EN · 重开之后节点仍是结果').toHaveAttribute('data-status', 'success', { timeout: DEFAULT_TIMEOUT_MS })
  await walk.snap('video-05-en-landed-after-reload')
  await clickOrFail(win.locator(TASK_TRIGGER), 'open the task panel (EN)')
  const enCard = win.locator('[data-production-task-card]').first()
  await expect(enCard).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
  await expect(enCard.locator('[data-production-status-title]')).not.toHaveText(uiText('en', STALE_KEY))
  await walk.snap('video-06-en-task-panel')

  walk.report.verified = [
    'agent-paid-card-node-uses-the-ordinary-waiting-surface',
    'real-video-lands-as-local-mp4-on-the-same-node',
    'exactly-one-provider-task',
    'task-panel-no-longer-claims-the-provider-is-stale',
    'result-survives-reload-in-english',
  ]
}
