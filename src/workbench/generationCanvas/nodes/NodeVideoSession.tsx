import React from 'react'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { extractVideoFrameToNode, type VideoFrameRequest } from './extractVideoFrameToNode'
import { markNodeVideoUserPlayback } from './nodeVideoPlayback'

import { NodeVideoContext, type VideoSelection } from './useNodeVideoSession'

/** Transient per-card session. Playback ticks and trim dragging never write the canvas store. */
export function NodeVideoSessionProvider({ node, writable, children }: { node: GenerationCanvasNode; writable: boolean; children: React.ReactNode }): React.JSX.Element {
  const [player, setPlayer] = React.useState<HTMLVideoElement | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const pending = React.useRef(false)
  const selection = React.useRef<VideoSelection | null>(null)
  const positioned = React.useRef(false)
  const seek = React.useCallback((seconds: number) => {
    if (!player || player.readyState < 1 || !Number.isFinite(player.duration)) return
    positioned.current = true
    player.pause()
    player.currentTime = Math.max(0, Math.min(player.duration, seconds))
    markNodeVideoUserPlayback(player)
  }, [player])
  const capture = React.useCallback((request: VideoFrameRequest, feedback: (message: string) => void) => {
    if (!writable || pending.current) return
    pending.current = true
    setBusy(true)
    void extractVideoFrameToNode(node, request, feedback).finally(() => { pending.current = false; setBusy(false) })
  }, [node, writable])
  const value = React.useMemo(() => ({ player, setPlayer, editing, setEditing, selection, positioned, seek, writable, busy, capture }), [player, editing, seek, writable, busy, capture])
  return <NodeVideoContext.Provider value={value}>{children}</NodeVideoContext.Provider>
}
