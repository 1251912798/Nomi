import { describe, expect, it } from "vitest";
import {
  POSE_CONNECTIONS_33,
  VIDEO_DEPTH_SKELETON_COLOR,
  renderPoseOverlay,
  type PoseCanvas2D,
} from "./skeletonRenderUtils";

class FakeCtx implements PoseCanvas2D {
  strokeStyle: unknown = "";
  fillStyle: unknown = "";
  lineWidth = 0;
  calls: string[] = [];

  beginPath(): void {
    this.calls.push("begin");
  }
  moveTo(x: number, y: number): void {
    this.calls.push(`move:${x}:${y}`);
  }
  lineTo(x: number, y: number): void {
    this.calls.push(`line:${x}:${y}`);
  }
  closePath(): void {
    this.calls.push("close");
  }
  stroke(): void {
    this.calls.push("stroke");
  }
  arc(x: number, y: number, r: number): void {
    this.calls.push(`arc:${x}:${y}:${r}`);
  }
  fill(): void {
    this.calls.push("fill");
  }
}

const opts = { widthPx: 100, heightPx: 200, style: { lineWidth: 3, jointRadius: 5, confidence: 0.35 } };

function landmark(x: number, y: number, visibility = 1) {
  return { x, y, visibility };
}

describe("pose topology", () => {
  // 越界边（PR #572 里的 [31, 33]）不会抛错，只会静默少画一笔——所以下标上界必须由测试守。
  it("keeps every landmark index inside the 33-point model (0..32)", () => {
    for (const [a, b] of POSE_CONNECTIONS_33) {
      expect(Number.isInteger(a) && a >= 0 && a <= 32).toBe(true);
      expect(Number.isInteger(b) && b >= 0 && b <= 32).toBe(true);
    }
  });

  it("has no duplicate edges", () => {
    const keys = POSE_CONNECTIONS_33.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("carries the official 35 MediaPipe edges with major joints", () => {
    expect(POSE_CONNECTIONS_33).toHaveLength(35);
    const has = (a: number, b: number) =>
      POSE_CONNECTIONS_33.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    expect(has(11, 13)).toBe(true); // left shoulder -> left elbow
    expect(has(11, 23)).toBe(true); // left shoulder -> left hip
    expect(has(15, 19)).toBe(true); // left wrist -> left index
    expect(has(25, 27)).toBe(true); // left knee -> left ankle
  });
});

describe("renderPoseOverlay", () => {
  it("does nothing for empty persons", () => {
    const ctx = new FakeCtx();
    renderPoseOverlay(ctx, [], opts);
    expect(ctx.calls).toEqual([]);
  });

  it("scales normalized coordinates to pixels for joints and connections", () => {
    const ctx = new FakeCtx();
    // left shoulder (11) at center, left elbow (13) shifted
    const person = new Array(34).fill(landmark(0, 0, 0)); // invisible padding below confidence
    person[11] = landmark(0.5, 0.5);
    person[13] = landmark(0.5, 0.6);
    renderPoseOverlay(ctx, [person], opts);
    expect(ctx.calls).toContain("move:50:100");
    expect(ctx.calls).toContain("line:50:120");
    expect(ctx.calls).toContain("arc:50:100:5");
    expect(ctx.calls).toContain("arc:50:120:5");
  });

  it("filters landmarks below the confidence threshold", () => {
    const ctx = new FakeCtx();
    const person = new Array(34).fill(landmark(0, 0));
    person[11] = landmark(0.5, 0.5, 0.1); // below 0.35
    person[13] = landmark(0.5, 0.6, 0.9);
    renderPoseOverlay(ctx, [person], opts);
    expect(ctx.calls).not.toContain("move:50:100");
    expect(ctx.calls).not.toContain("arc:50:100:5");
  });

  it("drops non-finite coordinates", () => {
    const ctx = new FakeCtx();
    const person = new Array(34).fill(landmark(0, 0));
    person[11] = { x: Number.NaN, y: 0.5 };
    person[13] = landmark(0.5, 0.6);
    renderPoseOverlay(ctx, [person], opts);
    expect(ctx.calls).not.toContain("move:NaN:100");
  });

  it("draws multiple persons independently", () => {
    const ctx = new FakeCtx();
    const p1 = new Array(34).fill(landmark(0, 0));
    p1[11] = landmark(0.25, 0.25);
    p1[13] = landmark(0.25, 0.35);
    const p2 = new Array(34).fill(landmark(0, 0));
    p2[11] = landmark(0.75, 0.25);
    p2[13] = landmark(0.75, 0.35);
    renderPoseOverlay(ctx, [p1, p2], opts);
    expect(ctx.calls).toContain("move:25:50");
    expect(ctx.calls).toContain("move:75:50");
  });

  it("skips malformed landmarks without throwing", () => {
    const ctx = new FakeCtx();
    renderPoseOverlay(ctx, [[]], opts);
    renderPoseOverlay(ctx, [[{ x: 0, y: 0 }]], opts);
    expect(() => renderPoseOverlay(ctx, [[landmark(0, 0)]], opts)).not.toThrow();
  });

  it("applies the fixed color and line width", () => {
    const ctx = new FakeCtx();
    const person = new Array(34).fill(landmark(0, 0));
    person[11] = landmark(0.1, 0.1);
    renderPoseOverlay(ctx, [person], opts);
    expect(ctx.strokeStyle).toBe(VIDEO_DEPTH_SKELETON_COLOR);
    expect(ctx.fillStyle).toBe(VIDEO_DEPTH_SKELETON_COLOR);
    expect(ctx.lineWidth).toBe(3);
  });
});
