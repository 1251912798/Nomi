import { describe, expect, it } from "vitest";
import {
  VIDEO_DEPTH_MODEL_MANIFEST,
  videoDepthModelByFileName,
  videoDepthModelForRole,
  videoDepthModelOrigins,
  videoDepthRequiredAssets,
} from "./videoDepthModels";

describe("video depth model manifest", () => {
  it("pins every asset to a real sha256, exact size and a permissive license", () => {
    expect(VIDEO_DEPTH_MODEL_MANIFEST.length).toBeGreaterThan(0);
    for (const asset of VIDEO_DEPTH_MODEL_MANIFEST) {
      // 空 sha256 = 「首下即信任」= 没有防线（R28）。这条断言就是不让它再长回来。
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset.sizeBytes).toBeGreaterThan(0);
      expect(asset.license).toBe("Apache-2.0");
    }
  });

  it("downloads only from official first-party endpoints, never a mirror", () => {
    expect(videoDepthModelOrigins().sort()).toEqual([
      "https://huggingface.co",
      "https://storage.googleapis.com",
    ]);
    for (const asset of VIDEO_DEPTH_MODEL_MANIFEST) {
      expect(asset.downloadUrl).not.toContain("hf-mirror");
    }
  });

  it("pins immutable revisions, not moving refs", () => {
    // `resolve/main` 和 `/latest/` 都会前进；那会让 pin 死的 sha256 某天突然全员失败。
    for (const asset of VIDEO_DEPTH_MODEL_MANIFEST) {
      expect(asset.downloadUrl).not.toContain("/resolve/main/");
      expect(asset.downloadUrl).not.toContain("/latest/");
    }
  });

  it("carries exactly one depth model — Small, no CC-BY-NC Base", () => {
    const depth = VIDEO_DEPTH_MODEL_MANIFEST.filter((a) => a.role === "depth");
    expect(depth).toHaveLength(1);
    expect(depth[0].downloadUrl).toContain("depth-anything-v2-small");
    expect(VIDEO_DEPTH_MODEL_MANIFEST.some((a) => a.downloadUrl.includes("depth-anything-v2-base"))).toBe(false);
  });

  it("downloads nothing for pose when the mode is depth-only", () => {
    expect(videoDepthRequiredAssets(true, false).map((a) => a.role)).toEqual(["depth"]);
    expect(videoDepthRequiredAssets(false, true).map((a) => a.role)).toEqual(["pose"]);
    expect(videoDepthRequiredAssets(true, true).map((a) => a.role)).toEqual(["depth", "pose"]);
  });

  it("resolves assets by role and by the file name used as the serving allowlist key", () => {
    const depth = videoDepthModelForRole("depth");
    expect(videoDepthModelByFileName(depth.fileName)).toBe(depth);
    expect(videoDepthModelByFileName("../../etc/passwd")).toBeUndefined();
  });

  it("uses file names with no path separators (they are an allowlist key, not a path)", () => {
    for (const asset of VIDEO_DEPTH_MODEL_MANIFEST) {
      expect(asset.fileName).toMatch(/^[A-Za-z0-9._-]+$/);
    }
  });
});
