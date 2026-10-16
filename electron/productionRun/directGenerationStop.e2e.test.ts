import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// 线 L19 第一轮 · 必红（设计卡格 5「中途表」）：「直接生成」档里生成进行中点停止 / 连点 / 重启，真实边界上
// 供应商一共收到几次。走的是真实仓库 + 真实提交出口 + 真实派发闸，只有供应商是进程内计数器
// （与 doubleChargeMap.e2e.test.ts 同一套夹具，不另造）。
// 第二轮协调拍板：刹车只放在「策略代批」那一个点，派发闸不加第二道兜底（P1 无并行版）。所以这几条走的就是**现有**派发路径：
// 它们不是必红，是「直接生成」档下停止 / 连点 / 重启不重复扣费的回归护栏（第一轮写成必红时假设了一个新的派发闸，已撤销）。

import { compileExecutionContract, type PlanCandidate } from "../capabilityCore/executionContract";
import { createModuleRegistry } from "../capabilityCore/moduleRegistry";
import type { GenerationProvider } from "../capabilityCore/generationRuntimeAdapter";
import { sealAndApproveProductionGeneration } from "./productionGenerationAuthorizationTestUtils";
import { createProductionGenerationSubmission } from "./productionGenerationSubmission";
import { applyRunControl } from "./productionRunControl";
import { createProductionRunRepository } from "./productionRunRepository";
import type { ProductionGenerationShot, ProductionRun } from "./productionRunTypes";
import { createProductionShotDispatchGuard } from "./productionShotDispatchGuard";
import { landedAdmission } from "./landFirstTestUtils";

const NOW_BASE = Date.parse("2026-10-12T00:00:00.000Z");
const PROJECT = "project-1";
const RUN = "op-direct";
const roots: string[] = [];
const now = () => new Date(NOW_BASE).toISOString();

const CAPS = { submitIdempotency: false, query: true, reconcile: true, cancel: true, materialize: true } as const;
const registry = createModuleRegistry([{
  moduleId: "generation.single-shot", version: "1.0.0", inputKinds: ["text", "image"], outputKinds: ["image", "video"], modes: ["image-to-video"],
  parameterSchema: {}, assetInputSchema: { references: { kind: "image", max: 4 } },
  providers: [{ providerId: "apimart", models: [{ modelId: "video-model", modes: ["image-to-video"], parameterSchema: {}, capabilities: CAPS }] }],
}]);
type Repository = ReturnType<typeof createProductionRunRepository>;

function provider(submits: string[]): GenerationProvider {
  return {
    providerId: "apimart", capabilities: CAPS, buildRequest: (input) => input,
    submit: async (_request, idempotencyKey) => { submits.push(idempotencyKey); return { providerTaskId: `task-${submits.length}`, raw: {} }; },
    query: async (id) => ({ status: "processing", raw: { id } }),
    materialize: async ({ providerTaskId }) => ({ outputs: [{ kind: "video", url: `nomi-local://asset/${PROJECT}/${providerTaskId}.mp4` }] }),
  };
}

function shotEntry(shotId: string): ProductionGenerationShot {
  const candidate: PlanCandidate = { candidateId: `cand-${shotId}`, revision: 1, moduleId: "generation.single-shot", providerId: "apimart", modelId: "video-model", mode: "image-to-video", prompt: shotId, parameters: {}, references: [] };
  const contract = compileExecutionContract(candidate, registry);
  return { shotId, candidate: { ...candidate, sealedContractHash: contract.contractHash }, contract, approvedReceiptId: "receipt-plan", updatedAt: now() };
}

/** 「直接生成」档替用户批过的一份两镜计划（收据来自档位，不是手势）。 */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-direct-stop-"));
  roots.push(root);
  const repository = createProductionRunRepository({ projectDirResolver: (id) => (id === PROJECT ? root : null), now });
  const shots = ["shot-1", "shot-2"].map(shotEntry);
  repository.createGenerationDraft({
    operationId: RUN, projectId: PROJECT, origin: { host: "nomi" }, candidate: shots[0].candidate, shots,
    policy: { trustedHosts: ["nomi"], allowedProviders: ["apimart"], allowedModels: ["video-model"], maxSpend: null, maxAttemptsPerJob: 3 },
  });
  sealAndApproveProductionGeneration({
    repository, projectId: PROJECT, operationId: RUN, immutableProjectUuid: "project-uuid-1", projectGeneration: 1, projectRevision: 0,
    candidate: shots[0].candidate, contract: shots[0].contract!, providers: [provider([])],
    multiShot: { shots, scope: shots.map((s) => s.shotId), planHash: "plan-hash-direct" },
    resolveShotPrice: () => ({ known: true, amount: 6 }), receiptId: "receipt-plan", now: now(),
  });
  const run = repository.read(PROJECT, RUN)!;
  repository.execute(PROJECT, RUN, { commandId: "submit", expectedRevision: run.revision, type: "generation.submit", payload: {}, issuedAt: now() });
  return { root, repository };
}

async function submission(root: string, repository: Repository, p: GenerationProvider) {
  return createProductionGenerationSubmission({
    repository, beforeDispatch: createProductionShotDispatchGuard({ readRun: (projectId, runId) => repository.read(projectId, runId) ?? undefined }),
    projectRoot: root, immutableProjectUuid: "project-uuid-1", projectGeneration: 1, intentMacKey: "test-intent-key", provider: p,
    materializeOutput: async ({ providerTaskId }) => ({ artifactId: `a-${providerTaskId}`, kind: "video", contentHash: `h-${providerTaskId}`, projectRelativePath: `.nomi/out/${providerTaskId}.mp4` }),
    now,
  });
}

const read = (repository: Repository): ProductionRun => repository.read(PROJECT, RUN)!;
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe("格 5 · 「直接生成」档：停止 / 连点 / 重启 × 是否重复扣费", () => {
  it("生成进行中点停止：已交出去的一镜不被撤也不重发，没开始的一镜一个字节都不发、没有预留", async () => {
    const { root, repository } = setup();
    const submits: string[] = [];
    const sub = await submission(root, repository, provider(submits));
    await sub.start({ projectId: PROJECT, operationId: RUN, shotId: "shot-1", admission: await landedAdmission(repository, PROJECT, RUN, "shot-1") });
    expect(submits).toHaveLength(1);

    let run = read(repository);
    run = repository.execute(PROJECT, RUN, { commandId: "batch-start", expectedRevision: run.revision, type: "run.status", payload: { status: "running" }, issuedAt: now() }).run;
    applyRunControl(repository, PROJECT, RUN, run, { commandId: "user-stop", expectedRevision: run.revision, type: "run.control", payload: { action: "pause" }, issuedAt: now() });

    await expect(sub.start({ projectId: PROJECT, operationId: RUN, shotId: "shot-2", admission: await landedAdmission(repository, PROJECT, RUN, "shot-2") }))
      .rejects.toMatchObject({ reason: "run_stopped" });
    expect(submits).toHaveLength(1);
    expect(Object.keys(repository.readBudgetLedger(PROJECT, RUN).reservations)).toHaveLength(1);
  });

  it("连点：同一镜并发交两次，供应商只收到一次", async () => {
    const { root, repository } = setup();
    const submits: string[] = [];
    const sub = await submission(root, repository, provider(submits));
    const admission = await landedAdmission(repository, PROJECT, RUN, "shot-1");
    await Promise.allSettled([
      sub.start({ projectId: PROJECT, operationId: RUN, shotId: "shot-1", admission }),
      sub.start({ projectId: PROJECT, operationId: RUN, shotId: "shot-1", admission }),
    ]);
    expect(submits).toHaveLength(1);
  });

  it("重启（新仓库实例、新提交出口）后再交已交出的那一镜：不重发", async () => {
    const { root, repository } = setup();
    const submits: string[] = [];
    await (await submission(root, repository, provider(submits))).start({ projectId: PROJECT, operationId: RUN, shotId: "shot-1", admission: await landedAdmission(repository, PROJECT, RUN, "shot-1") });
    const reopened = createProductionRunRepository({ projectDirResolver: (id) => (id === PROJECT ? root : null), now });
    await Promise.allSettled([
      (await submission(root, reopened, provider(submits))).start({ projectId: PROJECT, operationId: RUN, shotId: "shot-1", admission: await landedAdmission(reopened, PROJECT, RUN, "shot-1") }),
    ]);
    expect(submits).toHaveLength(1);
  });
});
