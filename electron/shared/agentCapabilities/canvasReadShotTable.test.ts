import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { projectCanvasRead } from "./canvasRead";
import { formatCanvasForAgent, MAX_CANVAS_PROMPT_CHARACTERS } from "./canvasReadCompact";
import {
  SHOT_TABLE_COMPACT_CHARACTERS,
  SHOT_TABLE_READ_LIMITS,
  canvasReadShotTableSchema,
  formatShotTableForAgent,
  projectShotTableForAgent,
} from "./canvasReadShotTable";

// 用户 2026-10-18 拍板：分镜表不再自带「生成选中镜头」按钮，改成 Agent 读表、用户说「照这几镜复刻」。
// 这里钉的是 Agent 读到的那一块：行、镜号、勾选、自定义列、上限，以及表的每一种状态。

type Row = Record<string, unknown>;
const BUILTIN = ["shotSize", "motion", "visual", "dialogue", "onScreenText", "mood"];

function fact(order: number, overrides: Row = {}): Row {
  return {
    rowId: `fact-${order}`, order, startSeconds: (order - 1) * 1.5, endSeconds: order * 1.5, durationSeconds: 1.5,
    carriedOver: false, keyframeRef: `nomi-local://project/frames/shot-${order}.png`,
    cells: { shotSize: "中景", motion: `镜${order}缓慢推近`, visual: `第${order}镜画面：女孩撑红伞站在霓虹街口`, dialogue: "", onScreenText: "", mood: "孤独" },
    imagePrompt: `shot ${order} image prompt, girl with red umbrella, neon street, cinematic`,
    motionPrompt: `镜${order}缓慢推近`,
    ...overrides,
  };
}

function tableMeta(overrides: { rows?: Row[]; columns?: Row[]; selectedRowIds?: string[]; source?: Row } = {}): Row {
  return {
    shotTable: {
      schemaVersion: 1, revision: 3, updatedAt: "2026-10-19T00:00:00.000Z",
      view: { selectedRowIds: overrides.selectedRowIds ?? [], density: "auto" },
      source: { kind: "deconstruction", sourceNodeId: "video-ref", title: "参考片", status: "ready", durationSeconds: 7.5, ...overrides.source },
      columnSetId: "facts",
      columns: overrides.columns ?? BUILTIN.map((columnId, order) => ({ columnId, kind: "builtin", labelKey: columnId, order, visible: true })),
      rows: overrides.rows ?? [1, 2, 3, 4, 5].map((order) => fact(order)),
    },
  };
}

function canvasWith(meta: Row, extra: Row = {}) {
  return projectCanvasRead({
    nodes: [
      { id: "video-ref", kind: "video", title: "参考片", position: { x: 0, y: 0 } },
      { id: "table-1", kind: "shot_table", title: "参考片拆解", position: { x: 600, y: 0 }, meta, ...extra },
    ],
    edges: [{ id: "e1", source: "video-ref", target: "table-1", mode: "reference" }],
    groups: [],
    selectedNodeIds: [],
  });
}

const tableOf = (result: ReturnType<typeof projectCanvasRead>) => result.nodes.find((node) => node.kind === "shot_table")!.shotTable;

describe("canvas.read · 分镜表的行（canonical）", () => {
  it("5 镜的表：镜号、勾选、可见列、提示词都在；运镜与 motion 列相同时不重复", () => {
    const table = tableOf(canvasWith(tableMeta({ selectedRowIds: ["fact-2", "fact-3", "fact-gone"] })))!;
    expect(table).toMatchObject({ status: "ready", sourceNodeId: "video-ref", durationSeconds: 7.5, rowCount: 5, selectedShots: [2, 3] });
    expect(table.truncated).toBeUndefined();
    expect(table.columns.map((column) => column.label)).toEqual(BUILTIN);
    expect(table.rows.map((row) => row.shot)).toEqual([1, 2, 3, 4, 5]);
    expect(table.rows.filter((row) => row.selected).map((row) => row.rowId)).toEqual(["fact-2", "fact-3"]);
    expect(table.rows[1]).toEqual({
      rowId: "fact-2", shot: 2, startSeconds: 1.5, endSeconds: 3, durationSeconds: 1.5, selected: true,
      cells: { shotSize: "中景", motion: "镜2缓慢推近", visual: "第2镜画面：女孩撑红伞站在霓虹街口", mood: "孤独" },
      imagePrompt: "shot 2 image prompt, girl with red umbrella, neon street, cinematic",
    });
  });

  it("关键帧地址（nomi-local://）、meta、url 一个都不出读面", () => {
    const text = JSON.stringify(canvasWith(tableMeta()));
    expect(text).not.toContain("nomi-local://");
    expect(text).not.toMatch(/"(meta|url|keyframeRef)"/);
  });

  it("自定义列带用户起的名字；隐藏的列不出现（模型看到的 = 用户看到的）", () => {
    const columns = [
      ...BUILTIN.map((columnId, order) => ({ columnId, kind: "builtin", labelKey: columnId, order, visible: columnId !== "onScreenText" })),
      { columnId: "c-uuid-1", kind: "custom", labelKey: "道具", order: 6, visible: true },
    ];
    const rows = [fact(1, { cells: { ...(fact(1).cells as Row), onScreenText: "限时 5 折", "c-uuid-1": "红伞" } })];
    const table = tableOf(canvasWith(tableMeta({ columns, rows })))!;
    expect(table.columns.find((column) => column.columnId === "c-uuid-1")).toEqual({ columnId: "c-uuid-1", label: "道具", custom: true });
    expect(table.columns.some((column) => column.columnId === "onScreenText")).toBe(false);
    expect(table.rows[0]!.cells).toMatchObject({ "c-uuid-1": "红伞" });
    expect(table.rows[0]!.cells.onScreenText).toBeUndefined();
  });

  it("运镜提示词与 motion 列不同时（用户改过 motion 格）两份都给", () => {
    const rows = [fact(1, { cells: { ...(fact(1).cells as Row), motion: "改成手持跟拍" } })];
    const row = tableOf(canvasWith(tableMeta({ rows })))!.rows[0]!;
    expect(row.cells.motion).toBe("改成手持跟拍");
    expect(row.motionPrompt).toBe("镜1缓慢推近");
  });

  it("没读出的镜：unread + 供应商原话", () => {
    const rows = [fact(1), fact(2, { visionFailed: true, failureReason: "429 rate limit", cells: { shotSize: "", motion: "", visual: "", dialogue: "", onScreenText: "", mood: "" }, imagePrompt: "", motionPrompt: "" })];
    const row = tableOf(canvasWith(tableMeta({ rows })))!.rows[1]!;
    expect(row).toEqual({ rowId: "fact-2", shot: 2, startSeconds: 1.5, endSeconds: 3, durationSeconds: 1.5, cells: {}, unread: true, failureReason: "429 rate limit" });
  });

  it.each([
    ["还没拆（idle）", { status: "idle" }, []],
    ["拆解中（running）带进度", { status: "running", phase: 1, progressDetail: "读图 2/6" }, []],
    ["拆解失败（failed）带原因", { status: "failed", errorMessage: "切点检测失败：文件损坏" }, []],
    ["中断（interrupted）", { status: "interrupted" }, []],
    ["取消（cancelled）", { status: "cancelled" }, []],
    ["半成（ready + 原因 + 有行）", { status: "ready", errorMessage: "对白没取到" }, [fact(1)]],
  ] as const)("表的状态：%s", (_name, source, rows) => {
    const table = tableOf(canvasWith(tableMeta({ source: source as Row, rows: rows as unknown as Row[] })))!;
    expect(canvasReadShotTableSchema.safeParse(table).success).toBe(true);
    expect(table.status).toBe(source.status);
    expect(table.rowCount).toBe(rows.length);
    if ("progressDetail" in source) expect(table.progress).toBe("读图 2/6");
    if ("errorMessage" in source) expect(table.notice).toBe(source.errorMessage);
    const text = formatShotTableForAgent({ id: "table-1", title: "参考片拆解", table }, SHOT_TABLE_COMPACT_CHARACTERS);
    expect(text).toContain(`共 ${rows.length} 镜`);
    if ("errorMessage" in source) expect(text).toContain(source.errorMessage);
  });

  it("读不出的表（坏数据 / 退役格式）不猜：节点照常投影、没有 shotTable", () => {
    const broken = canvasWith({ shotTable: { schemaVersion: 1, rows: "not-an-array" } });
    const node = broken.nodes.find((candidate) => candidate.id === "table-1")!;
    expect(node.kind).toBe("shot_table");
    expect(node.shotTable).toBeUndefined();
    expect(projectShotTableForAgent(undefined)).toBeUndefined();
  });

  it("只有 shot_table 节点读表：别的节点 meta 里塞了 shotTable 也不出", () => {
    const result = projectCanvasRead({ nodes: [{ id: "img", kind: "image", position: { x: 0, y: 0 }, meta: tableMeta() }], edges: [], groups: [], selectedNodeIds: [] });
    expect(result.nodes[0]!.shotTable).toBeUndefined();
  });
});

describe("canvas.read · 分镜表的上限（200 镜不撑爆上下文）", () => {
  const LONG = "超长的提示词".repeat(200);
  const rows = Array.from({ length: 200 }, (_, index) => fact(index + 1, {
    cells: Object.fromEntries(BUILTIN.map((columnId) => [columnId, `${columnId} ${index + 1} ${LONG}`])),
    imagePrompt: `image ${index + 1} ${LONG}`, motionPrompt: `motion-different ${LONG}`,
  }));
  const meta = tableMeta({ rows, selectedRowIds: ["fact-150", "fact-199"] });

  it("canonical：行数 / 每格 / 全表字数都封顶，rowCount 与 truncated 说真话，勾选的晚镜也读得到", () => {
    const table = tableOf(canvasWith(meta))!;
    expect(table.rowCount).toBe(200);
    expect(table.truncated).toBe(true);
    expect(table.rows.length).toBeLessThanOrEqual(SHOT_TABLE_READ_LIMITS.rows);
    expect(table.rows.length).toBeGreaterThan(2);
    expect(table.selectedShots).toEqual([150, 199]);
    expect(table.rows.filter((row) => row.selected).map((row) => row.shot)).toEqual([150, 199]);
    // 输出按表序：勾选的晚镜排在最后，前面是表头那几镜。
    expect(table.rows.map((row) => row.shot)).toEqual([...table.rows.map((row) => row.shot)].sort((a, b) => a - b));
    expect(table.rows[0]!.shot).toBe(1);
    let total = 0;
    for (const row of table.rows) {
      for (const value of [...Object.values(row.cells), row.imagePrompt ?? "", row.motionPrompt ?? ""]) {
        expect(value.length).toBeLessThanOrEqual(SHOT_TABLE_READ_LIMITS.fieldCharacters);
        total += value.length;
      }
    }
    expect(total).toBeLessThanOrEqual(SHOT_TABLE_READ_LIMITS.textCharacters);
    expect(JSON.stringify(table).length).toBeLessThan(SHOT_TABLE_READ_LIMITS.textCharacters + 8_000);
  });

  it("列数封顶：40 个自定义列只出前 16 个，并标 truncated", () => {
    const columns = Array.from({ length: 40 }, (_, order) => ({ columnId: `c-${order}`, kind: "custom", labelKey: `列${order}`, order, visible: true }));
    const table = tableOf(canvasWith(tableMeta({ columns, rows: [fact(1)] })))!;
    expect(table.columns).toHaveLength(SHOT_TABLE_READ_LIMITS.columns);
    expect(table.truncated).toBe(true);
  });

  it("应用内文本：一张表 ≤ 8 000 字、整份画布 ≤ 12 000 字；勾选的镜在，没放下的镜号明列", () => {
    const result = canvasWith(meta);
    const tableText = formatShotTableForAgent({ id: "table-1", title: "参考片拆解", table: tableOf(result)! }, SHOT_TABLE_COMPACT_CHARACTERS);
    expect(tableText.length).toBeLessThanOrEqual(SHOT_TABLE_COMPACT_CHARACTERS);
    expect(tableText).toMatch(/镜 150 \(fact-150\).*已勾选/);
    expect(tableText).toMatch(/镜 199 \(fact-199\).*已勾选/);
    // canonical 只放进了几镜（每镜都是上限那么胖）→ 其余的镜数明说，不假装整张表都在。
    expect(tableText).toContain(`…另有 ${200 - tableOf(result)!.rows.length} 镜超出读取上限没有列出`);
    const text = formatCanvasForAgent(result);
    expect(text.length).toBeLessThanOrEqual(MAX_CANVAS_PROMPT_CHARACTERS);
    expect(text).toContain("镜 150 (fact-150)");
  });

  it("画布本身很满（200 个节点吃掉大半预算）时，勾选的镜退成精简行也要在，而不是整张表只剩一句「未列出」", () => {
    const crowd = Array.from({ length: 198 }, (_, index) => ({ id: `n-${index}`, kind: "image", title: `镜头 ${index} ${"标题".repeat(20)}`, prompt: LONG, position: { x: index, y: 0 } }));
    const result = projectCanvasRead({
      nodes: [...crowd, { id: "table-1", kind: "shot_table", title: "参考片拆解", position: { x: 0, y: 900 }, meta }],
      edges: [], groups: [], selectedNodeIds: ["table-1"],
    });
    const text = formatCanvasForAgent(result);
    expect(text.length).toBeLessThanOrEqual(MAX_CANVAS_PROMPT_CHARACTERS);
    expect(text).toMatch(/镜 150 \(fact-150\) [^\n]*已勾选/);
    expect(text).toMatch(/镜 199 \(fact-199\) [^\n]*已勾选 · imagePrompt: image 199 [^\n]*其余格子略/);
    expect(text).toMatch(/…未列出 \d+ 镜: 镜 \d/);
  });
});

describe("应用内 Agent 的 look_at_canvas 文本（5 镜的表）", () => {
  it("镜号、勾选、列名、imagePrompt 都在画布文本里，排在引用边之后", () => {
    const text = formatCanvasForAgent(canvasWith(tableMeta({ selectedRowIds: ["fact-2", "fact-3"] })));
    expect(text).toContain("- table-1 | shot_table | 参考片拆解 | 分镜表 5 镜（行见下方）");
    expect(text).toContain("分镜表「参考片拆解」(table-1) · 已拆完 · 共 5 镜 · 用户勾选: 镜 2–3 · 列: shotSize, motion, visual, dialogue, onScreenText, mood");
    expect(text).toContain("镜 2 (fact-2) 1.5–3s · 已勾选 · shotSize: 中景 · motion: 镜2缓慢推近 · visual: 第2镜画面：女孩撑红伞站在霓虹街口 · mood: 孤独 · imagePrompt: shot 2 image prompt");
    for (const shot of [1, 2, 3, 4, 5]) expect(text).toContain(`镜 ${shot} (fact-${shot})`);
    expect(text).not.toContain("未列出");
    expect(text.indexOf("引用边:")).toBeLessThan(text.indexOf("分镜表「"));
  });
});

describe("分镜表给模型看的投影只有一个出口", () => {
  // P1：修复前分镜表在读面上只有标题；修复后如果别的 Agent 面文件再自己读 meta.shotTable 拼一份给模型，
  // MCP 与应用内 Agent 就会读到两种表。Agent 面三个目录里，readShotTable 只许 canvasReadShotTable.ts 调。
  it("electron/shared/agentCapabilities、electron/agentLane、electron/capabilityCore 里只有 canvasReadShotTable.ts 读分镜表文档", () => {
    const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|mts)$/.test(entry.name) || /\.test\.ts$/.test(entry.name)) continue;
        if (entry.name === "canvasReadShotTable.ts") continue;
        if (/\breadShotTable\b|meta\??\.shotTable\b/.test(readFileSync(full, "utf8"))) offenders.push(path.relative(electronRoot, full));
      }
    };
    for (const dir of ["shared/agentCapabilities", "agentLane", "capabilityCore"]) walk(path.join(electronRoot, dir));
    expect(offenders).toEqual([]);
  });
});
