import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/react'
import { IconMovie, IconPhoto, IconVideo } from '@tabler/icons-react'
import { WorkbenchIconButton } from '../../design/actions'
import { NomiLogoMark } from '../../design/identity'
import { TooltipProvider } from '../../design'
import { useRichTextActions } from '../common/richTextActions'
import { RichTextActionButton } from '../common/RichTextActionButton'
import { TEXT_ACTION_INTENT_PROPS } from '../api/textActionIntent'
import { cn } from '../../utils/cn'
import { createNodeFromSelection, type SelectionGenerationKind } from './createNodeFromSelection'
import { useGenerationCanvasStore } from '../generationCanvas/store/generationCanvasStore'
import { useWorkbenchStore } from '../workbenchStore'

type SelectionGeneratePopoverProps = {
  editor: Editor | null
  selectedText: string
  selectionVersion: number
  onStoryboard?: () => void
  onCreated?: () => void
  /** 点「AI 编辑」。不给 = 不显示这一颗。 */
  onAiEdit?: () => void
  /** AI 编辑进行中：浮条让位给输入框。 */
  hidden?: boolean
}

type SelectionPopoverPosition = {
  left: number
  top: number
  placement: 'top' | 'bottom'
}

const POPOVER_WIDTH = 344
const POPOVER_HEIGHT = 40
const POPOVER_OFFSET = 10
/** 选区浮条只放最常用的四颗格式钮；定义与顶栏同一份（richTextActions）。 */
const SELECTION_FORMAT_ACTION_IDS: readonly string[] = ['bold', 'italic', 'h1', 'h2']

function resolveSelectionPosition(editor: Editor, root: HTMLElement | null): SelectionPopoverPosition | null {
  if (!root) return null
  const { from, to, empty } = editor.state.selection
  if (empty || from === to) return null
  const start = editor.view.coordsAtPos(from)
  const end = editor.view.coordsAtPos(to)
  const rootRect = root.getBoundingClientRect()
  const selectionLeft = Math.min(start.left, end.left)
  const selectionRight = Math.max(start.right, end.right)
  const selectionTop = Math.min(start.top, end.top)
  const selectionBottom = Math.max(start.bottom, end.bottom)
  const preferredLeft = selectionLeft + (selectionRight - selectionLeft) / 2 - rootRect.left - POPOVER_WIDTH / 2
  const left = Math.max(12, Math.min(preferredLeft, Math.max(12, rootRect.width - POPOVER_WIDTH - 12)))
  // 上方放得下的判据是「正文区」的上沿，不是整个编辑器：编辑器顶上还有一排格式工具栏，
  // 以整个编辑器为界时，选中第一行的浮条会盖在工具栏上，工具栏那几颗钮就点不到了（2026-10-23 用户实测「代码钮没反应」）。
  const contentTop = (root.querySelector('.workbench-editor__scroll')?.getBoundingClientRect().top ?? rootRect.top) - rootRect.top
  // 选区整段滚出正文可视区：浮条不跟着钉在边上（看不见选区还留着一条浮条），等滚回来再出。
  if (selectionBottom - rootRect.top <= contentTop || selectionTop >= rootRect.bottom) return null
  const topPlacementTop = selectionTop - rootRect.top - POPOVER_HEIGHT - POPOVER_OFFSET
  if (topPlacementTop >= contentTop + 8) {
    return { left, top: topPlacementTop, placement: 'top' }
  }
  return {
    left,
    top: Math.max(contentTop + 8, Math.min(selectionBottom - rootRect.top + POPOVER_OFFSET, Math.max(8, rootRect.height - POPOVER_HEIGHT - 8))),
    placement: 'bottom',
  }
}

export default function SelectionGeneratePopover({
  editor,
  selectedText,
  selectionVersion,
  onStoryboard,
  onCreated,
  onAiEdit,
  hidden = false,
}: SelectionGeneratePopoverProps): JSX.Element | null {
  const { t } = useTranslation()
  const normalizedText = selectedText.trim()
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = React.useState<SelectionPopoverPosition | null>(null)
  const formatActions = useRichTextActions(editor, SELECTION_FORMAT_ACTION_IDS)
  const addGenerationNode = useGenerationCanvasStore((state) => state.addNode)
  const setWorkspaceMode = useWorkbenchStore((state) => state.setWorkspaceMode)

  const updatePosition = React.useCallback(() => {
    if (!editor || !normalizedText) {
      setPosition(null)
      return
    }
    const root = (rootRef.current?.closest('.workbench-editor') ??
      editor.view.dom.closest('.workbench-editor')) as HTMLElement | null
    setPosition(resolveSelectionPosition(editor, root))
  }, [editor, normalizedText])

  React.useLayoutEffect(() => {
    updatePosition()
  }, [selectionVersion, updatePosition])

  React.useEffect(() => {
    if (!editor || !normalizedText) return
    const root = (rootRef.current?.closest('.workbench-editor') ??
      editor.view.dom.closest('.workbench-editor')) as HTMLElement | null
    const scrollRoot = root?.querySelector('.workbench-editor__scroll')
    const frame = () => window.requestAnimationFrame(updatePosition)
    const onScroll = () => {
      frame()
    }
    const onResize = () => {
      frame()
    }
    scrollRoot?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      scrollRoot?.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [editor, normalizedText, updatePosition])

  if (hidden || !normalizedText || !editor || !position) return null

  const handleCreate = (kind: SelectionGenerationKind) => {
    if (createNodeFromSelection({ selectedText: normalizedText, kind, addGenerationNode, setWorkspaceMode })) {
      onCreated?.()
    }
  }


  return (
    <div
      ref={rootRef}
      className={cn(
        'workbench-selection-popover',
        'absolute z-20 inline-flex items-center',
        'w-[344px] h-[40px] gap-[5px] p-1 pr-[5px]',
        'border border-workbench-border rounded-nomi-lg',
        'bg-workbench-overlay shadow-workbench-pop',
        'backdrop-blur-[18px] backdrop-saturate-[1.06]',
        'origin-[50%_100%]',
      )}
      role="toolbar"
      aria-label={t('creationAi.selection.toolbar')}
      data-placement={position.placement}
      style={{ left: position.left, top: position.top }}
    >
      <div
        className={cn('workbench-selection-popover__format-group', 'inline-flex items-center gap-[3px] shrink-0')}
        aria-label={t('creationAi.selection.formatting')}
      >
        <TooltipProvider delayDuration={250} disableHoverableContent>
          {formatActions.map((action) => (
            <RichTextActionButton
              key={action.id}
              action={action}
              side="top"
              className={cn(
                'workbench-selection-popover__tool',
                'h-[30px] w-[28px]',
                'rounded-workbench-control text-workbench-muted',
                'hover:bg-workbench-accent-soft hover:text-workbench-accent',
                '[&>svg]:size-[14px]',
              )}
            />
          ))}
        </TooltipProvider>
      </div>
      <div
        className={cn(
          'workbench-selection-popover__divider',
          'self-stretch w-px mx-[2px] my-[3px] bg-workbench-border-soft',
        )}
      />
      {onAiEdit ? (
        <>
          <button
            type="button"
            className={cn(
              'workbench-selection-popover__tool workbench-selection-popover__tool--ai',
              'h-[30px] inline-flex items-center justify-center gap-1 px-2',
              'border border-workbench-border-soft rounded-workbench-control',
              'bg-transparent text-body-sm font-medium text-workbench-accent',
              'cursor-pointer whitespace-nowrap',
              'hover:border-nomi-ink-30 hover:bg-workbench-accent-soft',
            )}
            {...TEXT_ACTION_INTENT_PROPS}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onAiEdit}
          >
            <NomiLogoMark size={16} />
            {t('creationAi.rewrite.button')}
          </button>
          <div
            className={cn(
              'workbench-selection-popover__divider',
              'self-stretch w-px mx-[2px] my-[3px] bg-workbench-border-soft',
            )}
          />
        </>
      ) : null}
      <div
        className={cn('workbench-selection-popover__generate-group', 'inline-flex items-center gap-[3px] shrink-0')}
        aria-label={t('creationAi.selection.generate')}
      >
        <WorkbenchIconButton
          className={cn(
            'workbench-selection-popover__tool workbench-selection-popover__tool--generate',
            'h-[30px] w-[30px] inline-flex items-center justify-center',
            'border border-workbench-border-soft rounded-workbench-control',
            'bg-workbench-surface text-workbench-ink',
            'cursor-pointer',
            'hover:border-nomi-ink-30',
            'hover:bg-workbench-accent-soft hover:text-workbench-accent',
          )}
          label={t('creationAi.selection.image')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => handleCreate('image')}
          icon={<IconPhoto size={14} />}
        />
        <WorkbenchIconButton
          className={cn(
            'workbench-selection-popover__tool workbench-selection-popover__tool--generate',
            'h-[30px] w-[30px] inline-flex items-center justify-center',
            'border border-workbench-border-soft rounded-workbench-control',
            'bg-workbench-surface text-workbench-ink',
            'cursor-pointer',
            'hover:border-nomi-ink-30',
            'hover:bg-workbench-accent-soft hover:text-workbench-accent',
          )}
          label={t('creationAi.selection.video')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => handleCreate('video')}
          icon={<IconVideo size={14} />}
        />
        <WorkbenchIconButton
          className={cn(
            'workbench-selection-popover__tool workbench-selection-popover__tool--generate',
            'h-[30px] w-[30px] inline-flex items-center justify-center',
            'border border-workbench-border-soft rounded-workbench-control',
            'bg-workbench-surface text-workbench-ink',
            'cursor-pointer',
            'hover:border-nomi-ink-30',
            'hover:bg-workbench-accent-soft hover:text-workbench-accent',
          )}
          label={t('creationAi.selection.storyboard')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onStoryboard?.()
            onCreated?.()
          }}
          disabled={!onStoryboard}
          icon={<IconMovie size={14} />}
        />
      </div>
    </div>
  )
}
