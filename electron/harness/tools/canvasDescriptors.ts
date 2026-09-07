import { z } from "zod";
import { CANVAS_READ_CAPABILITY } from "../../shared/agentCapabilities/canvasRead";
import { plannedEdgeSchema, plannedNodeSchema } from "../../shared/agentCapabilities/canvasWrite";

/** Pure Nomi-owned canvas metadata; confirmation and effects belong to the runtime adapter. */
export { canvasNodeKindSchema, plannedEdgeSchema, plannedNodeSchema } from "../../shared/agentCapabilities/canvasWrite";

// 分镜 / 站位 / 运镜的模型可见形状搬去了能力契约层（`shared/agentCapabilities/canvasModelShapes.ts`），
// 因为对外 MCP 与对内 agent 必须看同一份（方案 §3.6）。这里只 re-export，不留第二份定义。
import {
  cameraMoveParamsObjectSchema,
  stagingReferenceParamsSchema,
  storyboardPlanParamsSchema,
} from "../../shared/agentCapabilities/canvasModelShapes";

export { stagingReferenceParamsSchema, storyboardPlanParamsSchema };

type CameraMoveParams = z.infer<typeof cameraMoveParamsObjectSchema>;
type CameraMovePreset = NonNullable<CameraMoveParams["move"]>;

const CUSTOM_ONLY_CAMERA_MOVE =
  /甩镜|手持|无人机|穿越|照搬|参考视频|复合|连续运镜|whip[ -]?pan|handheld|drone|match (?:this|the) reference|compound|sequenced/i;
const EMPTY_CUSTOM_CAMERA_MOVE = /^(?:none|null|n\/?a|not applicable|无|没有|不适用)$/i;

const CAMERA_MOVE_PRESET_PATTERNS: ReadonlyArray<readonly [CameraMovePreset, RegExp]> = [
  ["dolly_zoom", /希区柯克|眩晕变焦|dolly[ -]?zoom|vertigo/i],
  ["orbit_left", /左环绕|逆时针环绕|orbit(?:ing)? left|counter[ -]?clockwise orbit/i],
  ["orbit_right", /右环绕|顺时针环绕|orbit(?:ing)? right|clockwise orbit/i],
  ["push_in", /推近|推进|向前推镜|镜头前移|dolly[ -]?in|push[ -]?in/i],
  ["pull_out", /拉远|向后拉镜|dolly[ -]?out|pull[ -]?out/i],
  ["crane_up", /升镜|升高镜头|crane up|boom up/i],
  ["crane_down", /降镜|降低镜头|crane down|boom down/i],
  ["track_left", /左横移|向左跟拍|track(?:ing)? left/i],
  ["track_right", /右横移|向右跟拍|track(?:ing)? right/i],
  ["arc_left", /左弧线|向左弧移|arc left/i],
  ["arc_right", /右弧线|向右弧移|arc right/i],
  ["zoom_in", /变焦推|镜头变焦放大|zoom in/i],
  ["zoom_out", /变焦拉|镜头变焦缩小|zoom out/i],
];

function inferSingleCameraMovePreset(description: string): CameraMovePreset | undefined {
  if (CUSTOM_ONLY_CAMERA_MOVE.test(description)) return undefined;
  const matches = CAMERA_MOVE_PRESET_PATTERNS.filter(([, pattern]) => pattern.test(description)).map(([move]) => move);
  const unique = [...new Set(matches)];
  return unique.length === 1 ? unique[0] : undefined;
}

/**
 * Tool models occasionally put an exact preset in customMove or retain the prior enum while
 * describing a new custom move. Normalize before confirmation/event logging: one recognizable
 * preset takes the deterministic 3D path; genuinely custom/compound intent takes the prompt path.
 */
export function normalizeCameraMoveParams(params: CameraMoveParams): CameraMoveParams {
  if (!params.customMove) return params;
  if (EMPTY_CUSTOM_CAMERA_MOVE.test(params.customMove)) {
    const { customMove: _emptyCustomMove, ...presetParams } = params;
    return presetParams;
  }
  const inferredPreset = inferSingleCameraMovePreset(params.customMove);
  const { move: _staleMove, customMove, ...shared } = params;
  return inferredPreset ? { ...shared, move: inferredPreset } : { ...shared, customMove };
}

export const cameraMoveParamsSchema = cameraMoveParamsObjectSchema.transform(normalizeCameraMoveParams);

export const canvasToolDescriptors = {
  [CANVAS_READ_CAPABILITY.aliases.pi]: {
    name: CANVAS_READ_CAPABILITY.aliases.pi,
    description: CANVAS_READ_CAPABILITY.projections.pi.description,
    parameters: CANVAS_READ_CAPABILITY.inputSchema,
  },
  propose_storyboard_plan: {
    name: "propose_storyboard_plan",
    description:
      "Produce a structured storyboard plan (cross-shot anchors + shots) for the user to review/edit in the creation area before anything lands on the canvas. Does not touch the canvas and costs nothing. Emit exactly one call.",
    parameters: storyboardPlanParamsSchema,
  },
  arrange_storyboard_to_timeline: {
    name: "arrange_storyboard_to_timeline",
    description:
      "Arrange one explicit storyboard node subset onto the timeline in stored shot order. Read the canvas first and pass nodeIds from exactly one storyboard design; never mix designs. Ungenerated videos fall back to their keyframe image and clips append to the end.",
    parameters: z.object({
      nodeIds: z.array(z.string().min(1)).min(1).max(48),
    }),
  },
  create_staging_reference: {
    name: "create_staging_reference",
    description:
      "Create a 3D staging reference image locking character blocking + poses + camera for a shot (auto-connects to shotClientId as composition_ref). Use when ≥2 characters have a spatial relationship, a specific physical action is needed, or a director-specified camera angle. Not for simple single talking-head shots. Tiered rule: the vocab (characters/layout/pose/camera) is the precise first choice (3D staging render); if the blocking is OUTSIDE the vocab, do NOT force a wrong value — use customBlocking (prompt-guided into the keyframe image prompt, honest about lower fidelity).",
    parameters: stagingReferenceParamsSchema,
  },
  create_camera_move: {
    name: "create_camera_move",
    description:
      "Create a 3D camera-move reference clip locking a shot's camera motion (orbit / push-in / pull-out / crane / track / arc / dolly-zoom), fed to the shot's VIDEO node as a reference video (or degraded to a camera-move prompt directive on models without a video_ref slot). Call ONLY when a shot has a specific camera-move intent; do NOT call for a static / locked-off shot or a simple talking-head. Tiered rule: the `move` enum is the precise first choice (3D camera-path render); if the intended move is OUTSIDE the enum (whip-pan, handheld follow, compound/sequenced moves, 'match this reference video'), do NOT force a wrong enum — leave move empty and use customMove (prompt-guided into the video prompt, honest about lower fidelity). shotClientId MUST point to the shot's VIDEO node — not its keyframe image; if none exists yet, create the video node first.",
    parameters: cameraMoveParamsSchema,
  },
} as const;

export type CanvasToolName = keyof typeof canvasToolDescriptors;
export const canvasToolNames = Object.keys(canvasToolDescriptors) as CanvasToolName[];

export type PlannedNode = z.infer<typeof plannedNodeSchema>;
export type PlannedEdge = z.infer<typeof plannedEdgeSchema>;
