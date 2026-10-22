import React from 'react'
import type { WorkspaceSyncInspection } from '../../../electron/shared/workspaceSyncContracts'
import { getDesktopBridge } from '../../desktop/bridge'
import { createSyncInspectScheduler } from './projectSyncInspectScheduler'

/** 项目库卡片同步状态的进程内唯一一份（调度规则见 projectSyncInspectScheduler.ts）。 */
export const librarySyncInspect = createSyncInspectScheduler({
  inspectMany: async (projectIds) => {
    const inspectMany = getDesktopBridge()?.workspace?.syncInspectMany
    return inspectMany ? inspectMany(projectIds) : {}
  },
})

export function useLibrarySyncInspections(): Record<string, WorkspaceSyncInspection> {
  return React.useSyncExternalStore(librarySyncInspect.subscribe, librarySyncInspect.snapshot)
}
