import type { CanvasWriteApprovalAuthority } from '../agentCapabilities/transportContracts'

export const LANE_RECEIPT_AUTHORITY_NOTE = 'nomi.ui.receipt-authority'

const authorityFields = new Set(['receiptProposalId', 'approvalId', 'actionHash', 'toolCallId']);
export const validLaneReceiptId = (value: unknown): value is string => typeof value === 'string'
  && value.length > 0 && value.length <= 512 && value.trim() === value;

export function parseLaneReceiptAuthority(data: unknown): CanvasWriteApprovalAuthority & { toolCallId?: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('lane_receipt_authority_invalid');
  const fields = data as Record<string, unknown>;
  if (Object.keys(fields).some((key) => !authorityFields.has(key))
    || !validLaneReceiptId(fields.receiptProposalId) || !validLaneReceiptId(fields.approvalId) || !validLaneReceiptId(fields.actionHash)
    || ('toolCallId' in fields && !validLaneReceiptId(fields.toolCallId))) throw new Error('lane_receipt_authority_invalid');
  return { receiptProposalId: fields.receiptProposalId, approvalId: fields.approvalId, actionHash: fields.actionHash,
    ...(fields.toolCallId === undefined ? {} : { toolCallId: fields.toolCallId as string }) };
}
