// 在参数面板里把生成方式切到另一个带图的方式时，**上传 / 素材库放进来的图跟着走**（B3f：3 张参考切到首尾帧，
// 前两张落到首帧、尾帧，第三张留成「未用到」；反过来，首尾帧两张切到参考，变成参考里的两张）。
//
// 连线来的图不在这里：它们是边，边按「能吃它的槽」自己落槽（referenceSlots.assignEdgeToSlot），切方式后显示 / 发送天然一致。
// 这里只搬 meta 里的上传值——它们的家是各槽的存储键（referenceImageUrls / firstFrameUrl / lastFrameUrl），不会自己换家。
//
// 规矩：只在**目标方式的图片槽一张都没有**时才搬（不覆盖用户已经放好的）；搬 = 移走（不复制），否则用户在新方式里
// 删掉一张，旧家里那份会冒出来成「未用到」。纯函数，返回要合进 meta 的补丁；没东西可搬返回 null。
import type { ArchetypeMode } from '../../../../../electron/shared/modelArchetypes'
import { parameterReferenceMetaPatch } from '../../model/parameterReferenceSlots'
import { archetypeModeSlots, readArchetypeArray } from './archetypeMeta'

const REFERENCE_IMAGES_KEY = 'referenceImageUrls'

function hasSlot(mode: ArchetypeMode, kind: string): boolean {
  return mode.slots.some((slot) => slot.kind === kind)
}

function frameUrls(meta: Record<string, unknown>, mode: ArchetypeMode): string[] {
  return archetypeModeSlots(mode).flatMap((slot) => {
    const value = meta[slot.key]
    return typeof value === 'string' && value.trim() ? [value] : []
  })
}

export function carryUploadedImagesAcrossModes(
  meta: Record<string, unknown>,
  fromMode: ArchetypeMode,
  toMode: ArchetypeMode,
): Record<string, unknown> | null {
  const toFrames = archetypeModeSlots(toMode)
  const fromHasArray = hasSlot(fromMode, 'image_ref')
  const toHasArray = hasSlot(toMode, 'image_ref')
  // 参考（数组）→ 首尾帧：前两张落首帧 / 尾帧，其余留在数组里（切回参考还在）。
  if (fromHasArray && toFrames.length > 0 && !toHasArray) {
    if (frameUrls(meta, toMode).length > 0) return null
    const refs = readArchetypeArray(meta, REFERENCE_IMAGES_KEY)
    if (refs.length === 0) return null
    const moved = refs.slice(0, toFrames.length)
    const patch: Record<string, unknown> = { [REFERENCE_IMAGES_KEY]: refs.slice(moved.length) }
    moved.forEach((url, index) => Object.assign(patch, parameterReferenceMetaPatch(toFrames[index]!, toFrames, url)))
    return patch
  }
  // 首尾帧 → 参考（数组）：帧里的图依次进数组，帧清空。
  const fromFrames = archetypeModeSlots(fromMode)
  if (fromFrames.length > 0 && !fromHasArray && toHasArray) {
    if (readArchetypeArray(meta, REFERENCE_IMAGES_KEY).length > 0) return null
    const urls = frameUrls(meta, fromMode)
    if (urls.length === 0) return null
    const patch: Record<string, unknown> = { [REFERENCE_IMAGES_KEY]: urls }
    for (const slot of fromFrames) Object.assign(patch, parameterReferenceMetaPatch(slot, fromFrames, null))
    return patch
  }
  return null
}
