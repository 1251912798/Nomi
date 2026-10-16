// 补预览在途请求的取消（V-1209 首轮不通过：关项目后两路 ffmpeg 照跑完并写盘）。
// 锁的行为：发起窗口销毁 / 项目上下文失效 / 渲染层显式撤回，任一发生就把取消信号一路传到 ffmpeg 子进程：
// 杀进程、删掉没写完的产物、不写 sidecar、不给事实（返回 null）。子进程用受控替身，取消路径是确定性的。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processControl = vi.hoisted(() => ({ signals: [] as AbortSignal[], started: 0 }));

vi.mock("../export/mediaProbe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../export/mediaProbe")>();
  return {
    ...actual,
    // 探测一律答「2048×3072 的大图」：走到 ffmpeg 那一步。
    probeMediaMetadata: vi.fn(async () => ({ width: 2048, height: 3072, pixelFormat: "yuvj420p" })),
    // 受控的 ffmpeg 子进程：开始写产物，一直跑到被取消（与 runBoundedProcess 的取消契约一致：杀进程后拒绝）。
    runBoundedProcess: vi.fn((_command: string, args: string[], options: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
      processControl.started += 1;
      const output = args[args.length - 1]!;
      fs.writeFileSync(output, Buffer.from("partial jpeg"));
      if (!options.signal) return;
      processControl.signals.push(options.signal);
      options.signal.addEventListener("abort", () => reject(new actual.BoundedProcessError("cancelled")), { once: true });
    })),
  };
});
vi.mock("../export/ffmpegRunner", () => ({ resolveFfmpegPath: () => "ffmpeg" }));

const { createPreviewRequestRegistry } = await import("./previewRequests");
const { attachStoredAssetPreview, isAssetPreviewCancelled } = await import("./assetPreview");
const { readAssetSidecarMeta } = await import("./assetSidecar");

class FakeSender extends EventEmitter {
  destroyed = false;
  constructor(readonly id: number) { super(); }
  isDestroyed(): boolean { return this.destroyed; }
  destroy(): void { this.destroyed = true; this.emit("destroyed"); }
}

const roots: string[] = [];
function storedRecord() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-preview-cancel-"));
  roots.push(dir);
  const absolutePath = path.join(dir, "big.jpg");
  fs.writeFileSync(absolutePath, Buffer.from("source"));
  return { projectId: "p1", data: { url: "nomi-local://asset/p1/big.jpg", relativePath: "big.jpg", absolutePath, contentType: "image/jpeg" } };
}

beforeEach(() => { processControl.signals = []; processControl.started = 0; });
afterEach(() => { for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

async function untilFfmpegStarted(): Promise<void> {
  await vi.waitFor(() => expect(processControl.started).toBe(1));
}

describe("补预览在途请求的取消", () => {
  it("发起窗口关掉：杀掉在途 ffmpeg、删掉没写完的预览、不写 sidecar、返回 null", async () => {
    const registry = createPreviewRequestRegistry();
    const sender = new FakeSender(1);
    const record = storedRecord();
    const pending = registry.run(sender, "r1", undefined, (signal) => attachStoredAssetPreview(record, undefined, { signal }));
    await untilFfmpegStarted();
    expect(fs.existsSync(record.data.absolutePath.replace(/\.jpg$/, ".preview.jpg"))).toBe(true);
    sender.destroy();
    await expect(pending).resolves.toBeNull();
    expect(processControl.signals[0]!.aborted).toBe(true);
    expect(fs.existsSync(record.data.absolutePath.replace(/\.jpg$/, ".preview.jpg"))).toBe(false);
    expect(readAssetSidecarMeta(record.data.absolutePath)).not.toHaveProperty("thumbnailRelativePath");
    expect(registry.inflightCount()).toBe(0);
  });

  it("项目上下文失效（关项目 / 换项目，发起时签发的 assertCurrent 开始抛）：同样杀进程、不留产物", async () => {
    const registry = createPreviewRequestRegistry({ pollMs: 5 });
    let projectOpen = true;
    const assertCurrent = () => { if (!projectOpen) throw new Error("project_binding_stale"); };
    const record = storedRecord();
    const pending = registry.run(new FakeSender(2), "r2", assertCurrent, (signal) => attachStoredAssetPreview(record, undefined, { signal }));
    await untilFfmpegStarted();
    projectOpen = false;
    await expect(pending).resolves.toBeNull();
    expect(fs.existsSync(record.data.absolutePath.replace(/\.jpg$/, ".preview.jpg"))).toBe(false);
  });

  it("渲染层显式撤回只认同一个窗口的请求号；别的窗口撤不动", async () => {
    const registry = createPreviewRequestRegistry();
    const record = storedRecord();
    const pending = registry.run(new FakeSender(3), "r3", undefined, (signal) => attachStoredAssetPreview(record, undefined, { signal }));
    await untilFfmpegStarted();
    expect(registry.cancel(4, "r3")).toBe(false);
    expect(processControl.signals[0]!.aborted).toBe(false);
    expect(registry.cancel(3, "r3")).toBe(true);
    await expect(pending).resolves.toBeNull();
  });

  it("发起前项目就已失效：一次子进程都不起", async () => {
    const registry = createPreviewRequestRegistry();
    const record = storedRecord();
    const result = await registry.run(new FakeSender(5), "r5", () => { throw new Error("project_binding_stale"); }, (signal) => attachStoredAssetPreview(record, undefined, { signal }));
    expect(result).toBeNull();
    expect(processControl.started).toBe(0);
  });

  it("取消不是失败：owner 抛的是可辨认的取消错误，不会被记成 missing", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await attachStoredAssetPreview(storedRecord(), undefined, { signal: controller.signal }).catch((caught: unknown) => caught);
    expect(isAssetPreviewCancelled(error)).toBe(true);
  });
});
