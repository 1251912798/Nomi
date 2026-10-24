import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { IconPencil, IconPhoto, IconTrash, IconVideo } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import type { LibraryPrompt } from '../api/promptLibraryApi'
import type { LibraryHost } from '../library/libraryLayout'
import { SkillMedia } from '../skillLibrary/SkillMedia'
import { promptDisplayTitle } from './promptDisplay'

type Props = {
  prompt: LibraryPrompt
  size: LibraryHost
  /** 点开详情；rect = 封面在屏上的位置（详情从这里放大浮出）。 */
  onOpen: (prompt: LibraryPrompt, rect: DOMRect) => void
  /** 只「我的」条目给：编辑 / 删除在卡片标题行，悬停或键盘聚焦时露出（Q10）。 */
  onEdit?: (prompt: LibraryPrompt) => void
  onDelete?: (prompt: LibraryPrompt) => void
}

const SIZE = {
  page: { stack: 'gap-1.5', title: 'text-body-sm leading-[18px]', meta: 'text-micro leading-4', textBox: 'px-3 py-2.5', text: 'line-clamp-6 text-caption leading-[17px]', icon: 28, actionsBottom: 'bottom-3.5' },
  drawer: { stack: 'gap-1', title: 'text-caption leading-[17px]', meta: 'text-micro leading-[14px]', textBox: 'px-2.5 py-2', text: 'line-clamp-5 text-micro leading-[15px]', icon: 22, actionsBottom: 'bottom-3' },
} as const

/**
 * 一张提示词卡（PromptLibrary / LibraryDrawers / LibraryMine 板）：封面只放图（视频取首帧），封面上不压任何字和角标；
 * 标题在封面下（一行省略，悬停出全名），下面一行「类型」（视频带小图标），我的条目前面加来源标签（画布选中 / 网页提取…）。
 * 没有媒体的条目用文字封面（正文前几行）。我的条目和公开条目是同一张卡（原来的「自建」文字卡删了）。
 */
export const PromptCard = React.memo(function PromptCard({ prompt, size, onOpen, onEdit, onDelete }: Props): JSX.Element {
  const { t } = useTranslation()
  const face = SIZE[size]
  const title = promptDisplayTitle(prompt)
  const isVideo = prompt.promptType === 'video'
  const mine = prompt.origin === 'user'
  const meta = [mine ? prompt.tags?.[0] : undefined, isVideo ? t('libraries.prompt.card.video') : t('libraries.prompt.card.image')].filter(Boolean).join(' · ')
  const coverRef = React.useRef<HTMLSpanElement>(null)
  const withActions = mine && onEdit && onDelete
  const TypeIcon = prompt.mediaType === 'video' ? IconVideo : IconPhoto
  return (
    <div className="group relative min-w-0" data-prompt-card={prompt.id}>
      <button
        type="button"
        title={title}
        onClick={(event) => onOpen(prompt, (coverRef.current ?? event.currentTarget).getBoundingClientRect())}
        className={cn(
          'flex w-full min-w-0 cursor-pointer flex-col border-0 bg-transparent p-0 text-left text-nomi-ink',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nomi-ink',
          face.stack,
        )}
      >
        <span ref={coverRef} className="relative block aspect-[4/3] w-full overflow-hidden rounded-nomi bg-nomi-ink-05 ring-1 ring-inset ring-nomi-line-soft transition-shadow duration-nomi-fast group-hover:shadow-nomi-md" data-prompt-cover>
          {prompt.mediaUrl ? (
            <SkillMedia
              cover={prompt.mediaType === 'image' ? prompt.mediaUrl : undefined}
              preview={{ url: prompt.mediaUrl, type: prompt.mediaType }}
              illustration={prompt.curation?.preview?.provenance === 'illustration'}
              fallback={<TypeIcon size={face.icon} stroke={1.4} />}
              expiredLabel={t('libraries.prompt.card.expired')}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            // 内边距放外层、截断放内层：截断的那一层若自己带内边距又被撑满封面高，第 N+1 行会从内边距里露出半行（280px 抽屉里实测）。
            <span className={cn('block h-full overflow-hidden', face.textBox)} data-prompt-text-cover>
              <span className={cn('whitespace-pre-line break-words text-nomi-ink-60', face.text)}>{prompt.prompt}</span>
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-px">
          <strong className={cn('truncate font-semibold text-nomi-ink', face.title, withActions && 'pr-14')} data-prompt-card-title>{title}</strong>
          <span className={cn('flex min-w-0 items-center gap-1 text-nomi-ink-60', face.meta)} data-prompt-card-meta>
            {isVideo ? <IconVideo size={12} stroke={1.6} className="shrink-0" aria-hidden="true" /> : null}
            <span className="truncate">{meta}</span>
          </span>
        </span>
      </button>
      {withActions ? (
        <span className={cn('absolute right-0 flex items-center gap-0.5 opacity-0 transition-opacity duration-nomi-fast group-hover:opacity-100 group-focus-within:opacity-100', face.actionsBottom)} data-prompt-card-actions>
          <button
            type="button"
            aria-label={t('libraries.prompt.card.edit')}
            title={t('libraries.prompt.card.edit')}
            onClick={() => onEdit(prompt)}
            className="grid size-6 cursor-pointer place-items-center rounded-nomi-sm border-0 bg-transparent text-nomi-ink-60 hover:bg-nomi-ink-05 hover:text-nomi-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-nomi-ink"
          >
            <IconPencil size={14} stroke={1.7} />
          </button>
          <button
            type="button"
            aria-label={t('libraries.prompt.card.delete')}
            title={t('libraries.prompt.card.delete')}
            onClick={() => onDelete(prompt)}
            className="grid size-6 cursor-pointer place-items-center rounded-nomi-sm border-0 bg-transparent text-workbench-danger hover:bg-workbench-danger-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-nomi-ink"
          >
            <IconTrash size={14} stroke={1.7} />
          </button>
        </span>
      ) : null}
    </div>
  )
})
