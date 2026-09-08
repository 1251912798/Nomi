// L2 · 回放影子的**回放引擎**（方案 §2.3 第二行）。
//
// 一句话：把一条真实录下来的助手回复，**逐字**当成供应商的输出重放进一条新 lane，
// 再看新通路的投影和录下来的东西是不是一个字都不差；然后 close → reopen 再比一遍。
//
// 三个判据在这一层实现，判定在 `agent-lane-replay-shadow.mts`：
//   · 一致率  —— `compareSteps` 的逐项相等（不是相似度、不是包含）
//   · 崩溃数  —— 回放过程中抛出的任何异常
//   · 冷重启  —— 关掉再开，同一条会话的投影逐项相等
//
// **为什么不用生产的 `openLane`**：它只露 `prompt` / `abort` 两条命令（那是产品面），
// 而回放要往转录里回填前文，用的是 `AgentLane.appendMessage`。所以走
// `stage3ProbeHarness.openProbeLane`——同一套装配、同一个 `projectLaneSnapshot`，
// 只是把 lane 本体交出来。这里**不做第二个投影**：拿到快照后调的就是生产那一个函数。
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentMessage } from '@earendil-works/pi-agent-core';

import { createDocumentLaneTools } from '../../electron/agentLane/laneDocumentTools.js';
import { projectLaneSnapshot } from '../../electron/shared/agentLane/laneProjection.js';
import type { OpenLaneOptions } from '../../electron/agentLane/laneRuntimePort.js';
import type { LaneProjection } from '../../electron/shared/agentLane/laneContracts.js';
import { createHttpFixture, type FixturePart, type FixtureReply } from './httpFixture.mjs';
import { createDocumentPort, LANE_SYSTEM_PROMPT } from './laneFixture.mjs';
import type { RecordedConversation, RecordedMessage, RecordedPart } from './replayShadowSources.mjs';
import { PROBE_CONTEXT, openProbeLane, type ProbeCleanup } from './stage3ProbeHarness.mjs';

/** 回放这一轮之后，模型如果还要再说一句（工具被闸拒了），让它说这句然后收尾。 */
const SETTLE_TEXT = 'REPLAY_SHADOW_SETTLE';
/** 闸对**每一个**工具调用的答复。回放不执行任何真实工具——它比的是转录，不是副作用。 */
const GATE_REASON = 'Replay shadow does not execute tools; this turn is a transcript comparison only.';
const REPLAY_TIMESTAMP = 1_700_000_000_000;

// ---------------------------------------------------------------------------
// 零额度：出站看门狗
// ---------------------------------------------------------------------------

export class OutboundBlocked extends Error {}

function hostIsLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1';
}

/** 只允许回环。**这是「零额度」这条判据的执行点**，不是注释里的承诺。 */
export function assertLoopbackUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new OutboundBlocked(`Replay shadow refuses a non-URL endpoint: ${url}`);
  }
  if (!hostIsLoopback(parsed.hostname)) {
    throw new OutboundBlocked(`Replay shadow refuses a non-loopback request to ${parsed.hostname} (zero-spend gate)`);
  }
}

/** 把出站闸装进 `globalThis.fetch`。返回卸载函数（阳性对照要在闸装着的时候跑）。 */
export function installOutboundGuard(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input
      : input instanceof URL ? input.href : (input as Request).url;
    assertLoopbackUrl(url);
    return original(input, init);
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

// ---------------------------------------------------------------------------
// 录下来的东西 → 三种表示：比对项 / pi 消息 / 夹具回复
// ---------------------------------------------------------------------------

/**
 * 一个**比对项**。刻意不含 `sequence` / `entrySeq` / `streaming` / `running`：
 * 那四个是 lane 自己的记账，拿它们比就是在自证。留下的全是「模型说了什么、
 * 按什么顺序说」——正是切换后用户会看到的东西。
 */
export type ComparableStep =
  | { readonly kind: 'user'; readonly text: string }
  | { readonly kind: 'assistant-text'; readonly text: string }
  | { readonly kind: 'thinking'; readonly text: string }
  | { readonly kind: 'tool-call'; readonly toolCallId: string; readonly toolName: string; readonly args: string }
  | { readonly kind: 'tool-result'; readonly toolCallId: string; readonly toolName: string;
      readonly text: string; readonly isError: boolean }
  | { readonly kind: 'host-note'; readonly noteType: string }
  | { readonly kind: 'task'; readonly productionRunId: string; readonly operationId?: string };

/** 空文字段两边都不要：pi 不会为一个空 text delta 造出一段，录里那种段也没有内容可比。 */
function usableParts(parts: readonly RecordedPart[]): RecordedPart[] {
  return parts.filter((part) => part.kind === 'toolCall' || part.text.length > 0);
}

/** 稳定的参数序列化：键序不参与比较，值一个字节都要一致。 */
function canonicalArgs(args: unknown): string {
  const seen = new WeakSet<object>();
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === 'object') {
      if (seen.has(value)) return '[circular]';
      seen.add(value);
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, sort(item)]));
    }
    return value;
  };
  return JSON.stringify(sort(args) ?? null);
}

export function stepsOfRecorded(messages: readonly RecordedMessage[]): ComparableStep[] {
  const steps: ComparableStep[] = [];
  for (const message of messages) {
    if (message.role === 'user') { steps.push({ kind: 'user', text: message.text }); continue; }
    if (message.role === 'toolResult') {
      steps.push({ kind: 'tool-result', toolCallId: message.toolCallId, toolName: message.toolName,
        text: message.text, isError: message.isError });
      continue;
    }
    for (const part of usableParts(message.parts)) {
      if (part.kind === 'text') steps.push({ kind: 'assistant-text', text: part.text });
      else if (part.kind === 'thinking') steps.push({ kind: 'thinking', text: part.text });
      else steps.push({ kind: 'tool-call', toolCallId: part.id, toolName: part.name, args: canonicalArgs(part.args) });
    }
  }
  return steps;
}

export function stepsOfProjection(projection: LaneProjection): ComparableStep[] {
  return projection.parts.map((part): ComparableStep => {
    switch (part.kind) {
      case 'user': return { kind: 'user', text: part.text };
      case 'assistant-text': return { kind: 'assistant-text', text: part.text };
      case 'thinking': return { kind: 'thinking', text: part.text };
      case 'tool-call':
        return { kind: 'tool-call', toolCallId: part.toolCallId, toolName: part.toolName, args: canonicalArgs(part.args) };
      case 'tool-result':
        return { kind: 'tool-result', toolCallId: part.toolCallId, toolName: part.toolName,
          text: part.text, isError: part.isError };
      case 'host-note': return { kind: 'host-note', noteType: part.noteType };
      case 'task':
        return { kind: 'task', productionRunId: part.productionRunId,
          ...(part.operationId === undefined ? {} : { operationId: part.operationId }) };
    }
  });
}

const USAGE = { input: 10, output: 4, cacheRead: 0, cacheWrite: 0, totalTokens: 14,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

/** 录下来的一条消息 → 一条 pi 消息（回填与触发都用它，两处形状必须同源）。 */
export function agentMessageOf(message: RecordedMessage): AgentMessage | undefined {
  if (message.role === 'user') {
    return { role: 'user', content: message.text, timestamp: REPLAY_TIMESTAMP } as AgentMessage;
  }
  if (message.role === 'toolResult') {
    return { role: 'toolResult', toolCallId: message.toolCallId, toolName: message.toolName,
      content: [{ type: 'text', text: message.text }], isError: message.isError,
      timestamp: REPLAY_TIMESTAMP } as AgentMessage;
  }
  const parts = usableParts(message.parts);
  if (parts.length === 0) return undefined;
  const content = parts.map((part) => part.kind === 'toolCall'
    ? { type: 'toolCall' as const, id: part.id, name: part.name, arguments: part.args }
    : part.kind === 'thinking'
      ? { type: 'thinking' as const, thinking: part.text }
      : { type: 'text' as const, text: part.text });
  return {
    role: 'assistant', content, api: 'openai-completions', provider: 'nomi-lane', model: 'chosen-model',
    stopReason: parts.some((part) => part.kind === 'toolCall') ? 'toolUse' : 'stop',
    timestamp: REPLAY_TIMESTAMP, usage: USAGE,
  } as AgentMessage;
}

/** 录下来的助手回复 → 夹具要发的那一条流。段的类型与顺序照抄，不合并、不重排。 */
export function fixtureReplyOf(parts: readonly RecordedPart[]): FixtureReply {
  const fixtureParts: FixturePart[] = usableParts(parts).map((part) => part.kind === 'toolCall'
    ? { type: 'toolCall' as const, id: part.id, name: part.name, arguments: part.args }
    : part.kind === 'thinking'
      ? { type: 'thinking' as const, text: part.text }
      : { type: 'text' as const, text: part.text });
  return { type: 'message', parts: fixtureParts };
}

// ---------------------------------------------------------------------------
// 比对
// ---------------------------------------------------------------------------

export interface StepMismatch {
  readonly index: number;
  readonly expected: string;
  readonly actual: string;
}

function describe(step: ComparableStep | undefined): string {
  if (!step) return '<missing>';
  const body = step.kind === 'tool-call' ? `${step.toolName} ${step.args}`
    : step.kind === 'tool-result' ? `${step.toolName}${step.isError ? '!' : ''} ${step.text}`
      : step.kind === 'host-note' ? step.noteType
        : step.kind === 'task' ? `${step.productionRunId}${step.operationId === undefined ? '' : ` ${step.operationId}`}`
          : step.text;
  return `${step.kind}: ${body.slice(0, 80)}`;
}

/** 第一处不同。**只返回第一处**——一份「87% 一致」的报告没人能拿它修任何东西。 */
export function compareSteps(
  expected: readonly ComparableStep[], actual: readonly ComparableStep[],
): StepMismatch | undefined {
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    const left = expected[index];
    const right = actual[index];
    if (left && right && canonicalArgs(left) === canonicalArgs(right)) continue;
    return { index, expected: describe(left), actual: describe(right) };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 一次回放
// ---------------------------------------------------------------------------

export interface ReplayTurnRef {
  readonly conversation: RecordedConversation;
  /** 被回放的那条助手回复在 `conversation.messages` 里的下标。 */
  readonly index: number;
}

/** 这一轮到底比了些什么。**没有它，「126 个回合 100% 一致」可能是 126 次只比了一段文字。** */
export interface StepComposition {
  readonly total: number;
  readonly toolCalls: number;
  readonly toolResults: number;
  readonly thinking: number;
  readonly assistantText: number;
}

export function compositionOf(steps: readonly ComparableStep[]): StepComposition {
  return {
    total: steps.length,
    toolCalls: steps.filter((step) => step.kind === 'tool-call').length,
    toolResults: steps.filter((step) => step.kind === 'tool-result').length,
    thinking: steps.filter((step) => step.kind === 'thinking').length,
    assistantText: steps.filter((step) => step.kind === 'assistant-text').length,
  };
}

export interface ReplayTurnOutcome {
  readonly conversationId: string;
  readonly sourceKind: RecordedConversation['sourceKind'];
  readonly projectLabel: string;
  readonly index: number;
  readonly steps: number;
  readonly composition: StepComposition;
  readonly identical: boolean;
  readonly mismatch?: StepMismatch;
  readonly coldRestartEqual: boolean;
  readonly coldRestartMismatch?: StepMismatch;
  readonly crashed?: string;
}

/**
 * 可回放的回合：前面必须有一条能**当触发**的消息——用户提问，或上一步的工具结果。
 * 助手接着助手不算：那不是一个可以从外面重新发起的回合，硬塞给 `lane.prompt` 就成了
 * 「我们编了一个触发」。本机 09-08 实核的两份语料里这种情况是 0，写死是为了将来的语料。
 */
export function replayableTurns(conversation: RecordedConversation): ReplayTurnRef[] {
  const refs: ReplayTurnRef[] = [];
  conversation.messages.forEach((message, index) => {
    if (message.role !== 'assistant' || index === 0) return;
    const previous = conversation.messages[index - 1]?.role;
    if (previous !== 'user' && previous !== 'toolResult') return;
    if (usableParts(message.parts).length === 0) return;
    refs.push({ conversation, index });
  });
  return refs;
}

function createCleanup(): ProbeCleanup & { run(): Promise<void> } {
  const tasks: Array<() => void | Promise<void>> = [];
  return {
    after: (fn) => { tasks.push(fn); },
    run: async () => {
      for (const task of tasks.reverse()) await Promise.resolve(task()).catch(() => undefined);
    },
  };
}

/**
 * 触发块 = 紧挨着这条助手回复、且**同一角色**的那一段连续消息。
 * 用户提问是一条；并行工具的结果是连着的好几条。它们经 `lane.prompt(messages)` 进去，
 * 其余前文经 `appendMessage` 回填——两条路都是 pi 的公开口，方案 §2.1 第一档押的就是它。
 */
function triggerBlockStart(messages: readonly RecordedMessage[], index: number): number {
  const role = messages[index - 1]?.role;
  if (role === undefined) return index;
  let start = index - 1;
  while (start > 0 && messages[start - 1]?.role === role) start -= 1;
  return start;
}

export interface ReplayOptions {
  /** 故意改掉回放文字的第 0 个字符（阳性对照 ①）。 */
  readonly mutateFirstCharacter?: boolean;
  /** 故意把回填里的第一对 toolCall / toolResult 掉个个儿（阳性对照 ②）。 */
  readonly swapFirstToolPair?: boolean;
}

export async function replayTurn(ref: ReplayTurnRef, options: ReplayOptions = {}): Promise<ReplayTurnOutcome> {
  const { conversation, index } = ref;
  const identity = { conversationId: conversation.conversationId, sourceKind: conversation.sourceKind,
    projectLabel: conversation.projectLabel, index };
  const cleanup = createCleanup();
  try {
    const replayed = conversation.messages[index];
    if (replayed?.role !== 'assistant') throw new Error('replayTurn expects an assistant message');
    const start = triggerBlockStart(conversation.messages, index);
    const prefix = conversation.messages.slice(0, start);
    const trigger = conversation.messages.slice(start, index);
    // 期望**永远**按录下来的原样建；两个阳性对照只动喂进去的那一侧，所以「探测器还活着」
    // 这件事是被证出来的，不是被假设的。
    const expected = stepsOfRecorded([...prefix, ...trigger, { role: 'assistant', parts: replayed.parts }]);
    const backfill = options.swapFirstToolPair ? swapFirstToolPair(prefix) : prefix;
    const replayParts = options.mutateFirstCharacter ? mutateFirstText(replayed.parts) : replayed.parts;

    const projectDir = await mkdtemp(join(tmpdir(), 'nomi-replay-'));
    cleanup.after(() => rm(projectDir, { recursive: true, force: true }));
    const http = await createHttpFixture([fixtureReplyOf(replayParts), { type: 'text', text: SETTLE_TEXT }]);
    cleanup.after(http.close);
    const laneOptions: OpenLaneOptions = {
      projectDir, systemPrompt: LANE_SYSTEM_PROMPT,
      model: { kind: 'openai-compatible', providerId: 'nomi-lane', modelId: 'chosen-model',
        baseURL: http.baseURL, authType: 'api-key', apiKey: 'fixture-key' },
      tools: createDocumentLaneTools(createDocumentPort()),
    };
    assertLoopbackUrl(laneOptions.model.baseURL);

    const probe = await openProbeLane(cleanup, laneOptions, {
      // 回放不跑真实工具：闸对每一个调用都答同一句话，所以「工具被拒之后又说了什么」
      // 落在被比对的前缀之后，比对结果不受它影响。
      beforeTool: async () => ({ block: { reason: GATE_REASON } }),
    });
    for (const message of backfill) {
      const agentMessage = agentMessageOf(message);
      if (agentMessage) await probe.lane.appendMessage(agentMessage, PROBE_CONTEXT);
    }
    const triggerMessages = trigger.map(agentMessageOf).filter((message): message is AgentMessage => !!message);
    if (triggerMessages.length === 0) throw new Error('no trigger message for this turn');
    await probe.lane.prompt(triggerMessages, PROBE_CONTEXT);

    const actual = stepsOfProjection(await projectionOf(probe));
    const mismatch = compareSteps(expected, actual.slice(0, expected.length));

    // 冷重启：关掉，用同一个 sessionId 重开，整份投影逐项相等（部分比对在这里没有意义——
    // 少了一段和多了一段都是「重启后不一样」）。
    const { sessionId } = probe;
    await probe.close();
    const reopened = await openProbeLane(cleanup, laneOptions, { sessionId });
    const coldRestartMismatch = compareSteps(actual, stepsOfProjection(await projectionOf(reopened)));

    return {
      ...identity, steps: expected.length, composition: compositionOf(expected), identical: !mismatch,
      ...(mismatch ? { mismatch } : {}),
      coldRestartEqual: !coldRestartMismatch,
      ...(coldRestartMismatch ? { coldRestartMismatch } : {}),
    };
  } catch (cause) {
    return { ...identity, steps: 0, composition: compositionOf([]), identical: false, coldRestartEqual: false,
      crashed: cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause) };
  } finally {
    await cleanup.run();
  }
}

async function projectionOf(probe: Awaited<ReturnType<typeof openProbeLane>>): Promise<LaneProjection> {
  const watch = await probe.lane.watch(PROBE_CONTEXT);
  try {
    return projectLaneSnapshot(watch.snapshot, probe.modelFacts);
  } finally {
    watch.unsubscribe();
  }
}

function mutateFirstText(parts: readonly RecordedPart[]): RecordedPart[] {
  let done = false;
  return parts.map((part) => {
    if (done || part.kind === 'toolCall' || part.text.length === 0) return part;
    done = true;
    const head = part.text[0] === 'x' ? 'y' : 'x';
    return { ...part, text: `${head}${part.text.slice(1)}` };
  });
}

function swapFirstToolPair(messages: readonly RecordedMessage[]): RecordedMessage[] {
  const swapped = [...messages];
  for (let index = 0; index < swapped.length - 1; index += 1) {
    const call = swapped[index];
    const result = swapped[index + 1];
    if (call?.role !== 'assistant' || !call.parts.some((part) => part.kind === 'toolCall')) continue;
    if (result?.role !== 'toolResult') continue;
    swapped[index] = result;
    swapped[index + 1] = call;
    return swapped;
  }
  return swapped;
}
