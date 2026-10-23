# 方向检查：候选 → 画布节点的投影一直漏字段（2026-10-22）

触发：`node scripts/fix-churn.mjs` 命中——`electron/productionRun/multiShotCanvasLanding.ts` 14 天第 5 个 fix、`src/workbench/capability/multiShotCanvasLanding.ts` 第 3 个、`src/workbench/generationCanvas/agent/` 目录第 5 个；概念「制作镜头的节点还在不在画布上」第 8 个。本次（F-landing-defaults）是同文件里**另一个概念**（投影漏变体），但落点相同，按规矩先复盘。

### 0. 一句话根因

「候选 → 落地报文 → 节点 meta 入参」这条投影在三处**手抄字段**（主进程 `candidateWire`、渲染层 `candidateNodeArgs`、`rebindLandedShots` 里内联的第三份），而节点 meta 构造器 `buildPlannedNodeMeta` 能收的字段（`variantId`）比投影喂它的多；没有任何结构让「候选有、节点能收、投影没传」变成编译错误。

### 1. 归类表

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 2026-09-11 付费卡改尺寸「改完又弹回去」（`parameters` 字段注释） | 投影漏了 `parameters` | 投影漏字段（本类） |
| 「agent 说的模型 ≠ 节点上的模型」（`MaterializeShotCandidateWire` 头注释） | 投影漏了模型身份 | 投影漏字段（本类） |
| R-d2-defaults #2（本次）变体落到节点变回 Fast | 投影漏了 `variantId` | 投影漏字段（本类） |
| 0db5e0921 / a8768c79c 预览回执 | 落图回执没过预览 owner | 别的类（结果投影），已收口 |
| 363c11a2f / 69e852151 / 16909bf63 先落节点再派发、租约、文稿去重 | 落地时序 / 身份 | 别的类（生命周期），已由准入点收口 |
| R-d2-defaults #1（PR-b）比例被挂载 effect 改成 16:9 | 默认值有两个 owner（铺默认 + 挂载 effect） | 「两处各管一份默认值」 |

### 2. 为什么这一类会一直出现

投影是逐字段手写的（故意不 spread，防 `transportModelId` 之类内部字段过线——这条约束是对的），但「故意不传」和「忘了传」长得一样：都是这个键没出现在对象字面量里。每次候选加一个用户可选的维度（参数 → 模型身份 → 变体 → 下一个是参考 / 方式），都要有人记得改三处，漏一处就是「卡上一个、节点一个」。铁律 ⑩（说的 = 摆的）：意图写下的变体与节点草稿参数逐项不一致——本次就是 ⑩ 的反例。

默认值那一半：视频比例的产品默认既在「铺默认值」那一族（换模型时）算，又在组件挂载 effect 里算；后者不认「Agent 写的」，于是「打开节点就改数据」。

### 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| D2 把参考图 / 方式落到节点时（报告 #3），又要在三处各加一次，漏一处就是参考图「卡上有、节点没有」 | 给 `PlanCandidate` 加键后 `git grep` 三处投影是否都改 |
| 再有一个组件 effect「按产品默认纠正」别的参数（时长、清晰度），Agent 写的值一打开就被改 | 真组件挂载测试比 meta 前后 |

### 4. 靶子独立性检查

尺子是报告的探针（真函数 + 假上游抓真请求体），不是本线写的；本线把它固化进 `electron/parity/`，用同一夹具（`generationParityTestUtils`）。没有「修对了反而掉分」的先例。

### 5. P0

不是通用能力：这是「候选意图 → 画布节点」的领域投影（画布与按镜头花钱语义，`self-written.json` 领域目录内）。类型层的穷举用 TypeScript 自带的映射类型（`Record<keyof T, …>`），不自写校验器。

### 6. 对比与推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 用 zod schema 描述报文、两端 parse | 报文已有 TS 类型，zod 只多一层运行期校验，管不住「候选有、报文没写」 | 不解决本类 | 否 |
| 补 | 三处各加一行 `variantId` | 小 | 下一个字段照样漏 | 否 |
| 换（推荐） | 主进程投影改成按 `PlanCandidate` **每个键**归类的表（`Record<keyof PlanCandidate, …>`，过线 / 不过线写理由），渲染层两扇（新建 / 重绑定）共用一个 `plannedInputFromCandidate`，渲染层报文类型从共享类型派生；同一提交删掉重绑定里那份内联投影 | 中 | 类型穷举只管「键」，不管值的语义——值层由新加的 parity 测试（真目录每个变体）兜 | **是** |
| 删 | 删掉候选这份、节点成唯一 owner | D2 的大改，不在本次 | — | 归 D2 |

默认值那一半：删挂载 effect，比例默认只在铺默认值那一族算（PR-b）。

**用户 2026-10-22 拍板：按推荐「换」。**

### 7. 用户要权衡的核心

没有新的产品取舍：本次只让节点忠实于 Agent 的选择；连线时还要不要自动改比例（Q2）单独问。

## 特征测试清单

- `electron/parity/landingProjectionParity.test.ts`（新）：修前红（节点变体 = fast、节点路 body.model = `*-fast`），修后绿。
- 现有：`electron/parity/variantResolutionParity.test.ts`、`src/workbench/capability/multiShotCanvasLanding.test.ts`、`electron/productionRun/multiShotCanvasLanding.test.ts`。
