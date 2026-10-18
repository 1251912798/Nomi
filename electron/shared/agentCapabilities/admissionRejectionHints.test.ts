// 准入拒绝的指引表只有一份：MCP 与 lane 读的是同一张，而且每一条都说了「没提交、没扣钱、改完再调同一个工具」。
import { describe, expect, it } from "vitest";

import {
  ADMISSION_NOTHING_SENT, ADMISSION_REJECTION_CODES, ADMISSION_REJECTION_HINTS, DRAFT_REFUSAL_NEXT_ACTION_EN, admissionNextActionEn,
} from "./admissionRejectionHints";
import { laneFailureFromDecision } from "../agentLane/laneFailureFromDecision";
import { buildToolErrorOutcome } from "../../capabilityCore/mcpToolErrorResults";
import { ContractCompilationError } from "../../capabilityCore/executionContract";

describe("准入拒绝指引表（唯一 owner）", () => {
  it("每个准入码都有中英人话与恢复动作，最后一条是「没提交、没扣钱」", () => {
    for (const code of ADMISSION_REJECTION_CODES) {
      const hint = ADMISSION_REJECTION_HINTS[code];
      expect(hint.zh, code).toBeTruthy();
      expect(hint.en, code).toBeTruthy();
      expect(hint.recover.length, code).toBeGreaterThanOrEqual(2);
      expect(hint.recover.at(-1), code).toBe(ADMISSION_NOTHING_SENT);
      expect(admissionNextActionEn(code), code).not.toContain("Do not repeat");
    }
  });

  it("lane：具体码给按码的下一步（不是那句通用的「Do not repeat an unknown paid submission」）", () => {
    for (const code of ADMISSION_REJECTION_CODES) {
      const failure = laneFailureFromDecision({
        toolName: "draft_shots", code: "generation_input_invalid", message: "apimart/x 不接受参数 y。", admission: code,
        fallbackCode: "capability_execution_failed", nextAction: "Read the current project state … Do not repeat an unknown paid submission.",
      });
      expect(failure.nextAction, code).toBe(admissionNextActionEn(code));
      expect(failure.nextAction, code).toContain("Nothing was submitted and nothing was charged");
    }
  });

  it("lane：没有具体码的起草拒绝（generation_input_invalid）也是「没提交」，不套通用句", () => {
    const failure = laneFailureFromDecision({
      toolName: "draft_shots", code: "generation_input_invalid", message: "素材不在库里", fallbackCode: "capability_execution_failed",
      nextAction: "Do not repeat an unknown paid submission.",
    });
    expect(failure.nextAction).toBe(DRAFT_REFUSAL_NEXT_ACTION_EN);
  });

  it("lane：真正「提交状态不明」的码仍保留「不要重复提交」；认不出的码也不放松", () => {
    const unknownOutcome = laneFailureFromDecision({
      toolName: "generate", code: "generation_execution_failed", message: undefined, fallbackCode: "x", nextAction: "n",
    });
    expect(unknownOutcome.nextAction).toContain("Do not request payment or submit again");
    const unrecognized = laneFailureFromDecision({
      toolName: "draft_shots", code: "something_new", message: "m", fallbackCode: "x", nextAction: "Do not repeat an unknown paid submission.",
    });
    expect(unrecognized.nextAction).toContain("Do not repeat an unknown paid submission");
  });

  it("MCP 读同一张表：恢复动作里有同一句「没提交、没扣钱」（zh / en）", () => {
    const error = new ContractCompilationError("x", { code: "parameter_type_mismatch", path: "parameters.seed", expectedType: "number" });
    expect(buildToolErrorOutcome("nomi_operation_plan", error, "zh-CN").outcome.recoveryActions).toContain(ADMISSION_NOTHING_SENT.zh);
    expect(buildToolErrorOutcome("nomi_operation_plan", error, "en").outcome.recoveryActions).toContain(ADMISSION_NOTHING_SENT.en);
  });

  it("MCP：粗码 generation_input_invalid 也读共享恢复指引，正文（我们写的那句话）原样保留", () => {
    const refusal = Object.assign(new Error("参考素材 asset-1 不在这个项目的素材库里，请先用 look_at_media 找到它的 assetId"), { code: "generation_input_invalid" });
    for (const locale of ["zh-CN", "en"] as const) {
      const { text, outcome } = buildToolErrorOutcome("nomi_operation_plan", refusal, locale);
      expect(outcome.errorCode).toBe("generation_input_invalid");
      expect(outcome.message).toBe(refusal.message);
      expect(text).toContain(refusal.message);
      expect(outcome.recoveryActions).toContain(ADMISSION_NOTHING_SENT[locale === "en" ? "en" : "zh"]);
    }
  });
});
