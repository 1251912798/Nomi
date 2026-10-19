import { describe, expect, it } from "vitest";

import { projectCanvasRead } from "./canvasRead";
import { formatCanvasForAgent } from "./canvasReadCompact";

// 设计卡 ★7：Agent 读分镜表（look_at_canvas / nomi_read target=canvas）在最坏规模下的开销。
// 计时那一条不进常规套件（量的是本机 CPU，机器忙时数会漂、会误红；与 directGenerationBrakes.perf.test.ts 同一约定）：
//   NOMI_PERF=1 pnpm exec vitest run electron/shared/agentCapabilities/canvasReadShotTable.perf.test.ts --silent=false
// 最坏规模：200 个节点的画布 + 两张 200 行 × 16 列（6 内置 + 10 自定义）的分镜表，每格 / 每段提示词都超过 400 字上限。
// 预算：一次「canonical 投影 + 应用内紧凑文本」≤ 50ms p95。这一步不在任何手势路径上（Agent 发起一次读才跑，
// 读完要等一次模型往返，秒级），50ms 远低于用户能感知的 100ms 反馈线；页面交互不受它影响。
const ROWS = 200;
const BUDGET_MS = 50;
const enabled = process.env.NOMI_PERF === "1";
const LONG = "雨夜霓虹街口撑红伞的女孩".repeat(60);

function worstTableMeta(selected: string[]) {
  const builtin = ["shotSize", "motion", "visual", "dialogue", "onScreenText", "mood"];
  const custom = Array.from({ length: 10 }, (_, index) => `custom-${index}`);
  return {
    shotTable: {
      schemaVersion: 1, revision: 1, updatedAt: "2026-10-19T00:00:00.000Z",
      view: { selectedRowIds: selected, density: "auto" },
      source: { kind: "deconstruction", sourceNodeId: "video-0", title: "worst", status: "ready" },
      columnSetId: "facts",
      columns: [
        ...builtin.map((columnId, order) => ({ columnId, kind: "builtin", labelKey: columnId, order, visible: true })),
        ...custom.map((columnId, index) => ({ columnId, kind: "custom", labelKey: `自定义列${index}`, order: 6 + index, visible: true })),
      ],
      rows: Array.from({ length: ROWS }, (_, index) => ({
        rowId: `fact-${index + 1}`, order: index + 1, startSeconds: index, endSeconds: index + 1, durationSeconds: 1, carriedOver: false,
        cells: Object.fromEntries([...builtin, ...custom].map((columnId) => [columnId, `${columnId}-${index} ${LONG}`])),
        imagePrompt: `image-${index} ${LONG}`, motionPrompt: `motion-${index} ${LONG}`,
      })),
    },
  };
}

function worstCanvas() {
  const nodes: Record<string, unknown>[] = Array.from({ length: 198 }, (_, index) => ({
    id: index === 0 ? "video-0" : `node-${index}`, kind: index % 2 ? "image" : "video", title: `镜头 ${index}`,
    prompt: `prompt ${index} ${LONG}`, position: { x: index * 10, y: 0 },
  }));
  nodes.push({ id: "table-a", kind: "shot_table", title: "表 A", position: { x: 0, y: 900 }, meta: worstTableMeta(["fact-150", "fact-199"]) });
  nodes.push({ id: "table-b", kind: "shot_table", title: "表 B", position: { x: 0, y: 1800 }, meta: worstTableMeta([]) });
  return { nodes, edges: [], groups: [], selectedNodeIds: ["table-a"] };
}

describe("分镜表读面开销（★7）", () => {
  it.skipIf(!enabled)(`200 节点 + 两张 ${ROWS} 行 × 16 列的表：一次投影 + 紧凑文本 p95 ≤ ${BUDGET_MS}ms`, () => {
    const source = worstCanvas();
    const samples: number[] = [];
    for (let index = 0; index < 30; index += 1) {
      const started = performance.now();
      const text = formatCanvasForAgent(projectCanvasRead(source));
      samples.push(performance.now() - started);
      expect(text).toContain("镜 150 (fact-150)");
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
    const median = samples[Math.floor(samples.length / 2)]!;
    console.log(`[canvas-read-shot-table-perf] ${JSON.stringify({ rows: ROWS, tables: 2, nodes: 200, medianMs: Math.round(median * 10) / 10, p95Ms: Math.round(p95 * 10) / 10, budgetMs: BUDGET_MS })}`);
    expect(p95, `median ${median.toFixed(2)}ms / p95 ${p95.toFixed(2)}ms`).toBeLessThanOrEqual(BUDGET_MS);
  });
});
