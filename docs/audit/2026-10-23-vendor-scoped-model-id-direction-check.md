# 方向检查：共享档案的型号名被当成所有供应商的型号名（2026-10-23）

触发：`node scripts/fix-churn.mjs` 命中——概念「参数准入」14 天第 5 个 fix（`mcpGenerationVideoResolve.ts` 等文件本身不热）；`src/config/` 目录第 3 个、`src/workbench/api/` 目录第 8 个（本次只加一个类型字段 / 一个新文件）；概念「生成框挂载路径的常驻数据」第 3 个（`modelCatalogCache.ts`——本次**没改**它，查询口放在新文件 `src/workbench/generationCanvas/model/modelNameSourceLookup.ts`，只调它已有的同步读口）。改法是「换」，协调 2026-10-23 代批（概念 / 目录口径命中、文件本身没命中），事后报用户。

### 0. 一句话根因

档案上的型号名（`catalogModelKey`、变体的 `modelKey`、方式的 `modelEnum`）是某一家供应商的名字，但类型上它们是不带供应商作用域的字符串，任何解析档案的人都能把它们用到别家头上。

### 1. 归类表

| 现象 | 直接原因 | 类 |
|---|---|---|
| Runway `wan3` 的 Agent 路报 Unknown model `wan/3-0-video`（R-runway-wan3） | `videoCandidateForPlan` 用档案 `catalogModelKey` 改写候选身份 | 本类 |
| Runway `seedance2*` / `veo3.1*` 的发出型号是 KIE / APIMart 的名字、变体条出别家的三个变体 | `videoTransportModelIdForPlan` 与变体条取档案变体 key | 本类 |
| APIMart `kling-v3`、`gpt-image-2*`、`doubao-seedream-4.5`、`gemini-2.5-flash-image-preview`，fal、MiniMax 的若干行：发出型号 / `params.model` 是 KIE 的方式型号名（今天被映射写死的型号盖住，潜伏） | 档案方式的 `modelEnum` 无条件进 `request.params.model` | 本类 |
| PR-a 特征测试里 Runway wan3 那 3 格 | 同第一行 | 本类 |

### 2. 为什么这一类会一直出现

一个档案被设计成「供应商无关」（同一个模型经任何供应商接入都吃同一套方式 / 参数），可型号名天生是供应商相关的。两件事住在同一个对象上、同一组无作用域字段里，于是每接一家新供应商到一个已有档案，它的型号名就悄悄变成档案拥有者那家的。按名字比对谁拥有也不行（2026-10-23 实测：Runway 的 `seedance2` / `veo3.1` 恰好等于别家的旧别名，Dreamina 的行名对不上它自己档案的 key）。铁律 ⑩：节点 / 卡上的模型是这家的，发出去的型号名是别家的。

### 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 用户接一个自建中转、映射写 `{{request.params.model}}`、模型用到某个共享档案：发出的是档案拥有者那家的型号名 | `electron/parity/vendorScopedModelId.matrix.test.ts` 的作用域判据 |
| 把 Runway 的映射改成读 `request.params.model` 的那一刻，Seedance / Veo 立刻按 KIE / APIMart 的名字发出 | 同上 |

### 4. 靶子独立性检查

尺子来自 Codex 的 R-runway-wan3（不是本线写的）；矩阵把它推广成全部供应商 × 档案 × 方式 × 变体。作用域判据用的是供应商映射（数据），不是档案上的名字。

### 5. P0

领域规则：「哪家这一行发什么型号名」。没有现成库能代替；判据读的是我们自己的供应商映射。

### 6. 对比与推荐（用户 2026-10-23 拍板：A）

| 选项 | 做什么 | 代价 | 推荐 |
|---|---|---|---|
| A 供应商映射说了算 | 目录层按每一行映射是否读 `request.params.model` 派生「型号名来源」（唯一计算处 `electron/catalog/modelNameSource.ts`），两个档案解析口共用一个收窄函数；不接受的行档案只给参数 | 碰目录读出层与两个解析口 | **是** |
| B 档案声明归属 | 档案上写 `wireVendors` + 门岗核对 | 同一件事两份；数据里出现供应商名；中转默认没有变体 | 否 |
| C 型号名搬进供应商目录 | 结构最干净 | 二十多个档案 + 旧节点迁移 | D2 之后再议 |

另：宿主身份只在「这家目录里确实有这一行」时才用档案的基础行 key 折叠旧变体串；存量草稿里已被改写成别家 key 的候选按「这家目录里没有这一行」拒绝、让 Agent 改选，不猜（协调 10-23 确认）。

### 7. 用户要权衡的核心

已拍板：型号名的家是供应商的映射，共享档案只给参数。

## 特征测试清单

- `electron/parity/vendorScopedModelId.matrix.test.ts`：修前（base 解析口）559 格里 236 格红（Runway 13 行、APIMart 6 行、fal 2 行、MiniMax 1 行，共 22 行），修后 435 格全绿（不接受档案型号名的行没有变体轴，格子变少）。
- 现有 `electron/parity/variantResolutionParity.test.ts`、对等矩阵、PR-a 的 `landingProjectionParity`（合入后）：接受档案型号名的行行为不变。
