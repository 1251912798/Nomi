/**
 * 「提取深度」的小面板 —— 一个必答问题 + 一颗开始。
 *
 * 2026-09-07 用户看过上一版（整节点一张表单：源 / 输出 / 分辨率 / 帧率 / 近处 / 人数 / 平滑 / 范围
 * 八行全平铺）后的原话是「不够简单、丑、不知道怎么用」。所以这一版的形态是**倒过来定**的：
 * 第一屏只留用户真的有判断依据的那一个问题——「我要的是深度、深度+骨架，还是原片+骨架」，
 * 其余全部收进「高级」。分辨率/帧率/平滑/范围不是不重要，是**用户没有判断依据**：
 * 518 是模型原生尺寸、0.35 是实测那一组，问他等于把我们的功课推给他（D1）。
 *
 * 这是一个**纯呈现件**：所有状态从 props 来，一行 store、一次 IPC 都不碰。
 * 这样设计实验室能把它的五个形态逐格钉住（UI 交付定义 = 实验室截图拍板 + 视觉基线绿），
 * 而不是照着它另画一份样张。
 *
 * 配色一律 `--nomi-*`：本面板 Portal 到 body（AnchoredPopover），用作用域内才有定义的变量
 * 会静默退回继承色。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconBodyScan, IconChevronDown, IconChevronRight, IconShadow, IconWalk } from '@tabler/icons-react'
import { NomiSegmented, NomiSelect, WorkbenchButton } from '../../../design'
import { cn } from '../../../utils/cn'
import {
  VIDEO_DEPTH_FPS,
  VIDEO_DEPTH_MODES,
  type VideoDepthMode,
  type VideoDepthSettings,
} from '../../../../electron/shared/canvas/videoDepth'

const MODE_ICON: Record<VideoDepthMode, typeof IconShadow> = {
  depth: IconShadow,
  depth_skeleton: IconBodyScan,
  original_skeleton: IconWalk,
}

const NUMBER_FIELD =
  'w-full rounded-nomi-sm border border-nomi-line bg-nomi-paper px-2 py-1 text-caption text-nomi-ink disabled:opacity-50'

/** 手输的平滑系数越界时夹回 [0,1]——contract 会拒收越界值，而拒收发生在点「开始」之后太晚了。 */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 text-caption text-nomi-ink-60">
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}

export type VideoDepthActionPanelProps = {
  settings: VideoDepthSettings
  onSettingsChange: (changes: Partial<VideoDepthSettings>) => void
  advancedOpen: boolean
  onToggleAdvanced: () => void
  /**
   * 已经按下「开始」、这次运行还停在下载权重那一段。
   * 进度**长在按钮里**，不另起一段解释文字：用户按的是这颗按钮，答案就该回在这颗按钮上。
   */
  download?: { totalBytes: number; percent?: number }
  onStart: () => void
}

export function VideoDepthActionPanel({
  settings,
  onSettingsChange,
  advancedOpen,
  onToggleAdvanced,
  download,
  onStart,
}: VideoDepthActionPanelProps): JSX.Element {
  const { t } = useTranslation()
  const busy = download !== undefined
  return (
    <div
      className="flex w-[248px] flex-col gap-2 rounded-nomi border border-nomi-line bg-nomi-paper p-3 shadow-nomi-md"
      data-video-depth-panel="true"
    >
      <NomiSegmented
        ariaLabel={t('videoDepth.mode.label')}
        value={settings.mode}
        density="compact"
        itemClassName="gap-0.5"
        options={VIDEO_DEPTH_MODES.map((mode) => {
          const Icon = MODE_ICON[mode]
          return {
            value: mode,
            label: (
              <>
                <Icon size={15} stroke={1.6} aria-hidden />
                <span className="text-micro leading-tight">{t(`videoDepth.mode.${mode}` as 'videoDepth.mode.depth')}</span>
              </>
            ),
            disabled: busy,
          }
        })}
        onChange={(value) => onSettingsChange({ mode: value as VideoDepthMode })}
      />

      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 self-start rounded-nomi-sm border-0 bg-transparent px-1 py-0.5',
          'cursor-pointer text-caption text-nomi-ink-60 hover:text-nomi-ink',
        )}
        aria-expanded={advancedOpen}
        onClick={onToggleAdvanced}
      >
        {advancedOpen ? <IconChevronDown size={13} stroke={1.6} aria-hidden /> : <IconChevronRight size={13} stroke={1.6} aria-hidden />}
        <span>{t('videoDepth.advanced.label')}</span>
      </button>

      {advancedOpen ? (
        <div className="flex flex-col gap-2" data-video-depth-advanced="true">
          <Row label={t('videoDepth.resolution.label')}>
            <NomiSelect
              value={String(settings.maxResolution)}
              ariaLabel={t('videoDepth.resolution.label')}
              disabled={busy}
              options={[
                { value: '518', label: t('videoDepth.resolution.native') },
                { value: 'original', label: t('videoDepth.resolution.original') },
              ]}
              onChange={(value) => onSettingsChange({ maxResolution: value === 'original' ? 'original' : 518 })}
            />
          </Row>
          <Row label={t('videoDepth.fps.label')}>
            <NomiSelect
              value={String(settings.processingFps)}
              ariaLabel={t('videoDepth.fps.label')}
              disabled={busy}
              options={VIDEO_DEPTH_FPS.map((fps) => ({ value: String(fps), label: String(fps) }))}
              onChange={(value) => onSettingsChange({ processingFps: Number(value) as VideoDepthSettings['processingFps'] })}
            />
          </Row>
          <Row label={t('videoDepth.smoothing.label')}>
            <input
              className={NUMBER_FIELD}
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={settings.temporalSmoothing}
              disabled={busy}
              aria-label={t('videoDepth.smoothing.label')}
              onChange={(event) => onSettingsChange({ temporalSmoothing: clamp01(Number(event.target.value)) })}
            />
          </Row>
          <Row label={t('videoDepth.trim.label')}>
            <span className="flex gap-1">
              <input
                className={NUMBER_FIELD}
                type="number"
                min={0}
                step={0.5}
                value={settings.trimStartSeconds}
                disabled={busy}
                aria-label={t('videoDepth.trim.start')}
                onChange={(event) => onSettingsChange({ trimStartSeconds: Math.max(0, Number(event.target.value) || 0) })}
              />
              <input
                className={NUMBER_FIELD}
                type="number"
                min={0}
                step={0.5}
                value={settings.trimEndSeconds}
                disabled={busy}
                aria-label={t('videoDepth.trim.end')}
                title={t('videoDepth.trim.endHint')}
                onChange={(event) => onSettingsChange({ trimEndSeconds: Math.max(0, Number(event.target.value) || 0) })}
              />
            </span>
          </Row>
          {/* 唯一那句诚实边界（§12.4）。它没被删，只是换了层级：第一屏不写解释段落，
              但「这东西做得到什么、做不到什么」不许消失——尤其那半句「不保证比原片更准」，
              它是我们自己那次真实 A/B 的结论。 */}
          <p className="text-micro text-nomi-ink-40">{t('videoDepth.advanced.limits')}</p>
        </div>
      ) : null}

      <WorkbenchButton
        variant="primary"
        className={cn(
          // relative + overflow-hidden：下载进度是按钮里的一条**填充**，不是按钮下面又长出一根进度条。
          'relative w-full overflow-hidden',
          // 下载途中按钮**不许变灰**。它确实不可点（disabled 是对的），但通用件的
          // `disabled:opacity-50` 会把整颗按钮连同里面那条进度一起压暗，读起来是「坏了」
          // 而不是「正在跑」——而这一刻正是用户最需要看清它在动的时候。
          busy && 'disabled:opacity-100 disabled:cursor-wait',
        )}
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={onStart}
        data-video-depth-start="true"
      >
        {busy ? (
          <span
            className="absolute inset-y-0 left-0 bg-nomi-paper/30 transition-[width] duration-300"
            style={{ width: `${Math.min(100, Math.max(0, download.percent ?? 0))}%` }}
            aria-hidden
          />
        ) : null}
        <span className="relative">
          {busy
            ? t('videoDepth.action.downloading', {
                size: megabytes(download.totalBytes),
                percent: download.percent ?? 0,
              })
            : t('videoDepth.action.start')}
        </span>
      </WorkbenchButton>
    </div>
  )
}
