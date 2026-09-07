/**
 * 视频节点浮条上的「提取深度」——动作 + 它的小面板。
 *
 * 形态由 2026-09-07 用户拍板：**深度视频不是一种节点，是视频节点上的一个动作**。
 * 所以这里没有「选源」——源就是用户选中的这一个；也没有全屏面板——问题只有一个，
 * 值不上一整屏。点动作 → 面板贴着按钮浮出 → 选输出 → 开始 → 旁边长出一张新卡。
 *
 * 面板本身是纯呈现件（VideoDepthActionPanel），这里只做三件它做不到的事：
 * 记住这次选了什么、把「开始」接到整动作上、以及在下载权重那一段把进度读回按钮里。
 *
 * 下载那一段为什么读的是**派生节点的进度**而不是自己存一份：进度已经在节点上了
 * （setNodeProgress，遮罩也读它）。再存一份就是同一件事两份真相，而两份真相里
 * 总有一份会先过时——过时的那份正好是用户盯着的这颗按钮。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconShadow } from '@tabler/icons-react'
import { AnchoredPopover } from '../../../design'
import { TOOLBAR_ICON as I, ToolbarButton } from '../nodes/NodeFloatingToolbar'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { readVideoDepthSettings } from './videoDepthNodeModel'
import { videoDepthProgressPhase } from './videoDepthProgressPhase'
import { startVideoDepthDerivation } from './startVideoDepthDerivation'
import { VideoDepthActionPanel } from './VideoDepthActionPanel'
import { modeNeedsPose, type VideoDepthSettings } from '../../../../electron/shared/canvas/videoDepth'
import { videoDepthRequiredAssets } from '../../../../electron/shared/canvas/videoDepthModels'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

export default function NodeDepthActionButton({
  node,
  disabled = false,
}: {
  node: GenerationCanvasNode
  disabled?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const anchorRef = React.useRef<HTMLSpanElement>(null)
  const [open, setOpen] = React.useState(false)
  const [advancedOpen, setAdvancedOpen] = React.useState(false)
  // 初值从这个节点身上读：普通视频节点没有这块 meta，拿到的就是默认档；
  // 而如果它本身就是上一次深度处理的产物，用户看到的是上次那一组，不用重设一遍。
  const [settings, setSettings] = React.useState<VideoDepthSettings>(() => readVideoDepthSettings(node))
  const [derivedNodeId, setDerivedNodeId] = React.useState<string | null>(null)

  const derivedPhase = useGenerationCanvasStore((state) =>
    derivedNodeId ? state.nodes.find((candidate) => candidate.id === derivedNodeId)?.progress?.phase : undefined,
  )
  const derivedPercent = useGenerationCanvasStore((state) =>
    derivedNodeId ? state.nodes.find((candidate) => candidate.id === derivedNodeId)?.progress?.percent : undefined,
  )
  const downloading = derivedNodeId !== null && derivedPhase === videoDepthProgressPhase('downloading')

  // 权重下完（或这次运行没了）就收面板：接下来的每一段进度都在那张新卡上，
  // 面板再挂着只是挡住它。
  React.useEffect(() => {
    if (derivedNodeId === null || downloading) return
    setOpen(false)
    setDerivedNodeId(null)
  }, [derivedNodeId, downloading])

  const pendingBytes = videoDepthRequiredAssets(true, modeNeedsPose(settings.mode)).reduce(
    (total, asset) => total + asset.sizeBytes,
    0,
  )

  return (
    <>
      <span ref={anchorRef} className="inline-flex">
        <ToolbarButton
          icon={<IconShadow size={I.size} stroke={I.stroke} />}
          label={t('videoDepth.action.label')}
          title={t('videoDepth.action.hint')}
          accent={open}
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
        />
      </span>
      {open ? (
        // 下载途中不接管「点外面关闭」：那一刻按钮里正在跑进度，随手点一下就把它关掉
        // 会让人以为下载也一起没了。
        <AnchoredPopover anchorRef={anchorRef} align="center" gap={6} onClose={downloading ? undefined : () => setOpen(false)}>
          <VideoDepthActionPanel
            settings={settings}
            onSettingsChange={(changes) => setSettings((previous) => ({ ...previous, ...changes }))}
            advancedOpen={advancedOpen}
            onToggleAdvanced={() => setAdvancedOpen((value) => !value)}
            {...(downloading ? { download: { totalBytes: pendingBytes, percent: derivedPercent } } : {})}
            onStart={() => {
              const handle = startVideoDepthDerivation(node, settings)
              if (!handle) {
                setOpen(false)
                return
              }
              setDerivedNodeId(handle.derivedNodeId)
            }}
          />
        </AnchoredPopover>
      ) : null}
    </>
  )
}
