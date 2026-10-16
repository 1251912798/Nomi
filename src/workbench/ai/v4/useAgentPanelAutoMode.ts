// 「直接生成」档的两件配套（2026-10-12 用户拍板，承接 2026-09-10 的「全自动」增量 2）：**切进去要二次确认**、**开着时有常驻提醒**。
//
// 为什么切档要多问一句：「请求批准」下花钱的生成每次都会在介入槽里现身，用户不可能忘了自己开着什么；
// 「直接生成」的特征恰恰是「生成直接开跑、不再逐次问」——它一旦被误点，界面上不会有任何东西提醒他。
// 确认文案里最重要的一半是**生成会自动开跑并花钱**（档位本身就是那次授权，判据 owner 是
// `directGenerationBrakes.spendDecisionByPolicy`），因为用户最合理的恐惧就是「它会不会偷偷把钱花了」，
// 诚实的答案是「会，按你这一次的授权」——所以它必须摆在按下去之前，不许含糊。不可逆的操作仍然每次问，
// 同一个镜头连续失败、要生成计划外的镜头时也会停下来问。
//
// 要不要问由 `agentPanelV4Logic.tierSwitchNeedsConfirm` 一处回答（只有切进「直接生成」才问）。
//
// 为什么确认卡不是新组件：换档本身是**可撤销**的（再点一下就回来了），所以它就是介入槽的
// `approval-reversible` 档。唯一的差别是标题左边那颗 ✓ 不画（`hideIcon`）——这张卡的标题是一句
// 问句，问句前面顶着一个对勾读起来像「已经切好了」，记号和它要说的事正好相反（用户 2026-09-10 拍板）。
import React from 'react'
import { useTranslation } from 'react-i18next'
import type { InterventionData, PermissionTier } from './agentPanelV4Types'
import { tierSwitchNeedsConfirm } from './agentPanelV4Logic'

export type AgentPanelAutoMode = Readonly<{
  /** 待确认的切档卡。`undefined` = 此刻没有在问。 */
  slot: InterventionData | undefined
  /** 提醒条要不要渲染（`direct` 档 + 本会话没被叉掉）。 */
  bannerVisible: boolean
  /** 拦在 `setPermission` 前面：切到「直接生成」先问一句，其余直接放行。 */
  request: (tier: PermissionTier) => void
  confirm: () => void
  cancel: () => void
  dismissBanner: () => void
}>

export function useAgentPanelAutoMode(
  permission: PermissionTier,
  setPermission: (tier: PermissionTier) => void,
): AgentPanelAutoMode {
  const { t } = useTranslation()
  const [asking, setAsking] = React.useState(false)
  // 叉掉只影响**这一会话的这一条横幅**，档位一动不动。所以它是组件状态，不落盘：
  // 「我这次不想看见它」和「我以后都不想看见它」是两句不同的话，用户说的是前一句。
  const [dismissed, setDismissed] = React.useState(false)

  const request = React.useCallback((tier: PermissionTier) => {
    if (tierSwitchNeedsConfirm(permission, tier)) {
      setAsking(true)
      return
    }
    setAsking(false)
    setPermission(tier)
  }, [permission, setPermission])

  const slot: InterventionData | undefined = asking
    ? Object.freeze({
        kind: 'approval-reversible' as const,
        hideIcon: true as const,
        title: t('agentPanelV4.autoModeConfirmTitle'),
        summary: t('agentPanelV4.autoModeConfirmBody'),
        confirmLabel: t('agentPanelV4.autoModeConfirmOk'),
      })
    : undefined

  return {
    slot,
    bannerVisible: permission === 'direct' && !dismissed,
    request,
    confirm: () => {
      setAsking(false)
      setDismissed(false)
      setPermission('direct')
    },
    cancel: () => setAsking(false),
    dismissBanner: () => setDismissed(true),
  }
}
