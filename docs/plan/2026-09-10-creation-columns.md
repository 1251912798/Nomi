# C76 · 创作区三栏外框统一样张

> 📋 状态：样张待拍板 · 样张阶段，待用户拍板，禁止生产接线。
> 基线：origin/main `5c507a5cc3ee74f5fa25706165cb94cd3d2e8165`（含 #646）。
> 范围：文档、设计实验室 specimen、截图与样张基线。生产组件不改。

## 先查别人

- 仓库既有真实宿主样例：`src/devlab/designLab/v4/agentPanelV4LabHost.tsx:88`，ShellStage 将 lane 投影喂给现役 Agent；沿用数据入口，不复制 Agent JSX。
- 三栏宿主现状：`src/workbench/WorkbenchShell.tsx:364`，资源树在 Shell，编辑器与 Agent dock 在 CreationWorkspace；统一边界必须覆盖两个宿主层级，不能只改中栏。
- 设计系统规范：`docs/design/nomi-design-system.md:155`，§1.5 先分组、去重、归位；本任务不增加、不收纳任何功能簇，只统一结构外框。
- 已有失败教训：`docs/lessons/design-lab-baselines-green-does-not-mean-wirable.md:1`，实验室基线只证外观。本次明确不宣称生产已实施或 Agent 功能已验收。

- 在飞近邻 [PR #678](https://github.com/aqm857886159/Nomi/pull/678) 包含 Agent 状态/拖宽/外框/品牌样张；本轮按 C76 明确范围补完整三栏宿主、实测表和共同外框，不采纳其中未拍板的品牌与状态变更。

## 范围与取舍

同一行的三个工作面应具有同样的外框、顶部基线和标题带高度，内容区按任务保留密度差异。推荐三栏均采用现有 panel 圆角、单层细线、纸面底色、无阴影；统一外侧留白，编辑正文保留阅读内距。代价是左栏从贴边导航变成独立面板，需用户看样张决定。

## 步骤与验收

1. 读完整宿主与设计 token；真实 Electron 隔离资料库记录改前 screenshot 与 computed style。
2. 实验室挂真实 WorkbenchShell，固定文稿和 lane 投影；局部 className 演示共同外框，不改生产样式。
3. 同尺寸明暗截图、计算样式、HTML+CSS 源码样张入库；新基线明确是待拍板样张，不覆盖现役基线。
4. `python3 scripts/with-gates-lock.py -- pnpm run gates`；保留原断言。提交分支并开 PR，PR 引用本方案和截图。
5. 完成交接 `creation-columns-LAST.md` 并复制至任务书指定 scratchpad。

## 实施边界

本轮不提取生产共享组件、不改变 Agent lane、资料库、列表或编辑器行为。生产加新删旧清单在 `docs/design/2026-09-10-creation-workspace-columns.md`；仅用户拍板后启动。
