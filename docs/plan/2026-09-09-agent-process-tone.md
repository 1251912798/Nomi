# Agent 过程区 C66–C68

> 状态：✅ 已实现并验证，待 PR 审核；用户 2026-09-09 22:30 已裁决，直接实施。
> 基线：8a3136955（PR #686）；分支 fix/agent-process-tone-20260909。

## 范围与验收
只修过程文字层级、三种 summary 焦点环、零重试摘要。过程所有普通文字 ink-60 / normal；状态色、时间 mono micro 和图标保留；过程外收据不改。最终回答不改。
计算色与字重先红后绿；双主题隔离 Electron 用真实输入「请读取两次文稿并核对」走 loopback；三种 summary 鼠标无环、键盘有 token 环。单测、contracts、完整 gates 后提交推送开 PR。
回滚：整体 revert 本任务 commit，无数据迁移。没有新增模型、工具或运行时行为；零付费调用。

## 先查别人
- Claude Code： https://code.claude.com/docs/en/interactive-mode ，Ctrl+O 展开详细工具输出，过程采用渐进披露。官方文档没有承诺色值，不能把它当 ink-60 的依据；具体色阶由本次用户裁决决定。
- Codex CLI： https://github.com/openai/codex/blob/main/codex-rs/tui/src/history_cell/mcp.rs#L183 ，标题 bold，输出文本在 L244/L267 使用 dim，状态点在 L153–160 独立着色。复用标题不弱于正文、状态独立的原则；终端色不能直接移植为网页 token。
- WAI-ARIA disclosure： https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/ ，Enter/Space 切换展开；保留原生 details/summary 的键盘语义。
- 浏览器焦点启发式： https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible ，按输入方式决定可见焦点。复用 ThemeToggleButton 的 outline-none + focus-visible token 类；先真机验证，再判断是否需要额外处理。

## 根因与共享边界
recurring：V4Process 容器、V4ToolGroup 和 V4ToolReceipt 独立指定墨色/字重，Markdown 内部还会重设颜色。只改两个 label 无法守住展开技术内容与模型 Markdown 的层级。
在 V4Process 的 className 约束后代普通墨色及字重，避开状态色和原有时间/图标。summary 焦点样式由同文件常量复用；collapseV4Flow 在重试计数处选完整 i18n key，禁止拼文案。

## 视觉基线边界
待运行视觉检查后列出确实含过程行且变化的名称，再定向更新；不批量重录其他基线。

## 证据
红日志：docs/fixes/agent-process-tone/red.log。
真机截图：docs/plan/agent-process-tone-evidence/（light/dark × collapsed/expanded/mouse/tab）。

## 真机发现与裁决落实
改前 C66 红：summary L=0.68、子行 L=0.32 / weight=500。改后普通文字 L=0.50 / weight=400（light）。
原生 Chromium 鼠标点击 summary 不匹配 focus-visible，保留原生行为即可。但 tailwind.config.ts:409 的 `:root :focus-visible:not(...)` 比工具类优先，覆盖为 accent 42%。仅三种 summary 的 `focus-visible:!outline-[var(--nomi-accent)]` 提高颜色优先级，宽度/偏移仍用指定类；不改全局焦点规则。

真机 8 张已逐张审阅：浅/暗展开子行与摘要同层，最终回答更突出；鼠标无环，键盘 accent 环可见。辅助模型弹层在拍摄前通过用户动作关闭。feel 10/10 通过。
实验室 agent-panel-v4 在既有 pendingApprovalScreens 中被整屏跳过；本任务以更新模式启用该屏并用 `--update-snapshots=none` 强制只读比较，不修改登记或其他屏。

Markdown 子树也统一普通文字色与字重，覆盖强强调和 Shiki 的内联语法色；这属于 C66 的“内部所有文字”，不涉及过程外 Markdown。

独立同类任务也已通过：用户在隔离文稿中输入标题、加粗和 JavaScript 代码后，让 Agent 真实读取；非分组收据的 Markdown/Shiki 内容在双主题下同样不倒挂。总计 3/3 工具调用成功、2/2 回合完成，5 次 loopback 文本请求，付费调用 0。

## 基线更新名单（更新前锁定）
仅 `tests/ux/design-lab/__baselines__/agent-panel-v4/b2c-process-done.png` 和 `tests/ux/design-lab/__baselines__/agent-panel-v4/b2c-process-failed.png`。这两张是 #686 新近批准的当前样张，变化仅过程摘要墨色与零重试文案；无布局、字号或图标调整。running 通过且不重录。其余 pending 屏历史基线（包括旧版 process-folded）存在此前布局/字体差异，本任务不吸收、不更新，也不撤销 pending 登记。显式整屏只读检查 14 passed，其余历史基线差异如实保留。

## 最终验证与基线保真
`python3 scripts/with-gates-lock.py -- pnpm run gates` exit 0（全部阻断门岗、全量测试与构建）。`pnpm run test -- agentPanelV4` exit 0；feel 10/10；双主题真实 Electron 2 回合通过。
两张整图重录虽然执行 2/2 passed，但人眼发现原基线还包含 #686 之前的 Markdown 回答行/错误文字颜色；吸收它们会越界。因此最终只从真实新截图取过程摘要区域 `(0,104,390,132)`，其他像素逐一保留原基线。两张尺寸均 390×620，实际差异包围盒均 `(41,104,212,117)`。这不是宣称 pending 整屏基线全绿；已有无关差异仍在、登记不变。生产代码只三文件，未改任何其他颜色、字号、间距、图标或布局。
