import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => os.tmpdir(), getAppPath: () => process.cwd() },
}));

import { createProject, listProjects, saveProject } from "./repository";
import { findRecentWorkspace } from "../workspace/workspaceRegistry";
import { workspaceProjectFile } from "../workspace/workspacePaths";
import * as manifest from "../workspace/workspaceManifest";
import { WORKSPACE_LIST_IO_CONCURRENCY } from "../workspace/workspaceRepository";
import { acquireWorkspaceManifestLock, releaseWorkspaceManifestLock } from "../workspace/workspaceManifestLock";

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
    const gone = createProject({ name: "被外部删掉", rootPath: path.join(projectsRoot, "ext-folder-project") });
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

  // N2（V-plibrary）：一个项目的 .nomi 被挪到根外再用 junction 接回。快照读拒绝越界返回 null，
  // 回落的加锁读又抛边界错——此前这一个错让整次 listProjects 抛出，邻居项目一张都拿不到。
  it("一个项目的数据越界：整页不抛，邻居照出；这张卡标「越界、不可打开」，不读根外内容", async () => {
    const neighbour = createProject({ name: "无辜的邻居" });
    const inside = path.join(projectsRoot, "registered");
    const project = createProject({ name: "登记时的名字", rootPath: inside });
    const source = path.join(inside, ".nomi");
    const destination = path.join(settingsRoot, "outside-metadata");
    fs.renameSync(source, destination);
    const outsideFile = path.join(destination, "project.json");
    const value = JSON.parse(fs.readFileSync(outsideFile, "utf8"));
    value.name = "根外的内容";
    fs.writeFileSync(outsideFile, JSON.stringify(value));
    fs.symlinkSync(destination, source, "junction");
    try {
      const listed = await listProjects();
      expect(listed.find((item) => item.id === neighbour.id)?.name).toBe("无辜的邻居");
      expect(listed.find((item) => item.id === project.id)).toMatchObject({
        name: "登记时的名字",
        missing: false,
        unreadableReason: "outside-workspace",
      });
    } finally {
      fs.unlinkSync(source); // 先摘 junction，别顺着它删目标
    }
  });

  it("一个项目的清单正被别的写者加锁写：整页不抛，这张卡退回登记卡（不标坏，下次刷新就好）", async () => {
    const neighbour = createProject({ name: "无辜的邻居" });
    const busy = createProject({ name: "正在被写" });
    const busyRoot = (findRecentWorkspace(settingsRoot, busy.id) as { rootPath: string }).rootPath;
    // 内嵌 data URL 让快照读让位给加锁读；锁被另一写者占着 → 加锁读抛 busy。
    const raw = JSON.parse(fs.readFileSync(workspaceProjectFile(busyRoot), "utf8"));
    raw.payload = { note: "data:image/png;base64,AAAA" };
    fs.writeFileSync(workspaceProjectFile(busyRoot), JSON.stringify(raw));
    const lease = await acquireWorkspaceManifestLock(busyRoot);
    try {
      const listed = await listProjects();
      expect(listed.find((item) => item.id === neighbour.id)?.name).toBe("无辜的邻居");
      const card = listed.find((item) => item.id === busy.id);
      expect(card).toMatchObject({ name: "正在被写", missing: false });
      expect(card).not.toHaveProperty("unreadableReason");
    } finally {
      releaseWorkspaceManifestLock(lease);
    }
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
