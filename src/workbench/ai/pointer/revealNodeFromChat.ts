// 点聊天里的指向元素 = 去画布上那个节点（2026-10-23 D2 P1，A3 / A4）。
//
// 不另写对焦：切到生成页、切到画布视图、等节点到了再派 FOCUS_GENERATION_NODE_EVENT，全是现役那一条
// （`viewNodeInCanvas`，列表视图的「去画布」也走它）；对焦本身是 #1277 的唯一算式（缩放封顶 100%，节点 + 生成框都在可见区），
// 闪一下也是那条路自己管的。这里只多做聊天这一侧的两件事：
//   ① 记下「已定位」；
//   ② 窄窗口里对话浮在画布上、把目标盖住时，先把对话收成小球露出目标，并记下「回到对话」要回到哪个形态。
import { useWorkbenchStore } from '../../workbenchStore'
import { viewNodeInCanvas } from '../../generation/list/generationListSource'
import { AGENT_FLOAT_SELECTOR } from '../../generation/workspaceBottomDocks'
import { resolveFreeViewRect } from '../../generationCanvas/reactFlow/focusViewportRecovery'
import { useAgentFormStore } from '../../../ui/app-shell/shell/agentFormStore'
import { useNodePointerStore } from './nodePointerStore'

type Rect = Readonly<{ left: number; top: number; width: number; height: number }>

/** 画布上至少要剩这么大一块空地，才算「对话没挡住目标」（一张默认节点 + 它下面的生成框的最小样子）。 */
export const POINTER_REVEAL_MIN_FREE = { width: 280, height: 220 } as const

/**
 * 浮着的对话窗是不是把画布挡得没地方摆目标了（纯函数）。
 * 判据和对焦同一个：扣掉浮层后最大的那块空地（`resolveFreeViewRect`）。那个函数遇到「整块都被盖住」会当障碍不存在，
 * 所以这里先单独认一次「盖住了大半」。宽窗口里浮窗只占一角，对焦本来就会把节点摆进空地，不用收。
 */
export function agentCoversCanvas(stage: Rect, agent: Rect | null): boolean {
  if (!agent || stage.width <= 0 || stage.height <= 0) return false
  const left = Math.max(stage.left, agent.left)
  const top = Math.max(stage.top, agent.top)
  const right = Math.min(stage.left + stage.width, agent.left + agent.width)
  const bottom = Math.min(stage.top + stage.height, agent.top + agent.height)
  const overlap = Math.max(0, right - left) * Math.max(0, bottom - top)
  if (overlap / (stage.width * stage.height) >= 0.5) return true
  const free = resolveFreeViewRect(
    { width: stage.width, height: stage.height },
    [{ left: agent.left - stage.left, top: agent.top - stage.top, right: agent.left + agent.width - stage.left, bottom: agent.top + agent.height - stage.top }],
  )
  return free.width < POINTER_REVEAL_MIN_FREE.width || free.height < POINTER_REVEAL_MIN_FREE.height
}

const nextFrame = (): Promise<void> => new Promise((resolve) => window.requestAnimationFrame(() => resolve()))

/** 去画布上的这个节点。`label` 是这个指向元素的镜号 / 名字，窄窗口「回到对话」上带着它。 */
export async function revealNodeFromChat(input: Readonly<{ nodeId: string; label: string }>): Promise<void> {
  const workbench = useWorkbenchStore.getState()
  if (workbench.workspaceMode !== 'generation') workbench.setWorkspaceMode('generation')
  useNodePointerStore.getState().setLocated(input.nodeId)
  viewNodeInCanvas(input.nodeId)
  // 换页之后画布与浮窗要排一帧才量得到。
  await nextFrame()
  const surface = 'generation' as const
  const forms = useAgentFormStore.getState()
  const form = forms.bySurface[surface].form
  if (form === 'ball') return
  const stage = document.querySelector('.generation-canvas-v2__stage')?.getBoundingClientRect()
  if (!stage) return
  // 浮窗：看它把画布盖掉多少；停靠：它不压画布，但窗口太窄时画布本身就摆不下目标，同样先让开。
  const covered = form === 'float'
    ? agentCoversCanvas(stage, document.querySelector(AGENT_FLOAT_SELECTOR)?.getBoundingClientRect() ?? null)
    : stage.width < POINTER_REVEAL_MIN_FREE.width || stage.height < POINTER_REVEAL_MIN_FREE.height
  if (!covered) return
  useNodePointerStore.getState().setReturnTo({ surface, form, nodeId: input.nodeId, label: input.label })
  forms.setForm(surface, 'ball')
}

/** 「回到对话」：对话原样回来（收起前什么形态就回什么形态），那一项照旧标着「已定位」。 */
export function returnToChat(): void {
  const target = useNodePointerStore.getState().returnTo
  if (!target) return
  useNodePointerStore.getState().setReturnTo(null)
  useAgentFormStore.getState().setForm(target.surface, target.form)
}
