// 生成产物两步落盘（方向 B）的对抗用例——独立验收 V-1208 首轮与复验报的五项，全部搬进仓库当回归：
//   V-1208-1 等解码器时调用方改写 Buffer / 源文件 → 发布的仍是校验过的那一份；
//   V-1208-2 等解码器时 projectId 被重新绑定 → 拒写，哪里都不落；
//   V-1208-4 写到一半失败 → 正式路径不出残片（生成产物只经暂存 + rename 发布，从不往正式路径直接写字节）；
//   V-1208-5 这次新增的整文件同步写盘 → 生成产物路径上没有任何同步写入大于 sidecar 的量。
// （V-1208-3 浏览器导入闭环在 electron/browser/media/browserImportCommit.test.ts。）
// 触发时刻用 Node 的 child_process 诊断通道卡在「解码子进程刚起」那一下（同步、确定），不靠计时碰运气。
import { spawnSync } from "node:child_process";
import diagnosticsChannel from "node:diagnostics_channel";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveFfmpegPath } from "../export/ffmpegRunner";
import { writeWorkspaceManifest } from "../workspace/workspaceManifest";

const work = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-publish-identity-"));
const binding = { root: "" };

vi.mock("../projects/repository", async (importOriginal) => ({
  ...await importOriginal<typeof import("../projects/repository")>(),
  projectDirById: () => binding.root,
}));

const { copyAssetFile, writeGeneratedAsset, writeGeneratedDeterministicAsset } = await import("./projectAssetStore");
type Stored = { data?: { relativePath?: string } };
const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "../providerAdapter/__fixtures__/certification-media", name));

/** 最小合法 GLB（同 projectAssetStore.test.ts 的 validGlb）。 */
function validGlb(): Buffer {
  const json = Buffer.from(JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    bufferViews: [{ buffer: 0, byteLength: 36 }], buffers: [{ byteLength: 36 }],
  }));
  const jsonLength = Math.ceil(json.byteLength / 4) * 4;
  const total = 12 + 8 + jsonLength + 8 + 36;
  const bytes = Buffer.alloc(total);
  bytes.write("glTF", 0, "ascii");
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(total, 8);
  bytes.writeUInt32LE(jsonLength, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20);
  bytes.fill(0x20, 20 + json.byteLength, 20 + jsonLength);
  bytes.writeUInt32LE(36, 20 + jsonLength);
  bytes.writeUInt32LE(0x004e4942, 24 + jsonLength);
  return bytes;
}

/** 几 MB 的真视频（V-1208-5 要看「整文件同步写」，fixture 里那段 1.6KB 的太小，分不出 sidecar 和媒体）。 */
let largeVideo: Buffer;
beforeAll(() => {
  const output = path.join(work, "large.mp4");
  const result = spawnSync(resolveFfmpegPath(), ["-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25",
    "-t", "2", "-b:v", "12M", "-pix_fmt", "yuv420p", output], { timeout: 60_000 });
  if (result.status !== 0) throw new Error(`fixture ffmpeg failed: ${String(result.stderr)}`);
  largeVideo = fs.readFileSync(output);
});

function makeProject(name: string): string {
  const root = path.join(fs.mkdtempSync(path.join(work, `${name}-`)), "project");
  fs.mkdirSync(root, { recursive: true });
  writeWorkspaceManifest(root, { id: "project-1", name: "project", version: 2, createdAt: 1, updatedAt: 1, savedAt: 1, revision: 0,
    immutableProjectUuid: "11111111-1111-4111-8111-111111111111", projectGeneration: 1, payload: {} });
  return root;
}

const cleanups: Array<() => void> = [];
/** 解码子进程一起来就执行 `run` 一次（同步回调，在调用方的上下文里）。 */
function whenDecoderSpawns(run: () => void): void {
  const handler = () => { diagnosticsChannel.unsubscribe("child_process", handler); run(); };
  diagnosticsChannel.subscribe("child_process", handler);
  cleanups.push(() => diagnosticsChannel.unsubscribe("child_process", handler));
}

function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full); else out.push(full);
    }
  };
  walk(dir);
  return out;
}
const published = (root: string) => filesUnder(path.join(root, "assets"));
const staging = (root: string) => fs.readdirSync(root).filter((name) => name.startsWith(".nomi-upload-"));

function sourceFile(bytes: Buffer, name = "download.mp4"): string {
  const source = path.join(fs.mkdtempSync(path.join(work, "source-")), name);
  fs.writeFileSync(source, bytes);
  return source;
}

const ENTRIES = {
  writeGeneratedAsset: (bytes: Buffer) => writeGeneratedAsset("project-1", bytes, "result.mp4", "video/mp4", { kind: "generated" }, "video"),
  writeGeneratedDeterministicAsset: (bytes: Buffer) => writeGeneratedDeterministicAsset("project-1", bytes, "result.mp4", "video/mp4", { kind: "generated" }, "video", "task:output-1"),
  copyAssetFile: (bytes: Buffer) => copyAssetFile("project-1", sourceFile(bytes), "result.mp4", "video/mp4", { kind: "generated" }, "video"),
} as const;

beforeEach(() => { binding.root = makeProject("home"); });
afterEach(() => { while (cleanups.length) cleanups.pop()!(); vi.restoreAllMocks(); });
afterAll(() => fs.rmSync(work, { recursive: true, force: true }));

describe("V-1208-1: the bytes that were verified are the bytes that get published", () => {
  it.each(["writeGeneratedAsset", "writeGeneratedDeterministicAsset"] as const)("%s: the caller rewrites its buffer while ffmpeg runs — the original video is published", async (entry) => {
    const original = fixture("valid.mp4");
    const bytes = Buffer.from(original);
    whenDecoderSpawns(() => bytes.fill(0x41, 32));
    const stored = await ENTRIES[entry](bytes) as Stored;
    expect(Buffer.compare(fs.readFileSync(path.join(binding.root, stored.data?.relativePath || "")), original)).toBe(0);
    expect(staging(binding.root)).toEqual([]);
  });

  it("copyAssetFile: the source file is overwritten while ffmpeg runs — what lands is what was verified", async () => {
    const original = fixture("valid.mp4");
    const source = sourceFile(original);
    whenDecoderSpawns(() => fs.writeFileSync(source, Buffer.alloc(original.length, 0x41)));
    const stored = await copyAssetFile("project-1", source, "download.mp4", "video/mp4", { kind: "generated" }, "video") as Stored;
    expect(Buffer.compare(fs.readFileSync(path.join(binding.root, stored.data?.relativePath || "")), original)).toBe(0);
  });
});

describe("V-1208-2: a write that was waiting on the decoder lands in the project it was started for, or nowhere", () => {
  it.each(Object.keys(ENTRIES) as Array<keyof typeof ENTRIES>)("%s: the project id is rebound to another folder mid-decode — refused as stale", async (entry) => {
    const home = binding.root;
    const elsewhere = makeProject("elsewhere");
    whenDecoderSpawns(() => { binding.root = elsewhere; });
    await expect(ENTRIES[entry](fixture("valid.mp4"))).rejects.toThrow("project_binding_stale");
    expect(published(elsewhere)).toEqual([]);
    expect(published(home)).toEqual([]);
    expect(staging(home)).toEqual([]);
    expect(staging(elsewhere)).toEqual([]);
  });
});

describe("V-1208-4: a write that fails half-way never leaves a partial file at the published path", () => {
  /** 往 assets/ 下（正式路径）直接写字节：先真写 32 字节，再抛 ENOSPC——模拟磁盘中途写满。 */
  function failDirectWritesUnderAssets(root: string): void {
    const assets = path.join(root, "assets") + path.sep;
    const realSync = fs.writeFileSync;
    const realAsync = fs.promises.writeFile;
    const half = (target: unknown, data: unknown) => {
      const file = String(target);
      if (!file.startsWith(assets) || file.endsWith(".meta")) return false;
      realSync(file, Buffer.from(data as Uint8Array).subarray(0, 32));
      return true;
    };
    vi.spyOn(fs, "writeFileSync").mockImplementation(((target: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, options?: fs.WriteFileOptions) => {
      if (half(target, data)) throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
      return realSync(target, data, options);
    }) as typeof fs.writeFileSync);
    vi.spyOn(fs.promises, "writeFile").mockImplementation((async (target: Parameters<typeof realAsync>[0], data: Parameters<typeof realAsync>[1], options?: Parameters<typeof realAsync>[2]) => {
      if (half(target, data)) throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
      return realAsync(target, data, options);
    }) as typeof fs.promises.writeFile);
  }

  it.each(Object.keys(ENTRIES) as Array<keyof typeof ENTRIES>)("%s publishes by rename, never by writing bytes at the published path", async (entry) => {
    failDirectWritesUnderAssets(binding.root);
    const stored = await ENTRIES[entry](fixture("valid.mp4")) as Stored;
    expect(Buffer.compare(fs.readFileSync(path.join(binding.root, stored.data?.relativePath || "")), fixture("valid.mp4"))).toBe(0);
  });

  it("the staging write itself fails half-way: rejected, nothing at the published path, no staging left behind", async () => {
    const realAsync = fs.promises.writeFile;
    vi.spyOn(fs.promises, "writeFile").mockImplementation((async (target: Parameters<typeof realAsync>[0], data: Parameters<typeof realAsync>[1], options?: Parameters<typeof realAsync>[2]) => {
      if (String(target).includes(".nomi-upload-")) {
        await realAsync(target, Buffer.from(data as Uint8Array).subarray(0, 32));
        throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
      }
      return realAsync(target, data, options);
    }) as typeof fs.promises.writeFile);
    await expect(writeGeneratedAsset("project-1", fixture("valid.mp4"), "result.mp4", "video/mp4", { kind: "generated" }, "video")).rejects.toThrow("ENOSPC");
    expect(published(binding.root)).toEqual([]);
    expect(staging(binding.root)).toEqual([]);
  });

  it("a GLB upload copy keeps its staged publish (no direct byte write at the published path)", async () => {
    failDirectWritesUnderAssets(binding.root);
    const glb = validGlb();
    const stored = await copyAssetFile("project-1", sourceFile(glb, "scene.glb"), "scene.glb", "model/gltf-binary", { kind: "upload" }, null) as Stored;
    expect(Buffer.compare(fs.readFileSync(path.join(binding.root, stored.data?.relativePath || "")), glb)).toBe(0);
  });
});

describe("V-1208-5: the generated publish adds no whole-file synchronous write to the main loop", () => {
  it.each(Object.keys(ENTRIES) as Array<keyof typeof ENTRIES>)("%s: every synchronous write is sidecar-sized; the media bytes are written asynchronously", async (entry) => {
    expect(largeVideo.byteLength).toBeGreaterThan(1024 * 1024);
    // 源文件在开始计数之前就备好（那是测试自己的同步写，不算产品的）。
    const source = entry === "copyAssetFile" ? sourceFile(largeVideo) : "";
    const run = () => entry === "copyAssetFile"
      ? copyAssetFile("project-1", source, "result.mp4", "video/mp4", { kind: "generated" }, "video")
      : ENTRIES[entry](largeVideo);
    const syncWrites: number[] = [];
    const realSync = fs.writeFileSync;
    vi.spyOn(fs, "writeFileSync").mockImplementation(((target: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, options?: fs.WriteFileOptions) => {
      syncWrites.push(typeof data === "string" ? Buffer.byteLength(data) : data.byteLength);
      return realSync(target, data, options);
    }) as typeof fs.writeFileSync);
    await run();
    expect(Math.max(0, ...syncWrites)).toBeLessThan(64 * 1024);
  });
});
