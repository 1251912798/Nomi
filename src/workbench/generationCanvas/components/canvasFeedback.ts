import i18n from '../../../i18n'
import { getDesktopActiveProjectId } from '../../../desktop/activeProject'
import { notify, revealNotificationTarget } from '../../../ui/notificationPolicy'

/** The frozen React Flow host cannot gain a new inline slot in this task.
 * Its command adapters retain one actionable notice, bound to the actual project
 * and target; editable node/panel hosts must use notify(level: 'inline') instead. */
export function reportCanvasFeedback(
  message: string,
  type: 'info' | 'success' | 'warning' | 'error',
  context: { identity: string; reason: string; nodeIds?: string[]; projectId?: string; taskCenter?: boolean; workspaceMode?: 'preview' | 'generation' },
): void {
  const projectId = context.projectId ?? getDesktopActiveProjectId()
  notify({
    identity: `${projectId}:${context.identity}`,
    reason: context.reason,
    message,
    type,
    level: 'background',
    actionLabel: i18n.t(context.taskCenter ? 'taskCenter.title' : context.workspaceMode === 'preview' ? 'workspace.preview' : 'workspace.generation'),
    onAction: () => { void revealNotificationTarget({ projectId, workspaceMode: context.workspaceMode ?? 'generation', nodeIds: context.nodeIds, taskCenter: context.taskCenter }) },
  })
}
