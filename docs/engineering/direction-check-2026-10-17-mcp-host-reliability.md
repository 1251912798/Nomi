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

### 补充：为什么 no-cost 门岗两轮被绕过

V-mcp 先后用「Cost 0 / 12 / 1.25」、再用全角「Cost １２」与换行「Cost\n12」绕过了 no-cost 门岗。类根因：**门岗是在词条原文上直接做正则匹配，没有先规整文本**，所以任何换一种写法（全角数字、换行 / 制表 / 不换行空格、零宽字符）都能躲开；我每次只针对被点名的那一个写法补一条规则，等于在原文匹配这个结构上继续加例外，同一类还会从下一种写法回来。另外「金额」的口径也只认阿拉伯数字与 `$¥`，漏了中文数字与货币词（元、块、美元、USD、CNY、RMB）。
整类修法（不再加例外）：`normalizeForScan` 在扫描前统一规整——NFKC（全角转半角）、去零宽（U+200B–U+200D、U+2060、U+FEFF）、一切空白与换行压成一个空格——再套**所有**规则（词典值、词典 key、源码字符串都走它），白名单「整值精确等于」也在规整后比较；「费用 / Cost」后跟阿拉伯数字、中文数字（零一二…万、两、〇）、货币符号或货币词一律红。变异「去掉规整」会红（备份拷回 sha256 核对）。


### 再补充（第三轮，结构解收口；取代上一节的「整类修法」）

V-mcp 前后三轮各找到一类绕法：带数字的「Cost 12」；全角「Cost １２」与换行「Cost\n12」；罗马数字「Cost Ⅻ」、词中软连字符「Co\u00ADst 12」、运行时插值「Cost {{amount}}」。类根因：**我一直在用正则扫自由文本，去证明「哪里都没有金额」——而正则只能证明「有」，证明不了「没有」，这件事没有边界，永远能再找到绕法**；每轮只补被点名的那一种，等于在同一个结构上继续加例外，到第三轮才停下找根因。

结构解（不再加例外）：
1. `runtime.capability.generationGateCost` 这一键**只认精确值**：中文只许「费用」，英文只许「Cost」，在**原文上逐字比较**（不规整、不看正则）；带插值占位、规整前后不等、任何别的值都红。
2. **金额只从 `reservationMaximumForDisplay` 出**：`reservationAmountSingleExit.structure.test.ts` 扫 electron 非测试源码，除 approvalReceipt.ts 外任何文件读 `reservationPreview.maximum` 都红（已登记进 `scripts/pre-push-scan-guards.mjs`）；`unknownPriceGateProjection.test.ts` 证明发给渲染端的 `maximumCost` 恒等于该函数输出；`generationGateCapability.test.ts` 证明卡上费用一行只由收到的 `maximumCost` 决定（数字 → 币种 + 该数字；缺席 / null / NaN / Infinity → 「未知」）。
3. **其它键的正则扫描降成启发式、尽力而为**，保留现有规则（含 NFKC / 去零宽 / 空白压缩、中文数字与货币词），不再承诺「全覆盖」。脚本头已写明。**已知不覆盖**：罗马数字（Ⅻ）等本规则没列的数字类别、软连字符 U+00AD 等不可见字符、词中插入的其它符号、运行时插值（`Cost {{amount}}` 里 amount 运行时才是 12）。这三个写在白名单键上必红（单测），写在其它键上记成已知局限（单测断言不红并注释原因）。
4. 变异：去掉第 1 条的精确判定，三条绕法的用例回到漏检（红），备份拷回 sha256 核对一致；往 generationDispatcher.ts 里加一处直接读 `reservationPreview.maximum`，源码扫描守卫红，已还原。

