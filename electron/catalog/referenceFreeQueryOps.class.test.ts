// 门岗（类）：所有内置映射的「查任务」「取结果」步都按任务号寻址，渲染出的请求里一张参考都没有。
//
// 这是「参考素材只在提交这一步交给供应商」（referenceStage.stageSubmitsReferences）能成立的前提：
// 执行器在查询步不再本地化参考，若某个内置查询步把参考写进了请求，那条映射会在查询时报错
// （assertNoReferencesOutsideSubmit），而不是悄悄把本机地址发出去。新加一家供应商、一种查询形状，
// 这里自动覆盖（遍历的是种子目录、中转通用通道、原生通道全集，不是手抄名单）。
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => process.env.TEMP || "/tmp", getAppPath: () => process.cwd() },
  safeStorage: { isEncryptionAvailable: () => false },
}));

const { applyBuiltinSeeds } = await import("./seedBuiltins");
const { buildProfileHttpRequest } = await import("./profileHttpRequest");
const { assertNoReferencesOutsideSubmit, stageSubmitsReferences } = await import("./referenceStage");
const { NEWAPI_VIDEO_QUERY_OP } = await import("./newapiTransport");
const { listNativeWireProfiles } = await import("./nativeWireProfiles");
type CatalogState = import("./types").CatalogState;
type HttpOperation = import("./types").HttpOperation;
type Model = import("./types").Model;
type Vendor = import("./types").Vendor;
type TaskRequest = import("../runtime").TaskRequest;

const LOCAL = "nomi-local://asset/project-1/assets/ref.png";
const INLINE = "data:image/png;base64,iVBORw0KGgo=";

/** 一份把参考塞满所有常见载体的请求：首尾帧、参考列表、档案投影（数组键 / 对象键）。 */
function referenceHeavyRequest(kind: TaskRequest["kind"], modelKey: string): TaskRequest {
  return {
    kind,
    prompt: "p",
    extras: {
      modelKey,
      firstFrameUrl: LOCAL,
      lastFrameUrl: INLINE,
      referenceImages: [LOCAL, INLINE],
      referenceVideos: [LOCAL],
      referenceAudios: [LOCAL],
      image_url: LOCAL,
      archetypeInput: {
        image_urls: [LOCAL, INLINE],
        video_urls: [LOCAL],
        audio_urls: [LOCAL],
        input_urls: [LOCAL],
        first_frame_image: LOCAL,
        last_frame_image: INLINE,
        image_with_roles: [{ url: LOCAL, role: "first_frame" }, { url: INLINE, role: "last_frame" }],
      },
    },
  };
}

type Case = { label: string; vendor: Vendor; model: Model; kind: TaskRequest["kind"]; stage: "query" | "result"; operation: HttpOperation };

function builtinCases(): Case[] {
  const state = applyBuiltinSeeds({ version: 1, vendors: [], models: [], mappings: [], apiKeysByVendor: {} } as unknown as CatalogState, "2026-10-22T00:00:00.000Z").state;
  const cases: Case[] = [];
  for (const mapping of state.mappings) {
    const vendor = state.vendors.find((v) => v.key === mapping.vendorKey);
    const model = state.models.find((m) => m.vendorKey === mapping.vendorKey && m.modelKey === mapping.modelKey)
      ?? ({ vendorKey: mapping.vendorKey, modelKey: mapping.modelKey || "m", labelZh: "m", kind: "video", enabled: true, createdAt: "", updatedAt: "" } as Model);
    if (!vendor) continue;
    for (const stage of ["query", "result"] as const) {
      const operation = mapping[stage];
      if (operation) cases.push({ label: `${mapping.vendorKey}/${mapping.modelKey}/${mapping.taskKind}/${stage}`, vendor, model, kind: mapping.taskKind, stage, operation });
    }
  }
  const relay = { key: "relay", name: "relay", enabled: true, baseUrlHint: "https://relay.example.test/v1", authType: "bearer", createdAt: "", updatedAt: "" } as Vendor;
  const relayModel = { vendorKey: "relay", modelKey: "m", labelZh: "m", kind: "video", enabled: true, createdAt: "", updatedAt: "" } as Model;
  cases.push({ label: "newapi/video/query", vendor: relay, model: relayModel, kind: "image_to_video", stage: "query", operation: NEWAPI_VIDEO_QUERY_OP });
  for (const profile of listNativeWireProfiles()) {
    if (profile.query) cases.push({ label: `native/${profile.archetypeId}/query`, vendor: relay, model: relayModel, kind: "image_to_video", stage: "query", operation: profile.query });
  }
  return cases;
}

describe("内置映射的查任务 / 取结果步不读参考素材（类门岗）", () => {
  const cases = builtinCases();

  it("覆盖面不是空的：种子目录 + 中转通用通道 + 原生通道都在", () => {
    expect(cases.length).toBeGreaterThan(50);
    expect(new Set(cases.map((c) => c.vendor.key)).size).toBeGreaterThan(3);
  });

  it("门岗自己有牙：一条把参考模板进查询体的映射，用同一份请求渲染出来会被抓到", () => {
    const c = cases[0];
    const leaky = { ...c.operation, body: { task_id: "{{providerMeta.task_id}}", image: "{{request.params.image_url}}" } } as HttpOperation;
    const built = buildProfileHttpRequest({ vendor: c.vendor, model: c.model, apiKey: "k", request: referenceHeavyRequest(c.kind, c.model.modelKey), operation: leaky, providerMeta: { task_id: "task_1" } });
    expect(() => assertNoReferencesOutsideSubmit("query", built)).toThrow(/查任务/);
  });

  it("每一条查询 / 取结果步：不走 multipart（那条路会读参考字节），渲染出的请求里没有本地素材值", () => {
    const offenders: string[] = [];
    for (const c of cases) {
      if (c.operation.multipart) { offenders.push(`${c.label}: multipart`); continue; }
      if (c.operation.process) continue; // 本机进程步不发 HTTP，不经参考本地化
      const built = buildProfileHttpRequest({ vendor: c.vendor, model: c.model, apiKey: "k", request: referenceHeavyRequest(c.kind, c.model.modelKey), operation: c.operation, providerMeta: { task_id: "task_1", query_id: "task_1" } });
      try {
        assertNoReferencesOutsideSubmit(c.stage, built);
      } catch (error) {
        offenders.push(`${c.label}: ${(error as Error).message}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("只有提交这一步交参考", () => {
  it("create 交、query / result 不交", () => {
    expect(stageSubmitsReferences("create")).toBe(true);
    expect(stageSubmitsReferences("query")).toBe(false);
    expect(stageSubmitsReferences("result")).toBe(false);
  });

  it("用户自配映射把参考写进查询步：查询步当场报错（不发本机地址、不带「还没发出去」的 asset-* 码）；提交步不拦", () => {
    const leaky = { url: "https://x.test/v1/tasks/task_1", query: {}, body: { task_id: "task_1", image: LOCAL } };
    expect(() => assertNoReferencesOutsideSubmit("query", leaky)).toThrow(/查任务[\s\S]*任务已经提交/);
    expect(() => assertNoReferencesOutsideSubmit("result", { ...leaky, body: { refs: [INLINE] } })).toThrow(/取结果/);
    expect(() => assertNoReferencesOutsideSubmit("query", { url: "https://x.test/v1/tasks/nomi-local%3A%2F%2Fasset", query: {}, body: null })).toThrow();
    try { assertNoReferencesOutsideSubmit("query", leaky); } catch (error) { expect((error as Error).message).not.toMatch(/NOMI_ERR::asset-/); }
    expect(() => assertNoReferencesOutsideSubmit("create", leaky)).not.toThrow();
  });
});
