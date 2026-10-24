import React, { type JSX } from 'react'
import { cn } from '../../utils/cn'

/**
 * 两种详情外壳（技能详情弹窗、提示词详情浮层）共用的头部 / 底栏规则（设计卡 ★3「删掉的第二份」）：
 *   · 标题下一行灰字 meta，用「·」隔开；
 *   · 底栏：破坏性动作（删除）在最左，次要动作是 32px 圆形图标钮，唯一的实心主按钮在最右（§1.8 一屏一个实心）；
 *   · 主按钮点不了时禁用并把原因写在悬停里（C1：能点就有效，不能点就说为什么）。
 */
export function LibraryDetailMeta({ children, className, ...rest }: { children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  const parts = React.Children.toArray(children).filter(Boolean)
  return (
    <div {...rest} className={cn('flex min-w-0 flex-wrap items-center gap-1.5 text-caption text-nomi-ink-60', className)}>
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          {part}
        </React.Fragment>
      ))}
    </div>
  )
}

export function LibraryDetailFooter({ leading, children, className }: { leading?: React.ReactNode; children: React.ReactNode; className?: string }): JSX.Element {
  return (
    <footer className={cn('flex shrink-0 items-center gap-2 border-t border-nomi-line', className ?? 'px-6 py-3.5')}>
      {leading}
      <span className="flex-1" />
      {children}
    </footer>
  )
}

export function LibraryDetailIconButton({ icon, label, danger = false, className, ...rest }: {
  icon: React.ReactNode
  label: string
  danger?: boolean
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cn(
        'grid size-8 shrink-0 cursor-pointer place-items-center rounded-pill transition-colors duration-nomi-fast ease-nomi-fast',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nomi-ink disabled:cursor-not-allowed disabled:opacity-40',
        danger
          ? 'border-0 bg-transparent text-workbench-danger hover:bg-workbench-danger-soft'
          : 'border border-nomi-line bg-nomi-paper text-nomi-ink-80 hover:bg-nomi-ink-05',
        className,
      )}
    >
      {icon}
    </button>
  )
}

export function LibraryDetailPrimary({ disabledReason, children, className, ...rest }: {
  disabledReason?: string
  children: React.ReactNode
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'title'>): JSX.Element {
  return (
    <button
      type="button"
      {...rest}
      disabled={Boolean(disabledReason)}
      title={disabledReason}
      aria-disabled={disabledReason ? true : undefined}
      className={cn(
        'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-pill border-0 bg-nomi-ink px-4 text-body-sm font-semibold text-nomi-paper',
        'transition-colors duration-nomi-fast ease-nomi-fast hover:bg-nomi-ink-80',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nomi-ink',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-nomi-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}
