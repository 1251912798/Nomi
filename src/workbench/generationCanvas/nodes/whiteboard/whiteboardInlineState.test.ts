import { afterEach, expect, it, vi } from 'vitest'
import { annotationsForResult, readWhiteboardAnnotations } from './whiteboardAnnotations'
import { createDefaultWhiteboardState } from './whiteboardState'
import { whiteboardRasterStateKey } from './whiteboardRasterState'
import { closeWhiteboard, finishWhiteboard, openWhiteboard, registerWhiteboardFinish, useWhiteboardSession, whiteboardSessionLifetime } from './whiteboardSession'

afterEach(() => { closeWhiteboard(useWhiteboardSession.getState().nodeId ?? '') })
it('selection and labels do not create another raster version; bounds and transforms do', () => {
  const original = createDefaultWhiteboardState()
  const key = whiteboardRasterStateKey(original)
  expect(whiteboardRasterStateKey({ ...original, activeLayerId: 'different', layers: original.layers.map(layer => ({ ...layer, name: 'renamed' })) })).toBe(key)
  expect(whiteboardRasterStateKey({ ...original, canvasDimensions: { width: 1600, height: 900 } })).not.toBe(key)
  expect(whiteboardRasterStateKey({ ...original, sceneTransforms: { offsets: { 'asset:a': { x: 20, y: 0 } }, assetTransforms: {}, flips: {} } })).not.toBe(key)
})
it('keeps feedback on the exact result and rejects malformed stored annotations', () => {
  const a = { id: 'note-a', resultId: 'version-a', x: 2, y: 4, text: 'Move the lamp' }
  const b = { ...a, id: 'note-b', resultId: 'version-b' }
  const notes = readWhiteboardAnnotations({ meta: { whiteboardAnnotations: [a, b, { ...a, x: NaN }, { ...a, width: -4 }] } })
  expect(notes).toHaveLength(2)
  expect(annotationsForResult(notes, 'version-b')).toEqual([b])
  notes[0].text = 'changed'
  expect(a.text).toBe('Move the lamp')
})
it('retains the current editor after save failure and serializes switching', async () => {
  await openWhiteboard('first')
  const failed = vi.fn(async () => false)
  const releaseFailed = registerWhiteboardFinish(failed)
  await openWhiteboard('second')
  expect(useWhiteboardSession.getState().nodeId).toBe('first')
  releaseFailed()
  let finish!: (value: boolean) => void
  const release = registerWhiteboardFinish(() => new Promise<boolean>(resolve => { finish = resolve }))
  const pending = openWhiteboard('second')
  await openWhiteboard('third')
  expect(useWhiteboardSession.getState().nodeId).toBe('first')
  finish(true)
  await pending
  expect(useWhiteboardSession.getState().nodeId).toBe('second')
  release()
})

it('does not reopen an old project editor when its asynchronous finish completes after project release', async () => {
  await openWhiteboard('old-node')
  let finish!: (value: boolean) => void
  const release = registerWhiteboardFinish(() => new Promise<boolean>(resolve => { finish = resolve }))
  const pending = openWhiteboard('next-old-node')
  whiteboardSessionLifetime.releaseProject!()
  finish(true)
  await pending
  expect(useWhiteboardSession.getState().nodeId).toBeNull()
  release()
})

it('rejects a version action whose asynchronous board finish crosses project release', async () => {
  await openWhiteboard('shared-node-id')
  let finish!: (value: boolean) => void
  const release = registerWhiteboardFinish(() => new Promise<boolean>(resolve => { finish = resolve }))
  const pending = finishWhiteboard('shared-node-id')
  whiteboardSessionLifetime.releaseProject!()
  finish(true)
  expect(await pending).toBe(false)
  release()
})

it('a released project cannot hold or unlock the next project opening lease', async () => {
  await openWhiteboard('old-first')
  let finishOld!: (value: boolean) => void
  const releaseOld = registerWhiteboardFinish(() => new Promise<boolean>(resolve => { finishOld = resolve }))
  const oldPending = openWhiteboard('old-next')
  whiteboardSessionLifetime.releaseProject!()
  await openWhiteboard('new-first')
  expect(useWhiteboardSession.getState().nodeId).toBe('new-first')
  let finishNew!: (value: boolean) => void
  const releaseNew = registerWhiteboardFinish(() => new Promise<boolean>(resolve => { finishNew = resolve }))
  const newPending = openWhiteboard('new-next')
  finishOld(true)
  await oldPending
  await openWhiteboard('new-third')
  expect(useWhiteboardSession.getState().nodeId).toBe('new-first')
  finishNew(true)
  await newPending
  expect(useWhiteboardSession.getState().nodeId).toBe('new-next')
  releaseOld(); releaseNew()
})
