import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readWorkspaceManifestSnapshotAsync } from "./workspaceManifest";
import { inspectWorkspaceSync, readWorkspaceSyncState } from "./workspaceSync";
import { resolveWorkspaceReadFile } from "./workspacePaths";

// 异步清单 / 备份 / sync-state 读的目录边界（V-plibrary F2）：真实路径跑出项目根就当「读不到」，不是「可读」。
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-readbound-"));
  dirs.push(base);
  const root = path.join(base, "project");
  const outside = path.join(base, "outside");
  fs.mkdirSync(path.join(root, ".nomi"), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  return { root, outside };
}
const manifestJson = (name: string) => JSON.stringify({ id: "project-1", name, version: 2, revision: 1, createdAt: 1, updatedAt: 1, savedAt: 1, payload: {} });
const stateJson = JSON.stringify({ schemaVersion: 1, workspaceId: "w", revision: 1, contentHash: "h", writerId: "outsider", writtenAt: "2026-10-21T00:00:00.000Z" });

/** 把 `<root>/.nomi` 换成指向根外目录的 junction（Windows 上建目录 junction 不需要管理员权限）。 */
function junctionNomiToOutside(root: string, outside: string) {
  fs.rmSync(path.join(root, ".nomi"), { recursive: true, force: true });
  fs.symlinkSync(outside, path.join(root, ".nomi"), "junction");
}
function tryFileSymlink(target: string, link: string): boolean {
  try { fs.symlinkSync(target, link, "file"); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return false; // 没有创建文件符号链接的权限（Windows 非开发者模式）
    throw error;
  }
}

describe("异步清单 / 状态读不越过项目根", () => {
  it("正常项目：三个文件都读得到，不存在的返回 null", async () => {
    const { root } = fixture();
    fs.writeFileSync(path.join(root, ".nomi", "project.json"), manifestJson("正常"));
    expect(await resolveWorkspaceReadFile(root, "manifest")).toBeTruthy();
    expect(await resolveWorkspaceReadFile(root, "backup")).toBeNull();
    expect(await resolveWorkspaceReadFile(root, "sync-state")).toBeNull();
    expect((await readWorkspaceManifestSnapshotAsync(root))?.name).toBe("正常");
  });

  it("目录 junction：.nomi 指到根外 → 清单快照 / 检查 / 备份 / sync-state 都当读不到", async () => {
    const { root, outside } = fixture();
    fs.writeFileSync(path.join(outside, "project.json"), manifestJson("根外的哨兵名字"));
    fs.writeFileSync(path.join(outside, "project.backup.json"), manifestJson("根外的备份"));
    fs.writeFileSync(path.join(outside, "sync-state.json"), stateJson);
    junctionNomiToOutside(root, outside);

    expect(await readWorkspaceManifestSnapshotAsync(root)).toBeNull();
    await expect(resolveWorkspaceReadFile(root, "backup")).rejects.toThrow(/inside the selected workspace/i);
    expect(await readWorkspaceSyncState(root)).toBeNull();
    const inspection = await inspectWorkspaceSync(root, "project-1");
    expect(inspection.status).toBe("corrupt-manifest");
    expect(inspection.lastWriterId).toBeNull();
    expect(inspection.contentHash).toBeNull();
  });

  it("文件 symlink：清单 / 备份 / sync-state 各自指到根外 → 读不到", async () => {
    const { root, outside } = fixture();
    const targets = { "project.json": manifestJson("根外清单"), "project.backup.json": manifestJson("根外备份"), "sync-state.json": stateJson };
    let linked = true;
    for (const [name, body] of Object.entries(targets)) {
      fs.writeFileSync(path.join(outside, name), body);
      linked = tryFileSymlink(path.join(outside, name), path.join(root, ".nomi", name)) && linked;
    }
    if (!linked) return; // 本机不能建文件 symlink：目录 junction 那条已覆盖同一道校验
    expect(await readWorkspaceManifestSnapshotAsync(root)).toBeNull();
    expect(await readWorkspaceSyncState(root)).toBeNull();
    expect((await inspectWorkspaceSync(root, "project-1")).status).toBe("corrupt-manifest");
  });

  it("只有备份文件 symlink 到根外：清单快照读不到（备份路径也过校验）", async () => {
    const { root, outside } = fixture();
    fs.writeFileSync(path.join(root, ".nomi", "project.json"), manifestJson("根内清单"));
    fs.writeFileSync(path.join(outside, "project.backup.json"), manifestJson("根外备份"));
    if (!tryFileSymlink(path.join(outside, "project.backup.json"), path.join(root, ".nomi", "project.backup.json"))) return;
    expect(await readWorkspaceManifestSnapshotAsync(root)).toBeNull();
  });
});
