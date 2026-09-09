import { z } from 'zod'
import type { LaneWorkspaceHandle } from '../shared/agentLane/laneContracts'
import type { ProjectAgentProposalReceiptService } from '../capabilityCore/projectAgentProposalReceiptStore'
import { parseProjectAgentCommittedProposal, PROJECT_AGENT_PROPOSAL_RECEIPT_LIFECYCLES, type ProjectAgentProposalReceiptLifecycle } from '../shared/projectAgentProposalReceipt'

const id = z.string().trim().min(1).max(512)
const common = { expectedRevision: z.number().int().nonnegative(), proposalId: id, operationId: id }
const envelope = { workspaceId: id }
const lifecycle = z.enum(PROJECT_AGENT_PROPOSAL_RECEIPT_LIFECYCLES)
const receiptCommand = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('receipt-read'), ...envelope }).strict(),
  z.object({ kind: z.literal('receipt-write'), ...envelope, input: z.object({ ...common,
    lifecycle: lifecycle.refine((value): value is Extract<ProjectAgentProposalReceiptLifecycle, 'preparing' | 'committed'> => value === 'preparing' || value === 'committed'), proposal: z.unknown(),
  }).strict() }).strict(),
  z.object({ kind: z.literal('receipt-transition'), ...envelope, input: z.object({ ...common,
    lifecycle: lifecycle.refine((value): value is Extract<ProjectAgentProposalReceiptLifecycle, 'undoing' | 'undone'> => value === 'undoing' || value === 'undone'),
  }).strict() }).strict(),
  z.object({ kind: z.literal('receipt-clear'), ...envelope, input: z.object(common).strict() }).strict(),
])

/** Invoked only after the desktop IPC has checked its owner, lifetime and committed Surface. */
export function executeLaneReceiptCommand(service: ProjectAgentProposalReceiptService, lane: Pick<LaneWorkspaceHandle, 'receiptAuthority'>, wire: unknown) {
  const command = receiptCommand.parse(wire)
  if (command.kind === 'receipt-read') return { receipt: service.read() }
  if (command.kind === 'receipt-transition') return { receipt: service.transition(command.input) }
  if (command.kind === 'receipt-clear') return service.clear(command.input)
  const proposal = parseProjectAgentCommittedProposal(command.input.proposal)
  if (!proposal || proposal.proposalId !== command.input.proposalId) throw new Error('project_agent_receipt_invalid')
  const authority = lane.receiptAuthority(proposal.proposalId)
  if (proposal.hostApprovalId !== undefined || proposal.hostActionHash !== undefined || authority) {
    if (!authority || proposal.hostApprovalId !== authority.approvalId || proposal.hostActionHash !== authority.actionHash) {
      throw new Error('project_agent_receipt_correlation_mismatch')
    }
  }
  return { receipt: service.write({ ...command.input, proposal }) }
}
