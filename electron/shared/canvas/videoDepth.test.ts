import { describe, expect, it } from "vitest";
import {
  VIDEO_DEPTH_MAX_RAW_BYTES,
  checkVideoDepthBudget,
  computeExpectedRawBytes,
  deriveProcessingPlan,
  modeNeedsDepth,
  modeNeedsPose,
  parseVideoDepthSettings,
  pixelFormatForMode,
  type VideoDepthSettings,
} from "./videoDepth";

function settings(overrides: Record<string, unknown> = {}): VideoDepthSettings {
  const parsed = parseVideoDepthSettings({ schemaVersion: 1, ...overrides });
  if (!parsed) throw new Error("fixture settings must parse");
  return parsed;
}

describe("parseVideoDepthSettings", () => {
  it("fills every default from an empty object", () => {
    expect(parseVideoDepthSettings({})).toEqual({
      schemaVersion: 1,
      trimStartSeconds: 0,
      trimEndSeconds: 0,
      mode: "depth",
      maxPeople: 1,
      maxResolution: 518,
      processingFps: 30,
      depthDirection: "nearWhite",
      temporalSmoothing: 0.35,
    });
  });

  it("accepts the two resolution tiers the user signed off on", () => {
    expect(parseVideoDepthSettings({ maxResolution: 518 })?.maxResolution).toBe(518);
    expect(parseVideoDepthSettings({ maxResolution: "original" })?.maxResolution).toBe("original");
  });

  it("rejects the resolution tiers that were dropped with the 518 decision", () => {
    for (const dropped of [512, 768, 1024]) {
      expect(parseVideoDepthSettings({ maxResolution: dropped })).toBeUndefined();
    }
  });

  it("rejects out-of-scope fields rather than silently ignoring them", () => {
    // 砍掉的字段必须**拒绝**，不能静默丢弃——否则半成品会从旧快照里悄悄回来。
    expect(parseVideoDepthSettings({ depthModel: "base" })).toBeUndefined();
    expect(parseVideoDepthSettings({ poseModel: "heavy" })).toBeUndefined();
    expect(parseVideoDepthSettings({ depthStyle: "inferno" })).toBeUndefined();
    expect(parseVideoDepthSettings({ exportPoseJson: true })).toBeUndefined();
    expect(parseVideoDepthSettings({ skeleton: { glow: true } })).toBeUndefined();
  });

  it("rejects out-of-scope modes and fps values", () => {
    expect(parseVideoDepthSettings({ mode: "skeleton_black" })).toBeUndefined();
    expect(parseVideoDepthSettings({ mode: "nope" })).toBeUndefined();
    expect(parseVideoDepthSettings({ processingFps: 25 })).toBeUndefined();
  });

  it("bounds maxPeople and temporalSmoothing", () => {
    expect(parseVideoDepthSettings({ maxPeople: 0 })).toBeUndefined();
    expect(parseVideoDepthSettings({ maxPeople: 5 })).toBeUndefined();
    expect(parseVideoDepthSettings({ temporalSmoothing: 1.01 })).toBeUndefined();
    expect(parseVideoDepthSettings({ temporalSmoothing: -0.01 })).toBeUndefined();
  });

  it("treats trimEnd 0 as 'source end' but rejects an inverted window", () => {
    expect(parseVideoDepthSettings({ trimStartSeconds: 4, trimEndSeconds: 0 })?.trimEndSeconds).toBe(0);
    expect(parseVideoDepthSettings({ trimStartSeconds: 4, trimEndSeconds: 4 })).toBeUndefined();
    expect(parseVideoDepthSettings({ trimStartSeconds: 4, trimEndSeconds: 3 })).toBeUndefined();
  });

  it("requires a source node id on the source reference", () => {
    const base = { sourceUrl: "nomi-local://asset/p/a.mp4", title: "clip", sourceKind: "canvas-video-node" };
    expect(parseVideoDepthSettings({ sourceVideoRef: base })).toBeUndefined();
    expect(parseVideoDepthSettings({ sourceVideoRef: { ...base, sourceNodeId: "n1" } })).toBeDefined();
  });
});

describe("mode → model / pixel-format matrix", () => {
  it("only loads what the mode actually needs", () => {
    expect(modeNeedsDepth("depth")).toBe(true);
    expect(modeNeedsPose("depth")).toBe(false);
    expect(modeNeedsDepth("depth_skeleton")).toBe(true);
    expect(modeNeedsPose("depth_skeleton")).toBe(true);
    // 原片+骨架完全不跑深度模型——这条错了会白下载 50MB 并慢一倍。
    expect(modeNeedsDepth("original_skeleton")).toBe(false);
    expect(modeNeedsPose("original_skeleton")).toBe(true);
  });

  it("uses single-channel gray only for pure depth", () => {
    expect(pixelFormatForMode("depth")).toBe("gray");
    expect(pixelFormatForMode("depth_skeleton")).toBe("rgb24");
    expect(pixelFormatForMode("original_skeleton")).toBe("rgb24");
  });
});

describe("deriveProcessingPlan", () => {
  it("scales the longest edge down to 518 and keeps both edges even", () => {
    const plan = deriveProcessingPlan(settings(), { width: 1920, height: 1080, durationSeconds: 4 });
    expect(plan.outWidth).toBe(518);
    expect(plan.outHeight).toBe(290);
    expect(plan.outWidth % 2).toBe(0);
    expect(plan.outHeight % 2).toBe(0);
  });

  it("never upscales a source that is already smaller than the tier", () => {
    const plan = deriveProcessingPlan(settings(), { width: 320, height: 180, durationSeconds: 2 });
    expect(plan.outWidth).toBe(320);
    expect(plan.outHeight).toBe(180);
  });

  it("keeps the source size on the original tier", () => {
    const plan = deriveProcessingPlan(settings({ maxResolution: "original" }), {
      width: 1920,
      height: 1080,
      durationSeconds: 2,
    });
    expect([plan.outWidth, plan.outHeight]).toEqual([1920, 1080]);
  });

  it("resolves trimEnd 0 to the source end and clamps an over-long window", () => {
    const open = deriveProcessingPlan(settings({ trimStartSeconds: 1 }), { width: 640, height: 360, durationSeconds: 5 });
    expect(open.endSeconds).toBe(5);
    expect(open.durationSeconds).toBe(4);

    const clamped = deriveProcessingPlan(settings({ trimStartSeconds: 1, trimEndSeconds: 99 }), {
      width: 640,
      height: 360,
      durationSeconds: 5,
    });
    expect(clamped.endSeconds).toBe(5);
  });

  it("derives frame count from processingFps, not from a hardcoded rate", () => {
    for (const fps of [8, 24, 60] as const) {
      const plan = deriveProcessingPlan(settings({ processingFps: fps }), {
        width: 640,
        height: 360,
        durationSeconds: 3,
      });
      expect(plan.totalFramesEstimate).toBe(3 * fps);
    }
  });

  it("reports null instead of inventing an estimate when source facts are missing", () => {
    const noDuration = deriveProcessingPlan(settings(), { width: 640, height: 360 });
    expect(noDuration.totalFramesEstimate).toBeNull();
    expect(noDuration.expectedRawBytes).toBeNull();

    const noSize = deriveProcessingPlan(settings(), { durationSeconds: 4 });
    expect(noSize.expectedRawBytes).toBeNull();
  });
});

describe("raw byte budget", () => {
  it("counts one byte per pixel for gray and three for rgb24", () => {
    expect(computeExpectedRawBytes(10, 100, 50, "gray")).toBe(50_000);
    expect(computeExpectedRawBytes(10, 100, 50, "rgb24")).toBe(150_000);
  });

  it("passes a realistic 518px job", () => {
    const plan = deriveProcessingPlan(settings({ mode: "depth_skeleton" }), {
      width: 1920,
      height: 1080,
      durationSeconds: 30,
    });
    expect(checkVideoDepthBudget(plan)).toEqual({ ok: true });
  });

  it("refuses a 60s original-resolution job before it starts, naming the numbers", () => {
    // 1080p rgb24 60s@30fps ≈ 11GB —— 用户等不起，必须在开跑前拦下并说清拧哪个旋钮。
    const plan = deriveProcessingPlan(settings({ mode: "depth_skeleton", maxResolution: "original" }), {
      width: 1920,
      height: 1080,
      durationSeconds: 60,
    });
    const verdict = checkVideoDepthBudget(plan);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    expect(verdict.reason).toBe("over-budget");
    if (verdict.reason !== "over-budget") throw new Error("unreachable");
    expect(verdict.expectedRawBytes).toBeGreaterThan(VIDEO_DEPTH_MAX_RAW_BYTES);
    expect(verdict.limitBytes).toBe(VIDEO_DEPTH_MAX_RAW_BYTES);
  });

  it("fails closed when the source was never measured", () => {
    const plan = deriveProcessingPlan(settings(), {});
    expect(checkVideoDepthBudget(plan)).toEqual({ ok: false, reason: "unknown-source" });
  });
});
