// 拆解「读图腿」用哪个模型——唯一的解析点（与转写腿 `resolveTranscribeLeg` 同形：显式身份 + 软偏好 + 自动）。
//
// 2026-10-11 用户走查第 1 条：读图腿原来只有「自动挑目录序第一个能读图的」一条路——用户只连了一家免费限流的就必中它，
// 逐镜撞 429，既换不了模型也看不到原话。三种来源，按优先级：
//   · requested（显式）：用户在分镜表底栏选的。**解不出就整次拒绝**，绝不悄悄回落到别家——
//     「我选了 A，它偷偷用了 B 并扣了 B 的钱」是这条路上最糟的失败（同转写腿的规矩）。
//   · preferred（软偏好）：渲染层带来的「用户在 Agent 面板里选的脑」。**只有它此刻可用且能读图才采用**，
//     否则当没给——软偏好从不报错、也不拦路。
//   · 都没有：自动挑（`resolveTextBrainKeys({preferImageInput})`，旧行为）。
// 能不能读图的判据是现成的 `modelSupportsImageInput`，可用性是现成的 `findExecutableModel`；这里不另写第二份。
import { findExecutableModel } from "../catalog/executableModel";
import { modelSupportsImageInput } from "../ai/agentUserContent";
import { resolveTextBrainKeys } from "../ai/textBrainResolver";

export type VisionLegIdentity = { vendorKey: string; modelKey: string };

export type VisionLegResolution =
  | { ok: true; vendor: string; modelKey: string }
  | { ok: false; reason: "requested-unavailable"; requested: VisionLegIdentity; detail: string }
  | { ok: false; reason: "no-vision-model" };

/** payload 来自 IPC（未经 schema）：不是两段非空字符串就当没给。 */
function cleanIdentity(value: unknown): VisionLegIdentity | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { vendorKey, modelKey } = value as { vendorKey?: unknown; modelKey?: unknown };
  return typeof vendorKey === "string" && vendorKey.trim() && typeof modelKey === "string" && modelKey.trim()
    ? { vendorKey: vendorKey.trim(), modelKey: modelKey.trim() }
    : undefined;
}

export function resolveVisionLeg(raw: { requested?: unknown; preferred?: unknown }): VisionLegResolution {
  const input = { requested: cleanIdentity(raw.requested), preferred: cleanIdentity(raw.preferred) };
  if (input.requested) {
    try {
      const { vendor, model } = findExecutableModel(input.requested.vendorKey, input.requested.modelKey, "text");
      return { ok: true, vendor: vendor.key, modelKey: model.modelKey };
    } catch (error) {
      return { ok: false, reason: "requested-unavailable", requested: input.requested, detail: error instanceof Error ? error.message : String(error) };
    }
  }
  if (input.preferred) {
    try {
      const { vendor, model } = findExecutableModel(input.preferred.vendorKey, input.preferred.modelKey, "text");
      if (modelSupportsImageInput(model.modelKey, model.modelAlias, model.meta)) return { ok: true, vendor: vendor.key, modelKey: model.modelKey };
    } catch {
      /* 软偏好用不了：当没给，走自动 */
    }
  }
  const brain = resolveTextBrainKeys({ preferImageInput: true });
  return brain ? { ok: true, vendor: brain.vendor, modelKey: brain.modelKey } : { ok: false, reason: "no-vision-model" };
}
