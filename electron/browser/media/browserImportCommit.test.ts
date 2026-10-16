// V-1208-3（独立验收复验报的回归）：浏览器导入的「下载 → 资产提交 → 清理临时目录」闭环。
// importBrowserMedia 在 try 里 `return moveAssetFile(...)`、finally 删下载临时目录：写入边界一旦变成异步，
// finally 会抢在移动之前把源文件删掉（ENOENT）。方向 B 把写入边界恢复成同步原子写，这里用真实的导入函数守住它：
// 真解析 data URL 落临时文件、真捕捞元数据、真资产写入、真清理——只把项目根换成临时目录。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { BrowserViewRecord } from "../core/browserViewTypes";
import type { WindowProjectIssuance } from "../../assets/windowProjectCapture";
import { writeWorkspaceManifest } from "../../workspace/workspaceManifest";

vi.mock("electron", () => ({ BrowserWindow: { fromId: () => null } }));

const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nomi-browser-import-")), "project");
fs.mkdirSync(root, { recursive: true });
writeWorkspaceManifest(root, { id: "project-1", name: "project", version: 2, createdAt: 1, updatedAt: 1, savedAt: 1, revision: 0,
  immutableProjectUuid: "11111111-1111-4111-8111-111111111111", projectGeneration: 1, payload: {} });

vi.mock("../../projects/repository", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../projects/repository")>(),
  projectDirById: () => root,
}));
// 产品代码动态 import("../../runtime") 拿写入函数；runtime 是装配巨壳，这里只转接到真的资产写入边界。
vi.mock("../../runtime", async () => {
  const store = await import("../../assets/projectAssetStore");
  return { moveAssetFile: store.moveAssetFile };
});

const { importBrowserMedia } = await import("./browserViewMedia");

afterAll(() => fs.rmSync(path.dirname(root), { recursive: true, force: true }));

describe("browser import: the asset is committed before the download scratch is cleaned up", () => {
  it("a page image imported from a data URL lands whole in the project, and its temporary download is gone", async () => {
    const jpeg = fs.readFileSync(path.join(__dirname, "../../providerAdapter/__fixtures__/certification-media", "valid.jpg"));
    const record = {
      view: { webContents: { isDestroyed: () => false, getURL: () => "https://example.com/gallery", session: { fetch: vi.fn() } } },
    } as unknown as BrowserViewRecord;
    const project = {
      binding: { projectId: "project-1", immutableProjectUuid: "11111111-1111-4111-8111-111111111111", projectGeneration: 1 },
      surfaceBinding: {},
      assertCurrent: () => {},
    } as unknown as WindowProjectIssuance;
    const scratchBefore = new Set(fs.readdirSync(os.tmpdir()));

    const stored = await importBrowserMedia(record, { id: "view-1", url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, mediaType: "image", title: "shot" } as never, project) as {
      data?: { relativePath?: string };
    };

    const published = path.join(root, stored.data?.relativePath || "");
    expect(Buffer.compare(fs.readFileSync(published), jpeg)).toBe(0);
    expect(JSON.parse(fs.readFileSync(`${published}.meta`, "utf8"))).toMatchObject({ kind: "browser-capture", originalUrl: null });
    const leftover = fs.readdirSync(os.tmpdir()).filter((name) => !scratchBefore.has(name) && fs.existsSync(path.join(os.tmpdir(), name, path.basename(published))));
    expect(leftover).toEqual([]);
  });
});
