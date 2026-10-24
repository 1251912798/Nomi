import type { CanvasReadResult } from "./canvasRead";
import { SHOT_TABLE_COMPACT_CHARACTERS, formatShotTableForAgent } from "./canvasReadShotTable";

export const MAX_CANVAS_PROMPT_CHARACTERS = 12_000;
const SELECTED_IDS_BUDGET = 900;
const NODE_SUMMARY_BUDGET = 7_500;
const EDGE_SUMMARY_BUDGET = 1_800;

const compactHead = (text: string, max: number): string => {
  let compact = "";
  let pendingSpace = false;
  for (const character of text) {
    if (/\s/.test(character)) {
      if (compact) pendingSpace = true;
      continue;
    }
    const addition = `${pendingSpace ? " " : ""}${character}`;
    if (compact.length + addition.length > max) {
      return `${compact}${addition.slice(0, max - compact.length)}…`;
    }
    compact += addition;
    pendingSpace = false;
  }
  return compact;
};

function boundedJoin<T>(
  values: readonly T[],
  maxCharacters: number,
  separator: string,
  format: (value: T) => string,
): { text: string; truncated: boolean } {
  let text = "";
  for (const value of values) {
    const formatted = format(value);
    const addition = text ? `${separator}${formatted}` : formatted;
    if (text.length + addition.length <= maxCharacters) {
      text += addition;
      continue;
    }
    const marker = text ? `${separator}…` : "…";
    text = text.length + marker.length <= maxCharacters
      ? `${text}${marker}`
      : `${text.slice(0, Math.max(0, maxCharacters - 1)).trimEnd()}…`;
    return { text, truncated: true };
  }
  return { text, truncated: false };
}

/**
 * 给模型看的选区的账：总数 = 本次列出 + 本次未列，永远写在文本里（与 #1263 的 `AgentContextProjection`
 * 同一套词：total / listed / omitted）。`from` 是窗口起点（0 起），窗口里列出的永远是选区里连续的一段。
 */
export type CanvasSelectionAccount = Readonly<{ total: number; from: number; listed: number; omitted: number }>;

/** 选区窗口：从 `from` 起，在预算里放得下几个就列几个（至少一个：id 最长 120 字，远小于预算）。 */
function selectionWindow(ids: readonly string[], from: number): { text: string; listed: number } {
  let text = "";
  let listed = 0;
  for (let index = from; index < ids.length; index += 1) {
    const formatted = compactHead(ids[index]!, 120);
    const addition = text ? `, ${formatted}` : formatted;
    if (text.length + addition.length > SELECTED_IDS_BUDGET) break;
    text += addition;
    listed += 1;
  }
  return { text, listed };
}

/** 1 起的闭区间：「第 3 个」「第 32–40 个」。 */
const spanLabel = (first: number, last: number): string => (first === last ? `第 ${first} 个` : `第 ${first}–${last} 个`);

/**
 * 「当前选中」那一块（一到两行）。**选区不会在这里被悄悄截短**：列不全就写总数、本次列了哪一段、没列哪几段；
 * 能翻页的调用方（`pageable`）再被指到下一页要传的 `selectedFrom`，不能翻页的（单次文本）只被告知没列的数量。
 * 提示是常量句式、数字放在字段里：同一份选区每次的文本都一样。
 */
function selectionLines(account: CanvasSelectionAccount, requestedFrom: number, text: string, pageable: boolean): string[] {
  const { total, from, listed, omitted } = account;
  if (total === 0) return ["当前选中: 无"];
  if (requestedFrom >= total) {
    return [`当前选中 ${total} 个，selectedFrom=${requestedFrom} 超出了选区末尾（有效范围 0–${total - 1}），本次没有列出任何一个`];
  }
  if (omitted === 0) return [`当前选中 ${total} 个: ${text}`];
  const last = from + listed;
  const gaps = [from > 0 ? spanLabel(1, from) : "", last < total ? spanLabel(last + 1, total) : ""].filter(Boolean).join("、");
  const lines = [`当前选中 ${total} 个，本次列出${spanLabel(from + 1, last)}，未列 ${omitted} 个(${gaps}): ${text}`];
  if (last < total) {
    lines.push(pageable
      ? `未列出的仍在当前选中里，不要猜；再调用 look_at_canvas 并传 selectedFrom: ${last} 读后面的（还剩 ${total - last} 个）。`
      : `未列出的 ${omitted} 个仍在当前选中里，不要猜它们是哪几个。`);
  }
  return lines;
}

function createPromptWriter(maxCharacters: number) {
  const parts: string[] = [];
  let length = 0;
  const appendLine = (line: string): boolean => {
    const separatorLength = parts.length ? 1 : 0;
    if (length + separatorLength + line.length > maxCharacters) return false;
    parts.push(line);
    length += separatorLength + line.length;
    return true;
  };
  const appendRemaining = (text: string, reserve = 0): boolean => {
    const separatorLength = parts.length ? 1 : 0;
    const available = maxCharacters - length - separatorLength - reserve;
    if (available <= 0) return true;
    const truncated = text.length > available;
    const value = truncated
      ? `${text.slice(0, Math.max(0, available - 1)).trimEnd()}…`
      : text;
    parts.push(value);
    length += separatorLength + value.length;
    return truncated;
  };
  return {
    appendLine,
    appendRemaining,
    remaining: () => maxCharacters - length,
    text: () => parts.join("\n"),
  };
}

export type CanvasProjectionOptions = Readonly<{
  /**
   * 选区窗口的起点（0 起）。**传了 = 这个调用方能翻页**（`look_at_canvas`）：列不全的选区会被指到下一页的
   * `selectedFrom`；完整提示词也只跟本页列出的选中节点走。不传 = 一次性文本（分镜规划，不能再调工具），
   * 只明说没列的数量，不指向它调不了的工具。
   */
  selectedFrom?: number;
}>;

/** 紧凑文本，加上它对选区做的账（让调用方 / 测试读事实，而不是反过来解析排版）。 */
export type CanvasAgentProjection = Readonly<{ text: string; selection: CanvasSelectionAccount }>;

const EMPTY_SELECTION: CanvasSelectionAccount = Object.freeze({ total: 0, from: 0, listed: 0, omitted: 0 });

/** Compact Pi presentation of the canonical, already-safe canvas.read result. */
export function formatCanvasForAgent(result: CanvasReadResult, options?: CanvasProjectionOptions): string {
  return projectCanvasForAgent(result, options).text;
}

/**
 * 紧凑文本的唯一 owner。选区那一块的不变量：`total = listed + omitted` 写在文本里；窗口里的 id 是选区里连续的一段；
 * 翻遍所有窗口恰好读到每个选中的 id 一次。截断不是静默的——`…` 只用来说节点 / 边 / 分镜表被截了。
 */
export function projectCanvasForAgent(result: CanvasReadResult, options: CanvasProjectionOptions = {}): CanvasAgentProjection {
  if (result.nodes.length === 0) return { text: "画布当前为空。", selection: EMPTY_SELECTION };

  const selectedAll = result.selectedNodeIds ?? [];
  const requestedFrom = Number.isFinite(options.selectedFrom) ? Math.max(0, Math.floor(options.selectedFrom!)) : 0;
  const from = Math.min(requestedFrom, selectedAll.length);
  const listedSlice = selectionWindow(selectedAll, from);
  const selection: CanvasSelectionAccount = selectedAll.length === 0
    ? EMPTY_SELECTION
    : { total: selectedAll.length, from, listed: listedSlice.listed, omitted: selectedAll.length - listedSlice.listed };
  const selectedIds = new Set(selectedAll.slice(from, from + listedSlice.listed));
  const continuation = requestedFrom > 0;

  const titleById = new Map(result.nodes.map((node) => [node.id, compactHead(node.title, 80)]));
  const nodesForPage = continuation ? result.nodes.filter((node) => selectedIds.has(node.id)) : result.nodes;
  const nodes = boundedJoin(nodesForPage, NODE_SUMMARY_BUDGET, "\n", (node) => {
    const storyboardDesignId = (node as unknown as { meta?: { storyboardDesignId?: unknown } }).meta?.storyboardDesignId;
    const flags = [
      node.locked ? "已锁定" : null,
      node.hasResult ? "已有结果" : null,
      node.status !== "idle" && node.status !== "success" ? node.status : null,
    ].filter(Boolean);
    const role = node.shotRole === "first_frame" ? "首帧图" : node.shotRole === "video" ? "视频" : "";
    // 分镜镜头只说分镜号（node.shotLabel，已含「首帧图」）；其余节点没有镜号，只有角色（首帧图 / 视频）。
    const shotLabel = node.shotLabel ?? role;
    const owners = boundedJoin(node.shotOwnerNodeIds ?? [], 260, ", ", (id) => compactHead(id, 120)).text;
    const promptHead = compactHead(node.prompt, 60);
    const resultIds = boundedJoin(node.resultIds ?? [], 260, ", ", (id) => compactHead(id, 120)).text;
    return [
      `- ${compactHead(node.id, 120)} | ${compactHead(node.kind, 40)}`,
      shotLabel ? ` | ${shotLabel}` : "",
      owners ? ` | shotOwnerNodeIds: ${owners}` : "",
      typeof storyboardDesignId === "string" && storyboardDesignId.trim() ? ` | storyboard:${storyboardDesignId.trim()}` : "",
      ` | ${compactHead(node.title, 80)}`,
      flags.length ? ` | ${flags.join(",")}` : "",
      promptHead ? ` | prompt: ${promptHead}` : "",
      node.text ? ` | text: ${compactHead(node.text, 60)}${node.textTruncated ? "(正文已截断)" : ""}` : "",
      node.currentResultId ? ` | currentResultId: ${compactHead(node.currentResultId, 120)}` : "",
      resultIds ? ` | resultIds: ${resultIds}` : "",
      node.taskRef ? ` | taskRef: ${JSON.stringify(node.taskRef)}` : "",
      node.shotTable ? ` | 分镜表 ${node.shotTable.rowCount} 镜（行见下方）` : "",
      node.director ? ` | 3D-BOX revision=${node.director.revision} shots=${boundedJoin(node.director.shots, 120, ",", (name) => compactHead(name, 40)).text} actors=${boundedJoin(node.director.actors, 80, ",", (name) => compactHead(name, 40)).text}${node.director.setPieces.length ? ` setPieces=${boundedJoin(node.director.setPieces, 60, ",", (name) => compactHead(name, 40)).text}` : ""} issues=${node.director.issueCount} preview=${node.director.preview}${node.director.previewTargetNodeId ? `→${compactHead(node.director.previewTargetNodeId, 120)}` : ""}${node.director.previewAssetId ? ` previewAssetId=${compactHead(node.director.previewAssetId, 120)}` : ""}` : "",
    ].join("");
  });
  const edges = boundedJoin(result.edges, EDGE_SUMMARY_BUDGET, ", ", (edge) =>
    `${titleById.get(edge.source) || compactHead(edge.source, 120)}→${titleById.get(edge.target) || compactHead(edge.target, 120)}`);
  const writer = createPromptWriter(MAX_CANVAS_PROMPT_CHARACTERS);
  writer.appendLine(`画布节点 ${result.nodes.length} 个(id | 类型 | 镜头号与角色 | 归属节点 | 标题 | 状态 | prompt 摘要 | 结果身份):`);
  if (continuation) {
    const pageRange = selection.listed > 0 ? spanLabel(selection.from + 1, selection.from + selection.listed) : "无";
    writer.appendLine(`本页只列选中的${pageRange}，其余节点和引用边见第 1 页。`);
  }
  for (const line of selectionLines(selection, requestedFrom, listedSlice.text, options.selectedFrom !== undefined)) writer.appendLine(line);
  writer.appendLine(nodes.text);
  if (!continuation) writer.appendLine(`引用边: ${edges.text || "无"}`);

  // 分镜表的行：排在选中节点的完整提示词之前（用户说「照第 2 镜复刻」时，那一镜的提示词就是要读的正文）。
  // 每张表分到「剩余预算 / 剩下几张表」与单表上限中的小者；表内的取舍（勾选的先、没放下的镜号明列）归 formatShotTableForAgent。
  const tables = continuation ? [] : result.nodes.filter((node) => node.shotTable);
  let tableBudgetTruncated = false;
  tables.forEach((node, index) => {
    const share = Math.floor((writer.remaining() - 2) / (tables.length - index)) - 1;
    if (share < 120) { tableBudgetTruncated = true; return; }
    writer.appendLine("");
    writer.appendLine(formatShotTableForAgent({ id: node.id, title: node.title, table: node.shotTable! }, Math.min(SHOT_TABLE_COMPACT_CHARACTERS, share)));
  });

  // 完整提示词 / 正文只跟本次列出的选中节点走：读后面一页，才读得到后面那些节点的完整内容。
  let promptTruncated = false;
  let promptsOmitted = false;
  const coreTruncated = nodes.truncated || (!continuation && edges.truncated) || tableBudgetTruncated;
  for (const node of result.nodes) {
    if (!selectedIds.has(node.id) || node.prompt.length <= 60) continue;
    const heading = `「${compactHead(node.title, 80)}」(${compactHead(node.id, 120)}) 完整提示词:`;
    if (writer.remaining() <= heading.length + 2) {
      promptsOmitted = true;
      break;
    }
    writer.appendLine("");
    writer.appendLine(heading);
    promptTruncated = writer.appendRemaining(node.prompt, coreTruncated ? 2 : 0);
    if (promptTruncated) break;
  }
  for (const node of result.nodes) {
    if (promptTruncated || !selectedIds.has(node.id) || !node.text || node.text.length <= 60) continue;
    const heading = `「${compactHead(node.title, 80)}」(${compactHead(node.id, 120)}) 文本正文${node.textTruncated ? "(已截断)" : ""}:`;
    if (writer.remaining() <= heading.length + 2) {
      promptsOmitted = true;
      break;
    }
    writer.appendLine("");
    writer.appendLine(heading);
    promptTruncated = writer.appendRemaining(node.text, coreTruncated ? 2 : 0);
  }
  if ((coreTruncated || promptsOmitted) && !promptTruncated) writer.appendLine("…");
  return { text: writer.text(), selection };
}
