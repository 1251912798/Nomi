// 导入视频「可播放归一化」：所有输入路径共享同一个探测、容器选择和有界 ffmpeg owner。
//
// 这里是「任意外来视频 → 可预览资产」；时间轴交付 MP4 仍由 export 域负责。导入失败继续回退
// 原样文件，但取消是独立的生命周期结果：取消会杀掉子进程并清理半成品，不把半成品发布成资产。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveFfmpegPath } from "../export/ffmpegRunner";
import { probeMediaMetadata, runBoundedProcess, BoundedProcessError, type MediaProbeMetadata } from "../export/mediaProbe";
import { logWarn } from "../logging/logger";
import { playableVideoCodecs } from "./videoPlaybackSupport";

// Chromium 跨平台稳解的安全容器与音频集合。视频 codec 仍由本机探测决定。
const PLAYABLE_CONTAINER_EXTS = new Set(["mp4", "m4v", "mov", "webm", "ogg", "ogv"]);
const PLAYABLE_AUDIO_CODECS = new Set(["aac", "mp3", "opus", "vorbis", "flac"]);

/** 该视频要不要归一化。返回原因串（记进资产 meta / 日志），null = 本就可播。 */
export function videoNeedsPlayabilityTranscode(
  fileName: string,
  probe: MediaProbeMetadata,
  playableCodecs: ReadonlySet<string> = playableVideoCodecs(),
): string | null {
  const ext = path.extname(String(fileName || "")).replace(/^\./, "").toLowerCase();
  const videoCodec = (probe.videoCodec || "").toLowerCase();
  if (!playableCodecs.has(videoCodec)) return `codec:${videoCodec || "unknown"}`;
  if (!PLAYABLE_CONTAINER_EXTS.has(ext)) return `container:${ext || "unknown"}`;
  if (probe.hasAudio) {
    const audioCodec = (probe.audioCodec || "").toLowerCase();
    if (!PLAYABLE_AUDIO_CODECS.has(audioCodec)) return `audio:${audioCodec || "unknown"}`;
  }
  return null;
}

export function maxTranscodeThreads(cpuCount = os.cpus().length): number {
  return Math.max(1, Math.floor(cpuCount) - 2);
}

/** 整段重编码参数（H.264+AAC MP4，faststart 便于流式预览）。 */
export function transcodeArgsForPlayableMp4(inputPath: string, outputPath: string, threads = maxTranscodeThreads()): string[] {
  return [
    "-y",
    "-i", inputPath,
    "-threads", String(Math.max(1, Math.floor(threads))),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outputPath,
  ];
}

/** 视频 codec 已可播时只换容器；只有不兼容音轨才转 AAC。 */
export function remuxArgsForPlayableMp4(inputPath: string, outputPath: string, audioCopy: boolean): string[] {
  return [
    "-y",
    "-i", inputPath,
    "-map", "0:v:0",
    "-map", "0:a?",
    "-c:v", "copy",
    "-c:a", audioCopy ? "copy" : "aac",
    "-movflags", "+faststart",
    outputPath,
  ];
}

export function playableMp4FileName(fileName: string): string {
  const base = path.basename(String(fileName || "video"), path.extname(String(fileName || "")));
  return `${base || "video"}.mp4`;
}

type VideoNormalizeOptions = {
  signal?: AbortSignal;
  onProgress?: (ratio: number) => void;
  playableCodecs?: ReadonlySet<string>;
};

export function isVideoNormalizationCancelled(error: unknown): boolean {
  return error instanceof BoundedProcessError && error.code === "cancelled";
}

function ratioForProgress(outTimeMs: number | undefined, durationSeconds: number | undefined): number {
  if (!Number.isFinite(outTimeMs) || !Number.isFinite(durationSeconds) || !(durationSeconds! > 0)) return 0;
  return Math.max(0, Math.min(1, outTimeMs! / (durationSeconds! * 1000)));
}

/** 磁盘文件 → 探测 + 只换容器或整段重编码。唯一的导入 ffmpeg 启动口。 */
export async function transcodeFileToPlayableMp4IfNeeded(
  inputPath: string,
  fileName: string,
  outputDir = path.dirname(inputPath),
  options: VideoNormalizeOptions = {},
): Promise<{ outputPath: string; reason: string } | null> {
  let reason: string | null;
  let probe: MediaProbeMetadata;
  try {
    probe = await probeMediaMetadata(inputPath, options.signal ? { signal: options.signal } : {});
    reason = videoNeedsPlayabilityTranscode(fileName, probe, options.playableCodecs ?? playableVideoCodecs());
  } catch (error) {
    if (options.signal?.aborted || isVideoNormalizationCancelled(error)) throw error;
    reason = "probe_failed";
    probe = { kind: "video", hasAudio: false };
  }
  if (!reason) return null;

  const outputPath = path.join(
    outputDir,
    `${path.basename(inputPath, path.extname(inputPath))}-playable.mp4`,
  );
  const needsVideoEncode = reason.startsWith("codec:") || reason === "probe_failed";
  const audioCopy = !probe.hasAudio || PLAYABLE_AUDIO_CODECS.has((probe.audioCodec || "").toLowerCase());
  const args = needsVideoEncode
    ? transcodeArgsForPlayableMp4(inputPath, outputPath)
    : remuxArgsForPlayableMp4(inputPath, outputPath, audioCopy);
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) throw new Error("ffmpeg executable could not be resolved");

  let completed = false;
  try {
    options.onProgress?.(0);
    const result = await runBoundedProcess(ffmpegPath, ["-hide_banner", "-nostats", "-progress", "pipe:2", ...args], {
      timeoutMs: 30 * 60 * 1000,
      maxStdoutBytes: 64 * 1024,
      maxStderrBytes: 128 * 1024,
      lowPriority: needsVideoEncode,
      ...(options.signal ? { signal: options.signal } : {}),
      onProgress: (progress) => options.onProgress?.(ratioForProgress(progress.outTimeMs, probe.durationSeconds)),
    });
    if (result.code !== 0) throw new Error(result.stderr.trim().split("\n").slice(-3).join(" ") || `ffmpeg exited with code ${result.code}`);
    if (options.signal?.aborted) throw new BoundedProcessError("cancelled");
    const stat = fs.statSync(outputPath);
    if (!stat.isFile() || stat.size <= 0) throw new Error("transcoded mp4 is empty");
    options.onProgress?.(1);
    completed = true;
    return { outputPath, reason };
  } catch (error) {
    fs.rmSync(outputPath, { force: true });
    throw error;
  } finally {
    if (!completed && options.signal?.aborted) fs.rmSync(outputPath, { force: true });
  }
}

export type NormalizedVideoImport = {
  bytes: Buffer;
  fileName: string;
  contentType: string;
  /** 非 null = 已归一化，值为原因（codec:hevc / container:mkv / audio:ac3 / probe_failed）。 */
  playbackNormalizedFrom: string | null;
};

/** 字节流导入的归一化入口；失败回退原字节，取消则沿信号抛出并清理临时目录。 */
export async function ensurePlayableVideoBytes(
  bytes: Buffer,
  fileName: string,
  contentType: string,
  options: VideoNormalizeOptions = {},
): Promise<NormalizedVideoImport> {
  const passthrough: NormalizedVideoImport = { bytes, fileName, contentType, playbackNormalizedFrom: null };
  let tempDir = "";
  try {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-video-import-"));
    const ext = path.extname(String(fileName || "")) || ".bin";
    const inputPath = path.join(tempDir, `source${ext}`);
    fs.writeFileSync(inputPath, bytes);
    const transcoded = await transcodeFileToPlayableMp4IfNeeded(inputPath, fileName, tempDir, options);
    if (!transcoded) return passthrough;
    return {
      bytes: fs.readFileSync(transcoded.outputPath),
      fileName: playableMp4FileName(fileName),
      contentType: "video/mp4",
      playbackNormalizedFrom: transcoded.reason,
    };
  } catch (error) {
    if (options.signal?.aborted || isVideoNormalizationCancelled(error)) throw error;
    logWarn("assets", "video-normalize-failed-import-original-bytes", undefined, error);
    return passthrough;
  } finally {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
