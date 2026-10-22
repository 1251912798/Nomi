// 参考图的唯一主人：一份有序列表 + 唯一落槽规则（referenceList.ts）。
import { describe, expect, it } from 'vitest'
import { resolveArchetypeForModel, type ArchetypeMode } from '../../../../../electron/shared/modelArchetypes'
import {
  FIRST_FRAME_EMPTY_KEY,
  firstFrameLeftEmpty,
  hasLegacyReferenceKeys,
  normalizeReferenceListMeta,
  placeUploadedImages,
  putInReferenceSlot,
  readReferenceList,
  referenceListPatch,
  removeFromReferenceList,
  swapInReferenceList,
  withReferenceList,
} from './referenceList'

const seedance = resolveArchetypeForModel({ modelKey: 'seedance-2', vendorKey: 'apimart', meta: {} } as never)!
const mode = (id: string): ArchetypeMode => seedance.modes.find((m) => m.id === id)!

describe('placeUploadedImages：列表按顺序落进当前方式收图的槽', () => {
  it('首尾帧：前两张落首帧、尾帧，其余未用到', () => {
    expect(placeUploadedImages(mode('firstlast'), ['a', 'b', 'c'])).toEqual({ bySlot: [['a'], ['b']], unused: ['c'] })
  })
  it('参考：截到上限，超出的未用到', () => {
    const omni = mode('omni')
    const cap = omni.slots.find((slot) => slot.kind === 'image_ref')!.max!
    const urls = Array.from({ length: cap + 2 }, (_, i) => `u${i}`)
    const placed = placeUploadedImages(omni, urls)
    expect(placed.unused).toEqual(urls.slice(cap))
    expect(placed.bySlot.flat()).toEqual(urls.slice(0, cap))
  })
  it('文生：全部未用到', () => {
    expect(placeUploadedImages(mode('t2v'), ['a', 'b']).unused).toEqual(['a', 'b'])
  })
  it('连线先占位：首帧被连线占了，上传的第一张落尾帧；和连线同一张的上传不重复算、也不算未用到', () => {
    const firstlast = mode('firstlast')
    const firstIndex = firstlast.slots.findIndex((slot) => slot.kind === 'first_frame')
    const countBySlot = firstlast.slots.map((_, index) => (index === firstIndex ? 1 : 0))
    expect(placeUploadedImages(firstlast, ['e', 'a', 'b'], { countBySlot, urls: new Set(['e']) })).toEqual({ bySlot: [[], ['a']], unused: ['b'] })
  })
  it('总数预算：超出的未用到', () => {
    expect(placeUploadedImages(mode('omni'), ['a', 'b', 'c'], undefined, { totalBudget: 1 }).unused).toEqual(['b', 'c'])
  })
  it('首帧特意空着：首帧槽不收，第一张落尾帧', () => {
    expect(placeUploadedImages(mode('firstlast'), ['a'], undefined, { firstFrameEmpty: true })).toEqual({ bySlot: [[], ['a']], unused: [] })
  })
})

describe('readReferenceList：旧数据归一，当前方式看得见的在前', () => {
  const legacy = { firstFrameUrl: 'F', lastFrameUrl: 'L', referenceImageUrls: ['u1', 'u2'] }
  it('首尾帧方式：首帧、尾帧在前', () => {
    expect(readReferenceList(legacy, mode('firstlast'))).toEqual(['F', 'L', 'u1', 'u2'])
  })
  it('参考方式：原来的参考在前，残留首尾帧排后面', () => {
    expect(readReferenceList(legacy, mode('omni'))).toEqual(['u1', 'u2', 'F', 'L'])
  })
  it('别名键（first_frame_url / referenceImageUrl / referenceImages）也读进来，去重', () => {
    expect(readReferenceList({ first_frame_url: 'F', referenceImageUrl: 'r', referenceImages: ['r', 's'] }, mode('firstlast'))).toEqual(['F', 'r', 's'])
  })
  it('规范形原样', () => {
    expect(readReferenceList({ referenceImageUrls: ['a', 'b'] }, mode('firstlast'))).toEqual(['a', 'b'])
    expect(hasLegacyReferenceKeys({ referenceImageUrls: ['a'] })).toBe(false)
  })
})

describe('写回规范形', () => {
  it('withReferenceList 删掉旧键和影子', () => {
    const next = withReferenceList({ firstFrameUrl: 'F', firstFrameRef: 'n1', lastFrameUrl_nodeRef: null, referenceImages: ['x'], other: 1 }, ['F'])
    expect(next).toEqual({ referenceImageUrls: ['F'], other: 1 })
  })
  it('normalizeReferenceListMeta：读口顺序 = 写回顺序；已是规范形返回 null', () => {
    const legacy = { firstFrameUrl: 'F', referenceImageUrls: ['u1'] }
    expect(normalizeReferenceListMeta(legacy, mode('omni'))?.referenceImageUrls).toEqual(readReferenceList(legacy, mode('omni')))
    expect(normalizeReferenceListMeta({ referenceImageUrls: ['a'] }, mode('omni'))).toBeNull()
  })
  it('旧数据只存了尾帧：落成「首帧特意空着」', () => {
    const legacy = { lastFrameUrl: 'L' }
    expect(firstFrameLeftEmpty(legacy)).toBe(true)
    expect(normalizeReferenceListMeta(legacy, mode('firstlast'))).toEqual({ referenceImageUrls: ['L'], [FIRST_FRAME_EMPTY_KEY]: true })
  })
  it('列表空了，开关一并清掉', () => {
    expect(withReferenceList({ [FIRST_FRAME_EMPTY_KEY]: true, referenceImageUrls: ['L'] }, [])).toEqual({ referenceImageUrls: [] })
  })
  it('referenceListPatch：合并式写入把旧键置 undefined', () => {
    const merged = { ...{ firstFrameUrl: 'old', lastFrameUrl: 'old2' }, ...referenceListPatch(['F']) }
    expect(readReferenceList(merged, mode('firstlast'))).toEqual(['F'])
  })
})

describe('写：放进某一格 / 删 / 对调', () => {
  it('格里已有上传图：原位换掉', () => {
    expect(putInReferenceSlot(['a', 'b', 'c'], [['a'], ['b']], 1, 'x')).toEqual(['a', 'x', 'c'])
  })
  it('格空着：插在前面几格已落的图之后', () => {
    expect(putInReferenceSlot(['a', 'c'], [['a'], []], 1, 'x')).toEqual(['a', 'x', 'c'])
  })
  it('同一张原来在列表别处：挪过来，不重复', () => {
    expect(putInReferenceSlot(['a', 'b', 'x'], [['a'], ['b']], 1, 'x')).toEqual(['a', 'x'])
  })
  it('删、对调', () => {
    expect(removeFromReferenceList(['a', 'b'], 'a')).toEqual(['b'])
    expect(swapInReferenceList(['a', 'b', 'c'], 'a', 'b')).toEqual(['b', 'a', 'c'])
  })
})
