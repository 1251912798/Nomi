// 「回到对话」在画布那一格里摆多高（纯函数，NodePointerReturnDock 用；单独一个文件是为了组件文件只导出组件，热更新不整页刷新）。
import { resolveUsableBottomAboveDocks, type BottomDockRect } from '../../generation/workspaceBottomDocks'

/** 正下方没有停靠区时，离画布那一格底边的距离（同加节点条贴底的那一档 bottom-4）。 */
export const RETURN_DOCK_EDGE_GAP = 16
/** 和正下方那块停靠区之间留的缝。 */
export const RETURN_DOCK_CLEARANCE = 12

/**
 * 「回到对话」离画布那一格底边多远：横向压得上它的停靠区里最高的那块上沿，再让出一道缝；
 * 一块都压不上就贴底边、留 RETURN_DOCK_EDGE_GAP。坐标系 = 画布那一格自己（左上角是原点）。
 */
export function returnDockBottom(input: Readonly<{
  host: Readonly<{ width: number; height: number }>
  buttonWidth: number
  docks: readonly BottomDockRect[]
}>): number {
  const { host, buttonWidth, docks } = input
  const span = { left: (host.width - buttonWidth) / 2, right: (host.width + buttonWidth) / 2 }
  const usable = resolveUsableBottomAboveDocks({
    viewport: { top: 0, bottom: host.height - RETURN_DOCK_EDGE_GAP },
    span,
    docks,
    clearance: RETURN_DOCK_CLEARANCE,
  })
  return Math.round(host.height - usable)
}
