// `canvas.read` / `canvas.write` 的模型可见描述符（说明书那一半，两个 profile 共用）。
//
// ── 这一族是阶段 2 全部工作的靶心 ──
//
// `canvas.write` 是今天最贵的那扇门，真实成功率 **0/18**（#547 §3.2）。三条互不排斥的成因，
// 本文件把三条一起拆掉，因为少任何一刀 0/18 都还在：
//
//   ① **一个工具塞 9 个分支**。模型要在参数里做第二次选择，而拒收回执是 9 个分支一起吐出
//      的 8 行互不标记的诉求，其中只有 1 行是真的。
//      → 按语义拆成三个工具（`canvasWrite.ts` 的三个 sub-union），模型选工具那一次判断变简单。
//   ② **两个字节级相同的工具**（`nomi_canvas_plan` / `nomi_canvas_edit`，各 8238 B）。
//      真机序列 `plan→edit→edit→edit→plan→edit→plan` = 在两枚一模一样的硬币间抛。
//      → 这里根本没有这两个名字：三个工具、三份互不相同的 schema。
//   ③ **根级 `anyOf` 在部分供应商上被静默丢掉**（G-01）。拆成三个工具**治不了这一条**——
//      拆完每个仍然是根级 union。
//      → `flattenDiscriminatedUnion` 把每一组派生成根是 object 的扁平 schema。
//
// 外加一条 #547 点名、而拆分与扁平化都治不了的：**分镜的 `anchors`/`shots` 是
// 「由任意对象组成的数组」**。模型要写 24 行、25 个字段，而 schema 一个字段名都没说。
// 那份 typed 形状其实一直存在，只是曾经住在旧通路的工具表里（`canvasDescriptors.ts`，已删）——
// 阶段 2 把它搬进能力契约层（`canvasModelShapes.ts`）成为唯一 owner，这里 `.extend()`
// 覆盖掉契约上那两个 `z.record(z.unknown())` 字段。**不是重写，是替换掉弱的那一份。**
//
// 阶段 5a：这份说明书从 `electron/agentLane/laneCanvasTools.ts` 搬到能力契约旁边——
// 对外 MCP 的 `nomi_canvas_edit` 从今天起读的是同一份，那三个 typed 形状因此第一次
// 也到了外部宿主眼前（以前它拿到的是契约上那两个 `z.record(z.unknown())`）。
import { z } from "zod";

import {
  cameraMoveParamsObjectSchema,
  STORYBOARD_MODEL_GUIDELINES, STAGING_MODEL_GUIDELINES, CAMERA_MOVE_MODEL_GUIDELINES,
  stagingReferenceParamsSchema,
  storyboardPlanParamsSchema,
} from "./canvasModelShapes";
import {
  canvasNodeWriteInputSchema, CANVAS_NODE_PROMPT_GUIDELINES,
  canvasWriteCrossFieldRefine,
  shotReferenceWriteInputUnion,
  storyboardPlanActionInputSchema,
  storyboardWriteInputUnion,
} from "./canvasWrite";
import { flattenDiscriminatedUnion } from "./flatModelInput";
import { modelArgumentTolerance, noArgumentTolerance } from "./modelArgumentTolerance";
import {
  MODEL_TOOL_READ_TIMEOUT_MS,
  MODEL_TOOL_WRITE_TIMEOUT_MS,
  NO_ARGUMENTS_SCHEMA,
  type ModelFacingToolSpec,
} from "./modelFacingTools";
/**
 * 通道③ · 画布这一族共享的纪律，**只写一次**。
 *
 * 第一条不是凑数的：真机实测模型给 `modelKey` 编了一个 `"seedance"`（`canvasWrite.ts:43`
 * 当时是裸 `z.string()`，无枚举无说明）。「值必须来自目录」这件事没法用 schema 表达
 * （目录是运行时的），只能用一句话说清——而这句话属于整族，不属于某一个工具。
 */
const CANVAS_GUIDELINES = Object.freeze([
  "Read the canvas before you change it: node ids, shot numbers and model keys all come from what is actually there.",
  "Never invent a modelKey, vendor or nodeId. Use the exact values returned by nomi_canvas_read or listed in the user's available-models list; leave the field out when you are unsure and the system fills in a default.",
  "Every canvas write is a reversible proposal the user still has to accept — describe what you are proposing in your reply rather than claiming it is already done.",
]);

/**
 * 画布这一族的副作用声明（第 ⑨ 维）。
 *
 * `reversal: "proposal"` 不是修辞：画布写入落的是一份**提案**，用户还要在面板上点接受——
 * 这正是 `CANVAS_GUIDELINES` 第三条要模型「别宣称已经改好了」的那件事。同一个事实过去
 * 只活在那句散文里，现在它是机器可读的，阶段 3 的闸按它决定要不要停下来问用户。
 */
const CANVAS_READ_EFFECTS = Object.freeze({ mutates: false, billable: false, reversal: "none" } as const);
const CANVAS_WRITE_EFFECTS = Object.freeze({ mutates: true, billable: false, reversal: "proposal" } as const);

/** 画布读走一次内存投影；画布写要落到项目文件，所以走写类预算。 */
const CANVAS_READ_EXECUTION = Object.freeze({ timeoutMs: MODEL_TOOL_READ_TIMEOUT_MS } as const);
const CANVAS_WRITE_EXECUTION = Object.freeze({ timeoutMs: MODEL_TOOL_WRITE_TIMEOUT_MS } as const);

/**
 * 分镜那一支：把契约里两个 `z.record(z.unknown())` 换成 typed 形状。
 *
 * `.extend()` 只覆盖这两个字段，`operation`/`title` 以及未来新增的字段都还是从契约派生的
 * ——不是抄一份新的分支定义。抄一份的代价是：下次给 `propose_storyboard_plan` 加字段时，
 * 两处都要记得改，漏掉的那处不会报错，只会让模型看不见那个字段。
 */
const storyboardPlanModelBranch = storyboardPlanActionInputSchema.extend({
  anchors: storyboardPlanParamsSchema.shape.anchors,
  shots: storyboardPlanParamsSchema.shape.shots,
});

// 分组是从 `.options` 拼出来的裸 union，**不会继承**契约外层的 `superRefine`——所以跨字段
// 约束在这里再挂一次，用的是同一个函数（`canvasWriteCrossFieldRefine`，唯一 owner）。
const storyboardModelUnion = z.discriminatedUnion("operation", [
  storyboardPlanModelBranch as unknown as z.ZodDiscriminatedUnionOption<"operation">,
  ...storyboardWriteInputUnion.options.filter(
    (option) => option.shape.operation.value !== "propose_storyboard_plan",
  ) as unknown as z.ZodDiscriminatedUnionOption<"operation">[],
]).superRefine(canvasWriteCrossFieldRefine);

/**
 * 站位/运镜那两支：契约上这些字段全是 `z.string()` 或 `z.record(z.unknown())`——
 * 「随便填一个词」。而 typed 版本（词表 enum + 每个值的含义）一直存在，只是住在旧通路的
 * 工具表里。这里把弱的那一份替换掉。
 *
 * `sceneTemplate` / `props` 两个字段**两支共用同一份 typed 形状**：它们是同一个领域概念
 * （灰模布景与灰模道具，走渲染层同一个 builder）。共用不是为了让扁平化通过——反过来说，
 * 扁平化的形状冲突检测正是发现「同一个概念在两个分支上被声明成两种东西」的地方。
 */
const stagingModelBranch = shotReferenceWriteInputUnion.options[0].extend({
  characters: stagingReferenceParamsSchema.shape.characters,
  layout: stagingReferenceParamsSchema.shape.layout,
  camera: stagingReferenceParamsSchema.shape.camera,
  environment: stagingReferenceParamsSchema.shape.environment,
  crowd: stagingReferenceParamsSchema.shape.crowd,
  sceneTemplate: stagingReferenceParamsSchema.shape.sceneTemplate,
  props: stagingReferenceParamsSchema.shape.props,
  customBlocking: stagingReferenceParamsSchema.shape.customBlocking,
});

const cameraMoveModelBranch = shotReferenceWriteInputUnion.options[1].extend({
  move: cameraMoveParamsObjectSchema.shape.move,
  customMove: cameraMoveParamsObjectSchema.shape.customMove,
  speed: cameraMoveParamsObjectSchema.shape.speed,
  shot: cameraMoveParamsObjectSchema.shape.shot,
  subjectPose: cameraMoveParamsObjectSchema.shape.subjectPose,
  sceneTemplate: stagingReferenceParamsSchema.shape.sceneTemplate,
  props: stagingReferenceParamsSchema.shape.props,
});

type OperationBranch = z.ZodDiscriminatedUnionOption<"operation">;

const shotReferenceModelUnion = z.discriminatedUnion("operation", [
  stagingModelBranch as unknown as OperationBranch,
  cameraMoveModelBranch as unknown as OperationBranch,
]).superRefine(canvasWriteCrossFieldRefine);

interface CanvasWriteToolShape {
  readonly name: string;
  readonly union: z.ZodTypeAny;
  readonly description: string;
  readonly promptSnippet: string;
  readonly promptGuidelines: readonly string[];
  readonly examples: ModelFacingToolSpec["examples"];
  /** 声明成数组/对象的字段名，交给共享容忍器（B/C 族）。 */
  readonly arrayFields: readonly string[];
  readonly objectFields: readonly string[];
}

const CANVAS_WRITE_TOOLS: readonly CanvasWriteToolShape[] = [
  {
    name: "nomi_canvas_write", union: canvasNodeWriteInputSchema,
    description: "Create, connect, retitle or tidy generation-canvas nodes in one reversible batch. The operation selects which fields apply; unrelated fields are rejected.",
    promptSnippet: "create, connect, retitle or tidy canvas nodes.",
    promptGuidelines: ["Every call is one reversible proposal the user still has to accept; send a whole batch in one call rather than one node at a time.", ...CANVAS_NODE_PROMPT_GUIDELINES],
    examples: [{ when: "Create a shot:", arguments: { operation: "create_canvas_nodes", summary: "Opening shot", nodes: [{ clientId: "s1", kind: "keyframe", title: "Opening", prompt: "Sunrise" }] } }],
    arrayFields: ["nodes", "edges"], objectFields: [],
  },
  {
    name: "nomi_storyboard_write", union: storyboardModelUnion,
    description: "Save a whole storyboard, patch selected shot rows, or arrange existing shots on the timeline. Shots reference recurring character, scene, prop and style anchors by id.",
    promptSnippet: "save a storyboard, patch rows or arrange shots on the timeline.",
    promptGuidelines: ["propose_storyboard_plan replaces the whole plan; patch_shots changes named rows only; arrange_storyboard_to_timeline lays existing shot nodes in story order.", ...STORYBOARD_MODEL_GUIDELINES],
    examples: [{ when: "Save one shot:", arguments: { operation: "propose_storyboard_plan", title: "Opening", anchors: [], shots: [{ index: 1, shotKind: "image", durationSec: 0, anchorIds: [], prompt: "Sunrise" }] } }],
    arrayFields: ["anchors", "shots", "nodeIds"], objectFields: ["select", "patch"],
  },
  {
    name: "nomi_shot_reference_write", union: shotReferenceModelUnion,
    description: "Attach a staging or camera-motion reference to one shot. Vocabulary inputs render a gray 3D reference; free-text composition or motion inputs update its prompt.",
    promptSnippet: "attach staging or camera-motion references to a shot.",
    promptGuidelines: ["Reference tools do not generate the shot itself. Staging requires characters or customBlocking; motion requires move or customMove. Use the vocabulary only when it matches the intent.", ...STAGING_MODEL_GUIDELINES, ...CAMERA_MOVE_MODEL_GUIDELINES],
    examples: [{ when: "Push in:", arguments: { operation: "create_camera_move", shotClientId: "s1", move: "push_in" } }],
    arrayFields: ["characters", "props"], objectFields: ["camera", "crowd"],
  },
];

const CANVAS_READ_DESCRIPTION = [
  "Read the current generation canvas: every node with its id, kind, title, prompt, status and position, plus the reference edges between them and any groups.",
  "Takes no arguments. Call it before any canvas write, because node ids, shot numbers and existing prompts all come from here — inventing an id is the single most common way a canvas edit fails.",
  "Node ids returned here are the exact strings to pass as `nodeId` / `sourceClientId` / `targetClientId`.",
].join(" ");

/** 说明书那一半。门岗与系统提示词渲染只要这个，不需要任何领域 port。 */
export function canvasModelToolSpecs(): ModelFacingToolSpec[] {
  const read: ModelFacingToolSpec = {
    contractId: "canvas.read",
    name: "nomi_canvas_read",
    description: CANVAS_READ_DESCRIPTION,
    promptSnippet: "read every node, edge and group currently on the generation canvas.",
    promptGuidelines: CANVAS_GUIDELINES,
    effects: CANVAS_READ_EFFECTS,
    execution: CANVAS_READ_EXECUTION,
    schema: NO_ARGUMENTS_SCHEMA,
    examples: [{ when: "Always call it with no arguments:", arguments: {} }],
    prepareArguments: noArgumentTolerance,
  };
  const writes = CANVAS_WRITE_TOOLS.map((tool): ModelFacingToolSpec => ({
    contractId: "canvas.write",
    name: tool.name,
    description: tool.description,
    promptSnippet: tool.promptSnippet,
    promptGuidelines: [...CANVAS_GUIDELINES, ...tool.promptGuidelines],
    effects: CANVAS_WRITE_EFFECTS,
    execution: CANVAS_WRITE_EXECUTION,
    // 派生，不是手写：判别字段降成 `z.enum`、分支专属字段设为 optional、跨字段约束仍由
    // 原 union 裁决。手抄一份扁平版就是第二个真相源（理由见 `flatModelInput.ts` 头部）。
    schema: flattenDiscriminatedUnion(tool.union, { name: tool.name }),
    examples: tool.examples,
    // `operation` 本来就在参数里，别名没有替模型定死任何字段——所以 `aliasBoundInput` 空着，
    // MCP profile 靠三份 schema 各自的 `operation` 枚举把调用分派回正确的别名。
    prepareArguments: modelArgumentTolerance({
      arrayFields: tool.arrayFields,
      objectFields: tool.objectFields,
    }),
  }));
  return [read, ...writes];
}
