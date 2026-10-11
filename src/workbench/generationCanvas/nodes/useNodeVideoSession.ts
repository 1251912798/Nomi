import React from 'react'
import type { VideoFrameRequest } from './extractVideoFrameToNode'

export type VideoSelection = { start: number; end: number }
export type Session = {
  player: HTMLVideoElement | null
  setPlayer: (player: HTMLVideoElement | null) => void
  editing: boolean
  setEditing: (editing: boolean) => void
  selection: React.MutableRefObject<VideoSelection | null>
  positioned: React.MutableRefObject<boolean>
  seek: (seconds: number) => void
  writable: boolean
  busy: boolean
  capture: (request: VideoFrameRequest, feedback: (message: string) => void) => void
}
export const NodeVideoContext = React.createContext<Session | null>(null)


export function useNodeVideoSession(): Session {
  const value = React.useContext(NodeVideoContext)
  if (!value) throw new Error('Video controls require their node session')
  return value
}

/** Subscribe locally: only this control surface rerenders for playback time. */
export function useNodeVideoClock(player: HTMLVideoElement | null): { time: number; duration: number; playing: boolean; muted: boolean; ready: boolean; refresh: () => void } {
  const read = React.useCallback(() => ({ time: player?.currentTime ?? 0, duration: Number.isFinite(player?.duration) ? player!.duration : 0, playing: Boolean(player && !player.paused), muted: player?.muted ?? true, ready: Boolean(player && player.readyState >= 2 && !player.seeking && !player.error) }), [player])
  const [clock, setClock] = React.useState(read)
  React.useEffect(() => {
    const update = () => setClock(read())
    const events = ['loadedmetadata', 'loadeddata', 'durationchange', 'timeupdate', 'seeking', 'seeked', 'play', 'pause', 'ended', 'volumechange', 'error']
    events.forEach((event) => player?.addEventListener(event, update))
    update()
    return () => events.forEach((event) => player?.removeEventListener(event, update))
  }, [player, read])
  return { ...clock, refresh: () => setClock(read()) }
}
