import type { CanvasWriteApprovalAuthority } from '../shared/agentCapabilities/transportContracts'

import type {
  ProjectAgentCommittedProposalRecord,
  ProjectAgentProposalReceiptView,
} from "../shared/projectAgentProposalReceipt";
import type { ProjectBinding } from "../shared/projectBinding";
import { sameProjectAgentBinding } from "../projectAgentHost/projectAgentIdentity";

export function projectAgentProposalMatchesApproval(
  proposalId: string,
  proposal: ProjectAgentCommittedProposalRecord,
  approval: CanvasWriteApprovalAuthority,
): boolean {
  return proposalId === approval.receiptProposalId
    && proposal.proposalId === approval.receiptProposalId
    && proposal.hostApprovalId === approval.approvalId
    && proposal.hostActionHash === approval.actionHash;
}

export function committedProjectAgentReceiptMatchesApproval(
  binding: ProjectBinding,
  receipt: ProjectAgentProposalReceiptView | null,
  approval: CanvasWriteApprovalAuthority,
): boolean {
  return Boolean(
    receipt
    && receipt.lifecycle === "committed"
    && sameProjectAgentBinding(receipt.binding, binding)
    && projectAgentProposalMatchesApproval(receipt.proposalId, receipt.proposal, approval),
  );
}
