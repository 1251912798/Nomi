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
