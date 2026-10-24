// 失败路径实测（⑬）：生产代码整条走——fetchTaskResult → executeProfileOperation → vendorHttp.requestJson →
// 出站守卫（authorizeSubmitDestination）→ retrievalStageError。只注入 DNS 事实（fake-ip 合成地址、没有代理证据），
// 守卫在请求离开本机之前就拦下，所以零网络、零花费；拦下的那条错误是守卫真生成的，不是手写的形状。
//
// 修前：抛出去的是 outbound-blocked-submit，正文「这次生成**没有发出去**……然后重新生成」，structured.upstreamMsg 也是这句。
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => process.env.TEMP || "/tmp", getAppPath: () => process.cwd() },
  safeStorage: { isEncryptionAvailable: () => false },
  webContents: { getAllWebContents: () => [] },
}));

const { APIMART_STATUS_MAPPING, APIMART_VIDEO_QUERY_OP } = await import("../catalog/apimartVendor");
type Model = import("../catalog/types").Model;
type Vendor = import("../catalog/types").Vendor;
type Mapping = import("../catalog/types").Mapping;

const VENDOR = { key: "apimart", name: "APIMart", enabled: true, baseUrlHint: "https://api.apimart.ai", authType: "bearer", authHeader: "Authorization", createdAt: "", updatedAt: "" } as Vendor;
const MODEL = { modelKey: "doubao-seedance-2.0", vendorKey: "apimart", labelZh: "Seedance 2.0", kind: "video", enabled: true, createdAt: "", updatedAt: "" } as Model;

vi.mock("../catalog/executableModel", async (importOriginal) => ({
  ...await importOriginal<typeof import("../catalog/executableModel")>(),
  findExecutableModel: () => ({ vendor: VENDOR, model: MODEL, apiKey: "synthetic-key", customConfig: {} }),
}));

const { fetchTaskResult } = await import("./taskResultQuery");
const { admitTask, taskCache } = await import("../runtime");
const { setSubmitOutboundDepsForTests } = await import("../vendor/vendorOutboundGuard");
const { matchNomiErrorCode } = await import("../shared/nomiErrorCodes");

const PRE_SUBMIT_CLAIM = /没有发出去|没发出去|还没请求|没被请求到|重新生成|was never sent|generate again/;

beforeEach(() => {
  // 只注入环境事实：api.apimart.ai 解析到 RFC 2544 段、没有本地代理证据、没有应用代理。
  setSubmitOutboundDepsForTests({
    resolve: async () => [{ address: "198.18.0.7", family: 4 as const }],
    readEnvironment: async () => ({ syntheticResolver: false, syntheticSample: "" }),
    isApplicationProxyActive: () => false,
  });
});
afterAll(() => setSubmitOutboundDepsForTests(null));

describe("查询被 Nomi 自己的出站守卫拦下（fake-ip 未确证）——生产代码整条走", () => {
  it("抛出去的是 retrieval-query；没有「没发出去 / 重新生成」；原码留在正文、标明 Nomi 本机拦下；没有冒充的服务商原话", async () => {
    taskCache.delete("task_real_guard");
    admitTask("task_real_guard", {
      vendor: "apimart",
      request: { kind: "image_to_video", prompt: "cat", extras: { modelKey: MODEL.modelKey } },
      raw: {},
      mapping: { vendorKey: "apimart", taskKind: "image_to_video", modelKey: MODEL.modelKey, name: "seedance", enabled: true, create: APIMART_VIDEO_QUERY_OP, query: APIMART_VIDEO_QUERY_OP, statusMapping: APIMART_STATUS_MAPPING, createdAt: "", updatedAt: "" } as Mapping,
      model: MODEL,
      providerMeta: { task_id: "task_real_guard", query_id: "task_real_guard" },
      wantedKind: "video",
    });
    const error = await fetchTaskResult({ taskId: "task_real_guard" }).then(() => null, (caught: Error) => caught);
    expect(error, "守卫应当拦下这次查询").toBeInstanceOf(Error);
    expect(matchNomiErrorCode(error!.message)).toBe("retrieval-query");
    expect(error!.message).not.toMatch(PRE_SUBMIT_CLAIM);
    expect(error!.message).toContain("outbound-blocked-submit");
    expect(error!.message).toContain("api.apimart.ai");
    expect((error as { structured?: { upstreamMsg?: string } }).structured?.upstreamMsg ?? "").toBe("");
  });
});
