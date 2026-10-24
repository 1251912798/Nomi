/**
 * [INPUT]: 依赖 react、react-i18next、../../../../../../vendor/tablerIcons、../../DirectorEditorContext、../../model/directorPreviewState 的
 *          readDirectorPreview / directorProduceButtonState（唯一判据，与花钱闸同一份）、../../model/directorNodeMeta、../../model/directorShotSummaries、
 *          ../../model/hotkeys、../../OutputsContext、../outputs/OutputsPopover 的 OutputsMenuBody、../Popover、画布 store
 * [OUTPUT]: 对外提供 ProduceButton 与 ProduceControl：导演视图顶栏右侧的「出成片 ▾」分体按钮
 * [POS]: 主按钮只渲染状态、点了交给 DirectorEditor 的 onProduce（只做准备，不花钱，见 agent/directorProduce.ts）。
 *        状态：没有镜头 → 灰 + 悬停说明；当前工程超过预演上限 → 灰 + 说明「当前 N 秒、最长 10 秒」（按当前工程判，不等写过失败）；
 *        预演渲染中（或点了正在等预演）→「预演渲染中…」；失败 →「重试预演」；
 *        其余 →「出成片」。禁用写在按钮本身上（以前写在外层 div 上不生效，看着可点、点了没反应）。
 *        ▾：截图 + 产出浮层正文（录制 MP4 与已有产出，精修顶栏同一份 OutputsMenuBody）。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { IconCamera, IconChevronDown } from '../../../../../../vendor/tablerIcons'
import { cn } from '../../../../../../utils/cn'
import { WORKBENCH_BUTTON_PRIMARY_CLASS } from '../../../../../../design'
import { useGenerationCanvasStore } from '../../../../store/generationCanvasStore'
import { useDirectorStore } from '../../DirectorEditorContext'
import { DIRECTOR_PREVIEW_META_KEY } from '../../model/directorNodeMeta'
import { DIRECTOR_PREVIEW_MAX_SECONDS, directorProduceButtonState, directorProjectSeconds, readDirectorPreview } from '../../model/directorPreviewState'
import { summarizeDirectorShots } from '../../model/directorShotSummaries'
import { DIRECTOR_HOTKEYS, formatHotkey } from '../../model/hotkeys'
import { useOutputs } from '../../OutputsContext'
import { OutputsMenuBody } from '../outputs/OutputsPopover'
import { Popover, PopoverItem } from '../Popover'

export type ProduceControl = Readonly<{
  /** 画布上的导演节点；没有（开发入口）= 出不了片。 */
  nodeId?: string
  readOnly: boolean
  /** 点了正在等预演渲染好（好了自动接着挂）。 */
  pending: boolean
  onProduce: () => void
}>

const SEGMENT = cn(
  'pointer-events-auto inline-flex items-center text-body-sm font-semibold',
  'disabled:cursor-not-allowed disabled:opacity-50',
  WORKBENCH_BUTTON_PRIMARY_CLASS,
)

export function ProduceButton({ control }: { control: ProduceControl }): JSX.Element {
  const { t } = useTranslation()
  const outputs = useOutputs()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const previewRaw = useGenerationCanvasStore((state) => (control.nodeId ? state.nodes.find((node) => node.id === control.nodeId)?.meta?.[DIRECTOR_PREVIEW_META_KEY] : undefined))
  // 只在工程变了才数镜头（播放时播放头每帧都在变，选择器里直接数会每帧跑一遍）
  const project = useDirectorStore((state) => state.project)
  const playableShots = React.useMemo(() => summarizeDirectorShots(project).length, [project])
  const state = directorProduceButtonState(readDirectorPreview({ meta: { [DIRECTOR_PREVIEW_META_KEY]: previewRaw } }), project, playableShots)
  const busy = state === 'rendering' || control.pending
  const unavailable = control.readOnly || !control.nodeId
  const disabled = unavailable || busy || state === 'empty' || state === 'too_long'
  const label = busy ? t('director.view.produceRendering') : state === 'retry' ? t('director.view.produceRetry') : t('director.view.produce')
  const hint = state === 'empty' ? t('director.view.produceEmptyHint')
    : state === 'too_long' ? t('director.view.produceTooLong', { current: directorProjectSeconds(project).toFixed(1), seconds: DIRECTOR_PREVIEW_MAX_SECONDS })
      : busy ? t('director.view.produceRenderingHint')
        : t('director.view.produceDescription')
  return (
    <div className="pointer-events-auto inline-flex shrink-0 overflow-hidden rounded-nomi-lg shadow-nomi-md" role="group" aria-label={t('director.view.produce')} data-testid="director-produce" data-state={busy ? 'rendering' : state}>
      <button type="button" className={cn(SEGMENT, 'min-w-0 gap-1.5 whitespace-nowrap px-3 py-2')} disabled={disabled} title={hint} data-testid="director-produce-main" onClick={control.onProduce}>
        {busy ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-nomi-paper/40 border-t-nomi-paper" aria-hidden="true" /> : null}
        {label}
      </button>
      <Popover
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        align="end"
        side="bottom"
        panelClassName="w-[320px] p-2"
        trigger={
          <button type="button" className={cn(SEGMENT, 'h-full border-l border-nomi-paper/25 px-2')} aria-label={t('director.view.produceMenu')} aria-expanded={menuOpen} data-testid="director-produce-menu" onClick={() => setMenuOpen((open) => !open)}>
            <IconChevronDown size={15} stroke={2} aria-hidden="true" />
          </button>
        }
      >
        <div className="-mx-1 mb-1 border-b border-nomi-line-soft pb-1">
          <PopoverItem
            title={`${t('director.bottomBar.screenshot')} (${formatHotkey(DIRECTOR_HOTKEYS.screenshot)})`}
            onClick={() => {
              setMenuOpen(false)
              void outputs.takeScreenshot()
            }}
          >
            <IconCamera size={16} stroke={1.9} />
            <span className="flex-1 text-left" data-testid="director-produce-screenshot">{t('director.bottomBar.screenshot')}</span>
          </PopoverItem>
        </div>
        <OutputsMenuBody onPicked={() => setMenuOpen(false)} />
      </Popover>
    </div>
  )
}
