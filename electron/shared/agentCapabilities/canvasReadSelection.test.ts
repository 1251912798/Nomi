import { describe, expect, it } from "vitest";

import { CANVAS_READ_CAPABILITY, projectCanvasRead, type CanvasReadResult } from "./canvasRead";
import { MAX_CANVAS_PROMPT_CHARACTERS, formatCanvasForAgent, projectCanvasForAgent } from "./canvasReadCompact";
import { specsForCapability } from "./modelFacingToolRegistry";
import { toSemanticInput } from "./modelFacingTools";

// 2026-10-21 实测（#1263 的实现线报告）：look_at_canvas 的「当前选中」行预算约 900 字，~31 个 id 之后只剩一个「…」，
// 没有总数，这个动词也不能翻页——选 40 个，模型拿到前 31 个，看不出少了，补读也读不全。
// 这里钉的是整类：**任何给模型看的选区，都不能比真实选区少却不说，且少了就有办法读到其余**。
// 不变量与 #1263（electron/shared/agentContextSnapshot.ts）同一套账：total = listed + omitted，永远写在文本里。

/** 真实形状的节点 id（canvasIds.createNodeId：gen-v2-<kind>-<时间戳 base36>-<4 位随机>），约 26 字。 */
const nodeId = (index: number): string =>
  `gen-v2-image-${(1_760_000_000_000 + index * 7919).toString(36)}-${(index * 46_656 + 1_679_616).toString(36).slice(0, 4)}`;

function canvasOf(selectedCount: number, options: { title?: (index: number) => string; extraNodes?: number } = {}): CanvasReadResult {
  const total = selectedCount + (options.extraNodes ?? 0);
  const nodes = Array.from({ length: total }, (_, index) => ({
    id: nodeId(index), kind: "image", title: options.title?.(index) ?? `镜头 ${index + 1}`, prompt: "", position: { x: index * 10, y: 0 },
  }));
  return projectCanvasRead({ nodes, edges: [], groups: [], selectedNodeIds: nodes.slice(0, selectedCount).map((node) => node.id) });
}

const selectedIdsOf = (result: CanvasReadResult): readonly string[] => result.selectedNodeIds;

/** 文本里「当前选中」那一行（不含提示行）。 */
const selectionLineOf = (text: string): string => text.split("\n").find((line) => line.startsWith("当前选中"))!;

/** 选中行冒号之后的 id 列表。 */
function listedIdsOf(text: string): string[] {
  const line = selectionLineOf(text);
  const colon = line.indexOf(": ");
  return colon < 0 ? [] : line.slice(colon + 2).split(", ").filter(Boolean);
}

const LADDER = [1, 31, 32, 40, 256] as const;

describe("look_at_canvas 的选区：列全，或明说少了几个", () => {
  it.each(LADDER)("选 %i 个：总数永远写在文本里，已列 + 未列 = 总数", (count) => {
    const result = canvasOf(count);
    const text = formatCanvasForAgent(result);
    const { selection } = projectCanvasForAgent(result, { selectedFrom: 0 });

    expect(selectionLineOf(text)).toContain(`当前选中 ${count} 个`);
    expect(selection.total).toBe(count);
    expect(selection.listed + selection.omitted).toBe(count);
    // 事实与文本对得上：文本里真的列了 listed 个，而且就是选区的前 listed 个。
    expect(listedIdsOf(text)).toEqual(selectedIdsOf(result).slice(0, selection.listed));
    if (selection.omitted === 0) {
      expect(selectionLineOf(text)).not.toContain("未列");
    } else {
      expect(selectionLineOf(text)).toContain(`未列 ${selection.omitted} 个`);
    }
  });

  it("选 1 个与 31 个是全列，选 256 个一定有未列（这个量具真的量得到边界）", () => {
    expect(projectCanvasForAgent(canvasOf(1), { selectedFrom: 0 }).selection.omitted).toBe(0);
    expect(projectCanvasForAgent(canvasOf(31), { selectedFrom: 0 }).selection.omitted).toBe(0);
    expect(projectCanvasForAgent(canvasOf(256), { selectedFrom: 0 }).selection.omitted).toBeGreaterThan(0);
  });

  it("不在原样的省略号里藏账：选区超出的那一刻，文本里没有一个只剩「…」的选中行", () => {
    const text = formatCanvasForAgent(canvasOf(40));
    expect(selectionLineOf(text)).not.toMatch(/…\s*$/);
    // 选区已经明账，就不该再靠末尾的「…」暗示（那个「…」只说节点 / 边 / 分镜表被截了）。
    expect(text.endsWith("…")).toBe(false);
  });

  it.each(LADDER)("选 %i 个：顺着提示翻页，每个选中的 id 恰好出现一次、顺序不变", (count) => {
    const result = canvasOf(count);
    const seen: string[] = [];
    let from = 0;
    let pages = 0;
    for (;;) {
      pages += 1;
      expect(pages).toBeLessThanOrEqual(count); // 每页至少前进一个，翻页必终止
      const page = projectCanvasForAgent(result, { selectedFrom: from });
      expect(page.text.length).toBeLessThanOrEqual(MAX_CANVAS_PROMPT_CHARACTERS);
      expect(page.selection.listed).toBeGreaterThan(0);
      expect(listedIdsOf(page.text)).toEqual(selectedIdsOf(result).slice(from, from + page.selection.listed));
      seen.push(...listedIdsOf(page.text));
      const next = from + page.selection.listed;
      if (next >= count) break;
      // 还有没列的：提示行必须点名下一页怎么读（用的就是下面要传的那个数）。
      expect(page.text).toContain(`selectedFrom: ${next}`);
      from = next;
    }
    expect(seen).toEqual(selectedIdsOf(result));
  });

  it("超长节点标题不能挤掉其他 id：列出的个数与标题长短无关", () => {
    const short = projectCanvasForAgent(canvasOf(40), { selectedFrom: 0 }).selection;
    const long = projectCanvasForAgent(canvasOf(40, { title: (index) => `极长的标题${index}${"很长".repeat(5_000)}` }), { selectedFrom: 0 }).selection;
    expect(long).toEqual(short);
    expect(long.listed + long.omitted).toBe(40);
  });

  it("输出是确定的：同一输入两次一致，翻页也一样", () => {
    const result = canvasOf(256);
    expect(formatCanvasForAgent(result)).toBe(formatCanvasForAgent(result));
    expect(projectCanvasForAgent(result, { selectedFrom: 64 }).text).toBe(projectCanvasForAgent(result, { selectedFrom: 64 }).text);
  });

  it("翻到选区末尾之外：明说越界和有效范围，不假装有内容", () => {
    const page = projectCanvasForAgent(canvasOf(40), { selectedFrom: 999 });
    expect(page.selection).toMatchObject({ total: 40, listed: 0, omitted: 40 });
    expect(selectionLineOf(page.text)).toContain("当前选中 40 个");
    expect(selectionLineOf(page.text)).toContain("超出");
    expect(listedIdsOf(page.text)).toEqual([]);
  });

  it("没有选区仍是「无」，没有账可言", () => {
    const text = formatCanvasForAgent(canvasOf(0, { extraNodes: 3 }));
    expect(text).toContain("当前选中: 无");
    expect(projectCanvasForAgent(canvasOf(0, { extraNodes: 3 }), { selectedFrom: 0 }).selection).toEqual({ total: 0, from: 0, listed: 0, omitted: 0 });
  });

  it("单次文本的调用方（分镜规划）也有账，但不被指给它调不了的工具", () => {
    const text = formatCanvasForAgent(canvasOf(256));
    expect(selectionLineOf(text)).toMatch(/当前选中 256 个.*未列 \d+ 个/);
    expect(text).toContain("不要猜");
    expect(text).not.toContain("selectedFrom");
    expect(text).not.toContain("look_at_canvas");
  });

  it("能翻页的调用方被明确指到 look_at_canvas 与下一页的 selectedFrom", () => {
    const page = projectCanvasForAgent(canvasOf(256), { selectedFrom: 0 });
    expect(page.text).toContain(`look_at_canvas`);
    expect(page.text).toContain(`selectedFrom: ${page.selection.listed}`);
    expect(page.text).toContain("不要猜");
  });

  it("完整提示词跟着本页列出的选中节点走：翻到后面的页，才读得到后面节点的完整提示词", () => {
    // 尾标在前 60 字之外：节点行只带提示词开头，尾标只会出现在「完整提示词」那一段里。
    const longPrompt = (index: number) => `${"一位撑红伞的女孩穿过霓虹街口，".repeat(6)}尾标${index}尾`;
    const base = canvasOf(40);
    const result: CanvasReadResult = { ...base, nodes: base.nodes.map((node, index) => ({ ...node, prompt: longPrompt(index) })) };
    const first = projectCanvasForAgent(result, { selectedFrom: 0 });
    const last = projectCanvasForAgent(result, { selectedFrom: first.selection.listed });
    expect(first.text).toContain("尾标0尾");
    expect(first.text).not.toContain("尾标39尾");
    expect(last.text).toContain("尾标39尾");
  });

  it("续页只带本页选中的节点段，不重复第一页的节点清单", () => {
    const result = canvasOf(40, { extraNodes: 2 });
    const first = projectCanvasForAgent(result, { selectedFrom: 0 });
    const next = projectCanvasForAgent(result, { selectedFrom: first.selection.listed });
    const firstPageId = selectedIdsOf(result)[0]!;
    const nextPageId = selectedIdsOf(result)[first.selection.listed]!;

    expect(first.text).toContain(firstPageId);
    expect(next.text).not.toContain(firstPageId);
    expect(next.text).toContain(nextPageId);
    expect(next.text).toContain(`本页只列选中的第 ${first.selection.listed + 1}–40 个，其余节点和引用边见第 1 页。`);
    expect(next.text).not.toContain("引用边:");
  });
});

describe("look_at_canvas 的模型面：selectedFrom 只是翻页，不进宿主契约", () => {
  const spec = specsForCapability("canvas.read").find((candidate) => candidate.name === "look_at_canvas")!;

  it("收一个非负整数 selectedFrom，其余照旧严格", () => {
    expect(spec.schema.safeParse({}).success).toBe(true);
    expect(spec.schema.safeParse({ selectedFrom: 0 }).success).toBe(true);
    expect(spec.schema.safeParse({ selectedFrom: 31 }).success).toBe(true);
    expect(spec.schema.safeParse({ selectedFrom: -1 }).success).toBe(false);
    expect(spec.schema.safeParse({ selectedFrom: 1.5 }).success).toBe(false);
    expect(spec.schema.safeParse({ selectedFrom: "31" }).success).toBe(false);
    expect(spec.schema.safeParse({ somethingElse: 1 }).success).toBe(false);
  });

  it("模型塞进来的无关字段安静丢掉，selectedFrom 留下（容忍只认声明过的字段）", () => {
    expect(spec.prepareArguments?.({ scope: "full", selectedFrom: 31 })).toEqual({ selectedFrom: 31 });
    expect(spec.prepareArguments?.({ scope: "full" })).toEqual({});
  });

  it("宿主读的是完整选区：翻页参数不翻译进契约语义输入（对外 MCP 拿到的仍是整份 selectedNodeIds）", () => {
    const translated = toSemanticInput(spec, { selectedFrom: 31 });
    expect(translated).toEqual({});
    expect(CANVAS_READ_CAPABILITY.inputSchema.safeParse(translated).success).toBe(true);
  });

  it("说明书把翻页写给模型（英文，点名参数）", () => {
    expect(spec.describe.params).toContain("selectedFrom");
    expect(spec.examples.some((example) => "selectedFrom" in example.arguments)).toBe(true);
  });
});
