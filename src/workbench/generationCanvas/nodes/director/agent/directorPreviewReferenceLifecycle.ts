import type { GenerationCanvasNode } from '../../../model/generationCanvasTypes'
import { DIRECTOR_NODE_KIND, DIRECTOR_PREVIEW_META_KEY } from '../model/directorNodeMeta'

/** 记录用户显式删除的那一份预演 URL；它不是预演产物本身，也不替代 targetNodeId。 */
export const DIRECTOR_PREVIEW_DISMISSED_URL_KEY = 'directorPreviewDismissedUrl'

type PreviewRecord = { status?: unknown; targetNodeId?: unknown; videoUrl?: unknown; updatedAt?: unknown }

function previewOf(node: Pick<GenerationCanvasNode, 'meta'>): PreviewRecord | null {
  const raw = node.meta?.[DIRECTOR_PREVIEW_META_KEY]
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as PreviewRecord : null
}

function latestReadyPreviewForTarget(nodes: readonly Pick<GenerationCanvasNode, 'id' | 'kind' | 'meta'>[], targetNodeId: string): PreviewRecord | null {
  let latest: PreviewRecord | null = null
  for (const node of nodes) {
    if (node.kind !== DIRECTOR_NODE_KIND) continue
    const preview = previewOf(node)
    if (preview?.status !== 'ready' || preview.targetNodeId !== targetNodeId || typeof preview.videoUrl !== 'string' || !preview.videoUrl.trim()) continue
    if (!latest || Number(preview.updatedAt ?? 0) >= Number(latest.updatedAt ?? 0)) latest = preview
  }
  return latest
}

/**
 * 只有“当前挂着的预演 URL”才可被用户删除写成退出；用户自己的同 URL 参考不会命中。
 * attachedUrl 由挂接核的读口 lastAttachedCameraMoveUrl 给：网址标记只有核能读（本模块不反向 import 核，免得成环）。
 */
export function directorPreviewReferenceRemoval(nodes: readonly Pick<GenerationCanvasNode, 'id' | 'kind' | 'meta'>[], target: Pick<GenerationCanvasNode, 'id'>, url: string, attachedUrl: string): boolean {
  const preview = latestReadyPreviewForTarget(nodes, target.id)
  return Boolean(preview && preview.videoUrl === url && attachedUrl === url)
}

export function isDirectorPreviewDismissed(target: Pick<GenerationCanvasNode, 'meta'> | undefined, previewUrl: string | undefined): boolean {
  return Boolean(target && previewUrl && target.meta?.[DIRECTOR_PREVIEW_DISMISSED_URL_KEY] === previewUrl)
}

export function markDirectorPreviewDismissed(meta: Record<string, unknown>, url: string): Record<string, unknown> {
  return { ...meta, [DIRECTOR_PREVIEW_DISMISSED_URL_KEY]: url }
}

/** 显式挂接是恢复动作；它清掉旧 URL 的退出事实，不由对账器调用。 */
export function clearDirectorPreviewDismissed(meta: Record<string, unknown>): Record<string, unknown> {
  if (!(DIRECTOR_PREVIEW_DISMISSED_URL_KEY in meta)) return meta
  const next = { ...meta }
  delete next[DIRECTOR_PREVIEW_DISMISSED_URL_KEY]
  return next
}
