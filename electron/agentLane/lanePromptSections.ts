// Agent lane · 系统提示词里的 `Available tools` 与 `Guidelines` 两段（G-03 的后一半）。
//
// ── 为什么这一段必须存在 ──
//
// 上游 pi 把「模型怎么知道该用哪个工具」拆成三条通道：`description` 进 schema（每次请求都
// 花 token）、`promptSnippet` 进系统提示词的 `Available tools` 菜单、`promptGuidelines`
// 进 `Guidelines` 列表（去重、按实际工具集条件化）。后两条**只出现一次**。
//
// 但 `AgentHarness` 收到我们自己的 `systemPrompt` 之后，pi 自己那份就整个不用了——
// 连带把渲染那两段的代码一起换掉。也就是说：光给工具填上 `promptSnippet` /
// `promptGuidelines` **一个字都到不了模型**。核对表把这条标成「复合缺陷」，
// 原话是「只补一半等于没补」。这个文件就是那另一半。
//
// **为什么不直接调 pi 的 `buildSystemPrompt`**：它渲染的整段是
// *"You are an expert coding assistant operating inside pi…"*——一个写代码的 agent 的
// 身份、外加 pi 自己的 README/docs 路径。Nomi 是视频创作工作台，那段身份是错的。
// 能复用的是**格式**（`- name: snippet` 的菜单、去重且保序的 `- guideline` 列表），
// 而格式在这里逐字镜像（`pi-coding-agent/dist/core/system-prompt.js:41-88`）——
// 它是模型见过无数次的形状，改写它没有收益只有风险。
import type { LaneToolSpec } from "../shared/agentLane/laneToolContract";

/**
 * 渲染两段。**顺序即合同**：菜单按目录顺序，纪律按首次出现顺序去重——
 * 与 `agentToolCatalog.ts:31-35` 的「`tools/list` 确定性顺序」同一条理由，
 * 系统提示词是 prompt cache 的前缀，抖一下就整段失效。
 */
export function renderLanePromptSections(tools: readonly LaneToolSpec[]): string {
  const menu = tools.length > 0
    ? tools.map((tool) => `- ${tool.name}: ${tool.promptSnippet}`).join("\n")
    : "(none)";

  const seen = new Set<string>();
  const guidelines: string[] = [];
  for (const tool of tools) {
    for (const guideline of tool.promptGuidelines ?? []) {
      const normalized = guideline.trim();
      // 去重是这条通道的全部意义：一族工具共享一条纪律时，用户只花一次 token。
      // 写进 N 个工具的 description 就是把同一段话买 N 遍——那正是方案原本的 S4
      // 与 S7（≤4000 token）在数学上互斥的地方。
      if (normalized.length === 0 || seen.has(normalized)) continue;
      seen.add(normalized);
      guidelines.push(normalized);
    }
  }

  return [
    "Available tools:",
    menu,
    "",
    "Guidelines:",
    guidelines.length > 0 ? guidelines.map((guideline) => `- ${guideline}`).join("\n") : "(none)",
  ].join("\n");
}

/**
 * 把两段接到宿主自己的身份提示词后面。**只有这一个拼接点**——散在各处拼字符串，
 * 结果就是某条路径上少了 `Guidelines`，而少了不会报错，只会让模型忘记「别编 nodeId」。
 */
export function composeLaneSystemPrompt(identityPrompt: string, tools: readonly LaneToolSpec[]): string {
  return `${identityPrompt.trimEnd()}\n\n${renderLanePromptSections(tools)}\n`;
}
