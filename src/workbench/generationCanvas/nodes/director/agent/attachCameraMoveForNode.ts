/**
 * [INPUT]: 依赖 ./attachCameraMoveToTarget 的 computeAttachCameraMove（唯一挂接核）、../../../runner/generationReferenceResolver 的 resolveGenerationReferences
 *          （画布连线解析参考，与提交前同一个函数）、画布 store
 * [OUTPUT]: 对外提供 attachCameraMoveForNode
 * [POS]: 预演 / 运镜小片挂到视频镜头的**唯一入口**：出成片（directorProduce）、预演写回（directorPreviewCapture）、运镜小片 Host（CameraMoveCaptureHost）都只调它。
 *        它读此刻画布上目标镜头与连到它的视频边（连线排在上传之前，决定预演在实际发送列表里排第几），再交给纯核判断；本身不写 store，
 *        outcome 由调用方按各自的事务身份写入。生产代码直接调核 = attachDoors.guard.test.ts 红。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { CameraMove } from '../../../../../../electron/shared/director/vocab'
import { resolveGenerationReferences } from '../../../runner/generationReferenceResolver'
import { useGenerationCanvasStore } from '../../../store/generationCanvasStore'
import { computeAttachCameraMove, type AttachCameraMoveOutcome, type AttachPreviewDirective } from './attachCameraMoveToTarget'

export function attachCameraMoveForNode(
  targetNodeId: string | undefined,
  mp4Url: string,
  directive: CameraMove | undefined | AttachPreviewDirective,
): AttachCameraMoveOutcome {
  const { nodes, edges } = useGenerationCanvasStore.getState()
  const target = targetNodeId ? nodes.find((node) => node.id === targetNodeId) : undefined
  if (!target) return { kind: 'noop' }
  const edgeVideoUrls = resolveGenerationReferences(target, { nodes, edges }).referenceVideos
  return computeAttachCameraMove(target, mp4Url, directive, { edgeVideoUrls })
}
