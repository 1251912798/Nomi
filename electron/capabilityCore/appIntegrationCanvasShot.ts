/**
 * 画布付费生成的唯一口子：「画布生成这一镜」（发动机收敛第一刀 第 1–4 步）。
 *
 * 批准、派发、记账只走制作流程那一个口子，一个画布节点的一次生成 = 一个单镜 Run（F1）：
 *   · 单节点 ↑（变体、原地重生成、重试、分镜行操作同一条）：交的那一刻建 Run，这一下点击就是批准（主进程手势收据，不弹卡）；
 *   · Agent 面板付费卡上点了「生成」、「直接生成」档的策略（D2 第③步：一台发动机）：那几镜交给画布，走的就是下面这条
 *     批量路——每一镜一个单镜 Run，同意建好时绑到制作 Run 那一次出价的交接上（`origin.handOverOf`），派发落定写回那一笔
 *     （交到了 / 结果未知 / 没发出去 / 被收回）；批的人按交接上记的决定者（手势 | 策略）；
 *   · 批量卡（「生成全部」、分镜整批、框选生成）：卡上点了确认那一刻，卡上列出的每一镜各建一个单镜 Run，出价开着 =
 *     用户已经同意这一镜（这一张卡就是这一份授权）。轮到它时再冻住那一刻的请求、批、交；卡上去掉的、整批点了 × 的、
 *     窗口没了的，出价收回，再也交不出去（主进程拦，不只是渲染层不交）。每一镜的结局读它自己 Run 的
 *     `generationPresentationOutcome`。为什么一镜一个 Run 而不是一批一个多镜 Run：提交出口按 Run 加锁、交的那一下
 *     （同步出图要等到出完）在锁里，一批放进一个 Run 就会一镜一镜地排队交——今天并行 6 个的「生成全部」会变成串行。
 *
 * 交出去之后：提交出口（意向日志 → 交 → 受理 / 结果未知 / 明确拒绝）→ 画布那台的传输（`canvasTransportProvider`）。
 * 等结果仍由渲染层驱动，但每一次「查」都经 Run 的 poll / materialize（F2）；渲染层不在了（关窗、崩溃、重启、点了停）
 * 由主进程观察者接手。
 *
 * 准入（批之前，什么都没写）：同节点在途（进程内 + 盘上的「没收尾」标记）、3D-BOX 预演闸、绑定了制作镜头的节点先经唯一判定口
 * 认领那一镜（`decideShotClaim` → reducer `shot.claim`，两个 Run 争同一镜只剩这一处写）。
 *
 * 设计卡：docs/plan/2026-10-05-engine-convergence-cut1-step12-design-card.md、docs/plan/2026-10-05-engine-convergence-cut1-step34-design-card.md。
 */
import type { DirectorPreviewSpendBlockReason } from "../shared/director/directorPreviewStatus";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { logWarn } from "../logging/logger";
import type { ApprovalReceiptAuthority, MainProcessDecision } from "./approvalReceipt";
import { canvasProviderId, canvasSubmitReceipt, canvasLastResult, type CanvasTaskResult } from "./canvasTransportProvider";
import { ContractCompilationError, freezeCanvasExecutionContract, type PlanCandidate } from "./executionContract";
import type { GenerationProvider, GenerationProviderOutput } from "./generationRuntimeAdapter";
import { mainProcessGateApproval } from "./runOwnedGenerationGateAuthority";
import { localAssetUrl } from "../assets/assetPaths";
import { canvasRunIdFor, markCanvasRunOpen, markCanvasRunSettled, openCanvasRuns } from "../productionRun/canvasShotRunIndex";
import { prepareProductionGenerationAuthorization, type GenerationAuthorizationProjectIdentity } from "../productionRun/prepareProductionGenerationAuthorization";
import type { ProductionGenerationSubmission } from "../productionRun/productionGenerationSubmission";
import type { ProductionRunService } from "../productionRun/productionRunService";
import type {
  AutomationPolicy, GenerationHandOverFailure, GenerationHandOverSettlement, ProductionArtifact, ProductionJob, ProductionRun, RunCommand,
} from "../productionRun/productionRunTypes";
import { markSingleShotAttention, markSingleShotCompleted } from "../productionRun/singleShotRunLifecycle";
import type { ShotPrice } from "../shared/contracts/shotPricingRule";
import { decideShotClaim } from "../shared/decideShotClaim";
import { admitShotsForDispatch } from "../productionRun/shotLandingAdmission";
import {
  currentPresentation, handOverOfCanvasRun, IN_APP_AGENT_POLICY_SURFACE, latestHandOver, presentationIsOpen, queuedHandOversOfClosedPresentations, undecidedShotIds,
} from "../shared/productionGenerationPresentation";
import { canvasShotClaimCommandId } from "../shared/productionRunCommandId";
import { productionJobPhase } from "../shared/productionShotPhase";
import { currentShotAttempt, jobEndedBeforeAcceptance } from "../shared/productionShotJobs";
import { isTerminalTaskStatus } from "../shared/taskStatus";
import type { WorkspaceProjectRecordV2 } from "../workspace/workspaceTypes";

export type CanvasShotGesture = { webContentsId: number; frameId: number; origin: string };

/**
 * 收回一份还没交的同意时，交给画布的那一镜怎么落定：
 *   · `withdrawn` = 人（或问话的那个回合）收回了：任务列表里去掉 / 整批 × / 付费卡「取消」/ 回合被停 / 用户打了字——没花钱，
 *     出价开着时它回到卡上（去掉的记成「不生成」）；
 *   · `not_sent` = 没人会再交它了：窗口没了、派发失败、重启后的孤儿——没花钱，卡上「再试一次」，`failure` 说为什么。
 */
type ConsentEnd =
  | Readonly<{ outcome: "withdrawn"; by: "removed" | "user_closed" | "user_wrote" | "stopped" }>
  | Readonly<{ outcome: "not_sent"; failure?: GenerationHandOverFailure }>;

export type CanvasShotRequest = { kind: string; prompt: string; extras?: Record<string, unknown>; [key: string]: unknown };

export type CanvasShotSubmitInput = {
  projectId: string;
  nodeId: string;
  /** 渲染层这一次运行记录号（同一次意图的重试复用它；批量卡上的每一镜在点确认时就定了号）。 */
  runRecordId: string;
  vendor: string;
  request: CanvasShotRequest;
  gesture: CanvasShotGesture;
  senderId: number;
};

/** 交给画布的那一镜来自哪个制作 Run 的哪一镜（Agent 那一次出价：卡上点了「生成」/「直接生成」档的策略）。 */
export type CanvasHandOverLink = { runId: string; shotId: string };

/**
 * 批量卡上列出的一镜：渲染层在点确认时报的身份（模型 / 任务种类只用来开出价，交的时候以冻住的那一份请求为准）。
 * `production`：这一镜是 Agent 那一次出价交给画布的那一镜——主进程把这个画布 Run 绑到那一笔交接上（交接本身只有主进程写得出，
 * 渲染层只能绑一笔已经存在、还没绑的交接，节点还得是那一镜落下的那个）。
 */
export type CanvasConsentShot = { nodeId: string; runRecordId: string; vendor: string; modelKey: string; kind: string; production?: CanvasHandOverLink };

export type CanvasShotDeps = {
  service: Pick<ProductionRunService, "createGenerationDraft" | "readFull" | "repository">;
  readProject: (projectId: string) => WorkspaceProjectRecordV2 | null;
  resolveProjectRoot: (projectId: string) => string | null;
  receipts: ApprovalReceiptAuthority;
  /** 提交出口认得的全部执行器（目录执行器 + 画布传输）。 */
  providers: () => readonly GenerationProvider[];
  buildSubmission: (input: { projectRoot: string; immutableProjectUuid: string; projectGeneration: number; providers: readonly GenerationProvider[] }) => ProductionGenerationSubmission;
  /** 3D-BOX 预演闸（判据住渲染层 directorPreviewState，这里是唯一问它的地方）。 */
  previewBlock: (projectId: string, nodeId: string) => Promise<DirectorPreviewSpendBlockReason | "unrecognized" | null>;
  quote: (input: { vendorKey: string; modelKey: string; parameters: Record<string, unknown> }) => ShotPrice;
  /** 交给主进程观察者（渲染层不在时）。 */
  observe: (submission: ProductionGenerationSubmission, projectId: string, runId: string) => void;
  now?: () => string;
};

const LEASE_MS = 2 * 60 * 1000;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function coded(message: string, code: string, reason: string): Error {
  return Object.assign(new Error(message), { code, reason });
}

/** 这个画布单镜 Run 是替哪个制作 Run 的哪一镜交的（建同意时记在来历里）。 */
function handOverLinkOf(run: ProductionRun | null | undefined): CanvasHandOverLink | undefined {
  const link = run?.origin.handOverOf;
  return link && text(link.runId) && text(link.shotId) ? { runId: text(link.runId), shotId: text(link.shotId) } : undefined;
}

/** 节点绑着的制作镜头（Agent 起草落到画布上的那一镜）：请求里带着它。 */
function boundShotOf(extras: Record<string, unknown> | undefined): CanvasHandOverLink | undefined {
  const runId = text(extras?.productionRunId);
  const shotId = text(extras?.productionShotId);
  return runId && shotId ? { runId, shotId } : undefined;
}

const NOMI_CODE = /^[a-z][a-z0-9_]{2,63}$/;

/**
 * 交出去的那一镜为什么没发出去（Nomi 自己的语义码，不是供应商原话）：参数 / 提示词 / 参考被拒的去节点里改（供应商当场明确拒绝、
 * 合同编译口拒了某个参数、3D-BOX 预演没就绪），别的可以再试一次。
 */
function handOverFailureOf(error: unknown, job?: ProductionJob): GenerationHandOverFailure {
  if (job?.errorCode === "provider_rejected") return { kind: "parameter_rejected", code: "provider_rejected" };
  if (error instanceof ContractCompilationError && error.rejection) {
    return { kind: "parameter_rejected", code: NOMI_CODE.test(error.rejection.code) ? error.rejection.code : "parameter_rejected" };
  }
  const raw = error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : job?.errorCode;
  // 同节点还有一笔没收尾（认领 / 节点准入拒）：卡上要说的是那个节点在忙还是要先核对，不是一句泛泛的「被占了」。
  const reason = error && typeof error === "object" ? (error as { reason?: unknown }).reason : undefined;
  if (raw === "production_shot_claimed" && reason === "needs_reconcile") return { kind: "not_sent", code: "node_needs_reconcile" };
  if (raw === "production_shot_claimed" && reason === "in_flight") return { kind: "not_sent", code: "node_generation_in_flight" };
  const code = raw && NOMI_CODE.test(raw) ? raw : "not_sent";
  return { kind: code === "director_preview_blocked" ? "parameter_rejected" : "not_sent", code };
}

/** 同节点还有一笔没收尾：在路上的说「还在生成」，可能已扣钱、结果不明的说「先去核对」。 */
function blockingReason(run: ProductionRun | null): "in_flight" | "needs_reconcile" | null {
  if (!run) return null;
  for (const job of run.jobs) {
    if (job.status === "submission_unknown" || job.status === "reconciling") return "needs_reconcile";
    if (job.status === "submit_intent_persisted" || productionJobPhase(job.status) === "generating") return "in_flight";
  }
  return null;
}

/** 批量卡上同意了、还没轮到交的那一镜：草稿、出价开着、这一镜还没决定、一笔作业都没有。 */
function consentedDraft(run: ProductionRun | null): run is ProductionRun {
  const plan = run?.generationPlan;
  return Boolean(run && plan && plan.state === "draft" && run.jobs.length === 0 && presentationIsOpen(plan)
    && undecidedShotIds(run).includes(plan.candidate.candidateId));
}

/** 出价收回了（卡上去掉 / 整批 × / 窗口没了）、一笔都没交过：这一镜不生成。 */
function withdrawnDraft(run: ProductionRun | null): boolean {
  const plan = run?.generationPlan;
  return Boolean(run && plan && run.jobs.length === 0 && (plan.presentations?.length ?? 0) > 0 && !presentationIsOpen(plan));
}

function latestJob(run: ProductionRun): ProductionJob | undefined {
  return [...run.jobs].sort((left, right) => right.attempt - left.attempt)[0];
}

function readyArtifact(run: ProductionRun, job: ProductionJob): ProductionArtifact | undefined {
  return run.artifacts.find((artifact) => artifact.jobId === job.jobId && ["ready", "adopted"].includes(artifact.status));
}

/** 从 Run 账本复原「出片了」那一份结果（重开项目、观察者已经收完时用；与画布那台落地的是同一个本地文件）。 */
function resultFromArtifact(run: ProductionRun, job: ProductionJob, artifact: ProductionArtifact, kind: string): CanvasTaskResult {
  const assetType = artifact.kind === "video" || artifact.kind === "audio" || artifact.kind === "model3d" ? artifact.kind : "image";
  return {
    id: job.providerTaskId ?? job.jobId,
    kind,
    status: "succeeded",
    assets: [{
      type: assetType,
      url: localAssetUrl(run.projectId, artifact.projectRelativePath ?? ""),
      ...(artifact.width && artifact.height ? { width: artifact.width, height: artifact.height } : {}),
    }],
    raw: {},
  };
}

function failedResult(job: ProductionJob, kind: string): CanvasTaskResult {
  return { id: job.providerTaskId ?? job.jobId, kind, status: "failed", assets: [], raw: {}, error: job.errorMessage || job.errorCode || "generation failed" };
}

/**
 * 画布那台交回来的产物已经由它自己落进项目（`localizeTaskAsset`，nomi-local://）：这里只把那份文件记进 Run，
 * 不再下载一次。不是本地地址的交给通用物化（与目录执行器同一条）。
 */
export function canvasLocalArtifactReceipt(input: { projectId: string; projectRoot: string; providerTaskId: string; output: GenerationProviderOutput }): Pick<ProductionArtifact, "artifactId" | "kind" | "contentHash" | "projectRelativePath"> | null {
  const prefix = `nomi-local://asset/${encodeURIComponent(input.projectId)}/`;
  if (!input.output.url.startsWith(prefix)) return null;
  let relative: string;
  try {
    relative = input.output.url.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
  const root = path.resolve(input.projectRoot);
  const absolute = path.resolve(root, relative);
  if (!relative || !absolute.startsWith(`${root}${path.sep}`) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;
  relative = path.relative(root, absolute).split(path.sep).join("/");
  const contentHash = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
  return { artifactId: `canvas-artifact-${input.providerTaskId}`.slice(0, 160), kind: input.output.kind, contentHash, projectRelativePath: relative };
}

/** 一个画布节点这一次生成的候选：冻进合同的就是渲染层拼好的那一份请求（`parameters = { vendor, request }`）。 */
function canvasCandidate(runId: string, vendor: string, modelKey: string, request: CanvasShotRequest | null, kind: string, revision: number): PlanCandidate {
  return {
    candidateId: `${runId}-shot`, revision, moduleId: "generation.canvas", providerId: canvasProviderId(vendor), modelId: modelKey,
    mode: kind, prompt: request?.prompt ?? "", parameters: { vendor, request }, references: [],
  };
}

function canvasPolicy(providerId: string, modelKey: string): Partial<AutomationPolicy> {
  return { trustedHosts: ["canvas"], allowedProviders: [providerId], allowedModels: [modelKey], maxSpend: null, maxAttemptsPerJob: 1 };
}

export function createCanvasShotRuns(deps: CanvasShotDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  /** 同一个运行记录号的两次「交」同时到（还没写盘）：第二次等第一次，之后一律照 Run 账本回话。 */
  const submitting = new Map<string, Promise<CanvasTaskResult>>();
  const nodesInFlight = new Set<string>();
  /** 渲染层正在驱动的 Run：它在等，主进程就不另起观察；它走了（窗口没了 / 点了停 / 久不来）就交给观察者。 */
  const leases = new Map<string, { projectId: string; senderId: number; touchedAt: number }>();
  /** 批量卡上同意了、还没交的那几镜是哪个窗口点的：窗口没了，它们的出价跟着收回（不留给下一次启动去猜）。 */
  const consents = new Map<string, { projectId: string; senderId: number }>();

  const repository = () => deps.service.repository;

  function identity(projectId: string): { lease: GenerationAuthorizationProjectIdentity; record: WorkspaceProjectRecordV2; projectRoot: string } {
    const record = deps.readProject(projectId);
    const projectRoot = deps.resolveProjectRoot(projectId);
    if (!record?.immutableProjectUuid || !record.projectGeneration || !Number.isInteger(record.revision) || !projectRoot) {
      throw coded(`Project is unavailable: ${projectId}`, "project_unavailable", "project_unavailable");
    }
    return {
      lease: { projectId, immutableProjectUuid: record.immutableProjectUuid, projectGeneration: record.projectGeneration, revocationEpoch: 0 },
      record,
      projectRoot,
    };
  }

  function submissionFor(projectId: string): ProductionGenerationSubmission {
    const { lease, projectRoot } = identity(projectId);
    return deps.buildSubmission({ projectRoot, immutableProjectUuid: lease.immutableProjectUuid, projectGeneration: lease.projectGeneration, providers: deps.providers() });
  }

  /**
   * 同一节点：进程内有一笔正在交 → 拒；盘上有没收尾的 Run → 拒（收尾了的标记顺手删掉）。
   * 批量卡上同意了、还没轮到的那一镜不算在途（它什么都还没交）；`ownRunId` 是这一次自己要交的那个 Run。
   */
  function assertNodeIdle(projectId: string, projectRoot: string, nodeId: string, ownRunId: string): void {
    if (nodesInFlight.has(`${projectId}\u0000${nodeId}`)) throw coded(`node_generation_in_flight: ${nodeId}`, "node_generation_in_flight", "in_flight");
    for (const open of openCanvasRuns(projectRoot, nodeId)) {
      if (open.runId === ownRunId) continue;
      const run = repository().read(projectId, open.runId);
      if (consentedDraft(run)) continue;
      const reason = blockingReason(run);
      if (!reason) { markCanvasRunSettled(projectRoot, open.runId); continue; }
      if (reason === "needs_reconcile") throw coded(`production_shot_claimed: ${reason}`, "production_shot_claimed", reason);
      throw coded(`node_generation_in_flight: ${nodeId}`, "node_generation_in_flight", "in_flight");
    }
  }

  /** 对一个 Run 落一条命令：并发改动让 revision 过期就重读一次再判；第二次还冲突交给调用方。`build` 回 null = 读完发现不用写。 */
  function executeOn(projectId: string, runId: string, build: (current: ProductionRun) => Omit<RunCommand, "expectedRevision"> | null): void {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = repository().read(projectId, runId);
      const command = current ? build(current) : null;
      if (!current || !command) return;
      try {
        repository().execute(projectId, runId, { ...command, expectedRevision: current.revision });
        return;
      } catch (error) {
        if (attempt === 1 || !/revision conflict/i.test(error instanceof Error ? error.message : String(error))) throw error;
      }
    }
  }

  /**
   * 节点绑着一个制作镜头（Agent 起草落到画布上的）：画布要生成它，先经唯一判定口 `decideShotClaim` 把那一镜认领给画布，
   * 认领不到就拒（制作那边可能已经在交 / 结果未知 / 付费卡正把它交给另一个画布 Run）。只落 reducer 的 `shot.claim`；
   * 命令号带「第几次」与这个画布 Run（双扣路径 6；从哪来、哪一次出价由 reducer 按账本派生）。
   */
  function claimBoundProductionShot(projectId: string, bound: CanvasHandOverLink | undefined, canvasRunId: string): void {
    if (!projectId || !bound) return;
    executeOn(projectId, bound.runId, (current) => {
      const decision = decideShotClaim(current, bound.shotId, "canvas", { canvasRunId });
      if (!decision.granted) throw coded(`production_shot_claimed: ${decision.reason}`, "production_shot_claimed", decision.reason);
      // 只有判定口明确判给画布才落盘；镜头对不上 / 没有 Run 是普通画布节点，绝不写一条能锁住整个单镜 Run 的认领。
      if (decision.holder !== "canvas" || decision.reason === "canvas_claimed") return null;
      return {
        commandId: canvasShotClaimCommandId(bound.runId, bound.shotId, currentShotAttempt(current, bound.shotId), canvasRunId),
        type: "shot.claim",
        payload: { shotId: bound.shotId, by: "canvas", canvasRunId },
        issuedAt: now(),
      };
    });
  }

  /**
   * 交给画布的那几镜：画布那一份同意开好了，把画布单镜 Run 的号绑到制作 Run 那一次出价的交接上（一个制作 Run 一条命令）。
   * 之后只有绑着的这个画布 Run 认领得到那一镜。绑不上（出价在两步之间关了 / 节点不是那一镜落下的那个 / 没有那一笔交接）→ 抛，
   * 调用方收回刚开的同意，一镜都不交。
   */
  function recordHandOverBindings(projectId: string, shots: readonly CanvasConsentShot[], runIds: readonly string[]): void {
    const byRun = new Map<string, Array<{ shotId: string; canvasRunId: string; nodeId: string }>>();
    shots.forEach((shot, index) => {
      if (!shot.production) return;
      const productionRunId = text(shot.production.runId);
      byRun.set(productionRunId, [...(byRun.get(productionRunId) ?? []), { shotId: text(shot.production.shotId), canvasRunId: runIds[index], nodeId: shot.nodeId }]);
    });
    for (const [productionRunId, bindings] of byRun) {
      let found = false;
      executeOn(projectId, productionRunId, () => {
        found = true;
        return {
          commandId: `canvas-handover-bind:${crypto.createHash("sha256").update(JSON.stringify(bindings)).digest("hex").slice(0, 32)}`,
          type: "generation.handover.bind",
          payload: { bindings },
          issuedAt: now(),
        };
      });
      if (!found) throw coded(`canvas_handover_missing: ${productionRunId}`, "canvas_handover_missing", "handover_missing");
    }
  }

  /**
   * 交给画布的那一镜派发落定了：写回那一笔交接（交到了 / 结果未知 / 没发出去 / 被收回）。只写绑着这个画布 Run、还没落定的那一笔——
   * 不管它那一次出价此刻还是不是当前那一次（交到一半被收回 / 被下一次出价顶掉，结论照样写回它自己那一笔）。
   * 写不进去只记日志：画布这一侧的事实（这个 Run 自己的作业）已经落盘，交接停在「还在交」，回合读结局时照实说「在生成 / 要核对」。
   */
  function writeBackHandOver(projectId: string, link: CanvasHandOverLink | undefined, canvasRunId: string, settlement: Omit<GenerationHandOverSettlement, "at">): void {
    if (!link) return;
    try {
      executeOn(projectId, link.runId, (current) => {
        const handOver = handOverOfCanvasRun(current.generationPlan, canvasRunId)?.handOver;
        if (!handOver || handOver.shotId !== link.shotId || handOver.settled) return null;
        return {
          commandId: `canvas-handover-settle:${canvasRunId}`,
          type: "generation.handover.settle",
          payload: { shotId: link.shotId, canvasRunId, ...settlement },
          issuedAt: now(),
        };
      });
    } catch (error) {
      logWarn("production-run", "canvas-handover-settle-failed", { runId: canvasRunId }, error);
    }
  }

  /** 交出去之后、写回之前就失败了：按画布 Run 自己的作业说——一笔都没有 / 确定结束在受理之前就是没发出去，否则结果未知。 */
  function settleFromRun(projectId: string, link: CanvasHandOverLink | undefined, canvasRunId: string, error: unknown): void {
    if (!link) return;
    const run = repository().read(projectId, canvasRunId);
    const job = run ? latestJob(run) : undefined;
    writeBackHandOver(projectId, link, canvasRunId, !job || jobEndedBeforeAcceptance(job)
      ? { outcome: "not_sent", failure: handOverFailureOf(error, job) }
      : { outcome: "unknown" });
  }

  /**
   * 这一镜谁批的（D2 第③步：一台发动机，两种决定者）。交给画布的那一镜按交接上记的决定者：卡上点了「生成」是那一下手势；
   * 「直接生成」档是策略——主进程现读账本判，渲染层说了不算。策略那一笔交接只在出价按「直接生成」开、策略还没失败时记得下
   * （`handOverPresentedShots`），记下的那一刻就是策略的决定：同一批里另一镜后来没交到（出价随之标成「要人决定」），不收回
   * 已经做出的这几个决定——和卡上点过「生成」的一样，交出去的照常交完；人在卡上点「取消」才收回还没轮到的。
   * 其余（节点 ↑、画布批量卡）都是这一下 IPC 的手势。
   */
  function decisionFor(projectId: string, link: CanvasHandOverLink | undefined, canvasRunId: string, gesture: CanvasShotGesture): MainProcessDecision {
    if (!link) return { kind: "gesture", ...gesture };
    const presentation = currentPresentation(repository().read(projectId, link.runId)?.generationPlan);
    const handOver = latestHandOver(presentation, link.shotId);
    if (!presentation || !handOver || handOver.canvasRunId !== canvasRunId || handOver.settled) {
      throw coded(`canvas_handover_missing: ${canvasRunId}`, "canvas_handover_missing", "handover_missing");
    }
    if (handOver.by === "gesture") return { kind: "gesture", ...gesture };
    if (presentation.policySnapshot?.mode !== "direct") {
      throw coded(`generation_policy_not_direct: ${canvasRunId}`, "generation_policy_not_direct", "policy_not_direct");
    }
    return { kind: "policy", policyMode: "project", policySurface: IN_APP_AGENT_POLICY_SURFACE };
  }
  /** 收尾：Run 里记成完成（有产物）或需要处理，删「没收尾」标记，放掉租约。 */
  function settle(projectId: string, projectRoot: string, runId: string, job?: ProductionJob, artifactId?: string): void {
    try {
      if (artifactId) markSingleShotCompleted(repository(), projectId, runId, { ...(job ? { jobId: job.jobId } : {}), artifactId });
      else markSingleShotAttention(repository(), projectId, runId, job?.jobId);
    } catch (error) {
      logWarn("production-run", "canvas-shot-settle-failed", { runId }, error);
    }
    const after = repository().read(projectId, runId);
    if (!blockingReason(after)) markCanvasRunSettled(projectRoot, runId);
    leases.delete(runId);
  }

  /**
   * 批 + 交。建 Run（单节点 ↑）或接着批量卡上那一份同意（已经建好的草稿）冻住这一刻的请求，封、批放进**一次落盘**
   * （`repository.executeBatch`；批的收据一次写完，`gestureGateApproval`），然后经提交出口交出去。
   */
  async function dispatch(input: CanvasShotSubmitInput, runId: string, consented: ProductionRun | null): Promise<CanvasTaskResult> {
    const { projectId, nodeId, vendor, request } = input;
    // 交给画布的那一镜：这个画布 Run 的来历里记着它替哪个制作 Run 的哪一镜交；节点请求里绑着的那一镜必须就是它。
    const link = handOverLinkOf(consented);
    const nodeKey = `${projectId}\u0000${nodeId}`;
    let ownsNode = false;
    let wroteBack = false;
    // 交之前的每一道准入（项目在不在、节点对不对得上、同节点有没有一笔没收尾）都在 try 里：哪一道拒了，批量卡那一份同意收回、
    // 交给画布的那一镜按「没发出去」写回它那一笔——不会停在「正在发出」，回合也不会白等。
    try {
      const { lease, record, projectRoot } = identity(projectId);
      const bound = boundShotOf(request.extras);
      if (consented?.origin.nodeId && consented.origin.nodeId !== nodeId) throw coded(`canvas_consent_node_mismatch: ${runId}`, "canvas_consent_node_mismatch", "node_mismatch");
      if (link && (!bound || bound.runId !== link.runId || bound.shotId !== link.shotId)) throw coded(`canvas_handover_mismatch: ${runId}`, "canvas_handover_mismatch", "handover_mismatch");
      assertNodeIdle(projectId, projectRoot, nodeId, runId);
      nodesInFlight.add(nodeKey);
      ownsNode = true;
      const block = await deps.previewBlock(projectId, nodeId);
      if (block) throw coded(`director_preview_blocked: ${block}`, "director_preview_blocked", block);
      claimBoundProductionShot(projectId, link ?? bound, runId);
      const providerId = canvasProviderId(vendor);
      const modelKey = text(request.extras?.modelKey) || text(request.extras?.modelAlias) || "unknown";
      markCanvasRunOpen(projectRoot, runId, nodeId);
      leases.set(runId, { projectId, senderId: input.senderId, touchedAt: Date.now() });
      consents.delete(runId);
      const issuedAt = now();
      const commands: Array<Omit<RunCommand, "expectedRevision">> = [];
      let run: ProductionRun;
      let candidate: PlanCandidate;
      if (consented) {
        // 卡上同意的是「这个节点照它的输入生成一次」；这一刻冻住的才是发出去的那一份（上游这一批刚出的参考也在里面）。
        candidate = canvasCandidate(runId, vendor, modelKey, request, request.kind, consented.generationPlan!.candidate.revision + 1);
        run = consented;
        const policy = consented.policy;
        if (!policy.allowedProviders.includes(providerId) || !policy.allowedModels.includes(modelKey)) {
          commands.push({ commandId: `canvas-shot-policy:${runId}:${providerId}:${modelKey}`, type: "policy.set", issuedAt,
            payload: { policy: { ...policy, allowedProviders: [...new Set([...policy.allowedProviders, providerId])], allowedModels: [...new Set([...policy.allowedModels, modelKey])] } } });
        }
        const { candidateId: _id, revision: _revision, ...patch } = candidate;
        commands.push({ commandId: `canvas-shot-freeze:${runId}`, type: "generation.patch", payload: { patch }, issuedAt });
      } else {
        candidate = canvasCandidate(runId, vendor, modelKey, request, request.kind, 1);
        run = deps.service.createGenerationDraft({
          operationId: runId, projectId, origin: { host: "canvas", nodeId }, candidate, cardHidden: true, policy: canvasPolicy(providerId, modelKey),
        });
      }
      const contract = freezeCanvasExecutionContract(candidate);
      const sealed = { ...candidate, sealedContractHash: contract.contractHash };
      const price = deps.quote({ vendorKey: vendor, modelKey, parameters: request.extras ?? {} });
      // 授权按「冻住之后」的那一份候选算；计划版本、已有的尝试、门数与草稿相同（改候选不动它们）。
      const authorization = prepareProductionGenerationAuthorization({
        lease, projectRevision: record.revision, run: { ...run, generationPlan: { ...run.generationPlan!, candidate: sealed } },
        operation: { operationId: runId, projectId, candidate: sealed, planVersion: run.planVersion },
        contract, providers: deps.providers(), resolveShotPrice: () => price, now: issuedAt,
      });
      commands.push({
        commandId: `generation.seal:${runId}:v${run.planVersion}:${contract.contractHash}`,
        type: "generation.seal", payload: { contract, authorization }, issuedAt,
      });
      // 这一下 IPC 就是批准：主进程按发起它的那个窗口铸手势收据（不弹卡，09-25 拍板）；「直接生成」档交给画布的那一镜按策略铸。
      // 批的就是信封里冻住的这一份。
      commands.push(mainProcessGateApproval({
        receipts: deps.receipts, lease, operationId: runId, authorization, decision: decisionFor(projectId, link, runId, input.gesture),
        display: { model: modelKey }, commandPrefix: "canvas-shot", issuedAt,
      }));
      // 先落节点、再发请求：画布节点发起的 Run，来源节点就是它的落点（origin.nodeId）——与制作流程同一个准入点。
      // 封、批之前就问：没有来源节点的（升级前留下的同意草稿）什么都不写、不交，画布那头按「没交」收尾。
      const admission = (await admitShotsForDispatch({
        repository: repository(), projectId, runId, shotIds: [undefined],
        land: async () => { throw coded(`canvas_run_without_origin_node: ${runId}`, "shot_not_landed", "shot_not_landed"); },
      })).admitted.values().next().value;
      if (!admission) {
        // 升级前留下的批量确认草稿：建它的那一版没记来源节点。不发，按「没交」收尾（下面 catch 收回出价），
        // 而且如实告诉画布：这批升级后没有发出，需要重新确认——不能悄悄没了。
        if (consented && !consented.origin.nodeId) throw coded(`canvas_consent_predates_upgrade: ${runId}`, "canvas_consent_predates_upgrade", "predates_upgrade");
        throw coded(`shot_not_landed: ${runId}`, "shot_not_landed", "shot_not_landed");
      }
      repository().executeBatch(projectId, runId, run.revision, commands);
      const submission = submissionFor(projectId);
      let started;
      try {
        started = await submission.start({ projectId, operationId: runId, admission });
      } catch (error) {
        const after = repository().read(projectId, runId);
        const job = after ? latestJob(after) : undefined;
        // 交给画布的那一镜：照这个 Run 的作业写回（确定结束在受理之前 = 没发出去，否则结果未知、不说没花钱）。
        settleFromRun(projectId, link, runId, error);
        wroteBack = true;
        // 明确拒绝 / 确定没发出去：已在 Run 里记成确定的失败，这一镜收尾；结果未知：标记留着，这个节点在核对前不许再点。
        if (after && !blockingReason(after)) settle(projectId, projectRoot, runId, job);
        throw error;
      }
      writeBackHandOver(projectId, link, runId, { outcome: "accepted" });
      wroteBack = true;
      const receipt = canvasSubmitReceipt(started.providerTaskId)
        ?? { id: started.providerTaskId, kind: request.kind, status: "queued", assets: [], raw: {} };
      // 交的那一刻就有结论（同步出图 / 缓存命中）：渲染层不会再来查，这里当场收进 Run。
      if (isTerminalTaskStatus(receipt.status)) return await pollRun(projectId, runId, request.kind);
      return receipt;
    } catch (error) {
      leases.delete(runId);
      // 批量卡上同意的那一镜没能交出去（准入拒了 / 没批下来）：出价收回，这一镜按「没交」收尾，不留一个永远开着的同意。
      if (consented) withdrawConsent(projectId, runId, { outcome: "not_sent", failure: handOverFailureOf(error) });
      // 交给画布的那一镜还没写回（封、批之后、交之前就失败）：按这个 Run 自己的作业说。
      if (!wroteBack) settleFromRun(projectId, link, runId, error);
      throw error;
    } finally {
      // 只放自己占的那一格：同节点在途被拒的那一下没占过它，放了会把正在交的那一笔的占位一起抹掉。
      if (ownsNode) nodesInFlight.delete(nodeKey);
    }
  }

  /** 已经有这个 Run（同一次意图的重试）：照 Run 账本回话，绝不再交一次。 */
  function replay(run: ProductionRun, kind: string): CanvasTaskResult | Promise<CanvasTaskResult> {
    if (withdrawnDraft(run)) throw coded(`canvas_generation_withdrawn: ${run.runId}`, "canvas_generation_withdrawn", "withdrawn");
    const job = latestJob(run);
    if (!job) throw coded(`node_generation_in_flight: ${run.runId}`, "node_generation_in_flight", "in_flight");
    if (job.status === "submission_unknown" || job.status === "reconciling") throw coded("production_shot_claimed: needs_reconcile", "production_shot_claimed", "needs_reconcile");
    const artifact = readyArtifact(run, job);
    if (artifact) return resultFromArtifact(run, job, artifact, kind);
    if (job.status === "needs_attention") return failedResult(job, kind);
    if (job.providerTaskId) return { id: job.providerTaskId, kind, status: "queued", assets: [], raw: {} };
    throw coded(`node_generation_in_flight: ${run.runId}`, "node_generation_in_flight", "in_flight");
  }

  async function pollRun(projectId: string, runId: string, kindHint?: string): Promise<CanvasTaskResult> {
    const { projectRoot } = identity(projectId);
    let run = repository().read(projectId, runId);
    if (!run) throw new Error(`Canvas generation run not found: ${runId}`);
    const contractRequest = (run.generationPlan?.contract?.parameters as { request?: CanvasShotRequest } | undefined)?.request;
    const kind = kindHint ?? contractRequest?.kind ?? "text_to_image";
    let job = latestJob(run);
    if (!job) throw new Error(`Canvas generation run has no job: ${runId}`);
    const existing = readyArtifact(run, job);
    if (existing) { settle(projectId, projectRoot, runId, job, existing.artifactId); return resultFromArtifact(run, job, existing, kind); }
    if (job.status === "needs_attention") { settle(projectId, projectRoot, runId, job); return failedResult(job, kind); }
    const submission = submissionFor(projectId);
    const polled = await submission.poll({ projectId, operationId: runId });
    const last = job.providerTaskId ? canvasLastResult(job.providerTaskId) : undefined;
    if (polled.nextAction === "poll") return last ?? { id: polled.providerTaskId, kind, status: "running", assets: [], raw: {} };
    if (polled.nextAction === "attention") {
      run = repository().read(projectId, runId) ?? run;
      job = latestJob(run) ?? job;
      settle(projectId, projectRoot, runId, job);
      return last && last.status === "failed" ? last : failedResult(job, kind);
    }
    try {
      const materialized = await submission.materialize({ projectId, operationId: runId });
      settle(projectId, projectRoot, runId, job, materialized.artifactId);
    } catch (error) {
      // 取回失败已在 Run 里停成「需要处理」（可免费重新取回）；把画布那台已经拿到的结果照常交给节点。
      logWarn("production-run", "canvas-shot-materialize-failed", { runId }, error);
      const after = repository().read(projectId, runId);
      if (after && !blockingReason(after)) settle(projectId, projectRoot, runId, latestJob(after));
    }
    run = repository().read(projectId, runId) ?? run;
    job = latestJob(run) ?? job;
    const artifact = readyArtifact(run, job);
    return last ?? (artifact ? resultFromArtifact(run, job, artifact, kind) : failedResult(job, kind));
  }

  /**
   * 收回批量卡上那一镜的同意（还没交的才收得回；已经交了的照常跑完）。`removed` = 用户在任务列表里把这一镜去掉了
   * （出价记下「去掉」，结局读作 removed）；其余 = 整批 × / 窗口没了 / 没能交出去（出价关掉，结局读作没决定 + 原因）。
   * 交给画布的那一镜同时写回那一笔交接（`ConsentEnd`）。
   */
  function withdrawConsent(projectId: string, runId: string, end: ConsentEnd): void {
    consents.delete(runId);
    const by = end.outcome === "withdrawn" ? end.by : "stopped";
    let withdrawn: ProductionRun | undefined;
    try {
      executeOn(projectId, runId, (run) => {
        withdrawn = undefined;
        if (!consentedDraft(run)) return null;
        withdrawn = run;
        return by === "removed"
          ? { commandId: `canvas-consent-remove:${runId}`, type: "generation.shot.remove", payload: { shotId: run.generationPlan!.candidate.candidateId }, issuedAt: now() }
          : { commandId: `canvas-consent-withdraw:${runId}:${by}`, type: "generation.withdraw", payload: { reason: by }, issuedAt: now() };
      });
    } catch (error) {
      withdrawn = undefined;
      logWarn("production-run", "canvas-consent-withdraw-failed", { runId }, error);
    }
    if (withdrawn) {
      writeBackHandOver(projectId, handOverLinkOf(withdrawn), runId, end.outcome === "withdrawn"
        ? { outcome: "withdrawn", withdrawnBy: end.by }
        : { outcome: "not_sent", failure: end.failure ?? { kind: "not_sent", code: "canvas_consent_withdrawn" } });
    }
    const projectRoot = deps.resolveProjectRoot(projectId);
    const after = repository().read(projectId, runId);
    if (projectRoot && !consentedDraft(after) && !blockingReason(after)) markCanvasRunSettled(projectRoot, runId);
  }
  function handOff(projectId: string, runId: string): void {
    try {
      const projectRoot = deps.resolveProjectRoot(projectId);
      const run = repository().read(projectId, runId);
      if (!projectRoot) return;
      if (consentedDraft(run) && !consents.has(runId)) { withdrawConsent(projectId, runId, { outcome: "not_sent" }); return; }
      if (!run || !blockingReason(run)) { if (!consentedDraft(run)) markCanvasRunSettled(projectRoot, runId); return; }
      const job = latestJob(run);
      if (!job?.providerTaskId || productionJobPhase(job.status) !== "generating") return;
      deps.observe(submissionFor(projectId), projectId, runId);
    } catch (error) {
      logWarn("production-run", "canvas-shot-handoff-failed", { runId }, error);
    }
  }

  return {
    /**
     * 批量卡上点了确认：卡上列出的每一镜各建一个单镜 Run，出价开着 = 用户同意了这一镜（这张卡就是这一份授权）。
     * 什么都还没交、没批、没花钱；轮到它时 `submit` 才冻住请求、批、交。返回每一镜的 Run 号（与运行记录号一一对应）。
     */
    consent(input: { projectId: string; shots: readonly CanvasConsentShot[]; senderId: number }): { runIds: string[] } {
      const { projectRoot } = identity(input.projectId);
      if (input.shots.some((shot) => shot.production && (!text(shot.production.runId) || !text(shot.production.shotId)))) {
        throw coded("canvas_consent_invalid: production link", "canvas_consent_invalid", "invalid");
      }
      const runIds: string[] = [];
      try {
        for (const shot of input.shots) {
          const runId = canvasRunIdFor(shot.runRecordId);
          if (repository().read(input.projectId, runId)) throw coded(`canvas_consent_duplicate: ${runId}`, "canvas_consent_duplicate", "duplicate");
          const modelKey = shot.modelKey || "unknown";
          markCanvasRunOpen(projectRoot, runId, shot.nodeId);
          deps.service.createGenerationDraft({
            operationId: runId, projectId: input.projectId,
            origin: { host: "canvas", nodeId: shot.nodeId, ...(shot.production ? { handOverOf: { runId: text(shot.production.runId), shotId: text(shot.production.shotId) } } : {}) },
            candidate: canvasCandidate(runId, shot.vendor, modelKey, null, shot.kind, 1),
            policy: canvasPolicy(canvasProviderId(shot.vendor), modelKey),
          });
          consents.set(runId, { projectId: input.projectId, senderId: input.senderId });
          runIds.push(runId);
        }
        recordHandOverBindings(input.projectId, input.shots, runIds);
      } catch (error) {
        // 一镜没开成 / 交接绑不上（出价在两步之间关了）：这一次开的同意全部收回，一镜都不交。
        for (const runId of runIds) withdrawConsent(input.projectId, runId, { outcome: "not_sent" });
        throw error;
      }
      return { runIds };
    },
    /** 任务列表里把排队的这一镜去掉 / 整批 ×：还没交的收回出价，再也交不出去；已经交了的照常跑完。 */
    withdraw(input: { projectId: string; runRecordIds: readonly string[]; by: "removed" | "user_closed" | "stopped" }): void {
      for (const runRecordId of input.runRecordIds) withdrawConsent(input.projectId, canvasRunIdFor(runRecordId), { outcome: "withdrawn", by: input.by });
    },
    /** 主进程按画布 Run 号收回（Agent 那一次出价被收回了：交给画布、还没轮到的那几镜）。 */
    withdrawRuns(input: { projectId: string; canvasRunIds: readonly string[]; by: "user_closed" | "user_wrote" | "stopped" }): void {
      for (const runId of input.canvasRunIds) withdrawConsent(input.projectId, runId, { outcome: "withdrawn", by: input.by });
    },
    /** 渲染层「交」：同一次意图（同一个运行记录号）只交一次，之后照 Run 账本回话。 */
    submit(input: CanvasShotSubmitInput): Promise<CanvasTaskResult> {
      const runId = canvasRunIdFor(input.runRecordId);
      const key = `${input.projectId}\u0000${runId}`;
      const pending = submitting.get(key);
      if (pending) return pending;
      const work = (async () => {
        const existing = repository().read(input.projectId, runId);
        if (existing && !consentedDraft(existing)) return replay(existing, input.request.kind);
        return dispatch(input, runId, existing);
      })();
      submitting.set(key, work);
      void work.then(() => submitting.delete(key), () => submitting.delete(key));
      return work;
    },
    /** 渲染层「查」：每一次都经 Run（poll → 出片就 materialize）；没有这个 Run 回 null（旧项目的旧运行记录，照旧路查）。 */
    async poll(input: { projectId: string; runRecordId: string; senderId: number }): Promise<CanvasTaskResult | null> {
      const runId = canvasRunIdFor(input.runRecordId);
      if (!repository().read(input.projectId, runId)) return null;
      leases.set(runId, { projectId: input.projectId, senderId: input.senderId, touchedAt: Date.now() });
      return pollRun(input.projectId, runId);
    },
    /** 渲染层不再等这一笔（点了停）：还在路上的交给观察者收完，钱花了的结果照样进项目；还没交的同意收回。 */
    release(input: { projectId: string; runRecordId: string }): void {
      const runId = canvasRunIdFor(input.runRecordId);
      leases.delete(runId);
      consents.delete(runId);
      handOff(input.projectId, runId);
    },
    /** 发起的窗口没了：它在等的每一笔都交给观察者；它在批量卡上同意了、还没交的收回出价。 */
    releaseSender(senderId: number): void {
      for (const [runId, lease] of [...leases.entries()]) {
        if (lease.senderId !== senderId) continue;
        leases.delete(runId);
        handOff(lease.projectId, runId);
      }
      for (const [runId, consent] of [...consents.entries()]) {
        if (consent.senderId === senderId) withdrawConsent(consent.projectId, runId, { outcome: "not_sent" });
      }
    },
    /** 打开项目：只看还挂着「没收尾」标记的画布 Run；没人在等的交给观察者，没人会再交的同意收回，收尾了的删标记。 */
    recoverOrphans(projectId: string): void {
      const projectRoot = deps.resolveProjectRoot(projectId);
      if (!projectRoot) return;
      for (const open of openCanvasRuns(projectRoot)) {
        const lease = leases.get(open.runId);
        if (lease && Date.now() - lease.touchedAt < LEASE_MS) continue;
        handOff(projectId, open.runId);
      }
    },
  };
}

export type CanvasShotRuns = ReturnType<typeof createCanvasShotRuns>;

// ── 能力核装配（appIntegration 只调这几个口子，守 800 行门岗）────────────────────────────────

let active: CanvasShotRuns | null = null;

/** 能力核起停时装上 / 卸下（stop 传 null）。 */
export function installCanvasShotRuns(runs: CanvasShotRuns | null): void {
  active = runs;
}

function activeRuns(): CanvasShotRuns {
  if (!active) throw coded("capability core is starting", "core_starting", "core_starting");
  return active;
}

/** 渲染层批量卡点了确认（受信 IPC 进来）。 */
export function consentCanvasShots(input: { projectId: string; shots: readonly CanvasConsentShot[]; senderId: number }): { runIds: string[] } {
  return activeRuns().consent(input);
}

/** 渲染层「交」（受信 IPC 进来，发起的窗口就是这一下点击）。 */
export function submitCanvasShot(input: CanvasShotSubmitInput): Promise<CanvasTaskResult> {
  return activeRuns().submit(input);
}

/** 渲染层「查」；没有这个 Run 回 null（旧运行记录走旧路）。 */
export function pollCanvasShot(input: { projectId: string; runRecordId: string; senderId: number }): Promise<CanvasTaskResult | null> {
  return activeRuns().poll(input);
}

export function releaseCanvasShot(input: { projectId: string; runRecordId: string }): void {
  active?.release(input);
}

/** 排队的那几镜被去掉 / 整批 ×：收回还没交的同意。 */
export function withdrawCanvasShots(input: { projectId: string; runRecordIds: readonly string[]; by: "removed" | "user_closed" | "stopped" }): void {
  active?.withdraw(input);
}

/**
 * Agent 那一次出价关掉之后（付费卡「取消」/ 回合被停 / 用户打了字 / 重启清扫 / 计划被删 / 被下一次出价顶掉）：交给画布、
 * 已经绑上画布 Run、还没轮到的那几镜当场收回同意（不花钱）；已经在交的照常交完，算「交出去了」。没绑上的那几笔
 * 关卡那一条命令里已经记成收回（`closeCurrent`）。
 *
 * 挂在账本的变更订阅上（`subscribeProductionRunChanges`，每一条写入同步回调一次），不挂在某一个关卡动作上：
 * 出价从哪条路关的都一样收，以后多一条关卡的路也不用记得来这里接一次。没有排队的就什么都不做（绝大多数写入）。
 */
export function withdrawQueuedHandOvers(run: ProductionRun): void {
  if (run.origin.host === "canvas") return;
  const queued = queuedHandOversOfClosedPresentations(run.generationPlan);
  if (queued.length === 0 || !active) return;
  for (const by of ["user_closed", "user_wrote", "stopped"] as const) {
    const canvasRunIds = queued.filter((entry) => (entry.by === "user_wrote" || entry.by === "stopped" ? entry.by : "user_closed") === by).map((entry) => entry.canvasRunId);
    if (canvasRunIds.length > 0) active.withdrawRuns({ projectId: run.projectId, canvasRunIds, by });
  }
}

export function releaseCanvasShotSender(senderId: number): void {
  active?.releaseSender(senderId);
}
