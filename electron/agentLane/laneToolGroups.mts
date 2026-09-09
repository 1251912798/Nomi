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
//      （`electron/agentLane/laneModelProvider.mts:58-62` 的 `protocols` 表）；
//   ③ 代码里**不许出现任何「默认走 chat-completions」的假设**——这个文件里一个传输判断都没有，
//      这不是疏忽，是上面那条的落地。
//
// ── 为什么不做「常驻两个、全靠搜」──
//
// Anthropic 给的门槛是 **≥10 个工具或工具定义 >10k token** 才值得延迟，而工具选择准确率
// 通常要到 30–50 个工具之后才开始掉
// （`https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool`）。
// 搜索式每用一个工具多一轮请求，而创作场景一轮里连做几步是常态，那一轮就是纯损耗。
//
// ── 为什么「同一时刻只亮一个领域组」（2026-09-08 主会话裁决）──
//
// 领域组接完之后一共 6 个（coding / media / timeline / maintenance / generation / production）。
// 实测 token（`scripts/check-model-schema.ts` 每次跑都会打出来）：常驻含 request 4 622；
// 常驻 + 任一单组最大 6 547（timeline）；**全部亮起 11 915**。上限 10 000 来自 Anthropic
// 那条门槛，**不抬**——所以解法只能在运行时那一侧：任何一次请求里点亮的组合
// 都是「常驻 + 至多一个领域组」，换组时上一组回到 deferred。
//
// 这不是「省 token 的小气」，是用户那一刻的事实：他在剪时间轴的时候，模型的菜单里
// 不该同时杵着 `bash` 和生图工具。切换的代价是**至多一次前缀缓存失效**（见上面那段：
// 只在 chat-completions 上真的失效，其余传输由 `addedToolNames` 放进转录，零代价），
// 而收益是每一轮都不再为另外 5 个领域的说明书付钱。
import { LANE_MODEL_TOOL_CATALOG, LANE_TOOL_BUDGET } from './laneToolCatalog.js';
import { LANE_CODING_TOOL_NAMES } from './laneCodingTools.mjs';
import { Type } from 'typebox';

/** 一个可按需点亮的领域组。`coding` 由装配层注册，其余来自 `LANE_DEFERRED_TOOL_GROUPS`。 */
export interface LaneToolGroupDefinition {
  readonly name: string
  readonly toolNames: readonly string[]
}

/** pi 自带那 7 个 coding 工具所在的组名。解锁条件（下面三条）只对它成立。 */
export const LANE_CODING_TOOL_GROUP = 'coding';

/** 找工具的那个工具。**唯一一个 always-on 的解锁入口**，schema 极小（照 pi 的 kimi 示例形状）。 */
export const LANE_TOOL_REQUEST_TOOL_NAME = 'nomi_request_tools';

/**
 * The assembly and budget gate consume the exact same model-visible definition.
 *
 * 参数是**一个**组，不是一个数组：运行时同一时刻只亮一个领域组，让模型可以请求两个
 * 然后悄悄只给它一个，是拿一个假承诺换一行 schema。
 */
export function laneRequestToolDefinition(groups: readonly { name: string }[]) {
  return {
    name: LANE_TOOL_REQUEST_TOOL_NAME,
    label: 'Tools',
    description: `Switch this conversation to one group of additional tools. Groups: ${groups.map(group => group.name).join(', ')}. `
      + 'Core tools stay available in every group. One group is available at a time: requesting a group retires the previous one, and you can switch back later at any point. '
      + 'Request coding before reading an installed Skill or working with project files. Activation does not approve any action.',
    promptSnippet: 'Switch to another tool group when the current tools do not cover the task',
    parameters: Type.Object({
      group: Type.String({ enum: groups.map(group => group.name) }),
    }, { additionalProperties: false }),
    replay: 'safe' as const,
  };
}

/** 解锁 coding 组的三个条件。任一满足即亮。 */
export type LaneCodingUnlockReason =
  /** ① 当前触发/引用的技能声明需要脚本（自带 `scripts/`，或 frontmatter 写了 `tools: coding`）。 */
  | 'skill-requires-scripts'
  /** ② 用户消息附了代码/HTML/脚本类文件，或显式要求写代码。 */
  | 'user-supplied-code'
  /** ③ 模型自己调了 `nomi_request_tools`（kimi 示例的 `tool_search` 形状）。 */
  | 'model-requested';

export interface LaneToolMenuInput {
  /** 已注册的领域组。缺省 = 只认 `coding` 那一组（单测与装配层默认）。 */
  readonly groups?: readonly LaneToolGroupDefinition[]
  /** 这一刻点亮的那**一个**领域组；`null` / 缺省 = 只有常驻。 */
  readonly activeGroup?: string | null
}

export interface LaneToolMenu {
  /** 这一次请求要亮的工具名，**顺序是合同**（前缀稳定才有缓存，`agentToolCatalog.ts:31-35` 同一条纪律）。 */
  readonly activeToolNames: readonly string[]
  /** 亮着的那个领域组的名字，没有就是 `null`。 */
  readonly activeGroup: string | null
  /** coding 组亮着吗。投影给面板用（「它现在能跑脚本」是用户该看得见的一件事）。 */
  readonly codingUnlocked: boolean
}

/**
 * 菜单在换组的那一刻算一次，不在会话开头写死，也不按回合翻转。
 *
 * **这是唯一一份「这一刻该亮哪些工具」的算法**：装配层的 `nomi_request_tools`、
 * 宿主的技能解锁、`check:model-schema` 的预算组合，三处都调它。散出去第二份，
 * 门岗量的就不再是运行时真正发出去的那份菜单。
 */
export function laneToolMenu(input: LaneToolMenuInput = {}): LaneToolMenu {
  const alwaysOn = [...LANE_MODEL_TOOL_CATALOG.map((tool) => tool.name), LANE_TOOL_REQUEST_TOOL_NAME];
  const requested = input.activeGroup ?? null;
  if (requested === null) return { activeToolNames: alwaysOn, activeGroup: null, codingUnlocked: false };
  const groups = input.groups ?? [{ name: LANE_CODING_TOOL_GROUP, toolNames: LANE_CODING_TOOL_NAMES }];
  const group = groups.find((candidate) => candidate.name === requested);
  if (!group) throw new Error(`Unknown lane tool group: ${requested}. Registered: ${groups.map((one) => one.name).join(', ')}.`);
  return {
    activeToolNames: [...alwaysOn, ...group.toolNames],
    activeGroup: group.name,
    codingUnlocked: group.name === LANE_CODING_TOOL_GROUP,
  };
}

// ── 预算规则（`check:model-schema` 读这里）─────────────────────────────────

/**
 * 任一「运行时真的会亮出来的组合」的 schema 总量上限。
 *
 * 数字来自 Anthropic 那条门槛（>10k token 才值得上 tool search），不是我们拍的。
 * **超了的处置写死在这里，不许抬**：把超限的那个组按 read / write 拆成两个子组分别解锁
 * （coding 组的拆法是 read/grep/find/ls 与 edit/write/bash）。写在常量旁边，是因为
 * 下一个撞到上限的人会先看到这句话，而不是先看到那个数字。
 */
export const LANE_TOOL_SCHEMA_TOKEN_CEILING = 10_000;

export interface LaneToolCombination {
  readonly label: string
  readonly toolNames: readonly string[]
  /** 这个组合里所有工具的 description + JSON Schema 的 token 估计（用 pi 自己的估法）。 */
  readonly estimatedTokens: number
  /**
   * 只报告、不作判据。
   *
   * 唯一合法的用处是「全部组一起亮」那个数：`laneToolMenu` 结构上就发不出这份菜单
   * （同一时刻至多一个领域组），拿一个发不出去的组合去判红，判的是一个不存在的运行时。
   * 但它仍然要**打印**——它是「组数还能不能再涨」的那把尺子。
   */
  readonly reportOnly?: boolean
}

/**
 * 预算判定。两条，各挡各的：
 *   ① `LANE_TOOL_BUDGET` **只管 always-on 组**——它管的是「随手再加一个常驻工具」；
 *   ② token 上限管**每一个真会亮出来的组合**（常驻 + 每一个单组，逐一算）——
 *      它管的是「常驻数没变，但某个 schema 胖了一倍」。
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
    if (combination.reportOnly) continue;
    if (combination.estimatedTokens > LANE_TOOL_SCHEMA_TOKEN_CEILING) {
      failures.push(
        `组合「${combination.label}」的 schema 约 ${combination.estimatedTokens} token > ${LANE_TOOL_SCHEMA_TOKEN_CEILING}。`
        + '处置是把这个组按 read / write 拆成两个子组分别解锁（coding 组即 read/grep/find/ls 与 edit/write/bash），'
        + '**不是**抬这个上限。',
      );
    }
  }
  return failures;
}
