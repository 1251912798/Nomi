import { describe, expect, it } from 'vitest'
import { resolveArchetypeForModel, type ModelArchetype } from '../../../../../electron/shared/modelArchetypes'
import { applyArchetypeModeSwitch, readArchetypeArray } from './archetypeMeta'
import { reassignUploadedImages, uploadedImageUrls } from './reassignUploadedImages'

const spec = resolveArchetypeForModel({ modelKey: 'seedance-2', vendorKey: 'apimart', meta: {} } as never)!
const mode = (id: string, from: ModelArchetype = spec) => from.modes.find((m) => m.id === id)!

/** 真走一遍：改 modeId + 合上搬运补丁（和 handleModeSwitch 同一条写法）。 */
function switchTo(meta: Record<string, unknown>, modeId: string): Record<string, unknown> {
  const patch = reassignUploadedImages(meta, mode(modeId)).patch
  return applyArchetypeModeSwitch(patch ? { ...meta, ...patch } : meta, spec, modeId)
}

describe('切方式时上传的图跟着走', () => {
  it('3 张参考切到首尾帧：前两张落首帧 / 尾帧，第 3 张留在参考里（未用到）', () => {
    const meta = switchTo({ referenceImageUrls: ['a', 'b', 'c'] }, 'firstlast')
    expect(meta).toMatchObject({ referenceImageUrls: ['c'], firstFrameUrl: 'a', lastFrameUrl: 'b' })
  })

  it('首尾帧切回参考：两张进参考，帧清空', () => {
    const meta = switchTo({ firstFrameUrl: 'a', lastFrameUrl: 'b' }, 'omni')
    expect(meta).toMatchObject({ referenceImageUrls: ['a', 'b'], firstFrameUrl: null, lastFrameUrl: null })
  })

  it('往返不丢（验收阻断 1）：3 张参考 → 首尾帧 → 参考，三张都在、顺序不变', () => {
    const back = switchTo(switchTo({ referenceImageUrls: ['a', 'b', 'c'] }, 'firstlast'), 'omni')
    expect(readArchetypeArray(back, 'referenceImageUrls')).toEqual(['a', 'b', 'c'])
    expect(back).toMatchObject({ firstFrameUrl: null, lastFrameUrl: null })
  })

  it.each([1, 2, 3, 5, 9])('往返不丢：%i 张参考来回切三圈', (count) => {
    const urls = Array.from({ length: count }, (_, i) => `u${i}`)
    let meta: Record<string, unknown> = { referenceImageUrls: urls }
    for (let round = 0; round < 3; round += 1) meta = switchTo(switchTo(meta, 'firstlast'), 'omni')
    expect(readArchetypeArray(meta, 'referenceImageUrls')).toEqual(urls)
  })

  it('旧数据：参考数组和首尾帧同时存着，往返后一张不少（首尾帧排在数组前面）', () => {
    const meta = switchTo({ referenceImageUrls: ['z'], firstFrameUrl: 'a', lastFrameUrl: 'b' }, 'omni')
    expect(readArchetypeArray(meta, 'referenceImageUrls')).toEqual(['a', 'b', 'z'])
  })

  it('同一张图在两个家里只算一张（去重）', () => {
    expect(uploadedImageUrls({ referenceImageUrls: ['a', 'b'], firstFrameUrl: 'a' })).toEqual(['a', 'b'])
  })

  it('没有图可搬 / 目标方式没有图片槽（文生）不动', () => {
    expect(reassignUploadedImages({}, mode('omni')).patch).toBeNull()
    expect(reassignUploadedImages({ referenceImageUrls: ['a'] }, mode('t2v')).patch).toBeNull()
  })

  it('参考数组有上限：放不下的留在首 / 尾帧键里，不丢；连两个键都装满了才算丢（调用方给提示）', () => {
    const capped = resolveArchetypeForModel({ modelKey: 'veo-3.1', vendorKey: 'apimart', meta: {} } as never)
    if (!capped) return
    const reference = capped.modes.find((m) => m.slots.some((slot) => slot.kind === 'image_ref'))
    const cap = reference?.slots.find((slot) => slot.kind === 'image_ref')?.max
    if (!reference || cap === undefined) return
    const urls = Array.from({ length: cap + 3 }, (_, i) => `u${i}`)
    const result = reassignUploadedImages({ referenceImageUrls: urls }, reference)
    expect(result.patch?.referenceImageUrls).toEqual(urls.slice(0, cap))
    expect(result.dropped).toBe(1)
  })
})
