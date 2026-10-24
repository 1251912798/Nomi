// V-1208-6 的兜底一半：进程退出 / 崩溃来不及收的暂存（.nomi-upload-*），下次打开项目时就收——
// 判据是「主人进程还在不在」，不是只看年龄（以前不足十分钟的残留要等下一次导入、而且只在导入入口才扫）。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => new Map<string, (event: unknown, ...args: unknown[]) => unknown>());
vi.mock("electron", () => ({ ipcMain: { handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => { handlers.set(channel, handler); } } }));
vi.mock("../ipcSenderGuard", () => ({ assertTrustedSender: () => undefined }));
const opened = vi.hoisted(() => ({ root: "" }));
vi.mock("../projects/repository", async (importOriginal) => ({ ...await importOriginal<object>(), projectDirById: () => opened.root || null }));

const work = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-staging-sweep-"));
afterAll(() => fs.rmSync(work, { recursive: true, force: true }));

const { createUploadStagingDir, removeScratchAfterUse, sweepAbandonedUploadStaging } = await import("./scratchCleanup");
const { registerProjectsIpc } = await import("../projects/projectsIpc");

/** 一个确定已经不在了的进程号：起一个立刻退出的子进程，拿它的 pid。 */
function deadPid(): number {
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  return Number(child.stdout);
}

function project(): string {
  return fs.mkdtempSync(path.join(work, "project-"));
}

function staged(root: string, name: string): string {
  const directory = path.join(root, name);
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, "content"), "partial");
  return directory;
}

describe("abandoned upload staging is reclaimed by who owns it, not only by age", () => {
  it("removes fresh staging whose owning process is gone, and keeps everything that may still be in use", async () => {
    const root = project();
    const fromDeadProcess = staged(root, `.nomi-upload-p${deadPid()}-abcdef`);
    const fromThisProcessButReleased = staged(root, `.nomi-upload-p${process.pid}-released`);
    const fromAnotherLiveProcess = staged(root, `.nomi-upload-p${process.ppid}-abcdef`);
    const legacyFresh = staged(root, ".nomi-upload-legacy");
    const live = await createUploadStagingDir(root);

    await sweepAbandonedUploadStaging(root);

    expect(fs.existsSync(fromDeadProcess)).toBe(false);
    expect(fs.existsSync(fromThisProcessButReleased)).toBe(false);
    expect(fs.existsSync(fromAnotherLiveProcess)).toBe(true);
    expect(fs.existsSync(legacyFresh)).toBe(true);
    expect(fs.existsSync(live)).toBe(true);

    await removeScratchAfterUse(live);
    expect(fs.existsSync(live)).toBe(false);
  });

  it("opening a project (projects:read-async) sweeps the staging a previous process left behind", async () => {
    const root = project();
    const leftover = staged(root, `.nomi-upload-p${deadPid()}-quit01`);
    registerProjectsIpc({
      registerSyncIpc: () => undefined,
      listProjects: async () => [],
      createProject: () => null,
      readProject: (projectId: string) => ({ id: projectId }),
      saveProject: () => null,
      deleteProject: async () => null,
      diagnoseProject: () => null,
      recoverProject: () => null,
    });
    opened.root = root;
    // 打开路径本身：read-async 立刻返回记录（不等清扫），清扫在下一轮事件循环异步做。
    expect(handlers.get("nomi:projects:read-async")?.({}, "project-1")).toMatchObject({ id: "project-1" });
    expect(fs.existsSync(leftover)).toBe(true);
    await vi.waitFor(() => expect(fs.existsSync(leftover)).toBe(false));
  });
});
