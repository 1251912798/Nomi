import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() }, shell: {} }));

import { inspectProjectsSyncBatch, SYNC_INSPECT_BATCH_CONCURRENCY } from "./workspaceSyncIpc";
import type { WorkspaceSyncInspection } from "../shared/workspaceSyncContracts";

const ready = (): WorkspaceSyncInspection => ({
  status: "ready", manifestExists: true, backupExists: false, referencedAssetCount: 0, missingAssetCount: 0,
  observedRevision: null, lastWriterId: null, contentHash: null,
});

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const settingsRoot = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-sync-batch-"));
  dirs.push(dir);
  return dir;
};

describe("项目库卡片的批量状态检查", () => {
  it("同时在飞的检查不超过并发上限（41 个项目也一样）", async () => {
    const ids = Array.from({ length: 41 }, (_, index) => `p${index}`);
    let inFlight = 0;
    let peak = 0;
    const inspect = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      return ready();
    });
    const result = await inspectProjectsSyncBatch(settingsRoot(), ids, { rootPathOf: (id) => path.join(os.tmpdir(), id), inspect });
    expect(Object.keys(result)).toHaveLength(41);
    expect(inspect).toHaveBeenCalled();
    expect(peak).toBeLessThanOrEqual(SYNC_INSPECT_BATCH_CONCURRENCY);
    expect(peak).toBeGreaterThan(0);
  });

  it("坏项目不拖垮整批：没登记的、检查抛错的返回 null，其余照常", async () => {
    const inspect = vi.fn(async (root: string) => {
      if (root.endsWith("boom")) throw new Error("disk gone");
      return ready();
    });
    const rootPathOf = (id: string): string | null => (id === "unregistered" ? null : path.join(os.tmpdir(), id));
    const result = await inspectProjectsSyncBatch(settingsRoot(), ["ok", "unregistered", "boom", "ok"], { rootPathOf, inspect });
    expect(result).toEqual({ ok: ready(), unregistered: null, boom: null });
  });
});
