#!/usr/bin/env node
// 真实用户任务：**「我想让 Agent 一口气生成，不想一次次点确认；想谨慎的时候再切回去。」**
//
// 2026-10-12 用户拍板：权限只有两档——请求批准（默认）/ 直接生成；每档下面一行灰字说清会发生什么；
// 切进「直接生成」先弹一次确认，开着时常驻一条提醒。这条走查在真 Electron 里点这条路径，zh 亮 + en 暗各截一套：
//   ① 打开权限弹层：只有两档、每档各有一行灰字，默认「请求批准」；
//   ② 点「直接生成」：不是直接切过去，而是先出一张确认卡（说清会直接开跑）；
//   ③ 确认之后：常驻提醒出现，档位变成「直接生成」；点提醒上的「回到请求批准」能切回来；
//   ④ 点「取消」时档位不变（zh 套）。
// 不灌 store、不直调桥：全部是真点击。不发生任何生成、不碰网络（远端是 loopback 夹具，本走查一个字节都不发）。
import { clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { uiText } from './full-walk/invariants.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, COMPOSER, COMPOSER_PERMISSION, INTERVENTION_CONFIRM, INTERVENTION_REJECT, PERMISSION_POPOVER,
  createRuntimeWalk, openCanvas, permissionTier,
} from './agent-runtime-walk-support.mjs'

const BANNER = '[data-v4-block="auto-mode"]'
const walk = await createRuntimeWalk('permission-two-tiers')
let failure
try {
  const { win } = await walk.start({ first: true })
  await walk.newProject()
  await openCanvas(win)
  const panel = win.locator(CANVAS_PANEL)

  /** 一套：给定语言 + 明暗，点完整条路径并截图。 */
  async function runSet({ locale, scheme, tag }) {
    await win.evaluate(({ locale, scheme }) => {
      localStorage.setItem('nomi:locale:v1', locale)
      localStorage.setItem('nomi-color-scheme', scheme)
    }, { locale, scheme })
    await win.reload({ waitUntil: 'domcontentloaded' })
    // 重载后仍停在同一个项目的生成页（路由在地址里）；换成英文后「生成工作区」的中文入口不在了，所以只在第一套点进去。
    await expect(panel.locator(COMPOSER), `${tag} 重载后面板还在`).toBeVisible({ timeout: stationTimeout({ operations: 2 }) })
    const label = (key) => uiText(locale, `agentPanelV4.${key}`)

    // ① 弹层：两档 + 各一行灰字
    await expect(panel.locator(COMPOSER)).toHaveAttribute('data-approval-mode', 'request')
    await clickOrFail(panel.locator(COMPOSER_PERMISSION), `${tag} 打开权限弹层`)
    const popover = panel.locator(PERMISSION_POPOVER)
    await expect(popover).toBeVisible()
    await expect(popover.locator('[data-tier]'), `${tag} 授权只有两档`).toHaveCount(2)
    for (const tier of ['request', 'direct']) {
      await expect(popover.locator(`[data-tier="${tier}"]`), `${tag} ${tier} 标题`).toContainText(label(`permission.${tier}`))
      await expect(popover.locator(`[data-v4-permission-why="${tier}"]`), `${tag} ${tier} 灰字`).toHaveText(label(`permissionWhy.${tier}`))
    }
    await expect(popover.locator('[data-tier="request"][data-active="true"]'), `${tag} 默认是请求批准 · board:AgentPermissionTiers/permission.popover.tiers`).toBeVisible()
    // 旧弹层底部那一行「编辑系统提示词」仍在同一个弹层里（旧功能普查：去处不变）。
    await expect(popover, `${tag} 系统提示词入口还在 · board:AgentPermissionTiers/permission.popover.system-prompt`).toContainText(label('systemPrompt'))
    await walk.snap(`${tag}-01-popover-two-tiers`)

    // ② 点「直接生成」：先出确认卡，档位还没变
    await clickOrFail(panel.locator(permissionTier('direct')), `${tag} 点直接生成`)
    const card = panel.locator(`${APPROVAL_CARD}[data-kind="approval-reversible"]`)
    await expect(card).toBeVisible()
    await expect(card, `${tag} 确认卡标题 · board:AgentPermissionTiers/permission.switch-confirm`).toContainText(label('autoModeConfirmTitle'))
    await expect(card, `${tag} 确认卡正文说清直接开跑`).toContainText(label('autoModeConfirmBody').replace(/\*\*/g, '').slice(0, 12))
    await expect(panel.locator(COMPOSER), `${tag} 确认之前档位不变`).toHaveAttribute('data-approval-mode', 'request')
    await walk.snap(`${tag}-02-switch-confirm`)

    if (locale === 'zh-CN') {
      // ④ 取消：档位不变，没有提醒条
      await clickOrFail(card.locator(INTERVENTION_REJECT), `${tag} 取消切档`)
      await expect(panel.locator(COMPOSER), `${tag} 取消之后档位不变`).toHaveAttribute('data-approval-mode', 'request')
      await clickOrFail(panel.locator(COMPOSER_PERMISSION), `${tag} 再次打开权限弹层`)
      await clickOrFail(panel.locator(permissionTier('direct')), `${tag} 再点直接生成`)
    }

    // ③ 确认：提醒条出现、档位变了；再从提醒条切回
    await clickOrFail(panel.locator(`${APPROVAL_CARD}[data-kind="approval-reversible"]`).locator(INTERVENTION_CONFIRM), `${tag} 确认切到直接生成`)
    await expect(panel.locator(COMPOSER)).toHaveAttribute('data-approval-mode', 'direct')
    const bannerProof = await proveProbe(panel.locator(BANNER), `${tag} 直接生成要有常驻提醒`)
    await expect(panel.locator(BANNER), `${tag} 提醒条说清不可逆仍会问 · board:AgentPermissionTiers/permission.reminder-banner`).toContainText(label('autoModeBannerNote'))
    await walk.snap(`${tag}-03-direct-with-reminder`)
    if (locale === 'zh-CN') {
      await clickOrFail(panel.locator(BANNER).getByText(label('autoModeBannerRevert'), { exact: false }), `${tag} 从提醒条回到请求批准`)
      await expect(panel.locator(COMPOSER)).toHaveAttribute('data-approval-mode', 'request')
      await expectAbsent(panel.locator(BANNER), { provenBy: bannerProof, message: `${tag} 回到请求批准之后提醒条收掉` })
    } else {
      // ×：只是不再显示提醒，档位不变；之后从弹层切回请求批准（收紧不问）。
      await clickOrFail(panel.locator(BANNER).getByRole('button', { name: label('autoModeBannerDismiss') }), `${tag} 叉掉提醒条`)
      await expectAbsent(panel.locator(BANNER), { provenBy: bannerProof, message: `${tag} 叉掉之后提醒条不再显示` })
      await expect(panel.locator(COMPOSER), `${tag} 叉掉提醒不改档位`).toHaveAttribute('data-approval-mode', 'direct')
      await clickOrFail(panel.locator(COMPOSER_PERMISSION), `${tag} 打开权限弹层切回`)
      await clickOrFail(panel.locator(permissionTier('request')), `${tag} 选请求批准`)
      await expect(panel.locator(COMPOSER), `${tag} 切回请求批准不问`).toHaveAttribute('data-approval-mode', 'request')
    }
  }

  await runSet({ locale: 'zh-CN', scheme: 'light', tag: 'zh-light' })
  await runSet({ locale: 'en', scheme: 'dark', tag: 'en-dark' })
  expect(walk.fixture.images, '这条走查不提交任何生成').toHaveLength(0)
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await walk.finish(failure)
}
