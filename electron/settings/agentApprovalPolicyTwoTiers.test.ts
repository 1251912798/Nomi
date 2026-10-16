import { describe, expect, it } from "vitest";

import { normalizeAgentApprovalPolicySettings } from "./agentApprovalPolicyContract";

// 线 L19 第一轮 · 必红：升级迁移（设计卡格 5 / ★9）。
// 用户拍板（10-12）：「全部落在『请求批准』」——包括旧的「全自动」。直接生成必须是升级后用户自己重新点出来的。
describe("旧三档迁移 → 请求批准", () => {
  const legacy = [
    { mode: "step", spend: "confirm" },
    { mode: "safe-auto", spend: "confirm" },
    { mode: "project", spend: "confirm" },
    { mode: "project", spend: "within-budget" },
  ];
  for (const policy of legacy) {
    it(`盘上旧值 ${policy.mode}/${policy.spend}（schemaVersion 1）→ request`, () => {
      expect(normalizeAgentApprovalPolicySettings({ schemaVersion: 1, policy }).policy.mode).toBe("request");
    });
  }
  it("裸 { mode, spend } 形状的旧值同样迁到 request", () => {
    expect(normalizeAgentApprovalPolicySettings({ mode: "project", spend: "confirm" }).policy.mode).toBe("request");
  });
  it("新 schema 里用户自己选的 direct 被保留（含裸 { mode } 形状）", () => {
    expect(normalizeAgentApprovalPolicySettings({ schemaVersion: 2, policy: { mode: "direct" } }).policy.mode).toBe("direct");
    expect(normalizeAgentApprovalPolicySettings({ mode: "direct" }).policy.mode).toBe("direct");
  });
  it("认不出的值与缺文件默认都是 request，不是 direct", () => {
    expect(normalizeAgentApprovalPolicySettings({ schemaVersion: 2, policy: { mode: "yolo" } }).policy.mode).toBe("request");
    expect(normalizeAgentApprovalPolicySettings(undefined).policy.mode).toBe("request");
  });
  it("迁移后的 schemaVersion 是 2（旧版本号不会让下次启动再迁一次）", () => {
    expect((normalizeAgentApprovalPolicySettings({ schemaVersion: 1, policy: { mode: "project", spend: "confirm" } }) as { schemaVersion: number }).schemaVersion).toBe(2);
  });
});
