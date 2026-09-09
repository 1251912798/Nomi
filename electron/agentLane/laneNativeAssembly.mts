// Assemble upstream tools; pi owns tool activation and its durable addedToolNames transitions.
import type { AgentHarnessTool } from '@earendil-works/pi-agent-core';
import type { Context } from '@earendil-works/pi-agent-core/harness/context';
import type { LaneToolEffects } from '../shared/agentLane/laneToolContract.js';
import {
  createLaneCodingTools, LANE_CODING_TOOL_EFFECTS, LANE_CODING_TOOL_NAMES,
  loadPiCodingToolFactories, codingToolPromptSections,
  type LaneCodingToolsInput, type PiAgentTool,
} from './laneCodingTools.mjs';
import { createLaneNativeApprovalResolver } from './laneNativeApproval.js';
import {
  laneToolMenu, laneRequestToolDefinition, LANE_TOOL_REQUEST_TOOL_NAME, LANE_CODING_TOOL_GROUP,
  type LaneCodingUnlockReason,
} from './laneToolGroups.mjs';

export interface LaneDeferredGroup {
  readonly name: string;
  readonly toolNames: readonly string[];
}

/**
 * pi 那一侧「这条 lane 现在亮着哪些工具」的公开读写面（`AgentLane` 就长这样）。
 *
 * 装配层拿不到 lane——lane 是 harness 建出来的，而 harness 要先吃到装配好的工具表。
 * 所以由宿主在 `harness.lane()` 之后回头把它交进来。**不复制一份本地激活状态**：
 * 唯一真相仍然是 pi 的快照，这里只是一支笔。
 */
export interface LaneActiveToolsController {
  getActiveTools(context: Context): Promise<readonly string[]>;
  setActiveTools(toolNames: string[], context: Context): Promise<void>;
}

/**
 * 两份菜单一不一样。**逐个比，不拼字符串**：工具名是模型可见的外部输入面，
 * 用任何分隔符去拼都会在「名字里正好有那个分隔符」时把两份不同的菜单看成同一份，
 * 而那一次的后果是该换的组没换、模型手里还拿着上一个领域的工具。
 */
function sameToolMenu(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

export async function createLaneNativeAssembly(input: Omit<LaneCodingToolsInput, 'factories'> & {
  factories?: LaneCodingToolsInput['factories'];
  deferredGroups?: readonly LaneDeferredGroup[];
  initialUnlockReasons?: readonly LaneCodingUnlockReason[];
}) {
  const coding = await createLaneCodingTools({ ...input, factories: input.factories ?? await loadPiCodingToolFactories() });
  const groups: readonly LaneDeferredGroup[] = [
    { name: 'coding', toolNames: LANE_CODING_TOOL_NAMES }, ...(input.deferredGroups ?? []),
  ];
  const alwaysOn = laneToolMenu().activeToolNames;
  const names = new Set(alwaysOn);
  const byGroup = new Map<string, readonly string[]>();
  for (const group of groups) {
    if (!/^[a-z][a-z0-9-]*$/.test(group.name) || byGroup.has(group.name) || !group.toolNames.length) {
      throw new Error(`Invalid or duplicate deferred tool group: ${group.name}`);
    }
    for (const name of group.toolNames) {
      if (!name || names.has(name)) throw new Error(`Duplicate deferred tool name: ${name}`);
      names.add(name);
    }
    byGroup.set(group.name, [...group.toolNames]);
  }
  // 换组的那支笔。宿主在 `harness.lane()` 之后交进来；单测直接调 `execute` 时它是空的，
  // 那时「上一份菜单」按常驻算——本地不留第二份激活状态。
  let activeTools: LaneActiveToolsController | undefined;
  const request: AgentHarnessTool<undefined> & { promptSnippet: string } = {
    ...laneRequestToolDefinition(groups),
    execute: async (_id, args, _onUpdate, _toolContext, _invocation, context) => {
      const requested = (args as { group?: unknown }).group;
      // Validate before producing a result. No model value creates a group or a tool.
      if (typeof requested !== 'string' || !byGroup.has(requested)) {
        throw new Error(`Request exactly one registered group: ${[...byGroup.keys()].join(', ')}.`);
      }
      const next = [...laneToolMenu({ groups, activeGroup: requested }).activeToolNames];
      const previous = [...(activeTools ? await activeTools.getActiveTools(context) : alwaysOn)];
      // pi 的 `addedToolNames` 是**只增**的信号，撤不回一个组；撤回走公开的 `setActiveTools`。
      // 两个一起用：`setActiveTools` 决定下一次请求发哪些，`addedToolNames` 决定新增的那几个
      // 定义放转录还是放前缀（`splitDeferredTools` 按传输判，我们不判）。
      if (activeTools && !sameToolMenu(previous, next)) await activeTools.setActiveTools(next, context);
      const added = next.filter((name) => !previous.includes(name));
      const retired = previous.filter((name) => !next.includes(name));
      return {
        content: [{ type: 'text', text:
          `Always available: ${alwaysOn.join(', ')}. `
          + `Added by ${requested}: ${added.join(', ') || 'none'}. `
          + `Retired: ${retired.join(', ') || 'none'}.`
          + ' Existing approval and file permissions still apply.' }],
        details: { groups: [requested] },
        ...(added.length ? { addedToolNames: added } : {}),
      };
    },
  };
  const effects: Readonly<Record<string, LaneToolEffects>> = Object.freeze({
    ...LANE_CODING_TOOL_EFFECTS,
    [LANE_TOOL_REQUEST_TOOL_NAME]: { mutates: false, billable: false, reversal: 'none' },
  });
  const promptSources = [...coding, request] as unknown as PiAgentTool[];
  const promptTools = promptSources.flatMap((tool) => tool.promptSnippet ? [{
    name: tool.name,
    promptSnippet: tool.promptSnippet,
    ...(tool.promptGuidelines ? { promptGuidelines: tool.promptGuidelines } : {}),
  }] : []);
  return {
    tools: [...coding, request],
    promptTools,
    groups,
    effects,
    // Creation default only. Never overwrite lane.getActiveTools() on reopen or before_request:
    // pi commits newly unlocked names with each tool result (tool-placement.js:137–156).
    activeToolNames: () => laneToolMenu({
      groups, ...(input.initialUnlockReasons?.length ? { activeGroup: LANE_CODING_TOOL_GROUP } : {}),
    }).activeToolNames,
    /** 技能声明要脚本 / 用户附了代码 → 宿主直接把菜单切到 coding 组（不是往上并集）。 */
    menuForUnlock: (_reason: LaneCodingUnlockReason) =>
      laneToolMenu({ groups, activeGroup: LANE_CODING_TOOL_GROUP }).activeToolNames,
    bindActiveTools: (controller: LaneActiveToolsController) => { activeTools = controller; },
    resolveApprovalSubject: createLaneNativeApprovalResolver({
      projectDir: input.projectDir, sandboxActive: input.sandbox.active, effects,
    }),
    promptSections: codingToolPromptSections(promptSources),
  };
}
