// 完成收据（GenerationReceiptPointers）要的几样事实（纯函数，可裸测；组件文件只导出组件，热更新不整页刷新）。
// 哪几镜、各指哪个节点，只问那一次出价（`offerShots`）与镜 ↔ 节点那一份对应（`productionNodeIdForShot`），不从收据正文猜。
import type { useProductionCanvasLandingStore } from '../../production/productionCanvasLandingStore'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import { getGenerationNodeExecutionKind } from '../../generationCanvas/model/generationNodeKinds'
import { generationPresentationOutcome, offerShots, presentationIsOpen } from '../../../../electron/shared/productionGenerationPresentation'
import { productionNodeIdForShot } from '../../../../electron/shared/productionShotPhase'
import type { V4FlowItem } from '../v4/agentPanelV4Types'

/** 落地 store 此刻持有的那几份 Run（渲染层不伸手进主进程的类型：形状跟着 store 走）。 */
export type LandingRuns = ReturnType<typeof useProductionCanvasLandingStore.getState>['runs']

/**
 * 那一次出价交出去的几镜指着的节点（按计划顺序）。「交出去的」只问宿主给回执的那一份结局（`generationPresentationOutcome`：
 * 在生成的——交到了 / 结果未知 / 还在交 / 制作流程批过且没在受理前失败——加上节点上自己拿走的），和 Agent 读到的回执同一个口径，
 * 本地不另列一份状态；没发出去、去掉了、没决定的不挂。出价还开着、找不到那个 Run、一镜都没交出去 → 空。
 * 只读落地投影缓存里的 Run（和节点上的「等你确认 / 排队中」同一份）。
 */
export function receiptShotNodeIds(runs: LandingRuns, operationId: string): readonly string[] {
  const run = Object.values(runs).find((candidate) => candidate.generationPlan?.operationId === operationId)
  if (!run?.generationPlan || presentationIsOpen(run.generationPlan)) return []
  const outcome = generationPresentationOutcome(run)
  const wentOut = new Set([...(outcome?.generating ?? []), ...(outcome?.takenByCanvas ?? [])])
  return offerShots(run).flatMap((shot) => {
    if (!wentOut.has(shot.shotId)) return []
    const nodeId = productionNodeIdForShot(run, shot.shotId)
    return nodeId ? [nodeId] : []
  })
}

export type ReceiptLine = Readonly<{ unit: 'video' | 'image'; phase: 'sent' | 'generated' }>

/**
 * 收据那一句说什么：有视频就说「段」，否则说「张」（和卡上同一条规则）；这几段节点都出了结果才说「已生成」，
 * 否则是「已发出」（节点被删了 / 还在生成 / 在画布上失败了都不算生成了）。
 */
export function receiptLine(nodes: ReadonlyArray<Pick<GenerationCanvasNode, 'kind' | 'status'> | undefined>): ReceiptLine {
  const unit = nodes.some((node) => node && getGenerationNodeExecutionKind(node.kind) === 'video') ? 'video' : 'image'
  const generated = nodes.length > 0 && nodes.every((node) => node?.status === 'success')
  return { unit, phase: generated ? 'generated' : 'sent' }
}

/** 一行流水（单条收据 / 工具组 / 过程行）里带着的那几次出价，收起的过程行也照样露在外面（和收据提示同一个摆法）。 */
export function flowItemGenerations(item: V4FlowItem): string[] {
  if (item.kind === 'tool') return item.receipt.generation ? [item.receipt.generation.operationId] : []
  if (item.kind === 'tool-group') return item.receipts.flatMap((receipt) => (receipt.generation ? [receipt.generation.operationId] : []))
  if (item.kind === 'process') return (item.details ?? []).flatMap((detail) => flowItemGenerations(detail.item))
  return []
}
