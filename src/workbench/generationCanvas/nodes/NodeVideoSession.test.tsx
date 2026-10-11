import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { NodeVideoSessionProvider } from './NodeVideoSession'
import { useNodeVideoSession, type Session } from './useNodeVideoSession'
import { extractVideoFrameToNode } from './extractVideoFrameToNode'

vi.mock('./extractVideoFrameToNode', () => ({ extractVideoFrameToNode: vi.fn() }))
const node = { id: 'source', kind: 'video', position: { x: 0, y: 0 }, result: { id: 'v', type: 'video', url: 'nomi-local://asset/p/source.mp4', createdAt: 1 } } as GenerationCanvasNode
function session(writable: boolean): Session {
  let captured: Session | undefined
  function Consumer() { captured = useNodeVideoSession(); return null }
  renderToStaticMarkup(<NodeVideoSessionProvider node={node} writable={writable}><Consumer /></NodeVideoSessionProvider>)
  if (!captured) throw new Error('Session did not reach its consumer')
  return captured
}

describe('source video capture ownership', () => {
  it('rejects every capture request at the readonly session boundary', () => {
    vi.mocked(extractVideoFrameToNode).mockClear()
    const readOnly = session(false)
    for (const request of ['first', 'last', { atSeconds: 7.2 }] as const) readOnly.capture(request, vi.fn())
    expect(extractVideoFrameToNode).not.toHaveBeenCalled()
  })
  it('deduplicates across camera and boundary menu before React can rerender', async () => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => { finish = resolve })
    vi.mocked(extractVideoFrameToNode).mockReset().mockReturnValueOnce(pending).mockResolvedValue(undefined)
    const editable = session(true)
    const feedback = vi.fn()
    editable.capture({ atSeconds: 7.24 }, feedback)
    editable.capture('first', feedback)
    editable.capture('last', feedback)
    expect(extractVideoFrameToNode).toHaveBeenCalledTimes(1)
    expect(extractVideoFrameToNode).toHaveBeenCalledWith(node, { atSeconds: 7.24 }, feedback)
    finish()
    await pending
    editable.capture('last', feedback)
    expect(extractVideoFrameToNode).toHaveBeenCalledTimes(2)
  })
})
