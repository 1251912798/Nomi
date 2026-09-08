import type { ProjectAgentAttachmentRef } from '../workbenchInput'
import type { ProjectAgentAttachmentClaim } from '../workbenchInput'
import type { ProjectBinding } from '../projectBinding'
import type { ProjectAgentApprovalPolicy, } from '../projectAgentContracts'
import type { AgentContextSnapshot } from '../agentContextSnapshot'
import type { PreconditionSet, TargetRef } from '../capabilityTargeting'
import type { LaneCommand, LaneCommandOutcome, LaneProjection } from './laneContracts'
import type { ProjectAgentProposalReceiptWrite, ProjectAgentProposalReceiptTransition, ProjectAgentProposalReceiptClear, ProjectAgentProposalReceiptView } from '../projectAgentProposalReceipt'

/** User input only. Model credentials and capability authority are resolved in main. */
export interface LaneComposerContext {
  model?: { vendorKey: string; modelKey: string }
  approvalPolicy: ProjectAgentApprovalPolicy
  documentId?: string
  target?: TargetRef
  preconditions?: PreconditionSet
  contextSnapshot?: AgentContextSnapshot
  attachments?: readonly ProjectAgentAttachmentClaim[]
  systemPrompt?: string
  displayText?: string
  skillKey?: string
  /** Untrusted selector: main validates the stopped entry on this lane's current branch. */
  continueFromEntryId?: string
}

export type LaneReceiptCommand =
  | { kind: 'receipt-read' }
  | { kind: 'receipt-write'; input: ProjectAgentProposalReceiptWrite }
  | { kind: 'receipt-transition'; input: ProjectAgentProposalReceiptTransition }
  | { kind: 'receipt-clear'; input: ProjectAgentProposalReceiptClear }

export interface LaneSingleShotRequest {
  requestId: string
  projectId?: string
  featureKey: string
  prompt: string
  context: LaneComposerContext
}

export type LaneDesktopCommand = (LaneCommand | LaneReceiptCommand
  | ({ kind: 'single-shot' } & LaneSingleShotRequest)
  | { kind: 'single-shot-abort'; requestId: string }
  | { kind: 'workspace-open'; binding: ProjectBinding; model?: LaneComposerContext['model'] }
  | { kind: 'workspace-close' }
  | { kind: 'workspace-policy'; policy: ProjectAgentApprovalPolicy }
) & { workspaceId?: string; expectedLane?: string; context?: LaneComposerContext }

export interface LaneRestoredDesktopInput {
  text: string
  attachments?: readonly (ProjectAgentAttachmentClaim & Partial<ProjectAgentAttachmentRef>)[]
}

export type LaneDesktopResult =
  | ({ ok: true; workspaceId?: string; receipt?: ProjectAgentProposalReceiptView | null; cleared?: true; singleShot?: LaneProjection } & Omit<LaneCommandOutcome, 'restoredInput'> & { restoredInput?: readonly LaneRestoredDesktopInput[] })
  | { ok: false; code: string; message: string }

/** pi's documented custom-message extension: persisted input, never executable authority. */
export interface LaneInputMessage {
  role: 'nomi.input'
  content: string
  timestamp: number
  context: LaneComposerContext
}
