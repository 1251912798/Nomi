// `timeline.read` 的模型可见描述符（说明书那一半，两个 profile 共用）。
//
// 这一族在 #547 里本来就是 100%（读类 37/37），所以它进阶段 2 不是为了修什么——
// 它是**对照组**：三个工具的形状（一别名一工具、单分支扁平 schema、无参数的那个真的不收参数）
// 与 `canvas.write` 那一族形成对比，评测里两族一起跑，才分得清「变好了」是形状的功劳
// 还是模型今天心情好。
//
// Timeline preview/write descriptors live in extendedModelTools and share the same plan schema.
// Their nested operations are mechanically flattened after aligning the shared action field.
//
// 阶段 5a：说明书从 `electron/agentLane/laneTimelineTools.ts` 搬到能力契约旁边。搬家同时
// 消掉的是对外 MCP 那张 `"read"` → `read_timeline` 的手写映射表——两个 profile 从今天起
// 用同一套动作词表，映射表因此无处可写。
import { z } from "zod";

import {
  TIMELINE_READ_ALIASES,
  timelineReadPiInputSchemaForAlias,
} from "./timelineRead";
import { modelArgumentTolerance, noArgumentTolerance } from "./modelArgumentTolerance";
import { MODEL_TOOL_READ_TIMEOUT_MS, type ModelFacingToolSpec } from "./modelFacingTools";

/**
 * 通道③ · 时间轴这一族共享的纪律。
 *
 * 第二条是这一族唯一真会咬人的地方：`revision` 是乐观锁。模型拿着一个过期的 revision
 * 提计划，收到的拒绝理由如果只说「revision mismatch」，它下一步多半是把同一个数再发一遍。
 */
const TIMELINE_GUIDELINES = Object.freeze([
  "Frames, not seconds: every timeline position and duration in these tools is an integer frame count at the project fps returned by read_timeline.",
  "Always plan against a fresh revision: read the timeline, build the plan from what you just read, and pass that same revision back. If a plan is rejected for a stale revision, read again before retrying — resending the old number cannot succeed.",
]);

const TIMELINE_READ_EFFECTS = Object.freeze({ mutates: false, billable: false, reversal: "none" } as const);

/** 时间轴这一族目前全是读。 */
const TIMELINE_READ_EXECUTION = Object.freeze({ timeoutMs: MODEL_TOOL_READ_TIMEOUT_MS } as const);

interface TimelineToolShape {
  readonly alias: string;
  readonly description: string;
  readonly promptSnippet: string;
  readonly examples: ModelFacingToolSpec["examples"];
  readonly arrayFields: readonly string[];
}

const TIMELINE_TOOLS: readonly TimelineToolShape[] = [
  {
    alias: TIMELINE_READ_ALIASES.read,
    description: [
      "Read the whole project timeline as a planning snapshot: fps, duration, playhead, every track and clip, text overlays and transitions.",
      "Takes no arguments. Call this first — the `revision` it returns is the optimistic lock every edit plan has to carry, and clip ids come from here.",
      "The snapshot is path-free: it names clips and source assets by id, never by a file path on disk.",
    ].join(" "),
    promptSnippet: "read the whole timeline (fps, clips, text, transitions) plus the revision to plan against.",
    examples: [{ when: "Always call it with no arguments:", arguments: {} }],
    arrayFields: [],
  },
  {
    alias: TIMELINE_READ_ALIASES.inspectRange,
    description: [
      "Inspect only the clips and text overlays that intersect one frame range of the timeline.",
      "Use this instead of read_timeline when the user is talking about a specific moment (\"the part around 0:30\") and the whole timeline would be far more than you need.",
      "`startFrame` and `endFrame` are integer frame numbers at the project fps; convert from seconds yourself using the fps from read_timeline.",
    ].join(" "),
    promptSnippet: "read just the clips and text inside one frame range.",
    examples: [{ when: "Look at the fourth to sixth second at 30fps:", arguments: { startFrame: 120, endFrame: 180 } }],
    arrayFields: [],
  },
];

export function timelineModelToolSpecs(): ModelFacingToolSpec[] {
  return TIMELINE_TOOLS.map((tool): ModelFacingToolSpec => {
    const schema = timelineReadPiInputSchemaForAlias(tool.alias);
    if (!schema) throw new Error(`Unregistered timeline.read alias: ${tool.alias}`);
    return {
      contractId: "timeline.read",
      name: tool.alias,
      description: tool.description,
      promptSnippet: tool.promptSnippet,
      promptGuidelines: TIMELINE_GUIDELINES,
      effects: TIMELINE_READ_EFFECTS,
      execution: TIMELINE_READ_EXECUTION,
      schema,
      examples: tool.examples,
      // 别名 = 语义 operation。对外 MCP 的 `operation` 枚举就是这几个值的并集，
      // 所以那张 `"read"` → `read_timeline` 的映射表不再有存在的理由。
      aliasBoundInput: Object.freeze({ operation: tool.alias }),
      prepareArguments: tool.arrayFields.length === 0 && isNoArgumentSchema(schema)
        ? noArgumentTolerance
        : modelArgumentTolerance({ arrayFields: tool.arrayFields }),
    };
  });
}

/** 「这个工具真的不收参数吗」——判据取自 schema 本身，不靠别名清单再抄一遍。 */
function isNoArgumentSchema(schema: z.ZodTypeAny): boolean {
  const def = schema._def as { typeName?: string; shape?: () => z.ZodRawShape };
  if (def.typeName !== z.ZodFirstPartyTypeKind.ZodObject || !def.shape) return false;
  return Object.keys(def.shape()).length === 0;
}
