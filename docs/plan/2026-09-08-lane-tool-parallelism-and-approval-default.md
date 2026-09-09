# Lane 工具读并行、写串行与审批默认档

> 📋 方案；产品默认方向已于 2026-09-08 16:40 拍板，实施未开始。
> 实读基线：`93c74930908743b6d8890bf7c8dc7ab42b84b4c5`；pi core / coding-agent `0.85.1`。下列仓库行号相对该基线，`node_modules` 行号相对锁定版本。
> 本次仅交本文与 `docs/plan/INDEX.md`；不改生产、测试、依赖、框架登记表，不发上游 issue。实施排在 lane 切换 PR 合并后，作为第一个小 PR；先重新核对切换后的端口，不把影子链路当用户已可达。

## 1. 摩擦、结论与边界

模型一轮读文稿、画布、时间轴，本来可以同时等三个读结果，现在却一个个排队。用户还要为可撤销修改反复点“允许”。本方案让独立读取重叠执行，让已证明可撤的本地修改直接执行，卡片报告“做了什么 + 一键撤销”。写入仍按 lane 内到达顺序执行，以免两个修改互相覆盖。

用户定案：“除非花钱 其他都别一直问 能撤销不就可以吗”。默认只为花钱、撤不回来的动作、只看不动的工作模式保留介入；**没有真实撤销证明的动作暂按不可撤处理，继续问，并明确缺口**。三档、花费轴、`effectClass`、`requiresPlanReview` 和工作模式优先级保留。用户显式选择 `step` 仍每步问；“只问三类”描述新默认，不覆盖其主动选择。

**核心取舍：减少打断必须用真实撤销能力换，不能只改一个默认常量。** 运行级改 `parallel`，Nomi 只补一把 lane 写锁，不重造 pi 的批次调度、结果排序、消息队列或恢复系统。读不持写锁，因此同批读写没有快照一致性；依赖写后值的读取必须放到写完成后的下一轮。

### 1.1 实读纠正：并行不代表并行等待审批

`node_modules/@earendil-works/pi-agent-core/dist/harness/agent-harness.d.ts:632` 只有运行级 `toolExecution?: 'sequential' | 'parallel'`，没有并发数。`harness/runtime/harness.js:46` 默认 `parallel`。Nomi 在 `electron/agentLane/laneHost.mts:190-200` 明确选 `sequential`，且两个消息队列保持 `one-at-a-time`。

**关键机制**：`harness/runtime/drive/tools.js:401-406` 的 `for` 循环逐个 `await startToolInvocation`；后者在 `:334` 等 `prepareToolInvocation`，预检在 `:314-320` 等 `before_tool`。只有预检通过、effect intent 持久化后才返回仍在执行的 `completion`（`:338-342`）；循环启动后面的调用，最后 `Promise.all(jobs)`（`:413`）。因此工具执行可以重叠，预检入口不能越过前一个尚未返回的预检。单 lane 此版本不可能有两个来自同批 harness 的调用同时卡在审批里。一次 hook 内多个 handler 也按注册顺序 await（`harness/hooks.js:108-125`）；hook 本身不是全局 mutex。

`electron/agentLane/laneTools.mts:205-221` 从 `effects.mutates` 派生 `executionMode` 与 `replay`，但 harness 的分派只读运行级字段（`tools.js:440-447`），没有消费 per-tool `executionMode`。框架登记表 `docs/engineering/framework-boundaries.json:135-138` 已把该字段列 `derived`；`:241-245` 的运行级常量理由却推测会同时弹多卡，**与本版实读不符，实施时改该理由与值**，本轮不越界改登记表。

3d 的 `[0,1,2,3]` 是用户消息逐次消费的断言（`tests/agent-runtime/lane-queue.test.mts:95-120`），不能拿来证明工具串行。两个 `one-at-a-time` 保留；一次用户指令仍是一轮独立工作。

## 先查别人

本节为 §2，R5 / R29 仅核对工具执行调度层。

Context7 已 resolve/query `/earendil-works/pi`，命中 [Agent README](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md) 与 [Harness 文档](https://github.com/earendil-works/pi/blob/main/packages/agent/docs/harness.md)。查询混有旧 Agent 与 Harness 两套行为，以下以本地锁定版为准。官方格式仍使用 pi tools、hooks、transcript；无新外部协议、无自定义旁路转录。

| pi 提供 | 我们用了 | 我们另写了 | 我们拆散了 |
|---|---|---|---|
| 运行级两模式，默认 parallel（`harness/agent-harness.d.ts:632`；`harness/runtime/harness.js:46`，均在 core/dist 下） | 明选 sequential（`laneHost.mts:193`） | 现状无写锁；拟在 lane 工具执行边界加 FIFO 写互斥（本文 §4） | 未拆框架调度；只是目前关掉其并行模式 |
| 逐个预检，执行重叠，最后收齐（core `harness/runtime/drive/tools.js:304-343,392-415`） | `before_tool` 承载审批及回合限制（`laneHost.mts:259-313`） | 用户等待、按 toolCallId 答复、取消注记（`laneApprovalGate.ts:111-277`） | 审批领域事实留 Nomi，工具状态仍归 pi；不得把预检搬到第二个 loop |
| toolCallId、effect intent、replay 恢复（同 `tools.js:314-357`） | `mutates` 派生 replay，写 never、读 safe（`laneTools.mts:217-225`） | 以 toolCallId join 审批注记（`laneHost.mts:273-285`）；领域幂等/撤销仍须真端口接通（§5） | 无第二份工具正文/执行日志；join 不等于 exactly-once |
| source-order 结果归档（core `harness/runtime/drive/tool-placement.js:35-64,99-132`） | `laneViewModel.ts:265-284` 按 toolCallId 回填自己的工具行 | 不另写完成顺序排序器 | 执行完成顺序与转录位置有意分离；不能把 UI 顺序当出站顺序 |

依赖里已有：core `node_modules/@earendil-works/pi-agent-core/dist/harness/runtime/drive/tools.js:392-447` 已有并行批次，保留它。仓库里已有：`electron/agentLane/laneApprovalGate.ts:111-277` 已有用户等待与取消，不另造审批系统。生态里已有：[Claude Code 官方执行循环](https://code.claude.com/docs/en/agent-sdk/agent-loop#parallel-tool-execution) 与下述 Codex 源码提供分类/互斥对照。TikHub 自媒体未查：本题要证明锁定 SDK 的内部调度，社媒转述不能替代源码或确定性复现；不声称做过真实用户调研。结论：用 pi 已有调度，只自研领域必需的 lane 写互斥；完整调研留本文，遵守本轮只写 docs/plan 的范围。

### 2.1 参考实现逐层对照（仅本层的九个切面）

[Claude Code / Agent SDK 官方“Parallel tool execution”](https://code.claude.com/docs/en/agent-sdk/agent-loop#parallel-tool-execution) 明确只读 Read/Glob/Grep 与只读 MCP 工具可并行，Edit/Write/Bash 串行，自定义工具默认串行；同页说明 SDK 使用 Claude Code 同一 agent loop。这是官方文档证据，本轮没有实跑其 CLI，不把 Claude API 提示词建议当执行保证。

Codex 固定源码版本 `d6489472f3c15e87d2d7763a5fde033545c530f8`：[parallel.rs:47-60](https://github.com/openai/codex/blob/d6489472f3c15e87d2d7763a5fde033545c530f8/codex-rs/core/src/tools/parallel.rs#L47)、[parallel.rs:155-177](https://github.com/openai/codex/blob/d6489472f3c15e87d2d7763a5fde033545c530f8/codex-rs/core/src/tools/parallel.rs#L155)、[router.rs:235-239](https://github.com/openai/codex/blob/d6489472f3c15e87d2d7763a5fde033545c530f8/codex-rs/core/src/tools/router.rs#L235)：可并行工具拿共享读锁，其余拿排他写锁，锁覆盖 handler。**Codex 的写还阻塞读，比本方案仅写互斥更强，不能说两者一样。**

pi 自带 coding agent：`node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.js:177-238` 用旧 `Agent`，未指定 `toolExecution`；core `dist/agent.js:134` 默认 parallel，`dist/agent-loop.js:285-291` 看 per-tool 字段，但只要一个 sequential 就将整批串行。扩展包装器 `pi-coding-agent/dist/core/tools/tool-definition-wrapper.js:10,32` 保留字段。这不等于 AgentHarness 已支持它。

| 切面 | pi 参考 / Nomi 对照 | 裁决 |
|---|---|---|
| 1 工具声明 | 旧 Agent 读取 executionMode；lane 派生正确但 Harness 忽略（上文源码） | 没想到已查明：实施前夹具钉住，给上游草稿 |
| 2 运行配置 | 上游默认 parallel，Nomi sequential（§1.1） | 改用 parallel，一致 |
| 3 预检 | Harness 顺序 await；Nomi 等用户（§1.1） | 一致；残余卡天然排队 |
| 4 执行 | pi 并行 completion；Nomi 补仅写 FIFO（§4） | 有意不同：本地创作写入要有序 |
| 5 超时 | Nomi 领域超时在 execute arm（`laneTools.mts:234-249`） | 有意不同：审批/锁等待不占执行预算 |
| 6 结果 | pi source-order；Nomi 按 id join（§2 四列表） | 一致 |
| 7 取消 | pi gate + Nomi 等待 resolve（`laneApprovalGate.ts:246-277`） | 有意不同：人类等待必须自行响应停止 |
| 8 恢复 | pi safe 重放 / never 中断；Nomi 重启卡取消（§4.2） | 有意不同：不能替用户复活未确认写入 |
| 9 消息 | pi 队列配置；Nomi 两个 one-at-a-time（`laneHost.mts:194-200`） | 有意不同：一句话一份创作结果，保持不变 |

实施 PR 同步 framework-surface：`toolExecution` constant→`'parallel'` 并写明局部写锁；`executionMode` 仍 derived；`replay` 仍 derived；hooks/execute 消费位置按实施后行号校正。四列表、九切面、字段裁决进现有 `framework-boundaries.json`，不得新建第二个登记体系。本文完成调研方案，不谎称机器登记已经更新。

## 3. 写的分类与审批默认判定

不能用名字带 write 或 timeout 长短单独决定副作用。**权威来自能力契约 + 模型描述符**；`contractId` `.read/.write` 是核对线索。契约 `execution` 是 `port/availability`（`capabilityContract.ts:41-44`）；模型工具 `execution` 当前仅 `timeoutMs`（`modelFacingTools.ts:82-95`），不是调度枚举。调度从 `effects.mutates` 派生，审批从契约 `effect/effectClass/operationEffectClasses/requiresPlanReview` 派生（`laneApprovalGate.ts:142-155`）。应在装配期校验两者一致，未知或矛盾不允许作为并行读运行。

本轮实际加载 `LANE_MODEL_TOOL_CATALOG` 得到 11 项，与声明逐项核对：

| 真实工具 | contractId / execution.port | mutates / 执行预算 | 调度 |
|---|---|---|---|
| read_full_text、read_selection | document.read / document | false / 30s | 读不加锁 |
| nomi_canvas_read | canvas.read / canvas | false / 30s | 读不加锁 |
| read_timeline、inspect_timeline_range | timeline.read / timeline | false / 30s | 读不加锁 |
| insert_at_cursor、replace_selection、append_to_end | document.write / document | true / 60s | 写 FIFO |
| nomi_canvas_write、nomi_storyboard_write、nomi_shot_reference_write | canvas.write / canvas | true / 60s | 写 FIFO，不能把提案误当纯读 |

证据：`electron/shared/agentCapabilities/documentModelTools.ts:173-198`、`canvasModelTools.ts:239-260`、`timelineModelTools.ts:82-88`；目录 `electron/agentLane/laneToolCatalog.ts:39-57`。技能写、生成控制、导出、删除项目并不在这份 11 项目录中；未来装配也必须分类，不能因没有 `.write` 后缀逃掉锁。coding 工具另走 `laneCodingTools.mts:201` 的包装，不经 `createLaneTools`；实施时若切换分支已接入，read/grep/find/ls 才可判读，edit/write/bash 统一写且未证明可撤前留审批。不能只给 11 项加锁后宣称所有 lane 工具都安全。

### 3.1 默认与判定顺序

现状默认 `safe-auto + confirm` 在 `electron/shared/projectAgentContracts.ts:48-69`；`capabilityApprovalPolicy.ts:57-59` 的硬闸只放 `reversible_local`；`:95-104` 中 step 不复用、project 复用本地可撤、safe-auto 还检查 `requiresPlanReview`/grant。`laneApproval.ts:88-107` 工作模式先判，再判复用，最后无 UI 拒绝。

**推荐默认改现有 `project + confirm`，不新加第四档。** 显式存储的 step/safe-auto/project 原样保留；缺省值用新默认。实施时核对设置写入点，不能将所有旧 safe-auto 无条件迁成 project。`requiresPlanReview` 字段与显式 safe-auto 的首问逻辑保留；新默认 project 仅在动作已有真实撤销链时免首问，计划内容转为执行后说明。能力事实错误或撤销链缺失必须在共享判定输入/契约层收紧，不靠 lane 工具名白名单，也不再创造 effectClass 枚举。

| 优先级 / 事实 | 默认行为 | 保留边界 |
|---|---|---|
| 工作模式 ask + 读 | 执行读取 | `capabilityWorkModeDecision:73-76` |
| 工作模式 ask + 任意写 | 不执行；说明只看不动，需用户主动切换模式 | “第三类要问”不是 allow-once 绕过 ask；沿用 denied-by-policy（`laneApproval.ts:88-96`） |
| editSelection | 只读或可撤选区修改；冻结目标/CAS 继续校验 | `capabilityApprovalPolicy.ts:78-83`，模式不放宽权限 |
| 花钱：生成/超预授权续跑 | 必须有当次明确花费授权；新费用/超预算重新问 | confirm 默认不变；within-budget 仍不能凭字段铸造预算、不能跳过领域花费闸 |
| 永久删素材、删项目、覆盖已有导出、对外发布 | 逐次问；不能批准会话级豁免 | irreversible / destructiveHint 只抬高摩擦 |
| 本地写真可撤，且无上述限制 | 自动执行，成功后给操作绑定的撤销入口 | 新默认 project；不得只有“可撤”声明而无回执/逆操作 |
| 标称可撤但证据待补 / 未知工具 | 保留问；无 UI 则拒绝 | 待补归入不可证明可撤，不构造新的用户设置 |
| 用户显式 step / safe-auto | 原有三档行为 | requiresPlanReview、grant 与花费轴保留 |

花费轴的类型并不等于本次调用已获得授权。当前 `capabilityMayReuseSafeApproval` 对 spend 一律硬闸，未消费 within-budget（`:95-104`）；本 PR 不借改默认扩大付费复用。已存在的预算预留/收据验证仍由 ProductionRun 管（`electron/productionRun/budgetLedger.test.ts:16`；`productionGenerationAuthorizationState.ts:127,211,463`）。“一份已批准预算内续跑不重复问”只在真实授权收据/范围/剩余额度都被领域验证时成立；超额必须停。

### 3.2 真实可撤清单

审计口径：必须有正向写、操作绑定回执、逆操作、并发/人工编辑保护、对应测试；仅能拒绝 proposal、仅有通用 Ctrl-Z、或仅重启后仍是新值都不算完整的一键撤销。下面区分领域已有能力与 lane 端到端接通，**不把“领域可撤”写成“新 lane 已可直接自动”**。

| 动作 | 判定 / 自动档资格 | 代码与测试证据；待补工作量（实施估算） |
|---|---|---|
| 画布纯图修改（含 #630 三项） | **领域可撤**；lane 卡/操作身份接通并走查后自动 | `src/workbench/generationCanvas/store/canvasGraphActions.ts:352-389` 的 updateEdgeMode/disconnectEdge、`canvasNodeActions.ts:166-179` 的 setNodeLocked 建撤销边界；同目录 `generationCanvasStore.test.ts:44-60,95-105` 撤回前态。`src/workbench/generationCanvas/agent/proposalUndo.ts:371-391` 补偿，`proposalUndoReceiptLifecycle.test.ts:185-235` 验证 G5 持久回执和 undoing barrier。小：复用 G5、接 lane id/卡、补真机混合写撤销；不得泛化到所有 canvas.write operation |
| 时间轴采纳 | **领域有条件可撤**；只有该成果仍 landed 时撤销有效，lane 接通后自动 | `src/workbench/adoption/adoptionReceipt.ts:48-70` 防重放误撤、检查 landed、调用 undoTimeline；同目录 `adoptionBridge.test.ts:56` 整批一次撤，`adoptionReceipt.test.ts:139-142` 撤销断言。小到中：接 lane receipt，补连续两次采纳/人工改轴/重开，失效卡不能撤别人的操作；现目录只有 timeline.read，不能冒充已暴露 timeline.write |
| 文稿 insert/replace/append | **待补，暂问** | `src/workbench/creation/WorkbenchEditor.tsx:191-201` → `src/workbench/common/useNomiRichTextEditor.ts:172-178` 是 Tiptap transaction；`electron/agentLane/laneDocumentTools.ts:39-45` 只有写回执，未证操作绑定 Undo。中：隔离 history 边界、revision/id 回执和逆操作，连续两写/人工插入编辑/重启测试；不把编辑器有 history 当逐调用可撤 |
| 分镜 patch_shots / propose_storyboard_plan | **待补，暂问** | `src/workbench/generationCanvas/agent/applyCanvasToolCall.ts:246-301` 写 storyboard store；同目录 `proposalUndo.ts:321-329` 备份只有 nodes/edges/groups，`:371-391` 无 storyboard 补偿。`storyboardPatchShots.integration.test.ts:125-180` 仅证新值持久化和重启保留。中：旧 plan+revision 补偿、跨 store 原子边界、重启/人工改后冲突/真实撤回测试 |
| 技能写 skill.write | **待补，暂问** | `electron/skills/skillPackage.ts:215-234` 创建避让目录写文件；`electron/capabilityCore/skillWriteTransportAdapters.ts:192-206` 内容 hash 去重不是撤销。小到中：记录本次创建文件/目录与 hash、只删除未被用户改过的本次产物、撤销回执/重启/冲突测试；不动预先存在技能 |
| coding edit/write | **待补，暂问** | `electron/agentLane/laneCodingTools.mts:35-47` 声称 undoable，`:291-304` 实际直通上游。中：前像备份、原权限/创建态、hash 冲突检查、操作绑定撤销及恢复测试；不能假设用户工作目录都受 git 保护 |
| coding bash | **不可保证可撤，继续问** | 同一适配器直通任意命令（`:291-304`），现有 effects 声明不能覆盖外部副作用。大且无通用保证：不做通用 shell 撤销；如需自动化，只能拆到已证明可撤/纯读的精确能力，不能凭命令名称猜 |
| 原生删项目 | **不可撤，继续问** | `electron/projects/repository.ts:254-280` 真删目录；`electron/runtime.workspace-projects.test.ts:141-147` 证实目录消失。中：未来若改可撤，要隔离回收、项目身份/路径冲突恢复、重启测试；外部文件夹项目解绑不等于永久删盘 |
| 扣费生成、覆盖已有导出、发布、永久删素材 | **按用户定案继续问**；本轮未宣称逐端口撤销认证 | 取消生成≠退款，删除输出≠恢复被覆盖旧文件，撤下发布≠召回外部副本。费用授权证据见 §3.1；其余此轮只做保守分类，不伪称已审完端口。覆盖导出要先备份旧文件+原子替换才能研究可撤（中）；永久删除需回收协议（中）；付款/外部传播不承诺可逆 |

以上小/中/大是按触点与测试范围估算，不是工期承诺。`nomi_shot_reference_write` 的具体 operation 也须命中纯图补偿证明，否则暂问；同属 canvas.write 不能整族放行。现有 `effectClass` 的 operation override 是收紧分类的地方（`capabilityContract.ts:27-40`），不得在 UI 或模型提示词里另放授权白名单。具体落点：未证明可撤的写 operation 暂收紧为现有 `irreversible`（在审批语义上无法保证收回，不等于声称物理上永远无法恢复）；由 `capabilityEffectClassOf`（`registry.ts:107-119`）统一解析，写粒度不到 operation 的契约先整项收紧。补齐证明后再改回 `reversible_local`，不能只改默认而不收紧事实。

## 4. 最小实施设计

### 4.1 执行边界

1. `openLane` 创建一把本 lane 生命周期内共享的 FIFO 写锁，交给该 lane 所有写工具包装；不是每次调用新建锁，也不是全项目/全 app 全局锁。不同 lane 的冲突继续由领域 revision/CAS/receipt 守卫裁决。
2. 把运行级 `toolExecution` 改 parallel；保持 pi 的批次、hook、转录与消息队列。读类不加锁，也不为每个读建立第二套 promise 调度器。
3. 在写工具 execute **进入后的第一个异步等待前**登记 FIFO；当前上游顺序预检/启动保证 execute 入队次序跟调用到达顺序一致。**不要在 before_tool 等写锁空闲**：第二个写等待会挡住排在后面的读预检。未来上游若改成并行预检，必须先由源调用顺序预留写票再允许审批乱序，届时重新设计，不能静默沿用本版保证。
4. 锁等待可 abort；到队首后重新检查停止、工作模式/目标 revision 与批准载荷仍匹配，才启动领域执行预算。schema 校验失败不占写锁。超时计时移到真正获得写执行权后，审批与排队时间单独记录。
5. 锁覆盖真实领域写完成及其持久化回执。**不能以外层 Promise.race 超时报错作为底层已经停止的证据**：当前 `laneTools.mts:237-249` race 可先于不响应 signal 的端口结束。若端口不合作，锁仍跟踪原始写 Promise，禁止下一写越过；用户得到超时/结果未知，可停止，晚到结果按原调用核对。首个实现应复用已有终止路径并补该测试，不新增通用任务平台。
6. 正常成功、拒绝、schema 失败、可确认结束的异常均确保只释放一次并推进队列；abort 清空未执行队列，绝不把未执行写回报成已完成。用户撤销同样是写，须进入同一 lane 写边界；其他 lane/直接编辑通过领域冲突检查，不宣称这把锁覆盖所有入口。
7. read 与 write 可以重叠，所以 `[W1, R1]` 不能承诺 R1 看见 W1。模型提示指引应明确独立读可同批，依赖写结果/id/revision 的操作要下一轮。领域写仍检查旧 revision，锁不是数据一致性替代品。

运行级开关、共享锁和未知写分类必须在同一个实施提交落地，不能先开并行再补锁。副作用工具的 `replay: never` 不改；持久化恢复不依赖内存锁存活。

### 4.2 残余会问的三类如何排队

此版 Harness 先等 W1 的 `before_tool`：只显示 W1；W2 尚未预检，外部抢答 W2 返回失败（`laneApprovalGate.ts:173-193` 找不到 waiting；宿主 `laneHost.mts:404-409` 报无待批调用）。批准 W1 后继续原调用，无额外模型回合，W2 才出现；此时 W1 可以仍在执行，但 W2 即使获批也在写 FIFO 等它完成。拒 W1 只给该调用 block/tool result，W2 可继续；拒 W2 不撤回已执行 W1。按停止/关窗取消 waiting，resolve 等待而非 reject，再走 pi abort，未启动写不执行；取消注记通过 `drainNotes()` 在 idle 冲入转录（`laneApprovalGate.ts:196-207,246-277`；`laneHost.mts:413-418`）。冷重启 `interruptedToolCallIds` 收集无结果调用（`laneHost.mts:115-126`），planned 调用按 pi batch 顺序重进预检并取消、不复活卡（`laneApprovalGate.ts:210-215`）；effect_pending 写的 never 路径直接形成 interrupted，safe 读可重放且不重进 before_tool（core `tools.js:345-357`）。waiting Map 仅是现有防御容器，其 `pendingCount` 在插入时冻结（`:235-242`），不能把它宣传成可靠的多卡队列 UI；本轮不增加多卡状态机。

## 5. 副作用身份、幂等与撤销回执

3a 已用同一个 `toolCallId` join 注记与工具结果（`laneHost.mts:273-285`），传到 descriptor 执行上下文（`laneTools.mts:225,240`；`laneRuntimePort.ts:48`）。**join 是关联键，不是幂等保证**：例如 `laneCanvasTools.ts:32-37` 只调用 `port.write(input)`，没有把 toolCallId 下传；不得声称现状全链 exactly-once。

实施沿用上游身份，作用域固定为 project/session/lane/源调用 run + toolCallId；run 必须取持久化源调用身份，resume 或重试不得用新 drive ID 换键，映射既有领域 operation/proposal/undo receipt id；不由模型生成，不用参数 hash 替代调用身份，不再建旁路日志。同一作用域同 id 重试应返回同一落地回执；同 id 不同载荷必须拒绝；不同 id 相同参数是两个用户动作。底层正向提交与幂等收据必须在同一事务/现有可恢复提交协议，不能“先写后补一张表”。断电时已有提交未回结果要先查回执，不能自动再写。

`replay: never` 只防框架主动重跑，不能解决超时后仍在飞、模型换 id 重试、重开后的未知结果。这些必须显示未确认状态并查领域事实，不能给假成功或假撤销按钮。前端用同 id join 已持久化回执，一键撤销调用真实逆操作，先检验后续人工编辑/新 revision；冲突时解释具体改动不能被覆盖，不悄悄撤销另一个最新操作。

## 6. 岔路（R3）

| 决策 | 方案 / 用户看到 | 代价与推荐 |
|---|---|---|
| 写锁粒度 | 整 lane：该轮修改按序；按目标对象：不同对象可同时写 | **推荐整 lane**。跨画布/分镜/时间轴事务会触及多个对象，对象锁需排序/死锁处理；没有性能证据前不扩展 |
| 读并发上限 | 随上游同批全部启动；固定 3/4；每工具独立限流 | **首 PR 推荐沿用上游，不另设自制上限**。框架没有数值选项，工具目录数也不是调用数上限；记录峰值，有限回合不等于有限同批数。如真实峰值造成资源故障，再在执行边界引入有据的读 semaphore；不在 before_tool 排队挡后续调用 |
| 单工具失败 | 其余继续，各有收据；失败即取消全批 | **推荐独立失败不取消其余**，保留 pi 行为；错误写释放后下一写重新验证前置条件。用户 stop/授权失效/框架持久化故障另走整轮中止；不能回滚已完成付费行为 |
| 读写一致性 | 仅写锁：读写重叠；Codex 式 RwLock：写阻塞全部读 | **按用户方案选仅写锁**，接受同批读可能旧值，用依赖分轮与领域 CAS；不暗示串行可见性 |
| 审批默认 | project+confirm；safe-auto；新建“自动”档 | **推荐复用 project+confirm**，真可撤后自动，显式三档保留；不引入平行策略 owner |

## 7. 验收门（实施要求，本轮未冒充跑过）

测试扩展现有 `tests/agent-runtime/laneFixture.mts` 的真 pi/HTTP loopback，使用 deferred barrier 与订阅，不加墙钟轮询（R18），不换成自己的调度 mock 来证明框架行为。

| 门 | 夹具与确定性断言 |
|---|---|
| A 真实读并行 / 写串行 | 同一模型回复 `[R1,R2,R3,W1,W2]`；三个读各报 entered 后一起释放，断言释放前 readActive=3、maxRead=3；W1 保持 barrier 时 W2 不进领域，writeActive≤1；W1 完成后 W2 才进。出站工具 starts 的读子序列为 R1,R2,R3，写为 W1,W2；明确是领域端口调用，不是下一次模型请求 |
| B 混合位置防队头阻塞 | `[W1,W2,R1,R2,R3]`，W1 阻塞，W2 只入锁队列，三个读仍全 entered；证明锁没放 before_tool。乱序完成 R3/R1/R2 后，转录及下次模型请求 toolResult 仍按源调用顺序，恰好各一次 |
| C 两写都需要审批 | 在显式 step 或硬闸下注入 `[W1,W2]`。W1 待批时尝试先批 W2 必失败且零写；批 W1 后 W2 出卡，批 W2 仍不能越过未完成 W1。这是本版真实“第二个先批不能越序”的测试，不伪造两个同时停在 before_tool 的状态 |
| D 拒绝/停止/重启 | 分别拒第一/第二；停止待批/排队/执行中；冷重启 planned 与 effect_pending 混合批。断言 pending≤1、记录不重复、写不重放、未执行状态明确、safe 读可恢复、无悬挂等待 |
| E 默认审批及回执 | 新缺省 project+confirm；显式三档不迁移；safe-auto+requiresPlanReview 保留；ask 写不执行；editSelection 不能越选区。每个放入自动档的操作须证明修改前后→点该卡撤销→原值恢复→重开一致，后续人工编辑冲突不能误撤 |
| F 付费/不可逆 | generation、超预算续跑、永久删除/覆盖导出/发布在默认仍要授权；无 UI 拒绝。预算不足不出站，授权收据不能跨调用/改参复用。零额度用假供应商计数，不真的花钱证明策略 |
| G 生命周期/幂等 | schema 失败、领域 throw、重复答复、相同 id 重试/改参、超时但底层未结束、abort 后晚完成；写锁不提前释放，未确认结果不二次提交；另一 lane 不被本 lane 锁阻塞但同目标冲突仍被 CAS 拦住 |
| H 消息与 R30 | 保留 lane-queue 的 `[0,1,2,3]`；旧行为与候选同任务同版本模型评测，两项 R30 数字均不降，并附原始 n/d、失败归因与真实花费 |

R30 沿用 `docs/plan/2026-09-07-agent-rebuild-stage3-5-deep-plan.md:230,373-374`：22 能力 loopback 首调写对率≥95%，真实 canvas 首调≥90%，5任务×3次回合成功率≥阶段2基线，加审批介入臂不得降，输出处理失败=0。实施前从切换 PR 的实际报告取基线 SHA/模型/分母，不把旧 document 8/8 当所有能力成绩；两版本同条件对比，缺报告则 R30 未通过。首调非错数/首调数、收尾文字且领域终态正确的成功回合/尝试回合，拒绝和取消单列但不得删失败样本，0 分母写 N/A。本次为 docs-only，不产生新的 R30 数字或模型费用。

用户体验验收：在真实切换后的 Electron 中“同时了解文稿/画布/时间轴→改一处→撤销→重开”，独立读取无无谓排队，默认真可撤写零审批，付费/不可逆仍明确询问；执行后卡使用现有 v4 receipt 外壳，必须先看真实布局出最小样张并通过既有 P5/P3 门，不另画一套面板。`laneViewModel.ts:176-184,280-285` 当前仅组织工具结果，不能凭底层有 Undo 宣称 lane 卡已接通。

## 8. 实施范围、顺序、回滚

切换 PR 合后第一小 PR：先锁定新基线，补 A-D/G 红测试；同提交改运行级模式+共享写锁+分类+超时释放语义，收紧未证实可撤项，再改缺省 project+confirm 并接通本次可交付动作的现有 Undo 回执。共享 policy 是唯一判定 owner；逐类自动放行与对应真实撤销证明必须同提交，不能“先自动后补撤销”。其余 §3.2 待补项留问，工作量进入后续小 PR，不用本 PR 顺手重造全部领域的撤销系统。

预期触点：`laneHost.mts`、`laneTools.mts` 及该 lane 装配的 coding 包装、共享审批 policy/default、必要领域 receipt 接缝、现有 lane receipt 投影、针对性测试与 `framework-boundaries.json`。这些是后续实施范围，本次不修改。所有纠正性生产改动实施前走 root-cause-remediation；多入口共性不得只补其中一个。

验证：本轮 `pnpm run gates:contracts` 全绿才 commit/push；仅准确暂存本文与 INDEX，正常 Ponytail hooks，不绕过；创建 PR 不合并。实施 PR 按 R22 跑 contracts + focused + 受影响 Electron/真实旅程，并给 R30 证据。回滚本轮只撤本文与索引链接；实施回滚运行级 parallel 与其锁/默认策略作为同一单元，保留已落地回执与数据兼容，不能丢掉自动写后的撤销记录。

## 9. 六角色评审

六角色只读评审完成，结论是可进入实施排期，以下都是实施验收条件，非功能已交付证明：

| 角色 | 判断与必须守住的条件 |
|---|---|
| CTO | 复用 pi 批次/恢复，Nomi 只做写互斥；开关与锁同提交，框架字段登记同步，不能生出第二个调度内核 |
| 设计 | 复用现有卡壳；默认只显示执行结果和有效的操作绑定 Undo；失效撤销不留哑按钮，多卡 UI 不扩建 |
| PM | project+confirm 只自动已证明可撤的操作；待补项仍问，明确不是“从今以后所有写都无确认” |
| 前端 | 回执必须按 toolCallId 关联真实逆操作；连续两写/用户随后编辑/重开验证，不能无条件 pop 最新 Undo |
| 后端 | 不合作端口超时不能提前放锁；待补操作用共享契约现有 irreversible 收紧；幂等键的源 runId 必须持久且跨恢复不变 |
| 真实用户 | 三个独立读少等；能撤的修改直接发生且撤回正确；付费/不可逆不漏问，ask 不偷偷写，保留已有明确档位 |

评审指出的两项歧义已收敛进 §3.2（收紧到哪个现有值）与 §5（源 run 身份不漂移）。领域可撤测试与 lane UI 端到端证明分开，不用前者代替后者。

## 10. 上游 issue 草稿（未发布）

**Title:** AgentHarness ignores per-tool executionMode in mixed read/write batches (Nomi integration)

We build Nomi, a local-first AI video creation workbench. With pi-agent-core 0.85.1, our AgentHarness tools derive `executionMode` from their side effects. We need independent document/canvas/timeline reads to overlap while local mutations execute FIFO. We found that Harness only selects the run-level `toolExecution` mode; the legacy Agent loop reads per-tool `executionMode` but makes the entire batch sequential if any tool requests it.

Minimal reproduction (run from the Nomi checkout with the existing frozen dependencies; loopback HTTP only, no paid model):

```bash
pnpm exec tsx --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentHarness } from '@earendil-works/pi-agent-core';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/pi-agent-core/harness/context';
import { createModels } from '@earendil-works/pi-ai';
import { createHttpFixture } from './tests/agent-runtime/httpFixture.mts';
import { openLaneSession } from './electron/agentLane/laneSession.mts';
import { createNomiProvider } from './electron/agentLane/laneModelProvider.mts';
const http = await createHttpFixture([
 { type: 'tool', calls: ['w1', 'w2'].map(id => ({ id, name: 'write_probe', arguments: {} })) },
 { type: 'text', text: 'done' },
]);
const projectDir = await mkdtemp(join(tmpdir(), 'nomi-pi-parallel-'));
let releaseSession, harness;
try {
 const opened = await openLaneSession({ projectDir }, ctx);
 releaseSession = opened.release;
 const { provider, model, credentials } = await createNomiProvider({
  kind: 'openai-compatible', providerId: 'nomi-probe', modelId: 'fixture-model',
  baseURL: http.baseURL, authType: 'api-key', apiKey: 'fixture-key',
 });
 const models = createModels({ credentials });
 models.setProvider(provider);
 let activeWrites = 0, peak = 0;
 const bothEntered = Promise.withResolvers();
 const write = {
  name: 'write_probe', label: 'Nomi write probe', description: 'Synthetic write',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  executionMode: 'sequential', replay: 'never',
  execute: async () => {
   peak = Math.max(peak, ++activeWrites);
   if (activeWrites === 2) bothEntered.resolve();
   await bothEntered.promise;
   activeWrites--;
   return { content: [{ type: 'text', text: 'ok' }], details: {} };
  },
 };
 ({ harness } = await AgentHarness.create({
  session: opened.session, models, model, tools: [write],
  systemPrompt: 'Nomi concurrency repro.', toolExecution: 'parallel',
 }, ctx));
 const lane = await harness.lane('main', ctx);
 await lane.prompt('Perform both synthetic writes.', undefined, ctx);
 assert.equal(peak, 2, '0.85.1 ignores per-tool sequential in AgentHarness');
 console.log({ peakWrites: peak, requests: http.requests.length });
} finally {
 await harness?.close(ctx);
 await releaseSession?.(ctx);
 await http.close();
 await rm(projectDir, { recursive: true, force: true });
}
JS
```

Expected for our use case: reads overlap, maximum active writes is 1 and write starts are FIFO. Current source behavior: runParallel starts both writes without consulting their executionMode. Setting run-level sequential avoids this but serializes the independent reads too. Source: `dist/harness/runtime/drive/tools.js:392-415,440-447`; declaration: `dist/harness/agent-harness.d.ts:632`; legacy contrast: `dist/agent-loop.js:285-291`.

Second reproduction: block the first write in a deferred before_tool hook. In 0.85.1 the next tool does not reach before_tool until that hook resolves (`tools.js:304-342,401-406`). Please preserve or explicitly document approval admission ordering if per-tool scheduling is added. Cancellation, replay-safe reads, replay-never writes and source-ordered results should keep their current guarantees.

Request: support or document per-tool executionMode on AgentHarness. Please clarify whether “sequential” means a full read/write barrier or only mutual exclusion among sequential tools; Nomi currently plans a small lane-local FIFO write guard, not a second agent loop. This reproduction uses Nomi session/provider fixtures and is not a standalone upstream test. Before publishing we will adapt it to the upstream test fixture, preserving the same barrier and recorded trace.

本轮已执行上述精确复现，退出 0：`{ peakWrites: 2, requests: 2 }`；两个请求均为回环 HTTP，费用 ¥0，临时会话已清理。此脚本专用于锁定 0.85.1 的缺陷，屏障需两个写进入才释放；上游修好后可能等待，不能原样常驻回归套件。正式验收用 §7 的可控释放器、受测试运行器超时保护，预期写峰值改为 1。

### 阶段 4 待办（19:05 裁决）

- 计划卡是否允许对单能力「不再问」留待本方案统一裁决；#646 不改审批策略，plan 保持无抬档按钮，并删除该卡对应的作用域说明。
