// L2 · **回放影子夜跑**（方案 §2.3 第二行 + 「冷重启 200 个回放会话」那一行）。
//
// 跑法：`pnpm run replay:shadow`。它是「连续 7 天绿」这条墙钟判据的起点。
//
// 它回答的问题只有一个：**把用户真实录下来的助手回复原样重放进新通路，投影出来的
// 东西和当时录下来的是不是一个字都不差；关掉再开还是不是。**
//
// 为什么不进 CI：语料是本机真实资料库（只读，不复制、不出机器）。CI 里没有它，
// 造一份假语料跑出来的 100% 只证明「我写的假数据和我写的断言一致」。
//
// 判据（三条全部满足才绿，不设「差不多」档）：
//   · 逐字一致率 100%   · 崩溃 0   · 冷重启逐项相等 100%
// 外加三个**阳性对照**——探测器自己得先证明它会红：
//   · 改掉回放文字的一个字符 → 必须报红并指出位置
//   · 把回填里的 toolResult 排到它的 toolCall 前面 → 必须报红
//   · 往非回环地址发一个请求 → 必须被出站闸拒掉（零额度）
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  assertLoopbackUrl, installOutboundGuard, OutboundBlocked, replayTurn, replayableTurns,
  type ReplayTurnOutcome, type ReplayTurnRef,
} from './replayShadowEngine.mjs';
import {
  countTurns, defaultSourceRoots, readRecordedConversations, type RecordedConversation, type SourceScan,
} from './replayShadowSources.mjs';

const TARGET_TURNS = 200;
const TARGET_PROJECTS = 3;

interface Options {
  readonly turns: number;
  readonly out: string;
  readonly projectsRoot: string;
  readonly hostRoot: string;
}

function parseOptions(argv: readonly string[]): Options {
  const defaults = defaultSourceRoots();
  const read = (flag: string): string | undefined =>
    argv.find((item) => item.startsWith(`${flag}=`))?.slice(flag.length + 1);
  // **本地日历日**，不是 UTC 日：「连续 7 天绿」是按用户所在时区数的，一份夜里跑的
  // 报告被命名成前一天会让第 7 天究竟是哪天变成一件要算的事。
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const requested = Number(read('--turns') ?? TARGET_TURNS);
  if (!Number.isInteger(requested) || requested <= 0) throw new Error(`--turns must be a positive integer, got ${read('--turns')}`);
  return {
    turns: requested,
    out: read('--out') ?? join(homedir(), 'Library', 'Application Support', 'nomi', 'replay-shadow', `${date}.json`),
    projectsRoot: read('--projects-root') ?? defaults.projectsRoot,
    hostRoot: read('--host-root') ?? defaults.hostRoot,
  };
}

/** 从**最近**的对话里取回合，取满 `limit` 为止。取不满就是取不满——不循环、不复制。 */
function selectTurns(conversations: readonly RecordedConversation[], limit: number): ReplayTurnRef[] {
  const selected: ReplayTurnRef[] = [];
  for (const conversation of conversations) {
    for (const ref of replayableTurns(conversation)) {
      if (selected.length >= limit) return selected;
      selected.push(ref);
    }
  }
  return selected;
}

type ControlVerdict = 'detected' | 'missed' | 'unavailable';

interface ControlResults {
  readonly textMutation: ControlVerdict;
  readonly textMutationAt?: number;
  readonly toolPairOrder: ControlVerdict;
  readonly toolPairOrderAt?: number;
  readonly outboundNetwork: ControlVerdict;
}

async function runControls(refs: readonly ReplayTurnRef[]): Promise<ControlResults> {
  // ③ 零额度。闸此刻装着，所以这一句要么抛 `OutboundBlocked`，要么这份报告不该被相信。
  let outboundNetwork: ControlVerdict = 'missed';
  try {
    await fetch('https://api.anthropic.com/v1/messages', { method: 'POST' });
  } catch (cause) {
    outboundNetwork = cause instanceof OutboundBlocked ? 'detected' : 'missed';
  }

  const textRef = refs.find((ref) => {
    const message = ref.conversation.messages[ref.index];
    return message?.role === 'assistant' && message.parts.some((part) => part.kind !== 'toolCall' && part.text.length > 0);
  });
  let textMutation: ControlVerdict = 'unavailable';
  let textMutationAt: number | undefined;
  if (textRef) {
    const outcome = await replayTurn(textRef, { mutateFirstCharacter: true });
    textMutation = outcome.mismatch ? 'detected' : 'missed';
    textMutationAt = outcome.mismatch?.index;
  }

  const pairRef = refs.find((ref) => hasBackfilledToolPair(ref));
  let toolPairOrder: ControlVerdict = 'unavailable';
  let toolPairOrderAt: number | undefined;
  if (pairRef) {
    const outcome = await replayTurn(pairRef, { swapFirstToolPair: true });
    toolPairOrder = outcome.mismatch ? 'detected' : 'missed';
    toolPairOrderAt = outcome.mismatch?.index;
  }

  return {
    textMutation, ...(textMutationAt === undefined ? {} : { textMutationAt }),
    toolPairOrder, ...(toolPairOrderAt === undefined ? {} : { toolPairOrderAt }),
    outboundNetwork,
  };
}

/** 这个回合的**前文**里有没有一对 toolCall → toolResult 可以掉个个儿。 */
function hasBackfilledToolPair(ref: ReplayTurnRef): boolean {
  const messages = ref.conversation.messages;
  for (let index = 0; index + 1 < ref.index - 1; index += 1) {
    const call = messages[index];
    const result = messages[index + 1];
    if (call?.role === 'assistant' && call.parts.some((part) => part.kind === 'toolCall') && result?.role === 'toolResult') {
      return true;
    }
  }
  return false;
}

function summarize(outcomes: readonly ReplayTurnOutcome[]) {
  const identical = outcomes.filter((outcome) => outcome.identical).length;
  const crashes = outcomes.filter((outcome) => outcome.crashed);
  const coldEqual = outcomes.filter((outcome) => outcome.coldRestartEqual).length;
  const firstMismatch = outcomes.find((outcome) => outcome.mismatch && !outcome.crashed);
  const firstColdMismatch = outcomes.find((outcome) => outcome.coldRestartMismatch && !outcome.crashed);
  const add = (pick: (composition: ReplayTurnOutcome['composition']) => number): number =>
    outcomes.reduce((sum, outcome) => sum + pick(outcome.composition), 0);
  return {
    turns: outcomes.length,
    // 比过的段的成分。一致率永远和它一起读——只比过文字的 100% 和比过 42 个
    // toolCall 参数的 100% 不是同一句话。
    segments: {
      compared: add((composition) => composition.total),
      assistantText: add((composition) => composition.assistantText),
      toolCalls: add((composition) => composition.toolCalls),
      toolResults: add((composition) => composition.toolResults),
      thinking: add((composition) => composition.thinking),
    },
    projects: new Set(outcomes.map((outcome) => outcome.projectLabel)).size,
    conversations: new Set(outcomes.map((outcome) => outcome.conversationId)).size,
    parity: {
      identical,
      rate: outcomes.length === 0 ? 0 : identical / outcomes.length,
      first: firstMismatch ? { conversationId: firstMismatch.conversationId, turnIndex: firstMismatch.index,
        ...firstMismatch.mismatch } : null,
    },
    crashes: {
      count: crashes.length,
      first: crashes[0] ? { conversationId: crashes[0].conversationId, turnIndex: crashes[0].index,
        error: crashes[0].crashed } : null,
    },
    coldRestart: {
      equal: coldEqual,
      rate: outcomes.length === 0 ? 0 : coldEqual / outcomes.length,
      first: firstColdMismatch ? { conversationId: firstColdMismatch.conversationId,
        turnIndex: firstColdMismatch.index, ...firstColdMismatch.coldRestartMismatch } : null,
    },
  };
}

function printScans(scans: readonly SourceScan[]): void {
  console.log('来源（只读）：');
  for (const scan of scans) {
    console.log(`  · ${scan.kind.padEnd(15)} 文件 ${String(scan.filesSeen).padStart(4)}`
      + ` · 对话 ${String(scan.conversations).padStart(4)} · 回合 ${String(scan.turns).padStart(4)}`
      + (scan.unreadable.length ? ` · 读不动 ${scan.unreadable.length}` : ''));
  }
}

async function main(): Promise<number> {
  const options = parseOptions(process.argv.slice(2));
  const restoreFetch = installOutboundGuard();
  try {
    // 出站闸装好之前一个请求都不许发；这一句先自证闸的判据本身是对的。
    assertLoopbackUrl('http://127.0.0.1:1/v1');

    const { conversations, scans } = await readRecordedConversations({
      projectsRoot: options.projectsRoot, hostRoot: options.hostRoot,
    });
    printScans(scans);
    const available = conversations.reduce((sum, item) => sum + countTurns(item), 0);
    const refs = selectTurns(conversations, options.turns);
    console.log(`\n回放 ${refs.length} 个真实回合（库里可回放的共 ${available} 个，目标 ${options.turns}）…`);

    const outcomes: ReplayTurnOutcome[] = [];
    for (const ref of refs) {
      outcomes.push(await replayTurn(ref));
      if (outcomes.length % 25 === 0) console.log(`  … ${outcomes.length}/${refs.length}`);
    }
    const controls = await runControls(refs);
    const summary = summarize(outcomes);

    const shortfall = summary.turns < TARGET_TURNS || summary.projects < TARGET_PROJECTS;
    const parityGreen = summary.turns > 0 && summary.parity.rate === 1;
    const coldGreen = summary.turns > 0 && summary.coldRestart.rate === 1;
    const controlsGreen = controls.textMutation === 'detected' && controls.toolPairOrder === 'detected'
      && controls.outboundNetwork === 'detected';
    const verdict = parityGreen && coldGreen && summary.crashes.count === 0 && controlsGreen
      ? (shortfall ? 'green-short-of-corpus' : 'green') : 'red';

    const report = {
      generatedAt: new Date().toISOString(),
      verdict,
      thresholds: { parityRate: 1, crashes: 0, coldRestartRate: 1, turns: TARGET_TURNS, projects: TARGET_PROJECTS },
      sources: scans,
      coverage: { availableTurns: available, replayedTurns: summary.turns, projects: summary.projects,
        conversations: summary.conversations, segments: summary.segments },
      parity: summary.parity, crashes: summary.crashes, coldRestart: summary.coldRestart,
      positiveControls: controls,
      turnsWithMismatch: outcomes.filter((outcome) => !outcome.identical || !outcome.coldRestartEqual)
        .map((outcome) => ({ conversationId: outcome.conversationId, turnIndex: outcome.index,
          ...(outcome.crashed ? { crashed: outcome.crashed } : {}),
          ...(outcome.mismatch ? { mismatch: outcome.mismatch } : {}),
          ...(outcome.coldRestartMismatch ? { coldRestartMismatch: outcome.coldRestartMismatch } : {}) })),
    };
    await mkdir(dirname(options.out), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });

    console.log('\n—— L2 回放影子 ——');
    console.log(`覆盖：${summary.projects} 个项目 / ${summary.conversations} 段对话 / ${summary.turns} 个回合`);
    console.log(`比过的段：${summary.segments.compared}（文字 ${summary.segments.assistantText}`
      + ` · toolCall ${summary.segments.toolCalls} · toolResult ${summary.segments.toolResults}`
      + ` · thinking ${summary.segments.thinking}）`);
    console.log(`逐字一致：${summary.parity.identical}/${summary.turns}`
      + ` = ${(summary.parity.rate * 100).toFixed(2)}%`);
    console.log(`崩溃：${summary.crashes.count}`);
    console.log(`冷重启逐项相等：${summary.coldRestart.equal}/${summary.turns}`
      + ` = ${(summary.coldRestart.rate * 100).toFixed(2)}%`);
    console.log(`阳性对照：改字=${controls.textMutation} · 乱序工具对=${controls.toolPairOrder}`
      + ` · 出站请求=${controls.outboundNetwork}`);
    if (summary.parity.first) {
      console.log(`第一处不一致：段 #${summary.parity.first.index} @ ${summary.parity.first.conversationId}`);
      console.log(`  期望：${summary.parity.first.expected}`);
      console.log(`  实际：${summary.parity.first.actual}`);
    }
    if (summary.coldRestart.first) {
      console.log(`第一处冷重启不等：段 #${summary.coldRestart.first.index} @ ${summary.coldRestart.first.conversationId}`);
      console.log(`  重启前：${summary.coldRestart.first.expected}`);
      console.log(`  重启后：${summary.coldRestart.first.actual}`);
    }
    if (summary.crashes.first) console.log(`第一处崩溃：${summary.crashes.first.error} @ ${summary.crashes.first.conversationId}`);
    if (shortfall) {
      console.log(`\n⚠️ 语料不足判据：需要 ≥${TARGET_TURNS} 回合 / ≥${TARGET_PROJECTS} 个项目，`
        + `本机真实库只有 ${available} 个可回放回合。数字如实报，不补造。`);
    }
    console.log(`报告：${options.out}`);
    console.log(verdict === 'red' ? '\n判定：红' : `\n判定：${verdict}`);
    return verdict === 'red' ? 1 : 0;
  } finally {
    restoreFetch();
  }
}

process.exitCode = await main();
