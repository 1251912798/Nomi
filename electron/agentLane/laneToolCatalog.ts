// Agent lane · **模型可见工具面的目录**（说明书那一半，无需任何领域 port）。
//
// 一份纯数据的清单，三个用户：
//   ① `scripts/check-model-schema.ts` —— 存量棘轮，直接 import 就能量「模型看到了什么」；
//   ② `lanePromptSections.ts` —— 渲染系统提示词的 `Available tools` / `Guidelines` 两段（G-03）；
//   ③ `tests/agent-runtime/lane-tool-contract.test.mts` —— 逐条把示例喂回自己的 schema。
//
// ③ 不是形式主义：一个**过不了自己 schema 的示例**比没有示例更糟，它主动教模型写错，
// 而且没有任何别的东西会发现——示例是纯文本，编译器、单测、门岗谁都不看它。
//
// **顺序是合同，不是审美**：`agentToolCatalog.ts:31-35` 已经把「`tools/list` 的确定性顺序」
// 定成 prompt/KV-cache 合同（上游 `splitDeferredTools` 靠稳定前缀保住缓存）。这里同一条纪律：
// 目录按固定顺序拼，别按 `Object.keys` 之类会随实现漂的东西。
import type { LaneToolSpec } from "../shared/agentLane/laneToolContract";
import { canvasLaneToolSpecs } from "./laneCanvasTools";
import { documentLaneToolSpecs } from "./laneDocumentTools";
import { timelineLaneToolSpecs } from "./laneTimelineTools";

/**
 * 一个 profile 最多几个工具（方案 §3.2 S7）。
 *
 * 今天旧通路的 production profile 是 **30 个 / 12 641 token**，而这里是 12。数字本身不是
 * 目的——上游 pi 自己只有 8 个内建工具，而 #547 的数据说选错工具从来不是主要失败模式。
 * 定这个上限是为了让「再加一个工具」变成一次**必须解释的**决定，而不是随手 push。
 *
 * ⚠️ 上游还有第二条路我们没走：`addedToolNames` 动态装载（G-09）——工具结果可以解锁更多
 * 工具，且 `splitDeferredTools` 会把新解锁的排在请求靠后的位置以保住 prompt cache
 * （`pi-ai/dist/utils/deferred-tools.js:3-34`）。lane 今天 12 个塞得下，所以不需要它；
 * 阶段 3 接生成类工具时会塞不下，那时它是现成的答案。这条写在这里，是为了下一个人
 * 撞到上限时知道有第二条路，而不是先去把 12 改成 20。
 *
 * **延迟加载的闸门（方案 §3.7 第 ⑫ 维，别凭感觉开）**：Anthropic 给的判据是
 * 「≥10 个工具**或**工具定义 >10k token」才上 tool search，而工具选择准确率通常要到
 * 30–50 个工具之后才开始掉（platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool）。
 * lane 今天 11 个 / 20 272 字节 ≈ 5k token：工具数刚过 10，token 只到闸门的一半，
 * 而 #547 的数据说我们的失败模式从来不是选错工具。所以**不开**。
 * 触发条件写死在这里：**工具数超预算，或 schema 总量 >10k token，先开延迟加载，不许抬预算。**
 */
export const LANE_TOOL_BUDGET = 12;

function buildCatalog(): readonly LaneToolSpec[] {
  const specs = [...documentLaneToolSpecs(), ...canvasLaneToolSpecs(), ...timelineLaneToolSpecs()];
  const names = new Set<string>();
  for (const spec of specs) {
    if (names.has(spec.name)) throw new Error(`Duplicate lane tool name: ${spec.name}`);
    names.add(spec.name);
  }
  if (specs.length > LANE_TOOL_BUDGET) {
    throw new Error(
      `Lane tool budget exceeded: ${specs.length} > ${LANE_TOOL_BUDGET}. `
      + "合并语义相近的工具，或按 G-09 用 addedToolNames 做动态装载——不要直接抬高上限。",
    );
  }
  return Object.freeze(specs);
}

export const LANE_MODEL_TOOL_CATALOG: readonly LaneToolSpec[] = buildCatalog();
