/**
 * [INPUT]: 依赖 ../../../../../i18n、../../../../../ui/notificationPolicy 的 notify、../../nodeSizing 的 FOCUS_GENERATION_NODE_EVENT
 * [OUTPUT]: 对外提供 HostNotice、notifyHostOutcome：导演台常驻 Host 的唯一提示出口
 * [POS]: director/agent 的 Host 提示出口：站位出图（StagingCaptureHost）、运镜小片 / 3D-BOX 预演出片（CameraMoveCaptureHost）都只经它说话。
 *        Host 在画布背后跑，出的图、挂接的目标镜头常在视口外：提示一律是 notify 后台档 +「定位节点」（点了画布对准并选中那个节点；
 *        设计系统 §4.5「toast 用于视线之外且需要知道的变化，提供一个真实动作」），和手拖连线接不上（completeNodeConnection）同一写法。
 *        以前运镜 Host 用旧的 toast()，只说一句、没有去处（2026-10-24 走查 ⑤ 的同类）。Host 自己 toast / notify = attachDoors.guard.test.ts 红。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import i18n from '../../../../../i18n'
import { notify } from '../../../../../ui/notificationPolicy'
import { FOCUS_GENERATION_NODE_EVENT } from '../../nodeSizing'

export type HostNotice = Readonly<{
  /** 提示说的是哪个节点：点「定位节点」画布对准并选中它 */
  nodeId: string
  /** 稳定对象身份：同身份的提示只留最新一条（DC23） */
  identity: string
  /** 原因码：同原因累计次数，换了原因从 1 起算 */
  reason: string
  message: string
}>

export function notifyHostOutcome({ nodeId, identity, reason, message }: HostNotice): void {
  notify({
    identity,
    reason,
    message,
    type: 'warning',
    level: 'background',
    actionLabel: i18n.t('generationCommon.node.locateNode'),
    onAction: () => window.dispatchEvent(new CustomEvent(FOCUS_GENERATION_NODE_EVENT, { detail: { nodeId } })),
  })
}
