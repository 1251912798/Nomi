# PR 655 · 样张 v2 返工

状态：📎 交接/日志 · 样张 v2，DOM/交互与逐字视觉验收通过；交付收据见 PR #655。，仅样张，用户已指定版式与复用路径。

范围：详情捕获、卡片/chip 字阶、生成 HTML/CSS、DOM 验证、1440 与 2x PNG；不改 src、不装包、不改产品行为。继续现有任务分支，一笔提交更新 PR。

根因（recurring）：build.mjs 的 openEntry 把 SKILL.md 写到 pre.textContent，技能与提示词两条入口共用错误出口；旧 verify 只验内容存在，没有验 Markdown 语义。共享防线改为捕获路径挂载 NomiMarkdown，删除原文出口，验证每条技能/效果的渲染文本。属于样张路径，无高风险生产改动，生产合同不适用。依赖生命周期 not-applicable：复用已安装的生产组件，不引入或升级依赖。

## 先查别人

- 依赖/仓库已有 Markdown 渲染：[NomiMarkdown.tsx](../../src/workbench/common/NomiMarkdown.tsx):30–65，文档档已有字号、列表、代码和 GFM 语义元素；保留已安装 react-markdown/remark-gfm，不增解析器。
- 现役长文测量：[AgentPanelV4Markdown.tsx](../../src/workbench/ai/v4/AgentPanelV4Markdown.tsx):39–48，scrollHeight 测量剩余行；样张只把阈值换成 12×body 行高。
- 现役控件：[NodeGenerationComposer.tsx](../../src/workbench/generationCanvas/nodes/NodeGenerationComposer.tsx):638–655，text-caption、gap-1、px-2.5、py-1；按用户要求沿用其字阶和间距档。
- 生态与自媒体：此次不做选型，不接外部框架；用户已点名直接复用仓库组件，额外生态/TikHub 调研不影响这次版式裁决。没有新增外部格式。
- 结论：用已有；本计划承载该小范围样张返工的可复核证据，不派工、不新增研究报告副本。


版式：display 标题、body 简介/正文、title 小节、caption meta/chip、micro 分组；间距 1/2/3/4/6，墨色 ink/ink-80/ink-60，pill 胶囊；字距 normal（中文不额外拉开），hanging-punctuation:first last。来源域名/许可证/作者单行。标题同文 H1 和紧接的同文简介去重。12×body 行高折叠，scrollHeight 测余行，固定底栏。

验收：先用旧 pre 路径证明标记断言失败，再对所有条目/额外 Markdown 结构夹具运行相同断言；展开收起、切换、来源、引用/追加/撤销；1440×900 与 2880×1800 截图逐字查看；contracts。回滚：本次单提交可整体 revert，保留此前版本历史。

交付预检：暂存到临时目录并原样恢复原有 SL-LAST.md 和本计划后，delivery preflight 已验证 clean=true、origin/main 为祖先。未修改用户原有交接内容，只在顶部添加 v2 三行。
