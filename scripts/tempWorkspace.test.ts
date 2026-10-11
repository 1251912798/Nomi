import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTempWorkspace } from "../tests/setup/tempWorkspace";

describe("Vitest temp workspace", () => {
  it("redirects every Node temp variable and removes the run root on teardown", () => {
    const env = { TMPDIR: "before-tmpdir", TEMP: "before-temp", TMP: "before-tmp" };
    const workspace = createTempWorkspace(env, os.tmpdir());
    try {
      expect(env.TMPDIR).toBe(workspace.root);
      expect(env.TEMP).toBe(workspace.root);
      expect(env.TMP).toBe(workspace.root);
      expect(path.dirname(workspace.root)).toBe(os.tmpdir());
      expect(fs.existsSync(workspace.root)).toBe(true);
    } finally {
      workspace.teardown();
    }
    expect(fs.existsSync(workspace.root)).toBe(false);
    expect(env).toEqual({ TMPDIR: "before-tmpdir", TEMP: "before-temp", TMP: "before-tmp" });
    workspace.teardown();
  });
});

describe("temp workspace teardown on a locked file", () => {
  it("restores the host temp env even when deleting the scratch dir fails", async () => {
    const fsModule = await import("node:fs");
    const env: NodeJS.ProcessEnv = { TMPDIR: "/host-tmp" };
    const workspace = createTempWorkspace(env);
    const rm = vi.spyOn(fsModule.default, "rmSync").mockImplementation(() => {
      throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
    });
    try {
      expect(() => workspace.teardown()).toThrow(/EBUSY/);
      expect(env.TMPDIR).toBe("/host-tmp");
      expect(rm).toHaveBeenCalledWith(workspace.root, expect.objectContaining({ maxRetries: expect.any(Number) }));
    } finally {
      rm.mockRestore();
      fsModule.default.rmSync(workspace.root, { recursive: true, force: true });
    }
  });
});
