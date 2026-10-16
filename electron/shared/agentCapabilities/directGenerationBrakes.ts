// 「直接生成」档的两个刹车 + 带 Run 的付费代答入口（2026-10-12 用户拍板）。
//
// 用户原话：「不设固定次数，只在同一镜头连续失败重试超过 2 次、或超出它说好的计划时才停。」
// 所以这里**没有任何次数 / 张数 / 金额上限**，只有两个会让这一次决定退回「请求批准」确认路径的事实：
//   ① retry-limit  —— 同一镜连续失败满 3 次（失败 1、2 次后各自动重试一次，第 3 次失败后、第 3 次重试之前停）。
//   ② out-of-plan  —— 这个 Run 里已经有镜被批过了（= 说好的计划），而这一次要代答的是计划外的新镜。
// 外加不属于刹车、但同一处判的：③ stopped —— 用户点了停止（Run 停着），不替用户续跑。
//
// ── 为什么它是纯函数、而且不存任何状态 ──
//
//   · 「说好的计划」不另存第二份：它就是 Run 上已经有 job 的那些镜（`jobsForShot`，概念 production.shot-jobs）。
//     用户点「继续」放行计划外那一镜 → 走正常确认卡 → 这一镜有了 job → 自然进了计划（拍板 5），没有要维护的基线。
//   · 「连续失败数」每次从 job 派生：只数可能已到过供应商的失败（`jobMayHaveReachedProvider`，既有判据；提交前断网这类
//     没写出去的不计、也不重置），遇到成功就清零。用户点「继续」之后的重新计数用取模表达：失败数是 3 的倍数才停，
//     所以确认后的第 4、5 次失败照旧自动重试，第 6 次失败再停——等价于「从这次确认重新数」，不需要任何标记位。
//
// ── 刹车放在哪 ──
//
// 只放在**策略代批那一个点**（`spendDecisionByPolicy`）：刹车成立 = 这一次决定退回「请求批准」的正常路径
// （报价卡照旧摆出来等人点，收据由真人手势铸）。**不**在派发闸上加第二道兜底（P1：无并行版）。三个入口
// （`generationTransportAdapters` 两处、`generationDispatcher` 一处）都问这个函数，不各判各的。
import type { ProductionJob, ProductionRun } from "../../productionRun/productionRunTypes";
import { jobMayHaveReachedProvider, jobsForShot } from "../productionShotJobs";
import { productionJobPhase } from "../productionShotPhase";
import { isStoppedRunStatus } from "../productionRunStop";
import { currentPresentation } from "../productionGenerationPresentation";
import { spendDecidedByPolicy, type ProjectAgentApprovalMode, type ProjectAgentApprovalPolicy } from "./capabilityApprovalPolicy";

/** 同一镜连续失败这么多次，第 N 次重试之前停（用户拍板：重试超过 2 次 = 第 3 次失败后停）。 */
export const DIRECT_GENERATION_RETRY_LIMIT = 3;

export type DirectGenerationBrakeReason = "stopped" | "retry-limit" | "out-of-plan";

export type DirectGenerationBrakeInput = Readonly<{
  tier: ProjectAgentApprovalMode;
  /** 已经说好的计划里有哪些镜。空 = 还没有计划（第一次代批），不存在计划外。 */
  plannedShotIds: readonly string[];
  stopped: boolean;
  shotId: string;
  consecutiveFailures: number;
}>;

export type DirectGenerationBrakeResult = Readonly<{ allow: true } | { allow: false; reason: DirectGenerationBrakeReason }>;

/**
 * 单镜判定。停止键与挡位无关（两档都生效）；两个刹车只在 `direct` 档生效——
 * `request` 档每次本来就问，不重复打断。
 */
export function directGenerationBrake(input: DirectGenerationBrakeInput): DirectGenerationBrakeResult {
  if (input.stopped) return { allow: false, reason: "stopped" };
  if (input.tier !== "direct") return { allow: true };
  if (input.plannedShotIds.length > 0 && !input.plannedShotIds.includes(input.shotId)) {
    return { allow: false, reason: "out-of-plan" };
  }
  if (input.consecutiveFailures > 0 && input.consecutiveFailures % DIRECT_GENERATION_RETRY_LIMIT === 0) {
    return { allow: false, reason: "retry-limit" };
  }
  return { allow: true };
}

type RunFacts = Pick<ProductionRun, "generationPlan" | "jobs"> & Partial<Pick<ProductionRun, "status">>;

function failedForBrake(job: ProductionJob): boolean {
  return (productionJobPhase(job.status) === "failed" || job.status === "submission_unknown") && jobMayHaveReachedProvider(job);
}

/** 这一镜末尾连续失败了几次（成功清零；没写出去的失败既不计也不重置）。 */
export function consecutiveFailedAttempts(run: RunFacts, shotId: string): number {
  const jobs = jobsForShot(run as ProductionRun, shotId)
    .slice()
    .sort((a, b) => (a.attempt - b.attempt) || (Date.parse(a.createdAt) - Date.parse(b.createdAt)));
  let count = 0;
  for (let index = jobs.length - 1; index >= 0; index -= 1) {
    const job = jobs[index];
    if (!jobMayHaveReachedProvider(job) && productionJobPhase(job.status) === "failed") continue;
    if (!failedForBrake(job)) break;
    count += 1;
  }
  return count;
}

/** 这个 Run 里要生成的单元（多镜 = 纳入的镜；单镜旧形状 = 候选 id）。 */
function unitsOf(run: RunFacts): string[] {
  const shots = run.generationPlan?.shots;
  if (shots?.length) return shots.filter((shot) => shot.included !== false).map((shot) => shot.shotId);
  const single = run.generationPlan?.candidate?.candidateId;
  return single ? [single] : [];
}

/** 「说好的计划」：这个 Run 里已经有 job（= 被批过）的那些镜。 */
export function plannedShotIdsFromJobs(run: RunFacts): string[] {
  return unitsOf(run).filter((shotId) => jobsForShot(run as ProductionRun, shotId).length > 0);
}

/**
 * 这一次代答要决定的是哪几镜：就是这一次出价摆出来的那几镜（`currentPresentation().shotIds`，出价的唯一 owner）。
 * 没有出价记录（旧形状 / 夹具）时退回整份计划。不看出价范围的话，一个早就被晾在一边的失败镜会让之后每一次
 * 不相干的出价都停下来问——那是把刹车装在了别的镜头上。
 */
function unitsInDecision(run: RunFacts): string[] {
  const scope = currentPresentation(run.generationPlan)?.shotIds;
  if (!scope?.length) return unitsOf(run);
  const units = new Set(unitsOf(run));
  return scope.filter((shotId) => units.has(shotId));
}

export type DirectGenerationRunBrake = Readonly<{ reason: DirectGenerationBrakeReason; shotId?: string }>;

/** 对这一次出价判一次：摆出来的镜里任何一个触发刹车就停（返回触发的那个）。 */
export function directGenerationBrakeForRun(
  policy: ProjectAgentApprovalPolicy | undefined,
  run: RunFacts | undefined,
): DirectGenerationRunBrake | undefined {
  if (!run) return undefined;
  const tier: ProjectAgentApprovalMode = spendDecidedByPolicy(policy) ? "direct" : "request";
  const stopped = run.status !== undefined && isStoppedRunStatus(run.status);
  const planned = plannedShotIdsFromJobs(run);
  for (const shotId of unitsInDecision(run)) {
    const jobs = jobsForShot(run as ProductionRun, shotId);
    // 只有「还没被批过的新镜」和「最近一次尝试失败了、等着重试的镜」需要这一次代答；在跑 / 已完成 / 已批待派的不需要。
    const latest = jobs.slice().sort((a, b) => (b.attempt - a.attempt) || (Date.parse(b.createdAt) - Date.parse(a.createdAt)))[0];
    if (latest && !failedForBrake(latest)) continue;
    const verdict = directGenerationBrake({
      tier, plannedShotIds: planned, stopped, shotId, consecutiveFailures: consecutiveFailedAttempts(run, shotId),
    });
    if (!verdict.allow) return { reason: verdict.reason, shotId };
  }
  return undefined;
}

export type SpendDecisionByPolicy = Readonly<{ decided: true } | { decided: false; brake?: DirectGenerationRunBrake }>;

/**
 * 「这一笔付费，档位代答还是退回确认卡？」——**带 Run 的入口只问这一个函数**。
 * `request` 档 → 未代答（无刹车说明）；`direct` 档 → 先问刹车，成立则未代答并带上原因，否则代答。
 * 读不到 Run（没有读口 / 草稿还没落盘）时只剩档位这一问——停止与计划无从判，按刹车不成立处理，
 * 与改动前的行为逐字相同。
 */
export function spendDecisionByPolicy(
  policy: ProjectAgentApprovalPolicy | undefined,
  /** 惰性：`request` 档不需要看 Run，也就不去读盘。 */
  run: RunFacts | undefined | (() => RunFacts | undefined),
): SpendDecisionByPolicy {
  if (!spendDecidedByPolicy(policy)) return { decided: false };
  const brake = directGenerationBrakeForRun(policy, typeof run === "function" ? run() : run);
  return brake ? { decided: false, brake } : { decided: true };
}
