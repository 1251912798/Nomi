// 导出前的素材探测——概念 export.asset-probe 的唯一写口（docs/engineering/concept-owners/export.asset-probe.json）。
//
// 一条不变量：进 ffmpeg 计划的每个视频 / 音频素材，都带着一份**确定的**探测结果（hasAudio 显式 true / false）；
// 拿不到就整次导出失败，停在编码之前。
//
// 为什么（docs/fixes/2026-10-24-export-probe-failure-silent-audio.root-cause.json）：旧实现在调用方
// `catch { 按无音频处理 }`——「没探到」和「探到了、真没声音」成了同一个值。成片少了这段的声音
// （全是这种素材时整片无声），导出却报成功；用户打开 MP4 才发现没声音，不知道是哪一段、该怎么办。
//
// 失败分两种，下一步不同：
//   · ffprobe 找不到 / 起不来（probe_unavailable）：能力不可用，不是哪一段的错——不点名素材，下一步是重新安装 Nomi；
//   · 这一个文件读不出（损坏 / 不完整 / 被删 / 超时，asset_unreadable）：点名文件，下一步是换掉用到它的片段或重新导入。
// 取消就是取消：探测途中 signal 中止，一律报 ExportCancelledError，不报「读不出」（ffprobe 被杀掉时自己也会以失败收场）。
//
// 只有图片可以不探测；其余任何媒体类型（包括以后新加的）都要拿到确定的探测结果才能进计划。
import path from "node:path";

import { desktopT } from "../desktopStrings";
import { logError } from "../logging/logger";
import type { NomiRenderAsset } from "./exportManifest";
import { ExportCancelledError } from "./ffmpegRunner";
import { MediaProbeError, probeMediaMetadata, type MediaProbeMetadata } from "./mediaProbe";

export type ExportAssetProbeFailure = "probe_unavailable" | "asset_unreadable";

export class ExportAssetProbeError extends Error {
  readonly code: ExportAssetProbeFailure;
  readonly assetId: string;
  readonly fileName: string;

  constructor(code: ExportAssetProbeFailure, asset: Readonly<{ assetId: string; fileName: string }>, cause: unknown) {
    super(
      code === "probe_unavailable"
        ? desktopT("export.probeUnavailable")
        : desktopT("export.assetUnreadable", { file: asset.fileName }),
    );
    this.name = "ExportAssetProbeError";
    this.code = code;
    this.assetId = asset.assetId;
    this.fileName = asset.fileName;
    // 渲染层的类型检查（tsconfig.app.json，lib ES2020）也会编到这个文件，那里没有 ErrorOptions；沿用主进程的 Object.assign 写法。
    Object.assign(this, { cause });
  }
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ExportCancelledError();
}

function failureFor(error: unknown): ExportAssetProbeFailure {
  return error instanceof MediaProbeError && error.code === "probe_unavailable" ? "probe_unavailable" : "asset_unreadable";
}

function withProbe(asset: NomiRenderAsset, probe: MediaProbeMetadata): NomiRenderAsset {
  return {
    ...asset,
    hasAudio: probe.hasAudio,
    ...(probe.durationSeconds !== undefined ? { durationSeconds: probe.durationSeconds } : {}),
    ...(probe.audioCodec !== undefined ? { audioCodec: probe.audioCodec } : {}),
  };
}

/**
 * 按清单顺序逐个探测视频 / 音频素材，返回带探测结果的新素材表和「有没有任何一段带声音」。
 * 任一段失败 → 抛 ExportAssetProbeError（停在第一段失败的素材，编码器一次都不会被叫到）；
 * 探测途中取消 → 抛 ExportCancelledError。
 */
export async function probeExportAssets(
  assets: Readonly<Record<string, NomiRenderAsset>>,
  options: Readonly<{ signal?: AbortSignal }> = {},
): Promise<{ assets: Record<string, NomiRenderAsset>; anyHasAudio: boolean }> {
  const { signal } = options;
  const probed: Record<string, NomiRenderAsset> = {};
  let anyHasAudio = false;
  for (const [assetId, asset] of Object.entries(assets)) {
    if (asset.kind === "image") {
      probed[assetId] = asset;
      continue;
    }
    throwIfCancelled(signal);
    let probe: MediaProbeMetadata;
    try {
      probe = await probeMediaMetadata(asset.absolutePath, signal ? { signal } : {});
    } catch (error) {
      throwIfCancelled(signal);
      const failure = new ExportAssetProbeError(failureFor(error), { assetId, fileName: path.basename(asset.absolutePath) }, error);
      // 界面只给人话；ffprobe 这一侧的错误类与码进日志（原话只给开发态终端，见 logging/redact.ts）。
      logError("export", "asset_probe_failed", error, {
        assetId,
        code: failure.code,
        probeCode: error instanceof MediaProbeError ? error.code : "unknown",
      });
      throw failure;
    }
    throwIfCancelled(signal);
    probed[assetId] = withProbe(asset, probe);
    if (probe.hasAudio) anyHasAudio = true;
  }
  return { assets: probed, anyHasAudio };
}
