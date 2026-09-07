// Agent lane · **按需装载**：哪一组工具这一刻亮着，以及为什么。
//
// ── 它在解决哪个真实摩擦（D6 ①）──
//
// 装了 coding 工具之后 lane 有 11 + 7 = 18 个工具。`LANE_TOOL_BUDGET` 是 12，而
// `laneToolCatalog.ts` 的注释早就写死了处置：**超预算先开延迟加载，不许抬预算**。
// 用户那一刻的感受是：写小说的时候，模型的工具菜单里不该杵着 `bash` 和 `edit`——
// 那不是「多了两行字」，那是每一轮都在花钱买一段与这次创作无关的说明书。
//
// ── 要权衡的那一个东西（D6 ②）──
//
// **每解锁一次，就打一次前缀缓存**——但打多少，取决于**传输**，不取决于我们。
// pi 的 `splitDeferredTools`（`pi-ai/dist/utils/deferred-tools.js`）按传输决定
// 新解锁的工具定义放在**前缀里**还是**转录里**：
//   · `anthropic-messages`  → `compat.supportsToolReferences`（`dist/api/anthropic-messages.js:781`）启用，放转录 → **零缓存代价**
//   · `openai-responses` / `openai-codex-responses` → `compat.supportsAdditionalTools`
//     （`:215` / `:379`）启用，放转录 → **零缓存代价**
//   · `openai-completions`（Chat Completions）→ **只有** `compat.deferredToolsMode === "kimi"`
//     那一条路（`:611-612` / `:1129-1139`），而自动探测**从不**设它（`:1310` 恒 `undefined`）。
//     所以在 DeepSeek / GLM 官方的 chat-completions 上，解锁 = 工具进 `tools` 数组 = 前缀变了 = 缓存失效一次。
//
// 用户 2026-09-07 纠正：**APIMart 是我们自己开发用的中转，不是核心设计**；真实用户接的是
// 各家官方端点（国内 DeepSeek / GLM / Kimi 官方，国外 Anthropic / OpenAI 官方）。所以：
//   ① **解锁策略与传输无关**（下面这三条条件，任何传输上都一样）；
//   ② **放置交给 pi 的 compat 判定**，我们只保证模型档案的 `protocol.api` 声明正确
//      （`electron/harness/runtime/pi/model.mts:49-53` 的 `protocols` 表）；
//   ③ 代码里**不许出现任何「默认走 chat-completions」的假设**——这个文件里一个传输判断都没有，
//      这不是疏忽，是上面那条的落地。
//
// ── 为什么不做「常驻两个、全靠搜」──
//
// Anthropic 给的门槛是 **≥10 个工具或工具定义 >10k token** 才值得延迟，而工具选择准确率
// 通常要到 30–50 个工具之后才开始掉
// （`https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool`）。
// 实测：always-on 11 个 ≈ 5 748 token，全亮 18 个 ≈ 6 854 token——两头都在门槛下面。
// 搜索式每用一个工具多一轮请求，而创作场景一轮里连做几步是常态，那一轮就是纯损耗。
import { LANE_MODEL_TOOL_CATALOG, LANE_TOOL_BUDGET } from './laneToolCatalog.js';
import { LANE_CODING_TOOL_NAMES, type LaneCodingToolName } from './laneCodingTools.mjs';

export type LaneToolGroup = 'always-on' | 'coding';

/** 找工具的那个工具。**唯一一个 always-on 的解锁入口**，schema 极小（照 pi 的 kimi 示例形状）。 */
export const LANE_TOOL_REQUEST_TOOL_NAME = 'nomi_request_tools';

/** 解锁 coding 组的三个条件。任一满足即亮。 */
export type LaneCodingUnlockReason =
  /** ① 当前触发/引用的技能声明需要脚本（自带 `scripts/`，或 frontmatter 写了 `tools: coding`）。 */
  | 'skill-requires-scripts'
  /** ② 用户消息附了代码/HTML/脚本类文件，或显式要求写代码。 */
  | 'user-supplied-code'
  /** ③ 模型自己调了 `nomi_request_tools`（kimi 示例的 `tool_search` 形状）。 */
  | 'model-requested';

export interface LaneToolMenuInput {
  /** 这一刻已经解锁过的理由。**空集 = 还没解锁**。 */
  readonly unlocked: readonly LaneCodingUnlockReason[]
}

export interface LaneToolMenu {
  /** 这一次请求要亮的工具名，**顺序是合同**（前缀稳定才有缓存，`agentToolCatalog.ts:31-35` 同一条纪律）。 */
  readonly activeToolNames: readonly string[]
  /** coding 组亮着吗。投影给面板用（「它现在能跑脚本」是用户该看得见的一件事）。 */
  readonly codingUnlocked: boolean
}

/**
 * 菜单在 `before_request` **逐请求算**，不在会话开头写死。
 *
 * **但解锁是单向的**：亮了就整个会话保持亮，不按回合翻转。理由是上面那条权衡——
 * 每翻一次就在 chat-completions 上打一次缓存，而「这一轮好像用不上了就收回去」
 * 省下的那 1 100 token 远不值一次前缀失效。
 */
export function laneToolMenu(input: LaneToolMenuInput): LaneToolMenu {
  const alwaysOn = LANE_MODEL_TOOL_CATALOG.map((tool) => tool.name);
  const codingUnlocked = input.unlocked.length > 0;
  return {
    activeToolNames: codingUnlocked
      ? [...alwaysOn, LANE_TOOL_REQUEST_TOOL_NAME, ...LANE_CODING_TOOL_NAMES]
      : [...alwaysOn, LANE_TOOL_REQUEST_TOOL_NAME],
    codingUnlocked,
  };
}

/**
 * 一次工具结果要不要带 `addedToolNames`。
 *
 * 这是**给 pi 看的信号**，不是给模型看的：`splitDeferredTools` 读它来决定新解锁的工具
 * 定义放哪儿（转录内还是前缀里）。在支持转录内定义的传输上带了它 = 零缓存代价；
 * 不带 = 白白丢掉那个好处。**所以每一次解锁都必须带上**，即使我们不知道当前是哪个传输——
 * 那正是「放置交给 pi 的 compat 判定」这句话在代码里的样子。
 */
export function addedToolNamesForUnlock(): readonly LaneCodingToolName[] {
  return LANE_CODING_TOOL_NAMES;
}

// ── 预算规则（`check:model-schema` 读这里）─────────────────────────────────

/**
 * 任一「实际亮出的组合」的 schema 总量上限。
 *
 * 数字来自 Anthropic 那条门槛（>10k token 才值得上 tool search），不是我们拍的。
 * **超了的处置写死在这里，不许抬**：把 coding 组再拆成 read-only（read/grep/find/ls）
 * 与 write（edit/write/bash）两个子组分别解锁。写在常量旁边，是因为下一个撞到上限的人
 * 会先看到这句话，而不是先看到那个数字。
 */
export const LANE_TOOL_SCHEMA_TOKEN_CEILING = 10_000;

export interface LaneToolCombination {
  readonly label: string
  readonly toolNames: readonly string[]
  /** 这个组合里所有工具的 description + JSON Schema 的 token 估计（用 pi 自己的估法）。 */
  readonly estimatedTokens: number
}

/**
 * 预算判定。两条，各挡各的：
 *   ① `LANE_TOOL_BUDGET` **只管 always-on 组**——它管的是「随手再加一个常驻工具」；
 *   ② token 上限管**每一个实际组合**——它管的是「常驻数没变，但某个 schema 胖了一倍」。
 * 合成一条就会漏掉后者，而后者才是 #547 那族的形状。
 */
export function evaluateLaneToolBudget(input: {
  alwaysOnCount: number
  combinations: readonly LaneToolCombination[]
}): string[] {
  const failures: string[] = [];
  if (input.alwaysOnCount > LANE_TOOL_BUDGET) {
    failures.push(
      `always-on 组 ${input.alwaysOnCount} 个 > ${LANE_TOOL_BUDGET}。`
      + '合并语义相近的工具，或把新工具放进一个按需解锁的组——不要抬预算。',
    );
  }
  for (const combination of input.combinations) {
    if (combination.estimatedTokens > LANE_TOOL_SCHEMA_TOKEN_CEILING) {
      failures.push(
        `组合「${combination.label}」的 schema 约 ${combination.estimatedTokens} token > ${LANE_TOOL_SCHEMA_TOKEN_CEILING}。`
        + '处置是把 coding 组拆成 read-only（read/grep/find/ls）与 write（edit/write/bash）两个子组分别解锁，'
        + '**不是**抬这个上限。',
      );
    }
  }
  return failures;
}
