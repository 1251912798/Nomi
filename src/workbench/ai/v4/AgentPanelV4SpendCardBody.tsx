// 付费卡的卡体（D2 第③步，SpendCardQ1 板）：指向元素 + 一行只读摘要 + 说明行。卡上没有可改的东西——想改点指向元素去节点里改。
//
// 指向元素就是聊天里那个零件（NodePointer 板的生产组件）：单段是一张（画面左、摘要右，板 ①），多段是一组（下方那一行
// 平时是这几段合起来的摘要、悬停哪一格换成哪一镜的，板 ②）。节点此刻的样子（等你确认 / 发出中 / 生成中 / 失败 / 结果）都是
// 指向元素自己读节点画出来的，这里一样都不存。
//
// 多段卡每一格缩略图右上角挂一颗小 ×（板 card.pointer.exclude，用户 10-23 选 Q1-A；样子是输入框里参考图那一颗，共用 ThumbCornerX）：
// 悬停 / 聚焦那一格才露出来，点了这一镜退出这次出价（节点上显示「已去掉，不生成」），那一格淡下去、常驻一颗「恢复」。
// 摆在哪、什么时候露出来、淡不淡归组指向管（NodePointerCellAccessory）；缩略图正中被「恢复」占着时那一格不再画别的正中件，判据同样只有一份。
import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { ThumbCornerX } from '../../assets/ThumbCornerX'
import { NodePointer } from '../pointer/NodePointer'
import { NodePointerGroup, type NodePointerCellAccessory } from '../pointer/NodePointerGroup'
import type { NodePointerSubject } from '../pointer/nodePointerModel'
import { IconAlertTriangle } from './AgentPanelV4Icons'
import type { SpendCardNotice, SpendCardPointer } from './agentPanelSpendCard'

export type SpendCardBodyProps = Readonly<{
  pointers: readonly SpendCardPointer[]
  /** 卡上只有一段：单张指向元素（画面左、摘要右）。 */
  single: boolean
  /** 多段时组下方那一行（没有悬停时）：这几段合起来的只读摘要。 */
  summary?: string
  notices: readonly SpendCardNotice[]
  /** 卡上一下动作在路上：「不生成 ×」/「恢复」这一两秒里点了也不会生效，置灰让它看得见。 */
  busy: boolean
  /** 窄面板（≤320px）：标题行只留镜号。 */
  narrow?: boolean
  onExclude: (shotId: string) => void
  onRestore: (shotId: string) => void
}>

function subjectOf(pointer: SpendCardPointer): NodePointerSubject {
  return {
    nodeId: pointer.nodeId,
    fallbackLabel: { shot: pointer.shotRef },
    removed: pointer.removed,
    ...(pointer.hostFailure ? { hostFailure: pointer.hostFailure } : {}),
    ...(pointer.hostStatus ? { hostStatus: pointer.hostStatus } : {}),
  }
}

/**
 * 格子缩略图上的小钮本身（摆在哪、什么时候露出来归组指向管）。
 * 「不生成」是缩略图角上的小 ×，样子是输入框里参考图那一颗（共用的 ThumbCornerX，板 card.pointer.exclude），这里不另写；
 * 「恢复」是去掉了的那一格正中的小胶囊（样子板没管，沿用现行）。
 */
function ExclusionToggle({ pointer, busy, onExclude, onRestore }: {
  pointer: SpendCardPointer
  busy: boolean
  onExclude: (shotId: string) => void
  onRestore: (shotId: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  if (pointer.exclusion === 'restore') {
    const name = t('agentPanelV4.spendCard.restoreName', { shot: pointer.shotRef })
    return (
      <button
        type="button"
        aria-label={name}
        title={name}
        disabled={busy}
        onClick={() => onRestore(pointer.shotId)}
        data-spend-exclusion="restore"
        className="pointer-events-none inline-flex h-5 items-center rounded-full bg-nomi-paper/85 px-1.5 text-micro text-nomi-ink-80 shadow-nomi-sm hover:bg-nomi-paper hover:text-nomi-ink disabled:opacity-40 group-hover/pointer-cell:pointer-events-auto group-focus-within/pointer-cell:pointer-events-auto"
      >
        {t('agentPanelV4.spendCard.restore')}
      </button>
    )
  }
  const name = t('agentPanelV4.spendCard.excludeName', { shot: pointer.shotRef })
  return <ThumbCornerX aria-label={name} title={name} disabled={busy} onClick={() => onExclude(pointer.shotId)} data-spend-exclusion="exclude" />
}

/** 这一格挂什么：可去掉的挂「不生成 ×」（悬停 / 聚焦才露）；去掉了的淡下去、常驻「恢复」；别的（已在生成、已删除……）不挂。 */
function exclusionAccessory(pointer: SpendCardPointer | undefined, props: Pick<SpendCardBodyProps, 'busy' | 'onExclude' | 'onRestore'>): NodePointerCellAccessory | null {
  if (!pointer?.exclusion) return null
  const restore = pointer.exclusion === 'restore'
  return {
    action: <ExclusionToggle pointer={pointer} busy={props.busy} onExclude={props.onExclude} onRestore={props.onRestore} />,
    pinned: restore,
    dimmed: restore,
  }
}

/** 说明行：没成的原因（警示图标 + 原因 + 别的几段此刻怎样），或者一行中性的披露（素材托管）。 */
function SpendCardNoticeLine({ notice }: { notice: SpendCardNotice }): JSX.Element {
  if (notice.tone === 'neutral') {
    return <p className="m-0 text-micro text-nomi-ink-60" data-v4-block="spend-notice" data-tone="neutral">{notice.text}</p>
  }
  return (
    <div className="flex min-w-0 items-start gap-2 text-body-sm text-nomi-ink" data-v4-block="spend-notice" data-tone="danger">
      <IconAlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-nomi-danger-ink" />
      <span className="flex min-w-0 flex-col">
        <span>{notice.text}</span>
        {notice.detail ? <small className="text-caption text-nomi-ink-60" data-v4-block="spend-notice-detail">{notice.detail}</small> : null}
      </span>
    </div>
  )
}

export function AgentPanelV4SpendCardBody({ pointers, single, summary, notices, busy, narrow = false, onExclude, onRestore }: SpendCardBodyProps): JSX.Element {
  const subjects = React.useMemo(() => pointers.map(subjectOf), [pointers])
  return (
    <div className="flex min-w-0 flex-col gap-2" data-v4-block="spend-body">
      {single && subjects[0] ? (
        <NodePointer subject={subjects[0]} layout="side" narrow={narrow} suppressAwaitingConfirmation />
      ) : (
        <NodePointerGroup
          subjects={subjects}
          narrow={narrow}
          suppressAwaitingConfirmation
          {...(summary ? { idleSummary: summary } : {})}
          hoverSummary={(_subject, index) => pointers[index]?.hoverSummary ?? null}
          cellAccessory={(_subject, index) => exclusionAccessory(pointers[index], { busy, onExclude, onRestore })}
        />
      )}
      {notices.map((notice) => <SpendCardNoticeLine key={`${notice.tone}:${notice.text}`} notice={notice} />)}
    </div>
  )
}
