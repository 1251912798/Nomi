import { create } from 'zustand'
import { declareStoreLifetime } from '../../../project/storeLifetime'

/** One active whiteboard, owned by the node rather than its selection-only toolbar. */
export const useWhiteboardSession = create<{ nodeId: string | null }>(() => ({ nodeId: null }))

let finishCurrent: (() => Promise<boolean>) | null = null
let opening: { generation: number } | null = null
let projectGeneration = 0
export const whiteboardSessionLifetime = declareStoreLifetime({
  store: 'useWhiteboardSession', fields: { nodeId: 'project' },
  releaseProject: () => { projectGeneration += 1; opening = null; finishCurrent = null; useWhiteboardSession.setState({ nodeId: null }) },
})

export function registerWhiteboardFinish(finish: () => Promise<boolean>): () => void {
  finishCurrent = finish
  return () => { if (finishCurrent === finish) finishCurrent = null }
}

/** Version actions share the same finish transaction as switching editors. */
export async function finishWhiteboard(nodeId: string): Promise<boolean> {
  if (useWhiteboardSession.getState().nodeId !== nodeId) return true
  const generation = projectGeneration
  const finished = finishCurrent ? await finishCurrent() : false
  return finished && generation === projectGeneration
}

export async function openWhiteboard(nodeId: string): Promise<void> {
  if (opening || useWhiteboardSession.getState().nodeId === nodeId) return
  const generation = projectGeneration
  const lease = { generation }
  opening = lease
  try {
    if (finishCurrent && !await finishCurrent()) return
    if (generation === projectGeneration) useWhiteboardSession.setState({ nodeId })
  } finally { if (opening === lease) opening = null }
}

export function closeWhiteboard(nodeId: string): void {
  if (useWhiteboardSession.getState().nodeId === nodeId) useWhiteboardSession.setState({ nodeId: null })
}
