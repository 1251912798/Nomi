// 「这一次出价摆了哪几镜、每一镜决定了没有、卡怎么关的」的唯一读口（2026-09-30 付费卡逐镜）。
//
// ── 它在解决哪个真实摩擦 ──
//
// 付费卡以前只有一个「仍要生成」：点下去宿主就把别的镜从这一批里删掉再封印，第 2 张悄悄消失、再没有卡问过它；
// Agent 却被告知「都开始了」（用户实见 U01 / U02）。用户拍板「点了的生成，去掉的不生成」：每一镜单独决定。
//
// 事实都在 Run 里：
//   · 这一次出价（`plan.presentations` 的最后一条）：摆了哪几镜、开着没有、关的原因；
//   · 卡上点了「生成」（或「直接生成」档的策略决定）的镜：记在这一次出价的 `handOvers` 里——D2 第③步起它们逐镜交给画布
//     单节点提交（一台发动机），画布那一侧把派发结论写回同一笔（交到了 / 结果未知 / 没发出去 / 被收回）；
//   · 点了「不生成 ×」的镜：记在这一次出价的 `removed` 里（多镜计划同一条命令里也让它退出这一批 `included: false`），恢复就拿掉；
//   · 用户在节点上自己点了生成的镜：那一镜的认领（`claim`，via node，记着那一次出价）；
//   · 制作流程的付费门批过的镜（外部宿主 / 升级前的旧卡）：这一次出价开出来之后，有一份**已批准**的授权（门）盖着它。
// 卡的投影、Agent 的回执、画布小标、认领判定都从这里读同一份（`offerShots`），不各自数镜头。纯函数，主进程与渲染层共用。
import type {
  GenerationHandOver,
  GenerationPresentation,
  GenerationPresentationCloser,
  ProductionGenerationPlan,
  ProductionRun,
  ProductionShotClaim,
} from "../productionRun/productionRunTypes";
import { spendAuthorizationGates } from "./productionSpendAuthority";
import { jobEndedBeforeAcceptance, jobsForShot } from "./productionShotJobs";
import { DEFAULT_PROJECT_AGENT_APPROVAL_POLICY } from "./agentCapabilities/capabilityApprovalPolicy";
import { PROJECT_AGENT_PREPARING_DEADLINE_MS } from "./projectAgentPreparingDeadline";

type PlanView = Pick<ProductionGenerationPlan, "state" | "candidate" | "shots" | "presentations" | "claim" | "canvasDetached">;

/** Agent lane 自己发起的那条路（`generationTransportAdapters` 的 `plan()` 盖的章）。面板里的付费卡只服务它。 */
export const IN_APP_AGENT_ORIGIN_HOST = "nomi";

/** 「直接生成」档替用户决的那一镜，收据上记的决定者宿主面（策略交接只有 Agent lane 写得出）。 */
export const IN_APP_AGENT_POLICY_SURFACE = "agent-lane";

/** The policy owner gives a pending decision the same bounded lifetime as its durable receipt writes. */
export function projectPolicyDecisionDeadlineAt(openedAt: string): string | undefined {
  const openedMs = Date.parse(openedAt);
  return Number.isFinite(openedMs)
    ? new Date(openedMs + PROJECT_AGENT_PREPARING_DEADLINE_MS).toISOString()
    : undefined;
}

/** New writes are anchored to the owner's wall clock; injected historical timestamps in replay/tests must not expire immediately. */
export function projectPolicyDecisionDeadlineFromOwnerClock(openedAt: string): string | undefined {
  const openedMs = Date.parse(openedAt);
  if (!Number.isFinite(openedMs)) return undefined;
  return new Date(Math.max(openedMs, Date.now()) + PROJECT_AGENT_PREPARING_DEADLINE_MS).toISOString();
}

/** 这一次出价（最后一条）。没有 = 草稿从没摆到用户面前过。 */
export function currentPresentation(plan: Pick<ProductionGenerationPlan, "presentations"> | undefined): GenerationPresentation | undefined {
  return plan?.presentations?.at(-1);
}

/** 卡此刻开着（有一次出价、还没关）。 */
export function presentationIsOpen(plan: Pick<ProductionGenerationPlan, "presentations"> | undefined): boolean {
  const current = currentPresentation(plan);
  return Boolean(current && !current.closed);
}

/** 投影用的「草稿还没摆出来」：draft 且没有一次开着的出价（任务面板据此不把它算成任务）。 */
export function draftCardHidden(plan: Pick<ProductionGenerationPlan, "state" | "presentations"> | undefined): boolean {
  return Boolean(plan && plan.state === "draft" && !presentationIsOpen(plan));
}

/** 计划里每一镜的 id（单镜旧形态只有顶层候选那一镜）。 */
export function planShotIds(plan: Pick<ProductionGenerationPlan, "candidate" | "shots">): string[] {
  return plan.shots?.length ? plan.shots.map((shot) => shot.shotId) : [plan.candidate.candidateId];
}

/** 这一镜在这一次出价里有没有一份**已批准**的授权（制作流程的付费门：外部宿主替用户批了，或升级前的旧卡点过「生成这张」）。 */
function approvedIn(run: Pick<ProductionRun, "gates">, shotId: string, presentation: GenerationPresentation): boolean {
  return spendAuthorizationGates(run).slice(presentation.fromGate).some((gate) => gate.status === "approved"
    && gate.authorizationEnvelope.jobs.some((job) => job.shotId === shotId));
}

/** 这一镜在**这一次出价**里已经批过了（没有开着的出价时：批过就算）。封印只给这一次出价里还没批的镜。 */
export function shotApprovedInCurrentPresentation(run: Pick<ProductionRun, "gates" | "generationPlan">, shotId: string): boolean {
  const presentation = currentPresentation(run.generationPlan);
  return presentation && !presentation.closed ? approvedIn(run, shotId, presentation) : everAuthorized(run, shotId);
}

/** 这一镜有没有过任何一份授权（生成过 / 正在生成）。生成过的不再摆上卡问一次。 */
function everAuthorized(run: Pick<ProductionRun, "gates">, shotId: string): boolean {
  return spendAuthorizationGates(run).some((gate) => gate.status === "approved"
    && gate.authorizationEnvelope.jobs.some((job) => job.shotId === shotId));
}

function shotOf(plan: PlanView, shotId: string) {
  return plan.shots?.find((shot) => shot.shotId === shotId);
}

/** 这一镜的认领记录（单镜旧形态挂在计划顶层，身份 = 顶层候选 id）。 */
function claimOf(plan: PlanView, shotId: string): ProductionShotClaim | undefined {
  if (plan.shots?.length) return shotOf(plan, shotId)?.claim;
  return shotId === plan.candidate.candidateId ? plan.claim : undefined;
}

/** 用户在这一次出价里去掉的那几镜（按点的先后）。 */
function removedIn(_plan: PlanView, presentation: GenerationPresentation): string[] {
  return (presentation.removed ?? []).map((entry) => entry.shotId);
}

/** 用户在任何一次出价里去掉过的镜：去掉的不再自动摆上卡。 */
function removedEver(plan: PlanView): Set<string> {
  return new Set((plan.presentations ?? []).flatMap((presentation) => (presentation.removed ?? []).map((entry) => entry.shotId)));
}

/** 用户在卡上点过「去掉这张 / 这段」的镜（任何一次出价里，恢复过的不算）。画布小标据此说「已去掉，不生成」。 */
export function removedShotIds(run: Pick<ProductionRun, "generationPlan">): string[] {
  return run.generationPlan ? [...removedEver(run.generationPlan)] : [];
}

/** 这一次出价里这一镜最后一笔「交给画布」（「再试一次」会再记一笔，以最后一笔为准）。 */
export function latestHandOver(presentation: GenerationPresentation | undefined, shotId: string): GenerationHandOver | undefined {
  const entries = presentation?.handOvers;
  if (!entries) return undefined;
  for (let index = entries.length - 1; index >= 0; index -= 1) if (entries[index].shotId === shotId) return entries[index];
  return undefined;
}

/**
 * 绑着这个画布单镜 Run 的那一笔交接在哪一次出价里（第几次出价、第几笔）。一笔交接怎么落定是它自己的事实：那一次出价后来被
 * 收回、被下一次出价顶掉，交到一半的那一镜照样要把结论写回它自己那一笔——只看当前那一次出价，它就永远停在「还在交」。
 */
export function handOverOfCanvasRun(
  plan: Pick<ProductionGenerationPlan, "presentations"> | undefined,
  canvasRunId: string,
): Readonly<{ presentationIndex: number; handOverIndex: number; handOver: GenerationHandOver }> | undefined {
  const presentations = plan?.presentations ?? [];
  for (let presentationIndex = presentations.length - 1; presentationIndex >= 0; presentationIndex -= 1) {
    const entries = presentations[presentationIndex].handOvers ?? [];
    const handOverIndex = entries.findIndex((entry) => entry.canvasRunId === canvasRunId);
    if (handOverIndex >= 0) return { presentationIndex, handOverIndex, handOver: entries[handOverIndex] };
  }
  return undefined;
}

/**
 * 已经关掉（收回 / 被下一次出价顶掉）的出价里还排着队的画布同意：绑上了画布 Run、还没落定。宿主当场把它们收回（不花钱）——
 * 出价从哪条路关的都一样（`withdrawQueuedHandOvers` 挂在账本的变更订阅上，读的就是这一份）。`by` 是那一次出价关掉的原因。
 */
export function queuedHandOversOfClosedPresentations(
  plan: Pick<ProductionGenerationPlan, "presentations"> | undefined,
): ReadonlyArray<Readonly<{ canvasRunId: string; by: GenerationPresentationCloser }>> {
  return (plan?.presentations ?? []).flatMap((presentation) => presentation.closed
    ? (presentation.handOvers ?? []).flatMap((entry) => !entry.settled && entry.canvasRunId ? [{ canvasRunId: entry.canvasRunId, by: presentation.closed!.by }] : [])
    : []);
}

/**
 * 画布在这一次出价开着的时候自己接手了这一镜（用户在节点上点了生成），不是卡交出去的那一笔。
 * 旧数据的认领没记从哪来、哪一次出价：照旧算（升级前的行为）。新的认领只算它自己那一次出价——下一次出价不被上一次挡住。
 */
function canvasTookIt(claim: ProductionShotClaim | undefined, presentation: GenerationPresentation, handOver: GenerationHandOver | undefined): boolean {
  if (claim?.by !== "canvas") return false;
  if (claim.via === undefined) return true;
  if (claim.presentationId !== presentation.presentationId || claim.via === "handover") return false;
  return !handOver || claim.canvasRunId !== handOver.canvasRunId;
}

/**
 * 这一次出价里一镜的样子——卡、回执、画布小标、认领判定都只读它（D2 第③步）：
 *   · `undecided`：还在等人决定（卡上点「生成」交出去 / 「不生成 ×」去掉 / 节点上点生成，都还没发生）；
 *   · `removed`：用户点了「不生成 ×」（再点一次恢复）；
 *   · `taken_by_canvas`：用户在节点上自己点了生成；
 *   · `handing_over`：卡 / 策略已经决定交给画布，还没交到供应商手里（排队 / 正在交）——画布不许再说「等你确认」；
 *   · `sent`：交到了（供应商受理 / 同步出图已出完）；
 *   · `unknown`：交的那一下没有结论——可能已经扣了钱；
 *   · `not_sent`：确定没发出去（没花钱），卡上「再试一次」或「去改镜 N」；
 *   · `approved`：制作流程的付费门批过（外部宿主 / 升级前的旧卡）。
 * 交出去、还没轮到就被「取消」收回的（`withdrawn`）回到 `undecided`：什么都没发生，它还在这一次出价里。
 */
export type OfferShotState = "undecided" | "removed" | "taken_by_canvas" | "handing_over" | "sent" | "unknown" | "not_sent" | "approved";

export type OfferShot = Readonly<{ shotId: string; state: OfferShotState; handOver?: GenerationHandOver }>;

/** 这一镜的节点被用户从画布上删掉了（显式的节点删除事件写成 `canvasDetached`）：卡上「已删除」，算作不生成。 */
function shotDetached(plan: PlanView, shotId: string): boolean {
  if (plan.shots?.length) return shotOf(plan, shotId)?.canvasDetached === true;
  return shotId === plan.candidate.candidateId && plan.canvasDetached === true;
}

function offerShotOf(run: Pick<ProductionRun, "gates">, plan: PlanView, presentation: GenerationPresentation, removed: ReadonlySet<string>, shotId: string): OfferShot {
  if (removed.has(shotId)) return { shotId, state: "removed" };
  const handOver = latestHandOver(presentation, shotId);
  if (handOver && !handOver.settled) return { shotId, state: "handing_over", handOver };
  // 节点删了、这一笔又没在交：这一镜不生成（交出去之后才删的照常交完，结局照画布那一侧写回的说）。
  if (shotDetached(plan, shotId) && !handOver) return { shotId, state: "removed" };
  if (canvasTookIt(claimOf(plan, shotId), presentation, handOver)) return { shotId, state: "taken_by_canvas" };
  switch (handOver?.settled?.outcome) {
    case "accepted": return { shotId, state: "sent", handOver };
    case "unknown": return { shotId, state: "unknown", handOver };
    case "not_sent": return { shotId, state: "not_sent", handOver };
    case "withdrawn": case undefined: break;
  }
  if (approvedIn(run, shotId, presentation)) return { shotId, state: "approved" };
  return { shotId, state: "undecided" };
}

function offerShotsIn(run: Pick<ProductionRun, "gates">, plan: PlanView, presentation: GenerationPresentation): OfferShot[] {
  const removed = new Set(removedIn(plan, presentation));
  return presentation.shotIds.map((shotId) => offerShotOf(run, plan, presentation, removed, shotId));
}

/** 这一次出价（开着或已关）里每一镜的样子，按出价顺序。没有出价 → 空。 */
export function offerShots(run: Pick<ProductionRun, "gates" | "generationPlan">): readonly OfferShot[] {
  const plan = run.generationPlan;
  const presentation = currentPresentation(plan);
  return plan && presentation ? offerShotsIn(run, plan, presentation) : [];
}

function openOfferShots(run: Pick<ProductionRun, "gates" | "generationPlan">, state: OfferShotState): string[] {
  const plan = run.generationPlan;
  const presentation = currentPresentation(plan);
  if (!plan || !presentation || presentation.closed) return [];
  return offerShotsIn(run, plan, presentation).filter((shot) => shot.state === state).map((shot) => shot.shotId);
}

/**
 * 这一次出价里**还没决定**的镜（按计划顺序）。卡上主按钮数的就是它们。
 * 没有开着的出价 → 空。一镜正在点（门在等）也算没决定：点失败了它还得在卡上等人。
 */
export function undecidedShotIds(run: Pick<ProductionRun, "gates" | "generationPlan">): string[] {
  return openOfferShots(run, "undecided");
}

/** 这一次出价（开着）里正在交给画布、还没交到供应商手里的镜。画布占位据此说「排队中」，不说「等你确认」。 */
export function handingOverShotIds(run: Pick<ProductionRun, "gates" | "generationPlan">): string[] {
  return openOfferShots(run, "handing_over");
}

/**
 * 不点名地再出价时，计划里还算数的镜：勾在这一批里、也没被用户去掉过的（Q9：旧版本静默移出的 `included: false`
 * 不自动复活；用户点过「去掉这张」的也不自动回来——他要的话，Agent 点名就行）。
 */
export function standingShotIds(run: Pick<ProductionRun, "generationPlan">): string[] {
  const plan = run.generationPlan;
  if (!plan) return [];
  const removed = removedEver(plan);
  return planShotIds(plan).filter((shotId) => shotOf(plan, shotId)?.included !== false && !removed.has(shotId));
}

/**
 * 这一镜有没有被送去生成过（生成过 / 正在生成）。再出价时先问没送过的（Q5）。三种都算：制作流程的付费门批过；
 * 卡 / 策略交给了画布、没被确定地退回来（交到了、结果未知、还在交）；画布认领过（用户在节点上生成过）。
 */
export function shotEverSent(run: Pick<ProductionRun, "gates" | "generationPlan">, shotId: string): boolean {
  if (everAuthorized(run, shotId)) return true;
  const plan = run.generationPlan;
  if (!plan) return false;
  if (claimOf(plan, shotId)?.by === "canvas") return true;
  return (plan.presentations ?? []).some((presentation) => {
    const handOver = latestHandOver(presentation, shotId);
    const outcome = handOver?.settled?.outcome;
    return Boolean(handOver) && outcome !== "not_sent" && outcome !== "withdrawn";
  });
}

/**
 * 这次计划里有没有一镜**可能**已经到过供应商：制作流程自己的作业之外，交给画布的那几镜也算（交到了、结果未知、
 * 已经绑上画布 Run 还没落定）。还没绑上画布那一份同意的不算：画布那一侧连 Run 都还没有，一下都没交。
 * Agent 回执与失败话术据此判「没发出去、没花钱」还是「先去核对」——只看账本，不猜。
 */
export function handOverMayHaveReachedProvider(run: Pick<ProductionRun, "generationPlan">): boolean {
  return (run.generationPlan?.presentations ?? []).some((presentation) => (presentation.handOvers ?? []).some((entry) =>
    entry.settled ? entry.settled.outcome === "accepted" || entry.settled.outcome === "unknown" : entry.canvasRunId !== undefined));
}

/**
 * 这一次出价里每一镜都被去掉了（「不生成 ×」或节点删了）。Agent 面板的那张卡此时留着：主按钮置灰、还能恢复，要关卡点「取消」（3.4）。
 */
export function everyShotRemoved(shots: readonly OfferShot[]): boolean {
  return shots.length > 0 && shots.every((shot) => shot.state === "removed");
}

/**
 * 这一次出价是不是该自己关了：开着，而且每一镜都定了（去掉 / 画布接手 / 交到了 / 制作批过）。没发出去、结果未知的留在卡上等人。
 * Agent 面板的出价（`origin.host === "nomi"`）全部去掉时也留着（卡上还能恢复）；画布批量卡那一份同意去掉了就是收回，照旧自己关。
 */
export function presentationResolved(run: Pick<ProductionRun, "gates" | "generationPlan" | "origin">): boolean {
  const plan = run.generationPlan;
  const presentation = currentPresentation(plan);
  if (!plan || !presentation || presentation.closed) return false;
  const shots = offerShotsIn(run, plan, presentation);
  if (run.origin.host === IN_APP_AGENT_ORIGIN_HOST && everyShotRemoved(shots)) return false;
  return shots.every((shot) => shot.state === "removed" || shot.state === "taken_by_canvas"
    || shot.state === "sent" || shot.state === "approved");
}

/** 自己关的时候记哪个原因：这一次出价里有镜是卡 / 策略交给画布的 → 「已交给画布」；否则「都决定了」。 */
export function resolvedCloser(presentation: GenerationPresentation | undefined): GenerationPresentationCloser {
  return presentation?.handOvers?.length ? "handed_to_canvas" : "resolved";
}

/** 这一次出价里还有没落定的交接（交给画布、派发还没结论）。回合读结局前先等它们落定。 */
export function presentationSettling(run: Pick<ProductionRun, "generationPlan">): boolean {
  return Boolean(currentPresentation(run.generationPlan)?.handOvers?.some((entry) => !entry.settled));
}

/**
 * 这一次出价的结局——**Agent 的回执只读它**（宿主给一个值，回执只渲染；以后原样成为工具调用的输出）。
 * `undecided` 的原因就是卡关掉的原因（× / 用户打了字 / 被停）；卡还开着时原因是 `open`。
 * 交给画布的镜：交到了 / 结果未知 / 还在交 → 在生成（钱可能在花，不说没花）；确定没发出去 → 没发出去（没花钱）。
 */
export type GeneratePresentationOutcome = Readonly<{
  closedBy: GenerationPresentationCloser | "open";
  /** 已经交给生成的镜（卡上点了生成 / 策略决定，交到了供应商手里或结果未知）。 */
  generating: readonly string[];
  /** 决定生成了，但在被供应商受理之前就失败了（账本证明没写出去 / 当场被拒：没花钱）。 */
  failedBeforeSending: readonly string[];
  removed: readonly string[];
  takenByCanvas: readonly string[];
  undecided: readonly Readonly<{ shotId: string; reason: GenerationPresentationCloser | "open" }>[];
}>;

export function generationPresentationOutcome(run: Pick<ProductionRun, "gates" | "generationPlan" | "jobs">): GeneratePresentationOutcome | undefined {
  const plan = run.generationPlan;
  const presentation = currentPresentation(plan);
  if (!plan || !presentation) return undefined;
  const closedBy: GenerationPresentationCloser | "open" = presentation.closed?.by ?? "open";
  const shots = offerShotsIn(run, plan, presentation);
  const of = (...states: OfferShotState[]) => shots.filter((shot) => states.includes(shot.state)).map((shot) => shot.shotId);
  const approved = of("approved");
  const approvedFailed = approved.filter((shotId) => failedBeforeSendingIn(run, shotId, presentation));
  return Object.freeze({
    closedBy,
    generating: [...approved.filter((shotId) => !approvedFailed.includes(shotId)), ...of("sent", "unknown", "handing_over")],
    failedBeforeSending: [...approvedFailed, ...of("not_sent")],
    removed: of("removed"),
    takenByCanvas: of("taken_by_canvas"),
    undecided: of("undecided").map((shotId) => ({ shotId, reason: closedBy })),
  });
}

/**
 * 这一镜在这一次出价里批出来的每一次尝试，都结束在被受理之前——没写出去，或供应商当场明确拒绝（`productionShotJobs.jobEndedBeforeAcceptance`）。
 * 「这一次出价里批出来的」= job 记的授权摘要属于这一次出价开出来之后建的门（和 `approvedIn` 同一条边界，不比时间戳）。
 */
function failedBeforeSendingIn(run: Pick<ProductionRun, "gates" | "generationPlan" | "jobs">, shotId: string, presentation: GenerationPresentation): boolean {
  const digests = new Set(spendAuthorizationGates(run).slice(presentation.fromGate).map((gate) => gate.authorizationDigest));
  const jobs = jobsForShot(run, shotId).filter((job) => job.authorizationDigest !== undefined && digests.has(job.authorizationDigest));
  return jobs.length > 0 && jobs.every(jobEndedBeforeAcceptance);
}

/**
 * 旧 Run → 现在的形状（读盘归一，唯一一处）。上一版用 `cardHidden` 说「卡在不在」：
 *   · `cardHidden: true` → 没有开着的出价；
 *   · 草稿没有 `cardHidden` → 卡是开着的（旧默认「缺省 = 卡可见」），出价摆的是勾进这一批的那几镜；
 *   · 已封印、门还在等 → 同上，卡开着（那道门还在等人）。
 * 已经是新形状（有 `presentations`）就原样返回。
 */
export function normalizeLegacyPresentation<T extends Pick<ProductionRun, "gates" | "generationPlan">>(run: T): T {
  const plan = run.generationPlan as (ProductionGenerationPlan & { cardHidden?: boolean }) | undefined;
  if (!plan) return run;
  if (plan.presentations) {
    if (plan.presentations.every((presentation) => presentation.presentationId
      && presentation.presentationEpoch !== undefined
      && presentation.policySnapshot
      && (presentation.policySnapshot.mode !== "direct" || presentation.policyDecisionDeadlineAt))) return run;
    const presentations = plan.presentations.map((presentation, index) => ({
      ...presentation,
      presentationId: presentation.presentationId ?? `${plan.operationId}:presentation:${index + 1}`,
      presentationEpoch: presentation.presentationEpoch ?? index + 1,
      policySnapshot: presentation.policySnapshot ?? DEFAULT_PROJECT_AGENT_APPROVAL_POLICY,
      ...(presentation.policySnapshot?.mode === "direct" && !presentation.policyDecisionDeadlineAt
        ? (() => {
            const deadline = projectPolicyDecisionDeadlineAt(presentation.openedAt);
            return deadline ? { policyDecisionDeadlineAt: deadline } : {};
          })()
        : {}),
    }));
    return { ...run, generationPlan: { ...plan, presentations } as ProductionGenerationPlan };
  }
  if (!("cardHidden" in plan || plan.state === "draft" || plan.state === "sealed")) return run;
  const { cardHidden, ...rest } = plan;
  const gates = spendAuthorizationGates(run);
  const firstWaiting = gates.findIndex((gate) => gate.status === "waiting");
  const open = cardHidden !== true && (plan.state === "draft" || (plan.state === "sealed" && firstWaiting >= 0));
  const shotIds = plan.shots?.length
    ? plan.shots.filter((shot) => shot.included !== false).map((shot) => shot.shotId)
    : [plan.candidate.candidateId];
  return {
    ...run,
    // 门在等的那一份属于这一次出价（它就是卡上那一下还没点完的点击）。
    generationPlan: { ...rest, ...(open ? { presentations: [{
      presentationId: `${plan.operationId}:presentation:1`,
      presentationEpoch: 1,
      policySnapshot: DEFAULT_PROJECT_AGENT_APPROVAL_POLICY,
      shotIds, openedAt: plan.updatedAt, fromGate: firstWaiting >= 0 ? firstWaiting : gates.length,
    }] } : {}) } as ProductionGenerationPlan,
  };
}
