import { getDesktopBridge } from '../../desktop/bridge'
import { revealNotificationTarget } from '../../ui/notificationPolicy'
import type { ExportJobTaskCenterProjection } from './taskCenterProjection'

/** Use the existing output and project-navigation owners, including their failure acknowledgement. */
export async function runExportJobTaskAction(action: ExportJobTaskCenterProjection['action']): Promise<boolean> {
  if (action.kind === 'return_to_export') {
    return revealNotificationTarget({ projectId: action.projectId, workspaceMode: 'preview' })
  }
  const bridge = getDesktopBridge()
  if (!bridge) return false
  if (action.kind === 'reveal_export_output') {
    return (await bridge.exports.showInFolder({ projectId: action.projectId, relativePath: action.relativePath })).ok
  }
  return (await bridge.exports.cancel(action.jobId)).ok
}
