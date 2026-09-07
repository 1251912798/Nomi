// `asset.read` 的模型可见描述符。**只投影到 mcp profile**（`profiles: ["mcp"]`）。
//
// 「外部才有」是一条**声明**，不是某个 profile 自己的判断——判断散出去就是第二个真相源。
// 素材查询今天不在 Agent lane 的 12 个工具预算里（`laneToolCatalog.ts` 的 S7 上限），
// 而外部宿主一直有它。声明在这里之后，「谁看得见它」这件事和「它长什么样」住在同一行。
//
// 阶段 5a 在这里消掉的手写映射（方案 §3.1 点名的第三处）：对外 MCP 曾把同一批动作叫成
// `list / get / inspect / source_range / waveform`，再用一条 `parseCall` 里的三元表达式
// 链接回契约的 `search_media / get_media / inspect_media / inspect_source_range / read_waveform`。
// 两套词表的差价是：外部宿主读到的动作名，Nomi 自己的日志、收据、错误里一个都搜不到。
import {
  ASSET_READ_ALIASES,
  assetReadPiDescriptionForAlias,
  assetReadPiInputSchemaForAlias,
} from "./assetRead";
import { modelArgumentTolerance } from "./modelArgumentTolerance";
import type { ModelFacingToolSpec } from "./modelFacingTools";

const ASSET_READ_EFFECTS = Object.freeze({ mutates: false, billable: false, reversal: "none" } as const);

const ASSET_GUIDELINES = Object.freeze([
  "Media is addressed by stable asset id, never by a file path: the id is what search_media returns and what every other media tool takes.",
  "These tools report bounded technical facts (duration, codec, frame ranges, waveform buckets). They never claim to have watched or listened to the media.",
]);

const SNIPPETS: Readonly<Record<string, string>> = {
  [ASSET_READ_ALIASES.get]: "read one media record by asset id.",
  [ASSET_READ_ALIASES.inspect]: "read bounded technical metadata for one media asset.",
  [ASSET_READ_ALIASES.search]: "search the project's media and get back path-free records.",
  [ASSET_READ_ALIASES.inspectRange]: "check one source frame range and list where it is used.",
  [ASSET_READ_ALIASES.waveform]: "read peak/RMS waveform buckets for one audio range.",
};

/**
 * 描述必须够厚（`check:model-schema` 的 `thin-description` 门槛 120 字符）。
 * 契约上那一句是给能力投影用的一行摘要，这里补上「有什么限制、输出会不会被截断」两件事——
 * 那正是通道① 该说而摘要说不下的。
 */
const LIMITS: Readonly<Record<string, string>> = {
  [ASSET_READ_ALIASES.get]: "Returns the stored record only; no file path, no URL, and no media bytes ever cross this boundary.",
  [ASSET_READ_ALIASES.inspect]: "Returns container-level facts only. It does not describe what is visible or audible in the media.",
  [ASSET_READ_ALIASES.search]: "Results are bounded by `limit` (default and maximum are enforced server-side); narrow with `query` and `kinds` rather than paging blindly.",
  [ASSET_READ_ALIASES.inspectRange]: "Frames are integer source-frame numbers at the asset's own frame rate, which is not necessarily the project frame rate.",
  [ASSET_READ_ALIASES.waveform]: "Seconds are measured from the start of the asset; `buckets` caps how many samples come back, so ask for the resolution you actually need.",
};

export function assetModelToolSpecs(): ModelFacingToolSpec[] {
  return (Object.values(ASSET_READ_ALIASES) as string[]).map((alias): ModelFacingToolSpec => {
    const schema = assetReadPiInputSchemaForAlias(alias);
    const description = assetReadPiDescriptionForAlias(alias);
    if (!schema || !description) throw new Error(`Unregistered asset.read alias: ${alias}`);
    return {
      contractId: "asset.read",
      name: alias,
      description: `${description} ${LIMITS[alias]}`,
      promptSnippet: SNIPPETS[alias],
      promptGuidelines: ASSET_GUIDELINES,
      effects: ASSET_READ_EFFECTS,
      schema,
      examples: [],
      aliasBoundInput: Object.freeze({ operation: alias }),
      profiles: Object.freeze(["mcp" as const]),
      prepareArguments: modelArgumentTolerance({ arrayFields: ["kinds"] }),
    };
  });
}
