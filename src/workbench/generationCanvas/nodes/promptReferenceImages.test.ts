import { expect, it } from 'vitest'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import type { NodeWriteAccess } from './nodeWriteAccess'
import { applyPromptReferenceImages } from './promptReferenceImages'
import { referenceDemandsBeforeFirstMode } from './controls/archetypeMeta'

const REF = 'data:image/jpeg;base64,AAAA'
const OTHER = 'https://example.test/second.png'

function card(meta: Record<string, unknown>): { access: NodeWriteAccess; read: () => GenerationCanvasNode } {
  let current = { id: 'card', kind: 'image', title: 'Image', position: { x: 0, y: 0 }, meta } as GenerationCanvasNode
  return {
    access: {
      latestNode: (nodeId) => (nodeId === current.id ? current : undefined),
      updateNode: (nodeId, patch) => { if (nodeId === current.id) current = { ...current, ...patch } as GenerationCanvasNode },
    },
    read: () => current,
  }
}

const onModel = (modelKey: string, vendor: string, modeId?: string) => ({
  modelKey, modelAlias: modelKey, modelVendor: vendor, vendor,
  ...(modeId ? { archetype: { id: modelKey, modeId } } : {}),
})

it('a card that has no model yet keeps the images in the image-reference slot (deduped) for the first mode choice', () => {
  const { access, read } = card({})
  expect(applyPromptReferenceImages('card', [REF, REF, OTHER], access)).toBe('placed')
  expect(read().meta?.referenceImageUrls).toEqual([REF, OTHER])
  expect(read().meta?.archetype).toBeUndefined()
  // 第一次定生成方式时这两张图算「要用参考」：要一个收得下图片的槽
  expect(referenceDemandsBeforeFirstMode(read().meta)).toEqual([{ slots: ['image_ref'], asset: 'image' }])
})

it('a card already on a model that also edits images is moved to that mode with the images in place', () => {
  const { access, read } = card(onModel('gpt-image-2', 'apimart', 't2i'))
  expect(applyPromptReferenceImages('card', [REF], access)).toBe('placed')
  expect((read().meta?.archetype as { modeId?: string }).modeId).toBe('i2i')
  expect(read().meta?.referenceImageUrls).toEqual([REF])
})

it('a model with no image reference in any mode reports unsupported and writes nothing', () => {
  const { access, read } = card(onModel('imagen-4', 'kie', 't2i'))
  expect(applyPromptReferenceImages('card', [REF], access)).toBe('unsupported')
  expect(read().meta?.referenceImageUrls).toBeUndefined()
})

it('no reference images is a no-op', () => {
  const { access, read } = card({})
  expect(applyPromptReferenceImages('card', ['', ''], access)).toBe('none')
  expect(read().meta).toEqual({})
})

it('leftover references on a card whose mode was already chosen are not intent (the user switched away)', () => {
  expect(referenceDemandsBeforeFirstMode({ ...onModel('gpt-image-2', 'apimart', 't2i'), referenceImageUrls: [REF] })).toEqual([])
  expect(referenceDemandsBeforeFirstMode({ referenceVideoUrls: ['v.mp4'], referenceImageUrls: [] })).toEqual([{ slots: ['video_ref'], asset: 'video' }])
})
