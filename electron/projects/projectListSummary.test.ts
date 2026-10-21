import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => os.tmpdir(), getAppPath: () => process.cwd() },
}));

import { createProject, listProjects, resetEmptyDraftGcGuard, saveProject } from "./repository";
import { findRecentWorkspace } from "../workspace/workspaceRegistry";
import { workspaceProjectFile } from "../workspace/workspacePaths";
import * as manifest from "../workspace/workspaceManifest";
import { WORKSPACE_LIST_IO_CONCURRENCY } from "../workspace/workspaceRepository";

// 项目列表摘要读面的特征测试（P-library，2026-10-21）：钉住「列表读面返回什么」，
// 不钉它是同步还是异步——一律 `await listProjects()`，同步实现与异步实现都得过。
// 摘要 = 不带 payload 的项目记录 + 现场派生的封面；坏项目走注册表兜底而不是从列表里消失。
describe("项目列表摘要读面", () => {
  let projectsRoot = "";
  let settingsRoot = "";
  beforeEach(() => {
    projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-list-proj-"));
    settingsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-list-settings-"));
    vi.stubEnv("NOMI_PROJECTS_DIR", projectsRoot);
    vi.stubEnv("NOMI_SETTINGS_DIR", settingsRoot);
    resetEmptyDraftGcGuard();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(projectsRoot, { recursive: true, force: true });
    fs.rmSync(settingsRoot, { recursive: true, force: true });
  });

  it("返回摘要：不带 payload，带 rootPath / source / missing，按更新时间倒序", async () => {
    const older = createProject({ name: "较旧" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = createProject({ name: "较新" });

    const listed = await listProjects();
    expect(listed.map((project) => project.id)).toEqual([newer.id, older.id]);
    for (const project of listed) {
      expect(project).not.toHaveProperty("payload");
      expect(project).toMatchObject({ missing: false, source: "native" });
      expect(typeof project.rootPath).toBe("string");
    }
  });

  it("封面现场从画布节点结果派生，不是持久化字段", async () => {
    const project = createProject({ name: "带封面" });
    await saveProject(project.id, {
      ...(project as Record<string, unknown>),
      payload: {
        generationCanvas: {
          nodes: [{ id: "n1", kind: "image", result: { type: "image", url: "https://example.test/a.png" } }],
          edges: [],
        },
      },
    });
    const listed = await listProjects();
    const found = listed.find((item) => item.id === project.id);
    expect(found?.thumbnailUrls?.[0]).toBe("https://example.test/a.png");
  });

  it("项目文件夹被删（missing）：卡片照出，标 missing，不拖垮别的项目", async () => {
    const healthy = createProject({ name: "健康" });
    const gone = createProject({ name: "被外部删掉", rootPath: path.join(projectsRoot, "外部文件夹") });
    const goneEntry = findRecentWorkspace(settingsRoot, gone.id) as { rootPath: string };
    fs.rmSync(goneEntry.rootPath, { recursive: true, force: true });

    const listed = await listProjects();
    expect(listed.find((item) => item.id === healthy.id)).toMatchObject({ missing: false });
    expect(listed.find((item) => item.id === gone.id)).toMatchObject({ missing: true });
  });

  it("清单损坏的项目：卡片照出（用注册表里的名字），其余项目不受影响", async () => {
    const healthy = createProject({ name: "健康" });
    const broken = createProject({ name: "清单坏了" });
    const brokenEntry = findRecentWorkspace(settingsRoot, broken.id) as { rootPath: string };
    fs.writeFileSync(workspaceProjectFile(brokenEntry.rootPath), "{ not json");

    const listed = await listProjects();
    expect(listed.find((item) => item.id === healthy.id)?.name).toBe("健康");
    expect(listed.find((item) => item.id === broken.id)).toMatchObject({ name: "清单坏了", missing: false });
  });

  it("读清单的盘读并发不超过上限：41 个项目也只同时在飞 WORKSPACE_LIST_IO_CONCURRENCY 个", async () => {
    for (let index = 0; index < 41; index += 1) createProject({ name: `项目 ${index}` });
    const original = manifest.readWorkspaceManifestSnapshotAsync;
    let inFlight = 0;
    let peak = 0;
    const spy = vi.spyOn(manifest, "readWorkspaceManifestSnapshotAsync").mockImplementation(async (rootPath: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      try {
        await new Promise((resolve) => setTimeout(resolve, 2));
        return await original(rootPath);
      } finally {
        inFlight -= 1;
      }
    });
    try {
      const listed = await listProjects();
      expect(listed).toHaveLength(41);
      expect(spy).toHaveBeenCalledTimes(41);
      expect(peak).toBeGreaterThan(1);
      expect(peak).toBeLessThanOrEqual(WORKSPACE_LIST_IO_CONCURRENCY);
    } finally {
      spy.mockRestore();
    }
  });

  it("列举期间主进程事件循环不被占住：定时器照常触发", async () => {
    for (let index = 0; index < 20; index += 1) createProject({ name: `项目 ${index}` });
    let ticks = 0;
    const timer = setInterval(() => { ticks += 1; }, 1);
    try {
      await listProjects();
    } finally {
      clearInterval(timer);
    }
    expect(ticks).toBeGreaterThan(0);
  });
});
