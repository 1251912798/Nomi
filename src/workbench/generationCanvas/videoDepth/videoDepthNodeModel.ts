/**
 * 深度视频 —— 参数与进度的纯模型层（无 React、无 store、无 IPC）。
 *
 * 界面要回答两个问题，两个都是纯函数能答的：这个节点身上记着什么参数、
 * 这次运行该在节点上显示成什么样。放在这里而不是组件里，是为了让它们能被单测钉住——
 * 界面本身只剩「把答案画出来」。
 *
 * 「画布上有哪些视频能当源」这个问题在 2026-09-07 改形态后**消失了**：深度提取从
 * 独立节点变成视频节点上的一个动作，源就是用户选中的那一个，不再需要挑。
 * 对应的 `collectVideoDepthSourceCandidates` 同 commit 删掉（P1），
 * 「这个节点能不能当源」搬去了 videoDepthDerivation.ts；
 * 「进度 phase 怎么拼」搬去了 videoDepthProgressPhase.ts（那条环的说明见该文件）。
 */
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { parseVideoDepthSettings, type VideoDepthSettings } from '../../../../electron/shared/canvas/videoDepth'
import type { VideoDepthPhase, VideoDepthRunState } from '../../../../electron/shared/canvas/videoDepthRun'

/** meta 里存参数的那把钥匙。只有这一处知道它叫什么。 */
export const VIDEO_DEPTH_META_KEY = 'videoDepth'

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

/**
 * 这次运行在节点上显示成什么样。百分比缺失时返回 undefined——**不画一根假的进度条**。
 *
 * 只留 phase / percent / etaSeconds 三样：改形态后节点上报的是「阶段名 · 预计还要 m:ss」
 * 加一根确定进度条，逐帧/逐字节的分子分母没有消费方了（独立节点那一版把它们摊在卡里）。
 * 留着算而没人读 = 下一个人会以为界面上某处在显示它们（P1）。
 */
export type VideoDepthProgressView = {
  phase: VideoDepthPhase
  percent?: number
  etaSeconds?: number
}

export function videoDepthProgressView(state: VideoDepthRunState): VideoDepthProgressView {
  const progress = state.progress
  if (!progress) return { phase: state.phase }
  if (progress.kind === 'bytes') {
    return {
      phase: state.phase,
      percent: progress.totalBytes > 0 ? Math.round((progress.doneBytes / progress.totalBytes) * 100) : undefined,
    }
  }
  return {
    phase: state.phase,
    percent: progress.totalFrames > 0 ? Math.round((progress.doneFrames / progress.totalFrames) * 100) : undefined,
    etaSeconds: progress.etaSeconds ?? undefined,
  }
}

/** 这些阶段里节点正在忙——界面据此禁用参数、显示取消。 */
export function isVideoDepthBusy(phase: VideoDepthPhase): boolean {
  return phase === 'downloading' || phase === 'extracting' || phase === 'warming' || phase === 'processing' || phase === 'encoding'
}

/** 秒数格式化成 `m:ss`，给「预计还要多久」用。 */
export function formatVideoDepthEta(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safe / 60)
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`
}
