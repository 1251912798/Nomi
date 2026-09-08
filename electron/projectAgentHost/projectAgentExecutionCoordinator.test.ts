import type { CanvasWriteApprovalAuthority } from '../shared/agentCapabilities/transportContracts'
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ProjectAgentExecutionEvent,
  ProjectAgentMutation,
  ProjectBinding,
  ProposalApprovalRef,
} from "../shared/projectAgentContracts";
import type {
  AgentChatCapability,
  AgentChatRequest,
  AgentChatResponse,
  AgentChatToolDecision,
} from "../harness/agentChatContracts";
import type { RuntimeToolCall } from "../shared/agentCapabilities/transportContracts";
import { createProjectAgentContextBinding } from "./projectAgentContextBinding";
import type { ProjectAgentExecutionRequest } from "../shared/contracts/agentChatContracts";
import {
  createProjectAgentExecutionCoordinator,
  ProjectAgentSubscriptionError,
} from "./projectAgentExecutionCoordinator";
import { createProjectAgentRepositoryRouter } from "./projectAgentRepositoryRouter";
import type {
  PiDocumentWriteTransportAdapter,
  PreparedDocumentWrite,
} from "../capabilityCore/documentWriteTransportAdapters";
import type {
  PiCanvasWriteTransportAdapter,
  PreparedCanvasWrite,
} from "../capabilityCore/canvasWriteTransportAdapters";
import type {
  PiTimelineWriteTransportAdapter,
  PreparedTimelineWrite,
  TimelineWriteApprovalAuthority,
} from "../capabilityCore/timelineTransportAdapters";
import type {
  PiPhase4SurfaceTransportAdapter,
  PreparedExportWrite,
} from "../capabilityCore/phase4SurfaceTransportAdapters";
import type {
  PiSkillWriteTransportAdapter,
  PreparedSkillWrite,
} from "../capabilityCore/skillWriteTransportAdapters";
import type { PiSkillReadTransportAdapter } from "../capabilityCore/skillReadTransportAdapters";
import type { PiProductionRunTransportAdapter } from "../capabilityCore/productionRunTransportAdapters";
import type { PreconditionSet, TargetRef } from "../shared/capabilityTargeting";
import type {
  ProjectAgentCommittedProposalRecord,
  ProjectAgentProposalReceiptView,
} from "../shared/projectAgentProposalReceipt";
import type { ProjectAgentProposalReceiptWriter } from "./projectAgentExecutionCoordinatorTypes";
import { readEvents, setEventLogProjectDirResolverForTests } from "../events/eventLogRepository";
import { getExperienceRepository, resetExperienceRepositoryForTests, setExperienceProjectDirResolverForTests } from "../experience/experienceRepository";
import {
  createProjectAgentProposalReceiptService,
  projectAgentProposalReceiptPath,
} from "../capabilityCore/projectAgentProposalReceiptStore";

// 主进程诊断输出已收口到 electron/logging/logger（打包后 console.* 没人接住，见
// docs/fixes/2026-09-06-main-process-logs-into-the-void.root-cause.json）。
// 这里断言那个出口——比原来的「console.warn 被调过一次」更能说明发生了什么。
const logged = vi.hoisted(() => [] as { level: string; scope: string; event: string; rest: unknown[] }[])
vi.mock("../logging/logger", () => {
  const record = (level: string) => (scope: string, event: string, ...rest: unknown[]) => {
    logged.push({ level, scope, event, rest })
  }
  return {
    logInfo: record("info"),
    logWarn: record("warn"),
    logError: record("error"),
    logDevDetail: () => undefined,
    logVendorCall: () => undefined,
    installMainLogger: () => undefined,
    currentLogFile: () => "",
  }
})

function skillWriteAdapter(): PiSkillWriteTransportAdapter & {
  prepare: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  const prepare = vi.fn(async (
    call: RuntimeToolCall,
    context: Readonly<{ target: TargetRef; preconditions: PreconditionSet }>,
    _signal: AbortSignal,
  ): Promise<PreparedSkillWrite | null> => {
    if (call.toolName !== "author_skill") return null;
    return Object.freeze({
      call,
      args: { operation: "author_skill", ...(call.args as Record<string, unknown>) } as PreparedSkillWrite["args"],
      pkg: {
        version: "nomi-skill-v1",
        exportedAt: 1,
        dirName: "test-skill",
        files: { "SKILL.md": "---\nname: test-skill\ndescription: body\n---\n\nbody" },
      },
      invocation: {
        target: context.target,
        preconditions: context.preconditions,
        policyRevision: 1,
        inputHash: "a".repeat(64),
        actionHash: "b".repeat(64),
      },
    } as PreparedSkillWrite);
  });
  const execute = vi.fn(async (_prepared: PreparedSkillWrite, approval: { receiptProposalId: string }) => ({
    ok: true as const,
    result: { applied: true, skillName: "test.skill", dirName: "test-skill", packageVersion: "nomi-skill-v1", contentHash: "c".repeat(64), created: true },
    proposalId: approval.receiptProposalId,
    silent: true as const,
  }));
  const dispose = vi.fn();
  return { prepare, execute, dispose } as unknown as PiSkillWriteTransportAdapter & {
    prepare: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
}

function skillReadAdapter(): PiSkillReadTransportAdapter & {
  tryExecute: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  const tryExecute = vi.fn(async (call: RuntimeToolCall) => call.toolName === "load_skill"
    ? {
        ok: true as const,
        silent: true as const,
        result: {
          loaded: true,
          name: "brand.promo",
          directoryName: "brand-promo",
          description: "Brand workflow",
          body: "Use the brand workflow.",
          origin: "user" as const,
          packageVersion: "nomi-skill-v1",
          contentHash: "a".repeat(64),
        },
      }
    : null);
  const dispose = vi.fn();
  return { tryExecute, dispose } as unknown as PiSkillReadTransportAdapter & {
    tryExecute: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
}

const binding = {
  projectId: "project-a",
  immutableProjectUuid: "11111111-1111-4111-8111-111111111111",
  projectGeneration: 1,
} as const;

type ExecutionInput = Parameters<ReturnType<typeof createProjectAgentExecutionCoordinator>["enqueue"]>[1];

function executionInput(
  id: string,
  expectedRevision: number,
  projectBinding: ProjectBinding = binding,
  options: Readonly<{ threadId?: string; prompt?: string; capability?: AgentChatCapability }> = {},
): ExecutionInput {
  const occurredAt = "2026-08-28T00:00:00.000Z";
  const thread = {
    threadId: options.threadId ?? `thread-${id}`,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
  const contextRef = {
    binding: createProjectAgentContextBinding(projectBinding, thread.threadId),
    contextRevision: 0,
    recordId: `context-${id}`,
  } as const;
  const turn = {
    turnId: `turn-${id}`,
    threadId: thread.threadId,
    executionToken: `token-${id}`,
    model: { id: "model", version: 1 },
    approvalPolicy: { mode: "step" as const, spend: "confirm" as const },
    skillVersions: [],
    capabilityVersions: [{ id: "creation-chat", version: 1 }],
    contextRef,
    status: "queued" as const,
    retryable: false,
    deviated: false,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
  const userItem = {
    itemId: `user-${id}`,
    threadId: thread.threadId,
    turnId: turn.turnId,
    kind: "user" as const,
    text: id,
    status: "done" as const,
    retryable: false,
    deviated: false,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
  const queueItem = {
    queueItemId: `queue-${id}`,
    threadId: thread.threadId,
    turnId: turn.turnId,
    binding: projectBinding,
    target: { kind: "document" as const, documentId: `document-${id}`, anchor: { kind: "whole-document" as const } },
    preconditions: {},
    contextRef,
    model: turn.model,
    approvalPolicy: { mode: "step" as const, spend: "confirm" as const },
    skillVersions: [],
    capabilityVersions: turn.capabilityVersions,
    policyRevision: 1,
    attachmentRefs: [],
    originSurface: { surfaceId: `surface-${id}`, kind: "document" as const },
    enqueuedAt: occurredAt,
    status: "queued" as const,
    retryable: false,
    deviated: false,
    updatedAt: occurredAt,
  };
  return {
    mutation: {
      commandId: `enqueue-${id}`,
      expectedRevision,
      binding: projectBinding,
      sender: { kind: "renderer" as const, senderId: `renderer-${id}` },
      type: "turn.enqueue" as const,
      payload: { thread, turn, userItem, queueItem },
    },
    request: {
      prompt: options.prompt ?? id,
      capability: options.capability ?? "creation-chat",
      projectId: projectBinding.projectId,
    },
  };
}

function documentWriteAdapter(
  options: Readonly<{
    prepareError?: string;
    result?: AgentChatToolDecision;
  }> = {},
): PiDocumentWriteTransportAdapter & {
  prepare: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  const prepare = vi.fn(
    async (
      call: RuntimeToolCall,
      input: Readonly<{ documentId: string; target: TargetRef; preconditions: PreconditionSet }>,
      _signal: AbortSignal,
    ): Promise<PreparedDocumentWrite | null> => {
      if (options.prepareError) {
        throw Object.assign(new Error(options.prepareError), { code: options.prepareError });
      }
      const inputHash = createHash("sha256").update(JSON.stringify(call.args)).digest("hex");
      const actionHash = createHash("sha256")
        .update(
          JSON.stringify({ call: call.toolName, inputHash, target: input.target, preconditions: input.preconditions }),
        )
        .digest("hex");
      const invocation = {
        target: input.target,
        preconditions: input.preconditions,
        policyRevision: 1,
        inputHash,
        actionHash,
      } as unknown as PreparedDocumentWrite["invocation"];
      return Object.freeze({ call, invocation });
    },
  );
  const execute = vi.fn(
    async (_prepared: PreparedDocumentWrite, _signal: AbortSignal): Promise<AgentChatToolDecision> =>
      options.result ?? {
        ok: true,
        result: { applied: true, revision: 2, contentHash: "fnv1a-next" },
        silent: true,
      },
  );
  const dispose = vi.fn();
  return { prepare, execute, dispose } as unknown as PiDocumentWriteTransportAdapter & {
    prepare: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
}

function documentWriteResponse(
  call: RuntimeToolCall,
  decision: AgentChatToolDecision,
  provenance?: AgentChatResponse["provenance"],
): AgentChatResponse {
  return {
    id: `result-${call.toolCallId}`,
    status: "finished",
    text: "done",
    finishReason: "stop",
    artifacts: [],
    toolCalls: [
      {
        ...call,
        status: decision.ok ? "ok" : "denied",
        ...(decision.ok && decision.result !== undefined ? { result: decision.result } : {}),
        decision,
      },
    ],
    usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 1 },
    ...(provenance ? { provenance } : {}),
  };
}

function canvasWriteAdapter(
  options: Readonly<{
    prepareError?: string;
    prepareErrors?: readonly (string | undefined)[];
    includeRendererStoryboard?: boolean;
    result?: AgentChatToolDecision;
    executeError?: string;
  }> = {},
): PiCanvasWriteTransportAdapter & {
  prepare: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  let prepareCallCount = 0;
  const prepare = vi.fn(async (call: RuntimeToolCall, _signal: AbortSignal): Promise<PreparedCanvasWrite | null> => {
    const rendererStoryboardCall = options.includeRendererStoryboard
      && call.toolName === "nomi_canvas_plan"
      && call.args
      && typeof call.args === "object"
      && !Array.isArray(call.args)
      && ["propose_storyboard_plan", "patch_shots"].includes((call.args as Record<string, unknown>).operation as string);
    if (!rendererStoryboardCall && call.toolName !== "set_node_prompt" && call.toolName !== "create_canvas_nodes") return null;
    const prepareError = options.prepareErrors?.[prepareCallCount++] ?? options.prepareError;
    if (prepareError) {
      throw Object.assign(new Error(prepareError), { code: prepareError });
    }
    const invocation = {
      input: call.toolName === "create_canvas_nodes"
        ? { operation: "create_canvas_nodes", ...(call.args as Record<string, unknown>) }
        : { operation: "set_node_prompt", nodeId: "node-real", prompt: "new prompt" },
      target: { kind: "canvas", nodeIds: ["node-real"] },
      preconditions: { nodes: [{ nodeId: "node-real", contentHash: "sha256-node" }] },
      policyRevision: 1,
      inputHash: "input-hash",
      actionHash: "action-hash",
    } as unknown as PreparedCanvasWrite["invocation"];
    return Object.freeze({ call, invocation });
  });
  const execute = vi.fn(
    async (
      _prepared: PreparedCanvasWrite,
      approval: CanvasWriteApprovalAuthority,
      _signal: AbortSignal,
    ): Promise<AgentChatToolDecision> => {
      if (options.executeError) throw new Error(options.executeError);
      return (
        options.result ?? {
          ok: true,
          result: { applied: true, proposalId: approval.receiptProposalId },
          silent: true,
        }
      );
    },
  );
  const dispose = vi.fn();
  return { prepare, execute, dispose } as unknown as PiCanvasWriteTransportAdapter & {
    prepare: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
}

function timelineWriteAdapter(): PiTimelineWriteTransportAdapter & {
  prepare: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  const prepare = vi.fn(async (call: RuntimeToolCall): Promise<PreparedTimelineWrite | null> => {
    if (call.toolName !== "apply_edit_plan" && call.toolName !== "undo_timeline_edit") return null;
    const invocation = {
      input: { operation: "apply_edit_plan" },
      target: { kind: "timeline", clipIds: ["clip-a"] },
      preconditions: { timeline: { revision: "deadbeef" } },
      policyRevision: 1,
      inputHash: "timeline-input-hash",
      actionHash: "timeline-action-hash",
    } as unknown as PreparedTimelineWrite["invocation"];
    return Object.freeze({ call, invocation });
  });
  const execute = vi.fn(async (
    _prepared: PreparedTimelineWrite,
    _approval: TimelineWriteApprovalAuthority,
  ): Promise<AgentChatToolDecision> => ({
    ok: true,
    result: { operation: "apply_edit_plan", ok: true, revision: "cafebabe", applied: true },
    silent: true,
  }));
  const dispose = vi.fn();
  return { prepare, execute, dispose } as unknown as PiTimelineWriteTransportAdapter & {
    prepare: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
}

function committedCanvasReceipt(
  projectBinding: ProjectBinding,
  approval: CanvasWriteApprovalAuthority,
): ProjectAgentProposalReceiptView {
  return Object.freeze({
    binding: projectBinding,
    revision: 2,
    lifecycle: "committed" as const,
    proposalId: approval.receiptProposalId,
    operationId: "commit-canvas-proposal",
    proposal: Object.freeze({
      proposalId: approval.receiptProposalId,
      hostApprovalId: approval.approvalId,
      hostActionHash: approval.actionHash,
      summary: "Updated node prompt",
      stepLabels: Object.freeze(["Update prompt"]),
      compensation: Object.freeze([]),
      watchNodes: Object.freeze([]),
      reconciliationOk: true,
    }),
  });
}

function canvasExecutionInput(
  id: string,
  expectedRevision: number,
  projectBinding: ProjectBinding = binding,
): ExecutionInput {
  const base = executionInput(id, expectedRevision, projectBinding);
  return {
    ...base,
    mutation: {
      ...base.mutation,
      payload: {
        ...base.mutation.payload,
        queueItem: {
          ...base.mutation.payload.queueItem,
          target: { kind: "canvas", nodeIds: ["node-real"] },
          preconditions: { nodes: [{ nodeId: "node-real", contentHash: "sha256-node" }] },
          originSurface: { surfaceId: "canvas-surface", kind: "canvas" },
        },
      },
    },
  };
}

async function seedClaimedCanvasExecution(
  recoveryRoot: string,
  projectBinding: ProjectBinding,
  id: string,
): Promise<Readonly<{ approval: ProposalApprovalRef }>> {
  const host = createProjectAgentRepositoryRouter({ rootDir: recoveryRoot }).attach(projectBinding);
  const input = canvasExecutionInput(id, 0, projectBinding);
  let state = (await host.dispatch(input.mutation)).state;
  state = (
    await host.dispatch({
      commandId: `start-${id}`,
      expectedRevision: state.hostRevision,
      binding: projectBinding,
      sender: { kind: "internal", senderId: "test" },
      type: "turn.start",
      payload: {
        turnId: input.mutation.payload.turn.turnId,
        queueItemId: input.mutation.payload.queueItem.queueItemId,
        assistantItem: {
          itemId: `assistant-${id}`,
          threadId: input.mutation.payload.thread.threadId,
          turnId: input.mutation.payload.turn.turnId,
          kind: "assistant",
          text: "",
          textRevision: 0,
          status: "running",
          retryable: false,
          deviated: false,
          createdAt: "2026-08-28T00:00:00.000Z",
          updatedAt: "2026-08-28T00:00:00.000Z",
        },
        occurredAt: "2026-08-28T00:00:00.000Z",
      },
    })
  ).state;
  const approval: ProposalApprovalRef = Object.freeze({
    approvalId: `approval-${id}`,
    receiptProposalId: `receipt-${id}`,
    threadId: input.mutation.payload.thread.threadId,
    turnId: input.mutation.payload.turn.turnId,
    toolCallId: `tool-${id}`,
    policyRevision: input.mutation.payload.queueItem.policyRevision,
    inputHash: "b".repeat(64),
    actionHash: "a".repeat(64),
    target: input.mutation.payload.queueItem.target,
    preconditions: input.mutation.payload.queueItem.preconditions,
    expiresAt: "2026-08-29T00:00:00.000Z",
  });
  state = (
    await host.dispatch({
      commandId: `proposal-${id}`,
      expectedRevision: state.hostRevision,
      binding: projectBinding,
      sender: { kind: "internal", senderId: "test" },
      type: "proposal.put",
      payload: {
        approval: { ref: approval, lifecycle: "pending" },
        item: {
          itemId: `proposal-${id}`,
          threadId: approval.threadId,
          turnId: approval.turnId,
          kind: "proposal",
          approval,
          status: "proposed",
          retryable: false,
          deviated: false,
          createdAt: "2026-08-28T00:00:00.000Z",
          updatedAt: "2026-08-28T00:00:00.000Z",
        },
        occurredAt: "2026-08-28T00:00:00.000Z",
      },
    })
  ).state;
  await host.dispatch({
    commandId: `claim-${id}`,
    expectedRevision: state.hostRevision,
    binding: projectBinding,
    sender: { kind: "internal", senderId: "test" },
    type: "proposal.transition",
    payload: {
      approvalId: approval.approvalId,
      lifecycle: "claimed",
      occurredAt: "2026-08-28T00:00:00.000Z",
    },
  });
  return Object.freeze({ approval });
}

async function seedSecondClaimedCanvasApproval(
  recoveryRoot: string,
  projectBinding: ProjectBinding,
  first: ProposalApprovalRef,
): Promise<ProposalApprovalRef> {
  const host = createProjectAgentRepositoryRouter({ rootDir: recoveryRoot }).attach(projectBinding);
  let state = host.getSnapshot(projectBinding);
  const approval: ProposalApprovalRef = Object.freeze({
    ...first,
    approvalId: `${first.approvalId}-second`,
    receiptProposalId: `${first.receiptProposalId}-second`,
    toolCallId: `${first.toolCallId}-second`,
    inputHash: "d".repeat(64),
    actionHash: "c".repeat(64),
  });
  state = (
    await host.dispatch({
      commandId: `proposal-${approval.approvalId}`,
      expectedRevision: state.hostRevision,
      binding: projectBinding,
      sender: { kind: "internal", senderId: "test" },
      type: "proposal.put",
      payload: {
        approval: { ref: approval, lifecycle: "pending" },
        item: {
          itemId: `proposal-${approval.approvalId}`,
          threadId: approval.threadId,
          turnId: approval.turnId,
          kind: "proposal",
          approval,
          status: "proposed",
          retryable: false,
          deviated: false,
          createdAt: "2026-08-28T00:00:00.000Z",
          updatedAt: "2026-08-28T00:00:00.000Z",
        },
        occurredAt: "2026-08-28T00:00:00.000Z",
      },
    })
  ).state;
  await host.dispatch({
    commandId: `claim-${approval.approvalId}`,
    expectedRevision: state.hostRevision,
    binding: projectBinding,
    sender: { kind: "internal", senderId: "test" },
    type: "proposal.transition",
    payload: {
      approvalId: approval.approvalId,
      lifecycle: "claimed",
      occurredAt: "2026-08-28T00:00:00.000Z",
    },
  });
  return approval;
}

function canvasWriteResponse(call: RuntimeToolCall, decision: AgentChatToolDecision): AgentChatResponse {
  return {
    id: `result-${call.toolCallId}`,
    status: "finished",
    text: "done",
    finishReason: "stop",
    artifacts: [],
    toolCalls: [{ ...call, status: decision.ok ? "ok" : "denied", decision }],
    usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 1 },
  };
}

let root = "";

afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = "";
});

describe("ProjectAgentExecutionCoordinator", () => {
  it("exposes the committed terminal turn to the experience completion side effect", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-experience-completion-"));
    const onTurnCompleted = vi.fn();
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => "subscription-experience-completion",
      {
        onTurnCompleted,
        runAgent: async () => ({
          id: "experience-result",
          status: "finished",
          text: "done",
          finishReason: "stop",
          artifacts: [],
          toolCalls: [],
          usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 1 },
        } satisfies AgentChatResponse),
      },
    );
    const opened = await coordinator.open(binding);
    const input = executionInput("experience-completion", 0, binding, { prompt: "验证这个任务" });

    await coordinator.enqueue(opened.subscriptionId, input);
    const terminal = await coordinator.waitForTurn(opened.subscriptionId, input.mutation.payload.turn.turnId);

    expect(terminal.turns.find((turn) => turn.turnId === input.mutation.payload.turn.turnId)?.status).toBe("done");
    expect(onTurnCompleted).toHaveBeenCalledTimes(1);
    expect(onTurnCompleted.mock.calls[0]?.[0]).toMatchObject({
      binding,
      turnId: input.mutation.payload.turn.turnId,
      executionToken: input.mutation.payload.turn.executionToken,
      request: { prompt: "验证这个任务" },
      response: { text: "done", status: "finished" },
      state: { turns: expect.arrayContaining([expect.objectContaining({ turnId: input.mutation.payload.turn.turnId, status: "done" })]) },
    });
  });

  it("runs the default experience loop from the canonical Host terminal path", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-experience-default-"));
    setEventLogProjectDirResolverForTests(() => root);
    setExperienceProjectDirResolverForTests(() => root);
    try {
      const coordinator = createProjectAgentExecutionCoordinator(
        createProjectAgentRepositoryRouter({ rootDir: root }),
        () => "subscription-experience-default",
        {
          runAgent: async () => ({
            id: "experience-default-result",
            status: "finished",
            text: "<!-- nomi-learning {\"kind\":\"fact\",\"title\":\"Host 终态证据\",\"content\":\"只从已提交终态沉淀\",\"evidence\":{\"problem\":\"缺少可追溯终态\",\"action\":\"由 canonical Host 写入完成事件\",\"outcome\":\"经验候选已落盘\",\"verification\":\"EventLog 与候选投影均存在\",\"eventSeqs\":[1]},\"confidence\":0.9} } -->",
            finishReason: "stop",
            artifacts: [],
            toolCalls: [],
            usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 1 },
          } satisfies AgentChatResponse),
        },
      );
      const opened = await coordinator.open(binding);
      const input = executionInput("experience-default", 0, binding, { prompt: "验证默认经验闭环" });

      await coordinator.enqueue(opened.subscriptionId, input);
      const terminal = await coordinator.waitForTurn(opened.subscriptionId, input.mutation.payload.turn.turnId);
      await vi.waitFor(() => expect(getExperienceRepository().list(binding.projectId)).toHaveLength(1));

      expect(terminal.turns.find((turn) => turn.turnId === input.mutation.payload.turn.turnId)?.status).toBe("done");
      expect(readEvents(binding.projectId).map((event) => event.type)).toEqual([
        "agent.turn.finished",
        "experience.candidate.created",
      ]);
      expect(getExperienceRepository().list(binding.projectId)[0]).toMatchObject({
        kind: "fact",
        status: "active",
        eligibleForPrompt: true,
      });
    } finally {
      setEventLogProjectDirResolverForTests(() => null);
      setExperienceProjectDirResolverForTests(() => null);
      resetExperienceRepositoryForTests();
    }
  });

  it("keeps a completion side-effect failure off the committed result path", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-experience-failure-"));
    const onTurnCompleted = vi.fn(async () => {
      throw new Error("experience persistence unavailable");
    });
    logged.length = 0;
    try {
      const coordinator = createProjectAgentExecutionCoordinator(
        createProjectAgentRepositoryRouter({ rootDir: root }),
        () => "subscription-experience-failure",
        {
          onTurnCompleted,
          runAgent: async () => ({
            id: "experience-failure-result",
            status: "finished",
            text: "done",
            finishReason: "stop",
            artifacts: [],
            toolCalls: [],
            usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 1 },
          } satisfies AgentChatResponse),
        },
      );
      const opened = await coordinator.open(binding);
      const input = executionInput("experience-failure", 0, binding, { prompt: "验证副作用隔离" });

      await coordinator.enqueue(opened.subscriptionId, input);
      const terminal = await coordinator.waitForTurn(opened.subscriptionId, input.mutation.payload.turn.turnId);
      await vi.waitFor(() =>
        expect(logged.filter((entry) => entry.event === "completion-side-effect-failed")).toHaveLength(1),
      );

      expect(terminal.turns.find((turn) => turn.turnId === input.mutation.payload.turn.turnId)?.status).toBe("done");
      expect(onTurnCompleted).toHaveBeenCalledOnce();
    } finally {
    }
  });

  it("binds every resident turn of one thread to the same durable context, so later turns can cite earlier tool results", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-thread-history-"));
    const router = createProjectAgentRepositoryRouter({ rootDir: root });
    const observed: AgentChatRequest[] = [];
    const coordinator = createProjectAgentExecutionCoordinator(router, () => "subscription-thread-history", {
      runAgent: async (request) => {
        observed[observed.length] = request;
        return {
          id: `result-${observed.length}`,
          status: "finished",
          text: "done",
          finishReason: "stop",
          artifacts: [],
          toolCalls: [],
          usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 1 },
        } satisfies AgentChatResponse;
      },
    });
    const opened = await coordinator.open(binding);
    let revision = 0;
    for (const [index, prompt] of ["\u68c0\u67e5\u65f6\u95f4\u8f74", "\u628a\u6700\u957f\u90a3\u6bb5\u5220\u6389", "\u6539\u56de\u53bb"].entries()) {
      const input = executionInput(`history-${index}`, revision, binding, { threadId: "thread-resident", prompt });
      await coordinator.enqueue(opened.subscriptionId, input);
      await coordinator.waitForTurn(opened.subscriptionId, input.mutation.payload.turn.turnId);
      revision = coordinator.snapshot(opened.subscriptionId).hostRevision;
    }

    const expected = createProjectAgentContextBinding(binding, "thread-resident");
    expect(observed).toHaveLength(3);
    for (const request of observed) {
      expect(request.history).toEqual({ kind: "persistent", binding: expected });
    }
    // The prompt carries only this turn's request: prior turns live in the durable
    // context as structured messages, never re-narrated as prose that drops tool results.
    expect(observed[2].prompt).toBe("\u6539\u56de\u53bb");
    expect(observed[2].prompt).not.toContain("\u68c0\u67e5\u65f6\u95f4\u8f74");
    expect(observed[2].prompt).not.toContain("\u7528\u6237\uff1a");
  });

  it("gives a second thread of the same project its own context instead of one project-wide transcript", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-thread-isolation-"));
    const router = createProjectAgentRepositoryRouter({ rootDir: root });
    const observed: AgentChatRequest[] = [];
    const coordinator = createProjectAgentExecutionCoordinator(router, () => "subscription-thread-isolation", {
      runAgent: async (request) => {
        observed[observed.length] = request;
        return {
          id: `result-${observed.length}`,
          status: "finished",
          text: "done",
          finishReason: "stop",
          artifacts: [],
          toolCalls: [],
          usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 1 },
        } satisfies AgentChatResponse;
      },
    });
    const opened = await coordinator.open(binding);
    const first = executionInput("isolation-a", 0, binding, { threadId: "thread-a" });
    await coordinator.enqueue(opened.subscriptionId, first);
    await coordinator.waitForTurn(opened.subscriptionId, first.mutation.payload.turn.turnId);
    const second = executionInput("isolation-b", coordinator.snapshot(opened.subscriptionId).hostRevision, binding, {
      threadId: "thread-b",
    });
    await coordinator.enqueue(opened.subscriptionId, second);
    await coordinator.waitForTurn(opened.subscriptionId, second.mutation.payload.turn.turnId);

    expect(observed[0].history).toEqual({
      kind: "persistent", binding: createProjectAgentContextBinding(binding, "thread-a"),
    });
    expect(observed[1].history).toEqual({
      kind: "persistent", binding: createProjectAgentContextBinding(binding, "thread-b"),
    });
  });

  it("keeps single-shot planning and judging ephemeral so they never inherit a resident transcript", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-single-shot-history-"));
    const router = createProjectAgentRepositoryRouter({ rootDir: root });
    let observed: AgentChatRequest | undefined;
    const coordinator = createProjectAgentExecutionCoordinator(router, () => "subscription-single-shot-history", {
      runAgent: async (request) => {
        observed = request;
        return {
          id: "result-single-shot-history",
          status: "finished",
          text: "done",
          finishReason: "stop",
          artifacts: [],
          toolCalls: [],
          usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 1 },
        } satisfies AgentChatResponse;
      },
    });
    const opened = await coordinator.open(binding);
    const input = executionInput("single-shot-history", 0, binding, { capability: "single-shot" });
    await coordinator.enqueue(opened.subscriptionId, input);
    await coordinator.waitForTurn(opened.subscriptionId, input.mutation.payload.turn.turnId);

    expect(observed?.history).toEqual({ kind: "ephemeral" });
  });

  it("uses the Host turn work mode when freezing the runtime request", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-work-mode-freeze-"));
    const router = createProjectAgentRepositoryRouter({ rootDir: root });
    let observedRequest: AgentChatRequest | undefined;
    const coordinator = createProjectAgentExecutionCoordinator(router, () => "subscription-work-mode-freeze", {
      runAgent: async (request) => {
        observedRequest = request;
        return {
          id: "result-work-mode-freeze",
          status: "finished",
          text: "done",
          finishReason: "stop",
          artifacts: [],
          toolCalls: [],
          usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 1 },
        } satisfies AgentChatResponse;
      },
    });
    const opened = await coordinator.open(binding);
    const base = executionInput("work-mode-freeze", 0);
    const input: ExecutionInput = {
      ...base,
      mutation: {
        ...base.mutation,
        payload: {
          ...base.mutation.payload,
          turn: { ...base.mutation.payload.turn, workMode: "editSelection" },
          queueItem: { ...base.mutation.payload.queueItem, workMode: "editSelection" },
        },
      },
      request: {
        ...base.request,
        workMode: "agent",
        approvalPolicy: { mode: "project", spend: "within-budget" },
      } as ProjectAgentExecutionRequest,
    };

    await coordinator.enqueue(opened.subscriptionId, input);
    await coordinator.waitForTurn(opened.subscriptionId, input.mutation.payload.turn.turnId);

    expect(observedRequest?.workMode).toBe("editSelection");
    expect((observedRequest as AgentChatRequest & { approvalPolicy?: unknown }).approvalPolicy).toBeUndefined();
  });

  it("denies an Ask-mode write before it reaches the document adapter", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-ask-read-only-"));
    const documentAdapter = documentWriteAdapter();
    let observedDecision: AgentChatToolDecision | undefined;
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => "subscription-ask-read-only",
      {
        runAgent: async (_request, hooks) => {
          const call = { toolCallId: "tool-ask-write", toolName: "append_to_end", args: { content: "x" } };
          observedDecision = await hooks.awaitToolConfirmation(call, hooks.abortSignal!);
          return documentWriteResponse(call, observedDecision);
        },
      },
    );
    const opened = await coordinator.open(binding, { documentWrite: documentAdapter });
    const base = executionInput("ask-read-only", 0);
    const input: ExecutionInput = {
      ...base,
      mutation: {
        ...base.mutation,
        payload: {
          ...base.mutation.payload,
          turn: { ...base.mutation.payload.turn, workMode: "ask" },
          queueItem: { ...base.mutation.payload.queueItem, workMode: "ask" },
        },
      },
      request: { ...base.request, workMode: "agent" } as AgentChatRequest,
    };

    await coordinator.enqueue(opened.subscriptionId, input);
    await coordinator.waitForTurn(opened.subscriptionId, input.mutation.payload.turn.turnId);

    expect(observedDecision).toMatchObject({ ok: false, denied: true, message: expect.stringContaining("Ask") });
    expect(documentAdapter.prepare).not.toHaveBeenCalled();
    expect(documentAdapter.execute).not.toHaveBeenCalled();
  });

  it("persists terminal model usage on the Host turn and restores it after reopening", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-usage-ledger-"));
    const usage = { promptTokens: 17, completionTokens: 5, cachedPromptTokens: 3, totalTokens: 22 } as const;
    const createCoordinator = () => createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => "subscription-usage-ledger",
      {
        runAgent: async () => ({
          id: "usage-result",
          status: "finished",
          text: "done",
          finishReason: "stop",
          artifacts: [],
          toolCalls: [],
          usage,
        }),
      },
    );
    const input = executionInput("usage-ledger", 0);
    const first = createCoordinator();
    const opened = await first.open(input.mutation.binding);
    await first.enqueue(opened.subscriptionId, input);
    await first.waitForTurn(opened.subscriptionId, input.mutation.payload.turn.turnId);
    expect(first.snapshot(opened.subscriptionId).turns[0]?.usage).toEqual(usage);
    first.release(opened.subscriptionId);

    const reopened = createCoordinator();
    const restored = await reopened.open(input.mutation.binding);
    expect(reopened.snapshot(restored.subscriptionId).turns[0]?.usage).toEqual(usage);
    reopened.release(restored.subscriptionId);
  });

  it("keeps the runtime's own reason for a failed turn, instead of a status word with nothing behind it", async () => {
    // 运行时把「这一回合为什么没成」的人话只在 hooks 上说一次。宿主以前只认 content-delta，
    // 那句话被原地丢掉：落盘只剩一个 `failed`，对话流里一条 failure 都没有，渲染层于是只能
    // 印一句「发送失败，请检查后重试。」——真机上一次 400 就是这么变成「什么都没说」的。
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-runtime-failure-"));
    const reason = "（HTTP 400）Invalid JSON payload received. Unknown name \"const\"";
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => "subscription-runtime-failure",
      {
        runAgent: async (_request, hooks) => {
          hooks.emit({ type: "error", message: reason });
          return {
            id: "runtime-failure-result",
            status: "error",
            text: "",
            finishReason: "error",
            artifacts: [],
            toolCalls: [],
            usage: { promptTokens: 0, completionTokens: 0, cachedPromptTokens: 0, totalTokens: 0 },
          };
        },
      },
    );
    const input = executionInput("runtime-failure", 0);
    const opened = await coordinator.open(input.mutation.binding);
    await coordinator.enqueue(opened.subscriptionId, input);
    await coordinator.waitForTurn(opened.subscriptionId, input.mutation.payload.turn.turnId);
    const state = coordinator.snapshot(opened.subscriptionId);
    expect(state.turns[0]?.status).toBe("failed");
    const failure = state.items.find((item) => item.kind === "failure");
    expect(failure, "失败的回合必须在对话流里留下一条能读的痕迹").toBeDefined();
    expect(failure?.kind === "failure" ? failure.message : "").toBe(reason);
    coordinator.release(opened.subscriptionId);
  });

  it("reuses one approval for reversible edits while preserving a receipt per write", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-safe-auto-"));
    const documentAdapter = documentWriteAdapter();
    const calls = [
      { toolCallId: "tool-safe-1", toolName: "append_to_end", args: { content: "first" } },
      { toolCallId: "tool-safe-2", toolName: "append_to_end", args: { content: "second" } },
    ];
    const decisions: AgentChatToolDecision[] = [];
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => "subscription-safe-auto",
      {
        runAgent: async (_request, hooks) => {
          for (const call of calls) decisions.push(await hooks.awaitToolConfirmation(call, hooks.abortSignal!));
          return {
            id: "result-safe-auto",
            status: "finished",
            text: "done",
            finishReason: "stop",
            artifacts: [],
            toolCalls: calls.map((call, index) => ({ ...call, status: decisions[index]?.ok ? "ok" as const : "denied" as const, decision: decisions[index]! })),
            usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 1 },
          } satisfies AgentChatResponse;
        },
      },
    );
    const opened = await coordinator.open(binding, { documentWrite: documentAdapter });
    let toolEvents = 0;
    coordinator.subscribe(opened.subscriptionId, (event) => {
      if (event.type !== "tool-call") return;
      toolEvents += 1;
      void coordinator.resolveToolDecision(opened.subscriptionId, event.turnId, event.toolCallId, { ok: true, result: { approved: true } });
    });
    const base = executionInput("safe-auto", 0);
    const input: ExecutionInput = {
      ...base,
      mutation: { ...base.mutation, payload: {
        ...base.mutation.payload,
        turn: { ...base.mutation.payload.turn, approvalPolicy: { mode: "safe-auto", spend: "confirm" } },
        queueItem: { ...base.mutation.payload.queueItem, approvalPolicy: { mode: "safe-auto", spend: "confirm" } },
      } },
    };
    await coordinator.enqueue(opened.subscriptionId, input);
    const final = await coordinator.waitForTurn(opened.subscriptionId, input.mutation.payload.turn.turnId);
    expect(toolEvents).toBe(0);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toMatchObject({ ok: true, silent: true });
    expect(decisions[1]).toMatchObject({ ok: true, silent: true });
    expect(documentAdapter.execute).toHaveBeenCalledTimes(2);
    expect(final.items.filter((item) => item.kind === "proposal")).toHaveLength(2);
    coordinator.release(opened.subscriptionId);
  });

  it("reserves the first frozen request while a same-turn enqueue is still dispatching", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-request-reservation-"));
    const backingRouter = createProjectAgentRepositoryRouter({ rootDir: root });
    const backingHost = backingRouter.attach(binding);
    let releaseDispatch!: () => void;
    const dispatchGate = new Promise<void>((resolve) => {
      releaseDispatch = resolve;
    });
    let dispatchEntered!: () => void;
    const firstDispatchEntered = new Promise<void>((resolve) => {
      dispatchEntered = resolve;
    });
    let enqueueDispatchCount = 0;
    const host = {
      ...backingHost,
      dispatch: (mutation: ProjectAgentMutation) => {
        if (mutation.type !== "turn.enqueue") return backingHost.dispatch(mutation);
        enqueueDispatchCount += 1;
        if (enqueueDispatchCount === 1) dispatchEntered();
        return dispatchGate.then(() => backingHost.dispatch(mutation));
      },
    };
    const router = {
      attach: () => host,
      repositoryFor: backingRouter.repositoryFor,
      partitionCount: backingRouter.partitionCount,
    } as unknown as Parameters<typeof createProjectAgentExecutionCoordinator>[0];
    const executedPrompts: string[] = [];
    const coordinator = createProjectAgentExecutionCoordinator(router, () => "subscription-request-reservation", {
      runAgent: async (request) => {
        executedPrompts.push(request.prompt);
        return {
          id: "result-request-reservation",
          status: "finished",
          text: "done",
          finishReason: "stop",
          artifacts: [],
          toolCalls: [],
          usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 1 },
        } satisfies AgentChatResponse;
      },
    });
    const opened = await coordinator.open(binding);
    const firstInput = executionInput("request-reservation", 0);
    const firstEnqueue = coordinator.enqueue(opened.subscriptionId, firstInput);
    await firstDispatchEntered;

    const conflictingRequest = expect(
      coordinator.enqueue(opened.subscriptionId, {
        mutation: firstInput.mutation,
        request: { ...firstInput.request, prompt: "replacement-request" },
      }),
    ).rejects.toThrow(ProjectAgentSubscriptionError);
    const exactReplay = coordinator.enqueue(opened.subscriptionId, firstInput);

    releaseDispatch();
    await conflictingRequest;
    const reductions = await Promise.all([firstEnqueue, exactReplay]);
    expect(reductions.map((reduction) => reduction.replayed).sort()).toEqual([false, true]);
    await coordinator.waitForTurn(opened.subscriptionId, firstInput.mutation.payload.turn.turnId);
    expect(executedPrompts).toEqual(["request-reservation"]);
    expect(enqueueDispatchCount).toBe(2);
  });

  it("replays pre-live notifications once in order before switching the subscription live", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-pre-live-buffer-"));
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => "subscription-pre-live",
    );
    const opened = await coordinator.open(binding);
    expect(opened.snapshot.hostRevision).toBe(0);
    const putThread = (id: string, expectedRevision: number): ProjectAgentMutation => ({
      commandId: `put-${id}`,
      expectedRevision,
      binding,
      sender: { kind: "renderer", senderId: opened.subscriptionId },
      type: "thread.put",
      payload: {
        thread: {
          threadId: id,
          createdAt: "2026-08-28T00:00:00.000Z",
          updatedAt: "2026-08-28T00:00:00.000Z",
        },
      },
    });
    await coordinator.dispatch(opened.subscriptionId, putThread("thread-buffer-a", 0));
    await coordinator.dispatch(opened.subscriptionId, putThread("thread-buffer-b", 1));

    const revisions: number[] = [];
    coordinator.subscribe(opened.subscriptionId, (event) => {
      if (event.type === "patch") revisions.push(event.patch.hostRevision);
    });
    expect(revisions).toEqual([1, 2]);

    await coordinator.dispatch(opened.subscriptionId, putThread("thread-buffer-live", 2));
    expect(revisions).toEqual([1, 2, 3]);
  });

  it("keeps different ProjectBinding partitions strictly isolated", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-binding-isolation-"));
    const subscriptionIds = ["subscription-binding-a", "subscription-binding-b"];
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => subscriptionIds.shift()!,
    );
    const otherBinding = {
      projectId: "project-b",
      immutableProjectUuid: "22222222-2222-4222-8222-222222222222",
      projectGeneration: 1,
    } as const;
    const first = await coordinator.open(binding);
    const second = await coordinator.open(otherBinding);
    const secondEvents: ProjectAgentExecutionEvent[] = [];
    coordinator.subscribe(second.subscriptionId, (event) => secondEvents.push(event));

    await coordinator.dispatch(first.subscriptionId, {
      commandId: "put-binding-a-thread",
      expectedRevision: 0,
      binding,
      sender: { kind: "renderer", senderId: first.subscriptionId },
      type: "thread.put",
      payload: {
        thread: {
          threadId: "thread-binding-a",
          createdAt: "2026-08-28T00:00:00.000Z",
          updatedAt: "2026-08-28T00:00:00.000Z",
        },
      },
    });

    expect(coordinator.snapshot(first.subscriptionId).hostRevision).toBe(1);
    expect(coordinator.snapshot(second.subscriptionId).hostRevision).toBe(0);
    expect(secondEvents).toEqual([]);
  });

  it("shares one binding FIFO and monotonic fanout across live subscriptions", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-partition-"));
    const subscriptionIds = ["subscription-partition-a", "subscription-partition-b"];
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstStarted!: () => void;
    const firstStart = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const calls: string[] = [];
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => subscriptionIds.shift()!,
      {
        runAgent: async (request) => {
          calls.push(request.prompt);
          if (request.prompt === "partition-a") {
            firstStarted();
            await firstBlocked;
          }
          return {
            id: `result-${request.prompt}`,
            status: "finished",
            text: request.prompt,
            finishReason: "stop",
            artifacts: [],
            toolCalls: [],
            usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 1 },
          } satisfies AgentChatResponse;
        },
      },
    );
    const first = await coordinator.open(binding);
    const second = await coordinator.open(binding);
    const firstEvents: ProjectAgentExecutionEvent[] = [];
    const secondEvents: ProjectAgentExecutionEvent[] = [];
    coordinator.subscribe(first.subscriptionId, (event) => firstEvents.push(event));
    coordinator.subscribe(second.subscriptionId, (event) => secondEvents.push(event));

    const firstInput = executionInput("partition-a", 0);
    await coordinator.enqueue(first.subscriptionId, firstInput);
    await firstStart;
    const secondInput = executionInput("partition-b", coordinator.snapshot(second.subscriptionId).hostRevision);
    await coordinator.enqueue(second.subscriptionId, secondInput);
    expect(calls).toEqual(["partition-a"]);

    coordinator.release(first.subscriptionId);
    releaseFirst();
    await coordinator.waitForTurn(second.subscriptionId, firstInput.mutation.payload.turn.turnId);
    await coordinator.waitForTurn(second.subscriptionId, secondInput.mutation.payload.turn.turnId);

    expect(calls).toEqual(["partition-a", "partition-b"]);
    expect(secondEvents.filter((event) => event.type === "execution-result").map((event) => event.turnId)).toEqual([
      "turn-partition-a",
      "turn-partition-b",
    ]);
    expect(
      firstEvents.every((event) => event.subscriptionId === first.subscriptionId && event.subscriptionEpoch === 1),
    ).toBe(true);
    expect(
      secondEvents.every((event) => event.subscriptionId === second.subscriptionId && event.subscriptionEpoch === 2),
    ).toBe(true);
    const firstPatchRevisions = firstEvents
      .filter((event) => event.type === "patch")
      .map((event) => event.patch.hostRevision);
    const secondPatchRevisions = secondEvents
      .filter((event) => event.type === "patch")
      .map((event) => event.patch.hostRevision);
    expect(firstPatchRevisions).toEqual(secondPatchRevisions.slice(0, firstPatchRevisions.length));
    expect(secondPatchRevisions).toEqual([...secondPatchRevisions].sort((left, right) => left - right));
  });

  it("keeps a Thread's tool profile sticky for KV-cache stability", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-tool-profile-"));
    const seen: Array<{ profile: AgentChatRequest["toolProfile"] }> = [];
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => "subscription-tool-profile",
      {
        runAgent: async (request) => {
          seen.push({ profile: request.toolProfile });
          return {
            id: `result-${seen.length}`,
            status: "finished",
            text: "done",
            finishReason: "stop",
            artifacts: [],
            toolCalls: [],
            usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 1, totalTokens: 1 },
          } satisfies AgentChatResponse;
        },
      },
    );
    const opened = await coordinator.open(binding);
    const first = executionInput("profile-first", 0, binding, {
      threadId: "thread-sticky-profile",
      prompt: "检查时间线并导出",
      capability: "canvas-agent",
    });
    await coordinator.enqueue(opened.subscriptionId, first);
    const firstState = await coordinator.waitForTurn(opened.subscriptionId, first.mutation.payload.turn.turnId);
    const second = executionInput("profile-second", firstState.hostRevision, binding, {
      threadId: "thread-sticky-profile",
      prompt: "继续",
      capability: "canvas-agent",
    });
    await coordinator.enqueue(opened.subscriptionId, second);
    await coordinator.waitForTurn(opened.subscriptionId, second.mutation.payload.turn.turnId);

    expect(seen.map(({ profile }) => profile)).toEqual(["timeline", "timeline"]);
  });

  it("routes a started ProductionRun through Host history and a task ref", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-production-host-"));
    const productionRun = {
      tryExecute: vi.fn(async (call: RuntimeToolCall) => call.toolName === "start_production_run"
        ? {
            ok: true as const,
            result: { runId: "run-host-1", revision: 1, stageId: "direction" },
            silent: true as const,
          }
        : null),
      prepare: vi.fn(async () => null),
      execute: vi.fn(async () => ({ ok: false as const, code: "unexpected_execute" })),
      dispose: vi.fn(),
    } as unknown as PiProductionRunTransportAdapter & {
      tryExecute: ReturnType<typeof vi.fn>;
      prepare: ReturnType<typeof vi.fn>;
      execute: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    };
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => "subscription-production-host",
      {
        productionRun: () => productionRun,
        runAgent: async (_request, hooks) => {
          const call = {
            toolCallId: "production-start-1",
            toolName: "start_production_run",
            args: { goal: "做一个五分钟品牌片" },
          };
          const decision = await hooks.awaitToolConfirmation(call, hooks.abortSignal!);
          return {
            id: "production-result-1",
            status: "finished",
            text: "已建立制作任务草稿。",
            finishReason: "toolUse",
            artifacts: [],
            toolCalls: [{ ...call, status: decision.ok ? "ok" as const : "error" as const, decision, ...(decision.ok ? { result: decision.result } : {}) }],
            usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 1, totalTokens: 1 },
          } satisfies AgentChatResponse;
        },
      },
    );
    const opened = await coordinator.open(binding);
    const input = executionInput("production-host", 0, binding, {
      prompt: "帮我做一个 5 分钟品牌视频",
      capability: "canvas-agent",
    });
    await coordinator.enqueue(opened.subscriptionId, input);
    const state = await coordinator.waitForTurn(opened.subscriptionId, input.mutation.payload.turn.turnId);
    expect(productionRun.tryExecute).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "start_production_run" }),
      expect.any(AbortSignal),
    );
    expect(state.items.some((item) => item.kind === "tool" && item.toolCallId === "production-start-1")).toBe(true);
    expect(state.items).toContainEqual(expect.objectContaining({
      kind: "task",
      task: expect.objectContaining({ kind: "production-run", runId: "run-host-1", stageId: "direction" }),
    }));
    expect(productionRun.execute).not.toHaveBeenCalled();
  });

  it("reattaches a pending decision after release without aborting or executing twice", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-reattach-"));
    const subscriptionIds = ["subscription-reattach-a", "subscription-reattach-b"];
    let runCount = 0;
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => subscriptionIds.shift()!,
      {
        runAgent: async (_request, hooks) => {
          runCount += 1;
          const call = { toolCallId: "tool-reattach", toolName: "write_document", args: { text: "x" } };
          hooks.emit({ type: "tool-call", ...call });
          const decision = await hooks.awaitToolConfirmation(call, hooks.abortSignal!);
          return {
            id: "result-reattach",
            status: "finished",
            text: "done",
            finishReason: "stop",
            artifacts: [],
            toolCalls: [{ ...call, status: "ok", result: { applied: true }, decision }],
            usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 1 },
          } satisfies AgentChatResponse;
        },
      },
    );
    const first = await coordinator.open(binding);
    let firstPending!: Extract<ProjectAgentExecutionEvent, { type: "tool-call" }>;
    const pendingSeen = new Promise<void>((resolve) => {
      coordinator.subscribe(first.subscriptionId, (event) => {
        if (event.type === "tool-call") {
          firstPending = event;
          resolve();
        }
      });
    });
    const input = executionInput("reattach", 0);
    await coordinator.enqueue(first.subscriptionId, input);
    await pendingSeen;
    coordinator.release(first.subscriptionId);
    expect(() => coordinator.snapshot(first.subscriptionId)).toThrow(ProjectAgentSubscriptionError);

    const second = await coordinator.open(binding);
    expect(second.subscriptionEpoch).toBeGreaterThan(first.subscriptionEpoch);
    let replayed!: Extract<ProjectAgentExecutionEvent, { type: "tool-call" }>;
    coordinator.subscribe(second.subscriptionId, (event) => {
      if (event.type === "tool-call") replayed = event;
    });
    expect(replayed).toMatchObject({
      subscriptionId: second.subscriptionId,
      subscriptionEpoch: second.subscriptionEpoch,
      turnId: firstPending.turnId,
      executionToken: firstPending.executionToken,
      toolCallId: firstPending.toolCallId,
    });
    await expect(
      coordinator.resolveToolDecision(first.subscriptionId, firstPending.turnId, firstPending.toolCallId, {
        ok: true,
      }),
    ).rejects.toThrow(ProjectAgentSubscriptionError);
    await coordinator.resolveToolDecision(second.subscriptionId, replayed.turnId, replayed.toolCallId, {
      ok: true,
      result: { applied: true },
    });
    const final = await coordinator.waitForTurn(second.subscriptionId, replayed.turnId);
    expect(final.turns.find((turn) => turn.turnId === replayed.turnId)?.status).toBe("done");
    expect(runCount).toBe(1);
  });

  it("atomically terminalizes process-restart orphans exactly once without running the model", async () => {
    for (const orphanStatus of ["queued", "running", "proposed"] as const) {
      const projectBinding = { ...binding, projectId: `project-recovery-${orphanStatus}`, projectGeneration: 2 };
      const recoveryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-recovery-"));
      const seedRouter = createProjectAgentRepositoryRouter({ rootDir: recoveryRoot });
      const host = seedRouter.attach(projectBinding);
      const input = executionInput(`recovery-${orphanStatus}`, 0, projectBinding);
      let state = (await host.dispatch(input.mutation)).state;
      if (orphanStatus !== "queued") {
        state = (
          await host.dispatch({
            commandId: `start-recovery-${orphanStatus}`,
            expectedRevision: state.hostRevision,
            binding: projectBinding,
            sender: { kind: "internal", senderId: "test" },
            type: "turn.start",
            payload: {
              turnId: input.mutation.payload.turn.turnId,
              queueItemId: input.mutation.payload.queueItem.queueItemId,
              assistantItem: {
                itemId: `assistant-recovery-${orphanStatus}`,
                threadId: input.mutation.payload.thread.threadId,
                turnId: input.mutation.payload.turn.turnId,
                kind: "assistant",
                text: "",
                textRevision: 0,
                status: "running",
                retryable: false,
                deviated: false,
                createdAt: "2026-08-28T00:00:00.000Z",
                updatedAt: "2026-08-28T00:00:00.000Z",
              },
              occurredAt: "2026-08-28T00:00:00.000Z",
            },
          })
        ).state;
      }
      if (orphanStatus === "proposed") {
        const ref = {
          approvalId: "approval-recovery-proposed",
          receiptProposalId: "receipt-recovery-proposed",
          threadId: input.mutation.payload.thread.threadId,
          turnId: input.mutation.payload.turn.turnId,
          toolCallId: "tool-recovery-proposed",
          policyRevision: input.mutation.payload.queueItem.policyRevision,
          inputHash: "input-recovery-proposed",
          actionHash: "action-recovery-proposed",
          target: input.mutation.payload.queueItem.target,
          preconditions: input.mutation.payload.queueItem.preconditions,
          expiresAt: "2026-08-29T00:00:00.000Z",
        } as const;
        await host.dispatch({
          commandId: "propose-recovery-proposed",
          expectedRevision: state.hostRevision,
          binding: projectBinding,
          sender: { kind: "internal", senderId: "test" },
          type: "proposal.put",
          payload: {
            approval: { ref, lifecycle: "pending" },
            item: {
              itemId: "proposal-recovery-proposed",
              threadId: ref.threadId,
              turnId: ref.turnId,
              kind: "proposal",
              approval: ref,
              status: "proposed",
              retryable: false,
              deviated: false,
              createdAt: "2026-08-28T00:00:00.000Z",
              updatedAt: "2026-08-28T00:00:00.000Z",
            },
            occurredAt: "2026-08-28T00:00:00.000Z",
          },
        });
      }
      let runCount = 0;
      const coordinator = createProjectAgentExecutionCoordinator(
        createProjectAgentRepositoryRouter({ rootDir: recoveryRoot }),
        () => `subscription-recovery-${orphanStatus}`,
        {
          runAgent: async () => {
            runCount += 1;
            throw new Error("must not run");
          },
          now: () => "2026-08-28T00:00:01.000Z",
        },
      );
      const opened = await coordinator.open(projectBinding);
      const recovered = coordinator.snapshot(opened.subscriptionId);
      expect(recovered.turns[0]).toMatchObject({ status: "failed", retryable: true });
      expect(recovered.queue[0]).toMatchObject({ status: "failed", retryable: true });
      expect(recovered.items.filter((item) => item.kind === "failure")).toHaveLength(1);
      expect(recovered.items.find((item) => item.kind === "failure")).toMatchObject({
        code: "execution_recovery_required",
        status: "failed",
        retryable: true,
      });
      const revisionAfterRecovery = recovered.hostRevision;
      coordinator.release(opened.subscriptionId);
      const nextCoordinator = createProjectAgentExecutionCoordinator(
        createProjectAgentRepositoryRouter({ rootDir: recoveryRoot }),
        () => `subscription-reopen-${orphanStatus}`,
        {
          runAgent: async () => {
            runCount += 1;
            throw new Error("must not run");
          },
          now: () => "2026-08-28T00:00:02.000Z",
        },
      );
      const reopened = await nextCoordinator.open(projectBinding);
      const reopenedState = nextCoordinator.snapshot(reopened.subscriptionId);
      expect(reopenedState.hostRevision).toBe(revisionAfterRecovery);
      expect(reopenedState.items.filter((item) => item.kind === "failure")).toHaveLength(1);
      expect(runCount).toBe(0);
      fs.rmSync(recoveryRoot, { recursive: true, force: true });
    }
  });

  it.each([
    { receiptState: "exact", expectedStatus: "done" },
    { receiptState: "missing", expectedStatus: "failed" },
    { receiptState: "binding-mismatch", expectedStatus: "failed" },
    { receiptState: "proposal-mismatch", expectedStatus: "failed" },
    { receiptState: "approval-mismatch", expectedStatus: "failed" },
    { receiptState: "action-mismatch", expectedStatus: "failed" },
  ] as const)(
    "terminalizes a claimed Canvas execution from a $receiptState durable receipt without redispatch",
    async ({ receiptState, expectedStatus }) => {
      const projectBinding = {
        ...binding,
        projectId: `project-canvas-recovery-${receiptState}`,
        projectGeneration: 3,
      };
      root = fs.mkdtempSync(path.join(os.tmpdir(), `nomi-project-agent-canvas-recovery-${receiptState}-`));
      const { approval } = await seedClaimedCanvasExecution(root, projectBinding, `canvas-recovery-${receiptState}`);
      const exactReceipt = committedCanvasReceipt(projectBinding, {
        approvalId: approval.approvalId,
        receiptProposalId: approval.receiptProposalId,
        actionHash: approval.actionHash,
      });
      const receipt =
        receiptState === "missing"
          ? null
          : receiptState === "binding-mismatch"
            ? { ...exactReceipt, binding: { ...projectBinding, projectId: "project-forged" } }
            : receiptState === "proposal-mismatch"
              ? { ...exactReceipt, proposalId: "receipt-forged" }
              : receiptState === "approval-mismatch"
                ? { ...exactReceipt, proposal: { ...exactReceipt.proposal, hostApprovalId: "approval-forged" } }
                : receiptState === "action-mismatch"
                  ? { ...exactReceipt, proposal: { ...exactReceipt.proposal, hostActionHash: "f".repeat(64) } }
                  : exactReceipt;
      const readProposalReceipt = vi.fn(() => receipt);
      const canvasAdapter = canvasWriteAdapter();
      let runCount = 0;
      const coordinator = createProjectAgentExecutionCoordinator(
        createProjectAgentRepositoryRouter({ rootDir: root }),
        () => `subscription-canvas-recovery-${receiptState}`,
        {
          runAgent: async () => {
            runCount += 1;
            throw new Error("must not run");
          },
          now: () => "2026-08-28T00:00:01.000Z",
        },
      );

      const opened = await coordinator.open(projectBinding, {
        canvasWrite: canvasAdapter,
        proposalReceipt: readProposalReceipt,
      });
      const recovered = coordinator.snapshot(opened.subscriptionId);

      expect(readProposalReceipt).toHaveBeenCalledOnce();
      expect(canvasAdapter.execute).not.toHaveBeenCalled();
      expect(runCount).toBe(0);
      expect(recovered.turns.find((turn) => turn.turnId === approval.turnId)).toMatchObject({
        status: expectedStatus,
        retryable: false,
      });
      expect(recovered.queue.find((item) => item.turnId === approval.turnId)).toMatchObject({
        status: expectedStatus,
        retryable: false,
      });
      expect(recovered.items.find((item) => item.kind === "proposal" && item.turnId === approval.turnId)).toMatchObject(
        {
          status: expectedStatus,
        },
      );
      if (receiptState === "exact") {
        expect(recovered.items.some((item) => item.kind === "failure" && item.turnId === approval.turnId)).toBe(false);
      } else {
        expect(
          recovered.items.find((item) => item.kind === "failure" && item.turnId === approval.turnId),
        ).toMatchObject({
          code: "capability_receipt_unresolved",
          status: "failed",
          retryable: false,
        });
      }

      const revisionAfterRecovery = recovered.hostRevision;
      coordinator.release(opened.subscriptionId);
      const secondReader = vi.fn(() => receipt);
      const secondAdapter = canvasWriteAdapter();
      const reopenedCoordinator = createProjectAgentExecutionCoordinator(
        createProjectAgentRepositoryRouter({ rootDir: root }),
        () => `subscription-canvas-reopened-${receiptState}`,
        {
          runAgent: async () => {
            runCount += 1;
            throw new Error("must not run");
          },
        },
      );
      const reopened = await reopenedCoordinator.open(projectBinding, {
        canvasWrite: secondAdapter,
        proposalReceipt: secondReader,
      });
      expect(reopenedCoordinator.snapshot(reopened.subscriptionId).hostRevision).toBe(revisionAfterRecovery);
      expect(secondReader).not.toHaveBeenCalled();
      expect(secondAdapter.execute).not.toHaveBeenCalled();
      expect(runCount).toBe(0);
    },
  );

  it.each([
    {
      receiptOwner: "latest",
      expectedStatus: "done",
      expectedProposalStatuses: ["done", "done"],
    },
    {
      receiptOwner: "earlier",
      expectedStatus: "failed",
      expectedProposalStatuses: ["done", "failed"],
    },
  ] as const)(
    "recovers two claimed Canvas approvals only when the receipt uniquely matches the $receiptOwner approval",
    async ({ receiptOwner, expectedStatus, expectedProposalStatuses }) => {
      const projectBinding = {
        ...binding,
        projectId: `project-canvas-multi-recovery-${receiptOwner}`,
        projectGeneration: 4,
      };
      root = fs.mkdtempSync(path.join(os.tmpdir(), `nomi-project-agent-canvas-multi-${receiptOwner}-`));
      const { approval: first } = await seedClaimedCanvasExecution(
        root,
        projectBinding,
        `canvas-multi-recovery-${receiptOwner}`,
      );
      const second = await seedSecondClaimedCanvasApproval(root, projectBinding, first);
      const receiptApproval = receiptOwner === "latest" ? second : first;
      const receipt = committedCanvasReceipt(projectBinding, {
        approvalId: receiptApproval.approvalId,
        receiptProposalId: receiptApproval.receiptProposalId,
        actionHash: receiptApproval.actionHash,
      });
      const readProposalReceipt = vi.fn(() => receipt);
      const canvasAdapter = canvasWriteAdapter();
      let runCount = 0;
      const coordinator = createProjectAgentExecutionCoordinator(
        createProjectAgentRepositoryRouter({ rootDir: root }),
        () => `subscription-canvas-multi-${receiptOwner}`,
        {
          runAgent: async () => {
            runCount += 1;
            throw new Error("must not run");
          },
        },
      );

      const opened = await coordinator.open(projectBinding, {
        canvasWrite: canvasAdapter,
        proposalReceipt: readProposalReceipt,
      });
      const recovered = coordinator.snapshot(opened.subscriptionId);

      expect(readProposalReceipt).toHaveBeenCalledOnce();
      expect(canvasAdapter.execute).not.toHaveBeenCalled();
      expect(runCount).toBe(0);
      expect(recovered.turns.find((turn) => turn.turnId === first.turnId)).toMatchObject({
        status: expectedStatus,
        retryable: false,
      });
      const proposals = recovered.items.filter((item) => item.kind === "proposal" && item.turnId === first.turnId);
      expect(proposals).toHaveLength(2);
      expect(proposals.map((proposal) => proposal.status)).toEqual(expectedProposalStatuses);
      if (receiptOwner === "latest") {
        expect(recovered.items.some((item) => item.kind === "failure" && item.turnId === first.turnId)).toBe(false);
      } else {
        expect(recovered.items.find((item) => item.kind === "failure" && item.turnId === first.turnId)).toMatchObject({
          code: "capability_receipt_unresolved",
          retryable: false,
        });
      }
    },
  );

  it("keeps commands scoped to the opened subscription binding", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-coordinator-"));
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => "subscription-a",
    );
    const opened = await coordinator.open(binding);
    expect(opened.subscriptionId).toBe("subscription-a");
    expect(coordinator.snapshot(opened.subscriptionId).binding).toEqual(binding);

    const mutation: ProjectAgentMutation = {
      commandId: "thread-command",
      expectedRevision: 0,
      binding,
      sender: { kind: "internal", senderId: "test" },
      type: "thread.put",
      payload: {
        thread: { threadId: "thread-a", createdAt: "2026-08-28T00:00:00.000Z", updatedAt: "2026-08-28T00:00:00.000Z" },
      },
    };
    const reduction = await coordinator.dispatch(opened.subscriptionId, mutation);
    expect(reduction.state.hostRevision).toBe(1);

    expect(() =>
      coordinator.dispatch(opened.subscriptionId, {
        ...mutation,
        commandId: "foreign",
        binding: { ...binding, projectGeneration: 2 },
      }),
    ).toThrow(ProjectAgentSubscriptionError);
    coordinator.release(opened.subscriptionId);
    expect(coordinator.subscriptionCount()).toBe(0);
    expect(() => coordinator.snapshot(opened.subscriptionId)).toThrow(ProjectAgentSubscriptionError);
  });

  it("owns the queued turn execution, streams one assistant item, and waits for tool decisions", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-execution-"));
    let subscriptionId = "";
    const published: ProjectAgentExecutionEvent[] = [];
    let resolveToolCall!: (value: {
      turnId: string;
      toolCallId: string;
      assistantTextAnchor?: { itemId: string; textOffset: number };
    }) => void;
    const toolCallSeen = new Promise<{
      turnId: string;
      toolCallId: string;
      assistantTextAnchor?: { itemId: string; textOffset: number };
    }>((resolve) => {
      resolveToolCall = resolve;
    });
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => "subscription-execution",
      {
        runAgent: async (_request, hooks) => {
          hooks.emit({ type: "content-delta", delta: "hello" });
          hooks.emit({
            type: "tool-call",
            toolCallId: "tool-1",
            toolName: "insert_at_cursor",
            args: { content: "x" },
          });
          const decision = await hooks.awaitToolConfirmation(
            { toolCallId: "tool-1", toolName: "insert_at_cursor", args: { content: "x" } },
            hooks.abortSignal!,
          );
          expect(decision).toMatchObject({ ok: true, result: { applied: true } });
          return {
            id: "result",
            status: "finished",
            text: "hello",
            finishReason: "stop",
            artifacts: [],
            usage: { promptTokens: 1, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 2 },
            toolCalls: [
              {
                toolCallId: "tool-1",
                toolName: "insert_at_cursor",
                args: { content: "x" },
                status: "ok",
                result: { applied: true },
                decision,
              },
            ],
          } satisfies AgentChatResponse;
        },
      },
    );
    const opened = await coordinator.open(binding);
    subscriptionId = opened.subscriptionId;
    coordinator.subscribe(opened.subscriptionId, (event) => {
      published.push(event);
      if (event.type === "tool-call") {
        resolveToolCall({
          turnId: event.turnId,
          toolCallId: event.toolCallId,
          ...(event.assistantTextAnchor ? { assistantTextAnchor: event.assistantTextAnchor } : {}),
        });
      }
    });
    const contextRef = {
      binding: createProjectAgentContextBinding(binding, "thread-execution"),
      contextRevision: 0,
      recordId: "canonical-context-thread-execution",
    } as const;
    const now = "2026-08-28T00:00:00.000Z";
    const thread = {
      threadId: "thread-execution",
      createdAt: now,
      updatedAt: now,
    };
    const turn = {
      turnId: "turn-execution",
      threadId: thread.threadId,
      executionToken: "execution-token",
      model: { id: "model", version: 1 },
      approvalPolicy: { mode: "step" as const, spend: "confirm" as const },
      skillVersions: [],
      capabilityVersions: [{ id: "creation-chat", version: 1 }],
      contextRef,
      status: "queued" as const,
      retryable: false,
      deviated: false,
      createdAt: now,
      updatedAt: now,
    };
    const userItem = {
      itemId: "user-execution",
      threadId: thread.threadId,
      turnId: turn.turnId,
      kind: "user" as const,
      text: "hi",
      status: "done" as const,
      retryable: false,
      deviated: false,
      createdAt: now,
      updatedAt: now,
    };
    const queueItem = {
      queueItemId: "queue-execution",
      threadId: thread.threadId,
      turnId: turn.turnId,
      binding,
      target: { kind: "document" as const, documentId: "doc", anchor: { kind: "whole-document" as const } },
      preconditions: {},
      contextRef,
      model: turn.model,
      approvalPolicy: { mode: "step" as const, spend: "confirm" as const },
      skillVersions: [],
      capabilityVersions: turn.capabilityVersions,
      policyRevision: 1,
      attachmentRefs: [],
      originSurface: { surfaceId: "surface", kind: "document" as const },
      enqueuedAt: now,
      status: "queued" as const,
      retryable: false,
      deviated: false,
      updatedAt: now,
    };
    const mutation: Extract<ProjectAgentMutation, { type: "turn.enqueue" }> = {
      commandId: "enqueue-execution",
      expectedRevision: 0,
      binding,
      sender: { kind: "renderer", senderId: "subscription-execution" },
      type: "turn.enqueue",
      payload: { thread, turn, userItem, queueItem },
    };
    const request: ProjectAgentExecutionRequest = {
      prompt: "hi",
      capability: "creation-chat",
      projectId: binding.projectId,
    };
    void coordinator.enqueue(opened.subscriptionId, { mutation, request }).catch((error) => {
      console.error("execution enqueue failed", error);
    });
    const seen = await toolCallSeen;
    const assistantAtToolCall = coordinator
      .snapshot(subscriptionId)
      .items.find((item) => item.kind === "assistant" && item.turnId === seen.turnId);
    expect(assistantAtToolCall).toMatchObject({ text: "hello", textRevision: 1 });
    expect(seen.assistantTextAnchor).toEqual({ itemId: assistantAtToolCall?.itemId, textOffset: 5 });
    let unsubscribeReplay = () => {};
    let replayedAnchor: { itemId: string; textOffset: number } | undefined;
    const replayed = new Promise<void>((resolve) => {
      unsubscribeReplay = coordinator.subscribe(subscriptionId, (event) => {
        if (event.type === "tool-call" && event.toolCallId === seen.toolCallId) {
          replayedAnchor = event.assistantTextAnchor;
          resolve();
        }
      });
    });
    await replayed;
    unsubscribeReplay();
    expect(replayedAnchor).toEqual(seen.assistantTextAnchor);
    await coordinator.resolveToolDecision(subscriptionId, seen.turnId, seen.toolCallId, {
      ok: true,
      result: { applied: true },
    });
    const final = await coordinator.waitForTurn(subscriptionId, seen.turnId);
    expect(final.items.filter((item) => item.turnId === seen.turnId).map((item) => item.kind)).toEqual([
      "user",
      "assistant",
      "proposal",
      "tool",
    ]);
    expect(final.items.find((item) => item.kind === "assistant" && item.turnId === seen.turnId)).toMatchObject({
      text: "hello",
      status: "done",
    });
    expect(final.queue.find((item) => item.turnId === seen.turnId)?.status).toBe("done");
    const resultIndex = published.findIndex((event) => event.type === "execution-result");
    expect(resultIndex).toBeGreaterThan(-1);
    expect(
      published
        .slice(0, resultIndex)
        .some(
          (event) =>
            event.type === "patch" &&
            event.patch.changes.some((change) => change.kind === "turn-upserted" && change.turn.status === "done"),
        ),
    ).toBe(true);
    expect(published[resultIndex]).toMatchObject({
      type: "execution-result",
      turnId: seen.turnId,
      response: {
        status: "finished",
        finishReason: "stop",
        usage: { totalTokens: 2 },
        toolCalls: [{ toolCallId: seen.toolCallId, status: "ok" }],
      },
    });
  });

  it("appends one reference-only ExportJob task after the exact proposal receipt settles", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-export-taskref-"));
    let receipt: ProjectAgentProposalReceiptView | null = null;
    const phase4Surface: PiPhase4SurfaceTransportAdapter = {
      tryExecuteRead: vi.fn(async () => null),
      prepareWrite: vi.fn(async (call: RuntimeToolCall): Promise<PreparedExportWrite | null> => {
        if (call.toolName !== "export_timeline") return null;
        return Object.freeze({
          call,
          invocation: {
            input: { operation: "export_timeline", expectedRevision: "revision-a" },
            target: { kind: "export", timelineRevision: "revision-a" },
            preconditions: { timeline: { revision: "revision-a" } },
            policyRevision: 1,
            inputHash: "b".repeat(64),
            actionHash: "a".repeat(64),
          } as unknown as PreparedExportWrite["invocation"],
        });
      }),
      executeWrite: vi.fn(async (_prepared, approval) => {
        receipt = committedCanvasReceipt(binding, approval);
        return {
          ok: true,
          silent: true,
          result: {
            operation: "export_timeline",
            accepted: true,
            jobId: "job-export-taskref",
            backend: "filtergraph",
            timelineRevision: "revision-a",
            durationFrames: 60,
            profile: { aspectRatio: "16:9", resolution: "1080p", quality: "standard" },
          },
        };
      }),
      dispose: vi.fn(),
    };
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => "subscription-export-taskref",
      {
        runAgent: async (_request, hooks) => {
          const call = {
            toolCallId: "tool-export-taskref",
            toolName: "export_timeline",
            args: { expectedRevision: "revision-a" },
          };
          const decision = await hooks.awaitToolConfirmation(call, hooks.abortSignal!);
          return {
            id: "result-export-taskref",
            status: "finished",
            text: "export started",
            finishReason: "stop",
            artifacts: [],
            toolCalls: [{
              ...call,
              status: decision.ok ? "ok" : "denied",
              ...(decision.ok && decision.result !== undefined ? { result: decision.result } : {}),
              decision,
            }],
            usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 1 },
          } satisfies AgentChatResponse;
        },
      },
    );
    const opened = await coordinator.open(binding, {
      phase4Surface,
      proposalReceipt: () => receipt,
    });
    coordinator.subscribe(opened.subscriptionId, (event) => {
      if (event.type !== "tool-call") return;
      void coordinator.resolveToolDecision(opened.subscriptionId, event.turnId, event.toolCallId, {
        ok: true,
        result: { approved: true },
      });
    });
    const base = executionInput("export-taskref", 0);
    const input: ExecutionInput = {
      ...base,
      mutation: {
        ...base.mutation,
        payload: {
          ...base.mutation.payload,
          queueItem: {
            ...base.mutation.payload.queueItem,
            target: { kind: "export", timelineRevision: "revision-a" },
            preconditions: { timeline: { revision: "revision-a" } },
            originSurface: { surfaceId: "preview-export", kind: "preview" },
          },
        },
      },
    };

    await coordinator.enqueue(opened.subscriptionId, input);
    const final = await coordinator.waitForTurn(opened.subscriptionId, input.mutation.payload.turn.turnId);
    const taskItems = final.items.filter((item) => item.kind === "task");

    expect(taskItems).toHaveLength(1);
    expect(taskItems[0]).toMatchObject({
      correlationId: "tool-export-taskref",
      task: { kind: "export-job", jobId: "job-export-taskref" },
      status: "done",
    });
    expect(Object.keys(taskItems[0]!.task).sort()).toEqual(["jobId", "kind"]);
    expect(final.proposalApprovals).toMatchObject([{ lifecycle: "claimed" }]);
    expect(final.items.find((item) => item.kind === "proposal")).toMatchObject({ status: "done" });
    coordinator.release(opened.subscriptionId);
  });

  it("auto-executes document read aliases through the Host without a pending confirmation", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-document-read-execution-"));
    const documentAdapter = {
      tryExecute: vi.fn(async (call: { toolName: string }, documentId: string) =>
        call.toolName === "read_full_text"
          ? { ok: true as const, result: { text: `text:${documentId}` }, silent: true as const }
          : null,
      ),
      dispose: vi.fn(),
    };
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => "subscription-document-read",
      {
        runAgent: async (_request, hooks) => {
          const call = { toolCallId: "tool-document-read", toolName: "read_full_text", args: {} };
          const decision = await hooks.awaitToolConfirmation(call, hooks.abortSignal!);
          expect(decision).toEqual({ ok: true, result: { text: "text:document-document-read" }, silent: true });
          return {
            id: "result-document-read",
            status: "finished",
            text: "done",
            finishReason: "stop",
            artifacts: [],
            toolCalls: [{ ...call, status: "ok", result: decision.ok ? decision.result : undefined, decision }],
            usage: { promptTokens: 0, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 1 },
          } satisfies AgentChatResponse;
        },
      },
    );
    const opened = await coordinator.open(binding, { documentRead: documentAdapter });
    const input = executionInput("document-read", 0);
    await coordinator.enqueue(opened.subscriptionId, input);
    const final = await coordinator.waitForTurn(opened.subscriptionId, input.mutation.payload.turn.turnId);

    expect(documentAdapter.tryExecute).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "read_full_text" }),
      "document-document-read",
      expect.any(AbortSignal),
    );
    expect(final.items.filter((item) => item.kind === "proposal")).toHaveLength(0);
    expect(final.items.find((item) => item.kind === "tool")).toMatchObject({
      capability: { id: "document.read", version: 1 },
      status: "done",
    });
    coordinator.release(opened.subscriptionId);
    expect(documentAdapter.dispose).toHaveBeenCalledOnce();
  });

  it("does not execute a document.write or leave a proposal when the user denies it", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-document-write-denied-"));
    const documentAdapter = documentWriteAdapter();
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => "subscription-document-write-denied",
      {
        runAgent: async (_request, hooks) => {
          const call = {
            toolCallId: "tool-document-write-denied",
            toolName: "insert_at_cursor",
            args: { content: "x" },
          };
          const decision = await hooks.awaitToolConfirmation(call, hooks.abortSignal!);
          expect(decision).toMatchObject({ ok: false, denied: true });
          return documentWriteResponse(call, decision);
        },
      },
    );
    const opened = await coordinator.open(binding, { documentWrite: documentAdapter });
    coordinator.subscribe(opened.subscriptionId, (event) => {
      if (event.type === "tool-call") {
        void coordinator.resolveToolDecision(opened.subscriptionId, event.turnId, event.toolCallId, {
          ok: false,
          denied: true,
          message: "User denied document write",
        });
      }
    });

    const input = executionInput("document-write-denied", 0);
    await coordinator.enqueue(opened.subscriptionId, input);
    const final = await coordinator.waitForTurn(opened.subscriptionId, input.mutation.payload.turn.turnId);

    expect(documentAdapter.prepare).toHaveBeenCalledOnce();
    expect(documentAdapter.execute).not.toHaveBeenCalled();
    expect(final.items.filter((item) => item.kind === "proposal")).toHaveLength(0);
    // 用户拒绝 ≠ 工具坏了。`declined` 是它自己的终态，不并进 `failed`——面板要分得出
    // 「Nomi 没做成」和「你说了不要」，收据行尾写的字完全不同。
    expect(final.items.find((item) => item.kind === "tool")).toMatchObject({ status: "declined" });
  });

  it("executes an approved document.write through the Host and settles its frozen proposal", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-project-agent-document-write-approved-"));
    fs.mkdirSync(path.join(root, ".nomi"), { recursive: true });
    const target = {
      kind: "document" as const,
      documentId: "document-document-write-approved",
      anchor: { kind: "cursor" as const, position: 7, beforeHash: "before-a", afterHash: "after-a" },
    };
    const preconditions = { document: { revision: 3, contentHash: "fnv1a-before" } } as const;
    const documentAdapter = documentWriteAdapter();
    const proposalReceipts = createProjectAgentProposalReceiptService({ projectRoot: root, binding });
    const coordinator = createProjectAgentExecutionCoordinator(
      createProjectAgentRepositoryRouter({ rootDir: root }),
      () => "subscription-document-write-approved",
      {
        runAgent: async (_request, hooks) => {
          const call = {
            toolCallId: "tool-document-write-approved",
            toolName: "replace_selection",
            args: { content: "new" },
          };
          const decision = await hooks.awaitToolConfirmation(call, hooks.abortSignal!);
          expect(decision).toMatchObject({ ok: true, result: { applied: true } });
          hooks.emit({ type: "content-delta", delta: "done" });
          return documentWriteResponse(call, decision, [{
            source: "host_derived",
            sourceRef: "agent.capability",
            trust: "trusted",
            tainted: false,
          }]);
        },
      },
    );
    const opened = await coordinator.open(binding, {
      documentWrite: documentAdapter,
      proposalReceipt: () => proposalReceipts.read(),
      proposalReceiptWriter: proposalReceipts,
    });
    coordinator.subscribe(opened.subscriptionId, (event) => {
      if (event.type === "tool-call") {
        void coordinator.resolveToolDecision(opened.subscriptionId, event.turnId, event.toolCallId, {
          ok: true,
          result: { applied: true },
        });
      }
    });

    const base = executionInput("document-write-approved", 0);
    const input = {
      ...base,
      mutation: {
        ...base.mutation,
        payload: {
          ...base.mutation.payload,
          queueItem: { ...base.mutation.payload.queueItem, target, preconditions, policyRevision: 5 },
        },
      },
    };
    await coordinator.enqueue(opened.subscriptionId, input);
    const final = await coordinator.waitForTurn(opened.subscriptionId, input.mutation.payload.turn.turnId);

    expect(final.turns.find((turn) => turn.turnId === input.mutation.payload.turn.turnId)).toMatchObject({
      status: "done",
      retryable: false,
    });
    expect(final.items.find((item) => item.kind === "tool")).toMatchObject({
      toolCallId: "tool-document-write-approved",
      capability: { id: "document.write", version: 1 },
      status: "done",
      resultRef: expect.stringMatching(/^result-/),
    });
    expect(documentAdapter.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "replace_selection" }),
      { documentId: target.documentId, target, preconditions },
      expect.any(AbortSignal),
    );
    expect(documentAdapter.execute).toHaveBeenCalledOnce();
    const invocation = documentAdapter.execute.mock.calls[0]?.[0].invocation;
    expect(invocation).toMatchObject({ target, preconditions });
    const proposal = final.items.find((item) => item.kind === "proposal");
    expect(proposal).toMatchObject({
      status: "done",
      approval: {
        approvalId: expect.stringMatching(/^approval-/),
        receiptProposalId: expect.any(String),
        policyRevision: 1,
        inputHash: invocation.inputHash,
        actionHash: invocation.actionHash,
        target,
        preconditions,
      },
    });
    expect(final.proposalApprovals).toHaveLength(1);
    expect(final.proposalApprovals[0]).toMatchObject({
      lifecycle: "claimed",
      ref: {
        approvalId: expect.stringMatching(/^approval-/),
        receiptProposalId: expect.any(String),
        policyRevision: 1,
        inputHash: invocation.inputHash,
        actionHash: invocation.actionHash,
        target,
        preconditions,
      },
    });
    const receiptPath = projectAgentProposalReceiptPath(root);
    expect(fs.existsSync(receiptPath)).toBe(true);
    expect(proposalReceipts.read()).toMatchObject({
      revision: 2,
      lifecycle: "committed",
      proposalId: expect.any(String),
      proposal: {
        hostApprovalId: expect.stringMatching(/^approval-/),
        hostActionHash: invocation.actionHash,
      },
    });
  });});
