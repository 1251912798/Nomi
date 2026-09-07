/**
 * 深度视频节点 —— ffmpeg 命令行构造（纯函数）。
 *
 * 只造 argv，不 spawn。所有分支因此都能单测；真正 spawn 的地方只有 depthVideoJob.ts
 * （与 framesToVideo.ts 的分工一致）。
 *
 * ── 为什么合成端读 stdin 而不是读一个 .raw 文件 ────────────────────────────────
 * 逐帧裸像素展开会很大（1080p rgb24 = 6.2MB/帧）。先落 `.raw` 再喂 ffmpeg 意味着
 * 一次处理要在磁盘上摊开整段视频的裸像素——`original` 档跑 60 秒就是十几 GB，
 * 而这些字节的唯一去处就是紧接着的那次编码。把帧**直接 pipe 进 ffmpeg stdin**
 * 让中间态恒等于「一批帧」，磁盘占用与片长无关：这不是给上限打补丁，是让上限不存在。
 * （剩下的仍然是**时间**上限，由 electron/shared/canvas/videoDepth.ts 的预算门在开跑前判。）
 */
import type { VideoDepthRawPixelFormat } from "../shared/canvas/videoDepth";

/** 抽帧文件名模板：4 位序号 + .jpg，与 `buildExtractFramesArgs` 的 pattern 对称。 */
export const VIDEO_DEPTH_FRAME_PATTERN = "f_%04d.jpg";

export function videoDepthFrameFileName(oneBasedIndex: number): string {
  return `f_${String(oneBasedIndex).padStart(4, "0")}.jpg`;
}

/**
 * 按裁剪窗口 + 目标尺寸 + 目标帧率抽帧成 JPEG 序列。
 *
 * `-ss` 放在 `-i` **之前**（输入端 seek，关键帧跳转，长片上快一个数量级）；
 * `-t` 用窗口时长而不是 `-to`，因为输入端 seek 之后时间轴已经归零，`-to` 会指向错的位置。
 */
export function buildExtractFramesArgs(opts: {
  sourcePath: string;
  startSeconds: number;
  durationSeconds: number;
  fps: number;
  outWidth: number;
  outHeight: number;
  outDir: string;
}): string[] {
  return [
    "-y",
    "-ss",
    String(opts.startSeconds),
    "-t",
    String(opts.durationSeconds),
    "-i",
    opts.sourcePath,
    "-vf",
    `fps=${opts.fps},scale=${opts.outWidth}:${opts.outHeight}:flags=bicubic`,
    "-q:v",
    "2",
    `${opts.outDir}/${VIDEO_DEPTH_FRAME_PATTERN}`,
  ];
}

/** 从 stdin 读裸帧流，编成 H.264 mp4。 */
export function buildRawStdinToMp4Args(opts: {
  outWidth: number;
  outHeight: number;
  fps: number;
  pixelFormat: VideoDepthRawPixelFormat;
  outMp4: string;
}): string[] {
  return [
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    opts.pixelFormat,
    "-s",
    `${opts.outWidth}x${opts.outHeight}`,
    "-r",
    String(opts.fps),
    "-i",
    "pipe:0",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    // 深度图是给下游模型看的结构信号：yuv420p 是所有播放器/上传通道都吃得下的最小公分母。
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    opts.outMp4,
  ];
}

/** 读源视频的尺寸与时长（ffprobe，单行 JSON）。 */
export function buildProbeArgs(sourcePath: string): string[] {
  return [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:format=duration",
    "-of",
    "json",
    sourcePath,
  ];
}

export type VideoDepthProbeResult = { width: number; height: number; durationSeconds: number };

/** 解析 `buildProbeArgs` 的输出。缺任何一项 = 返回 null（fail-closed，不猜默认值）。 */
export function parseProbeOutput(stdout: string): VideoDepthProbeResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const streams = (parsed as { streams?: unknown }).streams;
  const format = (parsed as { format?: unknown }).format;
  const stream = Array.isArray(streams) ? (streams[0] as { width?: unknown; height?: unknown } | undefined) : undefined;
  const durationRaw = typeof format === "object" && format !== null ? (format as { duration?: unknown }).duration : undefined;
  const width = typeof stream?.width === "number" ? stream.width : NaN;
  const height = typeof stream?.height === "number" ? stream.height : NaN;
  const durationSeconds = typeof durationRaw === "string" ? Number.parseFloat(durationRaw) : NaN;
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(durationSeconds)) return null;
  if (width <= 0 || height <= 0 || durationSeconds <= 0) return null;
  return { width, height, durationSeconds };
}
