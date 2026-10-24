/**
 * [INPUT]: 依赖 ../../../store/generationCanvasStore、../model/directorPreviewState 的 readDirectorPreview、../model/directorProject / directorShotSummaries、./attachCameraMoveForNode
 * [OUTPUT]: 对外提供 startPreviewAttachReconciler
 * [POS]: 挂了预演的视频镜头，模型身份一变，就经唯一入口 attachCameraMoveForNode 走同一个核对账，参考行始终显示真实状态
 *        （用户直接点节点 ↑ 也带着预演，不必再点「出成片」）。只在供应商、模型键或档案身份变了时对账，不盯方式或参考列表：
 *        B3 系统收回文生、用户手动切方式或删参考都不会被自动加回；下一次出成片仍走既有挂接入口。
 *        由画布壳 GenerationCanvasReactFlow 挂载（出片 Host 只在渲染预演时才挂，靠不住）；花钱闸（directorPreviewSpendBlock）是它之外的第二道，对不上就挡。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useGenerationCanvasStore } from '../../../store/generationCanvasStore'
import { DIRECTOR_NODE_KIND, DIRECTOR_PREVIEW_META_KEY, DIRECTOR_PROJECT_META_KEY } from '../model/directorNodeMeta'
import { readDirectorPreview } from '../model/directorPreviewState'
import { normalizeDirectorProject } from '../model/directorProject'
import { summarizeDirectorShots } from '../model/directorShotSummaries'
import { attachCameraMoveForNode } from './attachCameraMoveForNode'
import { isDirectorPreviewDismissed } from './directorPreviewReferenceLifecycle'

type Toast = (message: string, level: 'warning') => void

/** 对账只认模型身份：供应商、模型键、档案 id；modeId / variantId 只影响方式或参数，不触发重挂。 */
export function previewAttachReconcileKey(meta: Record<string, unknown>): string {
  const archetype = meta.archetype && typeof meta.archetype === 'object'
    ? meta.archetype as Record<string, unknown>
    : undefined
  return JSON.stringify([meta.modelVendor ?? meta.vendor, meta.modelKey, archetype?.id])
}

export function startPreviewAttachReconciler(onToast?: Toast): () => void {
  const seen = new Map<string, string>()
  const run = (): void => {
    const state = useGenerationCanvasStore.getState()
    for (const director of state.nodes) {
      if (director.kind !== DIRECTOR_NODE_KIND) continue
      const preview = readDirectorPreview(director)
      if (!preview || preview.status !== 'ready' || !preview.videoUrl || !preview.targetNodeId) continue
      const target = state.nodes.find((node) => node.id === preview.targetNodeId)
      if (!target) continue
      if (isDirectorPreviewDismissed(target, preview.videoUrl)) continue
      const meta = target.meta ?? {}
      const key = previewAttachReconcileKey(meta)
      const slot = `${director.id}:${target.id}`
      const before = seen.get(slot)
      seen.set(slot, key)
      if (before === undefined || before === key) continue
      const project = normalizeDirectorProject(director.meta?.[DIRECTOR_PROJECT_META_KEY])
      const cuts = summarizeDirectorShots(project).map((cut) => ({ start: cut.start, end: cut.end, shotSize: cut.shotSize, move: cut.move }))
      const outcome = attachCameraMoveForNode(target.id, preview.videoUrl, { kind: 'preview', cuts, notes: preview.notes ?? [] })
      if (outcome.toast) onToast?.(outcome.toast.message, outcome.toast.level)
      if (outcome.kind !== 'patch') continue
      const store = useGenerationCanvasStore.getState()
      store.updateNode(target.id, outcome.patch)
      const latest = readDirectorPreview(store.nodes.find((node) => node.id === director.id))
      const current = store.nodes.find((node) => node.id === director.id)
      if (latest && current) store.updateNode(director.id, { meta: { ...(current.meta ?? {}), [DIRECTOR_PREVIEW_META_KEY]: { ...latest, attach: outcome.mode } } })
    }
  }
  run()
  return useGenerationCanvasStore.subscribe(run)
}
