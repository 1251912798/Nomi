import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MCP_CLIENT_HOST_ENV_VARS } from "../electron/shared/mcpClientRegistry";
import { createTempWorkspace } from "../tests/setup/tempWorkspace";
import { makeTempDir } from "./_test-temp.mjs";

describe("Vitest run vs. the developer's real host configs", () => {
  it("unsets every host config location variable for the run and puts the developer's values back on teardown", () => {
    // 产品按宿主规则跟着 CLAUDE_CONFIG_DIR / CODEX_HOME 读写；单测只换得掉主目录，换不掉继承来的这几个变量。
    expect(MCP_CLIENT_HOST_ENV_VARS.length).toBeGreaterThan(0);
    const real = Object.fromEntries(MCP_CLIENT_HOST_ENV_VARS.map((name) => [name, `/developer/real/${name}`]));
    const env: NodeJS.ProcessEnv = { ...real };
    const workspace = createTempWorkspace(env, os.tmpdir());
    try {
      for (const name of MCP_CLIENT_HOST_ENV_VARS) expect(env[name], name).toBeUndefined();
    } finally {
      workspace.teardown();
    }
    expect(env).toEqual({ ...real });
  });

  it("this very run starts with them unset (the global setup is what the unit tests actually get)", () => {
    for (const name of MCP_CLIENT_HOST_ENV_VARS) expect(process.env[name], name).toBeUndefined();
  });
});

describe("Vitest temp workspace", () => {
  it("redirects every Node temp variable and removes the run root on teardown", () => {
    const env = { TMPDIR: "before-tmpdir", TEMP: "before-temp", TMP: "before-tmp" };
    const workspace = createTempWorkspace(env, os.tmpdir());
    try {
      expect(env.TMPDIR).toBe(workspace.root);
      expect(env.TEMP).toBe(workspace.root);
      expect(env.TMP).toBe(workspace.root);
      expect(path.dirname(workspace.root)).toBe(fs.realpathSync(os.tmpdir()));
      expect(fs.existsSync(workspace.root)).toBe(true);
    } finally {
      workspace.teardown();
    }
    expect(fs.existsSync(workspace.root)).toBe(false);
    expect(env).toEqual({ TMPDIR: "before-tmpdir", TEMP: "before-temp", TMP: "before-tmp" });
    workspace.teardown();
  });
});

describe("temp workspace on a symlinked temp base (macOS /var → /private/var)", () => {
  it("hands out the resolved path so path comparisons match child processes and git", () => {
    const real = makeTempDir("nomi-real-base-");
    const link = `${real}-link`;
    fs.symlinkSync(real, link, "dir");
    const env: NodeJS.ProcessEnv = {};
    const workspace = createTempWorkspace(env, link);
    try {
      expect(workspace.root).toBe(fs.realpathSync(workspace.root));
      expect(path.dirname(workspace.root)).toBe(real);
      expect(env.TMPDIR).toBe(workspace.root);
    } finally {
      workspace.teardown();
      fs.rmSync(link, { force: true });
      fs.rmSync(real, { recursive: true, force: true });
    }
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
