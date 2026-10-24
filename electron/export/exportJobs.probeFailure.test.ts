import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProject } from "../projects/repository";
import { ensureWorkspaceProjectIdentity } from "../workspace/workspaceProjectIdentity";
import type { ExportJobProjectIdentity } from "./exportJobManager";
import { executeProductionRunExport, listExportJobs, startExportJob } from "./exportJobs";
import { renderFiltergraphToMp4 } from "./ffmpegRunner";
import { probeMediaMetadata } from "./mediaProbe";

// 导出前的素材探测失败 = 导出失败（docs/fixes/2026-10-24-export-probe-failure-silent-audio.root-cause.json）。
// 走真导出入口（startExportJob / executeProductionRunExport）、真项目目录、真资产 URL 解析；
// 只替换 ffprobe 的答复与编码器（失败时编码器必须一次都没被叫到）。
vi.mock("./mediaProbe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./mediaProbe")>()),
  probeMediaMetadata: vi.fn(),
}));

vi.mock("./ffmpegRunner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ffmpegRunner")>();
  return {
    ...actual,
    renderFiltergraphToMp4: vi.fn(async (options: { projectDir: string }) => {
      const outputDir = path.join(options.projectDir, "exports");
      fs.mkdirSync(outputDir, { recursive: true });
      const absolutePath = path.join(outputDir, "rendered.mp4");
      fs.writeFileSync(absolutePath, "mp4");
      return { absolutePath, relativePath: "exports/rendered.mp4", size: 3 };
    }),
    transcodeWebmFileToMp4: vi.fn(),
    transcodeWebmToMp4: vi.fn(),
  };
});

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => path.join(os.tmpdir(), "nomi-electron-mock", name),
    getAppPath: () => process.cwd(),
  },
}));

const PROJECT_ID = "probe-failure-project";
let tempRoot = "";

type AssetKind = "image" | "video" | "audio";
type AssetSpec = { kind: AssetKind; fileName: string; url?: string };

function seedAsset(fileName: string): string {
  const dir = path.join(tempRoot, "assets", "imported");
  fs.mkdirSync(dir, { recursive: true });
  // 内容无关紧要：ffprobe 的答复由 probeMediaMetadata 的替身给出；文件必须真实存在，资产 URL 才解析得成本地路径。
  fs.writeFileSync(path.join(dir, fileName), "media bytes are not inspected in this test");
  return `nomi-local://asset/${encodeURIComponent(PROJECT_ID)}/assets/imported/${encodeURIComponent(fileName)}`;
}

function manifestWithAssets(specs: AssetSpec[], clipAudio?: Record<string, unknown>) {
  const assets: Record<string, Record<string, unknown>> = {};
  const tracks = specs.map((spec, index) => {
    const assetId = `asset-${index}`;
    assets[assetId] = { id: assetId, kind: spec.kind, url: spec.url ?? seedAsset(spec.fileName) };
    return {
      id: `track-${index}`,
      kind: spec.kind,
      type: spec.kind,
      clips: [{
        id: `clip-${index}`,
        assetId,
        startFrame: 0,
        endFrame: 60,
        sourceStartFrame: 0,
        sourceEndFrame: 60,
        ...(clipAudio && spec.kind !== "image" ? { audio: clipAudio } : {}),
      }],
    };
  });
  return {
    version: 1,
    projectId: PROJECT_ID,
    createdAt: "2026-10-24T00:00:00.000Z",
    timeline: { fps: 30, durationFrames: 60, range: { startFrame: 0, endFrame: 60 }, tracks },
    profile: {
      preset: "publish",
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "none",
      audioMode: "mute",
      width: 1920,
      height: 1080,
      fps: 30,
      pixelFormat: "yuv420p",
      quality: "standard",
    },
    assets,
    diagnostics: { warnings: [] },
  };
}

function manifestWith(kind: Exclude<AssetKind, "image">, fileName: string) {
  return manifestWithAssets([{ kind, fileName }]);
}

async function identity(): Promise<ExportJobProjectIdentity> {
  const disk = await ensureWorkspaceProjectIdentity(tempRoot);
  return {
    projectId: disk.projectId,
    immutableProjectUuid: disk.immutableProjectUuid,
    projectGeneration: disk.projectGeneration,
    canonicalRootDigest: disk.canonicalRootDigest,
  };
}

function productionExport(runId: string, manifest: unknown) {
  return executeProductionRunExport({
    projectId: PROJECT_ID,
    runId,
    outputName: "out",
    manifest,
    captureWebm: async () => {
      throw new Error("a local asset export must not fall back to WebM capture");
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-export-probe-failure-"));
  vi.stubEnv("NOMI_PROJECTS_DIR", tempRoot);
  vi.stubEnv("NOMI_SETTINGS_DIR", path.join(tempRoot, ".settings"));
  createProject({ id: PROJECT_ID, rootPath: tempRoot, name: "Probe failure", version: 1 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe.each<Exclude<AssetKind, "image">>(["video", "audio"])("a %s asset whose probe throws", (kind) => {
  const fileName = `${kind}-with-sound.mp4`;

  it("does not start a job and names the file (preview / clip node / Agent export entry)", async () => {
    vi.mocked(probeMediaMetadata).mockRejectedValue(new Error("moov atom not found"));

    await expect(startExportJob({ projectId: PROJECT_ID, manifest: manifestWith(kind, fileName), outputName: "out" }))
      .rejects.toThrow(fileName);
    expect(renderFiltergraphToMp4).not.toHaveBeenCalled();
    expect(listExportJobs(await identity())).toEqual([]);
  });

  it("never reaches the encoder (production run export entry)", async () => {
    vi.mocked(probeMediaMetadata).mockRejectedValue(new Error("moov atom not found"));

    const outcome = await productionExport(`run-${kind}`, manifestWith(kind, fileName))
      .then((result) => result, (error: unknown) => error);
    // 先看编码器：改前它会被叫到，拿到的 profile 是 audioCodec "none" / audioMode "mute"——一段无声的成片。
    expect(renderFiltergraphToMp4).not.toHaveBeenCalled();
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toContain(fileName);
    expect(outcome).toMatchObject({ code: "asset_unreadable", fileName });
  });
});
