import React, { type JSX } from 'react'
import { cn } from '../../../../utils/cn'
import { ICON_TIER_CLASSES } from '../../../../design'
import { useNodeEmptyStateContext } from './NodeEmptyStateContext'
import { EMPTY_STATE_BLOCK_HEIGHT, EMPTY_STATE_TOP_CLEARANCE, EMPTY_STATE_CENTER_RATIO, emptyStateBlockTop, emptyStateIconTop, emptyStateTier } from './nodeEmptyStateLayout'

export type NodeEmptyStateProps = {
  icon: React.ReactNode
  /** 仅当前单选节点展示的原有引导；浏览态统一只保留类型图标。 */
  title?: string
  description?: string
  action?: React.ReactNode
  className?: string
  /** 装在比卡小的容器里（导演节点内嵌、剪辑轨道）：圆盘按容器正中；图标照旧是空态档。 */
  compact?: boolean
  /** 节点窄条（音频条、LOD 矮卡）：排法同 compact，图标按 §6 角标档 13 / 1.8（拍板 IconsF1 D3）。 */
  strip?: boolean
  /** 节点卡高（CSS 像素）。给了才按档位收矮；不给 = 完整档 + CSS 兜底定位。 */
  height?: number
  /** Operational facts (waiting/ready) remain visible while browsing. */
  purpose?: 'guidance' | 'status'
}

/**
 * 浏览态用 48px 底盘 / 24px 类型图标；当前单选或业务状态沿用原引导排法。
 * 内容块中心放在卡高 45%、离顶至少 44px、水平居中，
 * 左上角状态小标永远碰不到图标。矮卡分档（纯函数 `emptyStateTier`，见 nodeEmptyStateLayout.ts）：
 * 完整 → 图标 / 类型名 / 状态 / 动作；紧凑 → 图标 + 「类型 · 状态」一行 + 动作。height 必须是渲染用的有效卡高（resolveNodeVisualSize），见 nodeEmptyStateLayout.ts。
 * compact（导演节点内嵌 / 剪辑轨道）和 strip（音频条 / LOD 矮卡）都是装在更小容器里的变体，容器不等于卡高，圆盘按容器正中，不走 45% / 44px 规则（10-10 拍板 B 的例外）；其余一律走 nodeEmptyStateLayout 同一套算法。
 * 图标档位由空态圆盘自己定（§6）：节点窄条角标档 13 / 1.8，其余大 / 中空态空态档 24 / 1.5。
 */
export function NodeEmptyState({ icon, title, description, action: requestedAction, className, compact = false, strip = false, height, purpose = 'guidance' }: NodeEmptyStateProps): JSX.Element {
  const { engaged, readOnly } = useNodeEmptyStateContext()
  const action = readOnly ? undefined : requestedAction
  const inContainer = compact || strip
  const discIconTier = strip ? ICON_TIER_CLASSES.corner : ICON_TIER_CLASSES.empty
  if (purpose === 'guidance' && !engaged) {
    return (
      <div data-node-empty-state="true" data-empty-tier="icon" className={cn('relative h-full w-full text-center', className)}>
        <div className="absolute inset-x-0 flex justify-center" style={{ top: inContainer ? 'calc(50% - 24px)' : emptyStateIconTop(height) }}>
          <span className={cn('grid size-12 shrink-0 place-items-center rounded-full bg-nomi-ink-05 text-nomi-ink-80 ring-1 ring-inset ring-nomi-line', discIconTier)} aria-hidden="true">{icon}</span>
        </div>
      </div>
    )
  }
  if (inContainer) {
    return (
      <div data-node-empty-state="true" className={cn('flex h-full w-full px-3 text-center items-center justify-center gap-2 py-2', className)}>
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-full bg-nomi-ink-05 text-nomi-ink-80 ring-1 ring-inset ring-nomi-line', discIconTier)} aria-hidden="true">
          {icon}
        </span>
        {title || description ? (
          <span className="flex min-w-0 flex-col flex-1 text-left">
            {title ? <span className="text-body-sm font-semibold leading-[18px] text-nomi-ink-80">{title}</span> : null}
            {description ? <span className="mt-px max-w-[22rem] text-caption leading-4 text-nomi-ink-40">{description}</span> : null}
          </span>
        ) : null}
        {action ? <div className="mt-3 flex max-w-full justify-center">{action}</div> : null}
      </div>
    )
  }
  const tier = emptyStateTier(height)
  // 卡高未知：块顶用 CSS 兜底（中心 45%、离顶 44px），完整档的块高 114 的一半就是 57。
  const topStyle: React.CSSProperties =
    height === undefined || !Number.isFinite(height)
      ? { top: `max(${EMPTY_STATE_TOP_CLEARANCE}px, calc(${EMPTY_STATE_CENTER_RATIO * 100}% - ${EMPTY_STATE_BLOCK_HEIGHT.full / 2}px))` }
      : { top: emptyStateBlockTop(tier, height) }
  const label = [title, description].filter(Boolean).join(' · ')
  const iconBadge = (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-nomi-ink-05 text-nomi-ink-80 ring-1 ring-inset ring-nomi-line',
        tier === 'full' ? cn('size-9', ICON_TIER_CLASSES.empty) : cn('size-6', ICON_TIER_CLASSES.corner),
      )}
      aria-hidden="true"
    >
      {icon}
    </span>
  )
  return (
    <div data-node-empty-state="true" data-empty-tier={tier} className={cn('relative h-full w-full px-3 text-center', className)}>
      <div className="absolute inset-x-0 flex flex-col items-center" style={topStyle}>
        {tier === 'full' ? (
          <>
            {iconBadge}
            {title || description ? (
              <span className="mt-2 flex min-w-0 flex-col items-center">
                {title ? <span className="text-body-sm font-semibold leading-[18px] text-nomi-ink-80">{title}</span> : null}
                {description ? <span className="mt-px max-w-[22rem] text-caption leading-4 text-nomi-ink-40">{description}</span> : null}
              </span>
            ) : null}
            {action ? <div className="mt-3 flex max-w-full justify-center">{action}</div> : null}
          </>
        ) : (
          <>
            <div className="flex h-6 max-w-full items-center gap-1.5 text-caption text-nomi-ink-80">
              {iconBadge}
              {label ? <span className="min-w-0 truncate whitespace-nowrap">{label}</span> : null}
            </div>
            {action ? <div className="mt-2 flex max-w-full justify-center">{action}</div> : null}
          </>
        )}
      </div>
    </div>
  )
}

export function NodeEmptyAction({ children, onClick }: { children: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-nomi-sm bg-nomi-ink px-3 py-1.5 text-caption font-medium text-nomi-paper transition-colors hover:bg-nomi-accent"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      onPointerDown={(event) => event.stopPropagation()}
      aria-label={children}
    >
      {children}
    </button>
  )
}
