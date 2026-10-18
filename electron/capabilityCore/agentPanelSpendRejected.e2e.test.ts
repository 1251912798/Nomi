// 确认阶段被拒不许沉默（零额度 loopback，真 durable Run / 真封印 / 真门）。
//
// 2026-10-18 真走查：付费卡按下「生成」，主进程在合同编译口把一个坏参数拒了
// （`spend-confirm-failed code=generation_not_started`），卡还摆着、用户只觉得「点了没反应」。
// 起草时的校验已经前移（`draftTimeParameterAdmission.test.ts`），这里钉的是**兜底**：
// 不论什么原因，确认被拒时宿主回给卡的结果里必须带「哪一步、哪个键」，供应商一次都没收到，卡不丢。
import { afterEach, describe, expect, it } from "vitest";

import { spendActionFailureCopy } from "../../src/workbench/ai/v4/spendCardFailure";
import {
  OPERATION_ID, PROJECT_ID, advanceClock, buildActions, candidate, harness, now, resetSpendFixture, startLoopbackVendor,
} from "./agentPanelSpendConfirmTestUtils";

afterEach(resetSpendFixture);

/** 绕开起草准入直接写一份「库里已经坏掉的草稿」（旧数据 / 目录在两次点击之间变了）。 */
async function staleBadDraft(base: ReturnType<typeof harness>, parameters: Record<string, unknown>): Promise<void> {
  await base.operations.create({
    operationId: OPERATION_ID, projectId: PROJECT_ID, candidate: candidate("image-model", parameters),
    now: now(), origin: { host: "nomi", actorId: "agent-panel" },
  });
  await base.canvasLanding.settleCanvasLanding(PROJECT_ID);
}

describe("付费卡确认被合同编译口拒掉：卡上说得出原因", () => {
  it("坏参数 → 结果带语义码与参数名，供应商一次没收到，卡还在（可改了再按）", async () => {
    const vendor = await startLoopbackVendor();
    const base = harness();
    const submits: string[] = [];
    const { withWindow } = buildActions(base, vendor.origin, submits);
    try {
      await staleBadDraft(base, { size: 5 });
      advanceClock(1000);
      const quoteId = withWindow.listPendingSpend(PROJECT_ID)[0]!.quoteId;
      const outcome = await withWindow.confirmPendingSpend({ projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId });
      expect(outcome).toMatchObject({
        ok: false, code: "failed", message: "generation_not_started",
        reason: "parameter_type_mismatch", field: "size", failure: "parameter_rejected",
      });
      expect(vendor.bodies).toHaveLength(0);
      expect(submits).toHaveLength(0);
      expect(withWindow.listPendingSpend(PROJECT_ID)).toHaveLength(1);
      // 渲染层据它挑的那一句：点名参数，不是「改一下再按」那句笼统话。
      expect(spendActionFailureCopy(outcome, true)).toBe("agentPanelV4.spendActionParameterRejected");
    } finally {
      await vendor.close();
    }
  });

  it("取值不在合法范围同样说得出（点名哪个键）", async () => {
    const vendor = await startLoopbackVendor();
    const base = harness();
    const { withWindow } = buildActions(base, vendor.origin, []);
    try {
      // 取值不在枚举里：另一种参数拒绝，field 同样点名。
      await staleBadDraft(base, { size: "9999x9999" });
      advanceClock(1000);
      const quoteId = withWindow.listPendingSpend(PROJECT_ID)[0]!.quoteId;
      const outcome = await withWindow.confirmPendingSpend({ projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId });
      expect(outcome).toMatchObject({ ok: false, reason: "parameter_not_in_enum", field: "size", failure: "parameter_rejected" });
    } finally {
      await vendor.close();
    }
  });
});
