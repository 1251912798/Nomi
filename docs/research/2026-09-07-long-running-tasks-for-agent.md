# Agent 长任务调研：pi 的 deferred 是什么 / 别人怎么做 / 我们已有的形状与阶段 3 该定什么（2026-09-07）

> 状态：📎 交接/日志 —— **只调研不改码，一行产品代码未动。**
> 日期：2026-09-07 · 基线：`origin/main@6a7c81786` · pi 锁定 `0.85.1`
> 服务对象：[`docs/plan/2026-09-07-agent-rebuild-stage3-5-deep-plan.md`](../plan/2026-09-07-agent-rebuild-stage3-5-deep-plan.md) §1.2（审批期 lane 的 operation 状态）与 §1.6（看门狗/重试/超时四件事）——两节都假设「lane 在等」只有审批与重试两种，**没有第三种：等一个跑几分钟的生成**。本篇补这一种。
> 引用格式：pi 侧相对 `node_modules/@earendil-works/`；仓库侧相对仓库根；外部给 URL。

---

## 0. 要回答的问题

1. pi 的 `DeferredHandle` / poll 到底是什么层的东西？能不能拿来做「等一个 5 分钟的视频生成」？
2. 专业实现（Claude Code、Codex cloud、OpenAI 后台模式、Agents SDK、Temporal 这类 durable execution）各自的形状？
3. 视频产品里的长任务（排队、进度、断点续、预算停）？
4. 我们 `productionRun` 与 lane 的对接形状，阶段 3 该定什么？

---

## 1. 结论先行

1. **pi 的 `DeferredHandle` 不是通用长任务，它是「模型请求被挂起」那一层。** 结构是 `{provider, modelId, api, id, expiresAt?, pollAfterMs?, data?}`，注释自陈 `id` 是 "Provider token, such as a response id or batch id plus row id"（`pi-ai/dist/types.d.ts:291-301`）。它对应的是 **OpenAI 后台/批处理模式**那类「把一次推理交给供应商异步跑」，**不是**「我调了一个工具、这个工具要跑五分钟」。**工具级长任务上游给零**，工具级超时也给零（[#8857](https://github.com/earendil-works/pi/issues/8857)）。
2. **但 deferred 这条通路在 harness 上是完整的、且我们从没跑过。** 挂点全在：`SuspendedRun{operationId, status:"suspended", deferred}`（`pi-agent-core/dist/harness/agent-harness.d.ts:14-18`）、`DriveOptions.pollDeferred`（`:88`）、`CurrentOperationInfo{kind:"waiting", reason:"deferred", deferred}`（`:112-121`）、`LaneSnapshot.operation.deferred{handle, poll}`（`:192-195`）、事件 `run_suspend{reason:"deferred", deferred, poll}`（`:216-218`）、`before_request` 的 `step` 枚举含 `"deferred"`（`:523`）。假 provider 侧也有钩子：`pi-ai/dist/providers/faux.d.ts:25,33,80-81`（`deferred` / `cancelledDeferred` / `fetchDeferred` / `cancelDeferred`）。**这意味着一条零额度探针就能把它跑通**（§4.4 的 P-C3）。
3. **我们要的那种长任务，形状已经在 main 里了，而且长得跟业界最好的那几家一样。** `productionRun` 的工具面就是标准的三件套：`start_production_run` 拿 id → `subscribe_production_run{runId, afterCursor, waitMs ≤ 25000}` 游标 + **有界等待** → `read_production_artifact` 取结果（`electron/harness/tools/productionRunDescriptors.ts:13-40`）。调度器本体是一个**无自有状态的 durable loop**：每 tick 读 durable Run → 纯函数 `deriveBatchPlan` → 变成副作用；崩溃重启重跑同一循环收敛（`electron/productionRun/multiShotBatchScheduler.ts:9-16`）。
4. **这个形状与 Temporal 的 durable execution 是同构的**：Workflow（确定性、可重放）/ Activity（副作用、可重试）↔ 我们的 `deriveBatchPlan`（纯）/ 提交与轮询（副作用）/ durable Run（事件史）。两件 Temporal 有而我们没有的：① **timer 作为 command**（我们的等待是进程内真 sleep，进程死了就得靠外部再 kick）② **signal/query**（我们靠 IPC + `kickBatchSchedulerForRun`）。
5. **所以阶段 3 的活不是"造长任务"，是"把已有的长任务正确地接进 lane，并且不让它和审批抢同一条『lane 在等』的语义"。** 具体三条见 §4.2。

---

## 2. 一手来源

### 2.1 pi 侧实核

| 面 | 位置 | 说明 |
|---|---|---|
| `DeferredHandle` 结构 | `pi-ai/dist/types.d.ts:291-301` | `provider / modelId / api / id / expiresAt? / pollAfterMs? / data?`；`id` 注释明说是 "response id or batch id plus row id" |
| provider 侧接口 | `pi-ai/dist/models.d.ts:93-94`（`fetchDeferred?` / `cancelDeferred?`，**可选**）、`:143-145`（`Models` 上的 `streamDeferred/fetchDeferred/cancelDeferred`） | **可选实现**——我们的 `createNomiProvider` 今天没实现，所以这条路对我们**目前恒不触发** |
| harness 挂起 | `pi-agent-core/dist/harness/agent-harness.d.ts:14-18`（`SuspendedRun`）、`:216-218`（`run_suspend` 事件）、`:192-195`（`LaneSnapshot.operation.deferred`）、`:112-121`（`CurrentOperationInfo` 的 `waiting/deferred`）、`:88`（`DriveOptions.pollDeferred`） | 投影层完整。**注意 `:82-90` 的 `DriveOptions` 同时有 `waitForRetry` 与 `pollDeferred`——两种"等"在类型上是分开的**，这正是 §4.2 第 1 条要抄的分法 |
| 工具级长任务 / 超时 | 无 | 上游明说不做（deep plan §1.6 已记；issue [#8857](https://github.com/earendil-works/pi/issues/8857)） |
| 假 provider 可造 deferred | `pi-ai/dist/providers/faux.d.ts:25,33,80-81` | 探针不需要真钱 |

**一条对阶段 3 直接有用的读法**：pi 把「等重试」（`reason:"retry"`, `notBefore`）与「等 deferred」（`reason:"deferred"`, `deferred`）做成 `CurrentOperationInfo` 的**两个不同 kind**（`:112-121`）。而 deep plan §1.2 打算把「等审批」也塞进 `operation` 保持非空——那就是**第三种等**。三种等在面板上说的是完全不同的话（「正在重试 2/4」/「模型那边还在算」/「等你点一下」），**不该共用一个"operation 非空"就完事**。

### 2.2 专业实现对照

| 实现 | 提交 | 观察 | 取消 | 边等边干 | 恢复 |
|---|---|---|---|---|---|
| **OpenAI Responses 后台模式** | `background: true` 创建 | 状态 `queued / in_progress / completed / failed / cancelled`；`GET /v1/responses/{id}` 轮询（官方建议 **每 2 秒**）；`background+stream` 时按 `sequence_number` 当游标 | `POST /v1/responses/{id}/cancel`，**幂等** | 是 | **`starting_after` 用上次游标续流**；数据默认只留约 10 分钟，要更久得 `store=true` |
| **Claude Code 后台子 agent** | fork 模式下**默认后台** | 面板有行；父会话照常干活 | 是 | 是；并发上限 **20** | 完成后**在后一轮**给 completion notification；子 agent 可有自己的 `memory` 目录（`user`/`project`/`local` 三档） |
| **Codex cloud** | 描述任务 → 起一个**独立环境** | 日志可看**但不必看** | —— | 明写 "let them continue while you work on something else" | 回来给 **summary + diff**，approve 才开 PR；环境是否有外网由管理员配 |
| **OpenAI Agents SDK** | Sessions（SQLite/Redis/Mongo 等多种后端）持久工作上下文 | 内建 tracing | —— | human-in-the-loop 中断点 | 官方文档**未提** Temporal 或任何外部编排（**这条是「查了没有」，不是没查**） |
| **Temporal** | Workflow 发 Command，Service 记 Event | Event History = 「ultimate autosave」；Worker 崩溃后按历史**重放**恢复到崩前状态 | —— | timer 是 **scheduled Command 不是真 sleep** | **副作用必须住 Activity**（Workflow 必须确定性）；Activity 重试策略是**配置**不是代码；已完成 Activity 重放时不重跑 = 幂等 |
| **ChatCut Desktop 插件**（本机实测：`~/.claude/skills/chatcut-transcription/SKILL.md`） | 提交转写 | `track_progress{action:"wait", target:"transcription", assetIds}` = **有界等待**；并给了一条**判"卡住"的量化规则**：`max(5 min, min(60 min, 2 × 素材时长))`，时长未知则跨 ≥2 次调用等 ≥10 分钟 | `manage_transcript{action:"retry_transcription"}`（**不等完成**，之后再 `wait`） | 是 | 明写「不要凭一次非终态就宣布卡住」 |

来源：<https://developers.openai.com/api/docs/guides/background> · <https://code.claude.com/docs/en/sub-agents> · <https://learn.chatgpt.com/docs/cloud> · <https://openai.github.io/openai-agents-python/> · <https://docs.temporal.io/evaluate/understanding-temporal> · ChatCut Agent Plugin 技能（本机 `~/.claude/skills/chatcut-transcription/SKILL.md`，非公开 URL）

**ChatCut 那条「判卡住的量化规则」值得单独拎出来**：它把「这个任务是不是死了」从一个**感觉**变成一个**跟素材时长挂钩的公式**。我们的 `pollHorizonMs` 今天是一个固定 300s（`multiShotBatchScheduler.ts:29-33`），对 10 秒的图和 3 分钟的视频用同一个数——同一个病。

### 2.3 视频产品里的长任务

| 事实 | 出处 |
|---|---|
| 供应商查询间隔契约 **≥3–5s** | `docs/plan/2026-07-31-seedance-api-contract-reconciliation.md` §三（本仓一手对账），被 `multiShotBatchScheduler.ts:24-33` 的「3s 起、翻倍、15s 封顶」直接引用 |
| 真实视频供应商「takes MINUTES」，所以 dispatch 只提交+轮询一次，其余进 `observe` 列表分轮真等 | `electron/productionRun/multiShotBatchScheduler.ts:24-33`（2026-08-25 APIMart 真付费验收抓到的三洞修复） |
| 在飞的活超过 `pollHorizonMs` 时，drive 以 `quiescent: false` 休息，由 caller 再 kick——**只要还有可轮询的活就绝不 `true`** | 同上 + `electron/capabilityCore/appIntegration.ts:409`（`if (!outcome.quiescent) scheduleBatchRekick(projectId, runId)`）、`:570`「Durable, restart-safe kick」 |
| 不重复提交靠 outbox intent log；不重复扣费靠 commandId 幂等的 ledger | `electron/productionRun/submissionOutbox.ts`（`SubmissionNotDispatchedError` / `SubmissionReceiptUnknownError` / `SubmissionReconciliationRequiredError`）+ `electron/productionRun/budgetLedger.ts:8-14`（`authorize / reserve / mark_unsettled / settle / release`） |
| 预算耗尽是**一等状态**不是异常码 | `BudgetExhaustedError` / `BudgetHalt`（`batchScheduleDerivation.ts`，经 `multiShotBatchScheduler.ts:1`） |
| Run 有 15 个状态、Job 有十几个状态，含 `retry_wait` / `needs_attention` / `pausing` | `electron/productionRun/productionRunTypes.ts:51-80` |

**Runway 与 Kling 的官方任务契约本轮没查成**：`docs.runwayml.com/api/` → `learn.runwayml.com` → `help.runwayml.com` 三跳后 404；`app.klingai.com/global/dev/...` 跳 `kling.ai/document-api/...` 返回的页面无实质内容。**这两格明着空着**，本篇关于视频供应商队列的结论全部来自本仓的一手对账，不是从它们的文档抄的。

### 2.4 自媒体来源（TikHub · 必填）

抓取命令：

```bash
source ~/.zshenv
node scripts/research/tikhub-search.mjs --q "AI视频 批量生成 排队" \
  --platform all --limit 8 --out docs/research/2026-09-07-agent-web-memory-longtask/tikhub/AI视频_批量生成_排队/
```

产物附件：`docs/research/2026-09-07-agent-web-memory-longtask/tikhub/AI视频_批量生成_排队/tikhub-search.{json,md}`（32 条）

| 平台 | 出处 URL | 作者 | 发布 | 摘要（原文，未改写） |
|---|---|---|---|---|
| 抖音 | <https://www.douyin.com/video/7623747853235604799> | 上班时间打酱油 | 2026-04-01 | 「**排队 8 万人？别再给Seedance当保安了！** 我写了个全自动排队神器」 |
| 抖音 | <https://www.douyin.com/video/7636372630030945642> | 老亮的快乐生活 | 2026-05-05 | 「解决ai生成视频排队的问题，还降低了制作成本！」 |
| 抖音 | <https://www.douyin.com/video/7628590960838601186> | 丽丽聊Ai | 2026-04-14 | 「即梦免排队 2 个技巧，效率直接拉满！」 |
| 抖音 | <https://www.douyin.com/video/7635284219517786218> | 老亮的快乐生活 | 2026-05-02 | 「教你用既梦ai怎么不排队，seedance2.0fast无限生成。效率很快。」 |
| 抖音 | <https://www.douyin.com/video/7644122114181739328> | 叫我陈永仁 | 2026 | 「我让Codex做了一个自动视频工具 真正的一键批量，可以调用任何模型。」 |

**读到的真实摩擦**：

1. **「别再给 Seedance 当保安了」——这一句就是整节的结论。** 用户对长任务的痛不是"要等多久"，是**"我得守在那儿"**。这直接决定了阶段 3 的验收判据：关掉窗口、去干别的、回来东西在那儿 —— 而不是"进度条画得好不好看"。
2. 排队这件事在他们眼里是**可以被绕过的**（换 fast 档、换时段、写脚本自动重投）。也就是说：面板上光说「排队中」是不够的，**得说清"我在替你重投/我在等哪一档"**，否则用户会自己去别的工具绕。
3. 「一键批量、可以调用任何模型」是他们自己拿 Codex 造的——**这正是 Nomi 的 `productionRun` 已经在做的事**。我们不缺能力，缺的是让它在 Agent 对话里被正确地表达。

---

## 3. 反方视角

| 别人的做法 | 出处 | 它为什么这么选 | 对我们成立吗 |
|---|---|---|---|
| 供应商侧后台推理（`background:true` / pi deferred） | §2.1、§2.2 | 一次推理可能几分钟，长连接不可靠 | ⚠️ 我们的**文本**模型请求很少这么长；但如果哪天接了 reasoning 重档，这条通路 harness 已经给好了——**先跑一次探针把它验活，别等到那天** |
| 后台子任务 + 完成后通知（Claude Code） | §2.2 | 主会话不能被堵 | ✅ **正解**。我们的 lane 也必须是「工具提交后立刻返回，别在 `before_tool` 里挂五分钟」 |
| 独立环境 + 回来给 summary+diff（Codex cloud） | §2.2 | 长任务的"结果"应该是一份**可复核的东西**，不是一段流 | ✅ 我们已经有：`read_production_artifact` + 门（gates）。这正是 `productionRunTypes.ts:51-65` 里那一串 `awaiting_*_review` |
| Workflow/Activity 分离 + 事件史重放（Temporal） | §2.2 | 崩溃恢复靠重放，不靠代码 | ✅ **我们已经是这个形状**（`multiShotBatchScheduler.ts:9-16` 的注释就是这段话的中文版）。差的是 timer 与 signal |
| 引入 Temporal / Inngest 本体 | —— | 分布式、多进程、跨机 | ❌ **R20 三问**：① 通用问题？是。② 同类怎么做？服务端产品用 Temporal，桌面单进程产品不用。③ 在护城河上？不在——但**代价不成比例**：它要一个 server/worker 拓扑，我们是一个 Electron 主进程。我们已经用最小成本拿到了它 80% 的性质（纯派生 + durable Run + 幂等 ledger） |
| 固定 poll horizon | 我们今天（`:29-33` 默认 300s） | 简单 | ⚠️ ChatCut 的 `max(5min, min(60min, 2×时长))` 更对：**按素材/任务规模缩放**，而不是一个魔数 |

---

## 4. 对 Nomi 的可落地项 / 不落地项

### 4.1 我们已经有的（**别重造**）

| 件 | 位置 | 它对应业界的哪一块 |
|---|---|---|
| 提交拿 id | `productionRunDescriptors.ts:36-40` `start_production_run` | `POST` 拿 task id |
| 游标 + 有界等待 | `:19-25` `subscribe_production_run{afterCursor, waitMs ≤ 25_000}` | OpenAI 的 `sequence_number` + `starting_after`；ChatCut 的 `track_progress{action:"wait"}` |
| 查状态 | `:13-17` `get_production_run`（status / gates / jobs / budget / artifact refs） | `GET /v1/responses/{id}` |
| 取结果 | `:27-34` `read_production_artifact` / `…_content` | Codex 的 summary+diff |
| 控制 | `control_production_run` | cancel |
| durable loop | `multiShotBatchScheduler.ts:9-33` | Temporal 的 Workflow 重放 |
| 再 kick | `appIntegration.ts:409,570` + `batchSchedulerKick.ts:28` | Temporal 的 timer（我们的是进程内版） |
| 不重复提交 / 不重复扣费 | `submissionOutbox.ts` + `budgetLedger.ts:8-14` | Activity 幂等 |
| 预算停 | `BudgetExhaustedError` / `BudgetHalt` | —— |

### 4.2 阶段 3 该定的三条（这是本篇给 deep plan 的增量）

| # | 要定的 | 决定 | 理由 |
|---|---|---|---|
| **L1** | **lane 的工具面对长任务只暴露 submit / subscribe / control，不暴露"等到好"** | `start_*` 立刻返回 runId；模型要进度就自己调 `subscribe_*`（有界 ≤25s）。**任何工具都不许在 `before_tool` / `execute` 里挂过 `execution.timeoutMs`** | deep plan §1.6 给读类 30s、生成类"按能力"——**"按能力"在这里要定死成"生成类工具不等结果"**。否则「等生成」会和「等审批」（§1.2）抢同一条 lane 空转语义，而两者的 abort、崩溃恢复、面板文案完全不同 |
| **L2** | **面板上的"等"要分三种，抄 pi 的 kind 分法** | `waiting/retry`（"正在重试 2/4"）· `waiting/approval`（"等你点一下"）· `waiting/production`（"3 镜在跑，最早的已等 2 分 10 秒"）。第三种的数从 Run 的 jobs 投影来，不从 lane 来 | `CurrentOperationInfo` 已经把前两种分开了（`agent-harness.d.ts:112-121`）；第三种是 Nomi 独有的，别塞进 operation 里冒充模型在算 |
| **L3** | **重启后谁把"我有在跑的活"说出来** | 今天 `appIntegration.ts:570` 的 kick 是 durable 的，**但 lane 侧不知道**。阶段 3 要在 lane `open` 时把「这个项目有 N 个在跑的 run」作为一条宿主 custom entry 投影进转录（复用 §1.4 的 `appendCustomEntry` 命名空间） | 否则用户关窗再开，看到一片空白，以为活丢了——而钱其实还在花。这是 §2.4 摩擦 1 的直接对策 |

**另外两条便宜的修正**：

- **`pollHorizonMs` 从魔数改成随任务规模缩放**（抄 ChatCut：`max(下限, min(上限, k × 预期时长))`），预期时长从能力档案取。今天图和视频共用 300s。
- **`quiescent:false` 的再 kick 是进程内 timer**——进程被杀就断了。要么在 open 时无条件扫一遍未完成 run（最便宜），要么承认「App 没开就不推进」并**在 UI 上明说**（D4 诚实交付）。

### 4.3 不落地

| 项 | 为什么不 |
|---|---|
| 引入 Temporal / Inngest | §3 表末行：拓扑代价不成比例，且我们已拿到它 80% 的性质 |
| 让模型直接拿到"等到好"的工具 | 那等于把 lane 变成阻塞式，审批、abort、崩溃恢复三条线全部要重做 |
| 现在就实现 provider 侧 `fetchDeferred` | 我们的文本模型请求没长到需要它。**但要先跑探针 P-C3 验活**，免得哪天接了重推理模型才发现投影是坏的 |

### 4.4 探针（零额度）

| # | 探针 | 断言 | 红了说明什么 |
|---|---|---|---|
| **P-C1** | 假模型调一次 `start_production_run`（mock 供应商，永不结束） | lane 在**秒级**内回到 idle，`operation === null`；转录里有一条「已提交，runId=…」 | 生成类工具在 lane 里挂着（L1 没落地） |
| **P-C2** | 提交后**直接丢掉 harness**，重开 lane | 断言 ① 投影里出现「有 N 个在跑的 run」 ② 再 kick 后不重复提交（outbox）③ ledger 不重复扣 | L3 没落地 / 幂等被绕过 |
| **P-C3** | **用 `pi-ai` 的 faux provider 造一次 deferred**（`providers/faux.d.ts:25,80-81`）：让模型请求返回 `deferred` 而不是完成 | 断言 ① 出现 `run_suspend{reason:"deferred"}` 事件 ② `LaneSnapshot.operation.deferred{handle, poll}` 有值 ③ 面板不把它画成"正在生成" ④ close→open 后 `pollDeferred` 能续上 | **这条通路今天没人跑过**。红了说明我们的投影层对 deferred 是坏的，而它会在接第一个后台推理模型的那天炸 |
| **P-C4** | 把 `pollHorizonMs` 设成 1s，喂一个 10s 的 mock 生成 | drive 以 `quiescent:false` 休息、再 kick 后接着轮询、最终成功，且**用户面看到的是"还在跑"不是"失败"** | horizon 被当成超时用了 |
| **P-C5** | 预算设成只够 2 镜，提交 5 镜 | 到 `BudgetHalt` 时模型收到的是**可行动 reason**（"预算用完，要继续请提高预算或减少镜数"），不是错误码；且已提交的 3 镜不被重复提交 | 预算停没走 §1.6 的错误分类 |

---

## 5. 诚实记分

- **真跑了的**：pi 0.85.1 的 deferred 全部 file:line 实核；仓库侧 `productionRunDescriptors.ts` / `multiShotBatchScheduler.ts` / `appIntegration.ts` / `budgetLedger.ts` / `submissionOutbox.ts` / `productionRunTypes.ts` 实核；ChatCut 插件技能本机实读；TikHub 一组 ×4 平台（附件在仓）。
- **只读没跑的**：OpenAI 后台模式、Claude Code 子 agent、Codex cloud、Agents SDK、Temporal 的官方文档当前版。**本篇零额度，没打一次付费请求。**
- **没查成的（明着标）**：**Runway 官方 API 文档**（三跳后 404）与 **Kling 官方 API 文档**（重定向后页面无实质内容）——§2.3 里关于视频供应商队列的每一条都来自**本仓一手对账**，不是从它们文档抄的；即梦（Jimeng）没有公开 API 文档，只有自媒体侧的排队描述。OpenAI Agents SDK 与 Temporal 的集成：官方文档**明确未提**（这条是「查了没有」）。
- **没验的**：`subscribe_production_run` 的 `waitMs ≤ 25000` 这个上限从哪来、跟宿主 IPC 超时/MCP 客户端超时对不对得上——本轮没追。
