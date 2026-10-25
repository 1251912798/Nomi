import { describe, expect, it, vi } from "vitest";

import type { GenerationPresentation, ProductionRun } from "./productionRunTypes";
import { withdrawStalePresentations } from "./stalePresentationSweep";

// 重启之后收回上一个进程开着的出价（3.11 重启不出卡）。D2 第③步起没有例外：「直接生成」档正在交的那一次也收回——
// 问这句话的回合随上一个进程没了，重开之后谁也不在等它的结局。

const BEFORE = "2026-10-24T00:00:00.000Z";
const STARTED = "2026-10-24T01:00:00.000Z";
const AFTER = "2026-10-24T02:00:00.000Z";

function run(runId: string, presentation: Partial<GenerationPresentation> | null, overrides: Partial<ProductionRun> = {}): ProductionRun {
  return {
    schemaVersion: 1, runId, projectId: "project-1", revision: 1, status: "draft", stageId: "generate",
    playbook: { name: "generation.multi-shot", version: "1.0.0" }, origin: { host: "nomi" },
    policy: { trustedHosts: [], allowedProviders: [], allowedModels: [], maxSpend: null, maxAttemptsPerJob: 1, minimizeUploads: true },
    budget: { currency: "CNY", authorized: 0, reserved: 0, actual: 0, unsettled: 0, unknownInFlight: 0 },
    planVersion: 1, snapshotCursor: 0, stages: [], gates: [], jobs: [], artifacts: [],
    generationPlan: {
      operationId: runId, state: "draft",
      candidate: { candidateId: "c", revision: 1, moduleId: "m", providerId: "p", modelId: "x", mode: "t2i", prompt: "", parameters: {}, references: [] },
      ...(presentation ? { presentations: [{ shotIds: ["c"], openedAt: BEFORE, fromGate: 0, ...presentation }] } : {}),
      updatedAt: BEFORE,
    },
    createdAt: BEFORE, updatedAt: BEFORE,
    ...overrides,
  } as ProductionRun;
}

describe("重启清扫：上一个进程开着的出价一律收回", () => {
  it("请求批准档、直接生成档（策略在交）都收回，关因 stopped；本进程开的、外部宿主的、关了的、取消的不动", async () => {
    const runs = [
      run("request-stale", { policySnapshot: { mode: "request" } }),
      run("direct-in-flight", { policySnapshot: { mode: "direct" }, policyDecisionState: "pending", handOvers: [{ shotId: "c", by: "policy", at: BEFORE, canvasRunId: "canvas-1" }] }),
      run("this-process", { openedAt: AFTER }),
      run("external", {}, { origin: { host: "semantic-mcp" } }),
      run("closed", { closed: { at: BEFORE, by: "user_closed" } }),
      run("no-presentation", null),
    ];
    const cancelled = run("cancelled", {});
    cancelled.generationPlan = { ...cancelled.generationPlan!, state: "cancelled" };
    runs.push(cancelled);
    const withdraw = vi.fn();
    const withdrawn = await withdrawStalePresentations({ listRuns: () => runs, withdraw, processStartedAt: STARTED, now: () => AFTER }, "project-1");
    expect(withdrawn).toEqual(["request-stale", "direct-in-flight"]);
    expect(withdraw.mock.calls).toEqual([
      ["project-1", "request-stale", AFTER, "stopped"],
      ["project-1", "direct-in-flight", AFTER, "stopped"],
    ]);
  });

  it("一条坏账本不挡别的：收回失败的那条报给 onError，其余照收", async () => {
    const onError = vi.fn();
    const withdraw = vi.fn(async (_projectId: string, operationId: string) => {
      if (operationId === "bad") throw new Error("revision_conflict");
    });
    const withdrawn = await withdrawStalePresentations({ listRuns: () => [run("bad", {}), run("good", {})], withdraw, processStartedAt: STARTED, onError }, "project-1");
    expect(withdrawn).toEqual(["good"]);
    expect(onError).toHaveBeenCalledWith("bad", expect.any(Error));
  });
});
