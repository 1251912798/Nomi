/**
 * [INPUT]: 依赖 ../model/directorPreviewState 的 readDirectorPreview / directorProduceState（唯一判据）、./directorPreviewCapture 的
 *          requestDirectorPreviewRender（唯一重渲写口）、./attachCameraMoveForNode 的 attachCameraMoveForNode（唯一挂接入口；「挂没挂好」由核按当前现状判，这里不再看网址标记早退）、
 *          ../model/directorShotSummaries、画布 store、../../../events/canvasGestureContext、../../nodeSizing
 * [OUTPUT]: 对外提供 prepareProduceFromPreview、DirectorProduceOutcome
 * [POS]: 导演视图主按钮「出成片」的执行那一半（设计卡 docs/plan/2026-10-16-director-3dbox-produce-design-card.md，协调 10-16 定选项 A）：
 *        **只做准备，不花钱**——预演是最新的就挂到视频镜头上（没有目标镜头就在导演节点右边建一个视频节点），填好提示词，
 *        交回调用方去画布选中它；花钱仍是用户在那个节点上点 ↑（现有的节点生成入口 + 主进程准入里的预演闸）。
 *        同 10-05「派生只准备不开跑」拍板：本文件没有任何提交 / 批准 / 派发调用（directorProduce.noMoneyDoor.test.ts 钉死）。
 *        预演过期（工程在预演之后被改过）或没出过 → 请求重渲，调用方等它好了再调一次。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import i18n from '../../../../../i18n'
import { withCanvasGestureContext } from '../../../events/canvasGestureContext'
import { isVideoLikeGenerationNodeKind } from '../../../model/generationNodeKinds'
import type { GenerationCanvasNode } from '../../../model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../../../store/generationCanvasStore'
import { resolveNodeVisualSize } from '../../nodeSizing'
import { DIRECTOR_PREVIEW_META_KEY } from '../model/directorNodeMeta'
import { directorProduceState, readDirectorPreview, type DirectorPreviewMeta } from '../model/directorPreviewState'
import { summarizeDirectorShots } from '../model/directorShotSummaries'
import type { DirectorProject } from '../model/directorTypes'
import { attachCameraMoveForNode } from './attachCameraMoveForNode'
import { requestDirectorPreviewRender } from './directorPreviewCapture'

/** 新建的视频节点离导演节点多远（与快捷派生同一个间距）。 */
const PRODUCE_NODE_GAP = 64

export type DirectorProduceOutcome =
  | Readonly<{ kind: 'blocked'; reason: 'missing' | 'empty' | 'too_long' }>
  /** 预演过期 / 没出过 / 正在渲染：已请求（或已在）渲染，好了再调一次。 */
  | Readonly<{ kind: 'rendering' }>
  | Readonly<{
      kind: 'prepared'
      videoNodeId: string
      /** 这次新建了视频节点（独立预演，或原目标镜头已被删）。 */
      created: boolean
      /** 挂法：参考视频 / 只能写进提示词（模型没有参考视频槽）/ 早就挂好了。 */
      attach: 'video_ref' | 'prompt_only' | 'kept'
      toast?: Readonly<{ message: string; level: 'warning' }>
    }>

const nodeOf = (id: string): GenerationCanvasNode | undefined => useGenerationCanvasStore.getState().nodes.find((node) => node.id === id)

/** `project` = 编辑器此刻的工程（调用方先把没落盘的手改落盘，节点上的与它一致）。 */
export function prepareProduceFromPreview(directorNodeId: string, project: DirectorProject): DirectorProduceOutcome {
  const director = nodeOf(directorNodeId)
  if (!director) return { kind: 'blocked', reason: 'missing' }
  const shots = summarizeDirectorShots(project)
  const preview = readDirectorPreview(director)
  const state = directorProduceState(preview, project, shots.length)
  if (state.kind === 'empty') return { kind: 'blocked', reason: 'empty' }
  if (state.kind === 'failed' && state.tooLong) return { kind: 'blocked', reason: 'too_long' }
  if (state.kind !== 'ready' || !preview?.videoUrl) {
    requestDirectorPreviewRender(directorNodeId)
    return { kind: 'rendering' }
  }

  // 新节点 + 预演改指向 + 挂接是一个撤销点：只有第一笔写入放行 undo barrier（同派生的做法）
  const txnId = `txn_director_produce_${Date.now()}`
  let barrierPushed = false
  const inTxn = <T,>(fn: () => T): T => {
    const suppressUndoBarriers = barrierPushed
    barrierPushed = true
    return withCanvasGestureContext({ source: 'user', txnId, suppressUndoBarriers }, fn)
  }

  const existing = preview.targetNodeId ? nodeOf(preview.targetNodeId) : undefined
  let target = existing && isVideoLikeGenerationNodeKind(existing.kind) ? existing : undefined
  const created = !target
  if (!target) {
    const size = resolveNodeVisualSize(director)
    const title = i18n.t('director.view.produceVideoTitle', { title: director.title || i18n.t('director.node.title') })
    target = inTxn(() => useGenerationCanvasStore.getState().addNode({
      kind: 'video',
      title,
      prompt: '',
      position: { x: director.position.x + size.width + PRODUCE_NODE_GAP, y: director.position.y },
      ...(director.categoryId ? { categoryId: director.categoryId } : {}),
      select: false,
    }))
    const next: DirectorPreviewMeta = { ...preview, targetNodeId: target.id, updatedAt: Date.now() }
    inTxn(() => useGenerationCanvasStore.getState().updateNode(directorNodeId, { meta: { ...(nodeOf(directorNodeId)?.meta ?? {}), [DIRECTOR_PREVIEW_META_KEY]: next } }))
  }

  const fresh = nodeOf(target.id) ?? target
  const cuts = shots.map((cut) => ({ start: cut.start, end: cut.end, shotSize: cut.shotSize, move: cut.move }))
  const outcome = attachCameraMoveForNode(fresh.id, preview.videoUrl, { kind: 'preview', cuts, notes: preview.notes ?? [] })
  if (outcome.kind !== 'patch') return { kind: 'prepared', videoNodeId: fresh.id, created, attach: 'kept', ...(outcome.toast ? { toast: outcome.toast } : {}) }
  inTxn(() => useGenerationCanvasStore.getState().updateNode(fresh.id, outcome.patch))
  const latest = readDirectorPreview(nodeOf(directorNodeId))
  if (latest) inTxn(() => useGenerationCanvasStore.getState().updateNode(directorNodeId, { meta: { ...(nodeOf(directorNodeId)?.meta ?? {}), [DIRECTOR_PREVIEW_META_KEY]: { ...latest, attach: outcome.mode } } }))
  return { kind: 'prepared', videoNodeId: fresh.id, created, attach: outcome.mode, ...(outcome.toast ? { toast: outcome.toast } : {}) }
}
