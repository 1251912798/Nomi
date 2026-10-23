import React, { type JSX } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../design'
import { cn } from '../../utils/cn'
import type { RichTextAction } from './richTextActions'

/**
 * 格式按钮：三个壳（创作区顶栏 / 选区浮条 / 画布文本节点格式条）共用这一颗，壳只给尺寸。
 *   · 名字：设计系统 Tooltip（悬停即出，与画布导航、任务中心同一套），不靠原生 title 那一秒多的延迟；
 *     禁用的钮不接指针事件，提示挂在外层 span 上；
 *   · 按下态：aria-pressed + 设计系统 §5.5「Pressed」底色；
 *   · mousedown 不抢焦点：点格式不丢编辑器里的选区。
 * 外面要包一层 TooltipProvider（壳各自给）。
 */
export function RichTextActionButton({ action, className, side = 'bottom' }: { action: RichTextAction; className?: string; side?: 'top' | 'bottom' }): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <button
            type="button"
            aria-label={action.label}
            aria-pressed={action.active === undefined ? undefined : action.active}
            data-rich-text-action={action.id}
            data-active={action.active ? 'true' : 'false'}
            disabled={action.disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={action.onClick}
            className={cn(
              'inline-grid place-items-center rounded-nomi-sm border-0',
              'bg-transparent text-nomi-ink-60 cursor-pointer',
              'transition-colors duration-nomi-fast ease-nomi-fast',
              'hover:bg-nomi-ink-05 hover:text-nomi-ink',
              'data-[active=true]:bg-workbench-pressed data-[active=true]:text-nomi-ink',
              'disabled:cursor-not-allowed disabled:text-nomi-ink-30 disabled:hover:bg-transparent',
              className,
            )}
          >
            {action.icon}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side={side}>{action.label}</TooltipContent>
    </Tooltip>
  )
}
