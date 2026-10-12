type TimelineReconciler = {
  getState(): {
    reconcileTimelineForDeletedNodes(nodeIds: readonly string[]): void
    reconcileTimelineForRestoredNodes(nodeIds: readonly string[]): void
  }
}

// 时间轴所在的工作台 store 建好后把自己登记进来（见 workbenchStore.ts 末尾）。桥不 import 工作台 store：
// 那会形成 canvasTimelineBridge → workbenchStore → generationCanvasStore → … → canvasTimelineBridge 静态循环。
let reconciler: TimelineReconciler | null = null

export function registerTimelineReconciler(next: TimelineReconciler): void {
  reconciler = next
}

// 画布节点集合变了 → 时间轴对账(数据一致性)。clip 创建时把节点产物 url 快照冻结、无 node→clip 同步:
// 节点被删,时间轴要摘掉引用它的 clip;节点被放回(撤销 / 重做 / 补偿),要把当初摘下的 clip 放回原位。
// 所有「节点集合变了」的入口都过这里,不各写各的——否则删得掉、撤销找不回(分镜删除后撤销丢片段)。
// 跨 store 最小耦合:只在 action 运行时取 getState()(不在模块初始化期触碰,避免
// workbenchStore→genStore→canvasNodeActions→workbenchStore 循环初始化)。无命中是 no-op,绝不影响画布本身。

export function reconcileTimelineForDeletedNodes(nodeIds: readonly string[]): void {
  if (nodeIds.length) reconciler?.getState().reconcileTimelineForDeletedNodes(nodeIds)
}

export function reconcileTimelineForRestoredNodes(nodeIds: readonly string[]): void {
  if (nodeIds.length) reconciler?.getState().reconcileTimelineForRestoredNodes(nodeIds)
}

/** 整张图被换掉(撤销 / 重做 / 外部写)时按前后节点差分:消失的摘 clip,出现的放回。 */
export function reconcileTimelineForNodeSetChange(before: readonly { id: string }[], after: readonly { id: string }[]): void {
  const beforeIds = new Set(before.map((node) => node.id))
  const afterIds = new Set(after.map((node) => node.id))
  reconcileTimelineForDeletedNodes([...beforeIds].filter((id) => !afterIds.has(id)))
  reconcileTimelineForRestoredNodes([...afterIds].filter((id) => !beforeIds.has(id)))
}
