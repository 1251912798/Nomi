// 校验改成异步以后，「等解码器」那一段时间里世界可以变（独立验收 V-1208 的两条对抗用例，搬进仓库当必红）：
//   ① 调用方在解码进行中改写了自己的 Buffer / 源文件——发布出去的必须仍是校验过的那一份字节；
//   ② 解码进行中同一个 projectId 被重新绑定到别的目录——结果不许写进后绑定的目录。
// 触发时刻用 Node 的 child_process 诊断通道卡在「解码子进程刚起」那一下（同步、确定），不靠 setTimeout 碰运气。
import diagnosticsChannel from "node:diagnostics_channel";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeWorkspaceManifest } from "../workspace/workspaceManifest";

const work = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-publish-identity-"));
const binding = { root: "" };

vi.mock("../projects/repository", async (importOriginal) => ({
  ...await importOriginal<typeof import("../projects/repository")>(),
  projectDirById: () => binding.root,
}));

const { moveAssetFile, writeAsset, writeDeterministicAsset } = await import("./projectAssetStore");
type Stored = { data?: { relativePath?: string; absolutePath?: string } };
const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "../providerAdapter/__fixtures__/certification-media", name));

function makeProject(name: string): string {
  const root = path.join(fs.mkdtempSync(path.join(work, `${name}-`)), "project");
  fs.mkdirSync(root, { recursive: true });
  writeWorkspaceManifest(root, { id: "project-1", name: "project", version: 2, createdAt: 1, updatedAt: 1, savedAt: 1, revision: 0,
    immutableProjectUuid: "11111111-1111-4111-8111-111111111111", projectGeneration: 1, payload: {} });
  return root;
}

/** 解码子进程一起来就执行 `run` 一次（同步回调，在调用方的上下文里）。 */
function whenDecoderSpawns(run: () => void): void {
  const handler = () => { diagnosticsChannel.unsubscribe("child_process", handler); run(); };
  diagnosticsChannel.subscribe("child_process", handler);
  pending.push(() => diagnosticsChannel.unsubscribe("child_process", handler));
}
const pending: Array<() => void> = [];

function filesUnder(root: string): string[] {
  const dir = path.join(root, "assets");
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

beforeEach(() => { binding.root = makeProject("home"); });
afterEach(() => { while (pending.length) pending.pop()!(); });
afterAll(() => fs.rmSync(work, { recursive: true, force: true }));

describe("the bytes that were verified are the bytes that get published", () => {
  it.each(["writeAsset", "writeDeterministicAsset"] as const)("%s: the caller rewrites its buffer while ffmpeg runs — the original video is published", async (entry) => {
    const original = fixture("valid.mp4");
    const bytes = Buffer.from(original);
    whenDecoderSpawns(() => bytes.fill(0x41, 32));
    const stored = await (entry === "writeAsset"
      ? writeAsset("project-1", bytes, "result.mp4", "video/mp4", { kind: "generated" })
      : writeDeterministicAsset("project-1", bytes, "result.mp4", "video/mp4", { kind: "generated" }, "task-mutate:output-1")) as Stored;
    const published = fs.readFileSync(path.join(binding.root, stored.data?.relativePath || ""));
    expect(Buffer.compare(published, original)).toBe(0);
  });

  it("moveAssetFile: the source file is overwritten while ffmpeg runs — what lands is what was verified", async () => {
    const original = fixture("valid.mp4");
    const source = path.join(fs.mkdtempSync(path.join(work, "download-")), "download.mp4");
    fs.writeFileSync(source, original);
    whenDecoderSpawns(() => fs.writeFileSync(source, Buffer.alloc(original.length, 0x41)));
    const stored = await moveAssetFile("project-1", source, "download.mp4", "video/mp4", { kind: "generated" }) as Stored;
    const published = fs.readFileSync(path.join(binding.root, stored.data?.relativePath || ""));
    expect(Buffer.compare(published, original)).toBe(0);
  });
});

describe("a write that was waiting on the decoder lands in the project it was started for, or nowhere", () => {
  it.each([
    ["writeAsset (no explicit context)", (bytes: Buffer) => writeAsset("project-1", bytes, "result.mp4", "video/mp4", { kind: "generated" })],
    ["writeDeterministicAsset", (bytes: Buffer) => writeDeterministicAsset("project-1", bytes, "result.mp4", "video/mp4", { kind: "generated" }, "task-rebind:output-1")],
  ] as const)("%s: the project id is rebound to another folder mid-decode — the write is refused as stale", async (_label, write) => {
    const home = binding.root;
    const elsewhere = makeProject("elsewhere");
    whenDecoderSpawns(() => { binding.root = elsewhere; });
    await expect(write(fixture("valid.mp4"))).rejects.toThrow("project_binding_stale");
    expect(filesUnder(elsewhere)).toEqual([]);
    expect(filesUnder(home)).toEqual([]);
  });

  it("moveAssetFile: rebound mid-decode — refused, nothing lands, the source is left where it was", async () => {
    const home = binding.root;
    const elsewhere = makeProject("elsewhere");
    const source = path.join(fs.mkdtempSync(path.join(work, "download-")), "download.mp4");
    fs.writeFileSync(source, fixture("valid.mp4"));
    whenDecoderSpawns(() => { binding.root = elsewhere; });
    await expect(moveAssetFile("project-1", source, "download.mp4", "video/mp4", { kind: "generated" })).rejects.toThrow("project_binding_stale");
    expect(filesUnder(elsewhere)).toEqual([]);
    expect(filesUnder(home)).toEqual([]);
    expect(fs.existsSync(source)).toBe(true);
  });
});
