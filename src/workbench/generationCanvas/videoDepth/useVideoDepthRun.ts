/**
 * 深度视频节点 —— 把一次运行接到画布上（React 侧唯一的接线处）。
 *
 * 编排本身在 `videoDepthClient.ts`（纯注入、可单测）。这里只做三件 React 才做得到的事：
 * 拿桥、把运行状态镜到画布 store（进度条/状态徽标/产物）、以及在组件卸载时把还在跑的任务收掉。
 *
 * 为什么运行状态住在组件本地而不是 store：它是**运行态**，不该进 undo、不该进项目快照
 * （R23：画布文档是唯一持久真相源）。进 store 的只有现有的三样——progress / status / result，
 * 走既有的 `setNodeProgress` / `setNodeStatus` / `addNodeResult` 边界，本节点不新增节点字段。
 */
import React from 'react'
import { getDesktopBridge } from '../../../desktop/bridge'
import type { DesktopBridge } from '../../../desktop/bridge'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { getActiveWorkbenchProjectId } from '../../project/workbenchProjectSession'
import {
  initialVideoDepthRunState,
  nextVideoDepthRunState,
  type VideoDepthRunState,
} from '../../../../electron/shared/canvas/videoDepthRun'
import type { VideoDepthSettings, VideoDepthSourceReference } from '../../../../electron/shared/canvas/videoDepth'
import { createVideoDepthWorkerChannel, runVideoDepth } from './videoDepthClient'
import { isVideoDepthBusy } from './videoDepthNodeModel'

export type VideoDepthRunHandle = {
  state: VideoDepthRunState
  busy: boolean
  /** 桌面桥不在（浏览器预览 / 测试壳）时为 false——按钮据此禁用并说明原因，不假装能跑。 */
  available: boolean
  start: (settings: VideoDepthSettings, source: VideoDepthSourceReference) => void
  cancel: () => void
}

/**
 * 桥的类型取 `DesktopBridge['videoDepth']`（含 `onEvent`），不取编排层那份 `VideoDepthBridge`——
 * 后者刻意只描述编排真正会调的五个方法，好让单测喂一个假桥；进度事件不属于编排，属于这里。
 * 两者结构兼容，所以传下去不需要转换。
 */
function resolveBridge(): DesktopBridge['videoDepth'] | null {
  return getDesktopBridge()?.videoDepth ?? null
}

export function useVideoDepthRun(nodeId: string): VideoDepthRunHandle {
  const setNodeProgress = useGenerationCanvasStore((state) => state.setNodeProgress)
  const setNodeStatus = useGenerationCanvasStore((state) => state.setNodeStatus)
  const addNodeResult = useGenerationCanvasStore((state) => state.addNodeResult)

  const [state, setState] = React.useState<VideoDepthRunState>(() => initialVideoDepthRunState(''))
  const cancelRef = React.useRef(false)
  const runningRef = React.useRef(false)
  const bridge = React.useMemo(resolveBridge, [])

  /**
   * prepare 期间（下载权重 / 抽帧）渲染层什么都看不见，那两段进度只有主进程知道，
   * 所以它们从事件通道来，走**同一个** reducer 汇进同一份状态——不是第二份进度模型。
   */
  React.useEffect(() => {
    if (!bridge) return undefined
    return bridge.onEvent((event) => {
      if (event.nodeId !== nodeId) return
      setState((prev) => {
        const entered = prev.phase === event.phase ? prev : nextVideoDepthRunState(prev, { kind: 'enter', phase: event.phase })
        if (event.phase !== 'downloading' || event.doneBytes === undefined || event.totalBytes === undefined) return entered
        return nextVideoDepthRunState(entered, { kind: 'bytes', doneBytes: event.doneBytes, totalBytes: event.totalBytes })
      })
    })
  }, [bridge, nodeId])

  // 运行态镜到画布：进度/状态/产物各走各自既有的边界，本节点不新增节点字段。
  React.useEffect(() => {
    if (isVideoDepthBusy(state.phase)) {
      const percent =
        state.progress?.kind === 'frames' && state.progress.totalFrames > 0
          ? Math.round((state.progress.doneFrames / state.progress.totalFrames) * 100)
          : state.progress?.kind === 'bytes' && state.progress.totalBytes > 0
            ? Math.round((state.progress.doneBytes / state.progress.totalBytes) * 100)
            : undefined
      setNodeProgress(nodeId, { phase: `video-depth-${state.phase}`, percent, updatedAt: Date.now() })
      return
    }
    if (state.phase === 'failed') {
      setNodeProgress(nodeId, undefined)
      setNodeStatus(nodeId, 'error', state.error?.message)
      return
    }
    if (state.phase === 'cancelled') {
      setNodeProgress(nodeId, undefined)
      setNodeStatus(nodeId, 'idle')
    }
  }, [nodeId, setNodeProgress, setNodeStatus, state])

  const cancel = React.useCallback(() => {
    cancelRef.current = true
  }, [])

  const start = React.useCallback(
    (settings: VideoDepthSettings, source: VideoDepthSourceReference) => {
      const projectId = getActiveWorkbenchProjectId()
      if (!bridge || !projectId || runningRef.current) return
      runningRef.current = true
      cancelRef.current = false
      setState(initialVideoDepthRunState(''))
      void runVideoDepth(
        { projectId, nodeId, sourceUrl: source.sourceUrl, settings },
        {
          bridge,
          createWorker: createVideoDepthWorkerChannel,
          onState: setState,
          shouldCancel: () => cancelRef.current,
        },
      )
        .then((finalState) => {
          if (finalState.phase !== 'done' || !finalState.result) return
          addNodeResult(nodeId, {
            id: `video-depth-${Date.now()}`,
            type: 'video',
            url: finalState.result.url,
            assetId: finalState.result.assetId,
            createdAt: Date.now(),
          })
        })
        .finally(() => {
          runningRef.current = false
        })
    },
    [addNodeResult, bridge, nodeId],
  )

  // 卸载（删节点 / 关项目）时把还在跑的任务停掉：不然 ffmpeg 与临时帧目录会活过这张卡片。
  React.useEffect(
    () => () => {
      cancelRef.current = true
    },
    [],
  )

  return { state, busy: isVideoDepthBusy(state.phase), available: bridge !== null, start, cancel }
}
