import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import type { GenerationCanvasNode } from '../generationCanvas/model/generationCanvasTypes'
import { selectIsNodeQueued, useGenerationQueueStore } from '../generationCanvas/runner/generationQueueStore'
import { generationFeedback } from './generationFeedback'

// One local clock for all visible surfaces; no per-node persistence writes or competing timers.
let now = Date.now()
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()
const snapshot = () => now
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!timer) {
    now = Date.now()
    timer = setInterval(() => { now = Date.now(); listeners.forEach((notify) => notify()) }, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) { clearInterval(timer); timer = undefined }
  }
}
const inactiveSubscribe = () => () => {}

export function useGenerationFeedback(node: GenerationCanvasNode) {
  useTranslation()
  const queued = useGenerationQueueStore((state) => selectIsNodeQueued(state, node.id))
  const active = queued || node.status === 'queued' || node.status === 'running'
  const timestamp = useSyncExternalStore(active ? subscribe : inactiveSubscribe, snapshot, snapshot)
  return generationFeedback(node, timestamp, queued)
}
