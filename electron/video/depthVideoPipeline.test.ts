import { describe, expect, it } from "vitest";
import {
  buildExtractFramesArgs,
  buildProbeArgs,
  buildRawStdinToMp4Args,
  parseProbeOutput,
  videoDepthFrameFileName,
} from "./depthVideoPipeline";

describe("buildExtractFramesArgs", () => {
  const args = buildExtractFramesArgs({
    sourcePath: "/tmp/src.mp4",
    startSeconds: 2,
    durationSeconds: 4,
    fps: 24,
    outWidth: 518,
    outHeight: 290,
    outDir: "/tmp/job/frames",
  });

  it("seeks on the input side and uses -t, not -to", () => {
    // -ss 在 -i 之前 = 输入端 seek（关键帧跳转，长片快一个数量级）；此后时间轴归零，
    // -to 会指向错的位置，所以窗口只能用 -t 表达。
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
    expect(args).toContain("-t");
    expect(args).not.toContain("-to");
  });

  it("pins fps and output size in one filter chain", () => {
    expect(args).toContain("fps=24,scale=518:290:flags=bicubic");
  });

  it("writes a zero-padded sequence the reader can address by index", () => {
    expect(args[args.length - 1]).toBe("/tmp/job/frames/f_%04d.jpg");
    expect(videoDepthFrameFileName(1)).toBe("f_0001.jpg");
    expect(videoDepthFrameFileName(1234)).toBe("f_1234.jpg");
  });
});

describe("buildRawStdinToMp4Args", () => {
  it("reads raw frames from stdin so no intermediate .raw ever hits the disk", () => {
    const args = buildRawStdinToMp4Args({
      outWidth: 518,
      outHeight: 290,
      fps: 30,
      pixelFormat: "gray",
      outMp4: "/tmp/job/depth.mp4",
    });
    expect(args).toContain("pipe:0");
    expect(args.some((a) => a.endsWith(".raw"))).toBe(false);
    expect(args[args.indexOf("-pix_fmt") + 1]).toBe("gray");
    // 输出仍然是所有播放器/上传通道都吃得下的 yuv420p。
    expect(args.lastIndexOf("-pix_fmt")).toBeGreaterThan(args.indexOf("-i"));
    expect(args[args.lastIndexOf("-pix_fmt") + 1]).toBe("yuv420p");
    expect(args[args.length - 1]).toBe("/tmp/job/depth.mp4");
  });

  it("declares rgb24 for the skeleton modes", () => {
    const args = buildRawStdinToMp4Args({
      outWidth: 640,
      outHeight: 360,
      fps: 24,
      pixelFormat: "rgb24",
      outMp4: "/tmp/o.mp4",
    });
    expect(args[args.indexOf("-pix_fmt") + 1]).toBe("rgb24");
  });
});

describe("parseProbeOutput", () => {
  it("reads width, height and duration", () => {
    const stdout = JSON.stringify({ streams: [{ width: 1920, height: 1080 }], format: { duration: "12.5" } });
    expect(parseProbeOutput(stdout)).toEqual({ width: 1920, height: 1080, durationSeconds: 12.5 });
  });

  it("fails closed on anything incomplete rather than guessing a default", () => {
    // 量不出就不开跑——猜一个 1280x720 会让预算门与进度条一起说谎。
    expect(parseProbeOutput("not json")).toBeNull();
    expect(parseProbeOutput(JSON.stringify({ streams: [], format: { duration: "3" } }))).toBeNull();
    expect(parseProbeOutput(JSON.stringify({ streams: [{ width: 100 }], format: { duration: "3" } }))).toBeNull();
    expect(parseProbeOutput(JSON.stringify({ streams: [{ width: 100, height: 50 }], format: {} }))).toBeNull();
    expect(parseProbeOutput(JSON.stringify({ streams: [{ width: 0, height: 50 }], format: { duration: "3" } }))).toBeNull();
    expect(parseProbeOutput(JSON.stringify({ streams: [{ width: 10, height: 5 }], format: { duration: "0" } }))).toBeNull();
  });

  it("asks ffprobe only for the fields it parses", () => {
    const args = buildProbeArgs("/tmp/src.mp4");
    expect(args).toContain("stream=width,height:format=duration");
    expect(args[args.length - 1]).toBe("/tmp/src.mp4");
  });
});
