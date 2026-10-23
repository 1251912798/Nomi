# 设计卡：视频比例默认值只在「铺默认值」那一处算（F-landing-defaults PR-b）

```
改动名：删掉「点开节点就改比例」的挂载 effect，16:9 / 全竖 9:16 收进铺默认值那一族   线：F-landing-defaults   类别：[花钱][其他]
```

背景：核查报告 R-d2-defaults #1。Agent 写 9:16，节点一点开，`NodeParameterControls` 的挂载 effect 把它改成 16:9，之后在节点上点生成就发 16:9（真组件挂载 + 真请求体复现过：Kling / Veo 9:16→16:9、Seedance 2.5 21:9→16:9）。前一刀 PR-a（#1288，落地带变体）的设计卡：`docs/plan/2026-10-22-landing-defaults.md`；本 PR 的复盘（概念「视频比例默认值的唯一出处」）：`docs/audit/2026-10-22-video-ratio-owner-direction-check.md`，引用 PR-a 那份 `docs/audit/2026-10-22-landing-projection-direction-check.md`。

用户拍板（2026-10-22「按推荐」）：
- **规则不变**（用户 2026-07-17）：视频首选 16:9，已连输入全竖才 9:16。
- **Q1**：Agent 没写比例时，落地节点用**档案默认**（= 卡上显示 = Agent 路实际发出，三处一致）。
- **Q2 = A**：连线那一刻算（连线手势的共用派生口，与连线自动切模式同一处；**组连线算连线**，粘贴 / 模板不算），只改**没被明确选过比例**的视频节点；Agent / 分镜写过的合法比例落地时记为明确选过（沿用 `aspect_ratio_user_set`）；断线、删上游不回头改。

### 功能分类
- [x] 花钱（比例决定出片规格，部分模型按规格计价）
- [x] Agent 行为（Agent 落地的节点）
- [x] 大数据量 / 画布 / 长列表（路径推出：画布节点与连线）
- [x] 新增功能 / 性能（路径推出；不新增交互）
- [ ] 新界面 / 改交互
- [ ] 长跑 / 可打断
- [ ] 生成效果
- [ ] 数据格式

| 格 | 结论 | 证据 |
|---|---|---|
| ★1 用户怎么用 | 当 Agent 起草了一个竖屏镜头，我想点开节点看到的还是 9:16，在节点上点生成发出的也是 9:16；当我自己在画布上新建视频节点，默认仍是 16:9，把竖图连进来它变 9:16。步骤：①Agent 起草 9:16 ②落地 ③点开节点 ④节点上点生成；另一条：①手建视频节点 ②连一张竖图 ③点生成。**不做**：报告 #7「比例由图决定、不发」的模型（Kling 图生、Veo 参考 / 首尾帧）界面说明；重绑定冲掉用户改动（#4，归 D2）。真实任务：Kling 3.0 Agent 起草 9:16；Seedance 2.5 Agent 不写比例（档案默认 adaptive）；手建 Seedance 2.0 视频节点 + 连竖图。主指标：「打开节点后 meta 不变」的格子比例（量具：真组件挂载测试，基线 = 报告 probe-render 的 3/3 被改，目标 0）；护栏：手建节点 16:9、连竖图 9:16（量具：同一挂载测试 + store 单测）。 | 测试路径见下表 |
| ★1b 连带界面 | 节点生成框的比例 chip、批量估价读节点 meta：打开 Agent 落地的节点不再跳成 16:9。没有新文案。 | 挂载测试 |
| ★2 谁说了算 | 视频比例的产品默认只有一个 owner：`videoAspectSeedPatch`（新，住 `nodes/aspectRatio.ts` 旁，读 `preferredVideoAspect`），只在三个手势调：选模型（`buildNodeModelChangePatch`）、新卡自动选模型（`useNodeModelAutoSelect`）、连线（`store/canvasConnectDerivations.deriveTargetAfterConnect`——单连、多选成组连、组连线、节点进组物化组连线、Agent 计划 / 3D 站位 `connectNodes`、派生节点，边建上之后都只调它；粘贴 / 模板 / 恢复不调）。挂载 effect 删除。「明确选过」只有一个标记 `aspect_ratio_user_set`：用户在比例控件上选（现有）、落地时 Agent / 分镜写了合法比例（新，`buildPlannedNodeMeta`）。不靠「打开节点」推断任何事。 | `node scripts/door-map.mjs videoAspectDefaultPatch / preferredVideoAspect`：改前 2 扇（含挂载 effect），改后只剩 owner 一扇 |
| ★3 一致与复用 | 复用 `preferredVideoAspect` / `collectInputAspectRatios` / `videoAspectDefaultPatch`；连线后的派生写与「连线自动切模式」收进同一个函数 `deriveTargetAfterConnect`（原 `autoPromoteTargetModeForEdge` 从 `canvasGraphActions.ts` 搬出、同提交删除旧处；`history: false`，同一个撤销步）。不新造比例判据。 | `git grep` |
| ★4 全状态 | 模型清单没载入：新卡自动选模型本来就等清单，比例随模型一起写（一次写）。连线的上游没有可读比例（还没出图）：不改（`preferredVideoAspect` 只看可读的）。节点比例明确选过：连线不改。旧项目存量节点：打开不改。 | 测试 |
| 5 中途表 | 不新增异步步骤、不改派发 / 扣费时序；连线写与连线自动切模式同在一个同步手势里，撤销一次连同撤回。 | 不适用：无新状态 |
| 6 外部数据与失败 | 外部来源只有供应商请求体，本机假上游抓；付费核对脚本由协调跑（见下）。 | parity 测试 |
| ★7 性能 | 不新增交互：连线时多一次 O(入边数) 的比例计算 + 至多一次 meta 写；挂载少一个 effect（挂载写次数只会变少）。 | `composerMountBudget.test.tsx` 现有预算不变 |
| 8 真实条件 | Windows：是；真付费：协调跑 `tests/ux/agent-ratio-variant-landing.paid.mjs`（本 PR 只写脚本，PR-a + PR-b 整条「Agent 落地 → 画布生成」一次覆盖）；截图：挂载测试代替（界面测试会打扰用户）。 | — |
| 拍板图清单 | 不适用：不改界面布局 | — |
| ★9 验收与回滚 | 按下表逐条；回滚：revert 本 PR 提交（挂载 effect 回来，行为回到现状；`aspect_ratio_user_set` 多写的那些节点只会「连线时不再被自动改」，无数据损坏）。独立验收：协调指派。 | `## 独立验收` |

## 验收清单（实现前写）

入口（door-map 数的）：比例默认值的写口改前 2 扇——`buildNodeModelChangePatch`（选模型）、`NodeParameterControls` 挂载 effect（挂载 + 换模型 + 输入边变化三合一）。改后：owner `videoAspectSeedPatch` 一扇，调用方三个手势；挂载 effect 删除。「明确选过」标记的写口：比例控件两处（现有）+ `buildPlannedNodeMeta`（新）。

| # | 入口 / 场景 | 反例 → 期望 | 量具 |
|---|---|---|---|
| b1 | 挂载：Agent 落地的节点（真 `NodeGenerationComposer` 挂载） | Kling 3.0 9:16、Veo 3.1 9:16、Seedance 2.5 21:9（APIMart 真档案）挂载 → meta 一个字不变、0 次比例写（改前：被改成 16:9） | 真组件挂载测试（`composerMountBudget` 同一套 react-reconciler 渲染器） |
| b2 | 挂载：Agent 没写比例（Q1） | Seedance 2.5 文生落地 = 档案默认（adaptive）→ 打开不改 | 同上 |
| b3 | 挂载：旧项目存量节点 | 没标记、比例不是 16:9 的旧节点 → 打开不改 | 同上 |
| b4 | 新卡自动选模型（`useNodeModelAutoSelect`） | 用户手建视频节点、没有输入 → 挂载后 16:9；新建时已有竖图输入边（从竖图拖出新节点）→ 9:16；仍然最多 1 次 store 写（现有预算） | 挂载测试 |
| b5 | 选模型（`buildNodeModelChangePatch`） | 现状不变：换模型按「首选 16:9、输入全竖 9:16」重铺 | 现有测试 + 一条回归 |
| b6 | 连线（`writeCanvasEdge`，单连 / Agent 计划连线 / 3D 站位连线共用） | 没明确选过比例的视频节点连进全竖图 → 9:16；连进横图 / 混合 → 16:9；同一手势一次 ⌘Z 连线与比例一起撤 | store 单测 |
| b7 | 连线：明确选过 | 用户在比例控件选过 → 连竖图不改；Agent 落地写了 9:16（b9 标记）→ 连横图不改 | store 单测 |
| b8 | 断线 / 删上游 | 断掉那张竖图、删掉上游节点 → 比例不回头改 | store 单测 |
| b9 | 落地标记（`buildPlannedNodeMeta`） | Agent / 分镜写了合法比例 → meta 带 `aspect_ratio_user_set: true`；没写或写了非法值 → 不带（档案默认，连线可改） | 单测 |
| b10 | 组连线（协调 10-22 拍板：算连线） | 一组竖图连到没明确选过比例的视频节点 → 9:16；一次 ⌘Z 连同比例一起撤 | store 单测 |
| b10b | 粘贴 / 模板 / 恢复快照 | 不算连线手势（带着自己的状态进来），不重算：这几扇不调 `deriveTargetAfterConnect` | 读码 |
| b11 | 13 模型格子 | APIMart 视频模型 × Agent 写 9:16：落地节点 = 节点路请求体 = 宿主路请求体由 PR-a 的 `landingProjectionParity`（11 格）钉；本 PR 钉「挂载后 meta 一个字不变」（Kling / Veo / Seedance 2.5 真挂载）——两段相接即「挂载后再发 = 宿主路」。付费脚本在真上游上把整条再走一遍 | parity + 挂载测试 + 付费脚本 |
| b12 | 结构 | 全仓只有 `videoAspectSeedPatch` 调 `videoAspectDefaultPatch` / `preferredVideoAspect`；组件文件里不再有写比例默认的 effect | door-map 写进合同 |

## 付费核对脚本（只写，协调跑）

`tests/ux/agent-ratio-variant-landing.paid.mjs`：照 `tests/ux/_paidRun.mjs` 的 `openPaidWalk`（隔离资料、出网只放行授权供应商、先零花费探测、key 只从环境变量读）。
- 起草不调真文本模型：文本模型用仓库的 loopback 夹具（`agent-runtime-fixture.mjs`）按脚本回一次 `draft_shots` 工具调用（Seedance 2.0 带变体那档里**最便宜的一个变体** + 9:16，1 镜，最短时长），媒体走真 APIMart。
- 核对：落地后打开节点，节点显示的变体 / 比例 = 起草的；从画布点生成，网络日志里真请求体的 `model` = 该变体的发出型号、`size` = 9:16；只发 1 次媒体请求。
- 「最便宜」按档案的变体顺序 / 规格写死在脚本里（不读价格表、不写金额）；脚本开头写清这一点，由协调核对。

## 修前 / 修后（本 PR）

- 真组件挂载 `composerKeepsAspect.test.tsx`：修前（base 代码）5 / 7 格红（Agent 落地的 Kling 9:16、Veo 9:16、Seedance 2.5 21:9 被改成 16:9；Agent 没写比例的 Seedance 2.5、旧节点同样被改），修后 7 / 7 绿；手建新卡 16:9、已连竖图 9:16 两格修前修后都绿（护栏）。
- 连线 `canvasConnectVideoAspect.test.ts`：修前 4 / 8 格红（连竖图不变 9:16、组连线不变、落地不记明确选过、断线删上游那格的前提不成立），修后 8 / 8 绿。
- 付费判定 `tests/ux/_ratioVariantWire.test.mjs`：真 runTask 渲染这一档，型号 `seedance-2.0-mini`、比例 9:16，4 格绿（含两种修前形状判红）。
- door-map：`videoAspectDefaultPatch` / `preferredVideoAspect` 改前各 2 扇（`buildNodeModelChangePatch` + `NodeParameterControls` 挂载 effect），改后各 1 扇（`nodes/videoAspectSeed.ts`）。
