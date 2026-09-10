# Agent 运行时重做方案（2026-09-07）

> 状态：📋 方案待拍板 —— **只写方案，一行产品代码未改**。含必须先拍板的 **3 条岔路**（§7）。
> 基线：`origin/main@1365441db`。全文 `file:line` 均在此 checkout 上实核。
> 起因：2026-09-06 深夜用户拍板——**「不能为了好做而去修补现在的，既然整体错了，就重做吧。」**
> 上游输入（三份，全部吸收）：
> - [#546 架构总评审](../audit/2026-09-06-agent-architecture-review.md) + [渐进方案](2026-09-06-agent-architecture-master-plan.md)（**它主张渐进修，用户已否决**；四列表 / 漏洞清单 / 三条岔路 / 合流顺序全部吸收）
> - [#547 工具层审计](../audit/2026-09-06-agent-tool-layer-audit.md) + [根修方案](2026-09-06-agent-tool-layer-root-fix.md)（`canvas.write` 真实模型 **0/18**、读类 37/37、违反行业 10 条）
> - [#549 成熟 Agent 产品调研](../research/2026-09-06-mature-agent-products.md)（**已并入 · 2026-09-07 随 PR #549 合入 main**，路径 `docs/research/2026-09-06-mature-agent-products.md`）——它的 §1.9 与本文 §0.2 是**两次相互独立的实核**：它实拉 `0.84.3` / `0.85.1` 两个 tarball，比 `dist/harness/agent-harness.js` 的字节数与 `HarnessNotImplemented` 计数，并读 `agent-harness.d.ts` 确认 `LaneSnapshot` 已带 `streamingMessage` 与 `runningTools`；结论与本文一致——**`AgentHarness` 在 0.85.1 是真实现，#546 §1.5「它是空壳」的判断只对 0.84.3 成立**。两条独立证据同向，是岔路 1 推荐 A 的依据。

---

## 先查别人

> 本节 2026-09-07 随 `check:prior-art` 门岗补入（R27 §16）。**内容不是新查的**——这份方案本来就
> 做足了检索，只是散在正文里没有一个固定的标题；这里把它按四问归拢，每格给出可复核的出处。

| 问 | 答 | 出处 |
|---|---|---|
| 依赖里已有？ | 有，而且比我们写的全。pi 已提供会话持久化（`SessionManager`）、有序转录（`AgentSessionEvent`）、重试（`RetryPolicy`）、steer/followUp、资源加载（`DefaultResourceLoader`）——我们各写了一份更差的，共 14 处已登记成债 | `@earendil-works/pi-coding-agent@0.84.3` dist/core/session-manager.d.ts:184、dist/core/agent-session.d.ts:377/385、dist/core/resource-loader.d.ts:120、dist/core/agent-session.d.ts:40；登记表 [`docs/engineering/framework-boundaries.json`](../engineering/framework-boundaries.json)、债基线 `scripts/framework-boundary-baseline.json` |
| 依赖的**新版**里已有？ | 有。0.85.1 的 `AgentHarness` 是真实现，不是 0.84.3 那个空壳——这条直接推翻了 #546 §1.5 的前提，决定了整份方案的形状 | 本文 §0.2 的双版本 tarball 逐字比对（`dist/harness/agent-harness.js` 7883B/5 次 `HarnessNotImplemented` → 558B/0 次）；独立第二次实核见 [`docs/research/2026-09-06-mature-agent-products.md`](../research/2026-09-06-mature-agent-products.md) §1.9 |
| 仓库里已有？ | 有，且正是问题所在：`electron/harness/runtime/pi/`（session/snapshot/contextCodec/run/resources/nomiSkillResources）与 `electron/projectAgentHost/`（executionCoordinator/executionHelpers/turnExecution）就是那 14 处自研版本的所在地 | [`docs/audit/2026-09-06-agent-architecture-review.md`](../audit/2026-09-06-agent-architecture-review.md)、[`docs/audit/2026-09-06-agent-tool-layer-audit.md`](../audit/2026-09-06-agent-tool-layer-audit.md)（`canvas.write` 真实模型 0/18） |
| 生态里已有？ | 有。成熟 Agent 产品的运行时分层、工具契约与容忍策略已成行业惯例，本方案的 §3 工具契约规范直接对着它们写 | [`docs/research/2026-09-06-mature-agent-products.md`](../research/2026-09-06-mature-agent-products.md)（PR #549 已合入 main） |
| TikHub 自媒体里怎么说？ | 本轮未查。这一层是运行时架构，不是面向用户的产品能力，自媒体侧没有可比的一手经验——**明着标出来，不冒充覆盖** | 无 |

**结论**：用已有（换用 pi 0.85.1 的 `AgentHarness` 与它已提供的五项能力），自研只保留 Nomi 独有的那部分（工具契约、画布语义、投影层）。理由：14 处自研版本每一处都比上游的差，且升级 pi 时要我们自己跟——这笔成本是结构性的，不是一次性的。

**2026-09-07 补充行（阶段 2 · 工具契约那一层的「别人怎么做」）**。上面四问查的是**运行时**——
换谁的框架、哪一层自研。阶段 2 动的是**模型看到什么**，那一层的现役标准写在 Anthropic 官方
工具文档里，而我们此前一次都没系统读过它。这一轮逐页读完，四条与本仓形状直接咬合的事实：

| 读的是哪一页 | 拿到的是什么 | 它改了我们的什么 |
|---|---|---|
| [Tool reference](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference) | 工具定义上的可选属性各管什么：`cache_control`（前缀断点）、`defer_loading`（不进初始系统提示词）、`input_examples`（示例）、`strict`、`allowed_callers`；以及**工具版本用日期后缀、新旧长期并存** | 版本那条**明确不抄**（并存 = 两份真相源，P1 禁止），我们的等价物是名字稳定 + `prepareArguments` 折旧（§3.7 ⑩）。`input_examples` 仍不用——它只有一家认，我们要跨供应商，示例继续写进 description |
| [Tool search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) | 开延迟加载的**数字判据**：≥10 个工具或工具定义 >10k token；工具选择准确率通常在 30–50 个工具后才开始掉；「保留 3–5 个最常用的不延迟」 | §3.7 ⑫ 的闸门数字直接取自这里，并写死进 `laneToolCatalog.ts`。结论是**今天不开**（11 个 / ≈5k token），但下一个人撞到上限时看到的是一个有出处的数，不是一句「感觉够了」 |
| [Tool use with prompt caching](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching) | 缓存前缀是 `tools → system → messages` 的层级：**改工具定义作废整段缓存**；`defer_loading` 的工具在算缓存键之前就被摘出前缀，所以延迟加载不破缓存 | 这条把「工具目录顺序是合同」从一句纪律变成一笔可算的账，也是 §3.7 ⑥「按轮切菜单不是省钱」的依据。收据侧因此新增 `cacheReadTokens` / `cacheWriteTokens` 两列——前缀被自己抖坏时，唯一的症状就是这一列塌到 0 |
| [Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing) · [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | 前者：`clear_tool_uses_20250919` 按 `trigger` / `keep` / `clear_at_least` 清旧工具结果，**清理会作废缓存前缀**，所以 `clear_at_least` 存在的意义是「这次清理值不值回一次缓存重建」。后者：渐进披露（元数据常驻、正文按需读）、「不要给多个选项，给一个默认 + 一条逃生口」、以及**先建评测再写文档** | 前者印证了 §3.7 ⑪ 的判断——压缩/清理的阈值是一笔要算的账，不是越激进越好；本阶段不动阈值正是因为没有可算的样本。后者两条直接照进工具描述的写法：`description` 说自己的事、「用它还是用隔壁那个」进 `Guidelines` 只写一次（渐进披露的同一条道理），以及 R30 的两臂评测**先于**这一轮的描述改写而存在 |

**这四页此前没读，是一个真实的疏漏，不是「本来就知道」。** §3.2 的 S1–S7 是对着 #547 的
实测数据写的，方向没错；但「什么时候该上延迟加载」「改工具定义要花多少钱」这两个问题，
它一个都没问——而两个答案都是现成的、带数字的。R29 的「先查别人」如果只查框架不查**协议方
的工具文档**，漏掉的正是这一类。

---

## 0. 先说清楚：这份方案在解决哪个真实摩擦，以及为什么是「重做」而不是「修」

### 0.1 摩擦（用户自己撞到的，不是我们推测的）

用户在打包版里做了一件最普通的事——**「从原稿重拆 10 镜」**。屏幕上发生的是：

1. Nomi 连续 6 次调同一个工具、6 次被自己拒收；
2. 每次拒收之间它写一段话解释自己在干嘛，于是多了 6 段自言自语；
3. 面板把 6 段文字**全堆在上面**、7 条红收据**全堆在下面**——他读到「我来拆镜头」，往下翻先看见 7 条失败，再往下才看到「我遇到了问题」；
4. 一次网络抖动 = 整轮白等重发；
5. 「花费」「推理」两行永远是空的。

**要权衡的那一个东西**：这五件事看起来是五个 bug，但它们共用一个形状——**我们把 pi（一个完整的 agent 运行时）当成一个「发请求、收字符串」的 HTTP 客户端在用**，然后在旁边手写了一整套 pi 已经有的东西。所以真正的取舍不是「修哪几个 bug」，而是——

> **是继续在一条形状错了的管道上打补丁（每个补丁都便宜，但补丁只能贴在管道外面，管道里没有的东西补丁变不出来），还是把管道换成上游本来就给我们的那根（贵，一次性，但从此每个新功能都有地方落）。**

用户已经选了后者。本文回答的是「换成什么、怎么换、换完怎么证明它对了」。

### 0.2 一条推翻上游前提的实核（必须先说，它决定整份方案的形状）

#546 §1.5 写了一条明确警告：「**不要**建议直接换用 pi 的 `AgentHarness`——在锁定的 0.84.3 里它是个空壳」。

**这条对 0.84.3 完全正确，对今天不正确。** 我拉两个版本的 tarball 逐字比对：

| | `pi-agent-core@0.84.3`（仓库锁定的） | `pi-agent-core@0.85.1`（2026-09-05 发布，npm latest） |
|---|---|---|
| `dist/harness/agent-harness.js` | **7 883 字节**，`HarnessNotImplemented` 出现 **5** 次 = 全部方法抛异常 | **558 字节**，是一个 barrel（`AgentHarness = { create: createAgentHarness }`），`HarnessNotImplemented` **0** 次 |
| `dist/harness/` 子目录 | 无 | 新增 `compaction` `env` `execution` `runtime` `session` `tools` `utils` **七个** |
| `agent-harness.d.ts` | 715 行（类型面完整、实现是空的） | 715 行，**实现补齐** |

**复跑方法**：`npm pack @earendil-works/pi-agent-core@0.84.3` 与 `@0.85.1`，解包后比 `dist/harness/agent-harness.js` 的字节数与 `HarnessNotImplemented` 计数。已由本方案作者独立执行，非转引。

**为什么这条决定整份方案**：0.85.1 的 `LaneSnapshot`（`dist/harness/agent-harness.d.ts:174-201`）**逐项对应 Nomi 手写的那 52 个文件**：

```ts
interface LaneSnapshot {
  transcript: Entry[]              // ← 有序转录（Nomi 今天没有「顺序」这个概念）
  stats: SessionStats              // ← 跨压缩边界的 token/费用（Nomi 三层各算一遍，都算不出钱）
  operation: null | {
    retry?: { attempt, maxAttempts, nextAttemptAt }   // ← 重试进度（Nomi 把重试整个关了）
    streamingMessage?: AssistantMessage               // ← 正在流的那条【有序段】消息
    runningTools: LaneSnapshotTool[]                  // ← 正在跑的工具（Nomi 渲染层为此手写了第二真相）
  }
  queues: LaneQueuedItem[]         // ← 队列（Nomi 有一套 ProjectAgentQueueItem）
  faulted: boolean
}
```

以及 `accept(request) → OperationAdmissionResult` / `getResult(operationId)` / `drive()`（`:644-646`）——**这就是 Nomi 的 `commands-v1.jsonl` 幂等命令账本**。

**所以「重做」在 R20（造轮子前先过 build-vs-buy 闸）下不是一个偏好，是一个判决**：我们手写了 9 688 行去做上游已经做好的事，而做出来的那份**比上游少了顺序、少了重试、少了钱**。

> ⚠️ **这不等于「明天就换过去」**。0.85.1 发布只有一天、没有生产验证，pi 六个包被 `pnpm.overrides` 硬锁必须一起动。所以它是 **§7 岔路 1**，并且**阶段 0 是一次只产出决策、不产出产品代码的探针**（§6）。

### 0.3 术语先解释（D6：出现陌生概念先说「这是干嘛的、为什么要它」）

- **段 / parts**：模型一轮回复不是一整块文本，而是一串**有顺序**的小块——「说一段话」「想一下」「调一个工具」。pi 原样保留这个顺序；我们在接缝处压平了，压平之后「先说什么后做什么」在系统里**不再存在**（不是没画，是数据里没有）。
- **接缝 / runtimePort**：主进程里把 pi 藏起来的那道门。门外只认识我们自己定义的一组结构。今天这组结构里没有「段」。
- **lane（车道）**：pi 0.85.1 里「一条独立的对话轨」。一个项目可以有几条 lane 并行（比如「主对话」和「后台跑的分镜」），互不干扰。今天 Nomi 用 `threadId` 表达同一件事。
- **transcript（转录）**：这条对话到底发生了什么的**权威流水**。今天 Nomi 有**三份**（pi 快照、宿主 snapshot、浏览器 localStorage），三份的生命周期、信任级别、清除时机全不一样。
- **压缩 / compaction**：对话太长时把前面总结成一段摘要腾出空间。pi 自带，我们在用。
- **steering**：模型跑到一半插一句改方向（「不对，横屏」），不用等它跑完。pi 有，我们**结构性用不了**（每回合开一个全新 session，队列跨不过回合边界）。
- **一次写对率**：模型第一次调工具就把参数写对的比例。它直接决定用户等多久、烧多少钱。今天 `canvas.write` 是 **0%**。
- **棘轮（ratchet）门岗**：一条 CI 规则，允许存量违规存在但**只减不增**。仓库已有两种：计数式（`check:heavy-path`）和**身份式**（`check:boundaries`，记住每一条违规长什么样，防止「修掉一条、偷加一条」）。

---

## 1. 重做边界（D2：约束就是战略）

> 纪律：**每一项给理由与 `file:line`**。「重做」= 删掉重写；「保留并重声明契约」= 代码基本不动，但要把它的契约明确写下来，因为它以后要挂在新地基上。
> 判据只有一条：**这东西是 pi 已经做好的（→ 重做，别再造），还是 pi 明确不做、属于 Nomi 领域的（→ 保留，它是护城河）。**

### 1.1 重做（七项）

| # | 重做什么 | 现在在哪（实核） | 为什么必须重做，而不是修 |
|---|---|---|---|
| **B1** | **运行时接缝** | `electron/harness/runtime/runtimePort.ts`（156 行）：`RuntimeActivityEvent` `:74-80`、`RuntimeTurnResult` `:122-133`（`text: string` + `toolCalls[]`）；`electron/harness/runtime/pi/*.mts` 13 个文件 | **形状本身就是 bug**。pi 给的是 `AssistantMessage.content: (Text\|Thinking\|ToolCall)[]`（`pi-ai/dist/types.d.ts:307-327`）+ 每个事件带 `contentIndex`；我们在这里压成两堆。**改形状 = 重写，不是改字段**。`run.mts:73` 一行 `let text = ''` 就把八步里所有文字连成一根字符串 |
| **B2** | **宿主状态机** | `electron/projectAgentHost/`：**52 个生产文件、9 688 行**（#546 记的是 41，实核为 52）。`projectAgentTurnExecution.ts` 793 行 | **R20 判决**：pi 0.85.1 的 `AgentLane` 逐项覆盖——`accept/getResult/drive`（`agent-harness.d.ts:644-646`）= 命令账本与幂等；`queues`（`:196`）= 队列；`watch()`（`:674`）= 快照订阅；`transcript`（`:176`）= 转录；`stats`（`:180`）= 用量。我们手写的这份**比上游少了顺序、少了重试、少了钱** |
| **B3** | **转录持久化（三份 → 一份）** | ① pi 快照信封 `snapshot.mts:64`（sha256；#546 记的是 `:56`，实核为 `:64`）+ `contextPaths.ts:17-21`；② 宿主 `snapshot-v1.json` + `commands-v1.jsonl`（`projectAgentRepository.ts:351-357`）；③ 渲染层 localStorage 工具正文（`residentToolProjection.ts:88`） | 同一段对话三份落盘、三种信任级别、三个清除时机。**清浏览器存储 = 历史收据正文静默清空**。三份里没有一份完整，所以「顺序」这件事三份都答不上来 |
| **B4** | **v4 数据通路（不是外观）** | `agentPanelV4Projection.ts`（459 行，`sortedItems()` `:247-263`）、`agentPanelV4PendingTools.ts`（自陈存在理由 = 宿主没有运行中工具记录）、`residentToolProjection.ts`、`projectAgentProjectionStore.ts`（手写 external store） | 这四个里有三个**只因为宿主缺数据才存在**。`LaneSnapshot.runningTools` / `streamingMessage` 一到，它们就是净负担。排序键、三路 join、易失登记表全部消失 |
| **B5** | **内部工具契约的编码与分解** | `electron/harness/tools/`：`agentToolCatalog.ts`（模型面唯一入口）、`modelToolSurfaceManifest.ts:195-208`（两个**字节级相同** 8238 B 的工具）、`canvasDescriptors.ts`（471 行，**零生产 importer**）、`documentDescriptors.ts`（86 行，同）；`electron/shared/agentCapabilities/canvasWrite.ts:143-144` | **真实模型 0/18**（#547 §3.2）。带 `.describe()` 的那份 schema 是死的，活的那份对模型说「shots 是一个由任意对象组成的数组」——25 个字段名一个都没告诉它。`canvasWrite.ts:143-144` 经 `git blame` 确认**自 2026-09-01 未变**，没有任何在途修复动过它 |
| **B6** | **Agent IPC 通道** | `projectAgentIpc.ts:39-48`（7 个通道）；渲染层在 `projectAgentTurnCommands.ts:88-167` **铸造宿主的规范记录**（thread / turn / item / `executionToken` / `contextRef`）送过桥 | #546 V10：宿主自有记录的**身份生成在桥的不可信一侧**。新通路只发 `OperationRequest`（pi 官方形状，`agent-harness.d.ts:48-77`），身份由主进程铸造 |
| **B7** | **三处结构性关闭 + 三层步数上限 + 价格清零** | 重试 `session.mts:32`（`retry:{enabled:false, provider:{maxRetries:0}}`）+ `run.mts:165`（`maxRetries:0`）；思考 `session.mts:37`（`thinkingLevel:'off'`）+ `model.mts:71`（`reasoning:false`）；价格 `model.mts:72`（`cost:{0,0,0,0}`）；步数三防线 `run.mts:138` / `:151` / `:260` | 每条关掉的理由单看都成立，**但没有一条后面跟着「那这件事现在谁负责」**。第三条步数防线会把「刚好到上限的正常收尾」报成失败给用户看（#546 V9：防线可以三层，**只有一层有权改变用户看到的结论**） |

**同批清掉的死码**（P1 欠账，实核确认四个都零生产 importer）：`canvasDescriptors.ts` 471 行（3 个测试 importer；`src/workbench/generationCanvas/agent/gate.ts:54` 注释自陈「已不认它」）、`documentDescriptors.ts` 86 行、`agentChatV2Ipc.ts` 277 行（`projectAgentCutoverStructure.test.ts:40` 已断言 main.ts **不**含它）、`nomiSkillResources.mts` 167 行。
**前提**：`canvasDescriptors.ts` 里那份带 `.describe()` 的 shot/anchor schema **是资产不是垃圾**，必须先迁到活契约（§3）再删——否则是删资产。

**`skill.write`（用户已定：删，记远期）**：`author_skill` 在死文件 `documentDescriptors.ts` 里，`agentChatPolicy.ts:85-86` 那条找它的分支恒 `undefined`。净效果是这条能力**从任何入口都够不着**，且 `creation-chat` 实际只有一个只读工具。随死码一起删，远期项登记进 §6 附表。理由：**一条够不着的能力不是能力，是一条会让下一个读代码的人误判现状的假线索**；要恢复它需要先设计「Agent 写的技能怎么被用户看到、审批、撤销」，那是一件独立的活。

### 1.2 保留并重声明契约（七项）

| # | 保留什么 | 现在在哪（实核） | 为什么保留 |
|---|---|---|---|
| **K1** | **能力注册表的领域语义** | `electron/shared/agentCapabilities/registry.ts`（127 行，**22 个能力契约** `:37-59`；`aliasEntriesFor()` `:65-73` 按 surface 派生 `{contract, surface, alias}`） | **pi 完全不知道「画布」「分镜」「时间轴」是什么。** 这是 Nomi 的护城河（D2）。内外双别名的**声明式**做法是对的，保留。只换两样：schema 的编码（§7 岔路 3）与工具的分解方式（§3） |
| **K2** | **审批 / 提案 / 权限三档 / 队列的产品语义** | 三档 `projectAgentContracts.ts:47`（`["step","safe-auto","project"]`）+ 花费轴 `:51`（`["confirm","within-budget"]`）+ 默认 `:60-63`（`safe-auto`/`confirm`）；判定在 `projectAgentExecutionPolicy.ts:27`（风险）与 `:78`（安全复用）；协调在 `projectAgentExecutionCoordinator.ts:433` | **pi 官方明说它不做审批**（`pi.dev/docs/latest/security`：无内置工具审批、无内置沙箱，只有管「加不加载项目本地配置」的 project trust）。所以这不是「我们重造了 pi 的轮子」，**是 pi 明确留给宿主的活**。改的只是**挂载点**：从宿主自己的状态机搬到 pi 的 `before_tool` 钩子（`agent-harness.d.ts:550-562`，返回 `{block:{reason}}`，`reason` 直接成为模型看到的正文）。⚠️ 注意 `agentChatPolicy.ts:64-70` **不是**执行点，它只是把渲染层可能夹带的 `approvalPolicy` 剥掉——纵深防御，保留 |
| **K3** | **MCP 对外 dispatcher** | `capabilityCore/dispatcher.ts`（800 行；可行动错误块 `:557-565`：未知 operation 抛 `RpcError` 带 `nextAction: Use one of: …`） | **#547 §2.2⑤ 说它已经做对了**：同一个仓库，外部 MCP 客户端拿到可行动错误，我们自己的 Agent 拿到一个错误码。保留它，并让**内部路径从同一个源派生**（§3）。⚠️ `mcpCapabilityProjection.ts:151-153`（511 行）的「刻意有损广播」注释要作为**债**登记：外部宿主看到的契约比实际执行的松 |
| **K4** | **生产运行子系统** | `electron/productionRun/`（**58 个生产文件**）；owner 是工厂 `productionRunService.ts:81` `createProductionRunService()`（无 `class ProductionService`） | 与 Agent 运行时**正交**。它有自己的生命周期（跑几十分钟、跨重启、花真钱）。新转录**按 id 引用它，永不复制它的状态** |
| **K5** | **时间轴操作** | 5 个生产文件散在 3 个目录：`capabilityCore/{mcpTimelineConfirmation,timelineTransportAdapters}.ts`、`shared/agentCapabilities/{timelineRead,timelineWrite}.ts`、`video/shotTimeline.ts` | 同 K4：领域实现，与运行时正交。**唯一要动的是它的工具分解**（16 个内部工具 vs MCP 1 个，§3） |
| **K6** | **v4 面板组件 + 57 张视觉基线** | `src/workbench/ai/v4/*`；基线 `tests/ux/design-lab/__baselines__/agent-panel-v4/` **实核正好 57 个 PNG**；门岗 `check:design-lab` → `scripts/check-design-lab.mjs`（package.json:179） | 设计已拍板（`docs/design/2026-09-06-agent-panel-v4.md`，用户原话「画布的设计没有问题」）。**8 个积木一个都不改长相**——它们只是终于按发生顺序出现。57 张基线在重做期间**升格为回归网**（§4.3） |
| **K7** | **模型目录领域** | `electron/catalog/`（254 文件）；Agent 文本模型清单 `apimartTexts.ts:54-62`（注释自陈来自 2026-08-21 一次手动探测） | 领域数据保留，但按用户已定的第①条**加两件**：带鉴权的 `/v1/models` 探测（不是抓 docs 页——文档页在 API 退役后还挂着，读起来就是「还活着」）、退役 id **直接下架**（不是只降 `legacy` 分层；今天 `seedBuiltins.ts:578-580` 已把三个 DeepSeek id 标 legacy，而 legacy **只改显示分层，不下架不禁用**） |

### 1.3 一条不对等，明确保留

内部 agent **永远不能**自己开付费闸和启动付费生成（`modelToolSurfaceManifest.ts:236-240`，另有断言防止泄漏进模型面）。这是**有意的信任边界，不是缺口**。

重做后写法升级一档，学 Claude Code 的做法（调研 §2.3「Actions no mode auto-approves」）：从「让它够不着」改成「**让它够得着但永远批不动**」——即这两个工具仍不投影给内部模型，但审批层多一条**独立于权限档位**的硬清单，任何档位（包括未来的「全自动」）都批不动它。理由：以后真要给 Agent 开这个能力时，不用重做安全模型。

---

## 2. 目标架构

### 2.1 分层图（每层：唯一真相源 · 唯一 owner 文件）

```
┌─ ① 面板组件 ────────────────────────────────────────────────────────┐
│  src/workbench/ai/v4/*                                【不动·K6】    │
│  真相源：无（纯渲染，吃 view model）                                  │
│  owner：现有组件文件；57 张基线是它的合同                             │
└──────────────────────────────────────────────────────────────────────┘
                              ▲ view model
┌─ ② 视图投影（新建） ─────────────────────────────────────────────────┐
│  src/workbench/ai/lane/laneViewModel.ts               【唯一 owner】  │
│  真相源：③ 推来的一份 LaneSnapshot                                    │
│  硬规则：不排序（顺序已在 transcript 里）· 不 join 第二真相 ·          │
│          不缓存正文 · 纯函数                                          │
│  → 删掉：agentPanelV4Projection.sortedItems()、PendingTools、         │
│          residentToolProjection（B4）                                 │
└──────────────────────────────────────────────────────────────────────┘
                              ▲ LaneSnapshot / LaneWatchEvent
┌─ ③ 渲染层订阅（新建） ───────────────────────────────────────────────┐
│  src/workbench/ai/lane/laneClient.ts                  【唯一 owner】  │
│  真相源：主进程推来的快照；本层零状态机                                │
│  草稿/附件/选中 chip 仍住 workbenchStore —— 那是**用户输入**，         │
│  不是转录，两者永不混                                                  │
└──────────────────────────────────────────────────────────────────────┘
                              ▲ IPC
┌─ ④ IPC（重建 B6） ───────────────────────────────────────────────────┐
│  electron/agentLane/laneIpc.ts                        【唯一 owner】  │
│  两个通道：snapshot(push) · command(req/res)                          │
│  渲染层**不再铸造宿主记录**：只发 pi 的 OperationRequest              │
│  （agent-harness.d.ts:48-77）；身份在主进程铸造                        │
└──────────────────────────────────────────────────────────────────────┘
┌─ ⑤ Lane 宿主（新建·薄） ─────────────────────────────────────────────┐
│  electron/agentLane/laneHost.ts                       【唯一 owner】  │
│  真相源：⑥ 的 AgentLane（它自己不存任何转录）                          │
│  职责三件，仅此三件：                                                  │
│   a. lane 生命周期（项目 ↔ lane 映射、打开/关闭）                      │
│   b. 把 Nomi 的审批/花费闸挂到 pi 的 before_tool 钩子（K2）            │
│   c. 把 Nomi 领域记录以 appendCustomEntry 放进**同一条** transcript    │
│      （审批卡/任务卡/失败卡各一个 customType + entryProjectors）       │
│  它**不存转录 · 不排序 · 不重试 · 不算钱**——四条都是 ⑥ 的活           │
└──────────────────────────────────────────────────────────────────────┘
┌─ ⑥ pi 运行时（上游） ────────────────────────────────────────────────┐
│  @earendil-works/pi-agent-core · AgentHarness / AgentLane            │
│  真相源：lane transcript（Entry[]）+ LaneSnapshot                     │
│  它负责：顺序 · 流式 · 队列/steering · 压缩 · 重试退避 ·               │
│          会话持久化与分支 · usage/cost 汇总                            │
└──────────────────────────────────────────────────────────────────────┘
┌─ ⑦ 工具投影（新建） ─────────────────────────────────────────────────┐
│  electron/agentLane/toolProjection.ts                 【唯一 owner】  │
│  真相源：⑧ 的能力契约。本层只做「契约 → 模型可见工具」的派生           │
│  **内部 pi 工具面与 MCP tools/list 是同一个函数的两个 profile**        │
│  差异只允许来自声明：MCP 必带 leaseHandle；内部永不投影付费闸           │
└──────────────────────────────────────────────────────────────────────┘
┌─ ⑧ 能力契约（保留 K1） ──────────────────────────────────────────────┐
│  electron/shared/agentCapabilities/*                  【唯一 owner】  │
│  真相源：22 个能力的领域语义 + 别名 + 风险/权限元数据                  │
└──────────────────────────────────────────────────────────────────────┘
┌─ ⑨ 领域实现（保留 K3/K4/K5） ────────────────────────────────────────┐
│  capabilityCore/* · productionRun/*(58) · timeline(5) · canvas       │
│  真相源：各自的领域存储                                                │
│  与转录**按 id join，永不复制**                                        │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 三条纵向不变量（每条配一条机器判据）

> 今天的病根是「每一层都在自己那层做了合理的事，没有人负责纵向不变量」。所以不变量必须**有 owner、有门岗**，不能只写进文档。

| # | 不变量 | 一句话 | 门岗 |
|---|---|---|---|
| **I1** | **顺序只有一个来源** | 一个回合里「谁先谁后」= lane transcript 的条目顺序。**任何层不得再排序** | `check:pi-boundary` 规则 O1 |
| **I2** | **转录只有一份落盘** | agent 转录的持久化只有一个写入点 | 规则 O2 |
| **I3** | **账只有一个算点** | token → 钱只在 pi 的 `calculateCost` 算一次 | 规则 O3 |

### 2.3 四条实核事实，落地时会咬人

1. **价格单位是「每百万 token 美元」，不是每 token。** `calculateCost` 实现是 `(rates.input / 1000000) * usage.input`（`node_modules/@earendil-works/pi-ai/dist/models.js:539-543`）。#546 后端评审那条提醒是对的：Nomi catalog 的 `pricing` 单位必须对齐，**差一次就是三个数量级**。（本方案作者读实现确认；一份并行调研把它记成「每 token」，以实现为准。）
2. **`reasoning:false` 让思考在类型层不可能发生。** `getSupportedThinkingLevels(model)` 在 `model.reasoning === false` 时**只返回 `["off"]`**（`models.js:547-549`）。所以面板上的档位选择器必须由 `getSupportedThinkingLevels` **derive**（P4 通用第一 + 随输入 derive 不 hardcode），不是硬编码三档；`thinkingLevelMap` 里值为 `null` 的档位是「这个模型不支持」，要在 UI 上不可选而不是报错。
3. **pi 的工具 schema 是 TypeBox（`TSchema`），不是 zod。** `Tool<TParameters extends TSchema>`（`pi-ai/dist/types.d.ts:381-386`）、`AgentTool`（`pi-agent-core/dist/types.d.ts:340-359`）。Nomi 的契约真相源是 zod（62 个文件）。这不是小事——它是 §7 **岔路 3**。
4. **容忍有官方钩子**：`AgentTool.prepareArguments?: (args: unknown) => Static<TParameters>`（`pi-agent-core/dist/types.d.ts:347`，注释自陈「校验前的兼容性捏合」）。今天我们用 `z.preprocess` + `zodToJsonSchema` override，而那个 override 会把该字段的 schema **抹成 `{}`**（`tools.mts:47-49`）——它现在零活跃用户，但陷阱还在，随 B1 一起删。

---

## 3. 模型优先的工具契约规范

> **这一段解决的真实摩擦**：模型第一次就把参数写对的概率，直接决定用户等多久、烧多少钱。今天最贵的那个工具（分镜 24 行）拿到的 schema 是「一个由任意对象组成的数组」，真实成功率 **0%（0/18）**。
> **要权衡的那一个东西**：工具越少，每个工具的参数就越复杂（一个 `operation` 枚举带十几个分支，模型要在参数里做二次选择）；工具越多，模型每次请求要读的 schema 越长（占上下文、占钱、增加选错概率）。#547 的真实数据给出了裁决方向：**出问题的从来不是「工具多」，是「一个工具里塞 9 个分支 + 两个工具字节级相同」**——所有单分支扁平 schema 的工具都是 100%。

### 3.1 命名

- 模型面统一 `nomi_<domain>_<verb>`。今天是混着来的：`nomi_canvas_read`（有前缀）与 `read_timeline` / `load_skill` / `get_media` / `export_timeline`（无前缀）**在同一个工具集里同时出现**（`agentChatPolicy.ts:112-131`）。
- 正则取 pi 运行时正则（`tools.mts:39`）与 Anthropic `^[a-zA-Z0-9_-]{1,64}$` 的**交集**，在**注册表处**校验（不是 session 构造时）。这条直接来自真机教训：`layout.read` 这个带点的别名不合正则 → `createHostTools` 直接抛 → **整个 timeline/production 工具档一次请求都发不出去**，用户只看到「发送失败」。
- **别名不再直接当工具名。** `canvasWrite.ts:485-489` 的三个别名（`pi: set_node_prompt` / `mcp: nomi_canvas_edit` / `ui: nomi_canvas_plan`）被 `modelToolSurfaceManifest` 当成**两个独立工具**发给了同一个模型——这是 0/18 的直接成因之一（真机序列 `plan→edit→edit→edit→plan→edit→plan` = 在两个字节级相同的工具间抛硬币）。

### 3.2 Schema（硬规则，全部可机器判定）

| # | 规则 | 今天违反的实例（已实核） |
|---|---|---|
| S1 | 模型可见 JSON Schema 里不许出现 `{}`、`z.any()`、`z.record(z.unknown())`、无 `items` 的数组 | `canvasWrite.ts:143`（`anchors`）`:144`（`shots`）`:71` `:200` `:202` `:204` `:206` `:221` 共 8 处；`mcpGenerationToolCatalog.ts:33` `references: { type: "array" }` 无 items |
| S2 | 单个工具 `anyOf` ≤ 4 | `nomi_canvas_plan` / `nomi_canvas_edit` 各 **9** 分支 |
| S3 | 无两个模型可见工具的 `inputSchema` 结构相同 | `plan`/`edit`（**字节级**相同 8238 B）、`propose_edit_plan`/`apply_edit_plan`（3882 B ×2）、`read_production_artifact(_content)` |
| S4 | 每个工具描述 ≥ 3 句（说清：干什么 / 什么时候用它而不是隔壁那个 / 不要用它做什么） | 35/35 违反（中位 **87 字符**）。Anthropic 原文：这是「by far the most important factor in tool performance」 |
| S5 | ≥2 分支或 ≥10 字段的工具必须带 ≥1 个 schema-valid 示例（**写进 description**，不用 Anthropic 专有的 `input_examples`——我们要跨供应商） | **0/35** 带示例 |
| S6 | 全部必填字段 + 全部枚举字段带说明；「值必须来自目录」的字段（`modelKey`/`vendor`）给枚举或明写「必须来自 `nomi_*_read` 的返回，不要自己编」 | 23/35 零字段说明；真机实测模型给 `modelKey` 编了一个 `"seedance"`（`canvasWrite.ts:43` 是裸 `z.string()`，无枚举无说明） |
| S7 | 任一 profile ≤ **12** 工具、schema 总量 ≤ **4 000 token** | production profile **30 个 / 12 641 token**；storyboard 6 个但两个重复工具独占 76% |

### 3.3 错误契约（模型必须能自纠）

**今天的机制**（真机抓到的、模型真正收到的那段文本）：8 行来自 9 个不同分支、互不标记的校验报错，其中**只有 1 行是真的**，而它和 7 行噪音长得一模一样；再往下一层，模型收到的干脆就是错误码字符串本身（`canvasWriteTransportAdapters.ts:69-75`：`message: code`）。

```ts
// 住在 electron/shared/agentCapabilities/，唯一 owner
type ToolFailure = Readonly<{
  code: string            // 闭合词表，供 UI 分档（保留现有词表）
  message: string         // 一句人话：哪里错、期望什么。**门岗断言 message !== code**
  issues?: readonly { path: string; expected: string; receivedType: string }[]
  branch?: string         // union 命中的分支（= 模型给的 operation），只报这一支的错
  allowed?: readonly string[]   // 枚举/operation 的全部合法值
  nextAction: string      // 「把 nodes 直接给数组本体，不要 JSON.stringify」
}>
```

- **回给模型的官方出口**：pi 的 `before_tool` 钩子返回 `{ block: { reason } }`，`reason` 就是模型看到的正文（`agent-harness.d.ts:550-562`）。**不需要自己造通道**。
- **安全边界（硬性）**：`receivedType` 只带**类型名**，绝不回传收到的**值**——用户文稿正文、素材路径都可能在参数里，那是 provenance/隐私边界。今天 pi 那层会把整个 `Received arguments` 原样回给模型，这条随重做一起收口。
- **今天已经做对的那一半**：`dispatcher.ts:557-565`（对外 MCP）已经是这个形状。**内部路径从同一个源派生**，不再各写一份。

### 3.4 容忍（一族，不是一个字段）

**规则**：模型把结构化值序列化成 JSON 字符串，是**跨模型的通用行为**，不是某个模型的毛病（真机 18 次失败 100% 是这一条）。所有模型面入参在**模型能到达的第一层**统一过一次归一化，用 pi 的官方钩子 `prepareArguments`；解开后**在结果里回一句「已按 JSON 字符串解析」**（不静默——静默容忍会让模型学不会）。

**同 commit 删掉现有三处症状级补丁**（P1 + R28：防线建在最早能拦住的那层）：
- `storyboardPlanSchema.ts:72-87` 的半套 preprocess（**只给了 `shots`、没给 `anchors`**，且在渲染层第二道校验里——从模型角度看是死代码）；
- `storyboardLauncher.ts:40` 与 `:80` 两条在提示词里恳求模型别犯这个错的话。**三次恳求都没挡住**，这就是它们该被删的证据。

### 3.5 数量收敛（用 #547 的重复度数据）

| 动作 | 对象 | 依据 |
|---|---|---|
| 合并 | `nomi_canvas_plan` + `nomi_canvas_edit` → 一个 `nomi_canvas_write` | 字节级相同；模型在两者间抖动 |
| 拆分 | `canvas.write` 的 9 个 operation → **3 个语义工具**：`nomi_canvas_write`（节点/边）· `nomi_storyboard_write`（分镜三个）· `nomi_shot_reference_write`（站位/运镜） | 9 分支 `anyOf` 是错误不可归因的直接成因；拆完每个 ≤4 分支（满足 S2） |
| 合并 | `propose_edit_plan` + `apply_edit_plan` → 一个 + `operation: "preview" \| "apply"`；`read_production_artifact(_content)` → 一个 + `include: "meta" \| "content"` | S3 |
| 派生 | 时间轴读：MCP 1 个 / 内部 3 个；媒体查询 1 / 5；导出检查 1 / 2 —— **分解方式从契约派生，不再两边手写** | 收掉 `mcpCapabilityProjection.ts:210/227/261` 三处手写映射 |

**目标**：任一 profile ≤12 工具 / ≤4 000 token（今天 production 30 / 12 641）。

### 3.6 内外同源

```
toolProjection(registry, profile: "internal" | "mcp") → ModelFacingTool[]
```

一个函数、两个 profile。**允许的差异只能来自契约里的声明**：
- MCP 侧每工具必带 `leaseHandle`（显式租约 —— 安全设计，不是历史包袱，保留）；
- 内部侧永不投影 `nomi_operation_gate` / `nomi_operation_execute`（信任边界，§1.3）。

**不允许的差异（今天存在，要消掉）**：广播 schema 弱于执行 schema。今天 `references` 在 MCP 侧无 `items`、在内部侧严格 typed——**外部宿主比内部 agent 拥有更宽松的输入面**，信任方向反了。门岗断言：MCP 广播 schema 必须能拒绝所有 zod 会拒绝的输入。

### 3.7 阶段 2 评审检查表（七维，逐条标已满足 / 登记）

> 这七条不是新规则，是**§3.1–3.6 写完之后才发现还没问的问题**。判据全部对着 Anthropic
> 官方工具文档与 pi 的 `dist/*.d.ts` 实核过一遍，出处见「先查别人」的 2026-09-07 补充行。
> 一条只有两种合法状态：**已满足**（有机器判据 + 有阳性对照）或**登记**（写清是谁的票、
> 到哪个阶段前必须销）。「以后注意」不是状态。

| # | 问的是什么 | 阶段 2 状态 | 依据 / 票 |
|---|---|---|---|
| ⑥ | 工具预算，以及**按场景给菜单** | 预算 ✅ · 切菜单 📌 阶段 3 | `LANE_TOOL_BUDGET = 12`，超了直接抛（今天 11 个）。切菜单的机制实核存在：`AgentLane.setActiveTools(names, ctx)` / `getActiveTools`（`pi-agent-core/dist/harness/agent-harness.d.ts:673`）。**但它有代价**——改工具集会让整段前缀作废（`tools → system → messages` 逐级失效），所以「每轮按意图换一批工具」不是省 token，是**每轮买一次缓存重建**。正确用法是按会话/场景切一次。这条写下来，是为了阶段 3 有人想按轮切时先看见账单 |
| ⑦ | 长任务的形态（提交拿 id / 查询 / 取消） | 📌 阶段 3 | lane 今天 11 个工具全是本地状态的读写，最长的一次也同步返回；真正的长任务（生成一张图、一段视频）阶段 3 才进来。**形态不需要新造**：旧通路的 `nomi_get_run` 已经是「提交拿 id → 轮询 → 取消」那一套。阶段 3 的硬约束是**不许让工具在 `execute` 里干等**——lane 工具是 `executionMode: 'sequential'`，一个干等的工具会把整条 lane 的工具锁占住，症状是「Agent 卡住了」而不是「在等生成」 |
| ⑧ | 模型怎么指代画布上的对象 | ✅ 已满足 | **id-only + 读后写**。`nodeId` / `sourceClientId` / `shotClientId` 全是 id；`CANVAS_GUIDELINES` 前两条把「先读再写、绝不编 id」写成整族只花一次 token 的纪律；`nomi_canvas_read` 的描述第三句明说「这里返回的 node id 就是要填进 `nodeId` / `sourceClientId` / `targetClientId` 的那个字符串」。**一处刻意的例外**：分镜的 `anchorIds` 是语义绑定（角色/场景/道具/风格），不是画布节点 id，它由同一次调用里的 `anchors[]` 定义——这条写在 `nomi_storyboard_write` 的描述里。**明着标不做的**：不提供按名字的模糊解析（`resolveByName` 之类）。重名时它只能猜，而猜错的代价是改错了用户的稿子，且回执长得和成功一模一样 |
| ⑨ | 每个工具**自己声明**副作用（花钱 / 可逆 / 审批档） | ✅ 本 PR 落地 | `LaneToolSpec.effects` 成为**必填**字段（`mutates` / `billable` / `reversal`）。这不是登记表，是编译器闸：加一个工具而不说清它花不花钱、可不可逆，**代码编译不过**（R28）。派生点唯一——pi 的 `replay` 从 `mutates` 派生；上一版对**每一个**工具硬写 `'never'`，包括 5 个纯读的，那不会报错，只会让冷恢复白丢掉本来能自动补上的那次读。装配期两条不变量（改状态 ⟺ 说得出怎么收回；花钱必然改状态）各带一个阳性对照。⏸ **审批档不在本阶段**：闸今天由宿主经 `OpenLaneOptions.gate` 传入、面板还没接，阶段 3 闸落地时由 `effects` 供档，**不新增第二处声明** |
| ⑩ | 工具的版本与退役 | 📌 = G-06，阶段 4 前必补 | 这里要说清一条**我们和官方走法不同**的地方：Anthropic 的做法是给工具 `type` 挂日期后缀、新旧版本长期并存（tool-reference「Tool versioning」）。那条路**我们不能抄**——两个版本并存就是两份真相源（P1 禁止），而且我们的 schema 是从一个生成点派生的，压根派生不出「旧版本」。我们的等价物是**名字稳定 + `prepareArguments` 折旧旧形状**（pi 给这个钩子的官方首要用途正是它）。今天 lane 没有历史会话，所以没有落点；阶段 4 迁旧转录之前必须补，否则迁进来的旧 tool call 一律校验失败 |
| ⑪ | 缓存友好（前缀合同 / 收据 / 压缩阈值） | 前缀 ✅ · 收据 ✅ 本 PR · 阈值 📌 阶段 3 | **前缀是合同**：目录按固定顺序拼，系统提示词只有 `composeLaneSystemPrompt` 一个拼接点。官方把代价写死了——改工具定义作废整段缓存（tools + system + messages）。**收据**：`LaneUsage` 新增 `cacheReadTokens` / `cacheWriteTokens`（pi 的 `Usage.cacheRead` / `cacheWrite` 原样带出），面板多一列 `cache`。为什么必须单独一列而不是并进 `input`：缓存命中的 token 便宜一个数量级，合成一个数就把「这一轮贵在哪」抹掉了；更要紧的是，它是**唯一能告诉我们前缀被自己抖坏的信号**——症状是这一列塌到 0、`input` 猛涨。**压缩阈值**：pi 的 `shouldCompact` 判的是 `contextTokens > contextWindow - reserveTokens`，而 `calculateContextTokens` 把 `cacheRead` 也算进去（`compaction.js:82`）——**缓存命中的前缀同样把你推向压缩**。在我们的形状下这偏保守：工具定义与系统提示词是恒定前缀，压缩它们一个 token 都省不下来，该按「前缀之后的正文」定阈值。本阶段**不改**：lane 还没有长到会触发压缩的会话，此刻改就是在没量过的地方调一个数（voodoo constant）。阶段 3 有真实长会话时带数据改 |
| ⑫ | 延迟加载的闸门（什么时候才开） | ✅ 已判：不开，且闸门写死 | 官方判据：**≥10 个工具，或工具定义 >10k token**，或工具选择准确率随规模下降时才上 tool search；同一页也说准确率通常要到 **30–50 个工具**之后才开始掉（tool-search-tool「When to use tool search」）。lane 今天 **11 个工具 / 20 272 字节 ≈ 5k token**——工具数刚过 10，token 只到闸门的一半，而 #547 的数据说我们的失败模式**从来不是选错工具**。所以不开。pi 的等价物是 `addedToolNames` + `splitDeferredTools`（把新解锁的排到请求靠后以保住前缀缓存，`pi-ai/dist/utils/deferred-tools.js:3-34`）；官方那边是 `defer_loading`，它在算缓存键**之前**就被从前缀里摘掉，所以加延迟工具不破缓存。触发条件写死在 `laneToolCatalog.ts`：**工具数超预算或 schema 总量 >10k token，先开延迟加载，不许抬预算** |

**七维的净产出**：两条从「登记」变成了「编译器/机器判据」（⑨ 的必填 `effects`、⑪ 的缓存两列），
三条判完是**明确不做**并写下了触发条件（⑥ 的按轮切菜单、⑧ 的模糊解析、⑫ 的延迟加载），
两条挂到既有的票上（⑦ → 阶段 3 生成类工具，⑩ → G-06 阶段 4）。**没有一条落进「以后注意」。**

---

## 4. 迁移与切换

### 4.1 开发期并存的边界（P1 的正确读法）

新模块住 `electron/agentLane/` + `src/workbench/ai/lane/`，**对用户不可达**：不注册 IPC、无任何入口。

> **为什么这不算「并行版」**：P1 禁的是「同一件事有两条用户走得到的路」。开发期新通路用户走不到，所以用户只有一条路。**判据必须是机器判据，不是承诺**：切换 PR 之前，新目录的任何符号不得出现在 `main.ts` 的 IPC 注册表里——这条做成 `check:pi-boundary` 的规则 O6，和 `projectAgentCutoverStructure.test.ts:40` 已有的「main.ts 不含 `registerAgentChatV2Ipc`」是同一手法（那条断言证明这个手法在本仓行得通）。

### 4.2 切换 PR 同 commit 删旧（不留 feature flag、不留 fallback、不留逃生口）

一个**原子 PR**，删除清单：
- `electron/projectAgentHost/` 52 个生产文件 / 9 688 行
- `electron/harness/runtime/` 旧 seam（`runtimePort.ts` + `pi/*.mts` 13 文件）
- `agentPanelV4Projection.ts`(459) + `agentPanelV4PendingTools.ts` + `residentToolProjection.ts` + `projectAgentProjectionStore.ts`
- `projectAgentIpc.ts`
- 四个死文件（`canvasDescriptors` 471 + `documentDescriptors` 86 + `agentChatV2Ipc` 277 + `nomiSkillResources` 167）

**不许拆成半截合入**——半截就是并行版。

### 4.3 旧数据迁移（诚实分档：能读的迁，不能读的明说）

| 旧数据 | 能不能迁 | 怎么办 |
|---|---|---|
| pi 快照信封 `<project>/.nomi/agent-thread-context-v1.json`（`snapshot.mts:64`） | ✅ **能，且优先** | 它本来就是 pi session 的导出，schema **已完整保留有序的 text/thinking/toolCall 段**（`snapshotSchema.mts:18-26`）。**这是唯一一份含真实顺序的旧数据**。与宿主 items 冲突时以它为准——它是模型真正看过的 |
| 宿主 `snapshot-v1.json` 的 items | ⚠️ **能迁内容，迁不回顺序** | 按 items 数组顺序（= 历史写入顺序）线性回填。**绝不按 `createdAt` 重排**：实核数据里同回合 8 条工具的 `createdAt` 去重后**只有 1 个值**，助手条目比它们早 107 秒——按它重排会**造出一个假顺序** |
| 宿主 `commands-v1.jsonl` 命令账本 | ❌ **不迁** | 它是旧状态机的重放输入；新运行时有自己的 `operationId` 受理（`accept`/`getResult`）。归档保留一个版本周期后删 |
| 渲染层 localStorage 工具正文 | ❌ **不迁** | 它本来就是易失的（清浏览器存储就没了）。新通路里工具正文在 transcript 里 |
| 审批卡 / 任务卡 / 失败卡条目 | ✅ **能** | 各一个 `customType`，用 `appendCustomEntry` 写进新 transcript，配 `entryProjectors`（`AgentHarnessOptions.entryProjectors`，`agent-harness.d.ts:634`）。这正是 pi 官方给宿主放自己数据的姿势 |

**明着标（D4 诚实交付）**：迁移来的历史对话，顺序是**「写入顺序」而不是「真实发生顺序」**——旧数据里真实顺序已经不存在了，任何声称能恢复的做法都是编。面板上给迁移来的历史打一个「旧格式」标记。

### 4.4 实验室：57 张基线一张不动，作为回归网

- v4 面板改由**新投影**驱动；夹具从「手写宿主 items」改成「手写 `LaneSnapshot`」。
- **每个夹具必须投出与今天逐像素相同的 view model。** 基线红 = 新通路投错了，**不是「基线该更新」**。
- ⚠️ 排错顺序（踩过的坑）：报「基线不符」先确认不是 5197 端口撞了——docs-only 分支上曾出现 30 张全红，全是 `ERR_CONNECTION_REFUSED`，而门岗文案会诱导人去更新基线，那是把连接失败钉成新基线。
- ⚠️ `check:design-lab` 是**静态检查**，它不执行走查；旧截图不自动清。判断证据新鲜度要比 mtime。

---

## 5. 验收门（不可省，每条给判据 + 怎么证）

| # | 门 | 判据 | 怎么证 |
|---|---|---|---|
| **G1** | **真实环境闭环** | MiniMax H3 一条 **1–2 分钟短片**，真项目 / 真素材 / 真额度，跑通 创作 → 分镜 → 画布 → 生成 → 时间轴 → 导出 | R13 走查法：截图**人眼判断** + 情绪摩擦日志。判据不是「没报错」，是「一屏之内能读出『它说了什么 → 它做了什么 → 结果如何』这条线」。R16：过程中冒出的体验/UI/产品感问题**全修掉**才算完成 |
| **G2** | **工具一次写对率** | `canvas.write` 从 **0/18** 到 **≥90%**；「建 2 个镜头卡」**3/3** 回合全绿；「从原稿拆 8 镜」**3/3** 调到分镜工具（现状 0/3） | 用 #547 §3.2 **同一套**任务复测：5 任务 × 3 次、同模型（DeepSeek V4 Flash）、同隔离 profile（`prepareIsolation`）、介入槽一律拒绝、只花文本 token。改前基线就是那张表 |
| **G3** | **冷重启顺序** | 关 app → 重开 → 打开同一条历史对话，面板顺序与 lane transcript 的 `Entry[]` **下标顺序逐项一致** | **机器断言**，不是人眼。⚠️ 今天这条**结构上做不到**（易失登记表冷重启就空）——**它是重做存在的理由**，也是唯一一条「修不出来、只能重做」的门 |
| **G4** | **一次 429 不死** | loopback 夹具在第 N 次请求注入 429，断言：① 自动重试（pi `RetryPolicy`）② 面板出现「正在重试 2/3」③ 最终成功 ④ 转录里留有重试记录 | 事件源 `retry_scheduled` / `retry_start` / `retry_end`；快照字段 `LaneSnapshot.operation.retry{attempt,maxAttempts,nextAttemptAt}`。⚠️ 后端提醒：先确认 `observeNativeStream` 看门狗（90s 首响应 / 120s 空闲）与 pi 重试**不会互相打架**——两套超时叠在一起是典型的「单跑绿、真实网络下翻红」 |
| **G5** | **花费/上下文/推理三行有真数字** | 三个数都 > 0，且花费与供应商账单**同量级** | 花费走 pi `calculateCost`（**单位对齐 per-million**，§2.3-1）；上下文走 `LaneSnapshot.stats` + `contextWindow`；推理走 `Usage.reasoning`。**用户已定第②条**：思考打开、面板上让用户选档位、默认按能力分档（`storyboard`/`production` 开，`creation-chat`/`canvas-refine` 保持 off）、**旁注推理计费**。档位由 `getSupportedThinkingLevels` derive。**任一档位下思考确实关闭时，那一行不渲染**（D4：不给用户看永远空的行） |
| **G6** | **真机教训做成零额度判据（R28）** | 五条，各带阳性对照（把修复前的代码喂进去**必须红**，R17） | ① 模型可见字符串（工具名/operation 枚举/别名）在**注册表处**过运行时正则 ← `layout.read` 整档发不出去 ② `useSyncExternalStore` 快照 getter 引用稳定 ← 有待决工具时整页「工作台加载失败」（仓库有 6 个手写 store） ③ 带传输标记的字符串，编码/剥离函数同文件成对且互为单测 ← base64 原样印给用户 ④ 审批七态 join 里 `denied` 与 `approved` 不得折进同一态 ← 点「不要」显示「已确认」 ⑤ 滚动容器不出现在没有滚动条的地方 ← 面板被永久裁 17px |
| **G7** | **两条新门岗自身归零** | `check:pi-boundary` 与 `check:model-schema` 的棘轮基线，**到切换 PR 时必须归零** | §8。基线不归零 = 重做没做完 |
| **G8** | **五门 + 视觉基线** | contracts 全绿 + 按 R22 选定的验证档；**57 张基线一张不动** | `check:design-lab`。⚠️ 多步回合的走查截图**会变**（顺序变了），这要在 PR 里明说，别让人以为「基线没动 = 没影响」 |

---

## 6. 分阶段与体量

> **总纪律**：每阶段一个分支一个 PR。不做「一个 PR 收口全部」——接线计划已经算过账，那样做当天就会红掉每日闸。
> **体量**是数量级估计，不是承诺。

### 阶段 0 · 探针（**不产出产品代码，只产出决策**）

- **范围**：在一个独立 worktree 里验四件事——① pi 0.85.1 在 Nomi 的 **CJS 主进程**里能不能起（六个包一起动，`pnpm.overrides` 硬锁）；② `AgentHarnessOptions.session` 能否注入自定义存储位置（Nomi 要写 `<project>/.nomi/`，pi 默认写 `~/.pi/agent/sessions/`）；③ `before_tool` 的 `{block:{reason}}` 是否真的把 `reason` 送到模型；④ `LaneSnapshot` 的 `streamingMessage` / `runningTools` 实测形状。
- **不动项**：一切产品代码。
- **回滚**：删分支。
- **验收门**：一份带实跑证据的探针报告 + **§7 岔路 1 的拍板**。四件里任一不通过 → 走岔路 1 的方案 B（留 0.84.3 + `createAgentSession`），方案主体不变、⑤⑥ 两层的分工变。
- **体量**：0 产品文件。

### 阶段 1 · 垂直切片（walking skeleton）

- **范围**：一条能力端到端跑通新通路——选 `document.read` + `document.write`（#547 实测这两个今天就是 **100%**，所以任何失败都归因于新通路而不是模型）。链路：pi lane → laneHost → laneIpc → laneClient → laneViewModel → **现有 v4 组件**。
- **不动项**：旧通路照常服务用户；v4 组件一行不改；57 张基线不动。
- **回滚**：新目录整体删除（用户走不到，零影响）。
- **验收门**：G3（冷重启顺序，用这条能力证）+ G8。
- **体量**：新增 ~10 文件 / ~1 200 行；删 0；1 PR。

### 阶段 2 · 工具契约（§3）

- **范围**：`toolProjection` + 错误契约 + `prepareArguments` 容忍 + 工具合并/拆分/描述/示例/枚举 + 迁移 `canvasDescriptors.ts` 的 `.describe()` 资产。
- **不动项**：能力的 id / 别名 / 权限链；transport adapter；MCP 执行边界；`tools/list` 的确定性顺序（`agentToolCatalog.ts:31-35` 已合规，是 prompt/KV-cache 合同）。
- **回滚**：`toolProjection` 是新文件，可整体 revert；工具改名会同时动**对外 MCP 面**，PR 描述必须列改名前后对照。
- **验收门**：G2（一次写对率）+ `check:model-schema` 从红到绿。
- **带进来的一条债（§11.7 登记）**：会话的单持有者今天只覆盖**进程内**。把 lane 接到 MCP 对外面之前必须先有**跨进程**的锁——`electron/main.ts:121` 里 MCP stdio 模式刻意不抢单实例锁，所以「GUI + 一个 MCP stdio 进程」同时活着是设计内的，而 [#8852](https://github.com/earendil-works/pi/issues/8852) 的后果是转录损坏、不是报错。
- **体量**：改 `agentCapabilities` ~8 文件；新增 2 文件；删 4 个死文件（1 001 行）+ 3 处症状级补丁；2 PR。

### 阶段 3 · 闸与三行

- **范围**：审批/花费闸挂到 `before_tool`；队列/steering 接 pi 的 `steer`/`followUp`/`cancelQueued`（面板上第一次有入口）；花费/上下文/推理三行接真数字；重试打开 + 面板显示重试进度；三层步数上限收成一层（删掉会说谎的第三条）。
- **不动项**：三档权限的**产品语义**与默认值（`safe-auto`/`confirm`）；付费闸的信任边界（§1.3）。
- **回滚**：各条独立 revert。
- **验收门**：G4（429 不死）+ G5（三行真数字）+ G6（五条零额度判据）。
- **体量**：新增 ~6 文件；1–2 PR。

### 阶段 4 · 切换（**删旧**）

- **范围**：v4 面板改吃新投影；**同 PR 删旧**（§4.2 清单，~11 000 行）；旧数据迁移（§4.3）。
- **不动项**：v4 组件外观；57 张基线。
- **回滚**：revert merge commit（迁移必须连着 revert；新字段可选读、写时必填）。
- **验收门**：**G1（真实闭环）+ G3 + G7（两条门岗基线归零）+ G8**，全部。
- **体量**：删 ~58 文件 / ~11 000 行；改 v4 组件的数据入口；**1 个原子 PR，不许拆半截**。

### 阶段 5 · 内外同源 + 目录新鲜度

- **范围**：MCP 广播 schema 不弱于执行 schema；收掉三处手写映射；**用户已定第①条**——`radar:models` 的 `WATCHED` 加 LLM（今天 `scripts/model-radar.ts:30-33` 明写不含）、改抓**带鉴权的 `/v1/models`** 而不是 docs 页、退役 id **直接下架**（不是只降 legacy 分层）。
- **回滚**：各条独立。
- **验收门**：一条断言「每个能力的 MCP 广播 schema 必须能拒绝所有 zod 会拒绝的输入」；探测需真实 key（额度极小）。
- **体量**：2 PR。

### 6.1 在途分支处置

| 分支 | 实核状态 | 处置 |
|---|---|---|
| `fix/real-env-acceptance-20260906` | **ahead=10, behind=0** | **先合**（用户现在就在撞）。五条修复里 `d065efbd0`（overflow-clip）/ `7e56111c7`（剥传输标记）/ `fb4b156d1`（composer 跑出视口）**在重做后仍然有效**；`799564f91`（宿主丢 error）/ `567a29cb7`（denied 折进 approved）**随 B2/B4 一起死** —— 但**它们的教训升格成 G6 的判据②④**，这才是它们的长期价值 |
| `fix/agent-v4-real-use-20260906` | **ahead=6, behind=8**（6 个 commit，非任务书说的 A–H 八个） | **拆开处理**。可先合（重做后仍有效）：`9fed90d4f` 边界层解 JSON 字符串（**正是 §3.4 的正确落点**，重做时升级成 `prepareArguments`）· `b4c918b72` 同名连调折一行 · `425a29953` 模型弹层每类一行 · `e894d0d19` 分镜主语修正 · `a59cf7daa` 实验室加格。**不再叠**：`4bf23ecac`「上下文环补一手文档的窗口表」——它是 pi 免费给的东西（`Model.contextWindow` + `getContextUsage`）的手写替代品，重做后会**直接撞 `check:pi-boundary` 规则 O3**。但它里面「查不到就不画环、改说『已用 12.3k』」那条**产品规则是对的**（D4），单独保留 |
| `feat/agent-panel-v4-logo-dock-20260906` | 本地分支存在，**未推 origin** | **可合**（纯外观，收起坞 logo 血统）。趁 Dock 文件还没被阶段 4 动 |
| `fix/design-lab-wired-states-20260906` | **ahead=0, behind=4** —— 已合（PR #544） | 已在 main。它把 `sortedItems()` 第二键从 `itemId` 哈希改成宿主数组下标（`agentPanelV4Projection.ts:247-263`，方向正确）；**阶段 4 会把整个函数删掉**（顺序来自 transcript，不再排序）——PR 里要明写这是**净删**，免得下一个人以为排序键还在用 |
| `docs/mature-agent-products-research-20260906`(#549) | **已合入 main（2026-09-07）** | **已并入**，路径 `docs/research/2026-09-06-mature-agent-products.md`。它的 §1.9（0.85.1 harness 实现）与本文 §0.2 是两次独立实核，结论一致 |
| `docs/agent-architecture-review-20260906`(#546) / `docs/agent-tool-layer-audit-20260906`(#547) | docs-only | 随时可合，不阻塞任何人。**它们的渐进方案（`master-plan` / `root-fix`）已于 2026-09-07 标 ⛔ 被本文取代**（含 `docs/plan/INDEX.md` 与 doc-status 标记），两份方案不再并存 |

---

## 7. 只留真岔路的 R3 表（三条）

> 其余全部按 P0 自主推进。这三条各自是「多个分歧巨大的合理解 / 不可逆」，必须用户拍。

### 岔路 1 · pi 版本与接入层

**背后的逻辑（大白话）**：我们要在别人的地基上盖房子。上游前天刚把地基浇好（0.85.1），但混凝土只干了一天；我们锁的还是上一版（0.84.3），那一版的地基**图纸完整、实体是空的**。要么等一等自己先搭个临时架子，要么现在就站上去。

| 方案 | 用户看到 | 代价 |
|---|---|---|
| **A. 升到 0.85.1，用 `AgentHarness` / `AgentLane`** ⭐ | 顺序、重试、队列、花费、崩溃恢复**一次全到位**；面板上第一次能看到「正在重试 2/3」和真实花费 | 六个 pi 包必须一起动（`pnpm.overrides` 硬锁）；0.85.1 只发布一天、**零生产验证**；CJS 主进程兼容性未验（阶段 0 探针要答的第一题） |
| **B. 留 0.84.3，用 `createAgentSession` + `SessionManager`** | 同样能拿到有序段（`message_update` 带 `contentIndex`）与重试；但 lane/命令受理/多轨要**自己写一层薄的** | `AgentHarness` 在 0.84.3 **确认是空壳**（全部方法抛 `HarnessNotImplemented`，本方案实核）；我们要手写 `LaneSnapshot` 里那几个字段——**这正是 R20 要拦的事**，半年后 0.85.x 稳定了还得再拆一次 |
| **C. 把 pi 当子进程，走 RPC/JSON 协议** | 与版本解耦，pi 崩了不带崩主进程 | 多一道序列化边界与一个进程生命周期要管；Nomi 今天不需要这个隔离；审批要的 `ctx.ui` 一问一答变成跨进程往返 |

**推荐 A，但拍板挂在阶段 0 探针之后**：探针四题全过 → A；任一不过 → B（方案主体不变，只是⑤⑥两层的分工变，⑤ 变厚）。**C 明确不选**，除非探针发现 CJS 兼容是死结。
**这条为什么必须用户拍**：它是不可逆取舍（升级后回不去），且赌的是一个发布一天的版本。

> ✅ **2026-09-07 用户拍板：按推荐** —— 取 **A**，但拍板挂在阶段 0 探针之后：探针四题全过才推 `0.85.1`，任一不过退 B。

### 岔路 2 · 转录的真相源放哪

**背后的逻辑**：「这段对话到底发生了什么」现在有三份落盘记录，谁说了算今天没定。重做要往里加「顺序」，就必须先回答加到哪一份。
**⚠️ #546 §3.1 在「渐进修」前提下选了 A（宿主 record）。用户改判重做后，我在这里重新判了一次，结论翻转——理由见下。**

| 方案 | 用户看到 | 代价 |
|---|---|---|
| **A. 宿主 record 唯一（#546 原推荐）** | 冷重启后历史正确；审批/任务卡与文字段在同一条时间线 | **在重做前提下这条的理由消失了**：#546 选 A 的核心论据是「用户可见历史里有一半东西 pi 根本不知道（审批卡/任务卡/失败条）」。但 pi 0.85.1 有 `appendCustomEntry` + `entryProjectors`（`agent-harness.d.ts:634/642`）——**那正是官方给宿主放自己数据的口子**。继续选 A = 明知有官方口子还自己维护一份转录 = 撞 R20 |
| **B. pi lane transcript 唯一 + 宿主领域记录以 custom entry 骑在同一条流上** ⭐ | **顺序天生正确**（不需要任何排序）；与模型看到的历史逐字一致，永不漂移；压缩/分支/`branch_summary`/统计直接白拿 | pi 快照今天不过 IPC，要新建投影通道（本来就要建，B4）；生产运行等长生命周期领域状态**不能**塞进转录（它们跨线程、跨重启活得更久）——**按 id join，不复制**（这是设计约束不是代价） |
| **C. 双真相源 + 同步（今天的事实状态）** | — | **已经在付代价**：同一段助手文字有两处独立推导且互相覆盖（宿主增量 append vs 运行时 `response.text` 整覆盖），reducer 只在两者不一致时 bump 修订号——**分歧被容忍且不可见** |

**推荐 B**。一句话理由：**重做的全部意义就是「不再维护上游已经维护好的东西」；选 A 等于重做完还留着最大的那一件。**
边界写清楚：**agent 转录 = pi lane；领域状态 = 各自领域存储；两者按 id join，永不互相复制。**

> ✅ **2026-09-07 用户拍板：按推荐** —— 取 **B**，转录真相源 = pi lane transcript，宿主领域记录以 custom entry 骑在同一条流上。

### 岔路 3 · 模型可见 schema 的语言

**背后的逻辑**：pi 的工具参数类型是 **TypeBox**（`Tool<TParameters extends TSchema>`，`pi-ai/dist/types.d.ts:381`），Nomi 的契约真相源是 **zod**（62 个文件）。今天的做法是 zod → `zodToJsonSchema` → pi 用 ajv 校验一遍 → 我们再用 zod 校验一遍。**两个校验器 = 那 8 行互不标记的报错**（#547 §2.2③：8 行里只有 1 行是真的）。

| 方案 | 用户看到 | 代价 |
|---|---|---|
| **A. zod 仍是作者写法，模型可见 schema 只有一个生成点，校验只发生一次** ⭐ | 错误可归因（只报命中分支那一支）；契约作者不用学新东西 | 要写一个 zod→TypeBox（或 zod→JSON Schema→TypeBox）的**受控转换器**，且必须门岗保证「转换器没吃掉信息」（`.describe()`、枚举、`min/max` 都要过桥）；`z.preprocess` 那类会抹平 schema 的写法要禁 |
| **B. 模型可见契约原生改写成 TypeBox** | 与 pi 零阻抗，错误直接来自 pi 一层 | 22 个能力契约要重写；zod 仍要留给非模型面校验 → **两套 schema 语言长期并存**，正是我们要消灭的那种重复 |
| **C. 维持两套校验（今天）** | — | 已被真机否定：**0/18** |

**推荐 A**。理由：真正要消灭的不是「zod 还是 TypeBox」，是**「校验发生两次、错误来自两个不认识对方的验证器」**。A 用一个转换器把校验收成一次，且保住 62 个文件的既有投资；B 的收益（零阻抗）买不回重写 22 个契约的代价。
**转换器必须自带门岗**（信息不丢），否则它会变成下一个 `tools.mts:47-49`——一个静默抹平 schema 的 override。

> ✅ **2026-09-07 用户拍板：按推荐** —— 取 **A**，zod 保持作者写法，模型可见 schema 只有**单一生成点**，校验只发生一次。

---

## 8. 重做期间的两条门岗（规则草案 · R17：加规则必须先验它会红）

> 仓库有两种棘轮，选型有讲究（实核）：`check:heavy-path` 是**计数式**（`RULES[]` + `scripts/heavy-path-baseline.json` 的 `{ruleId: count}`）；`check:boundaries` 是**身份式**（`scripts/boundaries-baseline.json` 存每条违规的身份串，`added` 失败、`removed` 也失败）。
> **两条新门岗都取身份式**——因为它们要拦的东西可以「修掉一条、偷加一条」，纯计数拦不住。

### 8.1 `check:pi-boundary` —— pi 已提供的能力，仓库里再出自研版本就红

**它在解决哪个真实摩擦**：我们手写了 9 688 行去做上游已经做好的事，而**没有任何机制在写下去的那一刻拦住**。R20 的 build-vs-buy 闸今天只活在人的记忆里。

规则表（每条：pi 的 owner 符号 + 检测签名 + 今天会不会红）：

| # | pi 已提供 | pi owner（证据） | 检测签名 | **今天会红吗** |
|---|---|---|---|---|
| **O1** | 回合内顺序 | `LaneSnapshot.transcript` / `AssistantMessage.content` | `agentLane` 之外，对 agent item 集合做排序（`.sort(` 且比较键含 `createdAt`/`itemId`/`turnSeq`） | 🔴 **会**：`agentPanelV4Projection.ts:247-263` |
| **O2** | 转录持久化 | `Session` / `SessionManager` | `agentLane` 之外写 agent 转录到盘（`snapshot-v1.json` / `commands-v1.jsonl` / sha256 信封 / localStorage 工具正文） | 🔴 **会**：`projectAgentRepository.ts:351-357`、`snapshot.mts:64`、`residentToolProjection.ts:88`（**3 条身份**） |
| **O3** | 用量→花费换算与上下文窗口 | `calculateCost`（`models.js:527`）、`Model.contextWindow` | 第二处把 token 乘价、或手写 contextWindow 表 | 🔴 **会**：`run.mts:12-32` `nomiUsage()`、`agentUsageStore`、`agentPanelV4Projection.ts:421` 各汇总一遍（**3 条身份**）；`4bf23ecac` 若合入再加一条 |
| **O4** | 队列 / steering | `steer` `followUp` `nextRun` `cancelQueued` `queues` | `agentLane` 之外的 agent 队列状态机 | 🔴 **会**：`projectAgentHost` 的 `ProjectAgentQueueItem` reducer |
| **O5** | 重试与退避 | `RetryPolicy` + `retry_*` 事件 | agent 供应商调用外面手写重试/退避循环 | 🟢 今天不红（我们把重试**整个关了**，没有替代品）。**这条是防复发**：阶段 3 打开 pi 重试后，任何人再手写一个就红 |

- **基线**：`scripts/pi-boundary-baseline.json`，身份式（`{ruleId: [identity…]}`）。
- **纪律**：基线**只减不增**；**到阶段 4 切换 PR 时必须归零**（G7）。基线不归零 = 重做没做完。
- **R17 预验**：规则落地 PR 必须先在 `origin/main` 上跑一次并把上表 🔴 那四条的实际命中数写进 PR 描述——**先绿后红的门岗是装饰品**。

### 8.2 `check:model-schema` —— 模型可见 schema 不许空

**它在解决哪个真实摩擦**：模型给分镜表写 24 行，而它看到的 schema 只说「shots 是一个由任意对象组成的数组」。**真实成功率 0%。**

规则表：

| # | 规则 | **今天会红吗**（已实核） |
|---|---|---|
| **S1** | 模型可见 JSON Schema 不许有 `{}` / `z.any()` / `z.record(z.unknown())` / 无 `items` 的数组 | 🔴 `canvasWrite.ts:71,143,144,200,202,204,206,221`（8 条）+ `mcpGenerationToolCatalog.ts:33`（1 条） |
| **S2** | 单工具 `anyOf` ≤ 4 | 🔴 `nomi_canvas_plan` / `nomi_canvas_edit` 各 9 |
| **S3** | 无两个模型可见工具 `inputSchema` 结构相同 | 🔴 3 组 |
| **S4** | 描述 ≥ 3 句 / ≥120 字符 | 🔴 35/35 |
| **S5** | ≥2 分支或 ≥10 字段的工具带 ≥1 示例 | 🔴 35/35 |
| **S6** | 必填 + 枚举字段有说明；「必须来自目录」的字段给枚举或明写 | 🔴 23/35 |
| **S7** | 任一 profile ≤12 工具 / ≤4 000 token | 🔴 production 30 / 12 641 |
| **S8** | 任一 `ToolFailure` 构造点带 `nextAction` 且 `message !== code` | 🔴 `canvasWriteTransportAdapters.ts:69-75`、`projectAgentExecutionCoordinatorTypes.ts:222-235` |
| **S9** | MCP 广播 schema 不得弱于执行 schema | 🔴 `references` 无 items（外部比内部还松） |

- **基线**：`scripts/model-schema-baseline.json`，身份式（`{ruleId: ["toolName#fieldPath", …]}`）。
- **附一条离线回归**（零额度）：把真机抓到的**真实错误参数**（`docs/audit/attachments/2026-09-06-tool-probe.jsonl` 里那些 `"nodes": "[...]"`）钉成 fixture，断言「归一化后应当通过」+「若仍不通过，错误必须带 `path`/`expected`/`nextAction`」。**这是把本次 bug 变成永久回归测试。**
- **归零时点**：阶段 2 结束（G7）。

### 8.3 一条附带的评测卫生

**不要复活 `tests/ux/_agentProbe.mjs`**：它依赖的 `window.nomiDesktop.agents` 桥**在当前代码里已不存在**（全仓 `cancelChatV2` 只剩测试文件自己），`apimart-text-brain.e2e.mjs` / `staging-reference.e2e.mjs` 已经是**死的付费 e2e**。新评测接现役 `window.nomiDesktop.projectAgent` 通道（`electron/preload.ts:673-712`），并**同 commit 删掉**那两个死 e2e 与死 probe（P1）。这属于「死选择器同时造假红和假绿」那一族。

---

## 9. 六角色评审（R7）

**CTO**
1. 这份方案与 #546 最大的分歧只有一处，但那一处决定一切：#546 在「渐进」前提下推荐**宿主 record 当真相源**，本文在「重做」前提下翻成 **pi lane**。翻转的依据不是偏好，是 0.85.1 的 `appendCustomEntry`/`entryProjectors` 把 #546 选 A 的核心论据（「审批卡 pi 不知道」）消掉了。**这个翻转必须在拍板时被明确看见，不能悄悄发生。**
2. 我最担心的不是改不动，是**阶段 4 那个原子 PR**——~11 000 行删除 + 一次切换。它必须有一条演练：在切换前用 `--dry-run` 跑一次「删了旧的、新的顶不顶得住」的结构测，别等 PR 里才发现某个领域模块偷偷依赖着宿主的某个导出。
3. `check:pi-boundary` 是本方案最有长期价值的一件，它比任何一条修复都值钱：**它把 R20 从人的记忆搬进了 CI**。但它必须先在 main 上验红——先绿后红的门岗是装饰品。

**设计**
1. 有序流修好之后，v4 那 8 个积木**一个都不用改长相**，只是终于按发生顺序出现——这才是设计定稿本来的样子。57 张基线一张不动这条要守住，它是我们唯一能证明「重做没顺手改设计」的东西。
2. G1 不要用断言证，要用**截图人眼看**，判据我给具体的：一屏之内能不能读出「它说了什么 → 它做了什么 → 结果如何」这条线。另外「同一工具连错 7 次」要折成一行「尝试 7 次未成功 ›」——7 条一模一样的红收据本身就是噪音，这不新增积木，是一行收据的一个状态。
3. 裁决 7 的「思考(shimmer+秒数)」今天量的是**等首个 token 的时长**，词是个断言而它是假的。用户已定要打开思考——那这行就名副其实了；但**按能力分档意味着有些档位下它确实不该出现**，那时必须**不渲染**，不能显示一个 0。用一个断言性的词描述一件没发生的事，比不显示更糟。

**PM**
1. 数字说话：**「建两个镜头卡」这条最基础的画布任务，真实成功率 0%（0/3）**，「从原稿拆 8 镜」三次一次都没走到正确的工具。这不是打磨项，是**画布 Agent 目前不可用**。所以阶段 2（工具契约）的用户价值密度**高于**阶段 1，但它依赖阶段 1 的地基——我接受这个顺序，但要求**阶段 2 一结束就复跑 G2 并公布数字**，别等阶段 4 才量。
2. 用户 09-05 点名的三件事，本方案覆盖全部：「Agent 状态 UI 体验」= B1/B4 + 岔路 2；「用户自己接模型太难」= K7 + 阶段 5；「MCP 外部宿主出片」= §3.6 内外同源。
3. 阶段 0 是**唯一一个不产出用户价值的阶段**，所以它必须短、必须有明确的四道题和明确的失败出口（转 B 方案）。不允许它变成一个开放式调研。

**前端**
1. `sortedItems()` 在这条路上**会被改两次**：#544 刚把第二键从哈希改成数组下标（已合），阶段 4 把整个函数**删掉**。请在阶段 4 的 PR 里明确写出这次是**净删**，免得下一个人以为三个排序键都还在用。
2. 六个手写 external store 的引用稳定性判据（G6-②）我最想要——那个「有待决工具时整页崩」的 bug 是我最不想再遇到的一类。而且重做后这六个里至少三个会消失，剩下的更值得上门岗。
3. 实验室夹具从「手写宿主 items」改成「手写 LaneSnapshot」这件事量不大，但**每个夹具必须投出与今天逐像素相同的 view model**。基线红就是新通路投错了。别在那个时候去更新基线。

**后端**
1. 打开 pi 重试之前必须确认：`observeNativeStream` 的看门狗（90s 首响应 / 120s 空闲）和 pi 的重试**会不会互相打架**。两套超时叠在一起是典型的「单跑绿、真实网络下翻红」。这条我要求进阶段 3 的验收门。
2. 价格单位我复核过了：`calculateCost` 是 `rates.input / 1_000_000 * usage.input`（`models.js:539`），**每百万 token**。Nomi catalog 的 `pricing` 单位必须对齐，差一次就是三个数量级——这条写进阶段 3 的单测，不要靠人记得。
3. `ToolFailure.receivedType` **只带类型名、绝不带值**这条我坚持：现状 pi 把整个 `Received arguments` 原样回给模型，里面可能有用户文稿正文，那是 provenance 边界。重做时一起收口，不要留到以后。

**真实用户**
1. 我要的就是「我知道它在干嘛」。现在是发完一句话、转圈、然后哗啦一堆东西，而且文字说的和下面那堆红字对不上。
2. 它试一次不成，**换个法子再试**，而不是把同一句话说七遍。如果它真的做不到，直接告诉我做不到，我去手动建，别让我看七条红字猜。
3. 一次网络抖动就要我重发一遍 30 秒的等待，这个我最烦。花费那一行我不着急——但**别给我看一个永远是空的行**，要么给数，要么别画。

---

## 10. 本轮交付边界

- 本轮**只产出本文档**（docs-only PR，不合并）。一行产品代码未改。
- 拍板 §7 三条后，按 §6 阶段推进；**阶段 0 的探针结果回写进 §7 岔路 1**。
- 本方案拍板后，`docs/plan/2026-09-06-agent-architecture-master-plan.md` 与 `docs/plan/2026-09-06-agent-tool-layer-root-fix.md` 应标 **⛔ 被本文取代**——两份渐进方案与一份重做方案并存，下一个读的人一定会走错。
- 远期项登记：**`skill.write`**（让 Agent 把学到的方法写成技能）。恢复它需要的不是把工具接回去，是先设计「Agent 写的技能怎么被用户看到、审批、撤销」——那是一件独立的活。

---

## 11. 阶段 1 实施记录（垂直切片 · 影子期）

> 本节由阶段 1 的实施分支 `feat/agent-lane-vertical-slice-20260907` 写入（R4：多文件改动先写范围/不动项/回滚/验收门）。
> 状态：**影子期**——新通路存在、跑得通、被 CI 逐项比对，但**用户走不到**。旧通路继续服务用户。

### 11.0 先查别人（R29 增量。§0 那一节是方案级的，这里只记阶段 1 新读到的东西）

动手前实读的三份出处，每条都指向本节某个具体决定：

| 出处 | 实读到的东西 | 它决定了本切片的哪一件 |
|---|---|---|
| pi 0.85.1 的类型与实现（`node_modules/@earendil-works/pi-agent-core/dist/harness/agent-harness.d.ts`、`dist/harness/session/jsonl/types.d.ts`、`@earendil-works/pi-ai/dist/types.d.ts:410`） | `AgentHarnessOptions` 收 `session` / `models` / `model` / `tools` / `systemPrompt` / `entryProjectors`；`AgentHarnessTool.execute` 的签名是 `(toolCallId, params, onUpdate, toolContext, invocation, context)`；`AssistantMessageEvent` 的 `start` 成员**没有** `contentIndex`；`JsonlSessionRepoOptions.sessionsRoot` 是一个普通字符串参数 | ⑤⑥ 两层的分工：宿主只做 lane 生命周期 + 闸 + custom entry，转录/顺序/持久化全归 pi；以及 §11.5 的第 1 条岔路 |
| [阶段 0 探针报告](../research/2026-09-07-pi-0.85.1-probe-report.md) | §3.3「`JsonlSessionRepo` 会在 `sessionsRoot` 下按 `cwd` 生成 slug 子目录」；§5.1「`lane.watch()` 故意剥掉 `message_update` 的 `event` 字段，要 `contentIndex` 必须走 `harness.events.on`」；§4.2 臂 A「schema 不合法的参数**根本走不到** `before_tool`」 | 分别决定了 `laneSession.mts` 传稳定常量 cwd、`laneHost.mts` 同时订阅 `harness.events`、容忍必须落在 `prepareArguments` 而不是闸层 |
| [#547 工具层审计](../audit/2026-09-06-agent-tool-layer-audit.md) §3.2 与 [#549 成熟 Agent 产品调研](../research/2026-09-06-mature-agent-products.md) §2.3 | 真机 18 次失败 **100%** 是「结构化值被序列化成 JSON 字符串」那一族；所有单分支扁平 schema 的工具都是 100%；成熟产品把「够得着」与「批得动」分开 | `laneDocumentTools.ts` 的三条形状规则（一别名一工具、别名定死的字段不进 schema、容忍在 `prepareArguments`），以及闸独立于工具可见性 |

**四列表增量（R29）**：本切片只往「我们用了」一列加东西，「我们另写了 / 我们拆散了」两列**不增**——`electron/agentLane/` 在写第一行代码**之前**就加进了 `docs/engineering/framework-boundaries.json` 里 pi 五项能力的 `scope`，所以新目录里再出现自研 session / retry / steering 会**当场报红**（R28：防线建在最早能拦住的那层）。债数不变，仍是 14 条。

### 11.1 范围（做了什么）

一条能力端到端跑通新通路：`document.read` + `document.write`（#547 实测今天 100%，所以任何失败都归因于新通路而不是模型）。

```
pi lane（AgentHarness + JsonlSessionRepo，落 <project>/.nomi/agent-sessions/）   laneSession.mts · laneTools.mts · laneToolSchema.mts
  → laneHost（主进程，订阅 harness.events.on 拿带 contentIndex 的有序段）        laneHost.mts · laneProjection.mts
  → laneIpc（有序 parts 过 IPC，每段带 sequence；**未注册进 main.ts**）          laneIpc.ts · laneCommandCodec.ts
  → laneClient（渲染进程订阅，零状态机）                                        src/workbench/ai/lane/laneClient.ts
  → laneViewModel（纯函数投影，按 sequence 走，永不按 createdAt）                src/workbench/ai/lane/laneViewModel.ts
  → 现有 v4 组件（一行不改）
```

### 11.2 不动项（一行都没碰）

- 旧通路：`electron/harness/runtime/pi/run.mts` 的回合语义、`electron/projectAgentHost/**`、`projectAgentIpc`、渲染层 `agentPanelV4Projection.ts` 与 `useAgentPanelV4Data.ts`。
- v4 的 9 个组件与 57 张设计实验室基线（G8）。
- `main.ts` 的 IPC 注册表：`laneIpc` **不注册**（§8.1 规则 O6 的「开发期不可达」就是这条）。用户走不到 = 回滚面积为零。这条由 `electron/agentLane/laneShadowStructure.test.ts` 钉成断言，手法同 `projectAgentCutoverStructure.test.ts:40`。

**一处例外，必须明说**：`electron/harness/runtime/pi/model.mts` 里的 provider 装配被**原样提取**成 `createNomiProvider()`，老路的 `createNomiModelRuntime()` 改为调用它。理由是 P1：新旧两条通路都要造同一个 pi provider，复制一份就是并行版。行为不变由既有 151 条 `test:agent-runtime` 证明。

### 11.3 回滚

删掉 `electron/agentLane/`、`electron/shared/agentLane/`、`src/workbench/ai/lane/`、`tests/agent-runtime/lane-*` 四处，外加 revert `model.mts` 的提取与 `snapshot.mts` 的版本兼容两个 commit。用户可见行为零变化，因为影子期用户从来没走过它。

### 11.4 验收门（实测结果）

| 门 | 判据 | 证据 | 结果 |
|---|---|---|---|
| **G3**（本阶段主门） | 冷重启后这条能力的历史顺序与 pi transcript 的走序**逐项一致** | `tests/agent-runtime/lane-slice.test.mts`：真起 harness 跑一轮（两次工具调用）→ `close()` → 从盘上 `repo.open()` 重开 → 投影 → 断言段的类型/身份/顺序/编号逐项相等；附带断言盘上真有 jsonl 文件（否则「空 == 空」也会绿） | ✅ 7/7 |
| **影子比对** | 新旧转录逐项一致（文字、工具调用与结果、顺序）+ 花费一致 + 文稿最终状态一致 | `tests/agent-runtime/lane-shadow-parity.test.mts`，同一份 loopback 剧本喂两条通路 | ✅ 4/4 |
| **信息不丢** | zod → 模型可见 schema 的转换器不吃掉 `.describe()` / 枚举 / min/max / 字段名 / 必填；**每条配阳性对照** | `tests/agent-runtime/lane-tool-schema.test.mts` | ✅ 7/7 |
| **R30** | 一次写对率 + 回合成功率 | `tests/agent-runtime/lane-tool-accuracy.test.mts` | 一次写对率 **8/8**（无容忍对照臂 **1/8**）；回合成功率 **8/8**（对照臂也 8/8） |
| **G8** | 57 张 v4 基线一张不动 | `pnpm run check:design-lab` | ✅ |
| **债不增** | `check:framework-boundary` 债条数只减不增；新目录进 scope | `pnpm run gates` | ✅ 14 → 14 |

### 11.5 本阶段自己定的岔路（方案没写到的，按 D1–D6 选）

1. **`defineTool` → `AgentHarnessTool`**。方案与任务书都写「工具接入用 `defineTool`」。实核：`defineTool` 住在 `pi-coding-agent` 的**扩展面**（`dist/core/extensions/types.d.ts:386`），它的 `execute(toolCallId, params, signal, onUpdate, ctx)` 与 `AgentHarness` 要的 `AgentHarnessTool.execute(toolCallId, params, onUpdate, toolContext, invocation, context)` **签名不兼容**——`defineTool` 是 `createAgentSession` 那条老路的工具工厂。岔路 1 既然取了 A，工具面就取 `AgentHarnessTool`；`prepareArguments` 两边同名同义，官方容忍钩子完整保留。
2. **校验只发生一次 = pi 的 ajv 那次**。宿主不再用 zod 复验一遍（那正是 #547 §2.2③「8 行报错只有 1 行是真的」的成因）。安全性由「信息不丢门岗」承担：生成的 JSON Schema 不弱于 zod，所以 ajv 通过的输入 zod 也会通过。领域适配器的**输出**仍然校验——那是能力契约的收据形状（K1），与「模型输入校验几次」是两件事。
3. **别名 = 独立扁平工具**。`read_full_text` / `read_selection` / `insert_at_cursor` / `replace_selection` / `append_to_end` 各是一个单分支扁平 schema 的工具，语义输入里由别名决定的字段（`scope` / `operation`）**不出现在模型可见 schema 里**——#547 的数据说 100% 的那批全长这样。
4. **宿主领域记录 = `nomi.approval`**，按 `toolCallId` join，永不复制工具结果正文；且 `entryProjectors` 里注册成**不投给模型**——拒收的理由 pi 已经一字不改地做成了那次调用的 tool result，再投一遍就是同一句话说两遍、占两份上下文。注册点留着，因为阶段 3 的任务卡/失败卡要走同一个口子，那时它才真的需要投影。
5. **G3 用机器断言证，不用截图证**。方案 §5 自己写的就是「**机器断言**，不是人眼」。影子期新通路对用户不可达，要拍到它的截图就必须先注册 IPC——那会直接违反规则 O6 并把回滚面积从零变成一整条链路。所以：G3 = `lane-slice.test.mts`；界面侧的证据是 **G8**（57 张基线一张不动，正是「影子切片没碰面板」的截图证明）。用户可见的走查留到阶段 4 切换时做，那时它才有东西可看。
6. **跨层契约物化成一份夹具**。`LaneProjection` 的两侧住在两套编译世界里（主进程是 NodeNext 的 ESM 岛，渲染层是 vite），没有哪一条测试能一口气从 pi 跑到 v4 组件。硬塞进同一个 runner 只会得到一份互相 mock 的假闭环。所以 `tests/agent-runtime/__fixtures__/lane-projection.json` 由**真 pi 跑出来**，上游断言「真投影与它逐字相等」，下游断言「长这样的投影投出那 4 个积木」，谁先漂谁先红。
7. **R30 的真实模型那一半，2026-09-07 补上了**。当时按 D4 明着标成「没跑」，理由是「零密钥经手」——后来发现这两条并不冲突：走主进程自己的设置读取路径，key 从 safeStorage 解出来后**只在那个进程的内存里**，不打印、不落盘、不进 argv、不进 commit。数字与做法见 §11.6。

### 11.6 R30 真实模型那一半（2026-09-07 实跑）

阶段 1 那两个 8/8 是 loopback 的：畸形参数是**我们注入的**，模型没有参与。真实模型那一半问的是另一件事——**这套工具面交到一个真模型手里，它自己填得对吗、事情做完了吗**。

**做法**（口径与 loopback 那半完全一致，只换端点）：`document.read` / `document.write` 五个工具原样，八条真实用户指令（追加一句一字不改的话 / 先读全文再追加 / 光标处插标题 / 按顺序加两句 / 读完把最后一句再抄一遍到末尾 / 只读不改 / 追加一句带引号的话 / 开头插一行），每条起一条全新 lane + 全新文稿，跑完看两件事：

- **一次写对率**：这一轮的**第一次**工具调用有没有拿到非错结果（分母 = 首调次数）。
- **回合成功率**：收尾文字出现 **且** 文稿真的被改成预期的样子（分母 = 回合数）。少了后半句，一个「说完成了但什么也没做」的回合会被记成成功。

**结果**（APIMart · `deepseek-v4-flash`，2026-09-07）：

| 指标 | 真实模型 | 同口径 loopback（`lane-tool-accuracy.test.mts`） |
|---|---|---|
| 一次写对率 | **8/8** | 8/8（无容忍对照臂 1/8） |
| 回合成功率 | **8/8** | 8/8（对照臂也 8/8） |

**花费**：两次运行（第一次输出被我截断了没看全，重跑了一次），合计约 5 万 token。按一个**明显偏高**的假价（$2/M 输入、$8/M 输出）估上限是 **$0.11 ≈ ¥0.8**，真实单价远低于此。脚本里硬编码了 $0.14（≈¥1）的闸：估出来的钱过线就停，宁可少跑几条。

**一条顺带的观察，值得记下来**：八条里有六条模型的**第一个**动作是 `read_full_text`，插标题那条是 `read_selection`——没有人在系统提示词里要求它「先读再写」，那句话写在 `read_full_text` 的 description 里（*"Call this before writing anything…"*）。这是描述通道真的在起作用的一次实证，也是 G-03（描述三通道）值得在阶段 2 补齐的理由。

**怎么再跑一次**：脚本没有进仓库（它会经手一把真 key，而仓库里不该有任何一条「顺手就能花钱」的路径）。要复现的话，一个 Electron 脚本三步就够——① `app.setName('nomi')` 并把 `userData` 指到 `<appData>/nomi`（**这一步是坑**：dev 下 Electron 从仓库 `package.json` 拿到的名字是小写 `nomi`，safeStorage 的钥匙串条目按它找；写成 `Nomi` 会去找一条不存在的条目，Chromium 于是用一把临时密钥，症状是「密文解不开」而不是「拿不到钥匙」）；② 走主进程自己的那条读取路径拿连接参数：`readCatalog()` → `decryptApiKeyRecord(state.apiKeysByVendor.apimart)` → `vendorModelConnection(vendor, model, apiKey)`（`electron/ai/vendorModelConnection.ts:20`，`/v1` 后缀就是它补的）；③ 把结果原样交给 `openLane({ projectDir, systemPrompt, model, tools: createDocumentLaneTools(port) })`。key 全程只在这个进程的内存里。


### 11.7 参考实现一致性核对：阶段 1 逐条判定

> 出处：[`docs/research/2026-09-07-pi-reference-implementation-conformance.md`](../research/2026-09-07-pi-reference-implementation-conformance.md)。
> 那份核对给的是**方案级**的九层对照与 24 条「没想到」。这一节只回答一件事：**其中落在阶段 1 切片射程内的那几条，今天到底满足没有**，
> 每条给 `file:line`。判定分三种：**已满足**（有断言钉住）· **本 PR 修**（原来不满足，这次改了）· **阶段 2 前债**（切片没触及，明着登记，不假装做过）。

| 核对项 | 判定 | 判据（file:line） |
|---|---|---|
| **坑 2 · 0.84.0 `message_update` delta-only**（[#7290](https://github.com/earendil-works/pi/issues/7290)）：靠 `event.message` 渲染的宿主会**静默什么都不画**，而最终转录完全正确 | **已满足**，本 PR 补了回归钉 | 我们从不读 harness 事件上的累积 `message`：`laneHost.mts:99-106` 只取 `event.event`（为了 `contentIndex`），累积交给 pi 自己的归约器（`pi-agent-core/dist/harness/runtime/reducer.js` 的 `message_update` 分支 `operation.streamingMessage = event.message`），投影只读 `snapshot.operation.streamingMessage`（`laneProjection.mts:82-86`）。#7290 改的是**对外 JSON/RPC 流**，不是进程内的 harness 事件——而我们压根没订阅前者。新钉：`tests/agent-runtime/lane-slice.test.mts` 的「every mid-stream frame is a prefix of the final text」（配 `httpFixture.mts` 的 `chunks`，把一条消息拆成三个 delta；单 delta 时该断言自己会红，已验） |
| **G-19 / 坑 1 · `FileSystem.renameFile` 必须是同文件系统原子替换**（用户项目可能在 iCloud 目录） | **已满足**（结构性，不是承诺） | `laneFileSystem.mts:68-91` 只改写 `writeFile` / `appendFile` 两个方法的**后置动作**，`renameFile` 由 `Object.create(base)` 从 `NodeExecutionEnv` 原样继承（`pi-agent-core/dist/harness/env/nodejs.js:662-669`，底层就是 `node:fs/promises` 的 `rename`，要么原子替换要么 `EXDEV`，从不退化成 copy+delete）。而 pi 的临时文件是目标的**同目录兄弟**（`session/jsonl/storage.js:71` `${destinationPath}.tmp`），所以「同文件系统」是结构事实、与用户把项目放在哪无关。三条断言在 `tests/agent-runtime/lane-session-durability.test.mts`：没有自己实现 `renameFile`、目标已存在时一次 rename 换掉它、发布完不留 `.tmp` |
| **G-20 / 9.5 · 转录落盘 mode**（上游裸写 = `0o644` 世界可读，而里面装着用户原稿正文） | **本 PR 修** | `laneFileSystem.mts:26-28,51-91`：文件 `0o600`、目录 `0o700`，`ensureLaneSessionsRoot` 先把会话根建成 `0o700`（pi 的 `mkdir(recursive)` 会顺手把整条父链建成 `0o755`，装饰器只看得见文件的直接父目录）。chmod 失败 = 写入失败（fail-closed），不静默降级。**阳性对照**在测试里：同一个目录里一次不经过我们这层的写入落地就是 `0o644`（`lane-session-durability.test.mts`，并按住 umask，不拿运气当对照） |
| **G-18 / 3.2 · 同一会话被打开两次会写重复 `seq` 并损坏文件**（[#8852](https://github.com/earendil-works/pi/issues/8852)） | **进程内已满足；跨进程登记为阶段 2 债** | 修法不是我们再写一把锁（那会当场撞 `check:framework-boundary`），而是**让 pi 的名单只有一张**：一个项目一个 `JsonlSessionRepo`、进程内共享、引用计数（`laneSession.mts:47-70`），这样 pi 自己的 `openSessions` 表（`session/jsonl/repo.js:86-87`）才真的拦得住第二个打开者；拦下时补一句「为什么这件事致命」（`laneSession.mts:98-107`）。**Electron 多窗口 = 一个主进程**，所以多窗口这一半是覆盖住的，断言含两条阳性对照：拦的是**这一条会话**不是这个项目、以及装配失败会交还持有权不留幽灵持有者。**没覆盖的是跨进程**：`electron/main.ts:121` 里 MCP stdio 模式**刻意不抢单实例锁**（否则 GUI 在跑时它会被判第二实例而自杀），所以「GUI + 一个 MCP stdio 进程」同时活着是设计内的。今天不可达（`laneIpc` 未注册、MCP 那条路不开 lane），但阶段 2 把 lane 接进 MCP 对外面之前，必须先有一把**跨进程**的锁（pi 自己给 `auth.json` 用的是 `proper-lockfile`，那是现成的参考） |
| **G-01 · 根级 `anyOf` 在部分供应商上被静默丢弃**（Anthropic 适配器丢它，Google legacy 路径不支持它） | **已满足**（上一位工人改的，本 PR 复核） | `laneToolSchema.mts:183-206` 把「根是 `anyOf`/`oneOf`/`allOf`」列为拒收，理由与处方写在同一处（判别字段降成 `z.enum`、分支专属字段设 optional）。规则长在**生成点**而不是一条扫源码的 CI 规则，因为 `z.discriminatedUnion` 在源码里看得见、但「它最后生成成了什么」只有运行时知道。测试带阳性对照：同样语义写成扁平对象就通过（`lane-tool-schema.test.mts`） |
| **G-05 · 枚举直译成 `const`，Google 的 OpenAPI 3.03 路径不认** | **已满足**（同上） | `laneToolSchema.mts:208-223` 递归拒收 `const`。测试先证明这属于「信息一个字没丢」那一类（产物里 `const` 就在那儿、既有的「信息不丢」断言全绿），再证明门岗仍然拒收——**这两条恰恰是「不丢」证明不了「看得见」的实证**；阳性对照是 `z.enum` 生成 `{"type":"string","enum":[…]}`，上游 `StringEnum()` 的等价物 |
| **G-02 · 工具失败必须 `throw`，`return` 一个错误对象会被记成成功** | **已满足**，本 PR 补了断言 | `laneTools.mts` 的 `execute`：`if (!outcome.ok) throw new LaneToolFailure(outcome.message)`。断言在 `lane-session-durability.test.mts`：失败落成 `isError` 的结果、那句可行动的话逐字到模型；**阳性对照**是**逐字相同的文本**走成功路径时 `isError === false`——少了它，一个把每条结果都标成错误的实现也能通过 |
| **G-04 · 工具输出零截断，而上游把它写成 MUST** | **本 PR 修** | 切片确实触到了：`read_full_text` 返回的是**用户的整份原稿**。截断落在**唯一出口**（`laneTools.mts` 的传输层），用的是 pi 自己的 `truncateHead` 和它自己的两个数（`DEFAULT_MAX_LINES` / `DEFAULT_MAX_BYTES`），不是我们发明的截断器；上限镜像在 `laneContracts.ts` 是因为写说明书的 `laneDocumentTools.ts` 在 CJS 侧 `require()` 不到 pi 的 ESM 包，而**说明书和执行必须同一个数**——`lane-tool-output.test.mts` 把镜像钉在上游常量上。原来 `read_full_text` 的描述写着 "with no truncation"，那句话在截断落地的一刻就成了谎，同 PR 改成从同一对常量插值。**不抄上游示例的那句 `Full output saved to: …`**：我们这一族的全文是用户自己的原稿，再往临时目录抄一份，等于刚把转录收紧到 `0o600` 又在旁边留一份世界可读的副本；所以正文里给的是**下一步怎么做**。阳性对照：没超限的结果一个字节不动（把截断摘掉，该测试当场红，已验） |

**没在本 PR 动、且明确留给后面的**（不是遗漏，是排期）：G-03（描述三通道 + 系统提示词里重建 `Available tools`）、G-06（`prepareArguments` 折旧形状）、G-07（路径包容 `containPath()`）、G-08（唯一校验点复用 pi 的 `validateToolArguments`）、G-09（`addedToolNames` 动态装载）——五条都要等阶段 2 的 22 个能力搬进来才有落点；G-10 至 G-17 归阶段 3。

---

## 12. 阶段 2 实施记录（模型优先的工具契约）

> 本节由阶段 2 的实施分支 `feat/agent-lane-stage2-tool-contracts-20260907` 写入。
> 状态：**仍在影子期**——`laneIpc` 依旧不注册进 `main.ts`，用户走不到新通路。本阶段动的是
> 「模型看到什么」，不是「用户看到什么」。

### 12.1 这一阶段到底在解决哪个摩擦（一句话）

模型第一次就把参数写对的概率，直接决定用户等多久、烧多少钱。今天最贵的那扇门（分镜）
拿到的 schema 是「一个由任意对象组成的数组」，真实成功率 **0/18**（#547 §3.2）。
阶段 2 把「写对」从运气改成**结构事实**：模型可见 schema 只有一个生成点，生成点自带门岗，
存量由 `check:model-schema` 棘轮盯着，到阶段 4 归零。

### 12.2 G-01 改写清单（根级 `anyOf` = 0）

处方不是「分支少一点」，是**根必须扁平**——拆成 3 个工具后每个仍是根级 `anyOf`，而
Anthropic 适配器会把它静默丢掉（[#9134](https://github.com/earendil-works/pi/issues/9134)）、
Google 的 legacy `parameters` 路径是 OpenAPI 3.03 不支持它（`pi-ai/dist/api/google-shared.js:278-281`）。

**派生，不是重写**（`electron/shared/agentCapabilities/flatModelInput.ts`）：作者继续写
`z.discriminatedUnion`，`flattenDiscriminatedUnion` 机械派生出扁平版；校验仍由原契约做
（`transform` 里跑一次 `contract.safeParse`）。所以「接受/拒绝哪些输入」在**构造上**与原
union 逐字相同——没有第二份判断逻辑可以漂移。

| # | 位置（改前 file:line） | 它是什么 | 改法 | 状态 |
|---|---|---|---|---|
| 1 | `canvasWrite.ts:220` `canvasWriteSemanticInputUnion` | 模型面 9 分支根级 union，真实 0/18 | 按语义拆成三组 sub-union（`canvasNodeWriteInputUnion` / `storyboardWriteInputUnion` / `shotReferenceWriteInputUnion`），全量 union 由三组**拼**出来不另抄名单；lane 侧每组各自 `flattenDiscriminatedUnion` 成一个扁平工具 | ✅ 本 PR |
| 2 | `canvasWrite.ts:152-160` `patch_shots` 的 `select` | 嵌套 `z.union` + 两个 `z.literal`（G-01 的字段级变种 + G-05） | 手改成扁平对象 + `z.enum(['all','indexes'])` 判别字段，组合约束下沉进 `superRefine`；接受/拒绝集合一个字没变 | ✅ 本 PR |
| 3 | `canvasWrite.ts:106/116` `edges` 两支形状不同 | `create` 可省 / `connect` 至少一条——扁平化时是**真冲突**（同一字段名只能发布一种形状） | 两支共用更松的声明，「connect 至少一条边」下沉进 `superRefine`。拒绝理由从此说得清是哪个 operation 要求的 | ✅ 本 PR |
| 4 | `timelineRead.ts:122` `timelineOperationSchema` | 9 分支 `z.union`（不是 `discriminatedUnion`，因为有一支带 `superRefine`） | 派生器已支持普通 union（自动推判别字段），但 `transition` 与 `text` 两支各有一个叫 `action` 的字段、词表完全不同 → 派生器**拒收**。正解是把两个 `action` 改成同一形状、差额下沉，那是时间轴写入契约的改动 | ⏸ 阶段 3；`propose_edit_plan` 本阶段**不进 lane**（明着标，见 §12.7） |
| 5-6 | `modelToolSurfaceManifest.ts:83/90` `generationPlan` / `generationStatus` | 旧通路发给 pi 的根级 union | 旧通路，本阶段范围外 | 📌 `check:model-schema` 登记为债，阶段 4 归零 |
| 7-8 | `modelToolSurfaceManifest.ts:131/147` `nomi_timeline_read` / `nomi_timeline_edit` | 同上 | 同上 | 📌 同上 |
| 9-10 | `mcpCapabilityProjection.ts:128/136` timeline 的两个 MCP 入参 | **实核推翻了一条预设**：MCP 传输层的 `transportSchemaFromZod` 本来就把 union 拍平成超集对象（因为它的校验器不实现 `anyOf`），所以对外 `tools/list` 上**没有**根级 union | ✅ 已经是扁平的（门岗实扫 `mcp/*` 的 `root-union` 命中为 0） | ✅ 无需改 |
| 11 | `canvasDelete.ts:27` / `assetRead.ts:112` / `timelineWrite.ts:35` / `exportCapabilities.ts:43` 等 | **结果**（收据）schema，不是模型入参 | 不在 G-01 射程内：模型不填收据 | — 不适用 |

> 结论：**模型入参侧的根级 union 共 8 处**（1–8），本 PR 消掉 3 处（1/2/3，覆盖 `canvas.write`
> 全部 9 个 operation），1 处明确排期（4），4 处（5–8）是旧通路、登记为债。
> 原方案说的「11 处 `z.discriminatedUnion`」里有一半是收据 schema —— 这份清单是逐个打开看过的结果。

### 12.3 `check:model-schema` 门岗（R17：先验它会红）

身份式棘轮（与 `check:boundaries` 同款，不是 `check:heavy-path` 那种计数式）——因为这一族
可以「修掉一条、偷加一条」，纯计数拦不住。规则本体与生成点门岗**是同一份代码**
（`electron/shared/agentCapabilities/modelVisibleJsonSchema.ts`）：上一版这两处各写了一份、
注释里写着「两边必须逐字相同」，而那句话本身就是漂移预警。

**红证明（R17）**：在 `origin/main@d230da0a6` 上跑同一份规则（lane profile 为空桩），
**158 处命中**：

| 规则 | main | 本 PR | 说明 |
|---|---|---|---|
| `empty-schema` | 55 | 51 | `z.record(z.unknown())` 这一族。本 PR 把 `plannedNodeSchema.metadata`/`params` 与分镜的 `params` 收成标量 record |
| `root-union` | 6 | 6 | 全部在旧通路的 `modelToolSurfaceManifest`（lane 侧 **0**） |
| `const-instead-of-enum` | 53 | 49 | `z.literal` 直译成 `const`，Google legacy 路径不认 |
| `identical-input-schema` | 1 | 1 | `nomi_canvas_plan` + `nomi_canvas_edit` 字节级相同（旧通路） |
| `thin-description` | 37 | 37 | 描述 < 120 字符 |
| `missing-example` | 6 | 6 | ≥10 字段却零示例 |
| **合计** | **158** | **150** | lane profile：**0** |

**lane profile 零违规**是本阶段最值钱的那条性质：新通路是干净的，棘轮从这里开始只减不增。
`identical-input-schema` 的判据刻意做了两半——**schema 相同 + schema 里仍留着一个多值判别枚举**：
前者说「两个工具长得一样」，后者说「名字没承担区分的责任」。少了后者，
`insert_at_cursor` / `append_to_end` 这种**故意**共享 `{content}` 的别名族会被误判（它们在
#547 里的真实成功率就是 100%）。

自测在 `scripts/check-model-schema.node-test.mjs`：每条规则一个阳性对照 + 一个合法近邻，
7/7。少了近邻那一半，一个「什么都判红」的规则也能通过。

### 12.4 错误契约（§3.3 / G-02）

- **失败一律 `throw`**：`ToolFailure` 是**抛出去的那个 Error 的正文格式**，不是 return 的形状。
  上游原话：*"Returning a value never sets the error flag regardless of what properties you
  include in the return object."* return 的后果是 pi 记 `isError: false`——面板画绿收据、
  模型收到一条「成功」的工具结果里面装着错误。
- **正文 = 人话 + 可行动下一步**（`LaneToolFailureShape`：`code` / `message` / `nextAction` /
  `allowed` / `issues`）。`code` 是给 UI 分档的，**不是给模型读的**——`[error] E_DENIED`
  在真机上等于什么都没说。
- **内外同源**：`renderLaneToolFailure`（模型看渲染好的正文）与 `laneToolFailureToRpc`
  （MCP 宿主看结构化字段）是同一个描述符的两个投影，形状对齐 `dispatcher.ts:557-565`
  今天已经做对的那一份。
- **兜底在绑定点**：`bindLaneTool` 把任何漏网的领域异常兜成一个带 `nextAction` 的失败。
  放在每个 `execute` 里靠人记得写，漏掉的那个**不会报错**（R28）。
- **隐私边界**：`issues` 只带类型名，绝不回传收到的**值**——用户文稿正文、素材路径都可能在参数里。

### 12.5 描述三通道（G-03）

上游把「模型怎么知道该用哪个工具」拆成三条通道，各花各的钱：`description` 进 schema（每次
请求都花 token）、`promptSnippet` 进系统提示词的 `Available tools` 菜单（**全表一次**）、
`promptGuidelines` 进 `Guidelines`（**去重且条件化**）。方案原本的 S4（三件事全塞进
description）与 S7（≤4000 token）在数学上互斥——把「不要用隔壁那个」写进 N 个工具的
description，等于把同一段话买 N 遍。

**复合缺陷的另一半也补了**：`AgentHarness` 收到我们自己的 `systemPrompt` 之后，pi 自己那份
连带渲染那两段的代码一起不用了——光给工具填上字段**一个字都到不了模型**。
`electron/agentLane/lanePromptSections.ts` 逐字镜像上游的格式（`system-prompt.js:41-88`）
重建这两段；`composeLaneSystemPrompt` 是唯一的拼接点。

**每工具至少一个示例**（#547：35/35 零示例），写进 description 而不是 Anthropic 专有的
`input_examples`（我们要跨供应商）。测试逐条把示例喂回它自己的 schema——**一个过不了自己
schema 的示例比没有示例更糟，它主动教模型写错**，而编译器、单测、门岗谁都不看它。

### 12.6 容忍是一族（§3.4）与工具数量收敛（§3.5）

**分工先说清楚**（G-06 / G-08 实核）：pi 的校验器内部已经有四道容忍
（`structuredClone` → `normalizeOptionalNulls`（可选字段收到 `null` **删键**）→
`Value.Convert`（`"5"`→`5`）→ `coerceWithJsonSchema`）。所以「可选字段填了 null」和
「数字写成字符串」**我们一行都不用写**——写了就是第二个容忍器，而两个互不认识的验证器
正是 #547 §2.2③「8 行报错只有 1 行是真的」的成因。

`electron/agentLane/laneArgumentTolerance.ts` 只做 pi 不管、而真机 100% 撞到的那几族：
整包参数被序列化成 JSON 字符串 / 某个数组字段被序列化 / 该给一元数组给了单对象
（上游为它单开过 [#7835](https://github.com/earendil-works/pi/issues/7835)）/ 字段名近义写错。
**一处 owner**，挂在每个工具的 `prepareArguments` 上。

**过渡补丁的处置**（`docs/plan/2026-09-06-agent-panel-v4-real-use-fixes.md` 的 T1/T2/T3）：

| 补丁 | 新通路上的处置 | 旧通路 |
|---|---|---|
| **T1** `jsonArgTolerance` 的 `jsonTextBranch`（把「同一个值的 JSON 文本」做成契约里的一条运输分支） | **不进模型可见 schema**：`toPublishedJsonSchema` 按 `JSON_TEXT_BRANCH_MARKER` 把它摘掉（传输层今天已经在做同一件事），容忍改由 `prepareArguments` 承担。顺带解决 G-01 的字段级变种——留着它，根扁平了字段上还挂着 `anyOf` | 保留（旧通路仍靠它），阶段 4 一起删 |
| **T2** 渲染层的 `humanizeToolFailure` + 折叠层 | 新通路不需要：失败正文由 `renderLaneToolFailure` 在**工具那一侧**生成，渲染层不再翻译机器回执 | 不碰（旧面板本轮不动） |
| **T3** `tools.mts:100` 的 `beforeToolCall` 再跑一次 Zod（pi 之后的第二道、且更严的校验） | 新通路**没有这一道**：校验只发生一次，就是 pi 带容忍梯的那次（G-08）。安全性由「信息不丢」门岗承担——生成的 schema 不弱于 zod | 保留，阶段 4 随旧通路一起删 |

**数量收敛**：`canvas.write` 的 9 个 operation → **3 个语义工具**（节点/边 · 分镜 · 站位运镜），
每个都是扁平根。`nomi_canvas_plan` / `nomi_canvas_edit` 这两个字节级相同的名字在 lane 上
**根本不存在**。lane profile 共 **11 个工具**，预算 12（`LANE_TOOL_BUDGET`，超了直接抛而不是
留一句注释）。⚠️ 但 schema 总量 **20 272 字节 ≈ 5k token**，仍超 S7 的 4 000 token；
上游给的第二条路是 `addedToolNames` 动态装载（G-09），阶段 3 接生成类工具时会需要它——
这条写在 `laneToolCatalog.ts` 里，是为了下一个人撞到上限时知道有第二条路，而不是先去抬高上限。

**合并/替换掉的重复**：`storyboardPlanParamsSchema` / `stagingReferenceParamsSchema` /
`cameraMoveParamsObjectSchema`（typed，带 `.describe()`）原来住在旧通路的工具表
`canvasDescriptors.ts` 里，而能力契约 `canvasWrite.ts` 那一份是 `z.record(z.unknown())`——
**同一件事两份说法，且对外 MCP 广播的是弱的那份**（S9：信任方向反了）。本 PR 把它们搬进
`electron/shared/agentCapabilities/canvasModelShapes.ts` 成为唯一 owner，
`canvasDescriptors.ts` 从 463 行降到 107 行、只 re-export。

### 12.7 R30 · ToolRobustBench 五段归因（真实模型）

**做法**：APIMart · `deepseek-v4-flash`，12 条真实用户指令（文稿 3 / 画布 5 / 分镜 2 / 时间轴 2），
两臂**逐字相同的指令、相同的领域端口、同一个 `openLane`**，每条起一条全新 lane。
key 走主进程自己的读取路径（`readCatalog` → `decryptApiKeyRecord` → `vendorModelConnection`），
全程只在进程内存里。脚本不进仓库（仓库里不该有任何一条「顺手就能花钱」的路径）。

**两臂的差别只有工具面**：
- 臂 B（基线）＝ **一个** 9-operation 的 `nomi_canvas_plan`、一行薄描述、零示例、
  系统提示词没有 `Available tools`/`Guidelines` 两段、零 `prepareArguments`。
- 臂 A（本 PR）＝ 上面 §12.2–12.6 的全部。

**⚠️ 两刀这个端点量不出来，明着标（这比给一个好看的数字重要）**：
1. **根级 `anyOf`**（G-01）：DeepSeek 走 OpenAI 兼容协议，`anyOf` 它认。这一刀的依据来自
   上游（pi #9134 / `google-shared.js:278-281`），不是这里的 A/B。在这个端点上做 A/B
   只会得到「没差别」，而那个结论对 Anthropic / Google 用户是**假的**。
2. **「`shots` 是一个由任意对象组成的数组」**：#547 已经用真实模型量过它是 **0/18**，
   再买一次同样的答案没有信息量。而且更硬的一条——**模型可见 schema 的生成点直接拒绝发布
   那种形状**：第一版臂 B 用未收紧的形状跑，整条 lane 装配失败，12 条任务**一次工具调用都
   没发出去**（0/12）。那不是模型的成绩，是门岗的成绩。

   所以臂 B 也用 typed 形状 + 扁平根。**这次 A/B 隔离出来的是剩下三刀**：
   一个工具装 9 件事 vs 三个语义工具 · 薄描述零示例零 Guidelines vs 三条描述通道 ·
   零容忍 vs `prepareArguments`。

**结果**：

| 五段（ToolRobustBench 归因维度） | 臂 B 基线 | 臂 A 本 PR |
|---|---|---|
| S1 工具选择 | 12/12 | 12/12 |
| **S2 schema 落地（= 一次写对率）** | **12/12** | **12/12** |
| S3 参数绑定 | 12/12 | 12/12 |
| S4 输出与运行时反馈处理 | 12/12 | 12/12 |
| **S5 端到端（= 回合成功率，看领域状态不看它说了什么）** | **12/12** | **12/12** |
| 工具调用总数（12 条任务合计） | 25 | **23** |
| 最长那条任务的调用数 | 6（三镜分镜） | **3**（两镜分镜） |

**怎么读这张表（诚实版）**：**在这个模型、这批任务上，剩下三刀买到的不是更高的成功率，
是更少的往返。** 两臂都 12/12，因为真正决定成败的那两刀（typed 形状、扁平根）**按构造被
两臂共享**——门岗不让旧形状发布出去。最差那条任务从 6 次调用降到 3 次是唯一稳定的差异，
方向对但样本小（12 条），**不足以支撑「快了一倍」这种说法**。

**归因最差的那一段**：五段里没有一段掉下来，所以「最差」只能从**往返次数**看——
臂 B 的 `storyboard-three-shots-with-anchor` 用了 6 次调用（一个 9-op 工具上反复试），
臂 A 同一条 3 次。这与 #547 的判断同向：出问题的不是「工具多」，是「一个工具里塞多个分支」。

**一条实测得到的观察**（不是推测）：第一次跑时夹具的画布端口收下了指向不存在节点的边，
下一次 `nomi_canvas_read` 于是校验失败，模型**连着重试了 18 次**同一族调用。那正是用户
撞到的「连续 6 次被自己拒收」的机制复现——而它的成因是**回执没有告诉它下一步该怎么做**。
夹具修好后同一条任务降到 6 次。这三条被夹具 bug 污染的行（`doc-insert-title` /
`canvas-create-with-edge` / `storyboard-three-shots-with-anchor`）在修好夹具后**用同一个脚本
重跑**，上表用的是重跑值。

**花费**：合计 753 689 输入 / 15 950 输出 token（含两轮全量 + 三条重跑 + 冒烟）。
按 **$0.30/M 输入、$1.20/M 输出**（flash 档的偏高假价，APIMart 实际远低于此）估
**≈ $0.25 ≈ ¥1.8**，在 ¥3 上限内。脚本里硬编码了 $0.42（≈¥3）的闸：估出来的钱过线就停。

### 12.8 不动项 / 回滚 / 验收门

**不动项**：`laneIpc` 仍不注册进 `main.ts`（用户走不到）；v4 的 9 个组件与 57 张设计实验室
基线一张没动；旧面板、旧通路的运行时语义、能力 id / 别名 / 权限链、transport adapter、
MCP 执行边界、`tools/list` 的确定性顺序合同。

**回滚**：删掉 5 个新文件（`flatModelInput` / `modelVisibleJsonSchema` / `canvasModelShapes` /
`laneToolContract` / lane 的 4 个工具文件）+ revert `canvasWrite.ts` 的三处形状改动
（`edges` 共用声明、`select` 扁平化、三个 sub-union 分组）+ revert `canvasDescriptors.ts` 的
re-export + 从 gates 链摘掉 `check:model-schema`。用户可见行为零变化。

| 门 | 判据 | 证据 | 结果 |
|---|---|---|---|
| **G2**（本阶段主门） | 一次写对率 + 回合成功率，按五段归因拆开 | §12.7 | ✅ 两臂 12/12；差异在往返次数 |
| `check:model-schema` | 从红到绿 | 先在 `origin/main` 上验红（158 处），再落地棘轮 | ✅ 158 → 150，lane profile **0** |
| 信息不丢 | zod → 模型可见 schema 的转换器不吃掉 `.describe()` / 枚举 / 界 / 必填 | `lane-tool-schema.test.mts`（本 PR 新增「产物更紧算过桥、更松必须红」的双向对照） | ✅ |
| 结构断言 | 扁平化与原 union 接受/拒绝完全相同、跨字段约束不丢、示例过得了自己的 schema、Guidelines 去重 | `lane-tool-contract.test.mts` | ✅ |
| 全套件 | `test:agent-runtime` | 201 条 | ✅ 201/201 |
| 副作用自声明（⑨） | 每个工具必须说清改不改状态 / 花不花钱 / 怎么收回，且 `replay` 从中派生 | `lane-tool-contract.test.mts` 的「每个工具自己说清…」（含两个阳性对照：不自洽的声明在装配期被拒） | ✅ |
| 缓存收据（⑪） | `cacheRead` / `cacheWrite` 两列一路带到面板收据，不并进 `input` | `laneViewModel.test.ts` 断 `usage.cache === '900t'`；`__fixtures__/lane-projection.json` 线形已含两列 | ✅ |
| **G8** | 57 张 v4 基线一张不动 | `check:design-lab` | ✅ |
| MCP 载荷 | shrink-only 棘轮（main 恰好卡在上限 28047/28047，零余量） | `check:mcp-payload` | ✅ 28047，未增一字节 |

### 12.9 本阶段自己定的岔路（方案没写到的，按 D1–D6 选）

1. **扁平化是「派生」不是「重写」**。手抄一份扁平版就是第二个真相源：以后加一个 operation
   两处都要改，漏掉的那处**不会报错**，只会让模型看不见那个字段。派生器的 API 因此只收
   **最外层契约**、自己往里剥——递「union + refined」两个参数的写法有一种必然会犯的错
   （只递 union），症状是跨字段约束静默消失。这条不是推演：第一版实现就是那么写的，
   `connect_canvas_edges` 给空数组当场变成合法。
2. **同名字段形状冲突 → 拒收，不替作者挑**。`edges` 在两支上一松一紧、`props` 在两支上
   一个 typed 一个不是——扁平化只能发布一种，替作者挑一个就等于悄悄放宽或收紧了另一支。
   派生器抛 `ConflictingBranchField` 并把处方写进报错。**这个检测顺带成了「同一个概念在
   两个分支上被声明成两种东西」的探测器**——`sceneTemplate`/`props` 两支共用一份 typed
   形状就是它逼出来的。
3. **`propose_edit_plan` 本阶段不进 lane**。它的 `operations[]` 里 `transition` 与 `text`
   两支各有一个叫 `action`、词表完全不同的字段，正确修法是时间轴写入契约的改动（阶段 3）。
   硬塞进来的代价是新通路第一天就带 9 条 `const` 债；不塞的代价是时间轴少一个只读工具，
   而它不在本阶段的评测面上。**选后者：新通路是干净的，这条性质比多一个工具值钱。**
4. **typed 分镜形状只进 lane 与旧 pi 面，不进对外 MCP 契约**。`check:mcp-payload` 是
   shrink-only 棘轮而 main **恰好卡在上限**（实测 28047 / max 28047，零余量），把 typed 形状
   接进共享契约会让 `tools/list` 当场顶穿。所以 `canvasWrite.ts` 对外那一份仍是
   `z.record(z.unknown())`，由 `check:model-schema` 登记成身份式债、阶段 4（工具数量收敛
   腾出字节）归零。**登记不是防线**，但它至少让这条债不会被忘掉。
   同理，`select.kind`/`select.indexes` 刻意不带 `.describe()`——散文写在 lane 的工具描述与
   示例里，那两处只进内部模型面，对 MCP 载荷是 0 字节。
5. **规则只有一份代码**。第一版把结构/供应商判据在生成点与门岗各写了一份，注释写着
   「两边必须逐字相同」。那句话本身就是漂移预警，所以合并成
   `shared/agentCapabilities/modelVisibleJsonSchema.ts`：生成点拦新写的、门岗拦存量，判据一条。
6. **`identical-input-schema` 的判据做成两半**。理由见 §12.3——单看「schema 相同」会把
   #547 里成功率 100% 的别名族误判成 bug。
7. **数值界的「没丢」判据是「产物不比契约松」，不是逐字相等**。生成器会合并同向的界
   （`.safe().nonnegative()` 只留 `minimum: 0`），逐字相等会把这个**正确**的合并判成信息丢失。
   放宽的同时补了反方向的阳性对照：产物更松必须红。

### 12.10 参考实现一致性核对：阶段 2 逐条销账

| 核对项 | 阶段 1 时的状态 | 现在 |
|---|---|---|
| **G-01** 根级 `anyOf` 被静默丢弃 | 生成点已拒收（规则在，但没有契约走这条路） | ✅ **销账（新通路）**：三个 canvas 写入工具全部扁平；旧通路 6 处登记为债 |
| **G-02** 失败必须 `throw` | 已满足（`laneTools.mts` 抛） | ✅ 覆盖全部 lane 工具，正文升级成 `code`/`message`/`nextAction`/`allowed`，内外两个投影同源 |
| **G-03** 描述三通道 + 重建系统提示词两段 | ❌ 阶段 2 前必补 | ✅ **销账**：`promptSnippet` / `promptGuidelines` 各就各位，`lanePromptSections.ts` 逐字镜像上游格式重建两段；每工具 ≥1 示例并逐条验过 schema |
| **G-04** 工具输出零截断 | 已满足（`laneTools.mts` 用 pi 的 `truncateHead`） | ✅ 保持 |
| **G-05** 枚举直译成 `const` | 生成点已拒收 | ✅ **销账（新通路）**：`select` 的两个 `z.literal` 改成 `z.enum`；lane profile `const` 命中为 0 |
| **G-06** 改名/改形状后旧会话的旧形状 tool call | ❌ 未做 | ⏸ **仍是债**：`prepareArguments` 的官方首要用途（折旧形状）本阶段没用上——lane 还没有历史会话要迁。**阶段 4 迁移旧转录之前必须补**，否则迁进来的旧 tool call 一律校验失败 |
| **G-07** 路径参数零包容 `containPath()` | ❌ 未做 | ⏸ 仍是债：本阶段搬进来的 4 个能力**没有任何路径参数**，所以没有落点。阶段 3 接生成/导出类工具时补 |
| **G-08** 唯一校验点必须是会强转的那一次 | 阶段 1 已定 | ✅ 保持并写进契约注释：pi 的容忍梯四道全在，宿主不接第二个严格 zod（T3 在新通路上没有对应物） |
| **G-09** `addedToolNames` 动态装载 | ❌ 未评估 | ✅ **已判**：lane 11 个工具塞得下静态目录，本阶段不需要；但 schema 总量 5k token 已超 S7 的 4k，阶段 3 接生成类工具时会需要它。结论写在 `laneToolCatalog.ts` |
| **G-18** 跨进程会话锁 | 进程内已满足，跨进程登记为阶段 2 债 | ⏸ **仍是债**：本阶段没有把 lane 接到 MCP 对外面（`laneIpc` 仍不注册），所以那条路今天依然不可达；阶段 4 接之前必须先有跨进程锁 |

**「没想到」清零情况**：核对表 §4.1 列的阶段 2 前必补 9 条，本 PR 销账 **5 条**
（G-01 / G-02 / G-03 / G-05 / G-09），G-04 与 G-08 在阶段 1 已销，**剩 2 条明确带票**
（G-06 阶段 4 前、G-07 阶段 3 前）。框架边界登记表 `referenceConformance` 那条债因此从
「9 条未处理」降到「2 条带到期时点」。

### 12.11 阶段 2 评审七维：判完之后落地的两条

七维的表在 **§3.7**（那里是规范，这里只记本 PR 实际动了什么）。七条里有两条判完不是「登记」
而是**当场能建成防线**，所以本 PR 一并落地——理由是 R28：能让编译器拦的别留给门岗，
能让门岗拦的别留给人，而「登记」是备忘录不是防线。

1. **⑨ 副作用自声明**（`LaneToolSpec.effects`，必填）。落地前这三件事散在三个地方：`replay`
   在 `laneTools.mts` 里对**每一个**工具硬写 `'never'`、「可逆」写在 `CANVAS_GUIDELINES` 的
   散文里、「花不花钱」压根没人写。散着的后果不是难看：阶段 3 第一个真正**花用户钱**的工具，
   会以和一次 `read_timeline` 完全相同的形状进来，没有任何一层会因此报错。
   改法是把它做成契约上的必填字段，于是**编译器成了最早那道防线**。
   顺带修掉一个真实的小缺陷：5 个纯读工具此前也被标成 `replay: 'never'`，冷恢复因此白白
   丢掉本来能自动补上的那次读——它不会报错，所以此前没人发现。
   两条装配期不变量（改状态 ⟺ 说得出怎么收回；花钱必然改状态）各带一个阳性对照。
   **审批档刻意不在本阶段声明**：闸今天由宿主经 `OpenLaneOptions.gate` 传入、面板还没接，
   现在写就是写一个没有消费者的字段；阶段 3 闸落地时由 `effects` 供档，不新增第二处声明。

2. **⑪ 的收据那一半**（`LaneUsage` 新增 `cacheReadTokens` / `cacheWriteTokens`）。
   pi 的 `Usage` 本来就分开报这两列，是我们的中立契约层把它们合掉了。合掉的代价不是少一行
   数字：缓存命中的 token 便宜一个数量级，合成一个「输入」就把「这一轮贵在哪」抹掉了；
   更要紧的是，**它是唯一能告诉我们前缀合同被自己抖坏的信号**——工具定义或系统提示词抖一个
   字节，整段前缀作废（`tools → system → messages` 逐级失效），症状就是这一列塌到 0 而
   `input` 猛涨。面板收据因此多一列 `cache`（`ContextUsage.cache` 本来就在，一直空着）。
   写入那一列留在契约里**不上屏**：一条新 lane 的第一轮几乎全是写入，印出来只会误导。

**另外五条的处置**（判据与出处见 §3.7）：⑥ 预算已满足、按场景切菜单登记到阶段 3 并写下了
它的代价（切一次 = 买一次缓存重建）；⑦ 长任务形态登记到阶段 3，形态复用旧通路的
`nomi_get_run`，硬约束是不许在 `execute` 里干等；⑧ id-only + 读后写已满足，并**明着标出
不做模糊解析**；⑩ 版本与退役并到 G-06（阶段 4 前必补），同时说清了官方的「日期后缀 + 新旧并存」
我们不能抄的理由；⑫ 延迟加载判定**不开**，闸门数字（>12 个工具或 schema >10k token）
写死进 `laneToolCatalog.ts`。

### 12.12 合并评审的三处必改（2026-09-07，Fable 评审 PR #589 → fixup PR）

评审按「模型第一次能不能写对」实跑发布版 schema，照出三条本节此前写成「已满足」而代码里
**没人调用**的东西。判据全是零额度的结构探针，不是推测。

| # | 实核 | 修在哪（唯一 owner） |
|---|---|---|
| 1 | **扁平 schema 的 `transform` 在运行期没人跑**。pi 只用 `parameters` 跑 ajv（形状），不认识 zod；`execute` 拿到的是 ajv 放行的扁平对象，跨字段约束与「别的 operation 的字段会被拒」（工具描述里的承诺）一路绿到领域端口。§12.2 第 2 行「接受/拒绝集合一个字没变」只在单测里成立 | `laneTools.mts` 的 `execute`：ajv 之后跑**一次**契约 parse，失败按 §3.3 形状 throw（字段名 + 类型名 + `allowed` + 下一步，不回传值）。不是第二个形状验证器——ajv 刚验过形状，这里只剩组合错误 |
| 2 | **三个语义分组不继承全量 union 的 `superRefine`**。分组从 `.options` 拼出来是裸 union，§12.2 第 3 行「connect 至少一条边下沉进 superRefine」在 lane 发布的 `nomi_canvas_write` 上不可达；`create_camera_move` 不带 `move`/`customMove` 同样合法 | `canvasWrite.ts`：`canvasWriteCrossFieldRefine` 成为唯一 owner，全量 union 与三个分组（含 lane 侧 `.extend()` 后重建的两个）都挂它 |
| 3 | **`composeLaneSystemPrompt` 零生产调用者**。`laneHost` 把 `options.systemPrompt` 原样递给 `AgentHarness`，通道②③写满了一个字都到不了模型——正是 G-03 说的「只补一半等于没补」 | `laneHost.mts`：宿主按 `options.tools` 自己拼两段，调用方只给身份提示词（R28：不靠下一个人记得） |

三条各带阳性对照：`lane-tool-contract.test.mts`（发布版 spec 逐条拒收）与 `lane-tool-output.test.mts`
（经 pi 的 ajv → 契约 parse → 模型看到的失败正文；供应商真的收到两段）。

**顺带的诚实修正**：§12.7 的两臂 A/B 跑在这三条缺口之上。脚本不进仓库，所以 12 条任务有没有踩到
跨字段约束**无法从仓库复核**；能说的只有：「S2 schema 落地 12/12」证明的是形状，不是组合——组合那一半
从这里起才有机器判据，且两臂共享同一条缺口（差异不受影响，绝对值不该被引用为「组合也对」）。

**评审登记、未在本 PR 动的**（各带阶段与出处）：
- 看门狗：新通路零看门狗（`observeNativeStream` 只在 `run.mts:164` 的旧路），与工具契约正交 → 阶段 3，
  深度方案 §1.6 + §4.3 P3（loopback 首字节永不返回的阳性对照）。
- pi 校验器的报错会把 `Received arguments` 整包回给模型（`pi-ai/dist/utils/validation.js:306`），
  §3.3 的隐私边界在**形状**错误上仍未收口（本 PR 只收了组合错误那一半）→ 阶段 3 与看门狗同批：
  要么 `prepareArguments` 里先按类型名拒、要么接受 pi 的形状报错——需要一条判断，不该悄悄选。
- `canvasModelShapes.ts`（新 owner）仍依赖过渡补丁 T1 的 `jsonTolerantArray` → 阶段 4 删 T1 时一起改。
- 旧通路 6 处 `root-union` + 1 处 `identical-input-schema` 冻结在 `model-schema-baseline.json` → 阶段 4 归零。

