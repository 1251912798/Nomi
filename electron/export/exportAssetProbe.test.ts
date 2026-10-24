import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDesktopLocale, setDesktopLocale, type DesktopLocale } from "../desktopLocale";
import { desktopT } from "../desktopStrings";
import { ExportAssetProbeError, probeExportAssets } from "./exportAssetProbe";
import type { NomiRenderAsset } from "./exportManifest";
import { ExportCancelledError } from "./ffmpegRunner";
import { MediaProbeError, probeMediaMetadata, type MediaProbeMetadata } from "./mediaProbe";

// 概念 export.asset-probe 的边界测试（docs/fixes/2026-10-24-export-probe-failure-silent-audio.root-cause.json）：
// 入口 = probeExportAssets；形状 = 视频 / 音频 / 图片；失败 = ffprobe 不可用 / 单个文件读不出（每一种探测错误码）；
// 边界 = 第一段失败即停、取消不报失败、导出目录里不许有第二个探测入口。
vi.mock("./mediaProbe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./mediaProbe")>()),
  probeMediaMetadata: vi.fn(),
}));

const LOCALES: readonly DesktopLocale[] = ["zh-CN", "en"];
const NEXT_STEP: Record<DesktopLocale, string> = { "zh-CN": "下一步：", en: "Next:" };

function asset(id: string, kind: NomiRenderAsset["kind"], fileName: string): NomiRenderAsset {
  return { id, kind, absolutePath: path.join(path.sep, "project", "assets", "imported", fileName) };
}

function probeResult(hasAudio: boolean): MediaProbeMetadata {
  return hasAudio
    ? { kind: "video", hasAudio: true, durationSeconds: 4.5, audioCodec: "aac", streamCount: 2 }
    : { kind: "video", hasAudio: false, durationSeconds: 4.5, streamCount: 1 };
}

async function probeFailure(assets: Record<string, NomiRenderAsset>, options?: { signal?: AbortSignal }): Promise<unknown> {
  return probeExportAssets(assets, options).then(
    () => { throw new Error("expected probeExportAssets to reject"); },
    (error: unknown) => error,
  );
}

let initialLocale: DesktopLocale;
beforeEach(() => {
  vi.clearAllMocks();
  initialLocale = getDesktopLocale();
});
afterEach(() => setDesktopLocale(initialLocale));

describe("probeExportAssets: a successful probe gives every sound-capable asset a definite verdict", () => {
  it("keeps sound when the probe finds an audio stream (regression: same plan as before)", async () => {
    vi.mocked(probeMediaMetadata).mockResolvedValue(probeResult(true));

    const result = await probeExportAssets({ clip: asset("clip", "video", "voice.mp4") });

    expect(result.anyHasAudio).toBe(true);
    expect(result.assets.clip).toMatchObject({ hasAudio: true, durationSeconds: 4.5, audioCodec: "aac" });
  });

  it("records an explicit false when the media truly has no audio (regression: still silent, still exports)", async () => {
    vi.mocked(probeMediaMetadata).mockResolvedValue(probeResult(false));

    const result = await probeExportAssets({ clip: asset("clip", "video", "broll.mp4") });

    expect(result.anyHasAudio).toBe(false);
    expect(result.assets.clip.hasAudio).toBe(false);
    expect(result.assets.clip).toMatchObject({ durationSeconds: 4.5 });
  });

  it("does not probe images and passes them through unchanged", async () => {
    const still = asset("still", "image", "poster.png");

    const result = await probeExportAssets({ still });

    expect(probeMediaMetadata).not.toHaveBeenCalled();
    expect(result.assets.still).toEqual(still);
    expect(result.anyHasAudio).toBe(false);
  });

  it("probes audio assets with the same rule as video assets", async () => {
    vi.mocked(probeMediaMetadata).mockResolvedValue({ kind: "audio", hasAudio: true, durationSeconds: 9, audioCodec: "mp3", streamCount: 1 });

    const result = await probeExportAssets({ music: asset("music", "audio", "bgm.mp3") });

    expect(result.anyHasAudio).toBe(true);
    expect(result.assets.music).toMatchObject({ hasAudio: true, audioCodec: "mp3" });
  });
});

describe.each(["video", "audio"] as const)("probeExportAssets: a %s file that cannot be read", (kind) => {
  const fileName = kind === "video" ? "interview-take2.mp4" : "score.m4a";

  it.each(["probe_failed", "missing_file", "unsupported_media", "invalid_probe_output"] as const)(
    "%s → the export fails naming the file, with a next step",
    async (code) => {
      vi.mocked(probeMediaMetadata).mockRejectedValue(new MediaProbeError(code, "ffprobe said no"));

      const error = await probeFailure({ a: asset("a", kind, fileName) });

      expect(error).toBeInstanceOf(ExportAssetProbeError);
      expect(error).toMatchObject({ code: "asset_unreadable", assetId: "a", fileName });
      expect((error as Error).cause).toBeInstanceOf(MediaProbeError);
    },
  );

  it("treats an unexpected error from the probe as this file being unreadable, not as silence", async () => {
    vi.mocked(probeMediaMetadata).mockRejectedValue(new Error("EACCES: permission denied, stat"));

    const error = await probeFailure({ a: asset("a", kind, fileName) });

    expect(error).toMatchObject({ code: "asset_unreadable", fileName });
  });

  it.each(LOCALES)("says which file and what to do next in %s", async (locale) => {
    setDesktopLocale(locale);
    vi.mocked(probeMediaMetadata).mockRejectedValue(new MediaProbeError("probe_failed", "moov atom not found"));

    const error = await probeFailure({ a: asset("a", kind, fileName) });

    expect((error as Error).message).toBe(desktopT("export.assetUnreadable", { file: fileName }, locale));
    expect((error as Error).message).toContain(fileName);
    expect((error as Error).message).toContain(NEXT_STEP[locale]);
  });
});

describe("probeExportAssets: ffprobe itself is unavailable", () => {
  it.each(LOCALES)("reports the capability as unavailable with the reinstall step in %s, without blaming the file", async (locale) => {
    setDesktopLocale(locale);
    vi.mocked(probeMediaMetadata).mockRejectedValue(new MediaProbeError("probe_unavailable", "ffprobe executable could not be resolved"));

    const error = await probeFailure({ a: asset("a", "video", "perfectly-fine.mp4") });

    expect(error).toBeInstanceOf(ExportAssetProbeError);
    expect(error).toMatchObject({ code: "probe_unavailable" });
    expect((error as Error).message).toBe(desktopT("export.probeUnavailable", {}, locale));
    expect((error as Error).message).toContain(NEXT_STEP[locale]);
    expect((error as Error).message).not.toContain("perfectly-fine.mp4");
  });

  it("uses a different message from a single unreadable file (two failures, two next steps)", () => {
    for (const locale of LOCALES) {
      expect(desktopT("export.probeUnavailable", {}, locale)).not.toBe(desktopT("export.assetUnreadable", { file: "x.mp4" }, locale));
    }
  });
});

describe("probeExportAssets: boundaries", () => {
  it("stops at the first asset that fails and never probes the rest", async () => {
    vi.mocked(probeMediaMetadata)
      .mockResolvedValueOnce(probeResult(true))
      .mockRejectedValueOnce(new MediaProbeError("probe_failed", "truncated"))
      .mockResolvedValue(probeResult(true));

    const error = await probeFailure({
      good: asset("good", "video", "good.mp4"),
      broken: asset("broken", "audio", "broken.wav"),
      never: asset("never", "video", "never.mp4"),
    });

    expect(error).toMatchObject({ code: "asset_unreadable", assetId: "broken", fileName: "broken.wav" });
    expect(probeMediaMetadata).toHaveBeenCalledTimes(2);
  });

  it("does not start probing once the export was cancelled", async () => {
    const controller = new AbortController();
    controller.abort();

    const error = await probeFailure({ a: asset("a", "video", "a.mp4") }, { signal: controller.signal });

    expect(error).toBeInstanceOf(ExportCancelledError);
    expect(probeMediaMetadata).not.toHaveBeenCalled();
  });

  it("reports a cancel during probing as a cancel even though ffprobe was killed with a failure", async () => {
    const controller = new AbortController();
    vi.mocked(probeMediaMetadata).mockImplementation((_path, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new MediaProbeError("probe_failed", "ffprobe process cancelled")), { once: true });
    }));

    const pending = probeFailure({ a: asset("a", "video", "a.mp4") }, { signal: controller.signal });
    await vi.waitFor(() => expect(probeMediaMetadata).toHaveBeenCalledTimes(1));
    controller.abort();
    const error = await pending;

    expect(error).toBeInstanceOf(ExportCancelledError);
    expect(error).not.toBeInstanceOf(ExportAssetProbeError);
    expect(vi.mocked(probeMediaMetadata).mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });

  it("reports a cancel that lands right after a successful probe as a cancel, not as a finished probe", async () => {
    const controller = new AbortController();
    vi.mocked(probeMediaMetadata).mockImplementation(async () => {
      controller.abort();
      return probeResult(true);
    });

    const error = await probeFailure({ a: asset("a", "video", "a.mp4"), b: asset("b", "video", "b.mp4") }, { signal: controller.signal });

    expect(error).toBeInstanceOf(ExportCancelledError);
    expect(probeMediaMetadata).toHaveBeenCalledTimes(1);
  });
});

describe("export.asset-probe has a single door inside electron/export", () => {
  it("only exportAssetProbe.ts probes media in the export directory (no caller can try/catch its own probe again)", () => {
    const exportDir = path.join(process.cwd(), "electron", "export");
    const callers = fs.readdirSync(exportDir)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "mediaProbe.ts")
      .filter((name) => /\bprobeMedia(?:Metadata|Bytes)\s*\(/.test(fs.readFileSync(path.join(exportDir, name), "utf8")));

    expect(callers).toEqual(["exportAssetProbe.ts"]);
  });
});
