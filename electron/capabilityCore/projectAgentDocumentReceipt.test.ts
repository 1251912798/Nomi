import { describe, expect, it, vi } from "vitest";

import type { CanvasWriteApprovalAuthority } from "../shared/agentCapabilities/transportContracts";
import type {
  ProjectAgentCommittedProposalRecord,
  ProjectAgentProposalReceiptTransition,
  ProjectAgentProposalReceiptView,
  ProjectAgentProposalReceiptWrite,
} from "../shared/projectAgentProposalReceipt";
type ProjectAgentProposalReceiptWriter = Parameters<typeof prepareDocumentProposalReceipt>[0];
import {
  abandonDocumentProposalReceipt,
  commitDocumentProposalReceipt,
  documentProposalReceiptFor,
  prepareDocumentProposalReceipt,
} from "./projectAgentDocumentReceipt";

const receiptBinding = {
  projectId: "project-1",
  immutableProjectUuid: "6b0f4a39-1ae4-4e1e-8b2e-0b9460a67a51",
  projectGeneration: 1,
} as const;
const persisted: CanvasWriteApprovalAuthority = {
  receiptProposalId: "receipt-id", approvalId: "approval-id", actionHash: "action-hash",
};
const prepared = { invocation: { input: { operation: "append" as const } } };

function receiptView(
  lifecycle: ProjectAgentProposalReceiptView["lifecycle"],
  revision: number,
  proposal: ProjectAgentCommittedProposalRecord,
): ProjectAgentProposalReceiptView {
  return {
    binding: receiptBinding,
    revision,
    lifecycle,
    proposalId: proposal.proposalId,
    operationId: `document-${lifecycle}`,
    proposal,
  };
}

describe("Project Agent document receipt helper", () => {
  it.each([
    [{ toolName: "nomi_document_edit", args: {} }, prepared, "append"],
    [{ toolName: "append_to_end", args: {} }, { invocation: { input: undefined } }, "append"],
    [{ toolName: "unknown_alias", args: { operation: "replace" } }, { invocation: { input: undefined } }, "replace"],
    [{ toolName: "unknown_alias", args: {} }, { invocation: { input: undefined } }, "write"],
  ])("preserves the resolved operation in the durable proposal", (call, preparedInput, operation) => {
    const resolved = documentProposalReceiptFor(
      call,
      persisted,
      preparedInput,
    );

    expect(resolved).toMatchObject({
      proposalId: "receipt-id",
      hostApprovalId: "approval-id",
      hostActionHash: "action-hash",
      summary: `${operation} ${call.toolName}`,
      stepLabels: [`${operation}:${call.toolName}`],
    });
  });

  it("prepares, commits, and abandons the same receipt with CAS revisions", () => {
    const proposal = documentProposalReceiptFor({ toolName: "nomi_document_edit", args: {} }, persisted, prepared);
    const writer: ProjectAgentProposalReceiptWriter = {
      read: vi.fn(() => null),
      write: vi.fn((value: ProjectAgentProposalReceiptWrite) => receiptView(
        value.lifecycle,
        value.lifecycle === "preparing" ? 1 : 2,
        value.proposal,
      )),
      transition: vi.fn((value: ProjectAgentProposalReceiptTransition) => receiptView(
        value.lifecycle,
        2,
        proposal,
      )),
    };

    const preparing = prepareDocumentProposalReceipt(writer, proposal, "approval-id");
    commitDocumentProposalReceipt(writer, preparing, proposal, "approval-id");
    abandonDocumentProposalReceipt(writer, preparing, proposal, "approval-id");

    expect(writer.write).toHaveBeenNthCalledWith(1, expect.objectContaining({ expectedRevision: 0, lifecycle: "preparing" }));
    expect(writer.write).toHaveBeenNthCalledWith(2, expect.objectContaining({ expectedRevision: 1, lifecycle: "committed" }));
    expect(writer.transition).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 1, lifecycle: "undone" }));
  });

  it("preserves a preparing receipt when the undone CAS transition fails", () => {
    const proposal = documentProposalReceiptFor({ toolName: "nomi_document_edit", args: {} }, persisted, prepared);
    const writer: ProjectAgentProposalReceiptWriter = {
      read: () => receiptView("preparing", 4, proposal),
      write: (value: ProjectAgentProposalReceiptWrite) => receiptView(value.lifecycle, 5, value.proposal),
      transition: () => { throw new Error("stale revision"); },
    };

    expect(() => abandonDocumentProposalReceipt(writer, receiptView("preparing", 5, proposal), proposal, "approval-id")).not.toThrow();
  });
});
