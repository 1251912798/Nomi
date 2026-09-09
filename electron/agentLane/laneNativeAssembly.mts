// Assemble upstream tools; pi owns tool activation and its durable addedToolNames transitions.
import { createLaneModelRead } from './laneModelRead.mjs';
import type { AgentModelEntry } from '../shared/agentCapabilities/availableModels.js';
import type { AgentLane, AgentHarnessTool } from '@earendil-works/pi-agent-core';
import { BACKGROUND_CONTEXT } from '@earendil-works/pi-agent-core/harness/context';
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
export type LaneActiveToolsController = Pick<AgentLane, 'findEntries' | 'appendCustomEntry'>;

export const LANE_CODING_ACCESS_NOTE = 'nomi.coding-access';

export async function createLaneNativeAssembly(input: Omit<LaneCodingToolsInput, 'factories'> & {
  factories?: LaneCodingToolsInput['factories'];
  deferredGroups?: readonly LaneDeferredGroup[];
  availableModels?: () => readonly AgentModelEntry[];
}) {
  let activeTools: LaneActiveToolsController | undefined;
  const canReadProject = async () => {
    if (!activeTools) return false;
    return (await activeTools.findEntries({ type: 'custom', customType: LANE_CODING_ACCESS_NOTE, limit: 1 }, BACKGROUND_CONTEXT)).length > 0;
  };
  const coding = (await createLaneCodingTools({ ...input,
    factories: input.factories ?? await loadPiCodingToolFactories(), canReadProject,
  })).map(tool => tool.name === 'read' ? tool : ({ ...tool,
    execute: async (...args: Parameters<typeof tool.execute>) => {
      if (!(await canReadProject())) throw new Error('Request coding before accessing project files.');
      return tool.execute(...args);
    },
  }));
  const groups: readonly LaneDeferredGroup[] = [
    { name: 'coding', toolNames: LANE_CODING_TOOL_NAMES.filter(name => name !== 'read') }, ...(input.deferredGroups ?? []),
    { name: 'models', toolNames: ['nomi_read'] },
  ];
  const alwaysOn = laneToolMenu().activeToolNames;
  const names = new Set(alwaysOn);
  const byGroup = new Set<string>();
  for (const group of groups) {
    if (!/^[a-z][a-z0-9-]*$/.test(group.name) || byGroup.has(group.name) || !group.toolNames.length) {
      throw new Error(`Invalid or duplicate deferred tool group: ${group.name}`);
    }
    for (const name of group.toolNames) {
      if (!name || names.has(name)) throw new Error(`Duplicate deferred tool name: ${name}`);
      names.add(name);
    }
    byGroup.add(group.name);
  }
  const unlockCoding = async (context: Context) => {
    if (!activeTools) throw new Error('Lane tool controller is not bound.');
    if (!(await activeTools.findEntries({ type: 'custom', customType: LANE_CODING_ACCESS_NOTE, limit: 1 }, context)).length) {
      await activeTools.appendCustomEntry(LANE_CODING_ACCESS_NOTE, { version: 1 }, context);
    }
  };
  const request: AgentHarnessTool<undefined> & { promptSnippet: string } = {
    ...laneRequestToolDefinition(groups),
    execute: async (_id, args, _onUpdate, _toolContext, _invocation, context) => {
      const requested = (args as { group?: unknown }).group;
      // Validate before producing a result. No model value creates a group or a tool.
      if (typeof requested !== 'string' || !byGroup.has(requested)) {
        throw new Error(`Request exactly one registered group: ${[...byGroup].join(', ')}.`);
      }
      if (requested === LANE_CODING_TOOL_GROUP) await unlockCoding(context);
      return {
        content: [{ type: 'text', text: `Selected ${requested}. All tool groups remain available; existing approval and file permissions still apply.` }],
        details: { groups: [requested] },
      };
    },
  };
  const effects: Readonly<Record<string, LaneToolEffects>> = Object.freeze({
    ...LANE_CODING_TOOL_EFFECTS,
    nomi_read: { mutates: false, billable: false, reversal: 'none' },
    [LANE_TOOL_REQUEST_TOOL_NAME]: { mutates: false, billable: false, reversal: 'none' },
  });
  const modelRead = createLaneModelRead(() => input.availableModels?.() ?? []);
  const promptSources = [...coding, modelRead, request] as unknown as PiAgentTool[];
  const promptTools = promptSources.flatMap((tool) => tool.promptSnippet ? [{
    name: tool.name,
    promptSnippet: tool.promptSnippet,
    description: tool.description,
    ...(tool.promptGuidelines ? { promptGuidelines: tool.promptGuidelines } : {}),
  }] : []);
  return {
    tools: [...coding, modelRead as AgentHarnessTool<undefined>, request],
    promptTools,
    groups,
    effects,
    // Creation default only. Never overwrite lane.getActiveTools() on reopen or before_request:
    // pi commits newly unlocked names with each tool result (tool-placement.js:137–156).
    activeToolNames: () => laneToolMenu({ groups }).activeToolNames,
    unlockCoding,
    bindActiveTools: (controller: LaneActiveToolsController) => { activeTools = controller; },
    resolveApprovalSubject: createLaneNativeApprovalResolver({
      projectDir: input.projectDir, sandboxActive: input.sandbox.active, effects,
    }),
    promptSections: codingToolPromptSections(promptSources),
  };
}
