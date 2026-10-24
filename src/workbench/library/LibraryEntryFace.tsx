import React, { type JSX } from 'react'
import { cn } from '../../utils/cn'
import type { LibraryHost } from './libraryLayout'

/**
 * 库条目的「一张脸」：缩略图 + 名字 + 描述（设计卡 ★3「一张脸」）。技能条卡用它；Agent「/」行、节点「提示词预设」行
 * 以后也只换尺寸用它（LibraryPointers 板，另派）——三处同一份结构、同一张缩略图、同一个名字，不各画一份。
 *
 * 尺寸只有两档，量自拍板图：宽页 = 88×55 封面 + 14/20 名字 + 12/16 两行简介；抽屉 = 64×40 + 13/18 + 11/15。
 */
export type LibraryFaceSize = LibraryHost

const FACE = {
  page: { cover: 'h-[55px] w-[88px]', gap: 'gap-3', title: 'text-body leading-5', text: 'text-caption leading-4', stack: 'gap-[3px]' },
  drawer: { cover: 'h-10 w-16', gap: 'gap-2.5', title: 'text-body-sm leading-[18px]', text: 'text-micro leading-[15px]', stack: 'gap-0.5' },
} as const

export function LibraryEntryFace({ size, media, title, description }: {
  size: LibraryFaceSize
  /** 封面件（SkillMedia）；它自己负责占位、失效与暗色插画。 */
  media: (coverClassName: string) => React.ReactNode
  title: string
  description?: string
}): JSX.Element {
  const face = FACE[size]
  return (
    <span className={cn('flex min-w-0 items-start', face.gap)}>
      {media(cn('shrink-0 overflow-hidden rounded-nomi-sm object-cover', face.cover))}
      <span className={cn('flex min-w-0 flex-col', face.stack)}>
        <strong className={cn('truncate font-semibold text-nomi-ink', face.title)} data-library-entry-title>{title}</strong>
        {description ? <span className={cn('line-clamp-2 text-nomi-ink-60', face.text)} data-library-entry-summary>{description}</span> : null}
      </span>
    </span>
  )
}

/** 技能条卡：整张是一个按钮，点开详情；卡上不放角标、不放动作（SkillLibrary / LibraryDrawers 板）。 */
export function LibraryStripCard({ size, onOpen, children, className, ...rest }: {
  size: LibraryFaceSize
  onOpen: (rect: DOMRect) => void
  children: React.ReactNode
  className?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children' | 'className'>): JSX.Element {
  return (
    <button
      type="button"
      {...rest}
      onClick={(event) => onOpen(event.currentTarget.getBoundingClientRect())}
      className={cn(
        'block w-full min-w-0 cursor-pointer overflow-hidden rounded-panel border border-nomi-line bg-nomi-paper text-left',
        'transition-[border-color,background] duration-nomi-fast ease-nomi-fast hover:border-nomi-ink-20 hover:bg-nomi-ink-05',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nomi-ink',
        size === 'page' ? 'h-[78px] p-[11px]' : 'h-[66px] p-[9px]',
        className,
      )}
    >
      {children}
    </button>
  )
}
