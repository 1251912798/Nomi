import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => os.tmpdir(), getAppPath: () => process.cwd() },
}));

import { createProject, listProjects, resetEmptyDraftGcGuard, saveProject } from "./repository";
import { findRecentWorkspace } from "../workspace/workspaceRegistry";
import * as manifest from "../workspace/workspaceManifest";

// 首次列举里的空草稿回收：列举是异步的，等它读完，同进程的保存 / 改名 / 创建可能已经插进来过。
// 回收拿的是列举开始时的旧摘要，不能当销毁授权——删之前要重新核「此刻」的清单（V-plibrary F1，丢数据）。
describe("首次列举的草稿回收与同进程写入交错", () => {
  let projectsRoot = "";
  let settingsRoot = "";
  beforeEach(() => {
    projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-gcx-proj-"));
    settingsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-gcx-settings-"));
    vi.stubEnv("NOMI_PROJECTS_DIR", projectsRoot);
    vi.stubEnv("NOMI_SETTINGS_DIR", settingsRoot);
    resetEmptyDraftGcGuard();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(projectsRoot, { recursive: true, force: true });
    fs.rmSync(settingsRoot, { recursive: true, force: true });
  });

  /** 让草稿的快照读完、另一个项目的快照读卡住：中间就是「同进程别的写入能插进来」的窗口。 */
  async function listingWithWindow(draftId: string, siblingId: string, whileOpen: () => Promise<void>) {
    const draftRoot = (findRecentWorkspace(settingsRoot, draftId) as { rootPath: string }).rootPath;
    const siblingRoot = (findRecentWorkspace(settingsRoot, siblingId) as { rootPath: string }).rootPath;
    let draftRead!: () => void;
    const draftReadDone = new Promise<void>((resolve) => { draftRead = resolve; });
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const original = manifest.readWorkspaceManifestSnapshotAsync;
    vi.spyOn(manifest, "readWorkspaceManifestSnapshotAsync").mockImplementation(async (dir: string) => {
      const value = await original(dir);
      if (dir === draftRoot) draftRead();
      if (dir === siblingRoot) await released;
      return value;
    });
    const listing = listProjects(); // promise-held：先让列举卡在半路，窗口里做别的，最后再 await
    await draftReadDone;
    await whileOpen();
    release();
    return { rows: await listing, draftRoot };
  }

  it("草稿在列举途中保存成功：目录、注册项都还在，卡片也在", async () => {
    const draft = createProject({ name: "列举途中保存", draft: true });
    const sibling = createProject({ name: "慢的同伴" });
    const { rows, draftRoot } = await listingWithWindow(draft.id, sibling.id, async () => {
      await saveProject(draft.id, { ...draft, payload: { text: "用户已经确认保存的内容" } });
    });
    expect(fs.existsSync(draftRoot)).toBe(true);
    expect(findRecentWorkspace(settingsRoot, draft.id)).toBeTruthy();
    expect(rows.some((row) => row.id === draft.id)).toBe(true);
  });

  it("草稿在列举途中被改名（保存带新名字）：不被回收", async () => {
    const draft = createProject({ name: "列举途中改名", draft: true });
    const sibling = createProject({ name: "慢的同伴" });
    const { draftRoot } = await listingWithWindow(draft.id, sibling.id, async () => {
      await saveProject(draft.id, { ...draft, name: "改过的名字" });
    });
    expect(fs.existsSync(draftRoot)).toBe(true);
    expect(findRecentWorkspace(settingsRoot, draft.id)).toBeTruthy();
  });

  it("列举途中新建的草稿：不在候选里，不被回收；上个进程遗留的真草稿照常回收", async () => {
    const stale = createProject({ name: "上个进程遗留", draft: true });
    const sibling = createProject({ name: "慢的同伴" });
    let fresh = "";
    const { rows, draftRoot } = await listingWithWindow(stale.id, sibling.id, async () => {
      fresh = createProject({ name: "列举途中新建", draft: true }).id;
    });
    expect(fs.existsSync(draftRoot)).toBe(false);
    expect(rows.some((row) => row.id === stale.id)).toBe(false);
    expect(findRecentWorkspace(settingsRoot, fresh)).toBeTruthy();
  });
});
