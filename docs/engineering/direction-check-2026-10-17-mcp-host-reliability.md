# 方向检查：MCP 宿主连接可靠性（2026-10-17）

触发：`node scripts/fix-churn.mjs` 命中自写登记 `mcp-protocol`（to-replace，近 30 天第 30 个 fix）与 `ConnectAssistantCard.tsx`（近 14 天第 4 个 fix）。任务书（F-mcp，协调 10-17）已预见本次要带 `Direction-Check:` trailer，这份即复盘；结构性结论交用户拍板。登记条目 id：`mcp-protocol`。

### 0. 一句话根因

真宿主实测查出的 5 个问题，都是「连接这条线上谁拥有什么」没有单一答案：会话的创建方不负责结束它（C-1）、桥只会用一句话描述所有失败（C-2）、「价格未知」在三处投影里各写各的判据（C-3）、确认结果只有布尔没有「被拒绝」这个终态（C-4）、服务起没起来只有日志没有状态（C-5）。缺的是各自那条生命周期 / 投影 / 终态的唯一 owner。

### 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| C-1 检查累积会话挤掉真实会话 | `verifyHttpEntry` 只 `close()` 本地传输，不发 HTTP DELETE；服务端上限 32 按 lastSeen 淘汰，探针和真实会话一视同仁 | 生命周期：创建方不负责结束 + 淘汰策略不分轻重 |
| C-2 转发口失效会话后一直说「请先打开 Nomi」 | 桥把所有上游错误翻成同一句；404 后没有重握手 | 失败原因被抹平 |
| C-3 确认卡显示 CNY0 | 挑战里 `maximum` 对全未知存占位 0；MCP 投影、批投影、GUI 投影三处各写判据，GUI 那处漏了 | 投影无唯一判据 |
| C-4 取消后仍说「需要确认」 | 拒绝只是 `confirmed:false`，和「还没确认」不可区分 | 终态缺失 |
| C-5 端口冲突只见日志 | 起服务失败只 `logWarn`，无处记录 | 状态缺失 |

### 2. 为什么这一类会一直出现

连接线是「先有路径、再补各种失败」长出来的：每次新增一个错误场景就在原地加一个分支（29 次 fix），没有一张「失败原因 → 谁负责说 → 说什么」的表。铁律 ⑩⑪⑫ 均不适用（不涉及意图抽取 / 模型参数 / 点击预期），类根因在连接生命周期与确认契约。

### 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 下一个新增的探针 / 检查入口（例如设置页新按钮）又忘了结束会话 | `mcpHostReliability.test.ts` 的探针优先淘汰：即使泄漏也不会挤掉真实会话 |
| 新的确认入口（删除、文稿、时间线）各自又回「未确认」，Agent 又催问 | 生成门与降档已共用 `generationDenialOutcome`；其余入口走查时对照 |

### 4. 靶子独立性检查

- 尺子来自 C 线真宿主实测（真 Codex app-server、官方 SDK 客户端），不是本线写的。本线测试同样走官方 SDK 客户端实连本机服务，另有一份独立验收线（V-mcp）。
- 没有「修对了反而掉分」的先例。

### 5. P0：这些是我们独有的吗？现成方案有哪些

- 协议、传输、会话（含 DELETE 结束会话、404 重新初始化的规范语义）：官方 MCP TypeScript SDK v2（`@modelcontextprotocol/client` 2.3.0，`StreamableHTTPClientTransport.terminateSession()`；规范 Streamable HTTP「会话管理」一节：服务端回 404 → 客户端必须重新 initialize）。本次修法就是用 SDK 已有的 `terminateSession()`，转发桥按规范 404 语义重握手；没有新写协议。
- 领域部分（谁能连、付费确认的真人答复、价格未知不当 0、按 Nomi 的连接状态卡说明原因）：独有，留在 Nomi。
- 登记 `mcp-protocol` 的 `revisitWhen`：第 3 段完成、两个 stdio 启动器收成薄转发口后改 justified。本次不改变这个计划；转发桥里新增的重握手逻辑是规范语义的最小实现（只用 SDK 传输 + 一次 initialize + ping），不是新协议。

### 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 全部用 SDK 已有能力：`terminateSession()`（C-1）；转发桥 404 重握手按规范（C-2）。SDK 没有「桥」这个角色，桥本身只能是 Nomi 的薄层 | 已含在本次 | 低 | 是（已做） |
| 补 | 每条在原地加分支 | 小 | 第 31 个 fix | 否 |
| 重写（限一个模块） | 把转发桥重写成基于 SDK `Client` + `Server` 的中继 | 大：帧原样搬运的性质会变，Desktop 实测面大 | 中 | 否，本次不做 |
| 删 | 删旧 stdio 启动器 | 属 `revisitWhen` 的下一版 | 隐藏实例冷启依赖 | 否，留给下一版 |

本次的做法是上表第一行加最小的「唯一判据 / 唯一终态」收口（`reservationMaximumForDisplay`、`generationDenialOutcome`、`recordMcpHttpStartFailure`），不是原地补分支：每条都让同一类问题在另一个调用者那里无法重现。

### 7. 用户要权衡的核心

转发桥现在会在会话失效时自己重握手并只重发天然可重复的读请求（写入 / 生成在连接状态不明时绝不重发，宿主会收到「可能已执行，先查结果」）；要不要再往前走一步、把桥换成 SDK 中继，等旧启动器那一版再定。

## 特征测试清单（动结构前先锁住）

- `electron/capabilityCore/mcpHttpServer.test.ts`、`mcpHttpForwarder.test.ts`、`mcpWireContract.test.ts`（四种连接器各跑一遍协议行为）：改前改后均绿，只有一处契约有意变更（拒绝后的结果，见 C-4）。
- 新增红转绿：`mcpHostReliability.test.ts`（C-1 / C-2）、`unknownPriceGateProjection.test.ts` 与 `generationGateCapability.test.ts`（C-3）、`mcpGenerationDenial.test.ts`（C-4）、`mcpHttpPortConflict.test.ts`（C-5）。

## 补充：自写登记 `gate-family`（花钱文案门岗的一处窄放行）

本线的 C-3 收尾改了 `scripts/check-i18n-no-cost-claims.mjs`（登记条目 id：`gate-family`，状态 under-review，同族 10-15 复盘 `direction-check-2026-10-15-walkthrough-instruments.md` 已在评估）。改动只有一处：未知价那一行的标签需要写成「费用 / Cost」，而门岗禁用词里有「费用」，于是加了 `COST_LABEL_EXACT`——只放行 `runtime.capability.generationGateCost` 这个 key 的**精确**值「费用」「Cost」，换成别的值、带数字、别的 key 都照样红（`check-i18n-no-cost-claims.node-test.mjs` 有正反用例）。

- 为什么现在换不了现成方案：这是 Nomi 自己的「界面不谈钱」词表规则，领域约束（花钱语义，价格未知不许说成 0）；没有通用 i18n lint 能表达「这个 key 只许这两个值」。
- 为什么是补而不是换：整族门岗是否收拢到一个现成的规则引擎属于 `gate-family` 那份复盘的结论，本次只加一条精确白名单，不新增并行判据。
- 哪天换：随 `gate-family` 复盘拍板的那一版一起评估（门岗族收拢时，这条精确放行直接并入词表登记）。
