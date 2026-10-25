import { normalizeLegacyPresentation } from "../shared/productionGenerationPresentation";
import { describe, expect, it } from "vitest";

import type { PlanCandidate } from "../capabilityCore/executionContract";
import { assertPendingSpendIdentity, listPendingSpendConfirms, projectPendingSpendConfirm } from "./productionPendingSpend";
import { PROJECT_AGENT_PREPARING_DEADLINE_MS } from "../capabilityCore/projectAgentProposalReceiptStore";
import type { GenerationHandOver, GenerationPresentation, ProductionJob, ProductionRun } from "./productionRunTypes";

// 付费卡的**宿主投影**（D2 第③步之后）。这里钉死的几件事都只在钱这条轴上看得见：
//   ① 卡上没有第二份参数：投影里没有价格、参数、提示词、参考、门——一镜要发什么只住在画布节点上（卡读节点）；
//   ② 每一镜在这一次出价里走到哪一步（还没决定 / 正在交给画布 / 交到了 / 没发出去 / 结果未知 / 去掉了）原样给卡，
//      卡据此选按钮，不自己猜；
//   ③ 卡的身份是内容（出价 + 每镜候选版本），交接走到哪一步不换身份（「取消」在交的半路上照样认得出它）；
//   ④ 只投影 agent 自己那条路（`origin.host === "nomi"`）：外部 MCP 宿主的用户此刻没在看这块面板。

const NOW = "2026-09-11T00:00:00.000Z";

function candidate(id: string, modelId: string, revision = 2): PlanCandidate {
  return {
    candidateId: id,
    revision,
    moduleId: "generation.single-shot",
    providerId: "fixture-provider",
    modelId,
    mode: "text-to-image",
    modeId: "t2i",
    prompt: `prompt ${id}`,
    parameters: { duration: "3" },
    references: [],
  };
}

/**
 * 夹具按上一版的形状写（没有 `presentations`）：和仓库读盘一样先过唯一的归一点——「草稿没藏卡 = 卡开着」。
 */
function run(overrides: Partial<ProductionRun> = {}): ProductionRun {
  return normalizeLegacyPresentation({
    schemaVersion: 1, runId: "op-a", projectId: "project-1", revision: 3,
    status: "draft", stageId: "generate", playbook: { name: "generation.single-shot", version: "1.0.0" },
    origin: { host: "nomi", actorId: "project-agent-host" },
    policy: { trustedHosts: [], allowedProviders: [], allowedModels: [], maxSpend: null, maxAttemptsPerJob: 2, minimizeUploads: true },
    budget: { currency: "CNY", authorized: 0, reserved: 0, actual: 0, unsettled: 0, unknownInFlight: 0 },
    planVersion: 1, snapshotCursor: 3, stages: [], gates: [], jobs: [], artifacts: [],
    generationPlan: { operationId: "op-a", state: "draft", candidate: candidate("cand-a", "priced"), nodeId: "node-a", updatedAt: NOW },
    createdAt: NOW, updatedAt: NOW,
    ...overrides,
  });
}

/** 三镜草稿，每镜落了一个节点；出价开着、摆着三镜。 */
function threeShots(presentation: Partial<GenerationPresentation> = {}, overrides: Partial<ProductionRun> = {}): ProductionRun {
  const base = run(overrides);
  return {
    ...base,
    generationPlan: {
      ...base.generationPlan!,
      shots: ["s1", "s2", "s3"].map((shotId) => ({ shotId, candidate: candidate(`c-${shotId}`, `model-${shotId}`), nodeId: `node-${shotId}`, updatedAt: NOW })),
      presentations: [{ presentationId: "op-a:presentation:1", presentationEpoch: 1, policySnapshot: { mode: "request" }, shotIds: ["s1", "s2", "s3"], openedAt: NOW, fromGate: 0, ...presentation }],
    },
  };
}

const handOver = (shotId: string, extra: Partial<GenerationHandOver> = {}): GenerationHandOver => ({ shotId, by: "gesture", at: NOW, ...extra });

describe("付费卡的宿主投影", () => {
  it("agent 建的草稿 = 一张等人决定的卡：只带出价身份、镜、指向的节点、起草时的模型——没有价格 / 参数 / 门", () => {
    const pending = projectPendingSpendConfirm(run());
    expect(pending).toBeDefined();
    expect(pending!.shots).toEqual([{
      shotId: "cand-a", nodeId: "node-a", index: 1, kind: "image",
      draftedModel: { providerId: "fixture-provider", modelId: "priced" }, offer: "undecided",
    }]);
    expect(pending!.presentationId).toBe("op-a:presentation:1");
    expect(pending!.presentationEpoch).toBe(1);
    expect(pending!.policySnapshot).toEqual({ mode: "request" });
    // 反例：旧卡那一套第二份参数（价格 / 小计 / 门 / 提示词）一个字段都不许长回来。
    for (const field of ["price", "knownSubtotal", "unknownShotCount", "gateId", "prompt", "params", "references"]) {
      expect(pending, field).not.toHaveProperty(field);
      expect(pending!.shots[0], field).not.toHaveProperty(field);
    }
  });

  it("旧卡的身份是 durable epoch：策略切换不会把同一张卡改成另一张", () => {
    const pending = projectPendingSpendConfirm(run())!;
    expect(() => assertPendingSpendIdentity(pending, {
      presentationId: pending.presentationId,
      presentationEpoch: pending.presentationEpoch,
      planVersion: pending.planVersion,
      quoteId: pending.quoteId,
    })).not.toThrow();
    expect(() => assertPendingSpendIdentity(pending, {
      presentationId: pending.presentationId,
      presentationEpoch: pending.presentationEpoch! + 1,
      planVersion: pending.planVersion,
      quoteId: pending.quoteId,
    })).toThrowError("generation_presentation_stale");
  });

  it("卡的身份 = 内容：交到一半不换身份（「取消」认得出它），Agent 改了某一镜的稿就换", () => {
    const before = projectPendingSpendConfirm(threeShots())!;
    const handing = projectPendingSpendConfirm(threeShots({ handOvers: [handOver("s1", { canvasRunId: "canvas-1" })] }))!;
    expect(handing.quoteId).toBe(before.quoteId);
    const revised = threeShots();
    revised.generationPlan!.shots![1] = { ...revised.generationPlan!.shots![1], candidate: candidate("c-s2", "model-s2", 3) };
    expect(projectPendingSpendConfirm(revised)!.quoteId).not.toBe(before.quoteId);
  });

  it("每一镜在这一次出价里走到哪一步原样给卡（卡据此选按钮）；参数被拒带上语义码", () => {
    const pending = projectPendingSpendConfirm(threeShots({
      handOvers: [
        handOver("s1", { canvasRunId: "canvas-1" }),
        handOver("s2", { canvasRunId: "canvas-2", settled: { at: NOW, outcome: "not_sent", failure: { kind: "parameter_rejected", code: "provider_rejected" } } }),
        handOver("s3", { canvasRunId: "canvas-3", settled: { at: NOW, outcome: "unknown" } }),
      ],
    }))!;
    expect(pending.shots.map((shot) => [shot.shotId, shot.offer])).toEqual([["s1", "handing_over"], ["s2", "not_sent"], ["s3", "unknown"]]);
    expect(pending.shots[1].failure).toEqual({ kind: "parameter_rejected", code: "provider_rejected" });
    expect(pending.shots[0]).not.toHaveProperty("failure");
  });

  it("交到了的、去掉的那几镜照样摆在卡上（显示它们的状态），只要还有一镜在等人", () => {
    const pending = projectPendingSpendConfirm(threeShots({
      removed: [{ shotId: "s2", at: NOW }],
      handOvers: [handOver("s1", { canvasRunId: "canvas-1", settled: { at: NOW, outcome: "accepted" } })],
    }))!;
    expect(pending.shots.map((shot) => [shot.shotId, shot.offer])).toEqual([["s1", "sent"], ["s2", "removed"], ["s3", "undecided"]]);
  });

  it("一镜都不剩、全是「不生成」的那一张留着（主按钮置灰、还能恢复；要关点「取消」）", () => {
    const pending = projectPendingSpendConfirm(threeShots({ removed: ["s1", "s2", "s3"].map((shotId) => ({ shotId, at: NOW })) }));
    expect(pending?.shots.map((shot) => shot.offer)).toEqual(["removed", "removed", "removed"]);
  });

  it("每一镜都交到 / 被节点上拿走了，或卡关了 / 计划取消了 → 不出卡（那已经不是「等你决定」了）", () => {
    const delivered = threeShots({ handOvers: ["s1", "s2", "s3"].map((shotId) => handOver(shotId, { canvasRunId: `canvas-${shotId}`, settled: { at: NOW, outcome: "accepted" } })) });
    expect(projectPendingSpendConfirm(delivered)).toBeUndefined();
    const closed = threeShots({ closed: { at: NOW, by: "user_closed" } });
    expect(projectPendingSpendConfirm(closed)).toBeUndefined();
    const cancelled = threeShots();
    cancelled.generationPlan = { ...cancelled.generationPlan!, state: "cancelled" };
    expect(projectPendingSpendConfirm(cancelled)).toBeUndefined();
    // 升级前的旧卡点过「生成这张」（门批了）：也算交到了。
    const approvedGate = run({
      gates: [{ gateId: "gate-1", scope: "budget_envelope", status: "approved", planHash: "d1", authorizationDigest: "d1",
        authorizationEnvelope: { gateId: "gate-1", jobs: [{ shotId: "cand-a" }] } as never, title: "", summary: "", jobIds: [], createdAt: NOW, expiresAt: NOW } as ProductionRun["gates"][number]],
    });
    approvedGate.generationPlan = { ...approvedGate.generationPlan!, state: "sealed", presentations: [{ shotIds: ["cand-a"], openedAt: NOW, fromGate: 0 }] };
    expect(projectPendingSpendConfirm(approvedGate)).toBeUndefined();
  });

  it("外部 MCP 宿主发起的那笔不进面板：它的用户此刻没在看这块面板", () => {
    expect(projectPendingSpendConfirm(run({ origin: { host: "semantic-mcp" } }))).toBeUndefined();
    expect(projectPendingSpendConfirm(run({ origin: { host: "codex" } }))).toBeUndefined();
  });

  it("多镜只投影这一次摆出来的那些；镜号是这一镜在草稿里的位置（和节点上的镜号同源），不是卡上第几张", () => {
    const base = run();
    const multi = run({ generationPlan: {
      ...base.generationPlan!,
      presentations: undefined,
      shots: [
        { shotId: "s1", candidate: candidate("c1", "priced"), nodeId: "node-1", updatedAt: NOW },
        { shotId: "s2", candidate: candidate("c2", "priced"), included: false, updatedAt: NOW },
        { shotId: "s3", candidate: candidate("c3", "unpriced"), nodeId: "node-3", updatedAt: NOW },
      ],
    } });
    const pending = projectPendingSpendConfirm(multi)!;
    expect(pending.shots.map((shot) => shot.shotId)).toEqual(["s1", "s3"]);
    expect(pending.shots.map((shot) => shot.index)).toEqual([1, 3]);
    expect(pending.shots.map((shot) => shot.draftedModel.modelId)).toEqual(["priced", "unpriced"]);
  });

  /**
   * 「我知道有一笔在等，但我一镜都画不出来」——这不是空，是失败（2026-09-12）。
   *
   * 它原来写的是 `return undefined`，和「真的没有要确认的东西」长得一模一样。后果是：
   * 门一直 `waiting`，面板一张卡都没有，用户只看到沉默。现在它喊出来，读通道据此拒绝，
   * 渲染层渲那张会说话的卡。
   */
  it("等人点头却投影不出任何一镜 → 抛，不写成「没有」；列表里落成一张会说话的错卡", () => {
    const broken = run();
    broken.generationPlan = { ...broken.generationPlan!, shots: [] };
    // 阳性对照：`shotsOf` 的退路把 `plan.candidate` 当成那一镜，所以正常的空 shots 仍然出卡。
    expect(projectPendingSpendConfirm(broken)?.shots).toHaveLength(1);

    const empty = run();
    empty.generationPlan = { ...empty.generationPlan!, shots: [], candidate: undefined as never };
    expect(() => projectPendingSpendConfirm(empty)).toThrow(Error);
    expect(listPendingSpendConfirms([empty], () => undefined)[0]?.error).toBeDefined();
  });

  // ── 「直接生成」档：策略在交的那一笔不出卡；策略答不了时卡照旧出现在原处 ─────────────
  it("直接生成档代答中的那一笔不投影成卡（草稿落盘到交给画布之间不许闪卡）", () => {
    const fullAuto = run();
    fullAuto.generationPlan = { ...fullAuto.generationPlan!, presentations: [{
      ...fullAuto.generationPlan!.presentations![0],
      policySnapshot: { mode: "direct" },
      policyDecisionState: "pending",
      policyDecisionDeadlineAt: new Date(Date.now() + PROJECT_AGENT_PREPARING_DEADLINE_MS).toISOString(),
    }] };
    expect(projectPendingSpendConfirm(fullAuto)).toBeUndefined();
    expect(listPendingSpendConfirms([fullAuto], () => undefined)).toEqual([]);
  });

  it("策略正在交给画布的那几镜不出卡；人在卡上点的那几镜在交时照样摆着（「正在发出 k/N」）", () => {
    const policy = threeShots({
      policySnapshot: { mode: "direct" },
      handOvers: ["s1", "s2", "s3"].map((shotId) => handOver(shotId, { by: "policy", canvasRunId: `canvas-${shotId}` })),
    });
    expect(projectPendingSpendConfirm(policy)).toBeUndefined();
    const gesture = threeShots({ handOvers: ["s1", "s2", "s3"].map((shotId) => handOver(shotId, { canvasRunId: `canvas-${shotId}` })) });
    expect(projectPendingSpendConfirm(gesture)?.shots.map((shot) => shot.offer)).toEqual(["handing_over", "handing_over", "handing_over"]);
  });

  it("代答失败 → 同一张卡回到原处，标「要人决定」；期限过了标记丢了也一样", () => {
    const failed = run();
    failed.generationPlan = { ...failed.generationPlan!, presentations: [{
      ...failed.generationPlan!.presentations![0],
      policySnapshot: { mode: "direct" },
      policyDecisionState: "failed",
    }] };
    expect(projectPendingSpendConfirm(failed)).toMatchObject({ manualDecisionRequired: true });
    const markerLost = run();
    markerLost.generationPlan = { ...markerLost.generationPlan!, presentations: [{
      ...markerLost.generationPlan!.presentations![0],
      policySnapshot: { mode: "direct" },
      policyDecisionState: "pending",
      policyDecisionDeadlineAt: new Date(Date.now() - 1).toISOString(),
    }] };
    expect(projectPendingSpendConfirm(markerLost)).toMatchObject({ manualDecisionRequired: true });
  });

  it("旧数据没写期限：读盘补上期限，过了期就照样出卡等人", () => {
    const persisted = run();
    persisted.generationPlan = { ...persisted.generationPlan!, presentations: [{
      ...persisted.generationPlan!.presentations![0],
      openedAt: "2026-09-11T00:00:00.000Z",
      policySnapshot: { mode: "direct" },
      policyDecisionState: "pending",
      policyDecisionDeadlineAt: undefined,
    }] };
    const restarted = normalizeLegacyPresentation(persisted);
    expect(restarted.generationPlan!.presentations![0].policyDecisionDeadlineAt).toBe(
      new Date(Date.parse("2026-09-11T00:00:00.000Z") + PROJECT_AGENT_PREPARING_DEADLINE_MS).toISOString(),
    );
    expect(projectPendingSpendConfirm(restarted)).toMatchObject({ manualDecisionRequired: true });
  });

  it("直接生成档的刹车：退回的这张卡带上 brake 原因（Run 现派生，不落盘）；请求批准档不带", () => {
    const stopped = run();
    stopped.status = "paused";
    stopped.generationPlan = { ...stopped.generationPlan!, presentations: [{
      ...stopped.generationPlan!.presentations![0],
      policySnapshot: { mode: "direct" },
      policyDecisionState: "failed",
    }] };
    expect(projectPendingSpendConfirm(stopped)).toMatchObject({ manualDecisionRequired: true, brake: { reason: "stopped" } });
    const request = run();
    request.status = "paused";
    expect(projectPendingSpendConfirm(request)?.brake).toBeUndefined();
  });

  it("刹车数得到交给画布的那几次失败：连续三次到过供应商的失败 → retry-limit；读不到画布 Run 就数不到", () => {
    const failedJob = (canvasRunId: string, at: string): ProductionJob => ({
      jobId: `job-${canvasRunId}`, stageId: "generate", status: "needs_attention", errorCode: "provider_failed", attempt: 1,
      provider: "fixture-provider", model: "model-s1", idempotencyKey: `k-${canvasRunId}`, metadata: { shotId: "s1" }, createdAt: at, updatedAt: at,
    });
    const earlier = (n: number): GenerationPresentation => ({
      presentationId: `op-a:presentation:${n}`, presentationEpoch: n, policySnapshot: { mode: "direct" }, shotIds: ["s1"],
      openedAt: `2026-09-1${n}T00:00:00.000Z`, fromGate: 0, closed: { at: `2026-09-1${n}T00:00:01.000Z`, by: "handed_to_canvas" },
      handOvers: [handOver("s1", { by: "policy", canvasRunId: `canvas-${n}`, at: `2026-09-1${n}T00:00:00.500Z`, settled: { at: `2026-09-1${n}T00:00:00.600Z`, outcome: "accepted" } })],
    });
    const retried = threeShots();
    retried.generationPlan!.presentations = [earlier(1), earlier(2), earlier(3), {
      presentationId: "op-a:presentation:4", presentationEpoch: 4, policySnapshot: { mode: "direct" }, policyDecisionState: "failed",
      shotIds: ["s1"], openedAt: "2026-09-14T00:00:00.000Z", fromGate: 0,
    }];
    const canvasRuns = new Map([1, 2, 3].map((n) => [`canvas-${n}`, { jobs: [failedJob(`canvas-${n}`, `2026-09-1${n}T00:00:00.700Z`)] } as unknown as ProductionRun]));
    expect(projectPendingSpendConfirm(retried, (runId) => canvasRuns.get(runId))).toMatchObject({ manualDecisionRequired: true, brake: { reason: "retry-limit", shotId: "s1" } });
    expect(projectPendingSpendConfirm(retried)?.brake).toBeUndefined();
  });

  it("没有代答在飞的草稿照旧出卡；封印过、门还在等的旧数据也照样出卡（那一镜还没决定）", () => {
    expect(projectPendingSpendConfirm(run())).toBeDefined();
    const sealed = run({
      gates: [{ gateId: "gate-a", scope: "budget_envelope", status: "waiting", planHash: "d-a", authorizationDigest: "d-a", authorizationEnvelope: { gateId: "gate-a", jobs: [] } as never, title: "", summary: "", jobIds: [], createdAt: NOW, expiresAt: NOW } as ProductionRun["gates"][number]],
    });
    sealed.generationPlan = { ...sealed.generationPlan!, state: "sealed" };
    expect(projectPendingSpendConfirm(sealed)?.shots.map((shot) => shot.offer)).toEqual(["undecided"]);
  });

  it("一个项目里多笔时按 updatedAt 排序（介入槽只显示第一张，其余算「还有 N 条」）", () => {
    const older = run({ runId: "op-old", updatedAt: "2026-09-10T00:00:00.000Z" });
    const newer = run({ runId: "op-new", updatedAt: "2026-09-12T00:00:00.000Z" });
    expect(listPendingSpendConfirms([newer, older], () => undefined).map((row) => row.runId))
      .toEqual(["op-old", "op-new"]);
  });
});
