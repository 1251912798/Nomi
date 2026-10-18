// V-1208-6（独立验收方向 B 第 2 次复验）：受控退出时，正在准备中的生成暂存件（.nomi-upload-*）要被收掉。
// 两条生产退出路径都钉住：① 直接生成入口（writeGeneratedAsset）正在等解码；② 本地任务导入正在等解码，
// 本地任务的退出排空（与 taskIpcHandlers 同参数：2500ms）在等它。走真的 quitTeardown、真的 LocalTaskJobs、真的文件系统；
// 只把解码子进程换成「一直不回、被中止才回」的替身（与 execFile 的 signal 语义一致），模拟一段很长的解码。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeWorkspaceManifest } from "../workspace/workspaceManifest";

// 不靠墙钟：解码子进程被拉起、应用退出，都是真实信号，测试直接等它们（满载时只是慢，不会误判）。
// 退出排空自带的超时预算（1.5s / 2.5s / 3s）用假时钟冻住：排空只能靠「收尾真的完成」放行，
// 靠超时放行的实现会永远等不到 exit，被 vitest 自己的用例超时抓住。
const decoder = vi.hoisted(() => ({ spawned: 0, waiters: [] as Array<() => void> }));
const spawnedAtLeast = (count: number) => new Promise<void>((resolve) => {
  if (decoder.spawned >= count) { resolve(); return; }
  decoder.waiters.push(() => { if (decoder.spawned >= count) resolve(); });
});
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const execFile = ((_command: string, _args: string[], options: { signal?: AbortSignal }, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
    decoder.spawned += 1;
    for (const waiter of decoder.waiters.splice(0)) waiter();
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
    exit: vi.fn((_code?: number) => { markExited(); }),
  };
  let markExited!: () => void;
  const exited = new Promise<void>((resolve) => { markExited = resolve; });
  const errors: string[] = [];
  // 退出收尾每个步骤结束都会出一张回执（quitTeardown 的 onReceipt）。generated-asset-staging 是「尽力而为」的排空，
  // 不拖住 app.exit，所以「app 已退出」不等于「暂存已收完」——要等的是它自己的回执，那才是真实的完成信号。
  const stepReceipts = new Map<string, { promise: Promise<string>; resolve: (outcome: string) => void }>();
  const stepOf = (step: string) => {
    let entry = stepReceipts.get(step);
    if (!entry) { let resolve!: (outcome: string) => void; const promise = new Promise<string>((r) => { resolve = r; }); entry = { promise, resolve }; stepReceipts.set(step, entry); }
    return entry;
  };
  installQuitTeardown(app as never, {
    disposeBackgroundLifecycle: vi.fn(),
    stopDesktopCapabilityCore: vi.fn(),
    disposeDesktopLaneIpc: vi.fn(async () => undefined),
    abortAllActiveExports: vi.fn(() => 0),
    onError: (stage: string) => { errors.push(stage); },
    onReceipt: (kind: string, detail: { step?: string; outcome?: string }) => { if (kind === "quit-step" && detail.step) stepOf(detail.step).resolve(String(detail.outcome)); },
  });
  const quit = () => { listeners.get("before-quit")?.({ preventDefault: vi.fn() }); listeners.get("will-quit")?.({ preventDefault: vi.fn() }); };
  return { app, quit, errors, exited, drained: (step: string) => stepOf(step).promise };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  resetQuitTeardownForTests();
  resetGeneratedAssetStagingForTests();
  decoder.spawned = 0;
  decoder.waiters = [];
  // 生产顺序：资产模块加载时登记（早于 taskIpcHandlers 里本地任务的排空）。
  registerGeneratedAssetStagingQuitDrain();
});
afterEach(() => { vi.useRealTimers(); for (const name of staging()) fs.rmSync(path.join(root, name), { recursive: true, force: true }); });
afterAll(() => fs.rmSync(path.dirname(root), { recursive: true, force: true }));

describe("V-1208-6: a controlled quit leaves no generated staging behind", () => {
  it("a direct generated write that is waiting on the decoder: quit aborts it and removes its staging before exit", async () => {
    const { app, quit, errors, exited, drained } = startQuitOwner();
    const pending = writeGeneratedAsset("project-1", video, "result.mp4", "video/mp4", { kind: "generated" }, "video");
    const outcome = pending.then(() => "published", (error: Error) => error.message);
    await spawnedAtLeast(1);
    expect(staging()).toHaveLength(1);

    quit();
    await exited;
    expect(app.exit).toHaveBeenCalledWith(0);
    // 暂存排空是尽力而为、不拖住 exit：等它自己的回执（真实完成信号），且必须是「做完」而不是「超时放行」。
    expect(await drained("generated-asset-staging")).toBe("done");
    expect(staging()).toEqual([]);
    expect(assets()).toEqual([]);
    expect(errors).not.toContain("generated-asset-staging-timeout");
    expect(await outcome).not.toBe("published");
  });

  it("a local-task import waiting on the decoder: the local-task drain no longer times out, and no staging is left", async () => {
    const { app, quit, errors, exited, drained } = startQuitOwner();
    const jobs = new LocalTaskJobs<Buffer>();
    registerQuitDrain("antigravity-image-jobs", () => jobs.cancelAll(), { required: true, timeoutMs: 2500 });
    const id = jobs.start("project-1", async () => video);
    await jobs.settled(id);
    const query = jobs.query(id, "project-1", async (bytes) => {
      const written = await writeGeneratedAsset("project-1", bytes, "result.mp4", "video/mp4", { kind: "generated" }, "video") as { data?: { url?: string } };
      return written.data?.url ? [written.data.url] : [];
    }).catch((error: Error) => error.message);
    await spawnedAtLeast(1);
    expect(staging()).toHaveLength(1);

    quit();
    await exited;
    expect(app.exit).toHaveBeenCalledWith(0);
    expect(await drained("generated-asset-staging")).toBe("done");
    expect(await drained("antigravity-image-jobs")).toBe("done");
    // 直接观测机制：本地任务排空没有超时（以前要等满 2500ms 才放行退出）。
    expect(errors).not.toContain("antigravity-image-jobs-timeout");
    expect(staging()).toEqual([]);
    expect(assets()).toEqual([]);
    await query;
  });

  it("no new generated staging is started once quit has begun", async () => {
    const { app, quit, exited } = startQuitOwner();
    quit();
    await exited;
    expect(app.exit).toHaveBeenCalledWith(0);
    await expect(writeGeneratedAsset("project-1", video, "late.mp4", "video/mp4", { kind: "generated" }, "video")).rejects.toThrow("generated_staging_quit");
    expect(staging()).toEqual([]);
  });
});
