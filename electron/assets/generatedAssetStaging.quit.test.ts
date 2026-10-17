// V-1208-6（独立验收方向 B 第 2 次复验）：受控退出时，正在准备中的生成暂存件（.nomi-upload-*）要被收掉。
// 两条生产退出路径都钉住：① 直接生成入口（writeGeneratedAsset）正在等解码；② 本地任务导入正在等解码，
// 本地任务的退出排空（与 taskIpcHandlers 同参数：2500ms）在等它。走真的 quitTeardown、真的 LocalTaskJobs、真的文件系统；
// 只把解码子进程换成「一直不回、被中止才回」的替身（与 execFile 的 signal 语义一致），模拟一段很长的解码。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeWorkspaceManifest } from "../workspace/workspaceManifest";

const decoder = vi.hoisted(() => ({ spawned: 0 }));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const execFile = ((_command: string, _args: string[], options: { signal?: AbortSignal }, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
    decoder.spawned += 1;
    options.signal?.addEventListener("abort", () => callback(Object.assign(new Error("The operation was aborted"), { name: "AbortError", code: "ABORT_ERR" }), "", ""), { once: true });
    return {} as never;
  }) as unknown as typeof actual.execFile;
  return { ...actual, execFile, default: { ...actual, execFile } };
});

const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nomi-staging-quit-")), "project");
fs.mkdirSync(root, { recursive: true });
writeWorkspaceManifest(root, { id: "project-1", name: "project", version: 2, createdAt: 1, updatedAt: 1, savedAt: 1, revision: 0,
  immutableProjectUuid: "11111111-1111-4111-8111-111111111111", projectGeneration: 1, payload: {} });
vi.mock("../projects/repository", async (importOriginal) => ({
  ...await importOriginal<typeof import("../projects/repository")>(),
  projectDirById: () => root,
}));

const { installQuitTeardown, registerQuitDrain, resetQuitTeardownForTests } = await import("../quitTeardown");
const { registerGeneratedAssetStagingQuitDrain, resetGeneratedAssetStagingForTests } = await import("./generatedAssetStaging");
const { writeGeneratedAsset } = await import("./projectAssetStore");
const { LocalTaskJobs } = await import("../tasks/localTaskJobs");

const video = fs.readFileSync(path.join(__dirname, "../providerAdapter/__fixtures__/certification-media", "valid.mp4"));
const staging = () => fs.readdirSync(root).filter((name) => name.startsWith(".nomi-upload-"));
const assets = () => fs.existsSync(path.join(root, "assets")) ? fs.readdirSync(path.join(root, "assets"), { recursive: true }) : [];

function startQuitOwner() {
  const listeners = new Map<string, (event: { preventDefault: () => void }) => void>();
  const app = {
    on: vi.fn((event: string, listener: (event: { preventDefault: () => void }) => void) => { listeners.set(event, listener); return app; }),
    whenReady: vi.fn(() => Promise.resolve()),
    quit: vi.fn(),
    exit: vi.fn(),
  };
  const errors: string[] = [];
  installQuitTeardown(app as never, {
    disposeBackgroundLifecycle: vi.fn(),
    stopDesktopCapabilityCore: vi.fn(),
    disposeDesktopLaneIpc: vi.fn(async () => undefined),
    abortAllActiveExports: vi.fn(() => 0),
    onError: (stage: string) => { errors.push(stage); },
  });
  const quit = () => { listeners.get("before-quit")?.({ preventDefault: vi.fn() }); listeners.get("will-quit")?.({ preventDefault: vi.fn() }); };
  return { app, quit, errors };
}

beforeEach(() => {
  resetQuitTeardownForTests();
  resetGeneratedAssetStagingForTests();
  decoder.spawned = 0;
  // 生产顺序：资产模块加载时登记（早于 taskIpcHandlers 里本地任务的排空）。
  registerGeneratedAssetStagingQuitDrain();
});
afterEach(() => { for (const name of staging()) fs.rmSync(path.join(root, name), { recursive: true, force: true }); });
afterAll(() => fs.rmSync(path.dirname(root), { recursive: true, force: true }));

describe("V-1208-6: a controlled quit leaves no generated staging behind", () => {
  it("a direct generated write that is waiting on the decoder: quit aborts it and removes its staging before exit", async () => {
    const { app, quit, errors } = startQuitOwner();
    const pending = writeGeneratedAsset("project-1", video, "result.mp4", "video/mp4", { kind: "generated" }, "video");
    const outcome = pending.then(() => "published", (error: Error) => error.message);
    await vi.waitFor(() => expect(decoder.spawned).toBe(1));
    expect(staging()).toHaveLength(1);

    quit();
    await vi.waitFor(() => expect(app.exit).toHaveBeenCalledWith(0));
    expect(staging()).toEqual([]);
    expect(assets()).toEqual([]);
    expect(errors).not.toContain("generated-asset-staging-timeout");
    expect(await outcome).not.toBe("published");
  });

  it("a local-task import waiting on the decoder: the local-task drain no longer times out, and no staging is left", async () => {
    const { app, quit, errors } = startQuitOwner();
    const jobs = new LocalTaskJobs<Buffer>();
    registerQuitDrain("antigravity-image-jobs", () => jobs.cancelAll(), { required: true, timeoutMs: 2500 });
    const id = jobs.start("project-1", async () => video);
    await jobs.settled(id);
    const query = jobs.query(id, "project-1", async (bytes) => {
      const written = await writeGeneratedAsset("project-1", bytes, "result.mp4", "video/mp4", { kind: "generated" }, "video") as { data?: { url?: string } };
      return written.data?.url ? [written.data.url] : [];
    }).catch((error: Error) => error.message);
    await vi.waitFor(() => expect(decoder.spawned).toBe(1));
    expect(staging()).toHaveLength(1);

    quit();
    await vi.waitFor(() => expect(app.exit).toHaveBeenCalledWith(0));
    // 直接观测机制：本地任务排空没有超时（以前要等满 2500ms 才放行退出）。
    expect(errors).not.toContain("antigravity-image-jobs-timeout");
    expect(staging()).toEqual([]);
    expect(assets()).toEqual([]);
    await query;
  });

  it("no new generated staging is started once quit has begun", async () => {
    const { app, quit } = startQuitOwner();
    quit();
    await vi.waitFor(() => expect(app.exit).toHaveBeenCalledWith(0));
    await expect(writeGeneratedAsset("project-1", video, "late.mp4", "video/mp4", { kind: "generated" }, "video")).rejects.toThrow("generated_staging_quit");
    expect(staging()).toEqual([]);
  });
});
