// canvas.read 里「分镜表（拆解表）」那一块——Agent 读到的行、列、勾选，**只有这一个投影**。
//
// 为什么要有它（用户 2026-10-18 拍板）：分镜表节点不再自带「生成选中镜头」按钮（那颗按钮背后藏着模型和提示词的选择），
// 而是让用户对 Agent 说「照这几镜复刻」。修复前 `projectNode` 只投文本节点的正文，分镜表只剩一个标题——
// Agent 根本看不到行，「镜 3」对它是一个不存在的东西。
//
// 读的是哪份真相：`electron/shared/canvas/shotTable.ts` 的 `readShotTable`（分镜表文档的跨进程 owner），不在这里另 parse 一遍。
// 谁消费它：`canvasRead.ts` 的 `projectNode`（canonical 结果 = MCP `nomi_read{target:"canvas"}` 原样返回的那份），
// 以及 `canvasReadCompact.ts` 的 `formatCanvasForAgent`（应用内 Agent 的 look_at_canvas 文本）。两条路读同一个 canonical 字段，
// 不许再长出第二个「把 meta.shotTable 变成模型读得懂的东西」的函数。
import { z } from "zod";
import { deconstructionShotTableSchema, readShotTable, type ShotTableDocument } from "../canvas/shotTable";

/**
 * 上限与理由（canonical 投影；MCP 宿主拿到的就是它）。
 *
 * - `fieldCharacters` 400：读图腿让模型写的是「30–60 字的画面描述」和「一段可直接喂图片模型的提示词」
 *   （`electron/video/deconstructVideo.ts` 的 `buildShotAnalysisPrompt`），实际 100–300 字。400 能把一整段提示词原样带给
 *   Agent（复刻要的就是它），又不让一格失控的长文（对白转写、用户粘贴）吃掉整张表的预算。
 * - `textCharacters` 20 000：一张表所有格子加起来的上限（≈ 7k token，128k 上下文的 6% 以内）。按每镜约 400 字算能放下约 50 镜——
 *   15–60 秒的广告片切出来通常 8–40 镜，整张表一次读全；超过的按「勾选的先、其余按表序」放，放不下的明说没放。
 * - `rows` 60：与上面同一个量级的硬上限（切点上限 `MAX_CUTS` = 120，最长的表约 121 行）。行数本身也要封顶：
 *   一行即使格子全空也有十几个字段名的开销。
 * - `columns` 16：内置 6 列 + 用户自加的列；自定义列不设上限的话，列名本身就能撑爆。
 * - `selectedShots` 200：勾选的镜号是数字，便宜，但仍要封顶（分镜表文档本身不限行数）。
 */
export const SHOT_TABLE_READ_LIMITS = Object.freeze({
  rows: 60,
  columns: 16,
  fieldCharacters: 400,
  columnLabelCharacters: 60,
  textCharacters: 20_000,
  selectedShots: 200,
});

const identitySchema = z.string().trim().min(1);
const boundedText = (max: number) => z.string().max(max);

const shotTableReadColumnSchema = z.object({
  columnId: identitySchema,
  /** 内置列 = 列 id（shotSize / motion / visual / dialogue / onScreenText / mood）；自定义列 = 用户起的名字。 */
  label: boundedText(SHOT_TABLE_READ_LIMITS.columnLabelCharacters),
  custom: z.literal(true).optional(),
}).strict();

const shotTableReadRowSchema = z.object({
  rowId: identitySchema,
  /** 用户在表里看到的那个镜号（表的 `order`）。「镜 3」= shot 3。 */
  shot: z.number().finite(),
  startSeconds: z.number().finite().nonnegative(),
  endSeconds: z.number().finite().nonnegative(),
  durationSeconds: z.number().finite().nonnegative(),
  /** 用户在表里勾了这一行。 */
  selected: z.literal(true).optional(),
  /** 可见列的非空格子，键是 `columns[].columnId`。 */
  cells: z.record(boundedText(SHOT_TABLE_READ_LIMITS.fieldCharacters)),
  /** 读图腿给这一镜写的图片提示词（复刻这一镜时最该原样用的那段）。 */
  imagePrompt: boundedText(SHOT_TABLE_READ_LIMITS.fieldCharacters).optional(),
  /** 运镜提示词——只在和 `motion` 列不同时给（两者同源，相同就不重复占预算）。 */
  motionPrompt: boundedText(SHOT_TABLE_READ_LIMITS.fieldCharacters).optional(),
  /** 这一镜没读出来（读图失败）；原因在 failureReason。 */
  unread: z.literal(true).optional(),
  failureReason: boundedText(SHOT_TABLE_READ_LIMITS.fieldCharacters).optional(),
}).strict();

export const canvasReadShotTableSchema = z.object({
  /** 拆解的生命周期，词表 = 分镜表文档自己的那一份。 */
  status: deconstructionShotTableSchema.shape.source.shape.status,
  sourceNodeId: identitySchema,
  durationSeconds: z.number().finite().nonnegative().optional(),
  /** 表顶上那句话（拆失败 / 半成的原因）。 */
  notice: boundedText(SHOT_TABLE_READ_LIMITS.fieldCharacters).optional(),
  /** 拆解进行中那句更细的进度。 */
  progress: boundedText(SHOT_TABLE_READ_LIMITS.fieldCharacters).optional(),
  columns: z.array(shotTableReadColumnSchema).max(SHOT_TABLE_READ_LIMITS.columns),
  /** 表里一共多少行（rows 可能因为上限没放全）。 */
  rowCount: z.number().int().nonnegative(),
  /** 用户勾选的镜号，按表序。 */
  selectedShots: z.array(z.number().finite()).max(SHOT_TABLE_READ_LIMITS.selectedShots),
  rows: z.array(shotTableReadRowSchema).max(SHOT_TABLE_READ_LIMITS.rows),
  /** 有行没放进 rows，或有格子 / 列被截断。 */
  truncated: z.literal(true).optional(),
}).strict();

export type CanvasReadShotTable = z.infer<typeof canvasReadShotTableSchema>;
type ReadRow = CanvasReadShotTable["rows"][number];
type FactRow = ShotTableDocument["rows"][number];

function capText(value: string, max: number, flag: { cut: boolean }): string {
  if (value.length <= max) return value;
  flag.cut = true;
  return `${value.slice(0, max - 1)}…`;
}

function projectRow(row: FactRow, columns: readonly CanvasReadShotTable["columns"][number][], selected: boolean, flag: { cut: boolean }): { row: ReadRow; cost: number } {
  const max = SHOT_TABLE_READ_LIMITS.fieldCharacters;
  let cost = 0;
  const take = (value: string | undefined): string | undefined => {
    if (!value || !value.trim()) return undefined;
    const text = capText(value, max, flag);
    cost += text.length;
    return text;
  };
  const cells: Record<string, string> = {};
  for (const column of columns) {
    const text = take(row.cells[column.columnId]);
    if (text !== undefined) cells[column.columnId] = text;
  }
  const imagePrompt = take(row.imagePrompt);
  const motionPrompt = row.motionPrompt && row.motionPrompt !== row.cells.motion ? take(row.motionPrompt) : undefined;
  const failureReason = row.visionFailed ? take(row.failureReason) : undefined;
  return {
    cost,
    row: {
      rowId: row.rowId,
      shot: row.order,
      startSeconds: row.startSeconds,
      endSeconds: row.endSeconds,
      durationSeconds: row.durationSeconds,
      ...(selected ? { selected: true as const } : {}),
      cells,
      ...(imagePrompt !== undefined ? { imagePrompt } : {}),
      ...(motionPrompt !== undefined ? { motionPrompt } : {}),
      ...(row.visionFailed ? { unread: true as const } : {}),
      ...(failureReason !== undefined ? { failureReason } : {}),
    },
  };
}

/**
 * 分镜表节点的 meta → Agent 读到的那一块。读不出表（老格式 / 坏数据）→ undefined：分镜表那一侧 fail closed，
 * 这里不猜（`readShotTable` 失败的表在界面上也是「表找不到」）。
 */
export function projectShotTableForAgent(meta: unknown): CanvasReadShotTable | undefined {
  const table = readShotTable(meta);
  if (!table) return undefined;
  const flag = { cut: false };
  const limits = SHOT_TABLE_READ_LIMITS;

  const visible = table.columns.filter((column) => column.visible).slice().sort((a, b) => a.order - b.order);
  if (visible.length > limits.columns) flag.cut = true;
  const columns = visible.slice(0, limits.columns).map((column) => ({
    columnId: column.columnId,
    label: column.kind === "custom" ? capText(column.labelKey, limits.columnLabelCharacters, flag) : column.columnId,
    ...(column.kind === "custom" ? { custom: true as const } : {}),
  }));

  // 勾选只认还在表里的行（界面同一条判据：ShotTableNode 的 selectedIds）。
  const selectedIds = new Set(table.view.selectedRowIds);
  const isSelected = (row: FactRow) => selectedIds.has(row.rowId);
  const selectedRows = table.rows.filter(isSelected);
  if (selectedRows.length > limits.selectedShots) flag.cut = true;

  // 放行顺序：勾选的先（「复刻我勾的这几镜」必须读得到），其余按表序；输出永远按表序。
  const admitted = new Map<string, ReadRow>();
  let budget = limits.textCharacters;
  for (const row of [...selectedRows, ...table.rows.filter((candidate) => !isSelected(candidate))]) {
    if (admitted.size >= limits.rows) break;
    const projected = projectRow(row, columns, isSelected(row), flag);
    if (projected.cost > budget) break;
    budget -= projected.cost;
    admitted.set(row.rowId, projected.row);
  }
  if (admitted.size < table.rows.length) flag.cut = true;

  const source = table.source;
  const notice = source.errorMessage?.trim() ? capText(source.errorMessage, limits.fieldCharacters, flag) : undefined;
  const progress = source.status === "running" && source.progressDetail?.trim()
    ? capText(source.progressDetail, limits.fieldCharacters, flag) : undefined;

  return {
    status: source.status,
    sourceNodeId: source.sourceNodeId,
    ...(source.durationSeconds !== undefined ? { durationSeconds: source.durationSeconds } : {}),
    ...(notice !== undefined ? { notice } : {}),
    ...(progress !== undefined ? { progress } : {}),
    columns,
    rowCount: table.rows.length,
    selectedShots: selectedRows.slice(0, limits.selectedShots).map((row) => row.order),
    rows: table.rows.flatMap((row) => admitted.get(row.rowId) ?? []),
    ...(flag.cut ? { truncated: true as const } : {}),
  };
}

// ── 应用内 Agent 的紧凑文本（look_at_canvas）：同一份 canonical 字段的另一种排版，不另读 meta。──

/** 一张表在 look_at_canvas 文本里最多占多少字（整份画布文本上限 12 000，见 `canvasReadCompact.ts`）。 */
export const SHOT_TABLE_COMPACT_CHARACTERS = 8_000;

const STATUS_WORDS: Record<CanvasReadShotTable["status"], string> = {
  idle: "还没拆", running: "拆解中", ready: "已拆完", failed: "拆解失败", interrupted: "拆解中断", cancelled: "拆解已取消",
};

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

function shotRanges(shots: readonly number[]): string {
  const sorted = [...shots].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const start = sorted[index];
    let end = start;
    while (index + 1 < sorted.length && sorted[index + 1] === end + 1) end = sorted[++index];
    parts.push(end === start ? `镜 ${start}` : `镜 ${start}–${end}`);
  }
  return parts.join(", ");
}

/** 预算紧时的一行：只留镜号、勾选和起草最要紧的那一段（imagePrompt，没有就 visual），截到这么长。 */
const LEAN_FIELD_CHARACTERS = 200;

function rowLine(row: ReadRow, labels: ReadonlyMap<string, string>, lean = false): string {
  const flags = [row.selected ? "已勾选" : "", row.unread ? `没读出${row.failureReason ? `（${oneLine(row.failureReason)}）` : ""}` : ""].filter(Boolean);
  const head = `镜 ${row.shot} (${row.rowId}) ${row.startSeconds}–${row.endSeconds}s`;
  if (lean) {
    const key = row.imagePrompt ? "imagePrompt" : "visual";
    const value = oneLine(row.imagePrompt ?? row.cells.visual ?? "");
    const clipped = value.length > LEAN_FIELD_CHARACTERS ? `${value.slice(0, LEAN_FIELD_CHARACTERS - 1)}…` : value;
    return [head, ...flags, ...(clipped ? [`${key}: ${clipped}`] : []), "其余格子略"].join(" · ");
  }
  const fields = [
    ...Object.entries(row.cells).map(([columnId, value]) => `${labels.get(columnId) ?? columnId}: ${oneLine(value)}`),
    ...(row.imagePrompt ? [`imagePrompt: ${oneLine(row.imagePrompt)}`] : []),
    ...(row.motionPrompt ? [`motionPrompt: ${oneLine(row.motionPrompt)}`] : []),
  ];
  return [head, ...flags, ...fields].join(" · ");
}

/**
 * 一张分镜表的紧凑文本，长度 ≤ maxCharacters。勾选的行先占预算，其余按表序；没放下的镜号明着列出来，
 * 并告诉模型怎么拿到它们（让用户勾选——勾选的行永远先放）。
 */
export function formatShotTableForAgent(input: { id: string; title: string; table: CanvasReadShotTable }, maxCharacters: number): string {
  const { table } = input;
  const labels = new Map(table.columns.map((column) => [column.columnId, column.custom ? `${column.label}(自定义列)` : column.label]));
  const header = [
    `分镜表「${oneLine(input.title).slice(0, 80)}」(${input.id})`,
    STATUS_WORDS[table.status],
    `共 ${table.rowCount} 镜`,
    `用户勾选: ${table.selectedShots.length ? shotRanges(table.selectedShots) : "无"}`,
    `列: ${table.columns.map((column) => labels.get(column.columnId)).join(", ") || "无"}`,
  ].join(" · ");
  const lines = [header];
  if (table.notice) lines.push(`表顶提示: ${oneLine(table.notice)}`);
  if (table.progress) lines.push(`进度: ${oneLine(table.progress)}`);
  if (table.rows.length) lines.push("镜号就是用户在表里看到的编号；复刻某一镜时，以那一镜的 imagePrompt（没有就用 visual）为起草提示词。");

  const omittedNote = (shots: readonly number[]) => `…未列出 ${shots.length} 镜: ${shotRanges(shots)}（要读它们：请用户在表里勾选，勾选的镜永远先列出）`;
  const beyondCap = table.rowCount - table.rows.length;
  const beyondNote = `…另有 ${beyondCap} 镜超出读取上限没有列出（同样请用户勾选）`;
  const fixed = lines.join("\n");
  // 预留「未列出」那两行的最坏长度，保证它们永远写得下。
  const reserve = omittedNote(table.rows.map((row) => row.shot)).length + 1 + (beyondCap > 0 ? beyondNote.length + 1 : 0);
  let budget = maxCharacters - fixed.length - reserve;
  // 整行放不下就退到精简行（镜号 + 起草提示词的前 200 字）；精简行也放不下才停——宁可每镜少说几格，也别让勾选的镜整行消失。
  const kept = new Map<string, string>();
  for (const row of [...table.rows.filter((row) => row.selected), ...table.rows.filter((row) => !row.selected)]) {
    const full = rowLine(row, labels);
    const line = full.length + 1 <= budget ? full : rowLine(row, labels, true);
    if (line.length + 1 > budget) break;
    budget -= line.length + 1;
    kept.set(row.rowId, line);
  }
  const out = [fixed, ...table.rows.flatMap((row) => kept.get(row.rowId) ?? [])];
  const omitted = table.rows.filter((row) => !kept.has(row.rowId)).map((row) => row.shot);
  if (omitted.length) out.push(omittedNote(omitted));
  if (beyondCap > 0) out.push(beyondNote);
  const text = out.join("\n");
  return text.length <= maxCharacters ? text : `${text.slice(0, Math.max(0, maxCharacters - 1))}…`;
}
