import React, { type JSX } from 'react'
import { cn } from '../../../../utils/cn'
import { useStoryboardRowDensity } from './storyboardRowDensity'

/**
 * 行解剖的**唯一实现**（镜头行与参考卡共用）：`[行首 14 | 视觉列 | 内容列 1fr]`，从左往右读——
 * **长什么样 → 说什么 → 怎么生成**（2026-10-06 第二轮，版面由协调会话定）。
 *
 *   · 行首：勾选 / 拖动 / ⋯（参考卡是类型图标 / ⋯）；
 *   · 视觉列：预览框（全表同一只，整片默认画幅的框）+ 结果动作 + 参考缩略图条，列宽 = 预览框宽；
 *   · 内容列：提示词 + 底栏，**撑满整行高度**，于是底栏（和最右的「生成」）永远在内容列右下角、每行同一位置。
 * 行高取两列较高的那一列；内边距统一 12；行间 1px 分隔线由外层负责。
 *
 * 宽 / 窄档（`storyboardRowDensity`）由**行容器**量一次、经 context 递下来，这一层只读它：视觉列宽跟着档位缩，
 * 画面格和参考条读同一个 context——列宽与框同一帧一起换，分两处判就会出现「列缩了框没缩」。
 * 行自己不量宽度（2026-10-16：320 行各量一次是打开大方案卡死的主因之一）。
 */

type Props = {
  /** 行首 14px 竖条。 */
  grip?: React.ReactNode
  /** 视觉列（预览框 + 结果动作 + 参考条）。 */
  visual: React.ReactNode
  /** 视觉列宽（宽档值，`visualColumnWidth`；窄档由这里按 176/240 缩）。 */
  visualWidth: number
  /**
   * 内容列撑满行高（默认）：底栏与「生成」逐行同一位置。整片竖版时传 false——提示词与底栏贴在一起、
   * 空白留在框外（2026-10-06 用户选 A，接受「生成」纵向位置跟着内容走）。
   */
  contentStretch?: boolean
  prompt: React.ReactNode
  /** 整行下方跨列的附加区（变体抽屉…）；缺省 = 不占位。 */
  footer?: React.ReactNode
  /** 拖拽落点线（蓝色 2px，落在行上沿）。 */
  dropIndicator?: boolean
  className?: string
  dataAttributes?: Record<string, string | number | undefined>
} & Pick<
  React.HTMLAttributes<HTMLDivElement>,
  'onClick' | 'onKeyDown' | 'onDragOver' | 'onDrop' | 'onPointerDown' | 'tabIndex'
>

const ROW_GRIP_WIDTH = 14
const NARROW_SCALE = 176 / 240

export default function StoryboardRowShell({
  grip,
  visual,
  visualWidth,
  contentStretch = true,
  prompt,
  footer,
  dropIndicator,
  className,
  dataAttributes,
  ...handlers
}: Props): JSX.Element {
  const density = useStoryboardRowDensity()
  const compact = density === 'compact'
  const columnWidth = density === 'wide' ? visualWidth : Math.round(visualWidth * NARROW_SCALE)
  return (
    <div
      {...handlers}
      {...dataAttributes}
      data-storyboard-row-density={density}
      className={cn('relative grid items-stretch gap-3 bg-nomi-paper p-3', className)}
      // 最窄档（E1a 的 400 / 320）：视觉列变成最上一行（缩略图 + 状态），内容列占满下面整行宽。
      style={{ gridTemplateColumns: compact ? `${ROW_GRIP_WIDTH}px minmax(0,1fr)` : `${ROW_GRIP_WIDTH}px ${columnWidth}px minmax(0,1fr)` }}
    >
      {dropIndicator ? <div className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-nomi-accent" aria-hidden /> : null}
      <div className={cn('relative self-start justify-self-center text-nomi-ink-20', compact && 'row-span-2')}>{grip}</div>
      <div className="min-w-0 self-start" data-storyboard-visual-column="true">{visual}</div>
      <div className={cn('flex min-w-0 flex-col gap-1.5', !contentStretch && 'self-start')} data-storyboard-content-column="true">{prompt}</div>
      {footer ? <div className={cn('col-start-2', !compact && 'col-span-2')}>{footer}</div> : null}
    </div>
  )
}
