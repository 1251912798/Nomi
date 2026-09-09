import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LanePart } from '../../../../electron/shared/agentLane/laneContracts'
import { LANE_APPROVAL_NOTE_TYPE } from '../../../../electron/shared/agentLane/laneContracts'
import { LANE_RECEIPT_AUTHORITY_NOTE } from '../../../../electron/shared/agentLane/laneReceiptAuthority'
import { undoableLaneToolCallId } from './laneReceiptUndo'
import { clearCommittedProposal, getCommittedProposal, hydrateCommittedProposalReceipt } from '../../generationCanvas/agent/proposalUndo'
import type { ProjectAgentCommittedProposalRecord } from '../../../../electron/shared/projectAgentProposalReceipt'

const fixture = vi.hoisted(() => ({ binding: {
  projectId: 'project-a', immutableProjectUuid: '11111111-1111-4111-8111-111111111111', projectGeneration: 1,
} }))
vi.mock('./laneClient', () => ({ laneClient: { context: () => ({ subscriptionId: 'workspace-a', binding: fixture.binding }) } }))
const record: ProjectAgentCommittedProposalRecord = {
  proposalId: 'receipt-1', hostApprovalId: 'approval-1', hostActionHash: 'a'.repeat(64),
  summary: 'Created', stepLabels: ['Created'], compensation: [{ kind: 'delete-nodes', nodeIds: ['n1'] }],
  watchNodes: [], reconciliationOk: true,
}
const note = { receiptProposalId: record.proposalId, approvalId: record.hostApprovalId,
  actionHash: record.hostActionHash, toolCallId: 'call-1' }
function parts(data: unknown = note): LanePart[] {
  return [
    { kind: 'host-note', noteType: LANE_RECEIPT_AUTHORITY_NOTE, data, sequence: 0, entrySeq: 1, contentIndex: 0 },
    { kind: 'tool-call', toolCallId: 'call-1', toolName: 'nomi_canvas_write', args: {}, running: false, sequence: 1, entrySeq: 2, contentIndex: 0 },
    { kind: 'tool-result', toolCallId: 'call-1', toolName: 'nomi_canvas_write', text: 'Created', isError: false, sequence: 2, entrySeq: 3, contentIndex: 0 },
  ]
}
beforeEach(() => { clearCommittedProposal() })

describe('G5 receipt display correlation', () => {
  it('joins exact current success and never guesses a different lane or receipt', () => {
    expect(undoableLaneToolCallId(parts(), record)).toBe('call-1')
    expect(undoableLaneToolCallId([], record)).toBeUndefined()
    expect(undoableLaneToolCallId(parts(), { ...record, proposalId: 'other' })).toBeUndefined()
    expect(undoableLaneToolCallId(parts(), null)).toBeUndefined()
    expect(undoableLaneToolCallId(parts(), { ...record, compensation: [] })).toBeUndefined()
  })
  it.each(['receiptProposalId', 'approvalId', 'actionHash', 'toolCallId'])('rejects mismatched %s', field => {
    expect(undoableLaneToolCallId(parts({ ...note, [field]: 'wrong' }), record)).toBeUndefined()
  })
  it('rejects malformed and ambiguous notes, including a valid note after an invalid match', () => {
    expect(undoableLaneToolCallId(parts({ ...note, unexpected: true }), record)).toBeUndefined()
    expect(undoableLaneToolCallId([parts()[0]!, ...parts()], record)).toBeUndefined()
    expect(undoableLaneToolCallId([parts({ ...note, approvalId: 'wrong' })[0]!, ...parts()], record)).toBeUndefined()
  })
  it('requires a settled successful result and refuses a denied call even if its result is malformed', () => {
    expect(undoableLaneToolCallId(parts().slice(0, 2), record)).toBeUndefined()
    const failed = parts()
    failed[2] = { ...failed[2], isError: true } as LanePart
    expect(undoableLaneToolCallId(failed, record)).toBeUndefined()
    const denied: LanePart = { kind: 'host-note', noteType: LANE_APPROVAL_NOTE_TYPE,
      data: { toolCallId: 'call-1', toolName: 'nomi_canvas_write', decision: 'denied' },
      sequence: 3, entrySeq: 4, contentIndex: 0 }
    expect(undoableLaneToolCallId([...parts(), denied], record)).toBeUndefined()
  })
  it('restores the original committed owner after cold clear; undone and wrong bindings cannot restore Undo', () => {
    const receipt = { binding: fixture.binding, proposalId: record.proposalId, proposal: record,
      revision: 2, lifecycle: 'committed' as const, operationId: 'commit-1' }
    expect(hydrateCommittedProposalReceipt(receipt)).toBe(true)
    expect(undoableLaneToolCallId(parts(), getCommittedProposal())).toBe('call-1')
    clearCommittedProposal()
    expect(undoableLaneToolCallId(parts(), getCommittedProposal())).toBeUndefined()
    expect(hydrateCommittedProposalReceipt(structuredClone(receipt))).toBe(true)
    expect(undoableLaneToolCallId(parts(), getCommittedProposal())).toBe('call-1')
    clearCommittedProposal()
    expect(hydrateCommittedProposalReceipt({ ...receipt, binding: { ...fixture.binding, projectGeneration: 2 } })).toBe(false)
    expect(hydrateCommittedProposalReceipt({ ...receipt, lifecycle: 'undone', revision: 4 })).toBe(true)
    expect(undoableLaneToolCallId(parts(), getCommittedProposal())).toBeUndefined()
  })
})
