import { describe, expect, it } from "vitest";

import * as policyModule from "./capabilityApprovalPolicy";
import * as brakes from "./directGenerationBrakes";
import type { CapabilityApprovalSubject } from "./capabilityApprovalPolicy";

// 线 L19 第一轮 · 必红测试（设计卡 docs/plan/2026-10-12-agent-permission-two-tiers.md）。
// 每条断言对应设计卡「测试对照表」的一行（第一轮写成必红，第二轮实现后转绿）。
// 第二轮按协调会话拍板调整了两处断言的形状（不是削弱）：①连续失败按 job 状态派生、用取模表达「点继续后从这次确认重新数」；
// ②计划基线取自 Run 上已有 job 的镜（不再读 approvals）。

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
  // 计数的定义是「从上一次人批之后连续失败了几次」（consecutiveFailedAttempts 从事实数）：没有人批过，4、5、6 次都照停。
  // 「点继续之后重新数」由人批的事实决定，不靠取模猜——Run 级用例见 directGenerationBrakes.boundaries.test.ts（V-1203）。
  it("连续失败满 3 次以上（期间没有人批）：一律停，不因为不是 3 的倍数就放行", () => {
    for (const consecutiveFailures of [3, 4, 5, 6]) expect(brake({ consecutiveFailures })).toMatchObject({ allow: false, reason: "retry-limit" });
  });
  it("计数按镜头独立：s1 失败 3 次不拦 s2", () => {
    expect(brake({ shotId: "s2", consecutiveFailures: 0 }).allow).toBe(true);
  });
  it("请求批准档刹车不生效（每次本来就问），不重复打断", () => {
    expect(brake({ tier: "request", consecutiveFailures: 5 }).allow).toBe(true);
  });
  it("从 run 的 jobs 数连续失败：中间成功一次清零，只数末尾连续失败的 attempt", () => {
    const count = (brakes as unknown as { consecutiveFailedAttempts: (run: unknown, shotId: string) => number }).consecutiveFailedAttempts;
    const job = (attempt: number, status: string, errorCode?: string) => ({ stageId: "generate", attempt, status, errorCode, createdAt: `2026-10-12T00:00:0${attempt}Z`, metadata: { shotId: "s1" } });
    const run = (jobs: unknown[]) => ({ generationPlan: { shots: [{ shotId: "s1" }] }, jobs });
    expect(count(run([job(1, "needs_attention"), job(2, "needs_attention"), job(3, "needs_attention")]), "s1")).toBe(3);
    expect(count(run([job(1, "needs_attention"), job(2, "ready"), job(3, "needs_attention")]), "s1")).toBe(1);
    // 只计可能已到过供应商的失败：提交前没写出去的（provider_not_reached）既不计也不重置。
    expect(count(run([job(1, "needs_attention"), job(2, "needs_attention", "provider_not_reached"), job(3, "needs_attention")]), "s1")).toBe(2);
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
  it("计划基线 = 这个 Run 里已经有 job 的镜（概念 production.shot-jobs），不另存第二份计划", () => {
    const baseline = (brakes as unknown as { plannedShotIdsFromJobs: (run: unknown) => string[] }).plannedShotIdsFromJobs;
    const job = (shotId: string) => ({ stageId: "generate", attempt: 1, status: "authorized", createdAt: "2026-10-12T00:00:01Z", metadata: { shotId } });
    const run = { generationPlan: { shots: [{ shotId: "s1" }, { shotId: "s2" }, { shotId: "s7" }] }, jobs: [job("s1"), job("s2")] };
    expect(baseline(run).sort()).toEqual(["s1", "s2"]);
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

describe("格 5/★2 · 唯一入口 spendDecisionByPolicy：档位 + 刹车一起问（三个调用点共用）", () => {
  const entry = () => (brakes as unknown as { spendDecisionByPolicy: (policy: unknown, run: unknown) => { decided: boolean; brake?: { reason: string; shotId?: string } } }).spendDecisionByPolicy;
  const job = (shotId: string, attempt: number, status: string) => ({ stageId: "generate", attempt, status, createdAt: `2026-10-12T00:00:0${attempt}Z`, metadata: { shotId } });
  const planOf = (ids: string[]) => ({ generationPlan: { shots: ids.map((shotId) => ({ shotId })) } });
  it("请求批准：永不代答，也没有刹车说明", () => {
    expect(entry()(REQUEST, { ...planOf(["s1"]), jobs: [] })).toEqual({ decided: false });
  });
  it("直接生成 + 第一次代批（Run 里还没有 job）：代答", () => {
    expect(entry()(DIRECT, { ...planOf(["s1", "s2"]), jobs: [] })).toEqual({ decided: true });
  });
  it("直接生成 + 没有 Run 可看：只剩档位那一问，代答（与改动前逐字相同）", () => {
    expect(entry()(DIRECT, undefined)).toEqual({ decided: true });
  });
  it("直接生成 + 已批过 s1、s2，计划里又冒出 s3 → 不代答，原因 out-of-plan，指到 s3", () => {
    const run = { ...planOf(["s1", "s2", "s3"]), jobs: [job("s1", 1, "ready"), job("s2", 1, "ready")] };
    expect(entry()(DIRECT, run)).toMatchObject({ decided: false, brake: { reason: "out-of-plan", shotId: "s3" } });
  });
  it("直接生成 + s1 连续失败 3 次等重试 → 不代答，原因 retry-limit", () => {
    const run = { ...planOf(["s1"]), jobs: [job("s1", 1, "needs_attention"), job("s1", 2, "needs_attention"), job("s1", 3, "needs_attention")] };
    expect(entry()(DIRECT, run)).toMatchObject({ decided: false, brake: { reason: "retry-limit", shotId: "s1" } });
  });
  it("直接生成 + s1 只失败 2 次 → 照常代答重试", () => {
    const run = { ...planOf(["s1"]), jobs: [job("s1", 1, "needs_attention"), job("s1", 2, "needs_attention")] };
    expect(entry()(DIRECT, run)).toEqual({ decided: true });
  });
  it("直接生成 + Run 已被用户停止 → 不代答，原因 stopped", () => {
    expect(entry()(DIRECT, { ...planOf(["s1"]), jobs: [], status: "paused" })).toMatchObject({ decided: false, brake: { reason: "stopped" } });
  });
  it("只判这一次出价摆出来的镜：早就失败 3 次、这次没摆出来的 s1 不让 s2 的重试停下", () => {
    const presented = (shotIds: string[]) => ({ presentations: [{ presentationId: "p", presentationEpoch: 1, shotIds, openedAt: "2026-10-12T00:00:09Z", fromGate: 0 }] });
    const jobs = [job("s1", 1, "needs_attention"), job("s1", 2, "needs_attention"), job("s1", 3, "needs_attention"), job("s2", 1, "needs_attention")];
    const plan = planOf(["s1", "s2"]).generationPlan;
    expect(entry()(DIRECT, { generationPlan: { ...plan, ...presented(["s2"]) }, jobs })).toEqual({ decided: true });
    // 阳性对照：这次摆的正是 s1 → 照停。
    expect(entry()(DIRECT, { generationPlan: { ...plan, ...presented(["s1"]) }, jobs })).toMatchObject({ decided: false, brake: { reason: "retry-limit", shotId: "s1" } });
  });
  it("已完成 / 在跑的镜不会触发刹车（只有新镜与等重试的镜需要这一次代答）", () => {
    const run = { ...planOf(["s1", "s2"]), jobs: [job("s1", 1, "ready"), job("s2", 1, "polling")] };
    expect(entry()(DIRECT, run)).toEqual({ decided: true });
  });
});
