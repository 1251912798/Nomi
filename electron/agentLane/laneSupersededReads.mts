// Agent lane · 同一回合里「被后来的读取取代了的旧读取结果」不再随每次请求重发（2026-10-06，NF-0928-0003）。
//
// 它在解决哪个真实摩擦（应用内反馈 NF-0928-0003，自建渠道 gpt-5.6-sol）：一个用户回合里读稿 → 写稿 → 再读 → 再写，
// 三回合输入约 39 万 / 38 万 / 88 万 token，第三回合撞上下文窗口失败。真回环重放同一形状
// （`tests/agent-runtime/lane-context-budget.test.mts` 的 NF-0928-0003）量到：每多读一次整份剧本，**之后每一次请求**都多带一份
// 约 1.5 万汉字的旧副本；pi 的阈值压缩确实触发了，但它切不进当前回合（当前回合的消息整段保留），摘要请求白发、
// 请求体照样线性长下去（1.5 万 → 3 万 → 4.4 万 → 5.9 万 → 7.4 万汉字）。
//
// 不变量：读工具的结果是**某个可变资源在那一刻的快照**。同一资源（同一契约 + 同一语义入参）后来又读了一次，
// 旧快照对模型只剩误导——它描述的是一个已经不存在的状态。所以每次请求前，把被取代的旧快照换成一行说明，
// 指向取代它的那次调用。只动发给模型的那一份（pi 的 `transform_context`），**转录一个字不改**：
// 界面、轨迹、回放看到的仍是原样。
//
// 判据从动词声明派生（`effect === 'read'` + `toSemanticInput`），不手列工具名单：新加的读动词自动受益，
// `read_script {}` 与 `read_script {scope:"full"}` 归一成同一资源。
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { toSemanticInput, type ModelFacingToolSpec } from '../shared/agentCapabilities/modelFacingTools.js';

type ToolCallPart = { type: 'toolCall'; id: string; name: string; arguments: unknown };
type ReadCall = { resourceKey: string; continuation: boolean };

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** 读动词的资源键与翻页身份；不是读动词（或参数形状认不出）就 `undefined`。 */
function readCall(spec: ModelFacingToolSpec | undefined, args: unknown): ReadCall | undefined {
  if (!spec || spec.effect !== 'read') return undefined;
  if (args !== undefined && (args === null || typeof args !== 'object' || Array.isArray(args))) return undefined;
  try {
    const input = (args ?? {}) as Record<string, unknown>;
    const selectedFrom = spec.presentationInputFields?.includes('selectedFrom') ? input.selectedFrom : undefined;
    return {
      resourceKey: `${spec.contractId}:${stableJson(toSemanticInput(spec, input))}`,
      continuation: typeof selectedFrom === 'number' && selectedFrom > 0,
    };
  } catch {
    return undefined;
  }
}

export function supersededReadNote(toolName: string, laterToolCallId: string): string {
  return `[Earlier ${toolName} result omitted: the same thing was read again later (call ${laterToolCallId}), `
    + 'and that later result is the current state. Use it; do not read again just to recover this copy.]';
}

/**
 * 发给模型前的那份消息 → 被取代的旧读取结果换成一行说明。
 * 只有**成功**的读取能取代别人、也只有成功的读取会被取代（失败的那条本来就短，且它的失败码对模型有用）。
 */
export function omitSupersededReads(messages: readonly AgentMessage[], specs: readonly ModelFacingToolSpec[]): AgentMessage[] {
  const byName = new Map(specs.map((spec) => [spec.name, spec]));
  const readByCall = new Map<string, ReadCall>();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.content as readonly unknown[]) {
      const call = part as ToolCallPart;
      if (call?.type !== 'toolCall') continue;
      const read = readCall(byName.get(call.name), call.arguments);
      if (read) readByCall.set(call.id, read);
    }
  }

  // A successful page-one read starts a sequence. Continuations belong to that
  // sequence and remain visible beside one another. The next page-one read
  // replaces the complete prior sequence for that resource.
  const epochByResource = new Map<string, number>();
  const epochByCall = new Map<string, number>();
  const latestPageOneByResource = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== 'toolResult' || message.isError) continue;
    const read = readByCall.get(message.toolCallId);
    if (!read) continue;
    const currentEpoch = epochByResource.get(read.resourceKey) ?? 0;
    const epoch = read.continuation ? currentEpoch : currentEpoch + 1;
    epochByResource.set(read.resourceKey, epoch);
    epochByCall.set(message.toolCallId, epoch);
    if (!read.continuation) latestPageOneByResource.set(read.resourceKey, message.toolCallId);
  }
  let changed = false;
  const next = messages.map((message) => {
    if (message.role !== 'toolResult' || message.isError) return message;
    const read = readByCall.get(message.toolCallId);
    const epoch = epochByCall.get(message.toolCallId);
    const winner = read && epoch !== undefined && epoch < (epochByResource.get(read.resourceKey) ?? epoch)
      ? latestPageOneByResource.get(read.resourceKey)
      : undefined;
    if (!winner) return message;
    changed = true;
    return { ...message, content: [{ type: 'text' as const, text: supersededReadNote(message.toolName, winner) }] };
  });
  return changed ? next : [...messages];
}
