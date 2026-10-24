import type React from 'react'
import { getDesktopBridge } from '../../desktop/bridge'

let requested = false

/**
 * 有意图时预热文本模型调用核心（文本任务迁 pi-ai，设计卡 docs/plan/2026-10-21-text-tasks-to-pi-ai.md ★7，协调 10-21 定）。
 *
 * 核心住在主进程，第一次用时才装；装一条协议的 SDK 会把 Electron 主进程同步占住约 190–280ms。实测（c6-prewarm-trigger.txt）：
 *   · 启动后固定 4 秒装：正好撞上「启动后几秒打开项目」，冷打开 100 节点项目中位 946 → 1341ms；
 *   · 带文本动作的界面一挂上就在空闲回调里装：这些界面是随项目一起挂的，照样撞在打开过程里（中位 1257ms）。
 * 所以等用户真朝文本动作伸手——指针移进、或焦点进了提示词框里的优化 / 翻译、文本节点的输入框、Agent 输入框——
 * 再在空闲时装。从移进到点下去通常有几百毫秒，装载藏在这段里。整个会话只叫一次；桥不在（浏览器预览、单测）就什么都不做。
 */
export function requestTextModelPrewarm(): void {
  if (requested) return
  const prewarm = getDesktopBridge()?.tasks?.prewarmTextModel
  if (!prewarm) return
  requested = true
  const run = () => { void prewarm().catch(() => undefined) }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1_000 })
  else setTimeout(run, 0)
}

/** 铺在文本动作的根元素上：指针移进或焦点进来 = 用户要用文本动作了。 */
export const TEXT_ACTION_INTENT_PROPS: Pick<React.HTMLAttributes<HTMLElement>, 'onPointerEnter' | 'onFocus'> = {
  onPointerEnter: () => requestTextModelPrewarm(),
  onFocus: () => requestTextModelPrewarm(),
}
