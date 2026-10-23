# 选中即主语（select-to-iterate）· 接入设计卡（2026-10-21 起，10-22 改为「分离 + 接入」结构）

> 状态：📋 设计准备。结构：**A 已有组件原样用（不重画）+ B 新增 Δ1–Δ6 与接入点**。画布只画组件级新增（5 格，副本在 `docs/design/boards/2026-10-21/select-to-iterate/source/`），整屏效果下一步在设计实验室用生产组件拼。Q-1 – Q-6 已定（§1），Q-8 改法见 §9。清单 `docs/design/boards/2026-10-18/AnnotateToAgent.board.json` stage 仍是 explored，实现线未开。**版本：排 0.25，和标注（0.24 交互方案第 3 块）一起做**（用户 2026-10-23，Q-9）。

```
改动名：画布选区作为 Agent 指令对象 → 按节点迭代（新版本落回原节点）   线：设计准备线（本卡）/ 实现线待派   类别：[花钱][可打断][新界面][Agent 行为]
```

### 功能分类
- [x] 新界面 / 改交互
- [x] 花钱
- [x] 长跑 / 可打断
- [x] Agent 行为
- [x] 大数据量 / 画布 / 长列表
- [ ] 生成效果
- [ ] 数据格式
- [x] 新增功能 / 性能

## 0 结构与前提

**用户 2026-10-22 原话（逐字）**：「问题在于能不能把这个原来这些东西和你现在最新的设计做分离，然后做接入呢？为什么要重新的去做这个设计？」以及「可以。画布撤掉 8 张整屏，换成 5 格组件级新增稿（旁边放现有组件真实截图对照），清单和设计卡改成接入结构，整屏效果用设计实验室拼。」

于是本卡只回答两件事：哪些已有组件原样用（§2，不重画、不改交互），新增的六处各接进哪个现有组件、加的是什么（§3）。

前提核对（本线复核，含一处**更正上一版**）：
1. 0.24 第 3 组拍板的是 **M1–M8 极简版**，A3a–A3j 是对照（README 分组表；画布标题「七 · 极简版：全局只在底栏加一个「评论」（与左侧 A3 对照）」）。A3e 的请求批准分流按 Q-1 并进 M3。
2. A3b 的「选已有的」是「选中图上已有的字或笔迹」，不是选画布上的节点。
3. **更正**：上一版说「选中节点 → 出现在输入框」没有任何拍板格，**错了**。2026-09-06 V4 生成流程板已经画了：`docs/design/mockups/2026-09-06-agent-panel-v4/preview/preview-FlowGeneration.png` 上标注「选中节点 → 输入框自动带 chip」，发出的气泡里带「镜头 2」chip；定稿文档第 2 条「范围由选中 chip 决定」（`docs/design/2026-09-06-agent-panel-v4.md:16`）。是拍了、画了、画布这一侧一直没实现（G-2）。
4. M3 / A3e / A3f 原画的「候选、接受才设主图」与 2026-09-28 版本卡「新版自动变主图」打架 → 用户 10-21 定沿用自动变主图（Q-2），原画作废。

## 1 已定

**用户 2026-10-21 默认**（协调会话转述，原话照抄）：
- 默认 1：选中即自动出现在输入框（灰色引用 chip），**发送即确认**，chip 上 × 可去掉；发出去的消息气泡里保留「改的是哪几个」。
- 默认 2：多选默认「各自改、各出一个新版本」（追加到原节点版本栈）；只有用户说「用这些做……」才新建节点。
- 默认 3：第一版范围＝图片 / 视频 / 文本节点按节点迭代 + 批量 + 报价卡；音频重生成、圈区域局部改、视频指定时间段放第二版（音频需要另接 TTS/配音能力，单开线）。
- 审批分流原话：「比如说我说把这个东西改一下，然后你可以，如果说请求批准的话，那就是说你给我创建好那个节点，然后看一下你是怎么改的，提示词或者东西得写好，然后我再确认。如果不请求批准的话，那就直接去做，给我生成什么的。」
- 用例清单：「都挺重要」。

**用户 2026-10-21 拍板 Q-2、Q-4**（原话逐字）：「两处按推荐：新版本照旧自动变主图，放弃=回到上一版；请求批准时，改已有节点就在原节点上出「待生成」草稿版，说「用这些做新的」才建草稿节点。接着推设计文档、补样张。」
- 注意：本线 987108cb6 版给 Q-2 的推荐是「候选、接受才顶主图」，用户写「按推荐」但内容明确是「新版本照旧自动变主图」，**以原话内容为准**。
- Q-2：沿用 2026-09-28 版本卡规则「新生成的版本自动变主图」（`docs/plan/2026-09-28-version-cards.md:49`）。线程「放弃」改名「回到第 N 版」（Δ6）= 主图切回上一版，被放弃的那一版留在版本卡里（删除仍是版本卡上单独、可撤销的动作，本线默认）；「接受」= 意见标为已解决。下游节点**下次生成**用新版，不自动重跑、不自动花钱。
- Q-4：请求批准档改已有节点 → 原节点上出「第 N 版 · 待生成」草稿（Δ2）；说「用这些做新的」才建草稿节点（Δ5）。

**协调会话决定**（2026-10-21，非用户逐字拍板）：Q-1 A3e 的请求批准分流并进 M3（依据上面的审批分流原话）；Q-3 A3d / f / g / h 四组状态沿用、改 M 风格；Q-5 标位置整图重出与真·局部重绘分开，局部重绘第二版，保留「圈外也可能变」提示；Q-6 批量上限暂定 12，超出明示（10-22 画布 Δ4 具体化为：发送置灰 + 「只留前 12 个」），数字用真实项目复核。

## 2 A · 已有，原样用（不重画、不改交互）

| 组件 | 出处（拍板文档 / 板 / 预览） | 代码 owner |
|---|---|---|
| Agent 面板 8 种积木：用户气泡、助手文本、一行收据、任务卡、介入槽、队列行、收起坞、输入框 | `docs/design/2026-09-06-agent-panel-v4.md`（拍板清单 #1）；`docs/design/mockups/2026-09-06-agent-panel-v4/preview/*.png` | `src/workbench/ai/v4/AgentPanelV4Panel.tsx`；用户气泡 `AgentPanelV4Message.tsx:54`（`V4UserBubble`）；输入框 `AgentPanelV4Composer.tsx` |
| 选中节点 → 输入框自动带 chip、发出的气泡带 chip（交互） | V4 生成流程板 `preview-FlowGeneration.png`（标注「选中节点 → 输入框自动带 chip」）；agent-panel-v4.md:16 | **未实现**（G-2）；chip 长相见 Δ1 |
| 现有 chip：file / skill / clip，3D-BOX「正在改：镜头 N」标签 | v4 composer 引用态（`before/lab-zh-light-composer-chips-file-skill-clip.png`）；3D-BOX 画布 10-06 拍板 | `agentPanelV4Types.ts:96`（`V4ChipKind`）；`useAgentPanelV4Data.ts:313-331`（`liveChips`）；`AgentPanelV4Composer.tsx:49-80`（`ComposerChip`）；`timelineAgentSurface.tsx:136-154`；`AgentPanelV4FocusTag.tsx` |
| D2 确认卡：单段 D2b、展开 D2c、多段 D2d、进行中 D2e、失败 D2f | `docs/design/proposals/2026-10-18/README.md` 第 1 组（D2 按本表实现）；`preview/D2b-single.png`、`D2d-multi.png` | **未实现**（D2 精简版没开工，§8；B3 / E1 在 #1269）；现役付费卡投影 `agentPanelSpendCard.ts`（`projectSpendCard` / `spendCardPage`）、`useAgentPanelSpendConfirm.ts` |
| M3 意见线程（及 M1 底栏「评论」、M2 评论模式、M4 圈一下、M5 意见列表） | 0.24 第 3 组（已按推荐拍板）；`preview/M1…M8*.png`；清单 `AnnotateToAgent.board.json` | **未实现**；用户 10-21 定排 **0.25**（README，#1267） |
| 版本卡：角标、原地铺开、「生成中 · 新的一版会落在这里」、第 N 版、✓ 主图、设为主图 / 下载 / 删除；新版自动变主图 | `docs/plan/2026-09-28-version-cards.md`；`before/lab-*-version-cards-*.png` | `nodes/versionCards/NodeVersionCards.tsx:272-286`（生成中格）；`versionGridLayout.ts:41`（`versionGridItems`）；`NodeVersionCardsHost.tsx:96、103`；`nodeResultLifecycle.ts:104-118`；`canvasNodeActions.ts:235`（设主图） |
| 选中工具条「已选 N 个 · 编组 · 总览图 · 存流程 · ×」 | `before/real-*-03-multiselect-3-no-chip.png` | `src/workbench/generationCanvas/components/CanvasSelectionToolbar.tsx:21` |
| Agent 草稿落画布的占位节点与小标（等你确认 / 还没生成 / 已去掉 / 排队中 / 已停） | 付费卡①、P4 S5 多镜落画布 | `src/workbench/capability/multiShotCanvasLanding.ts:300`；`nodes/ProductionShotPlaceholder.tsx:80-95`；`electron/productionRun/multiShotCanvasLanding.ts:116` |
| 权限两档、直接生成提醒条、两个刹车 | `docs/plan/2026-10-12-agent-permission-two-tiers.md`；`AgentPermissionTiers.board.json` | `capabilityApprovalPolicy.ts`、`directGenerationBrakes.ts`、`AgentPanelV4AutoMode.tsx` |
| 节点生成框（B3） | `docs/design/boards/2026-10-18/ComposerB3.board.json` | `nodes/NodeGenerationComposer.tsx` |

## 3 B · 新增 Δ1–Δ6 与接入点

画布格与对照图见 `docs/design/boards/2026-10-21/select-to-iterate/`（README 写了每格左边截图的来源）。door-map 于 2026-10-22 在 origin/main 9adca4202 上跑。

### Δ1 输入框 chip 多一种：选中的节点（新种类）
- **接进**：`V4ChipKind`（`agentPanelV4Types.ts:96`；door-map 读门 1 扇 `:97`）加第 4 种 `node`；投影放进 `liveChips`（`useAgentPanelV4Data.ts:313-331`），照时间轴片段 chip 的做法（`useTimelineSelectionChips`）读 `generationCanvasStore.selectedNodeIds`，chip 是选区的投影、不存第二份；画在 `ComposerChip`（`AgentPanelV4Composer.tsx:49-80`；`AgentPanelV4Composer` 读门 3 扇：`AgentPanelV4Panel.tsx:442` + 设计实验室 2 处）；发出的气泡在 `V4UserBubble`（读门 2 扇：`AgentPanelV4Panel.tsx:159` + 实验室），数据从已落盘的 `contextSnapshot` 投（`laneViewModel.ts:391-416`，G-4）。
- **加的**：18px 缩略图 + 「镜头 03」+ 浅色「第 2 版」+ ×；× = 这次不带，不改画布选中（与 3D-BOX 标签的 × 语义不同）。
- **全部状态**：默认；悬停（底色加深、× 变深）；节点被删（黄色虚线「已删除」，× 仍在）；版本变了（「已变更」，沿用 `agentPanelV4.clipStale` 说法）；多个（超过 12 个走 Δ4）；发出后气泡里保留（深底「镜头 03 · 第 2 版」，不可删）；暗色；英文；窄面板换行。
- **验收断言**：`board:AnnotateToAgent/agent.selection-chip` —— 选中 1 个图片节点 → chip ≤100ms 出现，文字含节点名和「第 N 版」；× 后发送，lane 入参里没有这个节点；删掉节点 → chip 变「已删除」；发出的气泡冷重启后 chip 还在。
- **画布格**：`Main.dc.html`。

### Δ2 版本卡多一个状态：第 N 版 · 待生成（新状态）
- **接进**：`versionGridItems`（`versionGridLayout.ts:41`；door-map 写门 1 扇 `NodeVersionCardsHost.tsx:96/103`）的排头位置多一种格 `draft`，画在 `NodeVersionCards.tsx:272-286` 生成中格那一位；数据来自 Run 上的草稿投影（`deriveProductionShotState`，door-map 4 扇：`electron/productionRun/multiShotCanvasLanding.ts:116`、`ProductionShotPlaceholder.tsx:65`、`releaseUnknownSubmission.ts:46`、`retryProductionRetrieval.ts:25`），**不写进节点 `history`**，没生成就没有结果。
- **加的**：虚线框 +「第 3 版」+「待生成」签 + 提示词改动的词浅蓝底（三行截断）；在确认卡上按「生成」之后 → 现有「生成中」→ 现有「第 N 版 ✓ 主图」（自动变主图）。
- **全部状态**：待生成；悬停；长提示词；被去掉（格子消失，原版本不变）；确认后转生成中；失败（落现有失败）；暗色；英文。
- **验收断言**：`board:AnnotateToAgent/node.version-draft-slot` —— 请求批准档改已有节点 → 画布节点数不变、铺开第一格是「第 N 版 · 待生成」（N = 出过的最大号 + 1）、供应商调用 0；确认后同一格转「生成中」，落地后主图 = 第 N 版。
- **画布格**：`D2-version-draft.dc.html`。

### Δ3 D2 确认卡多一行：改谁 / 新建什么（新一行）
- **接进**：D2 精简确认卡（**还没实现**，依赖它先落地）；今天的付费卡投影 `projectSpendCard` / `spendCardPage`（door-map 6 扇：`agentPanelSpendCard.ts:81/92`、`useAgentPanelSpendConfirm.ts:149/285/452/551`、实验室 `07-spend-params.tsx:337`）。这一行由出价（Run presentation）派生：目标节点 + 当前版本 → 新版本号；新建时列参考。不另存一份。
- **加的**：参考图下一行「改这一张 · 第 2 版 → 第 3 版」/「新建 1 个视频 · 参考 林夏、雨夜站台」；提示词里改动的词浅蓝底；D2 多段每行带「第 N 版」。
- **全部状态**：改一个；多段（每行版本号，去掉一行）；新建；长名字截断；暗色；英文。
- **验收断言**：`board:AnnotateToAgent/spendcard.target-line` —— 卡上写的节点和版本号 = 实际要写的节点和新版本号；去掉一行 → 不生成、Δ2 草稿格消失。
- **画布格**：`D3-confirm-target.dc.html`。

### Δ4 选区超过 12 个（新一行 + 发送置灰）
- **接进**：Δ1 的 chip 区；发送钮的唯一判据 `canSend`（`AgentPanelV4Composer.tsx:182`），禁用时按 C1 / C4 说明原因。
- **加的**：chip 只露前 3 个 +「还有 12 个」；黄色提示行「已选 15 个 · 一次最多改 12 个」+「只留前 12 个」；发送置灰。
- **全部状态**：13 个及以上；点「只留前 12 个」后恢复可发；暗色；英文；窄面板。
- **验收断言**：`board:AnnotateToAgent/agent.selection-chip.over-limit` —— 选 15 个 → 发送 disabled 且说得出原因；点「只留前 12 个」→ chip 12 个、发送可用；模型实际收到 12 个（静默截断修复后断言「收到数 = 宣称数」，G-6）。
- **画布格**：`D4-over-limit.dc.html`。

### Δ5 「用这些做新的」草稿节点（新状态外观）
- **接进**：Agent 草稿已有的落画布路径（`src/workbench/capability/multiShotCanvasLanding.ts:300` 写 `productionRunId`）与占位小标 `ProductionShotPlaceholder.tsx:80-95`（「等你确认 / 还没生成」；door-map 读门 2 扇：`ProductionShotOverlays.tsx:8` + 实验室）；连线用现有参考边（与 `arrange_canvas` 同一种边）。
- **加的**：真实节点样式（标题在卡外上方、两侧连接点），虚线卡 + 类型图标 +「视频 · 5 秒」+「待生成」签，虚线连回参考节点；原节点不动。
- **全部状态**：待生成；确认后生成中（现有 `NodeGeneratingOverlay`）；出片（普通节点）；在卡上去掉（现有「已去掉」小标，节点保留）；暗色；英文。
- **验收断言**：`board:AnnotateToAgent/node.draft-node` —— 说「用这些做新的」→ 画布节点数 +1、连线来自参与的节点、原节点版本不变、确认前供应商调用 0。
- **画布格**：`D5-draft-node.dc.html`。

### Δ6 只改字：M3 线程「放弃」→「回到第 N 版」
- **接进**：M3 线程（未实现，随第 3 块排 0.25）；动作走现有设主图 owner `setNodeMainResultPatch`（`canvasNodeActions.ts:235`，1 扇门），进撤销日志。
- **加的**：改字，不画。线程写一行说明「已回到第 3 版，第 4 版还在版本里」。
- **全部状态**：有上一版（显示「回到第 N 版」）；节点原来是空的、这是第 1 版（不显示这颗钮，只留「接受」，本线默认）；暗色；英文。
- **验收断言**：`board:AnnotateToAgent/thread.discard-revert` —— 点「回到第 3 版」→ 主图 = 第 3 版、第 4 版仍在版本卡、⌘Z 撤回。

### 接入规则（不新增界面）
- **非图片节点**：视频改时长 / 首帧走同一条按节点迭代（第一版只走选区 chip，评论模式只画了图片）；画布文本节点「改短一点」= `write_node_text` 就地替换 + 撤销，不出版本（文本节点没有版本栈，G-9），不出确认卡；音频第二版：chip 照常出现，Nomi 不调生成工具，回一句并给「打开生成框」（手工 TTS 已有，缺的是 Agent 侧，G-8）。
- **选区 chip 与 M3 线程**：两个入口、一份请求合同。评论的回复留在线程；选区 chip 的回复留在 Agent 对话。发出去的对象都是「节点 + 当时那一版」（同一个 `AgentContextHandle` 形状，加结果版本字段，G-5），落版本走同一个 owner。
- **多选角色**：默认各改各的；话里点名「参考 A 改 B、C」或「用这些做新的」时由 Agent 判，判不准用反问卡问（两档都先问，直接生成档的刹车兜不住判错角色）；Δ3 那一行把角色写出来。

## 4 代码缺口（复核过的 file:line）

| # | 缺口 | 证据 |
|---|---|---|
| G-1 | **Agent 改不了手工节点**：生成类节点只能经 `draft_shots` 修订，修订只认 `operationId + shotId`、一次一镜；`look_at_canvas` 只对带 `meta.productionRunId` 的节点给 Run，这个字段只由多镜落画布写。手工建的节点 → Agent 只能另建草稿。静态核实，未实测 | `writeVerbs.ts:199-279`（`:233-243`）；`laneVerbTransport.ts:106-116`；`canvasRead.ts:331`；`src/workbench/capability/multiShotCanvasLanding.ts:300` |
| G-2 | 选区 chip 没实现（V4 已画）：chip 只有 file / skill / clip；画布选区只在发送那一刻静默冻结 | `agentPanelV4Types.ts:96`；`useAgentPanelV4Data.ts:313-331`；`useAgentPanelV4Actions.ts:48-84` |
| G-3 | `projectAgentReferences` 不是死路径：发送时读、作为 `storyboardTarget.shotIds` 发出；问题是输入框不渲染 | `useAgentPanelV4Actions.ts:181、244`；`StoryboardPlanEditor.tsx:425、478` |
| G-4 | 发出的气泡不留对象：快照随消息落盘，气泡只投附件 + 技能 | `laneInputMessage.ts:22`；`laneViewModel.ts:391-416` |
| G-5 | 结果版本没冻结：画布 handle 的 `revision` 是整画布 `persistRevision`；`display` 没有缩略图 | `useAgentPanelV4Actions.ts:68`；`residentContextSnapshot.ts:113-134` |
| G-6 | **修复线在途**（PR #1263 `fix/agent-selection-silent-truncation`，本分支不改代码）。静默截断：只取前 16 个 handle、每个 handle 带整份选区；实测选 12 个只送到 7 个、16 个以上只到 6 个 | `agentContextSnapshot.ts:119、130、183-198、212`；`laneDesktopInput.ts:37` |
| G-7 | Agent 没有设主图 / 回退 / 对比工具；Δ6 走同一个设主图 owner，不另写回退 | `nodeResultLifecycle.ts:104-118`；`canvasNodeActions.ts:235` |
| G-8 | 计划只收 4 种 taskKind，`draft_shots` 说明书却写 audio | `writeVerbs.ts:39、192、201`；`generationPlanSchemas.ts:101、115、137` |
| G-9 | 文本节点没有版本栈 | `nodeResultLifecycle.ts:135-149` |

## 5 九格

| 格 | 结论 | 证据 |
|---|---|---|
| ★0 先查别人 | 见下表 | 外部链接由协调会话提供、本线未逐个打开复核；仓库内先例有 file:line |
| ★1 用户怎么用 | 见下文 | 真实任务待实现后跑 |
| ★1b 连带界面 | 见下文 | 文案进 i18n 后跑 `check:i18n` |
| ★2 谁说了算 | §3 每个 Δ 的 door-map + 下文 | `node scripts/door-map.mjs …` |
| ★3 一致与复用 | §2 全表原样用；新增只在已有组件里加种类 / 状态 / 一行 / 改字：Δ1 是 `V4Chip` 的第 4 种、Δ2 是版本格的第 4 种、Δ3 是 D2 卡的一行、Δ4 是 chip 区的一行、Δ5 是占位节点的外观、Δ6 是一个按钮的字；不新建 chip 组件、不新建第二份选区、不另造回退 | §2 表 |
| ★4 全状态 | 每个 Δ 的「全部状态」见 §3；整体见下文 | 设计实验室拼整屏后截图 |
| 5 中途表 | 见下文 | 实现后随机打断脚本 / 真窗口 |
| 6 外部数据与失败 | 见下文 | — |
| ★7 性能 | 见下文 | 场景待登记 |
| 8 真实条件 | 改前真实样子已截（macOS 开发版 Electron 屏幕外窗口 zh 亮 / en 暗 + 实验室）；Windows、最小窗口、干净安装、真付费、键盘全程：`unverified`（未实现） | `docs/design/boards/2026-10-21/select-to-iterate/before/` |
| 拍板图清单 | `AnnotateToAgent.board.json`：Δ1–Δ5 元素 missing、owner「select-to-iterate 实现线（待派）」，Δ6 标改字；已有组件不进候选、用 `reusedComponents` 指向它们的板；stage explored | `pnpm run check:board-parity` |
| ★9 验收与回滚 | 见下文 | — |

### ★0 先查别人

| 出处 | 它怎么做 | 对哪个决定的影响 |
|---|---|---|
| Flora Fauna（docs.flora.ai/editor/fauna） | 选中节点自动进下一条消息，@ 引用未选中的；单条最多 15 个；Assist 先列要跑的节点、批准才跑，Auto 直接跑 | **确认** Δ1 与两档分流；**改了** Δ4：上限明示（暂定 12） |
| Claude Code VS Code（code.claude.com/docs/en/vs-code） | 选区自动可见、显示行数、× 取消、换选区后指示器回来 | **确认** Δ1：chip 跟着选区变、× 只管这一次 |
| Lovart（lovart.ai/docs） | Mark 自动进输入框，单次最多 10 个；用户抱怨改错重来再扣费 | **改了** Δ2 / Δ3：请求批准档先在原节点摆草稿、确认卡写明改谁 |
| Figma Make 论坛（2026-02，协调会话转述，无链接） | 发送时选中高亮消失，用户不知道对象带没带上 | **确认** Δ1：发出的气泡里保留 chip |
| tldraw「Agents can't point」（tldraw.dev/blog/agents-cant-point） | 聊天里「这个 / 这里」不可靠，锚定到形状 | **确认** G-1 / G-5：按 nodeId + 结果版本寻址 |
| Adobe Firefly Boards（协调会话转述，无链接） | 结果先进缩略图条，Place 才上画布 | **没采纳**：用户定沿用自动变主图（Q-2），「不满意能回去」由 Δ6 承担 |
| Krea Node Agent（协调会话转述，无链接） | 跑前按节点分项显示成本，批准才跑 | **确认**多段确认卡按项控制（D2d + Δ3 每行版本号） |
| 仓库内：V4 生成流程板（`preview-FlowGeneration.png`） | 「选中节点 → 输入框自动带 chip」、气泡里带 chip | **改了** §0：选中即 chip 是已拍板的，Δ1 只补 chip 的新种类长相 |
| 仓库内：时间轴片段 chip（`timelineAgentSurface.tsx:136-154`） | 选中片段即成 chip，变了标「已变更」 | **确认** Δ1 照抄投影做法 |

### ★1 用户怎么用
- 任务卡：**漫剧创作者在画布上过完一批镜头、挑出不满意的几张时，选中它们说一句怎么改，就走——新版本回到原节点的版本里等他挑。**
- 步骤：① 点选 / 框选 2–5 个图片节点 → ② 输入框出现选区 chip（Δ1）→ ③ 打「雨再大一点，霓虹更冷」→ ④ 发送（= 确认对象），气泡留 chip → ⑤ 请求批准档：各节点上出「第 N 版 · 待生成」（Δ2），确认卡逐项写「改这一张 · 第 2 版 → 第 3 版」（Δ3），点了的才生成；直接生成档：直接跑，刹车照旧 → ⑥ 新版落地即主图；不满意在版本卡换回旧版，或在意见线程「回到第 N 版」（Δ6）。
- 不做：音频重生成、圈区域局部重绘、视频时间段、跨页面选区、超过 12 个的一次批量、Agent 主动调用设主图去切别的版本。
- 已知坑：G-1 不补做不成；文本节点没有版本；静默截断等修复线（G-6）。
- 真实任务（实现后跑）：① 漫剧《雨夜来信》第一场 5 张镜头图，选 3 张说「雨再大一点」→ 3 个节点各 +1 版；② 选 1 个视频镜头说「改成 5 秒，首帧用镜03 第 2 版」→ 视频节点 +1 版；③ 选 2 张角色图说「用这些做一张双人海报」→ 新建 1 个草稿节点，原两张不变。
- 指标：主指标「带选区 chip 的消息里 Agent 实际改到的节点集合 = chip 集合」的比例 —— 未验证：缺量具（建议走查断言 + lane 回执 nodeId 对账）；质量指标「同一节点再改一次的轮数中位数」—— 未验证：缺量具；护栏「改到 chip 外节点 = 0」「模型收到数 ≠ chip 宣称数 = 0」—— 量具：`formatAgentContextSnapshot` 单测 + 新走查；基线：选 12 只到 7（G-6）。
- 人设：新手不知道 Agent 看得见选区 → chip 让它看得见；老手一次批量 5 张 → 计数 + 逐项确认卡。每步「预期 → 实际」用设计实验室拼的整屏 + 真机走查截图记录。

### ★1b 连带界面（文案只说事实，不谈钱）

| 位置 | zh | en |
|---|---|---|
| Δ1 chip | 镜头 03 · 第 2 版 | Shot 03 · v2 |
| Δ1 节点被删 | 镜头 05 · 已删除 | Shot 05 · deleted |
| Δ1 版本变了 | 镜头 03 · 已变更 | Shot 03 · changed |
| Δ2 草稿格 | 第 3 版 · 待生成 | Version 3 · not generated |
| Δ3 改已有 | 改这一张 · 第 2 版 → 第 3 版 | Revise this one · v2 → v3 |
| Δ3 新建 | 新建 1 个视频 · 参考 林夏、雨夜站台 | New video · using Lin Xia, Rainy platform |
| Δ4 提示行 | 已选 15 个 · 一次最多改 12 个 ／ 只留前 12 个 ／ 还有 12 个 | 15 selected · up to 12 at a time ／ Keep the first 12 ／ +12 more |
| Δ5 草稿节点 | 视频 · 5 秒 ／ 待生成 | Video · 5s ／ Not generated |
| Δ6 线程按钮 + 说明 | 回到第 3 版 ／ 已回到第 3 版，第 4 版还在版本里 | Back to v3 ／ Back to version 3. Version 4 is still in versions. |
| Agent 回执 | 镜头 03 出了第 4 版 ／ 改了 镜头 03 的提示词，还没生成 | Shot 03 has version 4 ／ Updated Shot 03's prompt; not generated yet |
| 能力不可用（音频） | 配音节点这一版还不能让 Nomi 重新生成，可以在节点下面的生成框里直接点 ↑ ＋「打开生成框」 | Nomi can't regenerate voice nodes yet. Use the generate box under the node. + "Open generate box" |
| 文本节点回执 | 改了 旁白 · 第一场 的正文，可撤销 | Rewrote Narration · Scene 1. You can undo it. |

### ★2 谁说了算
§3 每个 Δ 都接在已有 owner 上；概念与门数：画布选区 `generationCanvasStore.selectedNodeIds`（chip 只投影）；发送时快照 `buildResidentContextSnapshot` 1 写（`useAgentPanelV4Actions.ts:58`）；给模型的投影 `formatAgentContextSnapshot` 2 扇（`laneContextBudget.mts:46`、`laneDesktopInput.ts:91`，修复线在途）；节点版本 `appendNodeResultVersion` 3 扇（Agent 结果经 `attachShotResult` 同一 owner）；主图 `setNodeMainResultPatch` 1 扇；草稿态 `deriveProductionShotState` 4 扇；确认卡投影 `projectSpendCard` 6 扇；版本格 `versionGridItems` 1 扇；草稿修订寻址 `draftShotsPatchEnvelope` 1 扇（`laneVerbTransport.ts:114`）；分镜表引用 `setProjectAgentReferences` 写 2 读 1。同一份事实各 1 份；意图走显式事件（发送 / 确认 / 点按钮），不靠「东西不见了」猜。G-1 要加的「按 nodeId 改生成类节点」落在 `generation.plan` 现有 owner 上，不另造第二条生成路。

### ★4 全状态（整体；各 Δ 的状态见 §3）
空（没选：没有 chip）· 选中（Δ1）· 超限（Δ4）· 发送中（chip 冻结）· 请求批准等确认（Δ2 草稿格 + Δ3 确认卡）· 生成中（现有生成中格 / 节点浮层）· 成功（新版落地即主图）· 失败（D2f 逐项写清 + 节点现有失败卡）· 部分成功（成功的各 +1 版，失败的留卡里重试）· **取消中**（点停止：已交出的保持生成中，未交出的不派，卡上「正在停下」）· 过期（节点删了 / 版本变了：Δ1 「已删除 / 已变更」，发出后目标被删走现有 `holdOnce`）· **能力不可用**（音频 / 3D / 导演台 / 拆解表节点要「重新生成」：chip 照常，Nomi 不调生成工具，给一步动作「打开生成框」或「在导演台里改」；没有可用模型走现有「去选模型」）。

### 5 中途表

| 状态 × 打断 | 点停止 | 关窗 | 断网 | 重启 | 连点 |
|---|---|---|---|---|---|
| 选中、未发送 | 无事 · 不扣 | chip 是投影不落盘，重开按选区重算 · 不扣 | 无影响 · 不扣 | 同关窗 · 不扣 | 连点发送：admission 去重（现有） |
| 草稿格 + 确认卡等确认 | 整轮停，草稿格留「待生成」· 不扣 · 回执在对话流 | 卡和草稿格都是 Run 投影，重开重建 · 不扣 | 无外部调用 · 不扣 | 卡和草稿格还在，要点才派 · 不扣 | 连点确认：同镜同 jobId 幂等 · 只扣一次 |
| 生成中 | 已交出的照常扣一次，未交出的不派 · 回执在任务列表 | 主进程继续跑，结果落回原节点 | 已交出的轮询恢复；未交出的记失败、不扣 | 从 Run 的 jobs 重新派生，不扣第二次 | 幂等 |
| Δ6 回到第 N 版 | — | 已写进画布撤销日志 | 本地操作 | 主图是持久状态 | 连点：第二次无变化 |

### 6 外部数据与失败
- 模型给回的目标不在本次 chip 里 → 宿主拒绝（目标 ∈ 发送时快照），回执点名「这个节点不在你选的范围里」。
- 角色不明先问；供应商失败沿用现有路径（D2f），不甩锅给用户 key；历史消息里的对象后来被删 → 气泡 chip 显示「已删除」。

### ★7 性能
① 新增操作：选中后 chip 出现；框选 50 个时 chip 区 + 超限行；带 12 个对象发送；草稿格出现；确认卡 N 项。② 最坏规模：200 节点画布、框选 50 个。③ 预算（默认）：选中到 chip 可见 ≤100ms（p95 ≤150ms）；交互期间 >50ms 长任务 0 个；面板订阅选区不得让画布壳重渲（守住 #1211）。④ 量具：`tests/ux/perf.e2e.mjs` 加场景（建议 id `agent-selection-chip-50`），登记 `tests/perf/scenarios/`；基线：未验证（未实现）。

### ★9 验收清单与反例（动手前写全，验收线只核这份）
1. Δ1 断言（§3）；反例：选 A 改选 B 再发送 → 发出的是 B，不是渲染期旧选区。
2. Δ4 断言；框选 1 / 8 / 12 / 13 / 50 个 → 模型实际收到数 = chip 宣称数（G-6 修复后）。
3. 手工建的节点（无 `productionRunId`）→ Agent 改完新版本落回原节点、版本号 +1（G-1，必红用例先写）。
4. 多选说「各改」→ 每个节点各 +1 版、节点数不变；说「用这些做新的」→ Δ5 断言。
5. Δ2 / Δ3 断言；请求批准档点确认之前供应商调用 0 次；去掉的那项不生成。
6. 新版落地即主图；Δ6 断言；反例：「候选」签、「接受后才设主图」不得出现。
7. 直接生成档：两个刹车照旧；角色不明两档都先问。
8. 发出的气泡留 chip，冷重启后还在；时间轴片段 chip 同样留下。
9. 发送后删掉其中一个节点 → 结果暂存、撤销后落回（`holdOnce`）。
10. 音频节点 +「重新生成」→ 生成工具调用 0 次，回复带「打开生成框」。
11. 文本节点 +「改短一点」→ `write_node_text` 替换，撤销一次回原文，不出确认卡。
12. 同一类还会从这些入口回来，各写一条入口测试：时间轴片段 chip、3D-BOX 焦点标签、分镜表「交给 Agent 改」、MCP `nomi_canvas_edit`（没有选区）、M3 评论线程——发出的对象形状一致（节点 + 当时那一版）。
13. 整屏对账：设计实验室用生产组件拼出接入后的整屏，与 `source/` 5 格逐项对照（zh / en、亮 / 暗）。
- 回滚：revert 实现提交；chip 是纯投影，没有落盘格式变化；handle 加的结果版本字段在旧消息里缺省时显示「版本未知」。
- 独立验收：四类强制，另一条线按本清单核，报告链接写进 PR `## 独立验收`。

## 6 新界面三件产物（新增部分）
- **减法梯度**：v1 = 画布 5 格画的（Δ1 chip 带缩略图和版本、Δ2 草稿格、Δ3 一行、Δ4 提示行、Δ5 草稿节点）；v2 = v1 + chip 悬停大图预览；v3 = v2 + chip 上直接切角色（参考 / 目标）。推 v1。
- **删除清单**：chip 上的角色切换（不放：默认各改各的，角色靠一句话说清；要时在话里写「参考镜03」）；「发送前确认对象」弹窗（不放：发送即确认；要时看气泡）；选区 chip 的开关（不放：不想带就点 ×）；超限时「自动带前 12 个」（不放：Δ4 改为发送置灰 + 用户自己点「只留前 12 个」，不替用户挑）。
- **卡点表**：① 怎么知道有这功能：选中节点那一刻输入框冒出 chip（今天没有：真截图 `real-zh-light-02 / 03` chip 数 0）；② 动手前知不知道要付出什么：请求批准档先看草稿格和确认卡上的「改这一张 · 第 2 版 → 第 3 版」，直接生成档有常驻提醒条和刹车；③ 空了 / 错了看到什么：空没有 chip，超限一行黄字，失败逐项写在卡里，能力不可用一句话 + 一步动作；④ 凭什么信结果对、错了怎么回头：新版落在原节点版本卡里可比，落地即主图，「回到第 N 版」或版本卡换回，都可撤销。这条路几步：选中 → 打字 → 发送 →（请求批准）确认 → 看版本，4–5 步；砍掉的一步是「再点画布点选钮挑一遍对象」。

## 7 旧功能普查（输入框 chip 区 + 画布选中态）

| 现有功能 | 去处 |
|---|---|
| 附件 chip（+、拖入、粘贴、×、上传中 / 失败） | 不动，选区 chip 排在附件之后 |
| 技能 chip（悬停大图 + 说明、×） | 不动 |
| 时间轴片段 chip（「已变更」、×） | 不动；发出后气泡补留（G-4） |
| 3D-BOX「正在改：镜头 N」标签 | 不动，仍排第一个；× 语义与选区 chip 不同 |
| 分镜表「交给 Agent 改」的镜头引用（今天看不见） | 改：显示成 Δ1 同一种 chip（G-3） |
| 输入框画布点选参考钮、@ 引用、+ 文件、模型、Skill、权限弹层、发送 / 停止 | 不动；选区 chip 不替代显式参考；Δ4 只在超限时让发送置灰 |
| 图片节点浮条、生成框、版本角标与版本卡、左右「+」派生、右键菜单 | 不动；Agent 出的版本进同一个版本卡，Δ2 只多一种格 |
| 多选工具条（已选 N 个 / 编组 / 总览图 / 存流程 / ×） | 不动；多选同时投成选区 chip |
| 文本节点工具条、音频节点生成框 | 不动 |
| 底栏加节点条 7 颗 | 不动；0.24 第 3 组在最右加「评论」 |

## 8 0.24 实施进度（2026-10-22 查 origin）
- 已合：#1246 ComposerB3 清单、#1251 / #1257 / #1267 方案样张与 README 同步、#1224 文稿方案报价卡。
- 在做（开着的 PR）：#1269 生成框 B3 + 四处复用宿主（E1）；#1264 写作区 WD1（等 #1271 文本任务迁 pi-ai）；#1263 画布多选静默截断修复（= G-6 修复线）。
- 没开工：D2 付费卡精简（README 写「下一个 PR」）。Δ3 依赖 D2 先落地。
- **范围变化**：#1267 记下用户 10-21 定「第 3 块『标注』和第 4 块『分页』挪到 0.25」。所以 M1–M8 评论线程（含 Q-1、Q-3、Δ6）跟着排 0.25；本卡的选区 chip 一路（Δ1–Δ5）不依赖评论线程，版本归属待协调会话定（见报告）。
- 21 号那版写「B3 / WD1 没有 PR、没有分支」，当时属实，22 号已有 #1269、#1264。

## 9 拍板记录

| # | 定了什么 | 谁定的 |
|---|---|---|
| 结构 | 分离 + 接入：画布只画组件级新增 5 格，已有组件原样用，整屏由设计实验室用生产组件拼 | 用户 2026-10-22（原话见 §0） |
| Q-1 | A3e 请求批准分流并进 M3 | 协调会话 10-21 |
| Q-2 | 新版自动变主图；放弃 = 回到上一版（Δ6 改字「回到第 N 版」）；「候选」作废 | 用户 10-21 |
| Q-3 | A3d / f / g / h 沿用，改 M 风格 | 协调会话 10-21 |
| Q-4 | 原节点上出「第 N 版 · 待生成」（Δ2）；「用这些做新的」才建草稿节点（Δ5） | 用户 10-21 |
| Q-5 | 标位置与局部重绘（蒙版）分开；局部重绘第二版；保留「圈外也可能有细微变化」（「整图重出」10-23 起由 Q-8 取代） | 协调会话 10-21；10-23 按 Q-8 修订 |
| Q-6 | 上限暂定 12；超限发送置灰 +「只留前 12 个」（Δ4） | 协调会话 10-21 / 10-22 画布 |
| Q-8 | 改法按意图自动选：圈选评论默认在成品图上微调（带原参考）；选中说一句由 Agent 按说法判；草稿写明用哪种、可一键切换；不支持改图就按原参考重来并说明（详见下节） | 用户 10-23 |
| Q-9 | 版本：排 0.25，和标注（M 组）一起做——「第 N 版 · 待生成」草稿和版本号跟标注是同一套数据设计，又排在 D2 第③步之后 | 用户 10-23「选中即主语排 0.25，和标注一起做。」 |
| 未定 | A3b「画一笔 / 选中图上已有的字或笔迹」是否保留（清单 Q-7，pending） | 待协调会话问用户 |

### Q-8 改法按意图自动选（用户 2026-10-23 拍板）

用户原话：「按意图自动选：圈选评论默认在成品图上微调（带上原参考），选中说一句由 Agent 按说法判断；草稿上写明用哪种，可一键切换；模型不支持改图就按原参考重来并说明。写进设计卡。」

- **两种改法**：
  - **① 按原参考重来**：回到节点自己的生成框，原参考图、参考元素（角色 / 场景 / 道具）、模型、比例、时长等参数原样带上；Agent 只改写提示词，然后走节点自己的生成（和节点上点 ↑ 同一条路，D2 Q3「一台发动机」）。
  - **② 在成品图上微调**：当前那一版作底图，原参考一起带上，再加一句修改指令（改图 / 图生图）。
- **入口默认**：
  - 圈选评论：默认走 ②。圈了一块，意思就是其它别动。
  - 选中节点说一句：由 Agent 按说法判断。整体性改动（「再来一张」「雨大一点」）走 ①；点名局部（「把杯子换成刀」）走 ②。
- **看得见、能改**：Δ2「第 N 版 · 待生成」草稿格上写明「基于第 N 版改」或「按原参考重新生成」，确认前可以一键切换。直接生成档按 Agent 的判断走，用「回到第 N 版」兜底。
- **降级**：节点的模型不支持改图，或参考槽放不下「底图 + 原参考」时，走 ①，并在草稿或回复里说明原因。
- **不变**：蒙版（只改圈内）仍放第二版。线程提示改成「这次会在这张图上按圈的意思改，圈外也可能有细微变化」（Q-5 修订）。
- **前置**：盘点内置图片模型里，哪些支持「成品图 + 多张参考一起改」。目前只核实了 fal 的 GPT Image 2 改图：能收多张图和 `mask_url`（`electron/catalog/falOfficial.ts:97`）；其余模型还没核。
- **★9 要补的反例**：
  - 走 ② 时原参考丢了，角色走样；
  - 走 ① 时把底图也当参考塞进去，参考重复；
  - 草稿上写的改法和实际请求体对不上；
  - 模型不支持改图，却悄悄走了 ②。

## 附 · 用例对照（10-21 版，供追溯）

| 用例 | 由什么承担 |
|---|---|
| 单节点重抽 / 改风格或参数 | Δ1 chip + Δ2 / Δ3（请求批准）或直接生成；G-1 补后手工节点也能改 |
| 改一处 | M2 / M3 / M4（已拍板），生成仍整图重出（Q-5） |
| 框选多个各改一版 | Δ1 + Δ3 多段每行版本号 + Δ4 上限 |
| 一个当参考其余当目标 / 多选新建 | 接入规则「多选角色」+ Δ3 一行写角色 + Δ5 |
| 视频改时长 / 首帧、文本改写 | 接入规则「非图片节点」 |
| 音频重生成 | 第二版；能力不可用态 |
| 分镜表选行 | G-3：同一种 chip |
| 时间轴片段 | 已实现；G-4 补气泡 |
| 只问不改 | 请求批准档生成本来就先问 |
| 回退 / 对比 / 设主图 | 版本卡（已实现）+ Δ6；Agent 侧工具 G-7 |
