// 付费卡的卡体（D2 第③步，SpendCardQ1 板）：指向元素 + 一行只读摘要 + 说明行。卡上没有可改的东西——想改点指向元素去节点里改。
//
// 指向元素就是聊天里那个零件（NodePointer 板的生产组件）：单段是一张（画面左、摘要右，板 ①），多段是一组（下方那一行
// 平时是这几段合起来的摘要、悬停哪一格换成哪一镜的，板 ②）。节点此刻的样子（等你确认 / 发出中 / 生成中 / 失败 / 结果）都是
// 指向元素自己读节点画出来的，这里一样都不存。
//
// 多段卡每一格右上挂一颗「不生成 ×」（板 card.pointer.exclude，用户 10-23 选 Q1-A）：悬停 / 聚焦那一格才露出来，点了这一镜
// 退出这次出价（节点上显示「已去掉，不生成」），那一格淡下去、常驻一颗「恢复」。
import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../utils/cn'
import { NodePointer, NodePointerGroup, type NodePointerSubject } from '../pointer/NodePointer'
import { IconAlertTriangle, IconX } from './AgentPanelV4Icons'
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
  }
}

/**
 * 格子右上那颗小钮。它是指向元素的兄弟、不是指向元素里的按钮（按钮里不能套按钮）；位置压在画面框右上角
 * （标题行 22px + 间距 4px 之下）。「不生成 ×」平时藏着、悬停 / 聚焦这一格时露出来；「恢复」常驻。
 */
function ExclusionToggle({ pointer, busy, onExclude, onRestore }: {
  pointer: SpendCardPointer
  busy: boolean
  onExclude: (shotId: string) => void
  onRestore: (shotId: string) => void
}): JSX.Element | null {
  const { t } = useTranslation()
  if (!pointer.exclusion) return null
  const restore = pointer.exclusion === 'restore'
  const name = restore ? t('agentPanelV4.spendCard.restoreName', { shot: pointer.shotRef }) : t('agentPanelV4.spendCard.excludeName', { shot: pointer.shotRef })
  return (
    <>
      {/* 去掉了的那一格淡下去（盖在画面框上，不挡点击：指向元素照样点了去节点）。 */}
      {restore ? <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 top-[26px] rounded-nomi-sm bg-nomi-paper/60" data-spend-excluded="true" /> : null}
      <button
        type="button"
        aria-label={name}
        title={name}
        disabled={busy}
        onClick={() => (restore ? onRestore(pointer.shotId) : onExclude(pointer.shotId))}
        data-spend-exclusion={pointer.exclusion}
        className={cn(
          'absolute right-1 top-[30px] z-[5] inline-flex h-5 items-center gap-0.5 rounded-full bg-nomi-paper/85 px-1.5 text-micro text-nomi-ink-80 shadow-nomi-sm transition-opacity hover:bg-nomi-paper hover:text-nomi-ink disabled:opacity-40',
          // 藏着的时候也不接点击（看不见的钮不许挡住缩略图）：悬停 / 聚焦这一格时才露出来、才点得到；键盘 Tab 照样走得到它。
          !restore && 'pointer-events-none opacity-0 focus-visible:opacity-100 group-focus-within/pointer-cell:pointer-events-auto group-focus-within/pointer-cell:opacity-100 group-hover/pointer-cell:pointer-events-auto group-hover/pointer-cell:opacity-100',
        )}
      >
        {restore ? t('agentPanelV4.spendCard.restore') : t('agentPanelV4.spendCard.exclude')}
        {restore ? null : <IconX size={11} stroke={1.8} aria-hidden="true" />}
      </button>
    </>
  )
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
        <NodePointer subject={subjects[0]} layout="side" narrow={narrow} />
      ) : (
        <NodePointerGroup
          subjects={subjects}
          narrow={narrow}
          {...(summary ? { idleSummary: summary } : {})}
          cellAccessory={(_subject, index) => {
            const pointer = pointers[index]
            return pointer ? <ExclusionToggle pointer={pointer} busy={busy} onExclude={onExclude} onRestore={onRestore} /> : null
          }}
        />
      )}
      {notices.map((notice) => <SpendCardNoticeLine key={`${notice.tone}:${notice.text}`} notice={notice} />)}
    </div>
  )
}
