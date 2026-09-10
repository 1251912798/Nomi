// Agent lane · `timeline.read` 的**执行那一半**。
//
// 说明书那一半住 `electron/shared/agentCapabilities/timelineModelTools.ts`（两个 profile 共用，
// 方案 §3.1）；那里也写着 `propose_edit_plan` 为什么还进不了模型可见 schema。
import {
  projectTimelineReadResult,
  type TimelineReadInput,
  type TimelineReadResult,
} from "../shared/agentCapabilities/timelineRead";
import { timelineModelToolSpecs } from "../shared/agentCapabilities/timelineModelTools";
import { bindLaneTool, type LaneToolDescriptor, type LaneToolExecutionContext } from "./laneRuntimePort";

/** 领域侧。lane 不认识时间轴渲染，只认识「读一段」。 */
export interface TimelineLanePort {
  read(input: TimelineReadInput, context: LaneToolExecutionContext): Promise<unknown>;
}

export function createTimelineLaneTools(port: TimelineLanePort): LaneToolDescriptor[] {
  return timelineModelToolSpecs().map((spec) =>
    bindLaneTool(spec, async (args, context) => {
      const operation = spec.name as TimelineReadInput["operation"];
      const input = { operation, ...(args as Record<string, unknown>) } as TimelineReadInput;
      // 领域适配器的**输出**仍然校验：那是能力契约的收据形状（K1），
      // 与「模型输入校验几次」是两件事。
      const result: TimelineReadResult = projectTimelineReadResult(await port.read(input, context), operation);
      return { ok: true, text: JSON.stringify(result), details: { operation } };
    }),
  );
}
