# Antigravity 图像验证在两个平台一起红：我们自己的 agent 定义把自己的钩子关掉了

**日期**：2026-09-08 · **场景**：D 平台/供应商接入 · **复发风险**：任何「用 agent 定义文件 + 钩子」组合的 CLI 集成

## 现象
Windows 用户拆 asar 折腾一整天、Mac 上真机走查一跑：文本验证过，`generate_image` / 改图 / 视觉全部 `ANTIGRAVITY_HOOK_UNVERIFIED`。agy 日志里明明写着 `loaded 1 named hooks from 1 hooks.json file(s)`——钩子**被加载**了，但 `PreInvocation` / `PreToolUse` 从不执行，`task-gate/initialized.json` 永远不落地。

## 根因
我们为每次生成写的 agent 定义（`electron/ai/antigravityProcess.ts` 的 `agent.md` frontmatter）带着 `inheritCustomizations: false`，本意是「别把用户的技能/规则/MCP 混进受限生成」。agy 新版（二进制 changelog：「single `inheritCustomizations` switch that decides whether the agent adopts your skills, rules, plugins, subagents and MCP servers」；`hooks_manager` 走 `hooksInheritUser`）把 **hooks 也归进了这一个开关**。于是我们自己写在 `.agents/hooks.json` 的授权钩子被我们自己的 agent 定义关掉了。1.1.21 时钩子不受这个开关管，所以当年验过、后来悄悄坏。

本机最小复现（agy 1.1.27，macOS）：同一份 hooks.json + 同一条 stream-json 输入，`inheritCustomizations: false` → 无标记文件；`true` → `initialized.json` 立刻出现。

## 修法
`inheritCustomizations: true` + `inheritMcp: false`（这是 agy 唯一的按类开关；工具面仍由 `tools:` 白名单、`--sandbox`、task-gate 授权账本约束）。真机走查：image / edit / vision 全部 `passed`。

## 教训
1. **上游把开关语义扩大时，我们「有意关掉」的东西会连带关掉自己的依赖。** 对第三方 CLI 的每个开关，登记它今天管哪些东西，升级时对照 changelog 重验（这次是 R29 登记表该有而没有的一行）。
2. **「加载了」不等于「执行了」。** 验证钩子只能看它留下的痕迹文件，不能看日志里的 loaded。
3. **同一个错误码两个平台一起红，先怀疑共享层，别先怀疑平台。** Windows 那六条里真正的根因是这一条跨平台的，其余是伴生。
