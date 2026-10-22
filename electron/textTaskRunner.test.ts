import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Model, Vendor } from "./catalog/types";
import type { TaskRequest } from "./runtime";

const mocks = vi.hoisted(() => ({
  callModelOnce: vi.fn(),
  readModelImage: vi.fn(),
  findExecutableModelForTask: vi.fn(),
}));

// 只看执行器交给「调一次模型」核心的参数（看了哪几张图、重试几次）；核心本身由 laneModelCall.test.ts 与调用方矩阵覆盖。
vi.mock("./ai/modelCallBridge", () => ({ callModelOnce: mocks.callModelOnce }));
vi.mock("./ai/modelImageInput", async (importOriginal) => ({
  ...await importOriginal<typeof import("./ai/modelImageInput")>(), readModelImage: mocks.readModelImage }));
vi.mock("./runtime", () => ({
  billingKindForTaskKind: () => "text",
  findExecutableModelForTask: mocks.findExecutableModelForTask,
}));

import { executeTextTask, runTextTaskStream } from "./textTaskRunner";

const genericReference = "https://cdn.example.com/generic-reference.png";

function reply(text: string) {
  return { message: { role: "assistant", content: [{ type: "text", text }], stopReason: "stop" }, model: {}, pricingBasis: "unpriced" };
}
function imageParts(options: { content?: unknown } | undefined): number {
  return Array.isArray(options?.content) ? options.content.filter((part: { type?: string }) => part.type === "image").length : 0;
}

function modelSelection(vendorKey: string, modelKey: string) {
  return {
    vendor: { key: vendorKey, baseUrlHint: "https://relay.example.test/v1" } as Vendor,
    model: { modelKey } as Model,
    apiKey: "test-key",
  };
}

function imagePromptRequest(modelKey: string): TaskRequest {
  return {
    kind: "image_to_prompt",
    prompt: "Describe this image",
    extras: {
      modelKey,
      modelVendor: "comfyui-local",
      parameterReferenceSlots: {
        vendorKey: "comfyui-local",
        modelKey,
        slots: [{ key: "comfy_image_1", label: "Image", group: "reference", mediaKind: "image" }],
      },
      comfy_image_1: null,
      referenceImages: [genericReference],
    },
  };
}

describe("text image selection identity", () => {
  beforeEach(() => {
    mocks.callModelOnce.mockReset().mockResolvedValue(reply("description"));
    mocks.readModelImage.mockReset().mockResolvedValue({ bytes: Buffer.from("png"), mimeType: "image/png" });
    mocks.findExecutableModelForTask.mockReset();
  });

  it("direct execution ignores a stale Comfy contract for the selected non-Comfy model", async () => {
    const selected = modelSelection("openai-compatible", "vision-model");
    await executeTextTask({ ...selected, kind: "image_to_prompt", request: imagePromptRequest("vision-model"), taskId: "direct" });

    // image_to_prompt 现走多图（视频拆解一镜 3 帧）；单图调用方降为单元素数组，语义不变。
    expect(mocks.readModelImage.mock.calls.map((call) => call[0])).toEqual([genericReference]);
    expect(imageParts(mocks.callModelOnce.mock.calls[0]?.[0])).toBe(1);
  });

  it("stream execution ignores a stale Comfy contract for the selected non-Comfy model", async () => {
    const selected = modelSelection("openai-compatible", "vision-model");
    mocks.findExecutableModelForTask.mockReturnValue(selected);
    await runTextTaskStream({ vendor: selected.vendor.key, request: imagePromptRequest("vision-model") });

    expect(mocks.readModelImage.mock.calls.map((call) => call[0])).toEqual([genericReference]);
    expect(imageParts(mocks.callModelOnce.mock.calls[0]?.[0])).toBe(1);
  });

  it("direct execution keeps a selected Comfy pending slot empty instead of using a generic fallback", async () => {
    const selected = modelSelection("comfyui-local", "workflow-model");
    await executeTextTask({ ...selected, kind: "image_to_prompt", request: imagePromptRequest("workflow-model"), taskId: "direct" });

    // Comfy 待填槽（null）→ 契约要求留空，不落通用兜底图。多图入口下应连 imageUrls 都不带。
    expect(mocks.readModelImage).not.toHaveBeenCalled();
    expect(imageParts(mocks.callModelOnce.mock.calls[0]?.[0])).toBe(0);
  });

  it("stream execution keeps a selected Comfy pending slot empty instead of using a generic fallback", async () => {
    const selected = modelSelection("comfyui-local", "workflow-model");
    mocks.findExecutableModelForTask.mockReturnValue(selected);
    await runTextTaskStream({ vendor: selected.vendor.key, request: imagePromptRequest("workflow-model") });

    expect(mocks.readModelImage).not.toHaveBeenCalled();
    expect(imageParts(mocks.callModelOnce.mock.calls[0]?.[0])).toBe(0);
  });
});

describe("重试次数：显式给的才用（拆解路径传 0），没给就是迁移前的缺省 2 次", () => {
  beforeEach(() => { mocks.callModelOnce.mockReset().mockResolvedValue(reply("t")); });
  const run = (extras: Record<string, unknown>) => executeTextTask({
    vendor: { key: "v", baseUrlHint: "https://relay.example.test/v1" } as Vendor, model: { modelKey: "m" } as Model, apiKey: "k", kind: "image_to_prompt", taskId: "t",
    request: { kind: "image_to_prompt", prompt: "p", extras } as TaskRequest,
  });
  it("extras.maxRetries = 0 → 交给核心 0", async () => {
    await run({ maxRetries: 0 });
    expect(mocks.callModelOnce.mock.calls[0][0].maxRetries).toBe(0);
  });
  it("没给 → 缺省 2 次（ai@4 的 SDK 默认，迁移后显式给）", async () => {
    await run({});
    expect(mocks.callModelOnce.mock.calls[0][0].maxRetries).toBe(2);
  });
  it("越界 / 非整数 → 当没给", async () => {
    await run({ maxRetries: 99 });
    await run({ maxRetries: -1 });
    await run({ maxRetries: "0" });
    for (const call of mocks.callModelOnce.mock.calls) expect(call[0].maxRetries).toBe(2);
  });
});
