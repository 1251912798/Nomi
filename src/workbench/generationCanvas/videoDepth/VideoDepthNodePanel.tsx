/**
 * 深度视频节点 —— 卡片正文。
 *
 * 结构上只有三层：选源 → 调参数 → 跑。跑起来之后参数整体禁用（改参数不会影响已经在跑的那批，
 * 让它们看着可点是骗人的），产物出来就直接在卡片里播。
 *
 * 诚实边界（§12.4）常驻在卡片底部，不折叠：这条产品线的整个价值主张是「本地、免费、
 * 零上传的结构参考产源」，而不是「比原片更准」——把失效边界藏起来就等于暗示了后者。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { NomiSelect, WorkbenchButton } from '../../../design'
import { cn } from '../../../utils/cn'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import {
  VIDEO_DEPTH_FPS,
  VIDEO_DEPTH_MODES,
  modeNeedsPose,
  type VideoDepthMode,
  type VideoDepthSettings,
} from '../../../../electron/shared/canvas/videoDepth'
import { videoDepthModelForRole } from '../../../../electron/shared/canvas/videoDepthModels'
import {
  collectVideoDepthSourceCandidates,
  formatVideoDepthEta,
  readVideoDepthSettings,
  videoDepthProgressView,
  videoDepthSettingsPatch,
} from './videoDepthNodeModel'
import { useVideoDepthRun } from './useVideoDepthRun'

const NO_SOURCE = '__none__'

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

/** 手输的平滑系数越界时夹回 [0,1]——contract 会拒收越界值，而拒收发生在点「开始」之后太晚了。 */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

// NomiSelect 不是原生 <select>（它是 Combobox），所以这里不用 <label> 包住它——
// 包了也不会把点击转发过去，反而会让读屏念两遍。名字通过 ariaLabel 直接给控件。
const NUMBER_FIELD =
  'w-full rounded-nomi-sm border border-nomi-line bg-nomi-paper px-2 py-1 text-caption text-nomi-ink disabled:opacity-50'

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 text-caption text-nomi-ink-60">
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}

export default function VideoDepthNodePanel({
  node,
  readOnly = false,
}: {
  node: GenerationCanvasNode
  readOnly?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const nodes = useGenerationCanvasStore((state) => state.nodes)
  const updateNode = useGenerationCanvasStore((state) => state.updateNode)
  const run = useVideoDepthRun(node.id)

  const settings = readVideoDepthSettings(node)
  const candidates = React.useMemo(() => collectVideoDepthSourceCandidates(nodes, node.id), [nodes, node.id])
  const selected = settings.sourceVideoRef
  // 源节点被删掉之后，存着的引用还在 meta 里。**不静默清空**（那会让用户以为自己没选过），
  // 而是明说「原来那段不在了」并要求重选。
  const selectedStillOnCanvas = selected ? candidates.some((c) => c.sourceNodeId === selected.sourceNodeId) : false

  const edit = React.useCallback(
    (changes: Partial<VideoDepthSettings>) => {
      updateNode(node.id, videoDepthSettingsPatch(node, changes))
    },
    [node, updateNode],
  )

  const depthWeight = videoDepthModelForRole('depth')
  const view = videoDepthProgressView(run.state)
  const disabled = readOnly || run.busy

  return (
    <div className="flex h-full w-full flex-col gap-2 overflow-y-auto p-3 text-caption" data-node-video-depth={node.id}>
      <Row label={t('videoDepth.source.label')}>
        <NomiSelect
          value={selectedStillOnCanvas && selected ? selected.sourceNodeId : NO_SOURCE}
          ariaLabel={t('videoDepth.source.label')}
          disabled={disabled || candidates.length === 0}
          options={[
            { value: NO_SOURCE, label: t('videoDepth.source.pick') },
            ...candidates.map((c) => ({ value: c.sourceNodeId, label: c.title })),
          ]}
          onChange={(value) => {
            const picked = candidates.find((c) => c.sourceNodeId === value)
            edit({ sourceVideoRef: picked ?? undefined })
          }}
        />
      </Row>
      {candidates.length === 0 ? <p className="text-nomi-ink-45">{t('videoDepth.source.empty')}</p> : null}
      {selected && !selectedStillOnCanvas ? <p className="text-nomi-danger">{t('videoDepth.source.missing')}</p> : null}

      <Row label={t('videoDepth.mode.label')}>
        <NomiSelect
          value={settings.mode}
          ariaLabel={t('videoDepth.mode.label')}
          disabled={disabled}
          options={VIDEO_DEPTH_MODES.map((mode) => ({ value: mode, label: t(`videoDepth.mode.${mode}` as 'videoDepth.mode.depth') }))}
          onChange={(value) => edit({ mode: value as VideoDepthMode })}
        />
      </Row>

      <Row label={t('videoDepth.resolution.label')}>
        <NomiSelect
          value={String(settings.maxResolution)}
          ariaLabel={t('videoDepth.resolution.label')}
          disabled={disabled}
          options={[
            { value: '518', label: t('videoDepth.resolution.native') },
            { value: 'original', label: t('videoDepth.resolution.original') },
          ]}
          onChange={(value) => edit({ maxResolution: value === 'original' ? 'original' : 518 })}
        />
      </Row>
      <p className="text-nomi-ink-45">{t('videoDepth.resolution.hint')}</p>

      <Row label={t('videoDepth.fps.label')}>
        <NomiSelect
          value={String(settings.processingFps)}
          ariaLabel={t('videoDepth.fps.label')}
          disabled={disabled}
          options={VIDEO_DEPTH_FPS.map((fps) => ({ value: String(fps), label: String(fps) }))}
          onChange={(value) => edit({ processingFps: Number(value) as VideoDepthSettings['processingFps'] })}
        />
      </Row>

      <Row label={t('videoDepth.direction.label')}>
        <NomiSelect
          value={settings.depthDirection}
          ariaLabel={t('videoDepth.direction.label')}
          disabled={disabled}
          options={[
            { value: 'nearWhite', label: t('videoDepth.direction.nearWhite') },
            { value: 'nearBlack', label: t('videoDepth.direction.nearBlack') },
          ]}
          onChange={(value) => edit({ depthDirection: value === 'nearBlack' ? 'nearBlack' : 'nearWhite' })}
        />
      </Row>

      {/* 纯深度模式根本不跑姿态模型，这一项在那里是个没有效果的旋钮——隐藏比禁用诚实。 */}
      {modeNeedsPose(settings.mode) ? (
        <Row label={t('videoDepth.people.label')}>
          <NomiSelect
            value={String(settings.maxPeople)}
            ariaLabel={t('videoDepth.people.label')}
            disabled={disabled}
            options={[1, 2, 3, 4].map((count) => ({ value: String(count), label: String(count) }))}
            onChange={(value) => edit({ maxPeople: Number(value) as VideoDepthSettings['maxPeople'] })}
          />
        </Row>
      ) : null}

      <Row label={t('videoDepth.smoothing.label')}>
        <input
          className={NUMBER_FIELD}
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={settings.temporalSmoothing}
          disabled={disabled}
          aria-label={t('videoDepth.smoothing.label')}
          onChange={(event) => edit({ temporalSmoothing: clamp01(Number(event.target.value)) })}
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
            disabled={disabled}
            aria-label={t('videoDepth.trim.start')}
            onChange={(event) => edit({ trimStartSeconds: Math.max(0, Number(event.target.value) || 0) })}
          />
          <input
            className={NUMBER_FIELD}
            type="number"
            min={0}
            step={0.5}
            value={settings.trimEndSeconds}
            disabled={disabled}
            aria-label={t('videoDepth.trim.end')}
            title={t('videoDepth.trim.endHint')}
            onChange={(event) => edit({ trimEndSeconds: Math.max(0, Number(event.target.value) || 0) })}
          />
        </span>
      </Row>
      <p className="text-nomi-ink-45">{t('videoDepth.trim.endHint')}</p>

      {run.state.phase === 'idle' ? (
        <p className="text-nomi-ink-45">{t('videoDepth.download.pending', { size: megabytes(depthWeight.sizeBytes) })}</p>
      ) : null}

      {run.busy ? (
        <div className="flex flex-col gap-1" data-video-depth-progress={run.state.phase}>
          <span className="text-nomi-ink-70">
            {t(`videoDepth.phase.${run.state.phase}` as 'videoDepth.phase.processing')}
            {view.percent !== undefined ? ` ${view.percent}%` : ''}
          </span>
          <span className="text-nomi-ink-45">
            {view.done !== undefined && view.total !== undefined
              ? run.state.progress?.kind === 'bytes'
                ? t('videoDepth.progress.bytes', { done: megabytes(view.done), total: megabytes(view.total) })
                : t('videoDepth.progress.frames', { done: view.done, total: view.total })
              : null}
          </span>
          <span className="text-nomi-ink-45">
            {view.etaSeconds !== undefined
              ? t('videoDepth.progress.eta', { eta: formatVideoDepthEta(view.etaSeconds) })
              : t('videoDepth.progress.measuring')}
          </span>
        </div>
      ) : null}

      {run.state.phase === 'failed' && run.state.error ? (
        <p className="text-nomi-danger" data-video-depth-error={run.state.error.code}>
          {t(`videoDepth.error.${run.state.error.code}` as 'videoDepth.error.media-failed')}
        </p>
      ) : null}

      <div className="flex gap-2">
        <WorkbenchButton
          className={cn('flex-1')}
          disabled={readOnly || !run.available || !selectedStillOnCanvas || run.busy}
          onClick={() => {
            if (selected && selectedStillOnCanvas) run.start(settings, selected)
          }}
        >
          {node.result?.url ? t('videoDepth.run.again') : t('videoDepth.run.start')}
        </WorkbenchButton>
        {run.busy ? (
          <WorkbenchButton onClick={run.cancel} data-video-depth-cancel="true">
            {t('videoDepth.run.cancel')}
          </WorkbenchButton>
        ) : null}
      </div>

      {node.result?.url ? (
        <video
          className="w-full rounded-nomi-sm bg-nomi-ink-05"
          src={node.result.url}
          controls
          playsInline
          crossOrigin="use-credentials"
          data-video-depth-result="true"
        />
      ) : null}

      <div className="mt-auto flex flex-col gap-0.5 border-t border-nomi-line pt-2 text-nomi-ink-45">
        <span className="text-nomi-ink-60">{t('videoDepth.limits.title')}</span>
        <span>{t('videoDepth.limits.carries')}</span>
        <span>{t('videoDepth.limits.fingers')}</span>
        <span>{t('videoDepth.limits.interaction')}</span>
        <span>{t('videoDepth.limits.honest')}</span>
      </div>
    </div>
  )
}
