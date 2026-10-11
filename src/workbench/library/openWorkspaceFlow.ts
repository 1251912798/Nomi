import type { TFunction } from 'i18next'
import type { DesktopBridge } from '../../desktop/bridge'
import { logRendererError } from '../../desktop/rendererLog'
import { projectNotice, projectOperationFailureText, type UserText } from '../project/projectOperationFailureText'

type WorkspaceOpenResult = { id?: unknown }

type OpenWorkspaceFromLibraryOptions = {
  bridge: DesktopBridge | null
  hydrateProject: (projectId: string) => Promise<boolean> | boolean
  refreshProjects: () => void
  confirmInitialize: (rootPath: string) => Promise<boolean> | boolean
  showMessage: (message: UserText, tone?: 'success' | 'error') => void
  t: TFunction
}

type OpenWorkspaceProjectFromPickerOptions = {
  bridge: DesktopBridge | null
  confirmInitialize: (rootPath: string) => Promise<boolean> | boolean
  showMessage: (message: UserText, tone?: 'success' | 'error') => void
  t: TFunction
  name?: string
}

/** 只用来认「文件夹还没初始化」这一种可恢复情形，结果不进界面。 */
function isUninitializedWorkspaceError(error: unknown): boolean {
  return /not initialized|未初始化/i.test(error instanceof Error ? error.message : String(error ?? ''))
}

function projectIdFromResult(result: unknown): string | null {
  const id = (result as WorkspaceOpenResult | null | undefined)?.id
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

export async function openWorkspaceProjectFromPicker(options: OpenWorkspaceProjectFromPickerOptions): Promise<string | null> {
  const { bridge, confirmInitialize, showMessage, name, t } = options
  if (!bridge?.workspace) {
    showMessage(projectNotice(t, 'studio.workspaceUnsupported'), 'error')
    return null
  }

  const selection = await bridge.workspace.selectFolder()
  if (selection.canceled) return null

  const rootPath = selection.rootPath
  const openPayload = (initialize: boolean) => (name ? { rootPath, initialize, name } : { rootPath, initialize })
  let opened: unknown
  try {
    opened = await bridge.workspace.openFolder(openPayload(false))
  } catch (error) {
    if (!isUninitializedWorkspaceError(error)) {
      logRendererError('workspace-open-failed', error)
      showMessage(projectOperationFailureText('openWorkspace', error, t), 'error')
      return null
    }
    const confirmed = await confirmInitialize(rootPath)
    if (!confirmed) return null
    try {
      opened = await bridge.workspace.openFolder(openPayload(true))
    } catch (initializeError) {
      logRendererError('workspace-initialize-failed', initializeError)
      showMessage(projectOperationFailureText('openWorkspace', initializeError, t), 'error')
      return null
    }
  }

  const projectId = projectIdFromResult(opened)
  if (!projectId) {
    showMessage(projectNotice(t, 'studio.workspaceNoProject'), 'error')
    return null
  }
  return projectId
}

export async function openWorkspaceFromLibrary(options: OpenWorkspaceFromLibraryOptions): Promise<void> {
  const { bridge, hydrateProject, refreshProjects, confirmInitialize, showMessage, t } = options
  const projectId = await openWorkspaceProjectFromPicker({ bridge, confirmInitialize, showMessage, t })
  if (!projectId) return
  refreshProjects()
  await hydrateProject(projectId)
}
