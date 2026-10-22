// 上传 / 素材库放进来的图，在「换方式」和「换模型」时跟着走——**一个函数，两处共用**（参考迁移的最早共享边界）。
//
// 这些图的家是各槽的存储键：首帧 / 尾帧 = firstFrameUrl / lastFrameUrl，参考数组 = referenceImageUrls。
// 它们不会自己换家，所以切到另一个方式时界面显示的（目标方式的槽）和存着的（旧家）会分开——发送路径只认当前方式的槽，
// 旧家里的图既不显示也不发出去（用户却在提示词里还看得到引用块）。这里把它们搬到目标方式的槽里。
//
// 不变量（往返不丢）：把「首帧、尾帧、参考数组」按这个顺序排成一条有序表，放进目标方式的槽；放不下的**留在另一个家**
// （首尾帧方式下多出来的留在数组里 =「未用到」；参考数组放不下的留在首 / 尾帧键里），再切回去又按同一条有序表排——
// 所以 参考 ↔ 首尾帧 来回切，一张不少、顺序不变。真放不下（比如两个键也装满了）的才算丢，调用方要给提示。
//
// 连线来的图不在这里：它们是边，边按「能吃它的槽」自己落槽（referenceSlots.assignEdgeToSlot），显示 / 发送天然一致。
// 纯函数，返回要合进 meta 的补丁；没东西可搬 / 这个方式没有图片槽返回 patch:null。
import type { ArchetypeMode } from '../../../../../electron/shared/modelArchetypes'
import { parameterReferenceMetaPatch } from '../../model/parameterReferenceSlots'
import { referenceDemandForRole, type ReferenceDemand } from '../../agent/referenceEdgeCapability'
import { archetypeModeSlots, frameUrlSlots, readArchetypeArray } from './archetypeMeta'

export const REFERENCE_IMAGES_KEY = 'referenceImageUrls'

/** 有序表：首帧、尾帧、参考数组（去重）。 */
export function uploadedImageUrls(meta: Record<string, unknown>): string[] {
  const frames = frameUrlSlots().flatMap((slot) => {
    const value = meta[slot.key]
    return typeof value === 'string' && value.trim() ? [value] : []
  })
  return [...new Set([...frames, ...readArchetypeArray(meta, REFERENCE_IMAGES_KEY)])]
}

/** 这些上传的图对目标档案提出的「要落的槽」：首 / 尾帧照名，数组里的每一张按通用参考（换模型时挑方式用）。 */
export function uploadedImageDemands(meta: Record<string, unknown>): ReferenceDemand[] {
  const frames = frameUrlSlots().flatMap((slot) => {
    const value = meta[slot.key]
    return typeof value === 'string' && value.trim() ? [referenceDemandForRole(slot.group, 'image')] : []
  })
  const refs = readArchetypeArray(meta, REFERENCE_IMAGES_KEY).map(() => referenceDemandForRole(undefined, 'image'))
  return [...frames, ...refs]
}

export type ReassignResult = { patch: Record<string, unknown> | null; dropped: number }

export function reassignUploadedImages(meta: Record<string, unknown>, toMode: ArchetypeMode): ReassignResult {
  const urls = uploadedImageUrls(meta)
  if (urls.length === 0) return { patch: null, dropped: 0 }
  const allFrames = frameUrlSlots()
  const toFrames = archetypeModeSlots(toMode)
  const arraySlot = toMode.slots.find((slot) => slot.kind === 'image_ref')
  const clearFrames = (): Record<string, unknown> => Object.assign({}, ...allFrames.map((slot) => parameterReferenceMetaPatch(slot, allFrames, null)))
  const setFrames = (slots: typeof allFrames, values: string[]): Record<string, unknown> =>
    Object.assign({}, ...values.map((url, index) => parameterReferenceMetaPatch(slots[index]!, allFrames, url)))

  // 目标是参考数组：有序表进数组（不超过槽上限），放不下的留在首 / 尾帧键里（切回首尾帧还在）。
  if (arraySlot && toFrames.length === 0) {
    const cap = arraySlot.max ?? Number.POSITIVE_INFINITY
    const inArray = urls.slice(0, cap)
    const rest = urls.slice(cap)
    return {
      patch: { [REFERENCE_IMAGES_KEY]: inArray, ...clearFrames(), ...setFrames(allFrames, rest.slice(0, allFrames.length)) },
      dropped: Math.max(0, rest.length - allFrames.length),
    }
  }
  // 目标是首 / 尾帧：有序表前几张落帧，其余留在数组里（「未用到」，切回参考还在）。
  if (toFrames.length > 0 && !arraySlot) {
    return {
      patch: { [REFERENCE_IMAGES_KEY]: urls.slice(toFrames.length), ...clearFrames(), ...setFrames(toFrames, urls.slice(0, toFrames.length)) },
      dropped: 0,
    }
  }
  return { patch: null, dropped: 0 }
}
