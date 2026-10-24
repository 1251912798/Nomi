// trace 这一层自己的合同：交给唯一写者的失败事件只带 `VendorFailureFacts`（不靠写者兜底才干净）。
// 两层各自钉：写者那层（diskSafePayload）在 diskSafeFailure.test.ts 的端到端用例里钉。
import { describe, expect, it, vi } from "vitest";

const appended = vi.hoisted(() => ({ batches: [] as unknown[] }));
vi.mock("./eventLogRepository", () => ({ appendEvents: (_projectId: string, events: unknown[]) => { appended.batches.push(events); return []; } }));

import { traceVendorCompleted } from "./vendorCallTrace";

describe("traceVendorCompleted", () => {
  it("失败事件只交结构事实：没有上游原话，也没有 URL", () => {
    traceVendorCompleted("proj", {
      runId: "r", nodeId: "n", status: "failed", assetCount: 0,
      error: { vendorKey: "relay", method: "POST", url: "https://relay.example/v1?key=fixture-relay-pass-42", httpStatus: 401,
        upstreamMsg: "Access denied: fixture-relay-pass-42", upstreamCode: "auth_denied", category: "auth", retryable: false },
    });
    const [[event]] = appended.batches as [[{ payload: Record<string, unknown> }]];
    expect(event.payload.error).toEqual({ vendorKey: "relay", category: "auth", retryable: false, httpStatus: 401, upstreamCode: "auth_denied" });
    expect(JSON.stringify(event)).not.toContain("fixture-relay");
  });

  it("上游把一句话塞进 code 字段时，那句话不落盘", () => {
    appended.batches.length = 0;
    traceVendorCompleted("proj", {
      runId: "r", status: "failed", assetCount: 0,
      error: { vendorKey: "relay", method: "POST", url: "", upstreamMsg: "x", upstreamCode: "denied for token fixture-relay-pass-42", category: "auth", retryable: false },
    });
    const [[event]] = appended.batches as [[{ payload: Record<string, unknown> }]];
    expect(event.payload.error).toEqual({ vendorKey: "relay", category: "auth", retryable: false });
  });
});
