/**
 * 深度视频节点 —— 节点与画布之间的纯模型层（无 React、无 store、无 IPC）。
 *
 * 面板要回答三个问题，三个都是纯函数能答的：这张画布上有哪些视频能当源、
 * 这个节点当前的参数是什么、这次运行该在节点上显示成什么样。放在这里而不是组件里，
 * 是为了让它们能被单测钉住——面板本身只剩「把答案画出来」。
 */
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import {
  parseVideoDepthSettings,
  type VideoDepthSettings,
  type VideoDepthSourceReference,
} from '../../../../electron/shared/canvas/videoDepth'
import type { VideoDepthPhase, VideoDepthRunState } from '../../../../electron/shared/canvas/videoDepthRun'

/** 画布上一个可以当深度源的视频。 */
export type VideoDepthSourceCandidate = VideoDepthSourceReference & { sourceNodeId: string }

/** meta 里存参数的那把钥匙。只有这一处知道它叫什么。 */
export const VIDEO_DEPTH_META_KEY = 'videoDepth'

/**
 * 哪些节点能当源：**产物是一段视频**的任何节点。
 *
 * 判据是 `result.type === 'video'` 而不是 `kind`——生成出来的视频、导入的素材、
 * 甚至另一个深度节点的产物，对这条管线来说是同一件东西（一段本地可读的视频）。
 * 按 kind 过滤会漏掉将来任何新的产视频节点，而那正是「加了新节点却选不到」的来源。
 * 自己排除自己：一个节点拿自己的产物当源，第二次运行就会覆盖掉第一次的输入。
 */
export function collectVideoDepthSourceCandidates(
  nodes: readonly GenerationCanvasNode[],
  selfNodeId: string,
): VideoDepthSourceCandidate[] {
  const candidates: VideoDepthSourceCandidate[] = []
  for (const node of nodes) {
    if (node.id === selfNodeId) continue
    const result = node.result
    if (!result || result.type !== 'video' || !result.url) continue
    candidates.push({
      sourceNodeId: node.id,
      sourceUrl: result.url,
      title: node.title?.trim() || node.prompt?.trim().slice(0, 40) || result.id,
      durationSeconds: result.durationSeconds,
      sourceKind: node.kind === 'asset' ? 'canvas-asset-node' : 'canvas-video-node',
    })
  }
  return candidates
}

/**
 * 读这个节点的参数。**解析失败一律回到默认值**，不把半个设置画到界面上——
 * 但写回去的时候会带上完整的合法设置，所以一次编辑就把坏 meta 治好了。
 */
export function readVideoDepthSettings(node: Pick<GenerationCanvasNode, 'meta'>): VideoDepthSettings {
  const raw = (node.meta as Record<string, unknown> | undefined)?.[VIDEO_DEPTH_META_KEY]
  return parseVideoDepthSettings(raw) ?? (parseVideoDepthSettings({}) as VideoDepthSettings)
}

/** 参数编辑的唯一出口：合并 + 盖时间戳 + 包成 updateNode 能吃的 meta 补丁。 */
export function videoDepthSettingsPatch(
  node: Pick<GenerationCanvasNode, 'meta'>,
  changes: Partial<VideoDepthSettings>,
  now: () => number = Date.now,
): { meta: Record<string, unknown> } {
  const next: VideoDepthSettings = {
    ...readVideoDepthSettings(node),
    ...changes,
    updatedAt: new Date(now()).toISOString(),
  }
  return { meta: { ...(node.meta as Record<string, unknown> | undefined), [VIDEO_DEPTH_META_KEY]: next } }
}

/** 这次运行在节点上显示成什么样。百分比缺失时返回 undefined——不画一根假的进度条。 */
export type VideoDepthProgressView = {
  phase: VideoDepthPhase
  percent?: number
  /** 已完成/总数，供文案填数字；下载阶段是字节，处理阶段是帧。 */
  done?: number
  total?: number
  etaSeconds?: number
}

export function videoDepthProgressView(state: VideoDepthRunState): VideoDepthProgressView {
  const progress = state.progress
  if (!progress) return { phase: state.phase }
  if (progress.kind === 'bytes') {
    return {
      phase: state.phase,
      percent: progress.totalBytes > 0 ? Math.round((progress.doneBytes / progress.totalBytes) * 100) : undefined,
      done: progress.doneBytes,
      total: progress.totalBytes,
    }
  }
  return {
    phase: state.phase,
    percent: progress.totalFrames > 0 ? Math.round((progress.doneFrames / progress.totalFrames) * 100) : undefined,
    done: progress.doneFrames,
    total: progress.totalFrames,
    etaSeconds: progress.etaSeconds ?? undefined,
  }
}

/** 这些阶段里节点正在忙——面板据此禁用参数、显示取消。 */
export function isVideoDepthBusy(phase: VideoDepthPhase): boolean {
  return phase === 'downloading' || phase === 'extracting' || phase === 'warming' || phase === 'processing' || phase === 'encoding'
}

/** 秒数格式化成 `m:ss`，给「预计还要多久」用。 */
export function formatVideoDepthEta(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safe / 60)
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`
}
