import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { consecutiveFailedAttempts, plannedShotIdsFromJobs, spendDecisionByPolicy } from "./directGenerationBrakes";
import { presentGenerationPlan, removePresentedShot } from "../../productionRun/productionGenerationPresentationEdits";
import { applyGenerationCandidatePatch } from "../../productionRun/productionGenerationPlanEdits";
import type { ProductionRun } from "../../productionRun/productionRunTypes";

// 独立验收 V-1203 的边界（2026-10-16）：刹车判据必须从**历史事实**推，不从当前批次的派生状态推。
//   F1：去掉旧镜（included=false）不能抹掉「说好的计划」——同一 Run 里补的新镜仍是计划外；
//   附 1：「点继续之后重新数」要读「这一次尝试是不是人批的」这件事实，不能靠失败数取模猜；
//   附 2：最近一次失败没到过供应商时，那一镜照样要这一次决定，刹车照判。

const DIRECT = { mode: "direct" } as const;
const candidate = (id: string) => ({ candidateId: id, revision: 1, parameters: {}, references: [] });
const failed = (shotId: string, attempt: number, extra: Record<string, unknown> = {}) => ({
  jobId: `${shotId}-j${attempt}`, stageId: "generate", attempt, status: "needs_attention",
  createdAt: `2026-10-12T00:00:0${attempt}Z`, metadata: { shotId }, ...extra,
});

/** 一个最小但走真实编辑函数的 Run：s1 已经被批过、连续失败 3 次，卡上正摆着 s1 的重试。 */
function runWithFailedS1(): ProductionRun {
  return {
    runId: "run-1", projectId: "p1", status: "running", planVersion: 1,
    budget: { reserved: 0, unsettled: 0 },
    gates: [{ gateId: "g1", scope: "budget_envelope", status: "approved", authorizationDigest: "d1", authorizationEnvelope: { jobs: [{ shotId: "s1" }] }, jobIds: [] }],
    jobs: [failed("s1", 1), failed("s1", 2), failed("s1", 3)],
    generationPlan: {
      operationId: "run-1", state: "draft", candidate: candidate("c1"), updatedAt: "2026-10-12T00:00:09Z",
      shots: [{ shotId: "s1", candidate: candidate("c1"), updatedAt: "2026-10-12T00:00:09Z" }],
      presentations: [{ presentationId: "p1", presentationEpoch: 1, shotIds: ["s1"], fromGate: 1, openedAt: "2026-10-12T00:00:09Z" }],
    },
  } as unknown as ProductionRun;
}

function withNewShot(run: ProductionRun, shotId: string): ProductionRun {
  const plan = run.generationPlan!;
  return { ...run, generationPlan: { ...plan, shots: [...(plan.shots ?? []), { shotId, candidate: candidate(`c-${shotId}`), updatedAt: plan.updatedAt }] } } as ProductionRun;
}

describe("F1 · 去掉旧镜不抹掉说好的计划", () => {
  it("卡上去掉 s1（真实 removePresentedShot），同一 Run 补 s2 再出价：计划仍含 s1，s2 计划外 → 不代答", () => {
    let run = removePresentedShot(runWithFailedS1(), "s1", "2026-10-12T00:00:10Z");
    expect(run.generationPlan!.shots!.find((shot) => shot.shotId === "s1")!.included).toBe(false);
    run = presentGenerationPlan(withNewShot(run, "s2"), ["s2"], "2026-10-12T00:00:11Z", DIRECT);
    expect(plannedShotIdsFromJobs(run)).toEqual(["s1"]);
    expect(spendDecisionByPolicy(DIRECT, run)).toMatchObject({ decided: false, brake: { reason: "out-of-plan", shotId: "s2" } });
  });

  it("候选补丁写 included=false（真实 applyGenerationCandidatePatch）同样不抹计划", () => {
    const base = runWithFailedS1();
    const plan = applyGenerationCandidatePatch(base.generationPlan!, {
      commandId: "c", expectedRevision: 0, type: "generation.candidate.patch", issuedAt: "2026-10-12T00:00:10Z",
      payload: { shotId: "s1", patch: {}, included: false },
    }, "2026-10-12T00:00:10Z");
    expect(plan.shots!.find((shot) => shot.shotId === "s1")!.included).toBe(false);
    const run = presentGenerationPlan(withNewShot({ ...base, generationPlan: plan } as ProductionRun, "s2"), ["s2"], "2026-10-12T00:00:11Z", DIRECT);
    expect(plannedShotIdsFromJobs(run)).toEqual(["s1"]);
    expect(spendDecisionByPolicy(DIRECT, run)).toMatchObject({ decided: false, brake: { reason: "out-of-plan" } });
  });
});

/**
 * 每次尝试一份出价、一道付费门：出价 i 的 `fromGate = i`，门 i 的摘要 = 那次尝试 job 的摘要。
 * `human` 里列出的尝试 = 那份出价在「直接生成」档下被刹车退回、由真人在卡上点的（policyDecisionState: failed）。
 */
function historyRun(attempts: ReadonlyArray<{ attempt: number; status?: string; errorCode?: string }>, human: readonly number[] = []): ProductionRun {
  return {
    runId: "run-h", status: "running",
    gates: attempts.map(({ attempt }) => ({ gateId: `g${attempt}`, scope: "budget_envelope", status: "approved", authorizationDigest: `d${attempt}`, authorizationEnvelope: { jobs: [] }, jobIds: [`s1-j${attempt}`] })),
    jobs: attempts.map(({ attempt, status, errorCode }) => failed("s1", attempt, { authorizationDigest: `d${attempt}`, ...(status ? { status } : {}), ...(errorCode ? { errorCode } : {}) })),
    generationPlan: {
      operationId: "run-h", state: "draft", candidate: candidate("c1"),
      shots: [{ shotId: "s1", candidate: candidate("c1") }],
      presentations: [
        ...attempts.map(({ attempt }, index) => ({
          presentationId: `p${attempt}`, shotIds: ["s1"], fromGate: index, openedAt: `2026-10-12T00:00:0${attempt}Z`,
          policySnapshot: DIRECT, policyDecisionState: human.includes(attempt) ? "failed" : "pending",
        })),
        // 这一次：s1 又摆上卡等重试。
        { presentationId: "p-now", shotIds: ["s1"], fromGate: attempts.length, openedAt: "2026-10-12T00:00:30Z", policySnapshot: DIRECT, policyDecisionState: "pending" },
      ],
    },
  } as unknown as ProductionRun;
}

describe("附 1 · 「点继续后重新数」读人批的事实", () => {
  it("连续 4 次失败、没有一次是人批的 → 第 4 次之后照停（不能因为 4 不是 3 的倍数就放行）", () => {
    const run = historyRun([1, 2, 3, 4].map((attempt) => ({ attempt })));
    expect(consecutiveFailedAttempts(run, "s1")).toBe(4);
    expect(spendDecisionByPolicy(DIRECT, run)).toMatchObject({ decided: false, brake: { reason: "retry-limit" } });
  });
  it("第 4 次是人在刹车卡上点了继续：第 4、5 次失败后照常自动重试，第 6 次失败后再停", () => {
    const five = historyRun([1, 2, 3, 4, 5].map((attempt) => ({ attempt })), [4]);
    expect(consecutiveFailedAttempts(five, "s1")).toBe(2);
    expect(spendDecisionByPolicy(DIRECT, five)).toEqual({ decided: true });
    const six = historyRun([1, 2, 3, 4, 5, 6].map((attempt) => ({ attempt })), [4]);
    expect(consecutiveFailedAttempts(six, "s1")).toBe(3);
    expect(spendDecisionByPolicy(DIRECT, six)).toMatchObject({ decided: false, brake: { reason: "retry-limit" } });
  });
});

describe("附 2 · 最近一次没到过供应商的失败不让刹车失明", () => {
  it("复验 R2：人在刹车卡上点了继续、那次尝试提交前没写出去——这次人批照样切断之前的计数（0），不再拿旧失败拦他", () => {
    const run = historyRun([{ attempt: 1 }, { attempt: 2 }, { attempt: 3 }, { attempt: 4, errorCode: "provider_not_reached" }], [4]);
    expect(consecutiveFailedAttempts(run, "s1")).toBe(0);
    expect(spendDecisionByPolicy(DIRECT, run)).toEqual({ decided: true });
  });
  it("3 次到过供应商的失败 + 1 次提交前没写出去：计数仍是 3，这一次照停", () => {
    const run = historyRun([{ attempt: 1 }, { attempt: 2 }, { attempt: 3 }, { attempt: 4, errorCode: "provider_not_reached" }]);
    expect(consecutiveFailedAttempts(run, "s1")).toBe(3);
    expect(spendDecisionByPolicy(DIRECT, run)).toMatchObject({ decided: false, brake: { reason: "retry-limit", shotId: "s1" } });
  });
});

describe("F3 · 替用户代答付费只剩一个入口", () => {
  it("生产代码里除了 spendDecisionByPolicy 自己（和不付费的放行矩阵），没有谁直接问档位那一半", () => {
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const allowed = new Set([
      "shared/agentCapabilities/capabilityApprovalPolicy.ts", // 定义处 + 放行矩阵（只答 run / ask，不发起付费）
      "shared/agentCapabilities/directGenerationBrakes.ts", // 唯一代答入口
    ]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== "node_modules") walk(full); continue; }
        if (!/\.(ts|mts|tsx)$/.test(entry.name) || /\.test\./.test(entry.name)) continue;
        const rel = path.relative(root, full).split(path.sep).join("/");
        if (allowed.has(rel)) continue;
        const code = fs.readFileSync(full, "utf8").split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
        if (/\bspendDecidedByPolicy\s*\(/.test(code)) offenders.push(rel);
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
