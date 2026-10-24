// 生成计划的**候选补丁**与**撤未点头的授权**（`generation.patch` / `generation.trial_narrow` 等命令共用的那一段写法）。
//
// 为什么单独一层：这几条命令改的是同一份候选、撤的是同一道门，差别只在「进来之前允不允许它还封着」
// 和「改了什么」。各写各的代价不是重复，而是**几份会漂**——少 clone 一次 parameters，
// 就会出现「改了时长、封的还是旧值」这种只在钱上看得见的错。
// （D2 第③步删了付费卡上改参数那一条 `generation.revise`：卡上没有参数了，一镜要发什么只住在画布节点上。）
//
// 抽出来的第二个理由是体积：reducer 是这个域的调度中心，每条命令都往里挤会把它撑成一个谁都不敢改的
// 巨壳（R9/R12）。命令的**判据**留在 reducer（那是它的活），命令的**手法**住这里。
import type {
  ProductionGate,
  ProductionGenerationPlan,
  ProductionGenerationShot,
  ProductionJob,
  ProductionRun,
  RunCommand,
} from "./productionRunTypes";
import { spendAuthorizationGates, waitingAuthorizationGates } from "../shared/productionSpendAuthority";
import type { ProductionCommandEffect } from "./productionRunReducer";

/** Update one shot inside a plan by id; throws if the plan has no such shot. */
export function replaceShot(
  plan: ProductionGenerationPlan,
  shotId: string,
  update: (shot: ProductionGenerationShot) => ProductionGenerationShot,
): ProductionGenerationShot[] {
  const shots = plan.shots ?? [];
  let found = false;
  const next = shots.map((shot) => {
    if (shot.shotId !== shotId) return shot;
    found = true;
    return update(shot);
  });
  if (!found) throw new Error(`Generation shot not found: ${shotId}`);
  return next;
}

function record(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = payload[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${key}`);
  return value as Record<string, unknown>;
}

/**
 * 撤掉一份**还没被人点头**的付费授权，把计划退回可编辑的 draft。
 *
 * `generation.trial_narrow`（试拍首镜）改的是「供应商真正会收到的那份载荷」，因此必须走这条路：撤授权 → 回 draft →
 * 重新 prepare/seal/gate 生成**新的** digest。收卡、交给画布、去掉一镜撤的是同一份在等的授权，也走这里。
 *
 * 不变量：**收据 = 实际执行**。旧 digest 上的 job 一律丢弃，旧 gate 置 `revoked`；
 * 任何一个 job 越过 `authorization_required` 就说明这份授权已经开始执行，此时改载荷
 * 会让「用户点头的那张单」和「真正跑的那一次」分叉，所以直接拒绝。
 */
export function revokeWaitingGenerationAuthorization(
  current: ProductionRun,
  _plan: ProductionGenerationPlan,
  now: string,
  what: string,
  /** 只撤盖着这一镜的那几份（去掉 / 改这一镜时，别的镜正在点的那一下不许被一起撤掉）。缺省 = 全部在等的。 */
  onlyShotId?: string,
): Readonly<{ gates: ProductionGate[]; jobs: ProductionJob[]; planVersion: number }> {
  // 撤的是**还在等人决定**的那几份授权（每份住在自己那道门上）；已经批过的那几份与它们的 job 一个不动。
  const waiting = waitingAuthorizationGates(current)
    .filter((gate) => onlyShotId === undefined || gate.authorizationEnvelope.jobs.some((job) => job.shotId === onlyShotId));
  if (waiting.length === 0) {
    throw new Error(`${what} is available only before the spend gate is decided`);
  }
  const revokedDigests = new Set(waiting.map((gate) => gate.authorizationDigest));
  const abandonedJobs = current.jobs.filter((job) => job.authorizationDigest !== undefined && revokedDigests.has(job.authorizationDigest));
  if (abandonedJobs.some((job) => job.status !== "authorization_required")) {
    throw new Error(`${what} cannot replace an authorization that has begun execution`);
  }
  const revokedGateIds = new Set(waiting.map((gate) => gate.gateId));
  return {
    gates: current.gates.map((gate) => revokedGateIds.has(gate.gateId)
      ? { ...gate, status: "revoked" as const, decidedAt: now }
      : gate),
    jobs: current.jobs.filter((job) => job.authorizationDigest === undefined || !revokedDigests.has(job.authorizationDigest)),
    planVersion: current.planVersion + 1,
  };
}

/** 计划上所有「封印/授权」字段的清零点。加字段时只有这一处要跟着改。 */
export function unsealedGenerationPlanFields(plan: ProductionGenerationPlan, now: string): ProductionGenerationPlan {
  return {
    ...plan,
    state: "draft",
    candidate: { ...plan.candidate, sealedContractHash: undefined },
    ...(plan.shots ? { shots: plan.shots.map((shot) => ({ ...shot, contract: undefined,
      candidate: { ...shot.candidate, sealedContractHash: undefined }, approvedReceiptId: undefined,
      approvedAt: undefined, approvedAttempt: undefined })) } : {}),
    contract: undefined,
    costCertainty: undefined,
    updatedAt: now,
  };
}

export function applyGenerationCandidatePatch(
  plan: ProductionGenerationPlan,
  command: RunCommand,
  now: string,
): ProductionGenerationPlan {
  const patch = record(command.payload, "patch") as Partial<ProductionGenerationShot["candidate"]>;
  const rawShotId = typeof command.payload.shotId === "string" ? command.payload.shotId.trim() : "";
  const shotId = rawShotId || undefined;
  if (shotId) {
    const hasIncluded = typeof command.payload.included === "boolean";
    const shots = replaceShot(plan, shotId, (shot) => ({
      ...shot,
      candidate: {
        ...shot.candidate,
        ...patch,
        revision: shot.candidate.revision + 1,
        parameters: patch.parameters ? structuredClone(patch.parameters) : structuredClone(shot.candidate.parameters),
        references: patch.references ? structuredClone(patch.references) : structuredClone(shot.candidate.references),
      },
      ...(hasIncluded ? { included: command.payload.included as boolean } : {}),
      updatedAt: now,
    }));
    return { ...plan, shots, updatedAt: now };
  }
  const candidate = {
    ...plan.candidate,
    ...patch,
    revision: plan.candidate.revision + 1,
    parameters: patch.parameters ? structuredClone(patch.parameters) : structuredClone(plan.candidate.parameters),
    references: patch.references ? structuredClone(patch.references) : structuredClone(plan.candidate.references),
  };
  return { ...plan, candidate, updatedAt: now };
}


/**
 * 「这个 Run 还有没有没结清的负债」——重开一次付费请求之前唯一要回答的问题。
 *
 * 三个子句分别管三件事，原来挤在一个表达式里，覆盖面互相重叠（`cancelled_remote` 在第三句里被放行，
 * 又会被第一句在 reserved > 0 时拦住），读代码判断不出「哪些状态允许重开」：
 *
 *  ① **预留还挂着，而且有作业还没落定**。一次 ready/adopted 的产出证明执行结束了，**不证明账结清了**，
 *     它的预留要继续当累计负债；但只要还有作业没落定，这笔预留就既不能释放也不能重算。
 *  ② **账本自己记着未结清**（供应商已经收了钱、我们还没对上）。
 *  ③ **还有作业停在既不成功也不是「供应商已明确失败」的状态**。`cancelled_remote` 和
 *     `needs_attention + provider_task_failed` 是两种**已经有结论**的收尾，它们不挡重开。
 */
export function hasUnsettledLiability(run: ProductionRun): boolean {
  const unresolvedReservation = run.budget.reserved > 0 && run.jobs.some(job => !["ready", "adopted"].includes(job.status));
  return unresolvedReservation || run.budget.unsettled > 0 || run.jobs.some((job) =>
    !["ready", "adopted", "cancelled_remote"].includes(job.status)
    && !(job.status === "needs_attention" && job.errorCode === "provider_task_failed"));
}

/**
 * 撤掉还在等人决定的那几份授权（一次点击失败留下的、或上一版整份封印留下的），并让只被它们封过的镜回到
 * 可编辑的草稿样子。已经批过的授权与它们的镜一个不动。没有在等的门 = 原样返回。
 */
export function revokeWaitingAndUnseal(current: ProductionRun, now: string, what: string, onlyShotId?: string): ProductionRun {
  const plan = current.generationPlan;
  const waiting = waitingAuthorizationGates(current)
    .filter((gate) => onlyShotId === undefined || gate.authorizationEnvelope.jobs.some((job) => job.shotId === onlyShotId));
  if (!plan || waiting.length === 0) return current;
  const waitingShots = new Set(waiting.flatMap((gate) => gate.authorizationEnvelope.jobs.map((job) => job.shotId)));
  const revoked = revokeWaitingGenerationAuthorization(current, plan, now, what, onlyShotId);
  const next: ProductionRun = { ...current, ...revoked };
  const approvedShots = new Set(spendAuthorizationGates(next).filter((gate) => gate.status === "approved")
    .flatMap((gate) => gate.authorizationEnvelope.jobs.map((job) => job.shotId)));
  // 一份批过的授权、一道在等的门都不剩 = 计划回到草稿：顶层合同、计价那几格一起清（`unsealedGenerationPlanFields` 是清零的唯一一处）。
  if (approvedShots.size === 0 && waitingAuthorizationGates(next).length === 0) {
    return { ...next, generationPlan: unsealedGenerationPlanFields(plan, now), updatedAt: now };
  }
  const unseal = (shotId: string) => waitingShots.has(shotId) && !approvedShots.has(shotId);
  const generationPlan: ProductionGenerationPlan = {
    ...plan,
    // 「sealed」只表示「第一份授权正在等人决定」；撤掉之后还有批过的，就是在跑（还有别的门在等就仍是 sealed）。
    ...(plan.state === "sealed" && approvedShots.size > 0 ? { state: "submitted" as const } : {}),
    ...(plan.shots
      ? { shots: plan.shots.map((shot) => unseal(shot.shotId)
          ? { ...shot, contract: undefined, candidate: { ...shot.candidate, sealedContractHash: undefined },
              approvedReceiptId: undefined, approvedAt: undefined, approvedAttempt: undefined, updatedAt: now }
          : shot) }
      : {}),
    updatedAt: now,
  };
  return { ...next, generationPlan, updatedAt: now };
}
