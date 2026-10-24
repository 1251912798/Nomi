#!/usr/bin/env node
// 真实用户任务：付费卡上点了「生成」，那一下还在路上就立刻点「取消」（确认中立刻关闭）。
// D2 第③步：「生成」= 把这一镜交给画布（宿主在出价上记交接），「取消」= 收回这一次出价、任何时候都直接送到宿主（不排在「生成」后面）。
// 谁先到都只能有一个终态——回执里在生成的 = 交出去了的 = 供应商收到的，取消之后没交出去的不再交；取消回给卡的那一句和账本一致。
// 两下在同一帧里点卡上那两颗真按钮（不是一次采样坐标连点：第二下重新找按钮）——两次 locator 点击之间单段卡早就交完、收起来了。
// 中英各一遍，各开一个新项目。零额度：远端供应商是 loopback 夹具，其余全是真的。
import { clickOrFail, expect } from './_assert.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { createPresenter } from './_spendCardWalk.mjs'
import { singleStopRound } from './_spendStopRounds.mjs'
import { CANVAS_PANEL, createRuntimeWalk, expandResidentPanel, openCanvas } from './agent-runtime-walk-support.mjs'
import { backToLibrary, newProjectEntry } from './_shell.mjs'

const present = createPresenter('S_CLOSE')
const walk = await createRuntimeWalk('spend-confirm-then-close', { generationProvider: 'apimart', trustFixtureOrigin: true })
let failure
try {
  const { win } = await walk.start({ first: true })
  const zhProject = await walk.newProject()
  await openCanvas(win)
  await singleStopRound(walk, win, zhProject.projectId, 'zh-CN', { present, mode: 'immediate' })

  await backToLibrary(win, { timeout: stationTimeout({ operations: 4 }) })
  await win.evaluate(() => localStorage.setItem('nomi:locale:v1', 'en'))
  await win.reload()
  await clickOrFail(newProjectEntry(win), 'en：新建空白项目', { timeout: stationTimeout({ operations: 4 }) })
  await clickOrFail(win.getByRole('button', { name: 'Generate', exact: true }), 'en：生成工作区', { timeout: stationTimeout({ operations: 4 }) })
  await expect(win.locator('.generation-canvas-v2__stage'), 'en：生成画布').toBeVisible({ timeout: stationTimeout({ operations: 4 }) })
  const enProjectId = await win.evaluate(() => {
    const url = new URL(location.href)
    return url.searchParams.get('projectId') ?? new URLSearchParams(url.hash.split('?')[1] ?? '').get('projectId')
  })
  expect(enProjectId, 'en：新项目的 id').toMatch(/^project-/)
  expect(enProjectId, 'en：是另开的新项目').not.toBe(zhProject.projectId)
  await expandResidentPanel(win)
  await expect(win.locator(`${CANVAS_PANEL} [data-v4-control="input"]`), 'en：Agent 面板的输入框在').toBeVisible({ timeout: stationTimeout({ operations: 4 }) })
  await singleStopRound(walk, win, enProjectId, 'en', { present, mode: 'immediate' })

  walk.report.verified = [
    'confirm-then-immediate-close-has-one-terminal',
    'receipt-generating-equals-handed-over-equals-vendor-received',
    'stop-sentence-agrees-with-the-hand-over-ledger',
  ]
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await walk.finish(failure)
}
