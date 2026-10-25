// 付费卡带参考图生成（零额度 loopback）：卡上摆的参考 = 供应商收到的参考。
// 落地回写到画布节点（候选 → 节点参考槽）等画布写边界重构（方案 A）后接线，规划函数 planReferenceProjection 已有单测。
//
// 只有远端供应商是本机 loopback，其余（durable Run、改稿并入、封印 / 收据 / 门、提交、画布落地口）全是真的。
// 本项目素材库是夹具里那一份内存索引（`addReferenceAsset`），形状与生产 `projectSpendReferenceAssets` 一样。
import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { localizeAssetsForVendor } from "../catalog/assetLocalization";
import { resolveProductionReferenceUrls } from "./productionReferenceUrls";
import { spendActionFailureCopy } from "../../src/workbench/ai/v4/spendCardFailure";
import {
  PROJECT_ID, OPERATION_ID, addReferenceAsset, advanceClock, buildActions, draft, harness, harnessReferenceAssets, now,
  resetSpendFixture, startLoopbackVendor,
} from "./agentPanelSpendConfirmTestUtils";

afterEach(resetSpendFixture);

const CAT = `nomi-local://asset/${PROJECT_ID}/assets/cat.png`;
const FOX_IN_OTHER_PROJECT = "nomi-local://asset/project-other/assets/fox.png";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

async function startHeldReferenceUpload() {
  const uploads: Array<{ bytes: number; stack: string }> = [];
  let releaseUpload: (() => void) | null = null;
  let seenResolve!: () => void;
  const requestSeen = new Promise<void>((resolve) => { seenResolve = resolve; });
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/uploads/images") {
      response.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    uploads.push({ bytes: Buffer.concat(chunks).length, stack: new Error("loopback upload received").stack ?? "" });
    seenResolve();
    await new Promise<void>((resolve) => { releaseUpload = resolve; });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ url: "https://loopback.invalid/reference.png" }));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("held upload fixture did not bind");
  const endpoint = `http://127.0.0.1:${address.port}/v1/uploads/images`;
  const localAsset = { bytes: PNG, contentType: "image/png", fileName: "cat.png" };
  const resolveReferences = async (input: Parameters<typeof resolveProductionReferenceUrls>[0]) => resolveProductionReferenceUrls(input, {
    assets: harnessReferenceAssets,
    localize: async (_providerId, urls) => {
      const localized = await localizeAssetsForVendor(
        { referenceImages: urls },
        () => [{ vendorKey: "apimart", ingestion: { strategy: "upload-multipart", endpoint, urlPath: "url", accepts: ["image"] }, uploadApiKey: "" }],
        () => localAsset,
        vi.fn(),
        async (url, headers, bytes, fileName, contentType) => {
          const form = new FormData();
          form.append("file", new Blob([new Uint8Array(bytes)], { type: contentType }), fileName);
          const response = await fetch(url, { method: "POST", headers, body: form });
          return JSON.parse(await response.text()) as unknown;
        },
      );
      return [((localized.value as { referenceImages: string[] }).referenceImages[0])!];
    },
  });
  return {
    endpoint,
    uploads,
    resolveReferences,
    requestSeen,
    release: () => { releaseUpload?.(); releaseUpload = null; },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("付费卡带参考图：卡上 = 出站", () => {
  it("卡上带一张本项目的参考图点生成：供应商收到它", async () => {
    const vendor = await startLoopbackVendor();
    const base = harness();
    const submits: string[] = [];
    addReferenceAsset("asset-cat", CAT);
    const { withWindow } = buildActions(base, vendor.origin, submits, {
      resolveAssetReferenceIdentity: (projectId, assetId) => harnessReferenceAssets.identity(projectId, assetId),
    });
    try {
      await draft(base);
      advanceClock(1000);
      const revised = await withWindow.revisePendingSpend({
        projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId: withWindow.listPendingSpend(PROJECT_ID)[0]!.quoteId,
        patch: { referenceInputs: [{ url: CAT, kind: "image", role: "reference" }] },
      });
      expect(revised).toMatchObject({ ok: true, code: "revised" });
      // 卡回来的那一份（宿主现算）摆着它，预览地址就是本项目素材库里的那一个。
      expect(withWindow.listPendingSpend(PROJECT_ID)[0]!.shots[0]!.references).toEqual([
        expect.objectContaining({ assetId: "asset-cat", kind: "image", role: "reference", url: CAT }),
      ]);
      await base.canvasLanding.settleCanvasLanding(PROJECT_ID);

      advanceClock(1000);
      const confirmed = await withWindow.confirmPendingSpend({ projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId: withWindow.listPendingSpend(PROJECT_ID)[0]!.quoteId });
      expect(confirmed).toMatchObject({ ok: true, code: "spend_confirmed" });
      await base.canvasLanding.settleCanvasLanding(PROJECT_ID);

      // 出站：供应商那一侧收到的就是这一张。
      expect(vendor.bodies).toHaveLength(1);
      expect(vendor.bodies[0]!.references).toEqual([expect.objectContaining({ assetId: "asset-cat", kind: "image", role: "reference" })]);
    } finally {
      await vendor.close();
    }
  });

  it("卡上那张参考图不在本项目素材里（别的项目的原文件）：一次都不发，卡上那句点名是参考图、给拿掉或用 @ 重选的路", async () => {
    const vendor = await startLoopbackVendor();
    const base = harness();
    const submits: string[] = [];
    const { withWindow } = buildActions(base, vendor.origin, submits);
    try {
      await draft(base);
      advanceClock(1000);
      const outcome = await withWindow.revisePendingSpend({
        projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId: withWindow.listPendingSpend(PROJECT_ID)[0]!.quoteId,
        patch: { referenceInputs: [{ url: FOX_IN_OTHER_PROJECT, kind: "image", role: "reference" }] },
      });
      expect(outcome).toMatchObject({ ok: false, message: "generation_not_started", reason: "generation_reference_asset_unsupported" });
      expect(spendActionFailureCopy(outcome, true)).toBe("agentPanelV4.spendActionReferenceNotInProject");
      expect(submits).toHaveLength(0);
      expect(vendor.bodies).toHaveLength(0);
    } finally {
      await vendor.close();
    }
  });

  it("应用内 Agent：真实 multipart 上传被扣住时 Nomi 自写不作废确认；旧整 revision 判据在同一窗口为红", async () => {
    const vendor = await startLoopbackVendor();
    const upload = await startHeldReferenceUpload();
    const base = harness();
    const submits: string[] = [];
    addReferenceAsset("asset-cat", CAT);
    const { withWindow } = buildActions(base, vendor.origin, submits, {
      resolveAssetReferenceIdentity: (projectId, assetId) => harnessReferenceAssets.identity(projectId, assetId),
      resolveReferences: upload.resolveReferences,
    });
    const revisionLog: Array<{ phase: string; projectRevision: number; runRevision: number; stack: string }> = [];
    let projectRevision = 0;
    try {
      await draft(base);
      advanceClock(1000);
      const revised = await withWindow.revisePendingSpend({
        projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId: withWindow.listPendingSpend(PROJECT_ID)[0]!.quoteId,
        patch: { referenceInputs: [{ url: CAT, kind: "image", role: "reference" }] },
      });
      expect(revised).toMatchObject({ ok: true, code: "revised" });
      const beforeUpload = base.repository.read(PROJECT_ID, OPERATION_ID)!;
      revisionLog.push({ phase: "before upload", projectRevision, runRevision: beforeUpload.revision, stack: "" });
      const confirmPromise = withWindow.confirmPendingSpend({ projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId: withWindow.listPendingSpend(PROJECT_ID)[0]!.quoteId });
      await upload.requestSeen;

      const duringUpload = base.repository.read(PROJECT_ID, OPERATION_ID)!;
      const selfWrite = base.repository.execute(PROJECT_ID, OPERATION_ID, {
        commandId: `fixture:self-write:${duringUpload.revision}`,
        expectedRevision: duringUpload.revision,
        type: "plan.bind-shot-nodes",
        payload: { bindings: [{ shotId: duringUpload.generationPlan!.candidate.candidateId, nodeId: duringUpload.generationPlan!.nodeId ?? "node-self-write" }] },
        issuedAt: now(),
      }).run;
      projectRevision += 1;
      revisionLog.push({ phase: "Nomi canvas projection write during upload", projectRevision, runRevision: selfWrite.revision, stack: new Error("Nomi canvas projection write").stack ?? "" });
      const legacyAssertCurrent = () => {
        if (projectRevision !== revisionLog[0]!.projectRevision || selfWrite.revision !== revisionLog[0]!.runRevision) throw new Error("generation_reference_scope_changed");
      };
      expect(legacyAssertCurrent, "main 上旧的 project.revision + Run.revision 判据在自写窗口先红").toThrow("generation_reference_scope_changed");

      upload.release();
      const confirmed = await confirmPromise;
      expect(confirmed).toMatchObject({ ok: true, code: "spend_confirmed" });
      expect(submits).toHaveLength(1);
      expect(upload.uploads).toHaveLength(1);
      expect(upload.uploads[0]!.bytes).toBeGreaterThan(0);
      expect(revisionLog).toEqual([
        expect.objectContaining({ phase: "before upload", projectRevision: 0 }),
        expect.objectContaining({ phase: "Nomi canvas projection write during upload", projectRevision: 1 }),
      ]);
      expect(revisionLog[1]!.stack).toContain("Nomi canvas projection write");
    } finally {
      upload.release();
      await upload.close();
      await vendor.close();
    }
  });

  it("应用内 Agent：真实上传被扣住时用户改候选，放行后拒绝、供应商 0 次、卡保留且原因可见", async () => {
    const vendor = await startLoopbackVendor();
    const upload = await startHeldReferenceUpload();
    const base = harness();
    const submits: string[] = [];
    addReferenceAsset("asset-cat", CAT);
    const { withWindow } = buildActions(base, vendor.origin, submits, {
      resolveAssetReferenceIdentity: (projectId, assetId) => harnessReferenceAssets.identity(projectId, assetId),
      resolveReferences: upload.resolveReferences,
    });
    try {
      await draft(base);
      advanceClock(1000);
      expect(await withWindow.revisePendingSpend({
        projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId: withWindow.listPendingSpend(PROJECT_ID)[0]!.quoteId,
        patch: { referenceInputs: [{ url: CAT, kind: "image", role: "reference" }] },
      })).toMatchObject({ ok: true, code: "revised" });
      const confirmPromise = withWindow.confirmPendingSpend({ projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId: withWindow.listPendingSpend(PROJECT_ID)[0]!.quoteId });
      await upload.requestSeen;
      const current = base.repository.read(PROJECT_ID, OPERATION_ID)!;
      await base.operations.revise!(PROJECT_ID, OPERATION_ID, { expectedRevision: current.revision, patch: { prompt: "用户在上传期间改了这一镜" } }, now());
      upload.release();
      const refused = await confirmPromise;
      expect(refused).toMatchObject({ ok: false, message: "generation_not_started", failure: "approval_stale", reason: "generation_reference_scope_changed" });
      expect(spendActionFailureCopy(refused, true)).toBe("generationCommon.production.canvasLanding.actionFailure.approvalStale");
      expect(submits).toHaveLength(0);
      expect(vendor.bodies).toHaveLength(0);
      expect(withWindow.listPendingSpend(PROJECT_ID)).toHaveLength(1);
    } finally {
      upload.release();
      await upload.close();
      await vendor.close();
    }
  });
});
