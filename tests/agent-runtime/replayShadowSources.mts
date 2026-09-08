// L2 · 回放影子夜跑的**读数层**（方案 §2.3 第二行 + §2.1）。
//
// 它做一件事：把本机**真实**落盘的旧对话读成一个与来源无关的中立形状
// （`RecordedConversation`），交给回放引擎。三条硬纪律写在这里，因为这是唯一
// 碰到用户真实数据的文件：
//
//   1. **只读。** 全文件只有 `readFile` / `readdir` / `stat`，一个写口都没有。
//      真实数据不复制进仓库、不出机器；回放全部发生在 `os.tmpdir()` 里的临时项目。
//   2. **不造数据。** 读到多少回合就是多少回合；缺口如实报数（方案 §2.3 要 ≥200，
//      够不够是**结论**，不是可以补足的输入）。
//   3. **不解释、不修补。** 读不动的文件计入 `unreadable` 并带上原因，不猜它本来
//      是什么形状——一份被静默跳过的坏数据会把一致率算高。
//
// 为什么读三种来源而不是方案 §2.1 只写的那一种：09-08 在本机实核，方案点名的
// ① pi 快照信封 `<project>/.nomi/agent-thread-context-v1.json` 在真实资料库里
// **一份都没有**（369 个项目，0 命中）。真实存在的是另外三份，其中
// `<project>/.nomi/agent-session.json`（旧 agentChatV2 存储）**不在方案 §2.1 的
// 三份清单里**，而它是唯一带有序 content 数组 + toolCall 参数的真实语料。
// 读数层因此按「来源适配器」写：方案说的那份留着（它一旦出现就自动被读到，
// 且排在最前），实际有的那几份现在就能跑。
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 一段有序内容。与 pi `AssistantMessage.content` 的三种成员一一对应，不多不少。 */
export type RecordedPart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'thinking'; readonly text: string }
  | { readonly kind: 'toolCall'; readonly id: string; readonly name: string; readonly args: Record<string, unknown> };

export type RecordedMessage =
  | { readonly role: 'user'; readonly text: string }
  | { readonly role: 'assistant'; readonly parts: readonly RecordedPart[] }
  | {
      readonly role: 'toolResult'; readonly toolCallId: string; readonly toolName: string;
      readonly text: string; readonly isError: boolean;
    };

export type RecordedSourceKind = 'pi-snapshot' | 'agent-chat-v2' | 'host-snapshot';

export interface RecordedConversation {
  readonly sourceKind: RecordedSourceKind;
  /** 这段对话来自哪个项目。同一项目的多条对话共用它——「跨 ≥3 个项目」按它去重。 */
  readonly projectLabel: string;
  readonly conversationId: string;
  /** 落盘文件的 mtime（毫秒）。「最近 N 个回合」按它排序，不按对话内部的时间戳。 */
  readonly modifiedAt: number;
  readonly messages: readonly RecordedMessage[];
}

export interface SourceScan {
  readonly kind: RecordedSourceKind;
  /** 扫过的根目录（**不含**用户名以外的任何内容；报告里原样出现，报告只留本机）。 */
  readonly root: string;
  readonly filesSeen: number;
  readonly conversations: number;
  /** 助手回复条数 = 可回放的回合数。 */
  readonly turns: number;
  readonly unreadable: readonly { readonly file: string; readonly reason: string }[];
}

export interface SourceReadResult {
  readonly conversations: readonly RecordedConversation[];
  readonly scans: readonly SourceScan[];
}

export function countTurns(conversation: RecordedConversation): number {
  return conversation.messages.filter((message) => message.role === 'assistant').length;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function textOfUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((part) => {
      const record = asRecord(part);
      if (record?.type === 'text' && typeof record.text === 'string') return record.text;
      return '';
    }).join('');
  }
  return '';
}

/** 稳定的短标签：同一个绝对路径永远同一串，用来在报告里数「跨几个项目」而不泄露全路径。 */
function labelOf(absolutePath: string): string {
  const basename = absolutePath.split('/').filter(Boolean).at(-1) ?? absolutePath;
  return `${basename}#${createHash('sha256').update(absolutePath).digest('hex').slice(0, 8)}`;
}

async function listDirectories(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => join(root, entry.name));
  } catch {
    return [];
  }
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}

async function modifiedAtOf(file: string): Promise<number> {
  return (await stat(file)).mtimeMs;
}

// ---------------------------------------------------------------------------
// 来源 ① pi 快照信封 —— 方案 §2.1 点名的那一份（本机 09-08 实核：0 份）。
// ---------------------------------------------------------------------------

function partsOfPiAssistant(content: unknown): RecordedPart[] {
  if (!Array.isArray(content)) return [];
  const parts: RecordedPart[] = [];
  for (const raw of content) {
    const part = asRecord(raw);
    if (!part) continue;
    if (part.type === 'text' && typeof part.text === 'string') parts.push({ kind: 'text', text: part.text });
    else if (part.type === 'thinking' && typeof part.thinking === 'string') parts.push({ kind: 'thinking', text: part.thinking });
    else if (part.type === 'toolCall' && typeof part.id === 'string' && typeof part.name === 'string') {
      parts.push({ kind: 'toolCall', id: part.id, name: part.name, args: asRecord(part.arguments) ?? {} });
    }
  }
  return parts;
}

function messagesOfPiEntries(entries: unknown): RecordedMessage[] {
  if (!Array.isArray(entries)) return [];
  const messages: RecordedMessage[] = [];
  for (const raw of entries) {
    const entry = asRecord(raw);
    if (entry?.type !== 'message') continue;
    const message = asRecord(entry.message);
    if (!message) continue;
    if (message.role === 'user') messages.push({ role: 'user', text: textOfUnknown(message.content) });
    else if (message.role === 'assistant') {
      // `stopReason:"pending"` 的助手消息 pi 自己拒收（`runtime/lane.js:1495-1499`），
      // 回放它只会撞在 append 上。一致性核对 §6.8 说的就是这种半条消息。
      if (message.stopReason === 'pending') continue;
      messages.push({ role: 'assistant', parts: partsOfPiAssistant(message.content) });
    } else if (message.role === 'toolResult' && typeof message.toolCallId === 'string') {
      messages.push({
        role: 'toolResult', toolCallId: message.toolCallId,
        toolName: typeof message.toolName === 'string' ? message.toolName : 'unknown',
        text: textOfUnknown(message.content), isError: message.isError === true,
      });
    }
  }
  return messages;
}

async function readPiSnapshots(projectsRoot: string): Promise<{ scan: SourceScan; conversations: RecordedConversation[] }> {
  const conversations: RecordedConversation[] = [];
  const unreadable: { file: string; reason: string }[] = [];
  let filesSeen = 0;
  for (const projectDir of await listDirectories(projectsRoot)) {
    const file = join(projectDir, '.nomi', 'agent-thread-context-v1.json');
    let envelope: unknown;
    try {
      envelope = await readJson(file);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
        unreadable.push({ file: labelOf(file), reason: (cause as Error).message });
      }
      continue;
    }
    filesSeen += 1;
    const data = asRecord(asRecord(envelope)?.data);
    const messages = messagesOfPiEntries(data?.entries);
    if (messages.length === 0) continue;
    conversations.push({
      sourceKind: 'pi-snapshot', projectLabel: labelOf(projectDir),
      conversationId: `${labelOf(projectDir)}/pi`, modifiedAt: await modifiedAtOf(file), messages,
    });
  }
  return {
    scan: {
      kind: 'pi-snapshot', root: projectsRoot, filesSeen, conversations: conversations.length,
      turns: conversations.reduce((sum, item) => sum + countTurns(item), 0), unreadable,
    },
    conversations,
  };
}

// ---------------------------------------------------------------------------
// 来源 ② 旧 agentChatV2 存储 `<project>/.nomi/agent-session.json`
// （Vercel AI SDK CoreMessage 形状）。**方案 §2.1 的三份清单里没有它**——
// 09-08 实核它是本机唯一带有序 content + toolCall 参数的真实语料，40 份 / 222 条。
// ---------------------------------------------------------------------------

function partsOfAiSdkAssistant(content: unknown): RecordedPart[] {
  if (typeof content === 'string') return content ? [{ kind: 'text', text: content }] : [];
  if (!Array.isArray(content)) return [];
  const parts: RecordedPart[] = [];
  for (const raw of content) {
    const part = asRecord(raw);
    if (!part) continue;
    if (part.type === 'text' && typeof part.text === 'string') parts.push({ kind: 'text', text: part.text });
    else if (part.type === 'reasoning' && typeof part.text === 'string') parts.push({ kind: 'thinking', text: part.text });
    else if (part.type === 'tool-call' && typeof part.toolCallId === 'string' && typeof part.toolName === 'string') {
      parts.push({ kind: 'toolCall', id: part.toolCallId, name: part.toolName, args: asRecord(part.args) ?? {} });
    }
  }
  return parts;
}

function toolResultsOfAiSdk(content: unknown): RecordedMessage[] {
  if (!Array.isArray(content)) return [];
  const results: RecordedMessage[] = [];
  for (const raw of content) {
    const part = asRecord(raw);
    if (part?.type !== 'tool-result' || typeof part.toolCallId !== 'string') continue;
    const value = part.result ?? part.output;
    results.push({
      role: 'toolResult', toolCallId: part.toolCallId,
      toolName: typeof part.toolName === 'string' ? part.toolName : 'unknown',
      text: typeof value === 'string' ? value : JSON.stringify(value ?? null),
      isError: part.isError === true,
    });
  }
  return results;
}

async function readAgentChatV2(projectsRoot: string): Promise<{ scan: SourceScan; conversations: RecordedConversation[] }> {
  const conversations: RecordedConversation[] = [];
  const unreadable: { file: string; reason: string }[] = [];
  let filesSeen = 0;
  for (const projectDir of await listDirectories(projectsRoot)) {
    const file = join(projectDir, '.nomi', 'agent-session.json');
    let parsed: unknown;
    try {
      parsed = await readJson(file);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
        unreadable.push({ file: labelOf(file), reason: (cause as Error).message });
      }
      continue;
    }
    filesSeen += 1;
    const sessions = asRecord(asRecord(parsed)?.sessions);
    if (!sessions) continue;
    const modifiedAt = await modifiedAtOf(file);
    for (const [sessionKey, raw] of Object.entries(sessions)) {
      if (!Array.isArray(raw)) continue;
      const messages: RecordedMessage[] = [];
      for (const item of raw) {
        const message = asRecord(item);
        if (!message) continue;
        if (message.role === 'user') messages.push({ role: 'user', text: textOfUnknown(message.content) });
        else if (message.role === 'assistant') messages.push({ role: 'assistant', parts: partsOfAiSdkAssistant(message.content) });
        else if (message.role === 'tool') messages.push(...toolResultsOfAiSdk(message.content));
      }
      if (messages.length === 0) continue;
      conversations.push({
        sourceKind: 'agent-chat-v2', projectLabel: labelOf(projectDir),
        conversationId: `${labelOf(projectDir)}/${createHash('sha256').update(sessionKey).digest('hex').slice(0, 8)}`,
        modifiedAt, messages,
      });
    }
  }
  return {
    scan: {
      kind: 'agent-chat-v2', root: projectsRoot, filesSeen, conversations: conversations.length,
      turns: conversations.reduce((sum, item) => sum + countTurns(item), 0), unreadable,
    },
    conversations,
  };
}

// ---------------------------------------------------------------------------
// 来源 ③ 宿主快照 `<userData>/project-agent-host/<partition>/snapshot-v1.json`
// （方案 §2.1 的第二档：迁内容、迁不回真实顺序 —— 所以这里**按数组序**读，
// 绝不按 `createdAt` 重排）。
// ---------------------------------------------------------------------------

async function readHostSnapshots(hostRoot: string): Promise<{ scan: SourceScan; conversations: RecordedConversation[] }> {
  const conversations: RecordedConversation[] = [];
  const unreadable: { file: string; reason: string }[] = [];
  let filesSeen = 0;
  for (const partitionDir of await listDirectories(hostRoot)) {
    const file = join(partitionDir, 'snapshot-v1.json');
    let parsed: unknown;
    try {
      parsed = await readJson(file);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
        unreadable.push({ file: labelOf(file), reason: (cause as Error).message });
      }
      continue;
    }
    filesSeen += 1;
    const items = asRecord(asRecord(parsed)?.state)?.items;
    if (!Array.isArray(items)) continue;
    const messages: RecordedMessage[] = [];
    for (const raw of items) {
      const item = asRecord(raw);
      // `proposal` / `failure` / `task` / `artifact` 在新通路里是 custom entry
      // （方案 §2.1 第二档），不是模型回复——回放影子只比模型回复，跳过它们。
      if (item?.kind === 'user' && typeof item.text === 'string') messages.push({ role: 'user', text: item.text });
      else if (item?.kind === 'assistant' && typeof item.text === 'string') {
        messages.push({ role: 'assistant', parts: item.text ? [{ kind: 'text', text: item.text }] : [] });
      }
    }
    if (messages.length === 0) continue;
    conversations.push({
      sourceKind: 'host-snapshot', projectLabel: labelOf(partitionDir),
      conversationId: `${labelOf(partitionDir)}/host`, modifiedAt: await modifiedAtOf(file), messages,
    });
  }
  return {
    scan: {
      kind: 'host-snapshot', root: hostRoot, filesSeen, conversations: conversations.length,
      turns: conversations.reduce((sum, item) => sum + countTurns(item), 0), unreadable,
    },
    conversations,
  };
}

export interface SourceRoots {
  /** 真实项目库。缺省 `~/Documents/Nomi Projects`。 */
  readonly projectsRoot: string;
  /** 宿主分区库。缺省 `~/Library/Application Support/nomi/project-agent-host`。 */
  readonly hostRoot: string;
}

export function defaultSourceRoots(): SourceRoots {
  return {
    projectsRoot: join(homedir(), 'Documents', 'Nomi Projects'),
    hostRoot: join(homedir(), 'Library', 'Application Support', 'nomi', 'project-agent-host'),
  };
}

/** 读全部来源，按落盘时间**新→旧**排序（「最近 N 个回合」的 N 从这一头数起）。 */
export async function readRecordedConversations(roots: SourceRoots): Promise<SourceReadResult> {
  const results = await Promise.all([
    readPiSnapshots(roots.projectsRoot),
    readAgentChatV2(roots.projectsRoot),
    readHostSnapshots(roots.hostRoot),
  ]);
  const conversations = results.flatMap((result) => result.conversations)
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
  return { conversations, scans: results.map((result) => result.scan) };
}
