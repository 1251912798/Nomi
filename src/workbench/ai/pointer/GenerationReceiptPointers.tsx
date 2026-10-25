// 对话流里 `generate` 那一行收据下面的那一句 + 组指向（SpendCardQ1 板 card.done，D2 Q4 按推荐：卡离开输入框上方那一格，
// 对话流里留一条带组指向的收据「✓ 已生成 N 段」）。
//
// 收据那一行的字不变（回合读到的逐镜结局照旧说，设计卡 3.13），而且它在收起的过程行里；露在外面的是这里：一句「✓ 已发出 N 段」
// （那几段节点都出了结果就是「✓ 已生成 N 段」——卡关的那一刻它们才刚交出去，先说「已生成」就是替还没发生的事下结论），
// 下面是那几镜的指向元素——实时读节点（生成中 / 结果 / 失败都是节点自己的样子），点了照样定位。
// 卡还开着时不挂：那几镜在卡上，同一件事不摆两处。
// 哪几镜、各指哪个节点、那一句说什么，算法在 generationReceiptFacts.ts（纯函数）。
import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useProductionCanvasLandingStore } from '../../production/productionCanvasLandingStore'
import { useGenerationCanvasStore } from '../../generationCanvas/store/generationCanvasStore'
import { selectCanvasNodeById } from '../../generationCanvas/store/canvasNodeGenerationIndex'
import type { GenerationCanvasState } from '../../generationCanvas/store/canvasStoreTypes'
import { IconCheck } from '../v4/AgentPanelV4Icons'
import { NodePointerGroup } from './NodePointerGroup'
import type { NodePointerSubject } from './nodePointerModel'
import { receiptLine, receiptShotNodeIds, type ReceiptLine } from './generationReceiptFacts'

const RECEIPT_COPY = {
  video: { sent: 'agentPanelV4.spendCard.receiptSentVideo', generated: 'agentPanelV4.spendCard.receiptGeneratedVideo' },
  image: { sent: 'agentPanelV4.spendCard.receiptSentImage', generated: 'agentPanelV4.spendCard.receiptGeneratedImage' },
} as const

/** 那几镜节点此刻的「段 / 张」与「都出结果了没有」，压成一个字给订阅比对：节点每推一帧进度，结论不变就不重渲。 */
function receiptLineKey(state: Pick<GenerationCanvasState, 'nodes' | 'edges'>, nodeIds: readonly string[]): string {
  const line = receiptLine(nodeIds.map((id) => selectCanvasNodeById(state, id)))
  return `${line.unit}:${line.phase}`
}

export function GenerationReceiptPointers({ operationId }: { operationId: string }): JSX.Element | null {
  const { t } = useTranslation()
  // 订一个字符串：落地投影每推一次新 Run 都会换对象，这几镜指着的节点没变就不重渲。
  const key = useProductionCanvasLandingStore((store) => receiptShotNodeIds(store.runs, operationId).join('\n'))
  const nodeIds = React.useMemo(() => (key ? key.split('\n') : []), [key])
  const lineKey = useGenerationCanvasStore((state) => receiptLineKey(state, nodeIds))
  const subjects = React.useMemo<NodePointerSubject[]>(() => nodeIds.map((nodeId) => ({ nodeId })), [nodeIds])
  if (subjects.length === 0) return null
  const [unit, phase] = lineKey.split(':') as [ReceiptLine['unit'], ReceiptLine['phase']]
  // 板 ④：卡从输入框上方那一格退到对话流里，样子是一张安静的卡（和卡壳同一条发丝线、同一块纸面，不再「在等你」）。
  // 板上右上角那一格「3 段 · 合计 ¥…」不摆：金额照 10-08 不印，剩下的「3 段」和这一句重复。
  return (
    <div className="px-2" data-v4-block="generation-receipt-pointers" data-operation-id={operationId}>
      <div className="flex flex-col gap-1.5 rounded-nomi border border-nomi-line bg-nomi-paper px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-body-sm font-semibold text-nomi-ink" data-v4-block="generation-receipt-line" data-receipt-phase={phase}>
          <IconCheck size={14} aria-hidden="true" className="shrink-0 text-nomi-success" />
          {t(RECEIPT_COPY[unit][phase], { count: subjects.length })}
        </span>
        <NodePointerGroup subjects={subjects} />
      </div>
    </div>
  )
}
