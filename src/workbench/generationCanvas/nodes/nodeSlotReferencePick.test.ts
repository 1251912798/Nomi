import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import type { CanvasPickRequest } from '../store/canvasPickMode'
import type { AssetSlot } from '../../assets/AssetReference'

const fixture = vi.hoisted(() => ({ nodes: [] as unknown[], enter: vi.fn() }))
vi.mock('../store/generationCanvasStore', () => ({ useGenerationCanvasStore: { getState: () => ({ nodes: fixture.nodes }) } }))
vi.mock('../store/canvasPickMode', () => ({ enterCanvasPickMode: fixture.enter }))
import { pickNodeSlotReference } from './nodeSlotReferencePick'

const imageSlot: AssetSlot = { key: 'referenceImageUrls', label: 'Images', accept: 'image', form: 'array', persistAsEdge: false, numbered: true, max: 2 }
const source = (id: string, kind: 'image' | 'video' | 'audio', url?: string, thumbnailUrl?: string): GenerationCanvasNode => ({
  id, kind, title: id, position: { x: 0, y: 0 }, result: { id: `${id}-main`, type: kind, createdAt: 2, url, thumbnailUrl },
})

describe('node slot point selection uses declared slots and exact original results', () => {
  beforeEach(() => { fixture.nodes = []; fixture.enter.mockReset() })
  function start(overrides: Partial<Parameters<typeof pickNodeSlotReference>[0]> = {}) {
    const cancel = vi.fn()
    fixture.enter.mockReturnValue(cancel)
    const onPick = vi.fn()
    const stop = pickNodeSlotReference({ nodeId: 'target', slots: [imageSlot], valuesByKey: {}, occupiedByKey: new Map(), remainingCapacity: Infinity, onPick, ...overrides })
    const request = fixture.enter.mock.calls.at(-1)![0] as CanvasPickRequest
    return { request, onPick, stop, cancel }
  }

  it('filters target, missing nodes and media types while returning the shared cancel function', () => {
    fixture.nodes = [source('target', 'image', 'target.png'), source('picture', 'image', 'original.png'), source('movie', 'video', 'take.mp4')]
    const { request, onPick, stop, cancel } = start()
    expect(request.eligible('target')).toBe(false)
    expect(request.eligible('missing')).toBe(false)
    expect(request.eligible('movie')).toBe(false)
    expect(request.eligible('picture')).toBe(true)
    request.onPick('movie')
    expect(onPick).not.toHaveBeenCalled()
    expect(stop).toBe(cancel)
  })

  it('counts pending fills toward per-slot capacity and respects aggregate capacity', () => {
    fixture.nodes = [source('picture', 'image', 'original.png')]
    const full = start({ occupiedByKey: new Map([[imageSlot.key, 2]]), valuesByKey: { [imageSlot.key]: [] } })
    expect(full.request.eligible('picture')).toBe(false)
    full.request.onPick('picture')
    expect(full.onPick).not.toHaveBeenCalled()
    const totalFull = start({ remainingCapacity: 0 })
    expect(totalFull.request.eligible('picture')).toBe(false)
  })

  it('rejects poster-only results before handing them to the slot write owner', () => {
    fixture.nodes = [source('poster', 'image', undefined, 'poster.png')]
    const { request, onPick } = start()
    expect(request.eligible('poster')).toBe(false)
    request.onPick('poster')
    expect(onPick).not.toHaveBeenCalled()
  })

  it('passes the first eligible original and its exact result identity', () => {
    fixture.nodes = [{ ...source('picture', 'image', 'main.png'), history: [{ id: 'older', type: 'image', createdAt: 1, url: 'older.png' }] }]
    const { request, onPick } = start()
    request.onPick('picture')
    expect(onPick).toHaveBeenCalledWith(imageSlot, expect.objectContaining({ renderUrl: 'main.png', origin: { source: 'canvas', nodeId: 'picture', resultId: 'picture-main' } }))
  })

  it('does not silently substitute history when the visible current original is already referenced', () => {
    fixture.nodes = [{ ...source('picture', 'image', 'main.png'), history: [{ id: 'older', type: 'image', createdAt: 1, url: 'older.png' }] }]
    const { request, onPick } = start({ valuesByKey: { [imageSlot.key]: ['main.png'] }, occupiedByKey: new Map([[imageSlot.key, 1]]) })
    request.onPick('picture')
    expect(request.eligible('picture')).toBe(false)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('routes video/audio originals to the matching declared slot and reads live source data', () => {
    const videoSlot: AssetSlot = { ...imageSlot, key: 'referenceVideoUrls', accept: 'video' }
    const audioSlot: AssetSlot = { ...imageSlot, key: 'referenceAudioUrls', accept: 'audio' }
    fixture.nodes = [source('movie', 'video', 'old.mp4'), source('sound', 'audio', 'voice.wav')]
    const { request, onPick } = start({ slots: [imageSlot, videoSlot, audioSlot] })
    expect(request.eligible('movie')).toBe(true)
    fixture.nodes = [source('movie', 'video', 'new.mp4'), source('sound', 'audio', 'voice.wav')]
    request.onPick('movie')
    request.onPick('sound')
    expect(onPick).toHaveBeenNthCalledWith(1, videoSlot, expect.objectContaining({ renderUrl: 'new.mp4', kind: 'video' }))
    expect(onPick).toHaveBeenNthCalledWith(2, audioSlot, expect.objectContaining({ renderUrl: 'voice.wav', kind: 'audio' }))
  })
})
