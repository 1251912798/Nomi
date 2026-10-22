import { readModelImage } from "./modelImageInput";
import { antigravityConnection, prepareAntigravity, type PreparedAntigravity } from "./antigravityConnection";
import { readAntigravityEvidence } from "./antigravityEvidenceStore";
import { runAntigravityProcess, type AntigravityRunOptions } from "./antigravityProcess";
import { assertPreparedAntigravityMediaInput, prepareAntigravityImageInput, type AntigravityImageInput,
  type PreparedAntigravityImageInput } from "./antigravityMedia";
import type { AntigravityCapability } from "../shared/antigravity";

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw Object.assign(new Error("ANTIGRAVITY_CANCELLED"), { name: "AbortError" });
}
/** 同一个取图函数（electron/ai/modelImageInput.ts），按本机 CLI 的约束收紧：不跟跳转、只收 png / jpeg / webp。 */
export async function loadAntigravityImage(url: string, signal?: AbortSignal): Promise<AntigravityImageInput> {
  checkAbort(signal);
  const image = await readModelImage(url, { signal, allowRedirect: false, types: ["image/png", "image/jpeg", "image/webp"] })
    .catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") throw error;
      return null;
    });
  checkAbort(signal);
  // 读不出 / 不是三种图 / 地址被出站策略拒：对 CLI 一律是同一个稳定码（它的错误契约不变）。
  if (!image) throw new Error("ANTIGRAVITY_IMAGE_SOURCE_INVALID");
  // The process runner fully decodes and copies these bytes into its private task directory.
  return { bytes: image.bytes, mimeType: image.mimeType };
}

export type PreparedAntigravityTask = PreparedAntigravity & {
  capability: AntigravityCapability;
  modelId: string;
  prompt: string;
  model?: string;
  images: PreparedAntigravityImageInput[];
};
type PreparedTaskRecord = {
  invocation: PreparedAntigravity;
  capability: AntigravityCapability;
  modelId: string;
  prompt: string;
  model?: string;
  images: PreparedAntigravityImageInput[];
  imageUrls: string[];
  state: "prepared" | "claimed" | "consumed" | "running";
};
const preparedTasks = new WeakMap<PreparedAntigravityTask, PreparedTaskRecord>();

function copyPreparedInvocation(prepared: PreparedAntigravity): PreparedAntigravity {
  return { discovery: { version: prepared.discovery.version, models: prepared.discovery.models.map((model) => ({ ...model })) },
    invocation: { command: prepared.invocation.command, args: [...prepared.invocation.args] },
    identity: { ...prepared.identity }, env: { ...prepared.env } };
}

function preparedTaskRecord(prepared: PreparedAntigravityTask): PreparedTaskRecord {
  const record = preparedTasks.get(prepared);
  if (!record) throw new Error("ANTIGRAVITY_PREPARED_TASK_INVALID");
  return record;
}

export function assertPreparedAntigravityTaskMatches(prepared: PreparedAntigravityTask, expected: {
  prompt: string; modelId: string; capability: AntigravityCapability; imageUrls: string[];
}): void {
  const record = preparedTaskRecord(prepared);
  if (record.state !== "prepared") throw new Error("ANTIGRAVITY_PREPARED_TASK_INVALID");
  if (record.prompt !== expected.prompt || record.modelId !== expected.modelId
    || record.capability !== expected.capability
    || JSON.stringify(record.imageUrls) !== JSON.stringify(expected.imageUrls)) {
    throw new Error("ANTIGRAVITY_PREFLIGHT_MISMATCH");
  }
  record.state = "claimed";
}

export function consumePreparedAntigravityTask(prepared: PreparedAntigravityTask, expected: {
  prompt: string; modelId: string; capability: AntigravityCapability; imageUrls: string[];
}): void {
  const record = preparedTaskRecord(prepared);
  if (record.state !== "claimed") throw new Error("ANTIGRAVITY_PREPARED_TASK_INVALID");
  if (record.prompt !== expected.prompt || record.modelId !== expected.modelId
    || record.capability !== expected.capability
    || JSON.stringify(record.imageUrls) !== JSON.stringify(expected.imageUrls)) {
    throw new Error("ANTIGRAVITY_PREFLIGHT_MISMATCH");
  }
  record.state = "consumed";
}

export async function prepareAntigravityTask(input: {
  prompt: string;
  model?: string;
  capability: AntigravityCapability;
  imageUrls?: unknown[];
  signal?: AbortSignal;
}): Promise<PreparedAntigravityTask> {
  checkAbort(input.signal);
  if (!input.prompt.trim()) throw new Error("ANTIGRAVITY_EMPTY_PROMPT");
  const imageUrls = [...(input.imageUrls ?? [])];
  if (imageUrls.length > 4 || imageUrls.some((url) => typeof url !== "string" || !url.trim())
    || ((input.capability === "vision" || input.capability === "edit") ? !imageUrls.length : imageUrls.length > 0)) {
    throw new Error("ANTIGRAVITY_INVALID_IMAGES");
  }
  const images: PreparedAntigravityImageInput[] = [];
  for (const url of imageUrls) {
    images.push(await prepareAntigravityImageInput(await loadAntigravityImage(url as string, input.signal), input.signal));
  }
  const prepared = await prepareAntigravity(input.signal);
  checkAbort(input.signal);
  assertPreparedAntigravityMediaInput(input.capability, images, prepared.discovery.version);
  const modelId = input.model || "auto";
  if (modelId !== "auto" && !prepared.discovery.models.some((model) => model.id === modelId)) {
    throw new Error("ANTIGRAVITY_MODEL_UNAVAILABLE");
  }
  // Lazy, idempotent restart restore. Discovery and the historical evidence are
  // both main-owned; renderer/catalog metadata never grants execution.
  antigravityConnection.restore(readAntigravityEvidence());
  const passed = antigravityConnection.hasPassed({ capability: input.capability, modelId }, prepared.discovery.version)
    || (input.capability === "text"
      && antigravityConnection.hasPassed({ capability: "vision", modelId }, prepared.discovery.version));
  if (!passed) throw new Error("ANTIGRAVITY_TEST_REQUIRED");
  const record: PreparedTaskRecord = { invocation: copyPreparedInvocation(prepared), capability: input.capability,
    modelId, prompt: input.prompt, model: input.model, images: [...images], imageUrls: [...imageUrls] as string[],
    state: "prepared" };
  const result: PreparedAntigravityTask = { ...copyPreparedInvocation(prepared), capability: record.capability,
    modelId: record.modelId, prompt: record.prompt, model: record.model, images: [...record.images] };
  preparedTasks.set(result, record);
  return result;
}

export function runPreparedAntigravityTask(prepared: PreparedAntigravityTask,
  options: Pick<AntigravityRunOptions, "signal" | "onDelta"> = {}) {
  checkAbort(options.signal);
  const record = preparedTaskRecord(prepared);
  if (record.state !== "prepared" && record.state !== "consumed") {
    throw new Error("ANTIGRAVITY_PREPARED_TASK_INVALID");
  }
  record.state = "running";
  return runAntigravityProcess({ prompt: record.prompt, model: record.model, capability: record.capability,
    signal: options.signal, onDelta: options.onDelta, cliVersion: record.invocation.discovery.version },
  { preparedInvocation: record.invocation, preparedImages: record.images });
}

export async function runAntigravityTask(input: Omit<AntigravityRunOptions, "images" | "cliVersion"> & { imageUrls?: string[] }) {
  const capability = input.capability ?? ((input.imageUrls?.length ?? 0) ? "vision" : "text");
  const prepared = await prepareAntigravityTask({ prompt: input.prompt, model: input.model, capability,
    imageUrls: input.imageUrls, signal: input.signal });
  return runPreparedAntigravityTask(prepared, { signal: input.signal, onDelta: input.onDelta });
}
