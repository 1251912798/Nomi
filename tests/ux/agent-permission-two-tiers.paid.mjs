#!/usr/bin/env node
// #1203「Agent 权限两档 + 两个刹车」的**真付费**验收（最小量：预计 3 张图，最坏 4 张）。
//
//   NOMI_SPEND_OK=1 node tests/ux/agent-permission-two-tiers.paid.mjs [--packaged <Nomi 可执行文件的绝对路径>]
//
// 凭据两个来源（tests/ux/_paidRun.mjs 的 openPaidWalk；设了环境变量就走第二条，不读真实资料）：
//   · 缺省：从用户真实资料目录拷 APIMart 的密文进隔离副本；
//   · 设了 APIMART_API_KEY：走可见的接入页把 key 装进隔离副本，跑完整个副本删除（key 不进日志 / 报告 / 截图名 / 账本 / 异常信息）。
//
// 大脑 DeepSeek V3.2，生图最便宜的 z-image-turbo（花钱面收窄到这一个图模型，其余生成模型一律停用）。
// 步骤与判据见 _permissionTiersPaidSteps.mjs 文件头（含「文稿方案没花钱就回退到画布草稿」的分支）；每一步记事实：供应商受理次数、收据条数与 decidedBy、有没有弹报价卡、
// 停止后新增提交数。zh / en 各留真截图。花钱保险丝：受理数超过当前上限立刻停掉被测 App。
//
// 预计调用：图片 2 次（文稿方案前两镜；文稿路没花钱就改在画布上要 2 张）+ 1～2 次（第 4 步要 2 张，供应商受理第一张后点停止，第二张若抢在停止前发出就是多 1 张）；大脑回合约 6～12 次；
// 接入页验证一次大脑模型（几个 token）。刹车 1（同一镜连续失败）不在这里验。
import path from 'node:path'

import { stationTimeout } from './_station-budget.mjs'
import { openPaidWalk } from './_paidRun.mjs'
import {
  IMAGE_CAP, IMAGE_HARD_CAP, collectProblems, createSpendCap, createStepContext, runBrainSmokeStep, runCanvasDirectStep, runPlanAndBrakeStep, runStopStep, runSwitchStep,
  switchAppLocale,
} from './_permissionTiersPaidSteps.mjs'
import { CANVAS_PANEL, COMPOSER, CREATION_PANEL, chooseAssistantModel, expandResidentPanel, sendCanvas, sendCreation } from './agent-runtime-walk-support.mjs'
import { expect } from './_assert.mjs'

// 大脑 = Nomi 给 APIMart 用户的**默认** Agent 模型 deepseek-v4-pro（electron/catalog/apimartTexts.ts 的「默认大脑」；没有偏好时
// textBrainResolver 按目录顺序取的第一个就是它），真实用户最可能用的就是这个，验收要照真实用户的样子来。
// 不用 deepseek-v3.2（旧目录模型）；也不用 deepseek-v4-flash：D-L19 诊断它建完草稿不调 generate（回执线修好后再用它复验）。
const BRAIN = { vendorKey: 'apimart', modelKey: 'deepseek-v4-pro' }
const IMAGE = { vendorKey: 'apimart', modelKey: 'z-image-turbo' }

// 第 2/3 步（中文，文稿方案）：一条消息，前 2 镜直接出图，再补第 3 镜触发「计划外」刹车。
// 分两轮发：一句话里说完 3 镜，模型会一次把 3 镜建进同一个方案，刹车 2 无从触发。两轮都点明「现在就生成」。
const ASK_PLAN = '按文稿把这两句拆成 2 个镜头，用 Z-Image Turbo 各出一张图（16:9 横构图），现在就生成。'
const ASK_PLAN_MORE = '再补第 3 个镜头：渔港夜景，也用 Z-Image Turbo 出一张图（16:9），现在就生成。'
// 回退（文稿方案这条路一张都没花时才走）：画布面板，D-L19 原第 2 步。
const ASK_CANVAS = '用 Z-Image Turbo 生成 2 张参考图：日出海面，16:9 横构图，两张构图略有不同，现在就生成。'
// 第 4 步（界面此时已切成 English）：再来一次，供应商受理第一张后由走查点停止。
const ASK_STOP = 'Generate 2 more images with Z-Image Turbo, 16:9: a harbour at night, one calm and one stormy. Generate them now.'

const paid = await openPaidWalk('agent-permission-two-tiers.paid.mjs', 'permission-two-tiers-paid', [BRAIN, IMAGE])
const { walk } = paid
let cap
let failure
try {
  const { win } = await walk.start({ first: true })
  // 先开项目再接入：打开模型设置的事件由工作区壳监听，项目库页上没人听（env-key 路要走接入页）。
  const { projectRoot } = await walk.newProject()
  await paid.lockToAuthorizedModels(win)
  await expandResidentPanel(win)
  await expect(win.locator(`${CREATION_PANEL} ${COMPOSER}`)).toBeVisible({ timeout: stationTimeout({ operations: 4 }) })
  await chooseAssistantModel(win, paid.label(BRAIN.vendorKey, BRAIN.modelKey), CREATION_PANEL)

  cap = createSpendCap({ projectRoot, stopApp: () => walk.stopApp() })
  const ctx = createStepContext({
    win, walk, projectRoot, capabilityDir: path.join(walk.report.tempRoot, 'capability'),
    allowedModel: `${IMAGE.vendorKey}/${IMAGE.modelKey}`, cap,
    ask: async (kind, text) => (kind === 'plan' || kind === 'plan2' || kind === 'smoke' ? sendCreation(win, text) : sendCanvas(win, text)),
  })
  walk.report.imageCap = { planned: IMAGE_CAP, worst: IMAGE_HARD_CAP }
  // 先问大脑一句话：回不了话就在花图片钱之前停（几个 token）。
  const smoke = await runBrainSmokeStep(ctx, { askText: '你好，请只回复一个字。' })
  if (!smoke.ok) throw new Error(`大脑冒烟没过（${smoke.outcome}）：Agent 用 ${BRAIN.modelKey} 回不了话，图片的钱一分没花；原始报错见证据目录 app-logs/`)
  await runSwitchStep(ctx)
  const plan = await runPlanAndBrakeStep(ctx, { askText: ASK_PLAN, askMoreText: ASK_PLAN_MORE })
  if (plan.abort) throw new Error('第 2 步：大脑没调 generate，没有再往下花 token（事实见报告 steps）')
  // 文稿方案这条路一张都没花（例如弹出了旧版确认框）：到画布面板补上 D-L19 原第 2 步，证「直接生成不弹卡」。
  if (plan.accepted < 2) {
    const canvas = await runCanvasDirectStep(ctx, { askText: ASK_CANVAS })
    if (canvas.brainNoGenerate) throw new Error('第 2b 步：大脑没调 generate，没有再往下花 token（事实见报告 steps）')
  }
  // 第 4 步用英文界面：zh / en 各有真截图。
  if ((await win.evaluate(() => localStorage.getItem('nomi:locale:v1'))) !== 'en') await switchAppLocale(win, 'en')
  await runStopStep(ctx, { askText: ASK_STOP })
  cap.assertNotBreached()

  const { problems, unverified } = collectProblems(walk.report.steps)
  walk.report.unverified = unverified
  if (problems.length) throw new Error(`#1203 真付费验收有不成立的事实：\n  ${problems.join('\n  ')}`)
  walk.report.verified = Object.keys(walk.report.steps).filter((name) => !unverified.includes(name))
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  cap?.stop()
  await paid.finish(failure)
}
