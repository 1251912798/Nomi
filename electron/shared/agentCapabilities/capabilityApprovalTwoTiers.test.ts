import { describe, expect, it } from "vitest";

import * as policyModule from "./capabilityApprovalPolicy";
import * as brakes from "./directGenerationBrakes";
import type { CapabilityApprovalSubject } from "./capabilityApprovalPolicy";

// 线 L19 第一轮 · 必红测试（设计卡 docs/plan/2026-10-12-agent-permission-two-tiers.md）。
// 每条断言对应设计卡「测试对照表」的一行。实现落地前整个文件红（`directGenerationBrakes` 模块还不存在，导入即失败）；
//   · 新词表 request / direct 还不存在；
//   · `capabilityApprovalDecision` 与 `directGenerationBrakes.ts` 还没写。
// 落地后必须逐条转绿，不许改断言。

const REQUEST = { mode: "request" } as never;
const DIRECT = { mode: "direct" } as never;

const base: CapabilityApprovalSubject = { effect: undefined, effectClass: undefined, requiresPlanReview: false, destructiveHint: false };
const reversible: CapabilityApprovalSubject = { ...base, effect: "reversible_write", effectClass: "reversible_local" };
const paid: CapabilityApprovalSubject = { ...base, effect: "paid", effectClass: "spend" };
const irreversible: CapabilityApprovalSubject = { ...base, effect: "destructive", effectClass: "irreversible" };

type Decide = (policy: unknown, subject: CapabilityApprovalSubject) => "run" | "ask";
const decide = (policy: unknown, subject: CapabilityApprovalSubject): "run" | "ask" =>
  ((policyModule as unknown as { capabilityApprovalDecision: Decide }).capabilityApprovalDecision)(policy, subject);

type BrakeResult = { allow: boolean; reason?: string };
type BrakeFn = (input: unknown) => BrakeResult;
const brakeFn = (): BrakeFn => (brakes as unknown as { directGenerationBrake: BrakeFn }).directGenerationBrake;

describe("格 ★2/★4 · 挡位词表只有两档", () => {
  it("PROJECT_AGENT_APPROVAL_MODES === [request, direct]，旧三档词不再存在", () => {
    expect([...policyModule.PROJECT_AGENT_APPROVAL_MODES]).toEqual(["request", "direct"]);
  });
  it("默认档是请求批准", () => {
    expect(policyModule.DEFAULT_PROJECT_AGENT_APPROVAL_POLICY.mode).toBe("request");
  });
});

describe("格 ★1/★2 · 放行矩阵：可撤销 / 花钱 / 不可逆 × 两档", () => {
  it("请求批准：可撤销直接做；花钱问；不可逆问", () => {
    expect(decide(REQUEST, reversible)).toBe("run");
    expect(decide(REQUEST, paid)).toBe("ask");
    expect(decide(REQUEST, irreversible)).toBe("ask");
  });
  it("直接生成：可撤销直接做；花钱直接跑；不可逆仍然问", () => {
    expect(decide(DIRECT, reversible)).toBe("run");
    expect(decide(DIRECT, paid)).toBe("run");
    expect(decide(DIRECT, irreversible)).toBe("ask");
  });
  it("解不出效果类（未登记别名）在两档都问——fail-closed 不因直接生成放宽", () => {
    expect(decide(REQUEST, base)).toBe("ask");
    expect(decide(DIRECT, base)).toBe("ask");
  });
  it("外部工具 destructiveHint 在两档都问", () => {
    expect(decide(DIRECT, { ...reversible, destructiveHint: true })).toBe("ask");
  });
  it("宿主面「花钱要不要由档位代答」只有直接生成为真，且仍只有 spendDecidedByPolicy 一个回答者", () => {
    expect(policyModule.spendDecidedByPolicy(REQUEST)).toBe(false);
    expect(policyModule.spendDecidedByPolicy(DIRECT)).toBe(true);
  });
  it("模型面硬闸不变：花钱 / 不可逆在两档都不能复用安全批准", () => {
    for (const policy of [REQUEST, DIRECT]) {
      expect(policyModule.capabilityMayReuseSafeApproval(policy, paid, true)).toBe(false);
      expect(policyModule.capabilityMayReuseSafeApproval(policy, irreversible, true)).toBe(false);
    }
  });
});

describe("格 5/★4 · 刹车 1：同一镜连续失败、重试超过 2 次", () => {
  const brake = (input: Record<string, unknown>) =>
    brakeFn()({ tier: "direct", plannedShotIds: ["s1", "s2", "s3"], stopped: false, shotId: "s1", consecutiveFailures: 0, ...input });
  it("连续失败 0、1、2 次后：重试照常放行", () => {
    for (const consecutiveFailures of [0, 1, 2]) expect(brake({ consecutiveFailures }).allow).toBe(true);
  });
  it("连续失败 3 次后、第 3 次重试之前：停下并说明原因 retry-limit", () => {
    expect(brake({ consecutiveFailures: 3 })).toMatchObject({ allow: false, reason: "retry-limit" });
  });
  it("计数按镜头独立：s1 失败 3 次不拦 s2", () => {
    expect(brake({ shotId: "s2", consecutiveFailures: 0 }).allow).toBe(true);
  });
  it("请求批准档刹车不生效（每次本来就问），不重复打断", () => {
    expect(brake({ tier: "request", consecutiveFailures: 5 }).allow).toBe(true);
  });
  it("从 run 的 jobs 数连续失败：中间成功一次清零，只数末尾连续失败的 attempt", () => {
    const count = (brakes as unknown as { consecutiveFailedAttempts: (run: unknown, shotId: string) => number }).consecutiveFailedAttempts;
    const job = (attempt: number, status: string) => ({ stageId: "generate", attempt, status, createdAt: `2026-10-12T00:00:0${attempt}Z`, metadata: { shotId: "s1" } });
    const run = (jobs: unknown[]) => ({ generationPlan: { shots: [{ shotId: "s1" }] }, jobs });
    expect(count(run([job(1, "failed"), job(2, "failed"), job(3, "failed")]), "s1")).toBe(3);
    expect(count(run([job(1, "failed"), job(2, "ready"), job(3, "failed")]), "s1")).toBe(1);
  });
});

describe("格 5/★4 · 刹车 2：超出这一轮开头说好的计划", () => {
  const brake = (input: Record<string, unknown>) =>
    brakeFn()({ tier: "direct", plannedShotIds: ["s1", "s2", "s3", "s4", "s5", "s6"], stopped: false, shotId: "s1", consecutiveFailures: 0, ...input });
  it("计划内 6 个镜头逐个放行", () => {
    for (const shotId of ["s1", "s2", "s3", "s4", "s5", "s6"]) expect(brake({ shotId }).allow).toBe(true);
  });
  it("计划外的第 7 个：停下并说明原因 out-of-plan", () => {
    expect(brake({ shotId: "s7" })).toMatchObject({ allow: false, reason: "out-of-plan" });
  });
  it("计划内镜头的重试不算计划外", () => {
    expect(brake({ shotId: "s3", consecutiveFailures: 1 }).allow).toBe(true);
  });
  it("计划基线取自本 Run 第一次放行的批准记录（approvals[].jobIds），不另存第二份计划", () => {
    const baseline = (brakes as unknown as { plannedJobIdsFromApprovals: (run: unknown) => string[] }).plannedJobIdsFromApprovals;
    const run = { approvals: [{ decidedAt: "2026-10-12T00:00:01Z", jobIds: ["j-s1", "j-s2"], planHash: "h1" }, { decidedAt: "2026-10-12T00:05:00Z", jobIds: ["j-s7"], planHash: "h2" }] };
    expect(baseline(run).sort()).toEqual(["j-s1", "j-s2"]);
  });
});

describe("格 5 · 停止键", () => {
  it("已停止后任何镜头都不放行（reason: stopped），优先于计划与重试判断", () => {
    const out = brakeFn()({ tier: "direct", plannedShotIds: ["s1"], stopped: true, shotId: "s1", consecutiveFailures: 0 });
    expect(out).toMatchObject({ allow: false, reason: "stopped" });
  });
  it("请求批准档停止同样生效（停止键与挡位无关）", () => {
    const out = brakeFn()({ tier: "request", plannedShotIds: ["s1"], stopped: true, shotId: "s1", consecutiveFailures: 0 });
    expect(out).toMatchObject({ allow: false, reason: "stopped" });
  });
});
