import { join } from 'node:path'
import { readJsonFile, writeJsonFileAtomic } from '../jsonFile'
import type { LaneSummary } from '../shared/agentLane/laneContracts'

export type LaneWorkspaceSelection = Pick<LaneSummary, 'laneName' | 'sessionId'>

// This is one project-level choice, never a conversation list or transcript.
// pi session metadata has no project selection; its repo remains the list owner.
function selectionPath(projectDir: string): string {
  return join(projectDir, '.nomi', 'agent-workspace.json')
}

export function readLaneWorkspaceSelection(projectDir: string): LaneWorkspaceSelection | undefined {
  let value: unknown
  try { value = readJsonFile(selectionPath(projectDir)) }
  catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined
    throw error
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 2 || typeof record.laneName !== 'string' || !record.laneName
    || typeof record.sessionId !== 'string' || !record.sessionId) return undefined
  return { laneName: record.laneName, sessionId: record.sessionId }
}

export function writeLaneWorkspaceSelection(projectDir: string, selection: LaneWorkspaceSelection): void {
  writeJsonFileAtomic(selectionPath(projectDir), { laneName: selection.laneName, sessionId: selection.sessionId }, { mode: 0o600 })
}
