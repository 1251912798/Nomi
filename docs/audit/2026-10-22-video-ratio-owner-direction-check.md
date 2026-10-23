# 方向检查：视频比例默认值的唯一出处（2026-10-22）

触发：`node scripts/fix-churn.mjs` 命中——`src/workbench/generationCanvas/store/canvasGraphActions.ts` 14 天第 7 个 fix（概念「画布分组交互」第 9 个），`src/workbench/generationCanvas/agent/` 目录第 4 个。本次（F-landing-defaults PR-b）碰它们是为了「连线那一刻铺比例默认值」与「落地记明确选过」，概念是**视频比例默认值的唯一出处**；和 PR-a（#1288）的「候选 → 节点的投影」是两件事，那一份复盘在 `docs/audit/2026-10-22-landing-projection-direction-check.md`。

### 0. 一句话根因

视频比例的产品默认（用户 2026-07-17：首选 16:9，已连输入全竖才 9:16）有两个 owner——「选模型时铺默认值」和「生成框挂载 effect 纠正」——后者在「打开节点」这个**不是改参数的时刻**按自己的规则改数据，而且不认 Agent 写的值。

### 1. 归类表

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| R-d2-defaults #1：Agent 写 9:16，点开节点变 16:9，节点上点生成发 16:9（Kling / Veo / Seedance 2.5 实测） | 挂载 effect 只认 `aspect_ratio_user_set`（用户手选），不认 Agent 写的比例 | 两处各管一份默认值（本类） |
| 同上：Agent 没写比例时，卡 / Agent 路是档案默认（adaptive），节点被 effect 改成 16:9 | 同一个 effect | 本类 |
| `canvasGraphActions.ts` 近 14 天的 6 个 fix（分组交互、插入落点、撤销步……） | 各自的直接原因 | 别的概念；本次只把连线后的派生写（切模式）挪出这个文件，不改它们 |

### 2. 为什么这一类会一直出现

默认值规则写在组件 effect 里，effect 的触发条件是「挂载 / 模型变 / 输入边变」三合一：只要节点被打开，规则就会对任何一份没打「用户手选」标记的数据重新生效。数据来源（用户手建、Agent 落地、分镜投影、旧项目）各不相同，effect 只有一个判据，所以每多一个来源就多一类被改写的数据。铁律 ⑩（说的 = 摆的）：Agent 写下的比例与节点上摆的比例不一致——本类就是 ⑩ 的反例。

### 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| D2「确认只按节点花钱」上线后，Agent 起草的竖屏片在用户点开节点再确认时变横屏、按横屏扣费 | `src/workbench/generationCanvas/nodes/composerKeepsAspect.test.tsx`（修前 5 格红） |
| 给 effect 再加一个「Agent 写的不改」标记，又会有下一个来源（外部 Agent 落地、模板、粘贴）没打标记被改 | 数 effect 的判据分支 |

### 4. 靶子独立性检查

尺子是 R-d2-defaults 报告的真组件挂载探针（不是本线写的）；本线照它的手法写成仓库测试，复用 `composerMountBudget.test.tsx` 的渲染器。没有「修对了反而掉分」的先例。

### 5. P0

不是通用能力：「视频首选 16:9、输入全竖 9:16」是我们的产品规则（07-17 拍板），判据复用仓库已有的 `preferredVideoAspect` / `videoAspectDefaultPatch`，不新写。

### 6. 对比与推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 无：这是产品规则，没有库能代替 | — | — | — |
| 补 | effect 再认一个「Agent 写的」标记 | 小 | 下一个来源照样被改；「打开节点就改数据」还在 | 否 |
| 换（推荐） | 唯一出处 `videoAspectSeedPatch`，只在三个手势调：选模型、新卡自动选模型、连线（单连 / 组连线 / Agent 计划连线共用 `deriveTargetAfterConnect`）；**同一提交删掉挂载 effect**；落地时 Agent / 分镜写了合法比例记「明确选过」 | 中 | 断线 / 删上游不再回头改（用户拍板接受） | **是** |
| 删 | 只删 effect、不补新卡与连线 | 小 | 手建节点拿档案默认（如 adaptive），「连竖图变 9:16」消失，违背 07-17 | 否 |

**用户 2026-10-22 拍板（「按推荐」）：**
- 改法「换」。
- Q1：Agent 没写比例时，落地节点用**档案默认**（= 卡上显示 = Agent 路实际发出，三处一致）；D2 把节点变成唯一数据源时，落地改走同一个「铺默认值」owner，统一到 07-17「视频首选 16:9」。
- Q2 = A：连线那一刻算，只改没被明确选过比例的视频节点；**组连线算连线**（和逐张连是同一个手势）；粘贴、模板不算（带着自己的状态进来）；Agent / 分镜写过的合法比例落地时记为明确选过（沿用 `aspect_ratio_user_set`）；断线、删上游不回头改。

### 7. 用户要权衡的核心

已拍板：「打开节点」永远不改数据；比例默认值只在用户（或 Agent）真的做了选择的那几个手势里铺。

## 特征测试清单

- `src/workbench/generationCanvas/nodes/composerKeepsAspect.test.tsx`：真挂 `NodeGenerationComposer`。修前（base 代码）5 格红：Agent 落地的 Kling 9:16 / Veo 9:16 / Seedance 2.5 21:9、Agent 没写比例、旧节点没标记；修后 7 格全绿（含手建新卡 16:9 / 已连竖图 9:16 两格护栏，修前修后都绿）。
- `src/workbench/generationCanvas/store/canvasConnectVideoAspect.test.ts`：连线 / 组连线 / 明确选过 / 断线删上游。修前 4 格红，修后 8 格全绿。
- 现有：`composerMountBudget.test.tsx`（新卡首次挂载最多 1 次 store 写）不变。

## 第 2 轮（2026-10-24 · I-ratio-fix：补独立验收 V-ratio 的条件）

触发：第 1 轮用户拍板「换」之后，独立验收 V-ratio 判「有条件通过」（三条阻断 + 若干建议），协调派一条实现线在 #1291 分支上续做（补，不换）。这一轮要碰的文件 `node scripts/fix-churn.mjs` 再次命中，逐条列在下面，派工书要求按 P1 追加本节并带 `Direction-Check:` trailer。

### 命中清单

| 命中 | 构成 | 是不是只有口径命中 |
|---|---|---|
| `store/canvasDocumentCommit.ts` 文件 14 天已有 4 个 fix（10-09 ×2、10-10、10-11）；自写登记「canvas-undo-journal-write-boundary」（`under-review`，reviewBy 2026-11-06，paths 含它）30 天 18 个 | 全是别的 PR 的修复 | 否，文件本身命中 |
| `electron/shared/canvas/externalCanvasWrite.ts` 文件 2 个（10-09 ×2），目录 6 个 | 别的 PR | 否，文件本身命中 |
| `store/canvasGraphActions.ts` 文件 3 个 | 本 PR 自己的 d8575797b + 10-11 + 10-19 各一 | 否（去掉本 PR 自己的仍有 2 个） |
| `adapters/` 目录 6 个、`agent/`（plannedNodeMeta）目录 5 个、`creation/storyboard/exec/` 目录 2 个；概念「画布分组交互」「画布整写…怎么对待事实层」「新东西落在画布哪里」「制作镜头从画布显式解绑」 | 目录 / 概念口径 | 是 |

文件级命中的三处（`canvasDocumentCommit.ts`、`externalCanvasWrite.ts`、`canvasGraphActions.ts`）本轮的改法都是**在已有边界上多接一个调用 / 回调**，没有新增分支、特例或兜底。这不在「代批」口径里（文件本身命中、改法是补），协调交用户定，结果见第 7 节末。

### 0. 一句话根因

第 1 轮把「视频比例默认值」收到一个出处、把连线收到一个派生口，但派生口**外面**还有四处没收齐：入口没数全也没钉死（外部 MCP 连线没数到；3 个 derive 调用点、3 个「明确选过」标记写口没有测试）、派生口里自己另取了一份「这个节点有哪些比例档」（按种类的默认方式取目录，生成框按节点当前生成方式取）、触发条件比规则宽（任何一条边都重算）、标记按键名判而不按控件语义判。

### 1. 归类表（V-ratio 条目 → 直接原因 → 类）

| V-ratio 条目 | 直接原因 | 类 |
|---|---|---|
| 阻断 1：只发布「图生视频」的模型连线时不铺 9:16 | `seedTargetVideoAspect` 自己用 `peekCatalogModelOptions(种类)` 取清单，缺省是文生视频那份 | 同一个事实两处取（生成框一份、派生口一份） |
| 阻断 2：3 个 derive 调用、3 个标记写口删掉整套测试仍绿 | 入口只测了单连 / 组连线 | 入口没全写成测试（P2） |
| 阻断 3：外部 MCP 连线不经 derive | `applyExternalGraph` 是整图提交，当时被归为「不是手势」 | 入口没数全 |
| 建议 1：Agnes Video 2.5 只写 `size: 960P` 被记成「比例明确选过」 | `ASPECT_RATIO_KEY_SET.has(控件键名)` | 按键名判，不按控件语义判 |
| 建议 2：Seedance 2.5 连角色参考边，adaptive 被改成 16:9 | 任何一条边都调重算 | 触发条件比规则宽 |

### 2. 为什么这一类会一直出现

「连线之后目标跟着变什么」有很多扇入口（手势、Agent、外部 MCP、进组），每一扇都是在自己的上下文里调一个函数；入口多、测试只钉最常走的两扇，其余的删掉也没人发现。派生口里需要的事实（模型清单、哪些边算输入、哪个控件是比例）又各有现成的 owner，派生口第一次写的时候各抄了一份近似的。铁律 ⑩（说的 = 摆的）：Agent 说的比例要落到节点、节点显示的要等于会发的。

### 3. 不补的话接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 外部 Agent（Claude Code / Codex）连竖图到视频节点，07-17 规则不生效（打开节点也没有兜底了） | `canvasConnectVideoAspect.test.ts`「外部 MCP 连线」 |
| 再出现一个只发布「图生视频」的模型，连线又不铺比例 | `canvasConnectVideoAspect.test.ts`「按节点当前生成方式」 |
| 下一个把 `size` 当清晰度的模型被记成「比例明确选过」，连竖图不变 9:16 | `plannedNodeMeta.test.ts`、`storyboardProjection.test.ts` |

### 4. 靶子独立性检查

尺子是 V-ratio（独立验收线，Claude Sonnet）的变异复核和探针；本线没有改它们。每条新测试都在源码导出副本里用「删掉对应调用」的变异验过会红（红格数在设计卡「变异复核」一节）。没有「修对了反而掉分」的先例。

### 5. P0 与自写登记

- 「视频首选 16:9、输入全竖 9:16」仍是我们的产品规则，判据复用已有的 `aspectRatioControlKey`、`collectInputAspectRatios`、模型清单缓存，没有新写判据。
- 自写登记「canvas-undo-journal-write-boundary」（`canvasDocumentCommit.ts` 在它的 paths 里）：本轮只在 `external` 分支末尾加一个对共用派生口的调用，不改撤销日志和整写规则本身。该登记的 `whyNotIntegrated`（撤销「建节点」时装着付费结果的节点要留下，Yjs / tldraw 按来源撤销表达不了）和 `revisitWhen`（撤销栈改 Immer 反向补丁的评估结论出来时）不变，本轮不动它。

### 6. 对比与推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 无：这是产品规则 + 我们的画布手势，没有库能代替 | — | — | — |
| 补（同提交删旧） | 派生口改用生成框同一个取法并删掉自己那份；标记判据换成已有的 `aspectRatioControlKey` 并删两处键名清单；外部写口接同一个派生口；入口 / 标记写口各补一条测试 | 中 | 外部连线现在也会切生成方式（口径同进程内 Agent） | **是** |
| 重写 | 把所有入口收成一个「建边」函数 | 大 | 碰撤销日志和写边界，与「补，不换」冲突 | 否 |
| 删 | 去掉连线时铺比例，回到挂载 effect 或只在选模型时铺 | 小 | 违背 07-17 与 Q2 拍板 | 否 |

### 7. 用户要权衡的核心

已由协调裁定（10-23）：外部 MCP 连线算连线手势，和进程内 Agent 同一口径；项目没打开、主进程直接写盘那条路这次不做（打开后生成框显示的就是会发的比例，不会「显示 ≠ 发出」），记在根因合同 `residual_risks`，交协调立账。

**用户 2026-10-24 同意第 2 轮（原话：「#1291 第二轮同意：碰热点文件这次按推荐放行，门岗过了就推，派窄验收。」）**：三处文件级命中按上表「补」放行。本轮另发现的两条改前就有的问题（用户选「清晰度」会把比例写空并记成「比例明确选过」；比例档是像素串的模型从来不吃 07-17 规则）协调已立账，本 PR 合入后用一个尾巴 PR 一起修，不在本 PR 里再补一刀。

## 第 2 轮特征测试清单

- `src/workbench/generationCanvas/store/canvasConnectVideoAspect.test.ts`：8 → 20 格（目录取法 4、入口 3、新边种类 2、外部 MCP 连线 3）。
- `src/workbench/generationCanvas/nodes/composerKeepsAspect.test.tsx`：7 → 9 格（用户在比例控件上选的两个写口）。
- `src/workbench/generationCanvas/agent/plannedNodeMeta.test.ts`：+6 格；`src/workbench/creation/storyboard/exec/storyboardProjection.test.ts`：+4 格；`electron/shared/canvas/externalCanvasWrite.test.ts`：+4 格；`src/workbench/generationCanvas/nodes/aspectRatio.test.ts`：+8 格。
