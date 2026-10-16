#!/usr/bin/env node
// #1203「Agent 权限两档 + 两个刹车」的**真付费**验收（最小量：总共不超过 3 张图）。
//
//   NOMI_SPEND_OK=1 node tests/ux/agent-permission-two-tiers.paid.mjs [--packaged <Nomi 可执行文件的绝对路径>]
//
// 凭据两个来源（tests/ux/_paidRun.mjs 的 openPaidWalk；设了环境变量就走第二条，不读真实资料）：
//   · 缺省：从用户真实资料目录拷 APIMart 的密文进隔离副本；
//   · 设了 APIMART_API_KEY：走可见的接入页把 key 装进隔离副本，跑完整个副本删除（key 不进日志 / 报告 / 截图名 / 账本 / 异常信息）。
//
// 大脑 DeepSeek V3.2，生图最便宜的 z-image-turbo（花钱面收窄到这一个图模型，其余生成模型一律停用）。
// 步骤与判据见 _permissionTiersPaidSteps.mjs 文件头；每一步记事实：供应商受理次数、收据条数与 decidedBy、有没有弹报价卡、
// 停止后新增提交数。zh / en 各留真截图。花钱保险丝：受理数超过当前上限立刻停掉被测 App。
//
// 预计调用：图片 2 次（文稿方案前两镜）+ 至多 1～2 次（第 4 步，第一张交出后停止）；大脑回合约 6～12 次；
// 接入页验证一次大脑模型（几个 token）。刹车 1（同一镜连续失败）不在这里验。
import path from 'node:path'

import { stationTimeout } from './_station-budget.mjs'
import { openPaidWalk } from './_paidRun.mjs'
import {
  IMAGE_CAP, collectProblems, createSpendCap, createStepContext, runPlanAndBrakeStep, runStopStep, runSwitchStep,
} from './_permissionTiersPaidSteps.mjs'
import { COMPOSER, CREATION_PANEL, chooseAssistantModel, expandResidentPanel, sendCreation } from './agent-runtime-walk-support.mjs'
import { expect } from './_assert.mjs'

const BRAIN = { vendorKey: 'apimart', modelKey: 'deepseek-v3.2' }
const IMAGE = { vendorKey: 'apimart', modelKey: 'z-image-turbo' }

// 第 2/3 步（中文，文稿方案）：一条消息，前 2 镜直接出图，再补第 3 镜触发「计划外」刹车。
const ASK_PLAN = '按文稿把这两句拆成 2 个镜头，用 Z-Image Turbo 各出一张图（16:9 横构图）；出完之后再补第 3 个镜头也出图：渔港夜景。'
// 第 4 步（界面此时已切成 English）：再来一次，第一张交出后由走查点停止。
const ASK_STOP = 'Generate 2 more images with Z-Image Turbo, 16:9: a harbour at night, one calm and one stormy.'

const paid = await openPaidWalk('agent-permission-two-tiers.paid.mjs', 'permission-two-tiers-paid', [BRAIN, IMAGE])
const { walk } = paid
let cap
let failure
try {
  const { win } = await walk.start({ first: true })
  await paid.lockToAuthorizedModels(win)
  const { projectRoot } = await walk.newProject()
  await expandResidentPanel(win)
  await expect(win.locator(`${CREATION_PANEL} ${COMPOSER}`)).toBeVisible({ timeout: stationTimeout({ operations: 4 }) })
  await chooseAssistantModel(win, paid.label(BRAIN.vendorKey, BRAIN.modelKey), CREATION_PANEL)

  cap = createSpendCap({ projectRoot, stopApp: () => walk.stopApp() })
  const ctx = createStepContext({
    win, walk, projectRoot, capabilityDir: path.join(walk.report.tempRoot, 'capability'),
    allowedModel: `${IMAGE.vendorKey}/${IMAGE.modelKey}`, cap,
    ask: async (_kind, text) => sendCreation(win, text),
  })
  walk.report.imageCap = IMAGE_CAP
  await runSwitchStep(ctx)
  await runPlanAndBrakeStep(ctx, { askText: ASK_PLAN })
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
