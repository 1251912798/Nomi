// 中立的在途 IPC 请求登记（补预览、视频拆解共用）：停止的四个来源汇成同一个 signal，停下回 null、不算失败。
// 补预览一路传到 ffmpeg 的整链在 electron/assets/previewRequests.test.ts；这里只钉登记本身的契约。
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createIpcRequestRegistry } from "./ipcRequestRegistry";

class FakeSender extends EventEmitter {
  destroyed = false;
  constructor(readonly id: number) { super(); }
  isDestroyed(): boolean { return this.destroyed; }
  destroy(): void { this.destroyed = true; this.emit("destroyed"); }
}

/** 一件一直跑到被撤的活：撤了就照叶子的样子抛错（错误本身不是「失败」）。 */
function untilAborted(seen: AbortSignal[]) {
  return (signal: AbortSignal) => new Promise<string>((_resolve, reject) => {
    seen.push(signal);
    signal.addEventListener("abort", () => reject(new Error("child killed")), { once: true });
  });
}

describe("在途 IPC 请求登记", () => {
  it("同一个窗口按请求号撤得动；别的窗口、陌生请求号撤不动；撤了回 null", async () => {
    const registry = createIpcRequestRegistry();
    const seen: AbortSignal[] = [];
    const pending = registry.run(new FakeSender(1), "r1", undefined, untilAborted(seen));
    expect(registry.inflightCount()).toBe(1);
    expect(registry.cancel(2, "r1")).toBe(false);
    expect(registry.cancel(1, "other")).toBe(false);
    expect(registry.cancel(1, "")).toBe(false);
    expect(seen[0]?.aborted).toBe(false);
    expect(registry.cancel(1, "r1")).toBe(true);
    expect(seen[0]?.aborted).toBe(true);
    await expect(pending).resolves.toBeNull();
    expect(registry.inflightCount()).toBe(0);
    expect(registry.cancel(1, "r1")).toBe(false);
  });

  it("登记在第一个 await 之前：干活那一层还在准备时到达的取消也生效", async () => {
    const registry = createIpcRequestRegistry();
    let received: AbortSignal | undefined;
    const pending = registry.run(new FakeSender(1), "r1", undefined, async (signal) => {
      await Promise.resolve();
      received = signal;
      signal.throwIfAborted();
      return "ran";
    });
    expect(registry.cancel(1, "r1")).toBe(true);
    await expect(pending).resolves.toBeNull();
    expect(received?.aborted).toBe(true);
  });

  it("发起窗口销毁即撤；一开始就销毁的窗口直接给已撤的 signal", async () => {
    const registry = createIpcRequestRegistry();
    const sender = new FakeSender(1);
    const seen: AbortSignal[] = [];
    const pending = registry.run(sender, "r1", undefined, untilAborted(seen));
    sender.destroy();
    await expect(pending).resolves.toBeNull();
    expect(sender.listenerCount("destroyed")).toBe(0);

    const gone = new FakeSender(2);
    gone.destroyed = true;
    let initiallyAborted: boolean | undefined;
    await expect(registry.run(gone, "r2", undefined, async (signal) => { initiallyAborted = signal.aborted; signal.throwIfAborted(); return "ran"; })).resolves.toBeNull();
    expect(initiallyAborted).toBe(true);
  });

  it("项目上下文失效（复核抛错）即撤", async () => {
    const registry = createIpcRequestRegistry({ pollMs: 5 });
    let current = true;
    const seen: AbortSignal[] = [];
    const pending = registry.run(new FakeSender(1), "r1", () => { if (!current) throw new Error("project_binding_stale"); }, untilAborted(seen));
    expect(seen[0]?.aborted).toBe(false);
    current = false;
    await expect(pending).resolves.toBeNull();
  });

  it("没被撤的失败照原样抛出：停下才回 null，真失败不被吞", async () => {
    const registry = createIpcRequestRegistry();
    await expect(registry.run(new FakeSender(1), "r1", undefined, async () => { throw new Error("ffmpeg exited 1"); })).rejects.toThrow("ffmpeg exited 1");
    expect(registry.inflightCount()).toBe(0);
  });

  it("同一个窗口同一个请求号再来一次：先撤掉上一次", async () => {
    const registry = createIpcRequestRegistry();
    const seen: AbortSignal[] = [];
    const first = registry.run(new FakeSender(1), "r1", undefined, untilAborted(seen));
    const second = registry.run(new FakeSender(1), "r1", undefined, untilAborted(seen));
    await expect(first).resolves.toBeNull();
    expect(seen[1]?.aborted).toBe(false);
    expect(registry.cancel(1, "r1")).toBe(true);
    await expect(second).resolves.toBeNull();
  });

  it("退出收摊：abortAll 撤掉全部在跑的（含没带请求号的），返回件数", async () => {
    const registry = createIpcRequestRegistry();
    const seen: AbortSignal[] = [];
    const keyed = registry.run(new FakeSender(1), "r1", undefined, untilAborted(seen));
    const anonymous = registry.run(new FakeSender(2), "", undefined, untilAborted(seen));
    expect(registry.abortAll()).toBe(2);
    await expect(Promise.all([keyed, anonymous])).resolves.toEqual([null, null]);
    expect(seen.every((signal) => signal.aborted)).toBe(true);
    expect(registry.abortAll()).toBe(0);
  });
});
