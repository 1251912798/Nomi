import { LANE_APPROVAL_NOTE_TYPE, isLaneApprovalNote, laneApprovalWasRefused, type LanePart } from '../../../../electron/shared/agentLane/laneContracts'
import { LANE_RECEIPT_AUTHORITY_NOTE, parseLaneReceiptAuthority } from '../../../../electron/shared/agentLane/laneReceiptAuthority'
import type { ProjectAgentCommittedProposalRecord } from '../../../../electron/shared/projectAgentProposalReceipt'

/** Display reference only. Execution still rereads the G5 owner and uses its main-process CAS. */
export function undoableLaneToolCallId(
  parts: readonly LanePart[], record: ProjectAgentCommittedProposalRecord | null,
): string | undefined {
  if (!record?.compensation.length || !record.hostApprovalId || !record.hostActionHash) return undefined
  let matched: string | undefined
  for (const part of parts) {
    if (part.kind !== 'host-note' || part.noteType !== LANE_RECEIPT_AUTHORITY_NOTE) continue
    let note: ReturnType<typeof parseLaneReceiptAuthority>
    try { note = parseLaneReceiptAuthority(part.data) } catch { return undefined }
    if (note.receiptProposalId !== record.proposalId) continue
    if (matched || !note.toolCallId || note.approvalId !== record.hostApprovalId
      || note.actionHash !== record.hostActionHash) return undefined
    matched = note.toolCallId
  }
  if (!matched || parts.some(part => part.kind === 'host-note' && part.noteType === LANE_APPROVAL_NOTE_TYPE
    && isLaneApprovalNote(part.data) && part.data.toolCallId === matched && laneApprovalWasRefused(part.data))) return undefined
  const call = parts.find(part => part.kind === 'tool-call' && part.toolCallId === matched)
  const result = parts.find(part => part.kind === 'tool-result' && part.toolCallId === matched)
  return call?.kind === 'tool-call' && !call.running && result?.kind === 'tool-result' && !result.isError
    ? matched : undefined
}
