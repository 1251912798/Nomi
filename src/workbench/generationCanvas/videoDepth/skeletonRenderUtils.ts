/**
 * 深度视频节点 —— 骨架叠加绘制（纯函数，不碰 DOM 全局）。
 *
 * 把 MediaPipe Pose 的 33 点骨架（1–4 人）画到调用方持有的 2D 上下文上。
 * 样式取共享契约里的固定值（`VIDEO_DEPTH_FIXED_SKELETON`）——界面不暴露这三个旋钮，
 * 且 docs/research/2026-09-07-motion-ref-raw-vs-depth.md 那次真实 A/B 用的就是这一组，
 * 改动会让那份实测失去可比性。
 *
 * 上下文用**结构类型**声明（不是 `CanvasRenderingContext2D`），所以 node 环境的单测
 * 不需要真 canvas 就能逐笔断言画了什么。
 */
import type { VideoDepthSkeletonStyle } from '../../../../electron/shared/canvas/videoDepth'

/**
 * MediaPipe Pose 官方 `POSE_CONNECTIONS`：33 个关键点（合法下标 0..32）、**35 条边**。
 *
 * 这里逐条对着官方拓扑写死，并由同目录测试断言「边数 = 35」且「所有下标 ≤ 32」——
 * PR #572 那版含一条 `[31, 33]`，下标 33 在 33 点模型里根本不存在（越界，永远画不出来），
 * 而注释写 35 条、实际 36 条，两边都没人发现。越界边只会静默少画一笔，不会抛错，
 * 所以它必须由**测试**而不是人眼来守。
 */
export const POSE_CONNECTIONS_33: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20], [11, 23],
  [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28], [27, 29],
  [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
];

/** Fixed v1 skeleton color — bright, visible on both grayscale depth and black backgrounds. */
export const VIDEO_DEPTH_SKELETON_COLOR = "#d9ff8f";

export type VideoDepthPoseLandmark = { x: number; y: number; visibility?: number };
export type VideoDepthPosePerson = ReadonlyArray<VideoDepthPoseLandmark>;

/** Minimal structural surface of the 2D canvas context this renderer needs (test-friendly). */
export type PoseCanvas2D = {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
};

export type VideoDepthPoseOverlayOptions = {
  widthPx: number;
  heightPx: number;
  style: VideoDepthSkeletonStyle;
};

function visiblePoint(lm: VideoDepthPoseLandmark, confidence: number): boolean {
  if (!Number.isFinite(lm.x) || !Number.isFinite(lm.y)) return false;
  return (lm.visibility ?? 1) >= confidence;
}

/**
 * Draw one skeleton person.
 * landmark coordinates are normalized 0..1; they are scaled to widthPx/heightPx.
 */
function drawPerson(
  ctx: PoseCanvas2D,
  person: VideoDepthPosePerson,
  opts: VideoDepthPoseOverlayOptions,
): void {
  const { widthPx, heightPx, style } = opts;
  const visible = person.map((lm) => visiblePoint(lm, style.confidence));

  ctx.strokeStyle = VIDEO_DEPTH_SKELETON_COLOR;
  ctx.fillStyle = VIDEO_DEPTH_SKELETON_COLOR;
  ctx.lineWidth = style.lineWidth;

  for (const [a, b] of POSE_CONNECTIONS_33) {
    const pa = person[a];
    const pb = person[b];
    if (!pa || !pb || !visible[a] || !visible[b]) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * widthPx, pa.y * heightPx);
    ctx.lineTo(pb.x * widthPx, pb.y * heightPx);
    ctx.stroke();
  }

  for (let i = 0; i < person.length; i++) {
    const lm = person[i];
    if (!lm || !visible[i]) continue;
    ctx.beginPath();
    ctx.arc(lm.x * widthPx, lm.y * heightPx, style.jointRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw zero or more skeleton people (multi-person supported, v1 maxPeople enforced upstream). */
export function renderPoseOverlay(
  ctx: PoseCanvas2D,
  persons: ReadonlyArray<VideoDepthPosePerson>,
  opts: VideoDepthPoseOverlayOptions,
): void {
  for (const person of persons) {
    if (person.length > 0) drawPerson(ctx, person, opts);
  }
}
