import { transitionJob } from "./productionRunState";
import { currentPresentation, latestHandOver } from "../shared/productionGenerationPresentation";
import { currentShotAttempt, jobsForShot } from "../shared/productionShotJobs";
import { decideShotClaim } from "../shared/decideShotClaim";
import type { ProductionCommandEffect } from "./productionRunReducer";
import type { ProductionJob, ProductionRun, ProductionShotClaim, RunCommand } from "./productionRunTypes";
import { bindHandOvers, handOverPresentedShots, settleHandOver } from "./productionGenerationPresentationEdits";

function text(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${key}`);
  return value.trim();
}

export function applyGenerationHandoverCommand(
  current: ProductionRun,
  command: RunCommand,
  now: string,
): ProductionCommandEffect {
  switch (command.type) {
    case "generation.handover":
      return {
        run: handOverPresentedShots(current, command.payload.shotIds, command.payload.by, now),
        eventType: "generation.shots.handed_over",
        message: current.generationPlan?.operationId ?? current.runId,
      };
    case "generation.handover.bind":
      return {
        run: bindHandOvers(current, command.payload.bindings, now),
        eventType: "generation.handover.bound",
        message: current.generationPlan?.operationId ?? current.runId,
      };
    case "generation.handover.settle":
      return {
        run: settleHandOver(current, command.payload, now),
        eventType: "generation.handover.settled",
        message: text(command.payload, "shotId"),
      };
    default:
      throw new Error(`Unsupported generation handover command: ${command.type}`);
  }
}

export function applyCanvasShotClaim(
  current: ProductionRun,
  command: RunCommand,
  now: string,
): ProductionCommandEffect {
  const by = text(command.payload, "by");
  if (by !== "canvas" && by !== "production") throw new Error("Invalid shot claim owner");
  const shotId = text(command.payload, "shotId");
  const canvasRunId =
    typeof command.payload.canvasRunId === "string" && command.payload.canvasRunId.trim()
      ? command.payload.canvasRunId.trim()
      : undefined;
  const decision = decideShotClaim(current, shotId, by, { ...(canvasRunId ? { canvasRunId } : {}) });
  if (!decision.granted) {
    throw Object.assign(new Error(`production_shot_claimed: ${decision.reason}`), {
      code: "production_shot_claimed",
      reason: decision.reason,
    });
  }
  if (by === "production") return { run: current, eventType: "shot.claimed", message: shotId };
  // A canvas claim is only durable when the shared decision explicitly assigns ownership to canvas.
  if (decision.holder !== "canvas") return { run: current, eventType: "shot.claimed", message: shotId };
  const pending = new Set<ProductionJob["status"]>(["planned", "authorization_required", "authorized"]);
  // 从哪来、哪一次出价，由账本派生（不信载荷）：交接绑着的那个画布 Run 来认领 = 卡交出去的；别的都是节点上点的。
  const presentation = currentPresentation(current.generationPlan);
  const handOver = latestHandOver(presentation, shotId);
  const viaHandOver = Boolean(canvasRunId && handOver?.canvasRunId === canvasRunId);
  const claim: ProductionShotClaim = {
    by: "canvas",
    attempt: currentShotAttempt(current, shotId),
    claimedAt: now,
    via: viaHandOver ? "handover" : "node",
    ...(presentation?.presentationId && (viaHandOver || !presentation.closed)
      ? { presentationId: presentation.presentationId }
      : {}),
    ...(canvasRunId ? { canvasRunId } : {}),
  };
  const jobs = current.jobs.map((job) => {
    const matches = jobsForShot(current, shotId).some((candidate) => candidate.jobId === job.jobId);
    return matches && pending.has(job.status)
      ? {
          ...transitionJob(job, "detached", now),
          errorCode: "canvas_claimed",
          errorMessage: "Canvas claimed this shot",
          updatedAt: now,
        }
      : job;
  });
  const plan = current.generationPlan;
  const shots = plan?.shots?.map((shot) => (shot.shotId === shotId ? { ...shot, claim, updatedAt: now } : shot));
  const generationPlan = plan ? { ...plan, ...(shots ? { shots } : { claim }), updatedAt: now } : plan;
  return {
    run: { ...current, jobs, ...(generationPlan ? { generationPlan } : {}), updatedAt: now },
    eventType: "shot.claimed",
    message: shotId,
  };
}
