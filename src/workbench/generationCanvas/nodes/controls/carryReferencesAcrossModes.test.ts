import { describe, expect, it } from 'vitest'
import { resolveArchetypeForModel } from '../../../../../electron/shared/modelArchetypes'
import { carryUploadedImagesAcrossModes } from './carryReferencesAcrossModes'

const spec = resolveArchetypeForModel({ modelKey: 'seedance-2', vendorKey: 'apimart', meta: {} } as never)!
const mode = (id: string) => spec.modes.find((m) => m.id === id)!

describe('切方式时上传的图跟着走', () => {
  it('3 张参考切到首尾帧：前两张落首帧 / 尾帧，第 3 张留在参考里', () => {
    const patch = carryUploadedImagesAcrossModes({ referenceImageUrls: ['a', 'b', 'c'] }, mode('omni'), mode('firstlast'))
    expect(patch).toMatchObject({ referenceImageUrls: ['c'], firstFrameUrl: 'a', lastFrameUrl: 'b' })
  })

  it('首尾帧切回参考：两张进参考，帧清空', () => {
    const patch = carryUploadedImagesAcrossModes({ firstFrameUrl: 'a', lastFrameUrl: 'b' }, mode('firstlast'), mode('omni'))
    expect(patch).toMatchObject({ referenceImageUrls: ['a', 'b'], firstFrameUrl: null, lastFrameUrl: null })
  })

  it('目标方式里已经放了图就不覆盖', () => {
    expect(carryUploadedImagesAcrossModes({ referenceImageUrls: ['a'], firstFrameUrl: 'x' }, mode('omni'), mode('firstlast'))).toBeNull()
    expect(carryUploadedImagesAcrossModes({ referenceImageUrls: ['z'], firstFrameUrl: 'a' }, mode('firstlast'), mode('omni'))).toBeNull()
  })

  it('没有图可搬 / 同类方式之间不动', () => {
    expect(carryUploadedImagesAcrossModes({}, mode('omni'), mode('firstlast'))).toBeNull()
    expect(carryUploadedImagesAcrossModes({ referenceImageUrls: ['a'] }, mode('omni'), mode('t2v'))).toBeNull()
  })
})
