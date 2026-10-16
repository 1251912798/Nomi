// #1203「Agent 权限两档 + 两个刹车」真付费验收的步骤本体（2026-10-16）。
// 真付费走查（agent-permission-two-tiers.paid.mjs）与 loopback 演练（agent-permission-two-tiers.rehearsal.walk.mjs）
// 跑**同一份**步骤：差别只在 `ctx.ask`——真付费让真模型自己决定怎么调工具，演练给夹具里的大脑写剧本。
//
// 步骤与判据照 D-L19 报告「给协调的最小量真付费验收」，总上限 3 张图。D-L19 把「画布草稿出 2 张」「文稿方案出 2 张再补第 3 镜」
// 写成两个各花 2 张的步骤，加上第 4 步会到 5 张，与它自己写的上限不符；这里按 3 张的上限合成：
//   ① 切到「直接生成」——不花钱；
//   ② + ③ 同一条消息、文稿方案：前 2 镜不弹卡、受理 2 次、收据 2 条（decidedBy = policy:full_auto）；
//        补第 3 镜时报价卡立刻弹、卡上有计划外那一行，点「去掉」后受理仍是 2（刹车不铸收据、不发请求）；
//   ④ 再生成一次，第一张交出后马上点停止：停止后新增提交 0，已交出的只扣一次，重开面板后没有重复提交。
// 刹车 1（同一镜连续失败）不在真付费里验：不该花钱造失败，靠适配器边界测试。
//
// 每一步只记事实（受理次数、收据条数与 decidedBy、有没有弹卡、停止后新增提交数），事实全部取自盘上，不取自界面；
// 判据在 _paidFacts.mjs（纯函数，单测钉着）。
import { clickOrFail, expect } from './_assert.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { deltaFacts, readSpendFacts, stepBrakeVerdict, stepDirectBatchVerdict, stepStopVerdict, stepSwitchVerdict } from './_paidFacts.mjs'
import { spendReceipt } from './_paidRun.mjs'
import {
  APPROVAL_CARD, COMPOSER, COMPOSER_PERMISSION, COMPOSER_STOP, CREATION_PANEL, DOCUMENT, INTERVENTION_ALTERNATE,
  INTERVENTION_CONFIRM, PERMISSION_POPOVER, permissionTier,
} from './agent-runtime-walk-support.mjs'
import { uiText } from './full-walk/invariants.mjs'

export const PANEL = CREATION_PANEL
export const SPEND_CARD = `${PANEL} ${APPROVAL_CARD}[data-kind="spend"]`
/** 总上限（张）：整场供应商受理的图不得超过它；超了立刻停 App。 */
export const IMAGE_CAP = 3
/** 一张图「交出」的 job 状态（与 _spendStopRounds.mjs 的 settledJobs 同一组词）。 */
const DELIVERED = new Set(['adopted', 'ready'])

export const DOCUMENT_TEXT = '清晨的渔港，薄雾里渔船缓缓出港。\n日落时分，海面被染成金色，渔船归航。'

/**
 * 花钱保险丝：盯着盘上的受理数，超过当前上限就当场停 App（App 停了就再没有新的提交）。
 * 它不替代步骤自己的判据——只是兜住「模型反复生成」这类跑飞的情形，把多花的钱限制在一张以内。
 */
export function createSpendCap({ projectRoot, stopApp, ceiling = IMAGE_CAP, intervalMs = 700, read = (root) => spendReceipt(root).media.filter((entry) => entry.taskId).length }) {
  let limit = ceiling
  let breached = null
  const timer = setInterval(() => {
    if (breached) return
    const accepted = read(projectRoot)
    if (accepted > limit) {
      breached = { accepted, limit }
      console.error(`[paid] 受理数 ${accepted} 超过当前上限 ${limit}——立即停掉被测 App`)
      Promise.resolve(stopApp()).catch(() => {})
    }
  }, intervalMs)
  return {
    setCeiling(next) { limit = Math.min(next, IMAGE_CAP) },
    stop() { clearInterval(timer) },
    breached: () => breached,
    assertNotBreached() { if (breached) throw new Error(`花钱保险丝跳了：供应商受理 ${breached.accepted} 次，当前上限 ${breached.limit}`) },
  }
}

/** 在真实 DOM 上挂观察者：报价卡**出现过几次**，以及每次出现时卡上的字。 */
export async function watchSpendCards(win) {
  const slot = `__paidSpendCardWatch${Date.now()}`
  await win.evaluate(({ selector, slot: key }) => {
    const log = { appearances: 0, texts: [] }
    let open = false
    const sample = () => {
      const card = document.querySelector(selector)
      if (card && !open) { log.appearances += 1; log.texts.push((card.textContent ?? '').trim().slice(0, 600)) }
      open = Boolean(card)
    }
    window[key] = log
    sample()
    new MutationObserver(sample).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true })
  }, { selector: SPEND_CARD, slot })
  return { read: () => win.evaluate((key) => window[key], slot) }
}

async function switchAppLocale(win, locale) {
  await clickOrFail(win.getByRole('button', { name: /^(设置|Settings)$/ }).first(), '顶栏「设置」按钮')
  await clickOrFail(win.locator('[data-settings-tab-id="general"]'), '设置导航「通用」')
  await clickOrFail(win.locator(`[data-settings-locale="${locale === 'zh-CN' ? 'zh-CN' : 'en'}"]`), `语言 ${locale}`)
  await expect(win.locator(`[data-settings-locale="${locale === 'zh-CN' ? 'zh-CN' : 'en'}"][aria-pressed="true"]`), `界面已切到 ${locale}`).toBeVisible()
  await clickOrFail(win.locator('[data-settings-close]'), '设置对话框「关闭」按钮')
}

export function createStepContext({ win, walk, projectRoot, capabilityDir, ask, allowedModel, cap }) {
  const snapshot = () => readSpendFacts({ projectRoot, capabilityDir })
  const record = (name, value) => { (walk.report.steps ??= {})[name] = value; return value }
  return { win, walk, projectRoot, capabilityDir, ask, allowedModel, cap, snapshot, record }
}

/** 步骤 ①：权限弹层 → 「直接生成」→ 确认卡 → 档位变 direct。不花钱。 */
export async function runSwitchStep(ctx) {
  const { win, walk, snapshot, record } = ctx
  const before = snapshot()
  await clickOrFail(win.locator(`${PANEL} ${COMPOSER_PERMISSION}`), '权限档选择器')
  await expect(win.locator(`${PANEL} ${PERMISSION_POPOVER}`)).toBeVisible()
  await clickOrFail(win.locator(`${PANEL} ${permissionTier('direct')}`), '点「直接生成」')
  const switchCard = win.locator(`${PANEL} ${APPROVAL_CARD}[data-kind="approval-reversible"]`)
  await expect(switchCard, '切档先弹一张确认卡').toBeVisible()
  await walk.snap('paid-01-zh-switch-confirm-card')
  await clickOrFail(switchCard.locator(INTERVENTION_CONFIRM), `确认卡「${uiText('zh-CN', 'agentPanelV4.autoModeConfirmOk')}」`)
  const mode = await win.locator(`${PANEL} ${COMPOSER}`).first().getAttribute('data-approval-mode')
  await walk.snap('paid-02-zh-direct-with-reminder')
  const problems = stepSwitchVerdict({ mode, delta: deltaFacts(before, snapshot()) })
  return record('1-switch-to-direct', { mode, problems })
}

/**
 * 等「卡出现」或「这一轮落地且没卡」或超时。返回 'card' | 'idle' | 'timeout'。
 * 起飞宽限 8 秒：刚点发送时 composer 还没进运行态，不能把「还没起飞」当成「已落地」。
 */
export async function waitForCardOrIdle(win, { timeout, graceMs = 8_000, pollMs = 500 }) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await win.locator(SPEND_CARD).count()) return 'card'
    const running = await win.locator(`${PANEL} ${COMPOSER}[data-mode="running"]`).count()
    if (!running && Date.now() - started > graceMs) return 'idle'
    await win.waitForTimeout(pollMs)
  }
  return 'timeout'
}

/** 步骤 ② + ③：文稿方案前 2 镜（直接生成、不弹卡）+ 补第 3 镜（刹车、弹卡、去掉）。 */
export async function runPlanAndBrakeStep(ctx, { askText }) {
  const { win, walk, snapshot, record, cap, allowedModel } = ctx
  // 写两句文稿（真键盘输入，编辑器是 tiptap）。
  await clickOrFail(win.locator(DOCUMENT), '创作文档编辑区')
  await win.keyboard.type(DOCUMENT_TEXT)
  await win.waitForTimeout(1_500)
  const cards = await watchSpendCards(win)
  const before = snapshot()
  cap.setCeiling(2)
  await ctx.ask('plan', askText)
  const outcome = await waitForCardOrIdle(win, { timeout: stationTimeout({ turns: 2, operations: 4 }) })
  cap.assertNotBreached()
  const atCard = snapshot()
  const sawCard = outcome === 'card'
  const brakeTitle = (locale) => uiText(locale, 'agentPanelV4.brakeOutOfPlan.title')
  let brakeLineShown = false
  let firstCardIsBrake = false
  if (sawCard) {
    const card = win.locator(SPEND_CARD).first()
    brakeLineShown = (await card.textContent().catch(() => '')).includes(brakeTitle('zh-CN'))
    firstCardIsBrake = brakeLineShown
    await walk.snap('paid-03-zh-brake-card-out-of-plan')
    // 同一张卡切成 English 再看一次（卡不收：待决状态与语言无关）。
    await switchAppLocale(win, 'en')
    await expect(card, '英文界面下刹车那一行也在').toContainText(brakeTitle('en'))
    await walk.snap('paid-04-en-brake-card-out-of-plan')
  }
  const cardLog = await cards.read()
  // 步骤 ②：卡出现之前（= 刹车卡之前）弹过几次普通卡。第一张卡就是刹车卡时是 0。
  const cardsBeforeBrake = sawCard ? (firstCardIsBrake ? 0 : 1) : cardLog.appearances
  const front = deltaFacts(before, atCard)
  const directProblems = stepDirectBatchVerdict({
    expected: 2, cardAppearances: cardsBeforeBrake, delta: front, models: ctx.snapshot().models, allowedModel,
  })
  record('2-direct-first-two-shots', { cardsBeforeBrake, accepted: front.accepted, receipts: front.receipts, decidedBy: front.decidedBy, problems: directProblems })
  // 步骤 ③：点「去掉」，再等一会儿，确认受理数不变。
  let afterRemove = atCard
  if (sawCard) {
    await clickOrFail(win.locator(SPEND_CARD).locator(INTERVENTION_ALTERNATE), '报价卡上的「去掉」')
    await win.locator(`${PANEL} ${COMPOSER}[data-mode="running"]`).waitFor({ state: 'detached', timeout: stationTimeout({ turns: 1, operations: 2 }) }).catch(() => {})
    await win.waitForTimeout(6_000)
    afterRemove = snapshot()
  }
  cap.assertNotBreached()
  const { problems, boundary } = stepBrakeVerdict({
    cardAppeared: sawCard, brakeLineShown, acceptedTotal: deltaFacts(before, afterRemove).accepted,
    deltaAfterRemove: deltaFacts(atCard, afterRemove),
  })
  record('3-out-of-plan-brake', { outcome, cardAppeared: sawCard, brakeLineShown, boundary, acceptedAfterRemove: deltaFacts(before, afterRemove).accepted, receiptsAfterRemove: deltaFacts(atCard, afterRemove).receipts, problems })
  return { acceptedTotal: afterRemove.accepted }
}

/** 步骤 ④：再生成一次，第一张交出后马上点停止。 */
export async function runStopStep(ctx, { askText, settleMs = 20_000 }) {
  const { win, walk, snapshot, record, cap } = ctx
  const before = snapshot()
  cap.setCeiling(IMAGE_CAP)
  await ctx.ask('stop', askText)
  const timeout = stationTimeout({ turns: 2, operations: 4 })
  const started = Date.now()
  let deliveredTaskIds = []
  while (Date.now() - started < timeout) {
    const now = snapshot()
    const fresh = new Set(now.taskIds.filter((id) => !before.taskIds.includes(id)))
    deliveredTaskIds = now.jobs.filter((job) => DELIVERED.has(job.status) && job.providerTaskId && fresh.has(job.providerTaskId)).map((job) => job.providerTaskId)
    if (deliveredTaskIds.length >= 1) break
    cap.assertNotBreached()
    await win.waitForTimeout(500)
  }
  const stopButton = win.locator(`${PANEL} ${COMPOSER_STOP}`)
  const stopAvailable = (await stopButton.count()) > 0
  const acceptedAtDelivery = snapshot().accepted
  if (stopAvailable) await stopButton.first().click()
  await win.waitForTimeout(2_000)
  const acceptedAtStop = snapshot().accepted
  await win.waitForTimeout(settleMs)
  const acceptedAfterSettle = snapshot().accepted
  await walk.snap('paid-05-en-after-stop')
  // 重开面板：整页重载（项目路由在地址里），再等一会儿看有没有重复提交。
  await win.reload({ waitUntil: 'domcontentloaded' })
  await expect(win.locator(`${PANEL} ${COMPOSER}`).first(), '重载后面板回来了').toBeVisible({ timeout: stationTimeout({ operations: 4 }) })
  await win.waitForTimeout(10_000)
  const acceptedAfterReopen = snapshot().accepted
  cap.assertNotBreached()
  const problems = stopAvailable
    ? stepStopVerdict({ acceptedAtStop, acceptedAfterSettle, acceptedAfterReopen, deliveredTaskIds })
    : []
  return record('4-stop-after-first-delivered', {
    stopAvailable, acceptedAtDelivery, acceptedAtStop, acceptedAfterSettle, acceptedAfterReopen,
    deliveredTaskIds: deliveredTaskIds.length, newAcceptedThisStep: deltaFacts(before, snapshot()).accepted,
    note: stopAvailable ? undefined : '第一张交出时停止钮已不在（这一轮已经收尾）——记为 unverified，不算通过',
    problems,
  })
}

/** 全部步骤的问题合并成一份清单（空 = 全部成立；边界与 unverified 另列，不算失败也不算通过）。 */
export function collectProblems(steps) {
  const problems = Object.entries(steps).flatMap(([name, step]) => (step.problems ?? []).map((problem) => `${name}：${problem}`))
  const unverified = Object.entries(steps).filter(([, step]) => step.boundary || step.stopAvailable === false).map(([name]) => name)
  return { problems, unverified }
}
