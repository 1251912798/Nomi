import { describe, expect, it, vi } from "vitest";
import { LocalTaskJobs, withTaskOwner } from "./localTaskJobs";
describe("owned local task jobs", () => {
  it("imports once, only into the bound project and owner", async () => {
    const jobs = new LocalTaskJobs<string>(); const write = vi.fn(async () => ["nomi-local://result"]);
    const id = withTaskOwner(1, () => jobs.start("project", async () => "pixels"));
    await jobs.settled(id);
    await expect(withTaskOwner(2, () => jobs.query(id, "project", write))).rejects.toThrow("OWNER_MISMATCH");
    await expect(withTaskOwner(1, () => jobs.query(id, "other", write))).rejects.toThrow("PROJECT_MISMATCH");
    expect((await withTaskOwner(1, () => jobs.query(id, "project", write))).status).toBe("succeeded");
    await withTaskOwner(1, () => jobs.query(id, "project", write));
    expect(write).toHaveBeenCalledExactlyOnceWith("pixels");
  });
  it("cancel waits for cleanup and prevents late output/import", async () => {
    const jobs = new LocalTaskJobs<string>(); let finish!: (value: string) => void;
    const id = withTaskOwner(1, () => jobs.start("p", () => new Promise<string>((resolve) => { finish = resolve; })));
    const cancel = jobs.cancel(id, 1); let settled = false; void cancel.then(() => { settled = true; });
    await Promise.resolve(); expect(settled).toBe(false);
    finish("late pixels"); await cancel;
    const write = vi.fn(async () => ["nomi-local://late"]);
    expect((await withTaskOwner(1, () => jobs.query(id, "p", write))).status).toBe("cancelled");
    expect(write).not.toHaveBeenCalled();
  });
  it("window destruction aborts only its owned jobs", async () => {
    const jobs = new LocalTaskJobs<string>();
    const work = (signal: AbortSignal) => new Promise<string>((_, reject) => signal.addEventListener("abort", () => reject(new Error("stopped"))));
    const a = withTaskOwner(1, () => jobs.start("p", work));
    const b = withTaskOwner(2, () => jobs.start("p", work));
    await expect(jobs.cancel(b, 1)).rejects.toThrow("OWNER_MISMATCH");
    await jobs.cancelOwner(1);
    expect((await withTaskOwner(1, () => jobs.query(a, "p", vi.fn()))).status).toBe("cancelled");
    expect((await withTaskOwner(2, () => jobs.query(b, "p", vi.fn()))).status).toBe("running");
    await jobs.cancelOwner(2);
  });
  it("does not start paid work when the external signal is already cancelled", () => {
    const jobs = new LocalTaskJobs<string>(); const work = vi.fn(async () => "pixels");
    expect(() => jobs.start("p", work, AbortSignal.abort())).toThrow("LOCAL_TASK_CANCELLED");
    expect(work).not.toHaveBeenCalled();
  });
  it("closing an owner prevents late work after asynchronous submission setup", async () => {
    const jobs = new LocalTaskJobs<string>(); const work = vi.fn(async () => "pixels");
    await jobs.cancelOwner(1);
    expect(() => withTaskOwner(1, () => jobs.start("p", work))).toThrow("LOCAL_TASK_OWNER_CLOSED");
    expect(work).not.toHaveBeenCalled();
  });
  it("application shutdown closes submission before draining in-flight work", async () => {
    const jobs = new LocalTaskJobs<string>(); let finish!: (value: string) => void;
    const id = jobs.start("p", () => new Promise<string>((resolve) => { finish = resolve; }));
    const shutdown = jobs.cancelAll(); const work = vi.fn(async () => "late");
    expect(() => jobs.start("p", work)).toThrow("LOCAL_TASK_SHUTTING_DOWN");
    finish("pixels"); await shutdown;
    expect((await jobs.query(id, "p", vi.fn())).status).toBe("cancelled");
    expect(work).not.toHaveBeenCalled();
  });
  it("cancelling finished work before import drops the result without writing an asset", async () => {
    const jobs = new LocalTaskJobs<string>(); const write = vi.fn();
    const id = jobs.start("p", async () => "pixels"); await jobs.settled(id);
    await expect(jobs.cancel(id)).resolves.toEqual({ ok: true });
    expect(await jobs.query(id, "p", write)).toMatchObject({ status: "cancelled", image_urls: [] });
    expect(write).not.toHaveBeenCalled();
  });
  it("does not erase an already imported result on cancellation", async () => {
    const jobs = new LocalTaskJobs<string>(); const write = vi.fn(async () => ["nomi-local://result"]);
    const id = jobs.start("p", async () => "pixels"); await jobs.settled(id);
    await jobs.query(id, "p", write);
    await expect(jobs.cancel(id)).resolves.toEqual({ ok: false });
    expect(await jobs.query(id, "p", write)).toMatchObject({ status: "succeeded", image_urls: ["nomi-local://result"] });
    expect(write).toHaveBeenCalledOnce();
  });
  it("retains output after a failed idempotent import so polling can recover", async () => {
    const jobs = new LocalTaskJobs<string>();
    const write = vi.fn<(_: string) => Promise<string[]>>()
      .mockImplementationOnce(async () => { throw new Error("disk unavailable"); })
      .mockResolvedValue(["nomi-local://result"]);
    const id = jobs.start("p", async () => "pixels"); await jobs.settled(id);
    await expect(jobs.query(id, "p", write)).rejects.toThrow("disk unavailable");
    expect(await jobs.query(id, "p", write)).toMatchObject({ status: "succeeded", image_urls: ["nomi-local://result"] });
    await jobs.query(id, "p", write);
    expect(write.mock.calls).toEqual([["pixels"], ["pixels"]]);
  });

  // 导入要先异步等解码校验（主进程不能同步等 ffmpeg），于是导入不再是一段同步代码。下面三条钉住：
  // 它仍然和「第二次查询」「取消」互不交错——以前靠同步保证，现在靠单飞的那一次导入。
  describe("an import that waits on asynchronous verification still cannot interleave", () => {
    function gatedWrite() {
      let release!: (urls: string[]) => void; let fail!: (error: Error) => void;
      const write = vi.fn(() => new Promise<string[]>((resolve, reject) => { release = resolve; fail = reject; }));
      return { write, release: (urls: string[]) => release(urls), fail: (error: Error) => fail(error) };
    }

    it("two overlapping queries share one import", async () => {
      const jobs = new LocalTaskJobs<string>(); const gate = gatedWrite();
      const id = jobs.start("p", async () => "pixels"); await jobs.settled(id);
      const first = jobs.query(id, "p", gate.write);
      const second = jobs.query(id, "p", gate.write);
      gate.release(["nomi-local://result"]);
      expect(await first).toMatchObject({ image_urls: ["nomi-local://result"] });
      expect(await second).toMatchObject({ image_urls: ["nomi-local://result"] });
      expect(gate.write).toHaveBeenCalledOnce();
    });

    it("a cancel that arrives mid-import waits for it; a landed import is not erased", async () => {
      const jobs = new LocalTaskJobs<string>(); const gate = gatedWrite();
      const id = jobs.start("p", async () => "pixels"); await jobs.settled(id);
      const query = jobs.query(id, "p", gate.write);
      const cancel = jobs.cancel(id);
      gate.release(["nomi-local://result"]);
      await query;
      await expect(cancel).resolves.toEqual({ ok: false });
      expect(await jobs.query(id, "p", gate.write)).toMatchObject({ status: "succeeded", image_urls: ["nomi-local://result"] });
    });

    it("a cancel that arrives mid-import still cancels when the import fails, and no later query re-imports", async () => {
      const jobs = new LocalTaskJobs<string>(); const gate = gatedWrite();
      const id = jobs.start("p", async () => "pixels"); await jobs.settled(id);
      const query = jobs.query(id, "p", gate.write);
      const cancel = jobs.cancel(id);
      gate.fail(new Error("decode_unverified"));
      await expect(query).rejects.toThrow("decode_unverified");
      await expect(cancel).resolves.toEqual({ ok: true });
      const late = vi.fn(async () => ["nomi-local://late"]);
      expect(await jobs.query(id, "p", late)).toMatchObject({ status: "cancelled", image_urls: [] });
      expect(late).not.toHaveBeenCalled();
    });
  });
});
