import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 系统回收站用一个临时目录假扮：shell.trashItem 把路径挪进去（真回收站也是「挪走、能还原」）。
const trash = vi.hoisted(() => ({
  dir: "",
  failWith: null as Error | null,
  leaveInPlace: false,
  calls: [] as string[],
}));
vi.mock("electron", () => ({
  app: { getPath: () => os.tmpdir(), getAppPath: () => process.cwd() },
  shell: {
    trashItem: async (target: string) => {
      trash.calls.push(target);
      if (trash.failWith) throw trash.failWith;
      if (trash.leaveInPlace) return; // 系统报成功、原路径却还在
      fs.renameSync(target, path.join(trash.dir, `${path.basename(target)}-${trash.calls.length}`));
    },
  },
}));

import { createProject, deleteProject, listProjects } from "./repository";
import { resetLegacyDiscoveryGuard } from "../workspace/legacyProjectMigration";
import { findRecentWorkspace } from "../workspace/workspaceRegistry";
import { WorkspaceManifestLockBusyError, acquireWorkspaceManifestLock, releaseWorkspaceManifestLock } from "../workspace/workspaceManifestLock";
import { isProjectTrashFailedError, projectTrashFailureReason } from "../shared/projectDeleteIntent";

// ⑭（用户 2026-10-22 拍板）：确认「删除文件」后项目文件夹进系统回收站、可以恢复；进不了回收站就报清楚原因、
// 什么都不删，绝不静默退回永久删除。方向检查 docs/engineering/direction-checks/2026-10-23-project-delete-to-trash.md。
describe("删项目进系统回收站", () => {
  let projectsRoot = "";
  let settingsRoot = "";
  beforeEach(() => {
    projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-trash-proj-"));
    settingsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-trash-settings-"));
    trash.dir = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-trash-bin-"));
    trash.failWith = null;
    trash.leaveInPlace = false;
    trash.calls = [];
    vi.stubEnv("NOMI_PROJECTS_DIR", projectsRoot);
    vi.stubEnv("NOMI_SETTINGS_DIR", settingsRoot);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of [projectsRoot, settingsRoot, trash.dir]) fs.rmSync(dir, { recursive: true, force: true });
  });

  function nativeProjectWithAsset(name: string) {
    const project = createProject({ name });
    const root = (findRecentWorkspace(settingsRoot, project.id) as { rootPath: string }).rootPath;
    fs.mkdirSync(path.join(root, "assets", "imported"), { recursive: true });
    fs.writeFileSync(path.join(root, "assets", "imported", "user.png"), "user asset");
    return { project, root };
  }

  it("确认「删除文件」：整个项目文件夹进回收站（素材都在里面、能还原），然后才从项目库移除", async () => {
    const { project, root } = nativeProjectWithAsset("进回收站");
    await expect(deleteProject(project.id, "delete-files")).resolves.toEqual({ id: project.id, deleted: true });
    expect(trash.calls).toEqual([path.resolve(root)]);
    expect(fs.existsSync(root)).toBe(false);
    const binned = fs.readdirSync(trash.dir);
    expect(binned).toHaveLength(1);
    expect(fs.readFileSync(path.join(trash.dir, binned[0], "assets", "imported", "user.png"), "utf8")).toBe("user asset");
    expect(findRecentWorkspace(settingsRoot, project.id)).toBeFalsy();
  });

  it("从回收站还原后，下次启动（启动发现重新扫默认根）它回到项目库", async () => {
    const { project, root } = nativeProjectWithAsset("还原回来");
    await deleteProject(project.id, "delete-files");
    const [binned] = fs.readdirSync(trash.dir);
    fs.renameSync(path.join(trash.dir, binned), root); // 用户在系统回收站点「还原」
    resetLegacyDiscoveryGuard(); // 模拟下次启动
    expect((await listProjects()).some((item) => item.id === project.id)).toBe(true);
  });

  it.each([
    ["没有权限", Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" }), "permission"],
    ["这个位置没有回收站（Windows 回收站放弃操作）", new Error("Operation was aborted"), "no-trash"],
    ["文件被别的程序占用", Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" }), "in-use"],
    ["别的原因", new Error("something unexpected"), "unknown"],
  ] as const)("进不了回收站（%s）：明确报错、什么都不删、项目还在库里", async (_label, failure, reason) => {
    const { project, root } = nativeProjectWithAsset("进不了回收站");
    trash.failWith = failure;
    const error = await deleteProject(project.id, "delete-files").then(() => null, (caught: unknown) => caught);
    expect(isProjectTrashFailedError(error)).toBe(true);
    expect(projectTrashFailureReason(error)).toBe(reason);
    expect(fs.existsSync(path.join(root, "assets", "imported", "user.png"))).toBe(true);
    expect(findRecentWorkspace(settingsRoot, project.id)).toBeTruthy();
  });

  it("删除时别的写者正锁着这个项目：照常报「正被别处占用」，不进回收站、不删", async () => {
    const { project, root } = nativeProjectWithAsset("正被别处占用");
    const lease = await acquireWorkspaceManifestLock(root);
    try {
      await expect(deleteProject(project.id, "delete-files")).rejects.toThrow(WorkspaceManifestLockBusyError);
      expect(trash.calls).toEqual([]);
      expect(fs.existsSync(path.join(root, "assets", "imported", "user.png"))).toBe(true);
      expect(findRecentWorkspace(settingsRoot, project.id)).toBeTruthy();
    } finally {
      releaseWorkspaceManifestLock(lease);
    }
  });

  it("回收站报成功、原路径却还在：当失败处理，不从项目库移除", async () => {
    const { project, root } = nativeProjectWithAsset("报成功但还在");
    trash.leaveInPlace = true;
    const error = await deleteProject(project.id, "delete-files").then(() => null, (caught: unknown) => caught);
    expect(isProjectTrashFailedError(error)).toBe(true);
    expect(fs.existsSync(root)).toBe(true);
    expect(findRecentWorkspace(settingsRoot, project.id)).toBeTruthy();
  });

  it("老格式项目（根目录 project.json、未登记）确认「删除文件」：同样进回收站，不是永久删除", async () => {
    const legacyRoot = path.join(projectsRoot, "Legacy Project");
    fs.mkdirSync(legacyRoot, { recursive: true });
    fs.writeFileSync(path.join(legacyRoot, "project.json"), JSON.stringify({ id: "legacy-trash-id", name: "Legacy", version: 1, payload: {} }));
    await expect(deleteProject("legacy-trash-id", "delete-files")).resolves.toEqual({ id: "legacy-trash-id", deleted: true });
    expect(trash.calls).toEqual([path.resolve(legacyRoot)]);
    expect(fs.existsSync(legacyRoot)).toBe(false);
  });

  it("老格式项目进不了回收站：明确报错，文件夹原样", async () => {
    const legacyRoot = path.join(projectsRoot, "Legacy Locked");
    fs.mkdirSync(legacyRoot, { recursive: true });
    fs.writeFileSync(path.join(legacyRoot, "project.json"), JSON.stringify({ id: "legacy-locked-id", name: "Legacy", version: 1, payload: {} }));
    trash.failWith = new Error("Operation was aborted");
    const error = await deleteProject("legacy-locked-id", "delete-files").then(() => null, (caught: unknown) => caught);
    expect(projectTrashFailureReason(error)).toBe("no-trash");
    expect(fs.existsSync(path.join(legacyRoot, "project.json"))).toBe(true);
  });

  it("确认「只移除」：不进回收站、不删，只从项目库移除", async () => {
    const { project, root } = nativeProjectWithAsset("只移除");
    await expect(deleteProject(project.id, "unbind")).resolves.toEqual({ id: project.id, deleted: false });
    expect(trash.calls).toEqual([]);
    expect(fs.existsSync(path.join(root, "assets", "imported", "user.png"))).toBe(true);
    expect(findRecentWorkspace(settingsRoot, project.id)).toBeFalsy();
  });

  it("外部文件夹确认「删除文件」：仍然只解绑，不进回收站、不碰用户的文件", async () => {
    const externalRoot = path.join(settingsRoot, "用户自己的文件夹");
    const project = createProject({ name: "外部", rootPath: externalRoot });
    await expect(deleteProject(project.id, "delete-files")).resolves.toEqual({ id: project.id, deleted: false });
    expect(trash.calls).toEqual([]);
    expect(fs.existsSync(externalRoot)).toBe(true);
  });
});

// 结构守卫：删项目目录的两处（workspace 项目 / 老格式项目）只经 moveProjectFolderToTrash，不许再出现永久删除。
describe("删项目目录只有进回收站这一种做法", () => {
  it("repository.ts、workspaceRepository.ts、projectTrash.ts 里没有 rmSync / rmdirSync / unlinkSync", () => {
    for (const file of ["electron/projects/repository.ts", "electron/workspace/workspaceRepository.ts", "electron/projects/projectTrash.ts"]) {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(source, file).not.toMatch(/\b(rmSync|rmdirSync|unlinkSync|rm|rmdir|unlink)\s*\(/);
    }
  });
});
