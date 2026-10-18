import { describe, expect, it } from 'vitest'
import { captureSceneTransforms, restoreSceneTransforms } from './whiteboardCanvasTypes'
import { createDefaultWhiteboardState, createImageAssetForCanvas, readWhiteboardState, serializeWhiteboardState } from './whiteboardState'
import { getCanvasObjectRenderBounds, getSelectableCanvasObjectsInBounds, getTopmostEditableCanvasObjectAtPoint } from './whiteboardCanvasGeometry'
import { deleteTargetFromState, groupTargetsIntoLayer } from './whiteboardStateOps'
import type { CanvasText } from './lib/canvas'

const text: CanvasText = { id: 'caption', layerId: 'drawing-layer-1', text: 'Move the subject left', x: 20, y: 30, width: 240, height: 48, fontSize: 28, color: '#111827' }

describe('shared whiteboard document boundary', () => {
  it('persists text, exact board bounds, and all transform populations through save/reopen', () => {
    const state = createDefaultWhiteboardState()
    state.texts = [text]
    state.canvasDimensions = { width: 1350, height: 720 }
    state.sceneTransforms = { offsets: { 'text:caption': { x: 43, y: -4 }, 'stroke:line': { x: 10, y: 5 }, 'group:pair': { x: 8, y: 8 } }, assetTransforms: { image: { x: 300, y: 50, width: 200, height: 150 } }, flips: { 'asset:image': { x: true, y: false }, 'text:caption': { x: false, y: true } } }
    const saved = serializeWhiteboardState(state)
    const reopened = readWhiteboardState({ meta: { whiteboardState: JSON.parse(JSON.stringify(saved)) } })!
    expect(reopened).toEqual(saved)
    saved.texts![0].text = 'Changed'
    saved.sceneTransforms!.offsets['text:caption'].x = 0
    expect(state.texts[0].text).toBe(text.text)
    expect(state.sceneTransforms.offsets['text:caption'].x).toBe(43)
  })

  it('restores detached mutable engine maps and captures detached serializable values', () => {
    const state = createDefaultWhiteboardState()
    state.sceneTransforms!.offsets['asset:one'] = { x: 1, y: 2 }
    const maps = restoreSceneTransforms(state.sceneTransforms)
    maps.offsets.get('asset:one')!.x = 30
    const captured = captureSceneTransforms(maps.offsets, maps.assetTransforms, maps.flips)
    maps.offsets.get('asset:one')!.x = 40
    expect(state.sceneTransforms!.offsets['asset:one'].x).toBe(1)
    expect(captured.offsets['asset:one'].x).toBe(30)
  })

  it('legacy documents receive empty editable text and transforms without rewriting existing media', () => {
    const state = createDefaultWhiteboardState('4:3')
    delete state.texts
    delete state.sceneTransforms
    delete state.canvasDimensions
    const reopened = readWhiteboardState({ meta: { whiteboardState: state } })!
    expect(reopened.texts).toEqual([])
    expect(reopened.sceneTransforms).toEqual({ offsets: {}, assetTransforms: {}, flips: {} })
    expect(reopened.canvasDimensions).toEqual({ width: 1280, height: 960 })
  })

  it('regrouping an already moved and flipped group keeps child world positions across reopen', () => {
    const state = createDefaultWhiteboardState()
    state.texts = [text, { ...text, id: 'second', x: 400 }, { ...text, id: 'third', x: 800 }]
    const first = groupTargetsIntoLayer(state, [{ kind: 'text', id: 'caption' }, { kind: 'text', id: 'second' }])
    first.sceneTransforms!.offsets[`group:${first.activeLayerId}`] = { x: 70, y: 20 }
    first.sceneTransforms!.flips[`group:${first.activeLayerId}`] = { x: true, y: false }
    const next = groupTargetsIntoLayer(first, [{ kind: 'group', id: first.activeLayerId }, { kind: 'text', id: 'third' }])
    const reopened = readWhiteboardState({ meta: { whiteboardState: serializeWhiteboardState(next) } })!
    expect(reopened.sceneTransforms!.offsets['text:caption']).toEqual({ x: 450, y: 20 })
    expect(reopened.sceneTransforms!.offsets['text:second']).toEqual({ x: -310, y: 20 })
    expect(reopened.sceneTransforms!.flips['text:caption']).toEqual({ x: true, y: false })
    expect(reopened.sceneTransforms!.offsets[`group:${first.activeLayerId}`]).toBeUndefined()
  })

  it('text shares hit testing, marquee selection, grouping and locked-layer deletion rules', () => {
    const state = createDefaultWhiteboardState()
    state.texts = [text, { ...text, id: 'second', x: 400 }]
    const offsets = new Map([['text:caption', { x: 20, y: 10 }]])
    const bounds = getCanvasObjectRenderBounds({ kind: 'text', id: text.id }, state.layers, [], [], offsets, new Map(), state.texts)
    expect(bounds).toEqual({ x: 40, y: 40, width: 240, height: 48 })
    expect(getTopmostEditableCanvasObjectAtPoint({ x: 45, y: 45 }, state.layers, [], [], offsets, new Map(), state.texts)?.target).toEqual({ kind: 'text', id: text.id })
    expect(getSelectableCanvasObjectsInBounds({ x: 0, y: 0, width: 700, height: 300 }, state.layers, [], [], offsets, new Map(), state.texts)).toHaveLength(2)
    const grouped = groupTargetsIntoLayer(state, state.texts.map(({ id }) => ({ kind: 'text', id })))
    expect(grouped.texts!.every((item) => item.layerId === grouped.activeLayerId)).toBe(true)
    expect(getCanvasObjectRenderBounds({ kind: 'group', id: grouped.activeLayerId }, grouped.layers, [], [], offsets, new Map(), grouped.texts)).not.toBeNull()
    expect(deleteTargetFromState(grouped, { kind: 'group', id: grouped.activeLayerId }).texts).toEqual([])
    state.layers.find((layer) => layer.id === text.layerId)!.locked = true
    expect(deleteTargetFromState(state, { kind: 'text', id: text.id })).toBe(state)
  })
})

import { getViewportScreenshotPixelRatio, getWhiteboardPreviewPixelRatio, WHITEBOARD_EXPORT_PIXEL_BUDGET, WHITEBOARD_PREVIEW_PIXEL_BUDGET } from './whiteboardCanvasExport'

describe('whiteboard raster pixel budgets', () => {
  it.each([1, 1.25, 2, 3])('preserves logical bounds while limiting preview and export backing pixels at DPR %s', (dpr) => {
    for (const [width, height] of [[1280, 720], [4096, 4096], [8192, 8192], [12000, 1000]]) {
      const preview = getWhiteboardPreviewPixelRatio(width, height, dpr)
      const exported = getViewportScreenshotPixelRatio(width, height, dpr)
      expect(preview).toBeGreaterThan(0)
      expect(preview).toBeLessThanOrEqual(dpr)
      expect(width * height * preview ** 2).toBeLessThanOrEqual(WHITEBOARD_PREVIEW_PIXEL_BUDGET + 0.001)
      expect(width * height * exported ** 2).toBeLessThanOrEqual(WHITEBOARD_EXPORT_PIXEL_BUDGET + 0.001)
    }
  })
  it('retains ordinary retina output and rejects invalid DPR inflation', () => {
    expect(getViewportScreenshotPixelRatio(1280, 720, 2)).toBe(2)
    expect(getWhiteboardPreviewPixelRatio(1280, 720, Number.NaN)).toBe(1)
    expect(getWhiteboardPreviewPixelRatio(1280, 720, -1)).toBe(1)
  })
  it('fits imported media into actual custom bounds, centred without relying on a preset ratio', () => {
    const { asset } = createImageAssetForCanvas({ url: 'nomi-local://source', ratio: '16:9', dimensions: { width: 600, height: 400 }, imageSize: { width: 2000, height: 1000 } })
    expect(asset).toMatchObject({ x: 0, y: 50, width: 600, height: 300 })
  })
})
