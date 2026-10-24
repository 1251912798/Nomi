/**
 * [INPUT]: 依赖 ../model/directorPreviewState、../model/programCamera 的 programCameraIdAt、../model/timeGrid 的 sceneContentEndSeconds、
 *          ../model/directorShotSummaries、../model/directorProject、./cameraMoveSchedule 的 frameTimes、./attachCameraMoveForNode 的 attachCameraMoveForNode、
 *          画布 store、../../../events/canvasGestureContext
 * [OUTPUT]: 对外提供 previewCapturePlan（整段预演的采帧计划，带渲染源工程指纹）、applyPreviewCaptured（挂到视频节点 + 写回 ready）、markPreviewFailed、
 *           requestDirectorPreviewRender（请求重渲：节点卡「重试」与导演视图「出成片」共用的唯一写口）、
 *           previewAttemptTimeoutMs
 * [POS]: 3D-BOX 预演出片的纯逻辑那一半（常驻 CameraMoveCaptureHost 的预演请求调它；React / 计时器 / 落盘留在 Host）。
 *        按时刻取节目机位（programCameraIdAt）、等动作片段就绪；挂接只走唯一入口 attachCameraMoveForNode。
 *        Host 事后的写入沿用写下这次预演的那笔提议的事务身份（txn_<proposalId>）：撤销 stage_shot 时它们算同一笔改动，
 *        不算「别人的后续改动」。修订号对不上（预演渲染期间计划又被改了）= 迟到结果，整份丢弃。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { GenerationCanvasNode } from '../../../model/generationCanvasTypes'
import { withCanvasGestureContext } from '../../../events/canvasGestureContext'
import { useGenerationCanvasStore } from '../../../store/generationCanvasStore'
import { DIRECTOR_PREVIEW_META_KEY, DIRECTOR_PROJECT_META_KEY } from '../model/directorNodeMeta'
import { DIRECTOR_PREVIEW_FPS, DIRECTOR_PREVIEW_MAX_SECONDS, directorPreviewSourceFingerprint, directorProjectTooLong, readDirectorPlanMeta, readDirectorPreview, type DirectorPreviewMeta } from '../model/directorPreviewState'
import { normalizeDirectorProject } from '../model/directorProject'
import { summarizeDirectorShots } from '../model/directorShotSummaries'
import type { DirectorProject } from '../model/directorTypes'
import { programCameraIdAt } from '../model/programCamera'
import { sceneContentEndSeconds } from '../model/timeGrid'
import { attachCameraMoveForNode } from './attachCameraMoveForNode'
import { frameTimes } from './cameraMoveSchedule'
import { DIRECTOR_PREVIEW_DISMISSED_URL_KEY } from './directorPreviewReferenceLifecycle'

const MAX_PREVIEW_FRAMES = DIRECTOR_PREVIEW_FPS * DIRECTOR_PREVIEW_MAX_SECONDS

export type PreviewCapturePlan = Readonly<{
  project: DirectorProject
  fps: number
  times: number[]
  cameraIdAt: (time: number) => string | null
  revision: string
  /** 采帧用的这份工程的指纹：写回 ready 时记进预演，之后工程被改过就判过期（出片前先重渲）。 */
  sourceFingerprint: string
}>

/** 整段预演：0 → 内容末，24fps，最后一帧落在末尾前一帧（镜头片段在末尾是开区间，取到末尾会是黑帧）。 */
export function previewCapturePlan(node: Pick<GenerationCanvasNode, 'meta'>): PreviewCapturePlan | null {
  const preview = readDirectorPreview(node)
  if (!preview || preview.status !== 'rendering') return null
  const project = normalizeDirectorProject(node.meta?.[DIRECTOR_PROJECT_META_KEY])
  const scene = project.scenes.find((item) => item.id === project.activeSceneId) ?? project.scenes[0]
  if (!scene) return null
  const fps = DIRECTOR_PREVIEW_FPS
  const duration = Math.max(1 / fps, sceneContentEndSeconds(scene))
  const frameCount = Math.min(MAX_PREVIEW_FRAMES, Math.max(2, Math.round(duration * fps)))
  const times = frameTimes(0, Math.max(0, duration - 1 / fps), frameCount)
  return {
    project, fps, times, revision: preview.revision, sourceFingerprint: directorPreviewSourceFingerprint(project),
    cameraIdAt: (time) => programCameraIdAt(time, scene.cameras, scene.timelineTrackOrder),
  }
}

/** 单次尝试的看门狗：随帧数放宽（每帧 seek + 两帧沉降 + 角色 GLB 首次落地），短片沿用 30 秒。 */
export function previewAttemptTimeoutMs(frameCount: number): number {
  return Math.max(30_000, 20_000 + frameCount * 200)
}

function sameRevision(nodeId: string, revision: string): GenerationCanvasNode | null {
  const node = useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId)
  const preview = readDirectorPreview(node)
  return node && preview?.status === 'rendering' && preview.revision === revision ? node : null
}

function inProposal<T>(preview: DirectorPreviewMeta, fn: () => T): T {
  return preview.proposalId
    ? withCanvasGestureContext({ source: 'runtime', txnId: `txn_${preview.proposalId}`, proposalId: preview.proposalId, suppressUndoBarriers: true }, fn)
    : fn()
}

/**
 * 预演 mp4 已落盘 → 挂到它的视频节点（唯一挂接核心）→ 导演节点预演写回 ready（含挂法：参考视频 / 只写进提示词）。
 * 返回挂接给出的提示（模型不接参考视频时那句「精度会低」由调用方 toast）。修订已变 = 丢弃，返回 null。
 */
export function applyPreviewCaptured(nodeId: string, revision: string, videoUrl: string, assetId: string | undefined, output: Readonly<{ id: string; name: string; width: number; height: number; duration: number; createdAt: number }>, sourceFingerprint: string):
  { toast?: { message: string; level: 'warning' } } | null {
  const node = sameRevision(nodeId, revision)
  if (!node) return null
  const preview = readDirectorPreview(node)!
  const project = normalizeDirectorProject(node.meta?.[DIRECTOR_PROJECT_META_KEY])
  const cuts = summarizeDirectorShots(project).map((cut) => ({ start: cut.start, end: cut.end, shotSize: cut.shotSize, move: cut.move }))
  const target = preview.targetNodeId
    ? useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === preview.targetNodeId)
    : undefined
  // 用户显式删掉旧预演后，重渲出的新 URL 只是新的、尚未挂接的产物；只有导演台「出成片」这条显式入口才恢复挂接。
  const dismissed = target?.meta?.[DIRECTOR_PREVIEW_DISMISSED_URL_KEY]
  const outcome = typeof dismissed === 'string' && dismissed.trim()
    ? { kind: 'noop' as const }
    : attachCameraMoveForNode(preview.targetNodeId, videoUrl, { kind: 'preview', cuts, notes: preview.notes ?? [] })
  return inProposal(preview, () => {
    if (outcome.kind === 'patch' && preview.targetNodeId) useGenerationCanvasStore.getState().updateNode(preview.targetNodeId, outcome.patch)
    const fresh = useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId)
    const freshProject = normalizeDirectorProject(fresh?.meta?.[DIRECTOR_PROJECT_META_KEY] ?? project)
    const next: DirectorPreviewMeta = {
      ...preview,
      status: 'ready',
      videoUrl,
      ...(assetId ? { assetId } : {}),
      durationSeconds: output.duration,
      ...(outcome.kind === 'patch' ? { attach: outcome.mode } : {}),
      sourceFingerprint,
      updatedAt: Date.now(),
    }
    useGenerationCanvasStore.getState().updateNode(nodeId, {
      meta: {
        ...(fresh?.meta ?? node.meta ?? {}),
        [DIRECTOR_PREVIEW_META_KEY]: next,
        [DIRECTOR_PROJECT_META_KEY]: { ...freshProject, outputs: { ...freshProject.outputs, videos: [{ ...output, assetUrl: videoUrl }, ...freshProject.outputs.videos] } },
      },
    })
    return outcome.toast ? { toast: outcome.toast } : {}
  })
}

/** 重试用尽：预演判失败（节点卡上「预演失败 · 重试」），这一镜的生成继续被挡着，不放行无参考的生成。 */
export function markPreviewFailed(nodeId: string, revision: string): void {
  const node = sameRevision(nodeId, revision)
  if (!node) return
  const preview = readDirectorPreview(node)!
  inProposal(preview, () => useGenerationCanvasStore.getState().updateNode(nodeId, {
    meta: { ...(node.meta ?? {}), [DIRECTOR_PREVIEW_META_KEY]: { ...preview, status: 'failed', reason: 'capture_failed', updatedAt: Date.now() } },
  }))
}

/**
 * 请求（重新）渲染这个导演节点的预演：把它标成「渲染中」，常驻 Host 扫到即按节点上此刻的工程重渲。
 * 节点卡的「重试」与导演视图「出成片」（预演过期 / 没出过）共用这一个写口。当前工程超长：不渲（要改短）；已在渲染中 = 什么都不写。
 * 没有 3D-BOX 计划的工程（手搭的）也能出预演：修订号用工程指纹，迟到结果照样按它丢弃。返回是否已在渲染中。
 */
export function requestDirectorPreviewRender(nodeId: string): boolean {
  const node = useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return false
  const preview = readDirectorPreview(node)
  if (preview?.status === 'rendering') return true
  // 坏掉的记录读不出 preview，但它写的目标镜头要留着：重渲后仍挂回原镜头
  const salvagedTarget = preview ? undefined : (node.meta?.[DIRECTOR_PREVIEW_META_KEY] as { targetNodeId?: unknown } | undefined)?.targetNodeId
  // 超长按当前工程判（改短了就能重渲；拉长了就不渲——离屏录制只有 10 秒，硬渲会把整段压进 10 秒）。
  // 不改写节点上的预演：已挂好的那份照旧留着，花钱闸与「出成片」按当前工程判超长挡住。
  if (directorProjectTooLong(node.meta?.[DIRECTOR_PROJECT_META_KEY])) return false
  const revision = preview?.revision ?? readDirectorPlanMeta(node)?.revision ?? `manual:${directorPreviewSourceFingerprint(node.meta?.[DIRECTOR_PROJECT_META_KEY])}`
  const next: DirectorPreviewMeta = {
    status: 'rendering',
    revision,
    ...(preview?.targetNodeId ? { targetNodeId: preview.targetNodeId } : typeof salvagedTarget === 'string' ? { targetNodeId: salvagedTarget } : {}),
    ...(preview?.proposalId ? { proposalId: preview.proposalId } : {}),
    ...(preview?.notes ? { notes: preview.notes } : {}),
    updatedAt: Date.now(),
  }
  useGenerationCanvasStore.getState().updateNode(nodeId, { meta: { ...(node.meta ?? {}), [DIRECTOR_PREVIEW_META_KEY]: next } })
  return true
}
