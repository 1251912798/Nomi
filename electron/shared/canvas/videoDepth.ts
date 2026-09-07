/**
 * 深度视频处理节点 —— 跨进程契约（唯一 owner）。
 *
 * 纯数据 + zod 解析，渲染层（节点设置 UI / 编排客户端）与主进程（job 执行）共用。
 * 不 import Electron / React / fs / i18n / provider，遵循 electron/shared/canvas/ 的既有约定。
 *
 * ── 用户价值（2026-09-07 用户原话）────────────────────────────────────────────────
 * 「给一段参考视频（如 30 秒打斗镜头）→ 出深度视频 → 当动作参考喂视频模型、只换人物。」
 * 产物是**画布上一个普通视频资产**：能拖进任意模型的参考槽，也能直接导出。
 * 本节点不认识任何供应商、不做特殊接线（P4）。
 *
 * ── 范围（2026-09-07 用户拍板的三个取舍）──────────────────────────────────────────
 * ① 权重不进安装包，首次用节点时下载（约 50MB），带进度；
 * ② 只做 Depth Anything V2 **Small**（Apache-2.0）——Base 是 CC-BY-NC，商用不干净，不带；
 * ③ 默认按 **518px** 推理（DA2 的原生训练分辨率，比全分辨率快约 3 倍；产物是给模型看的，
 *    不是给人看的），另给「全分辨率」选项。
 *
 * ── 相对 PR #572 主动砍掉的字段（P1：不留没有消费方的半成品）────────────────────
 * `depthModel`（只剩 small，单值枚举等于噪声）、`poseModel`（只剩 full）、
 * `depthStyle`（只剩 grayscale）、`exportPoseJson`（Nomi 侧无任何消费方，
 * 见 docs/research/2026-09-07-motion-ref-raw-vs-depth.md §5）。
 * 砍掉 = 从 schema 里删掉，不是留着不解析——留着就是给「顺手做了」发返场票。
 */
import { z } from "zod";

/** 三种输出模式（用户拍板）：纯深度 / 深度+骨架 / 原片+骨架。 */
export const VIDEO_DEPTH_MODES = ["depth", "depth_skeleton", "original_skeleton"] as const;

/**
 * 分辨率档。518 = DA2 ViT-S 的原生训练输入（14×37），跑得最快、结构最准；
 * `original` 保留给「我要拿它当成片素材看」的场景，界面上必须标清楚会慢很多。
 */
export const VIDEO_DEPTH_RESOLUTIONS = [518, "original"] as const;
export const VIDEO_DEPTH_FPS = [8, 12, 15, 24, 30, 60] as const;
export const VIDEO_DEPTH_DEPTH_DIRECTIONS = ["nearWhite", "nearBlack"] as const;
export const VIDEO_DEPTH_SOURCE_KINDS = ["canvas-video-node", "canvas-asset-node"] as const;

const videoDepthFpsSchema = z.union([
  z.literal(8),
  z.literal(12),
  z.literal(15),
  z.literal(24),
  z.literal(30),
  z.literal(60),
]);

export const videoDepthSourceReferenceSchema = z
  .object({
    /** 画布上那个素材节点的 id——产物落回来时用它连线，也是「源没了」的判据。 */
    sourceNodeId: z.string().min(1),
    sourceUrl: z.string().min(1),
    title: z.string().min(1),
    durationSeconds: z.number().nonnegative().optional(),
    widthPx: z.number().int().positive().optional(),
    heightPx: z.number().int().positive().optional(),
    sourceKind: z.enum(VIDEO_DEPTH_SOURCE_KINDS),
  })
  .strict();

/**
 * 骨架样式在 v1 是**内部固定值**，界面不暴露（§1.5：控件预算给真正会调的东西）。
 * 取值与 depth.cards 默认一致，也是 docs/research/2026-09-07-motion-ref-raw-vs-depth.md
 * 那次真实 A/B 用的那一组，改动会让那份实测失去可比性。
 */
export const VIDEO_DEPTH_FIXED_SKELETON = {
  lineWidth: 3,
  jointRadius: 5,
  confidence: 0.35,
} as const;

export type VideoDepthSkeletonStyle = typeof VIDEO_DEPTH_FIXED_SKELETON;

export const videoDepthSettingsSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    sourceVideoRef: videoDepthSourceReferenceSchema.optional(),
    trimStartSeconds: z.number().nonnegative().default(0),
    /** 0 = 源末尾。 */
    trimEndSeconds: z.number().nonnegative().default(0),
    mode: z.enum(VIDEO_DEPTH_MODES).default("depth"),
    /** 骨架模式下最多识别几个人；纯深度模式无意义（界面据此隐藏）。 */
    maxPeople: z.number().int().min(1).max(4).default(1),
    maxResolution: z.union([z.literal(518), z.literal("original")]).default(518),
    processingFps: videoDepthFpsSchema.default(30),
    depthDirection: z.enum(VIDEO_DEPTH_DEPTH_DIRECTIONS).default("nearWhite"),
    temporalSmoothing: z.number().min(0).max(1).default(0.35),
    updatedAt: z.string().optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.trimEndSeconds !== 0 && s.trimEndSeconds <= s.trimStartSeconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "trimEndSeconds must be 0 (source end) or greater than trimStartSeconds",
        path: ["trimEndSeconds"],
      });
    }
  });

export type VideoDepthMode = (typeof VIDEO_DEPTH_MODES)[number];
export type VideoDepthResolution = (typeof VIDEO_DEPTH_RESOLUTIONS)[number];
export type VideoDepthFps = (typeof VIDEO_DEPTH_FPS)[number];
export type VideoDepthDepthDirection = (typeof VIDEO_DEPTH_DEPTH_DIRECTIONS)[number];
export type VideoDepthSourceReference = z.infer<typeof videoDepthSourceReferenceSchema>;
export type VideoDepthSettings = z.infer<typeof videoDepthSettingsSchema>;

/** 解析 + 回填默认值。范围外取值一律**拒绝**（返回 undefined），不静默降级。 */
export function parseVideoDepthSettings(input: unknown): VideoDepthSettings | undefined {
  const parsed = videoDepthSettingsSchema.safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

/** 规划时已知的源事实（来自 ffprobe，或画布素材节点自带的元数据）。 */
export type VideoDepthSourceFacts = {
  width?: number;
  height?: number;
  durationSeconds?: number;
};

/** 输出像素格式：纯深度是单通道灰度，带骨架的要彩色。 */
export type VideoDepthRawPixelFormat = "gray" | "rgb24";

export type VideoDepthProcessingPlan = {
  outWidth: number;
  outHeight: number;
  startSeconds: number;
  /** 源时长未知时保持 0（= 到末尾），job 在 ffprobe 之后再算一次。 */
  endSeconds: number;
  durationSeconds: number | null;
  totalFramesEstimate: number | null;
  pixelFormat: VideoDepthRawPixelFormat;
  /** 全部帧展开成裸像素的字节数——预算门岗与「预计耗时」共用同一个数。 */
  expectedRawBytes: number | null;
};

/** 纯深度不需要骨架，反之亦然；模式与模型需求的**唯一**判据。 */
export function modeNeedsDepth(mode: VideoDepthMode): boolean {
  return mode === "depth" || mode === "depth_skeleton";
}

export function modeNeedsPose(mode: VideoDepthMode): boolean {
  return mode === "depth_skeleton" || mode === "original_skeleton";
}

export function pixelFormatForMode(mode: VideoDepthMode): VideoDepthRawPixelFormat {
  return mode === "depth" ? "gray" : "rgb24";
}

export function rawBytesPerPixel(pixelFormat: VideoDepthRawPixelFormat): number {
  return pixelFormat === "gray" ? 1 : 3;
}

export function computeExpectedRawBytes(
  frameCount: number,
  outWidth: number,
  outHeight: number,
  pixelFormat: VideoDepthRawPixelFormat,
): number {
  return frameCount * outWidth * outHeight * rawBytesPerPixel(pixelFormat);
}

/** yuv420p 要求偶数边长。 */
function even(n: number): number {
  return Math.max(2, Math.floor(n / 2) * 2);
}

function scaleToLongestEdge(width: number, height: number, limit: number): { w: number; h: number } {
  const longest = Math.max(width, height);
  if (longest <= limit) return { w: even(width), h: even(height) };
  const k = limit / longest;
  return { w: even(Math.round(width * k)), h: even(Math.round(height * k)) };
}

/**
 * 裁剪窗口 + 输出尺寸 + 帧数/字节数估算。
 * 源尺寸/时长未知时**不编数字**：`totalFramesEstimate` / `expectedRawBytes` 为 null，
 * 界面据此显示「待测量」而不是一个假的预估（D4：缺口明着标）。
 */
export function deriveProcessingPlan(
  settings: VideoDepthSettings,
  source: VideoDepthSourceFacts,
): VideoDepthProcessingPlan {
  const startSeconds = settings.trimStartSeconds;
  const sourceDuration = source.durationSeconds ?? null;
  const endSeconds = settings.trimEndSeconds !== 0 ? settings.trimEndSeconds : (sourceDuration ?? 0);
  const clampedEnd = sourceDuration !== null ? Math.min(endSeconds, sourceDuration) : endSeconds;
  const durationSeconds = clampedEnd > startSeconds ? clampedEnd - startSeconds : null;

  const pixelFormat = pixelFormatForMode(settings.mode);
  const knownSize = source.width !== undefined && source.height !== undefined;
  let outWidth = 0;
  let outHeight = 0;
  if (knownSize) {
    if (settings.maxResolution === "original") {
      outWidth = even(source.width as number);
      outHeight = even(source.height as number);
    } else {
      ({ w: outWidth, h: outHeight } = scaleToLongestEdge(
        source.width as number,
        source.height as number,
        settings.maxResolution,
      ));
    }
  }

  const totalFramesEstimate = durationSeconds !== null ? Math.max(1, Math.round(durationSeconds * settings.processingFps)) : null;
  const expectedRawBytes =
    totalFramesEstimate !== null && knownSize
      ? computeExpectedRawBytes(totalFramesEstimate, outWidth, outHeight, pixelFormat)
      : null;

  return {
    outWidth,
    outHeight,
    startSeconds,
    endSeconds: clampedEnd,
    durationSeconds,
    totalFramesEstimate,
    pixelFormat,
    expectedRawBytes,
  };
}

/**
 * 裸像素预算上限。
 *
 * 为什么需要它：`original` + 长片会把中间流量推到 GB 级（1080p rgb24 = 6.2MB/帧，
 * 60s@30fps ≈ 11GB）。我们**不落中间 .raw 文件**（帧直接 pipe 进 ffmpeg stdin，
 * 见 depthVideoPipeline.ts），所以这不是磁盘风险；但它是**时间**风险的诚实度量：
 * 到这个量级时按 518 档也要跑上小时级，用户等不起，必须在开跑**之前**拦下来并告诉他
 * 拧哪个旋钮，而不是让他等半小时再发现。
 */
export const VIDEO_DEPTH_MAX_RAW_BYTES = 4 * 1024 * 1024 * 1024;

export type VideoDepthBudgetVerdict =
  | { ok: true }
  | { ok: false; reason: "unknown-source"; }
  | { ok: false; reason: "over-budget"; expectedRawBytes: number; limitBytes: number };

/** 开跑前的预算判定。源事实不全 = 不放行（fail-closed，不猜）。 */
export function checkVideoDepthBudget(plan: VideoDepthProcessingPlan): VideoDepthBudgetVerdict {
  if (plan.expectedRawBytes === null) return { ok: false, reason: "unknown-source" };
  if (plan.expectedRawBytes > VIDEO_DEPTH_MAX_RAW_BYTES) {
    return { ok: false, reason: "over-budget", expectedRawBytes: plan.expectedRawBytes, limitBytes: VIDEO_DEPTH_MAX_RAW_BYTES };
  }
  return { ok: true };
}
