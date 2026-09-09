import type { WorkspaceMode } from '../../workbenchStore'
import { classifyGenerationError } from '../../observability/classifyError'

export type ResidentSurface = Extract<WorkspaceMode, 'creation' | 'storyboard' | 'generation' | 'preview'>
type Translate = (key: string, options?: Record<string, unknown>) => string

export function friendlyError(error: unknown, t: Translate): string {
  const code = error instanceof Error ? error.message : ''
  if (code === 'project_agent_unavailable' || code === 'project_binding_stale') return t('agentResident.unavailable')
  if (!code) return t('agentResident.sendFailed')
  const report = classifyGenerationError(code)
  // providerMessage = 服务商原话摘要（有就一定要露出来，那是用户唯一能据以行动的事实）。
  return report.providerMessage ? `${report.reason}：${report.providerMessage}` : report.reason
}
