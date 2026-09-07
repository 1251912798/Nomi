# Goal 模式调研：长程自治任务层——一份剧本进，一部有质量的成片出

> 状态：调研完成后的候选方案，未获实施批准；不代表功能已实现或真实成片已验收。
> 查阅日期：2026-09-08。仓内基线：`43a39848c830903b845b94cbf5b8e27d912d10fb`；安装包实核：pi `0.85.1`。
> 范围：只读调研，交付本文与 `GOAL-MODE-LAST.md`；不改生产代码、不安装包、不开 PR。
> 引用约定：`A/` = `node_modules/@earendil-works/pi-agent-core/`，`C/` = `node_modules/@earendil-works/pi-coding-agent/`；其余 `file:line` 从本 worktree 根目录算起。行号绑定上述基线；外部 `main` 是查阅当日可变快照，不冒称固定 release。

## 1. 概念界定

**是什么。** Goal 是替用户一直盯住“成片达到约定标准”的上层任务契约：目标固定，Agent 根据现场结果规划、执行、检查、重规划。流水线按固定步骤往下走；Goal 可以发现第三镜角色变了，回去修这一镜，再接着剪。流水线仍可作为它调用的执行部件。

**不是什么。** 不是新 UI，不是第二套 Agent 运行时，也不是把 30 步写死。对话与推理仍走现有 pi lane；生成、记账、恢复、剪辑、导出仍走 Nomi 的领域能力。新增的是“什么时候继续、什么时候停、怎样证明完成”的约束。

**用户体验。** 用户交剧本和时长／模型／画幅／预算／风格五个约束，点一次“开始”，之后只在付费闸和质量岔路被打断，最后拿到成片和一份“哪里降级了”的诚实清单。

## 2. 用户场景卡

| 项目 | 约定 |
|---|---|
| 输入 | 已写好的剧本，导入成有版本和 hash 的项目文稿；不要求用户手写任务 JSON。已有剧本不再被广告片 playbook 重写成另一故事。 |
| 时长 | 例如 90 秒；启动时明确可接受范围，例 80–100 秒。这个范围是示例，不是默认偷偷放宽。 |
| 模型 | 用户选视频模型及允许的替代范围；文字规划、审片、音频模型随本次成本估算一并披露。MiniMax H3 用作验收样例，不写死进通用 Goal 类型。 |
| 画幅 | 例如 9:16，约束生成和最终导出；不只修改播放器尺寸。 |
| 预算 | 一个明确币种的总上限，包含文字推理、压缩、审片、图／视频／音频生成及重试。未知价格不当成零；请求前预留上界。 |
| 风格 | 例如现实主义都市短剧；角色、服装、场景和不可改变的剧情由剧本及参考素材派生，连同获准降级范围归档。 |
| 成功 | MP4 可解码、可播，时长／画幅符合约定；每个分镜都有被选中的产物，或有获准且明示的降级；无未披露的缺镜、静音对白、未验质量；已结算与在途责任不超预算。 |

**开始以后，允许打断用户的时刻只有以下三类：**

1. **付费授权边界**：首次付费若尚无可执行收据、现有授权过期／撤销、需增加预算、换到未授权模型或重规划使付费合同失效。用户在“开始”时可一并完成首笔授权；这不等于 Agent 可以伪造后续收据。
2. **质量岔路**：预算内的修正用尽，仍需改变核心剧情／角色／风格，或把动态表演换成静帧等超出已批准的降级；系统给“保留什么、损失什么、再花多少”的具体选择。
3. **超出原约定的不可逆交付**：对外发布或覆盖唯一原件，作为授权闸处理。v1 只另存本地 MP4，不发布、不覆盖，因此正常旅程不会触发这一项。

普通排队、可恢复超时、预算内且合同覆盖的定向重试、上下文压缩都不问人。鉴权失败／磁盘不可用／人工停止等使执行安全停住并给状态，不能伪装成质量选择反复追问；需要新授权时归第一类。暂停不能撤回供应商已经接单的任务：停止新提交，继续保存已付费结果（`electron/productionRun/productionRunControl.ts:9`）。

**“能出片”与“有质量”分开验。** 自动解码、镜头覆盖和费用核对是硬证据；VLM（能看图的模型）审片是有误差的辅助证据；真实观众是否看懂故事、声音是否可用、节奏是否成立，要在验收中看片验证。不能拿“模型说完成”或三个平均分代替这三道检查。

## 3. R29 四列表：长程任务这一层

先查别人结论：采用 pi 的会话／恢复机制和 Nomi 的生产执行底座；参考 Codex 原生 Goal 的宿主控制方式。**不引入 Deep Agents、Temporal 或另一套 Agent 内核。** 下表是研究素材，不是接入登记已完成；实施前仍须把新增公开字段逐一裁决并登记 `docs/engineering/framework-boundaries.json`。本任务禁止改该文件。

| pi 提供 | 我们用了 | 我们另写了 | 我们拆散了 |
|---|---|---|---|
| `AgentHarness`、lane、prompt／resume（`A/dist/harness/agent-harness.d.ts:645`） | `AgentHarness.create` + 顺序工具执行（`electron/agentLane/laneHost.mts:135`） | 项目到 session／lane 的身份桥（`electron/agentLane/laneSession.mts:83`） | 尚无 Goal 持续执行挂点；宿主只暴露 prompt／approval／stop（`electron/agentLane/laneHost.mts:257`）。不能把一次 prompt 的结束叫 Goal 完成。 |
| 阈值压缩、保留尾部、摘要生成（`A/dist/harness/compaction/compaction.js:75`、`:413`） | lane 不覆盖配置，使用框架默认（`electron/agentLane/laneHost.mts:135`） | 当前无 Goal 状态注入器；提示词仅拼工具说明（`electron/agentLane/lanePromptSections.ts:1`） | `custom` 条目过压缩边界不再自动可见（`A/dist/harness/session/context.js:13`）；现有 projector 仅 UI 审批备注（`electron/agentLane/laneHost.mts:139`）。注册 projector 不等于永久 pin。 |
| 同一转录、custom entry、独立投影（`A/dist/harness/session/context.js:34`） | `appendCustomEntry` 记审批、按 toolCallId join（`electron/agentLane/laneHost.mts:185`） | `productionRun` 记真实镜头／作业／产物／预算（`electron/productionRun/productionRunTypes.ts:341`） | 这是合法的领域与会话分层，不应合并成一份“聊天摘要数据库”；需以 runId／sessionId 关联而不复制 jobs（同上；`electron/agentLane/laneSession.mts:71`）。 |
| 持久 operation、压缩 preparation、resume（`A/dist/harness/runtime/drive/structural.js:28`） | 项目内 `JsonlSessionRepo`，稳定 cwd，指定 session 不存在就报错（`electron/agentLane/laneSession.mts:23`、`:93`） | Run 的 outbox／恢复分类／跨进程锁处理外部付费副作用（`electron/productionRun/submissionOutbox.ts:15`；`productionRunResume.ts:14`） | 旧宿主快照与新 lane 仍属阶段 4 切换前的分离形态（`electron/projectAgentHost/projectAgentRepository.ts:350`；`electron/agentLane/laneIpc.ts:9`），Goal 不得新增第三份会话史。 |
| `before_tool`、abort、恢复时重进预检（`A/dist/harness/agent-harness.d.ts:550`） | 3a 审批挂在 hook，重启未配对调用取消（`electron/agentLane/laneHost.mts:171`） | 真实金额、授权摘要、分镜与尝试绑定由 Nomi 校验（`electron/productionRun/approvalPolicy.ts:77`；`productionGenerationAuthorization.ts:102`） | lane 的 session grant 与生产费用授权不是同一对象（`electron/shared/agentLane/laneApproval.ts:99`；`electron/productionRun/approvalPolicy.ts:80`）；Goal 必须走同一个提交边界，不能只放行前者。 |
| `before_run_end` 可回 followUp、队列分 steer／followUp／nextRun（`A/dist/harness/agent-harness.d.ts:501`、`:658`） | 当前 LaneHandle 尚未暴露这些命令（`electron/agentLane/laneHost.mts:257`） | 生产 scheduler 已负责长时间等待和 re-kick（`electron/productionRun/multiShotBatchScheduler.ts:24`） | 不应让模型循环询问“好了没”替代 scheduler。框架继续推理、生产任务等待是两层；只在需要决策时唤醒同一 lane（同上；`A/dist/harness/runtime/drive/boundary.js:90`）。 |
| todo／plan-mode 持久示例（`C/examples/extensions/todo.ts:114`；`plan-mode/index.ts:116`） | 现有 production stages／generationPlan／shots 是执行计划事实（`electron/productionRun/productionRunTypes.ts:125`、`:228`） | 剧情、镜头谱系、质量和成片验收必须是视频领域契约 | 不能移植 `[DONE:n]` 自报完成为质量事实，也不能在 todo.md 再存一份 jobs（`C/examples/extensions/plan-mode/index.ts:247`；`electron/productionRun/productionRunTypes.ts:140`）。 |

### 3.1 pi 压缩：从真实实现回答问题

**先分清两个 API。** 用户指定的 `C/docs/{compaction,sessions,session-format,sdk}.md` 与 `examples/sdk/11–13` 主要讲传统 `AgentSession`／`SessionManager`；Nomi lane 用 `pi-agent-core` 的 `AgentHarness`。两条代码都已实读，`C/dist/bundle/chunks/chunk-JVUZSMYM.js:998` 也包含 durable 实现，但引用优先用可读的 `A/dist/harness/` 文件。不能拿 `firstKeptEntryId` 的旧返回形状传给需要 `retainedTail` 的新 hook。

| 问题 | 实核答案 |
|---|---|
| 何时压缩？ | `contextTokens > contextWindow - reserveTokens`，默认预留 16384、最近保留 20000 token（`A/dist/harness/compaction/compaction.js:75`、`:144`）。Harness 在 durable checkpoint 检查（`runtime/drive/checkpoint.js:59`），已有更新的 compaction 则不重复压（`structural.js:837`）；inbox 有新消息时会优先安排。传统 AgentSession 在工具批后下一响应前、新 prompt 前及 run 后检查（`C/dist/core/agent-session.js:274`；`C/docs/compaction.md:33`）。 |
| 溢出怎么办？ | Harness `prepareOverflowCompaction` 只允许一次 overflow recovery，准备后原子进入结构操作；这不是无界重试（`A/dist/harness/runtime/drive/structural.js:872`；`response.js:114`）。 |
| 摘要由谁写？ | 默认由框架通过当前配置模型发单独摘要请求；可由 hook 接管。不是 Nomi UI 或 scheduler 写。请求上限为 `min(floor(0.8*reserveTokens), model.maxTokens)`（`A/dist/harness/compaction/compaction.js:377`）。摘要也消耗 token／钱。 |
| 提示词长什么样？ | 系统要求“Do NOT continue the conversation…ONLY output the structured summary”；正文固定 Goal、Constraints & Preferences、Progress(Done/In Progress/Blocked)、Key Decisions、Next Steps、Critical Context 六节；要求保留准确路径、函数名、错误信息。增量版带 `<previous-summary>`，额外指令接 `Additional focus`（同文件 `:295`、`:330`、`:377`）。 |
| 留什么、压什么？ | 从尾部累计 token 找合法切点，工具结果不作切点；旧范围送摘要，近尾原消息保留。Harness 把尾部消息直接存入 compaction 的 `retainedTail`，下次压缩把它还原为虚拟 entries；历史落盘记录并没有被删除（同文件 `:212`、`:413`；`A/dist/harness/session/context.js:23`）。摘要输入里的工具结果最多 2000 字符（`compaction/utils.js:62`），不能把唯一产物索引塞长 tool result 指望永远记住。 |
| durablePreparation 保什么？ | 待摘要消息、split-turn 前缀、retainedTail、旧摘要、token 数、文件集合（转成数组）和 settings；恢复时转回 Set（`A/dist/harness/runtime/drive/structural.js:21`）。保的是压缩操作现场，不是用户预算、视频任务状态或 Goal 计划。 |
| hook 签名？ | 旧 `session_before_compact` 收 preparation／branchEntries／customInstructions／reason／willRetry／signal，回 cancel 或 compaction（`C/dist/core/extensions/types.d.ts:442`；`C/docs/compaction.md:306`）。Harness 名为 `before_compaction`，收 reason／preparation／customInstructions，回 decline 或 `CompactResult`；取消信号在 hook context（`A/dist/harness/agent-harness.d.ts:582`）。 |
| 能注入必须保留的状态吗？ | 能，但无现成“任意条目永不压缩”的保证。`details` 能持久放 JSON，却不会自动变成模型上下文；旧 custom entries 也会被上下文切掉。v1 应由 `transform_context` 在每次普通推理前，读取 Run 的最新结构化事实并生成有界状态块；正文只放目标、约束、当前步骤、失败摘要和稳定产物 ID，长表按需工具读取（`A/dist/harness/agent-harness.d.ts:510`；`runtime/drive/generation.js:120`）。状态块是派生投影，不能反向成为真相源。 |

**v1 的最小压缩策略**：保留 pi 默认摘要机制，不新增摘要服务或自己写切点算法；目标、硬约束、预算责任、授权范围、已采纳镜头与失败谱系从持久 Run 重取，因此免疫“摘要忘了”。可压的是冗长讨论、过时工具输出、已废弃方案细节；失败类别、次数和“不再重试这个原因”不能丢。状态注入有大小上限，全部分镜索引走读取能力，不无限扩大 system prompt。压缩失败进入可恢复停顿，不能清空预算或当作新 Goal 再来。

**分支与回退**：传统 `/tree` 留在同文件，`/fork` 新文件，`/clone` 复制当前分支；离开分支可加 branch summary（`C/docs/sessions.md:118`）。Harness 用 `navigateTree`（`A/dist/harness/agent-harness.d.ts:655`）。这只回退模型视角，不回退供应商扣费、已落盘视频、人工删镜和剪辑结果；探索另一版镜头要产生新产物版本／尝试谱系。v1 不把会话树变成剪辑撤销系统。

**steer／followUp／nextRun**：steer 在安全边界插入新指令，不是立即撤销正在执行的付费请求；followUp 在当前工作可结束且无更优先触发时继续；nextRun 留待后续 run。三者是消息调度语义，不是持久工作队列的替身（`A/dist/harness/runtime/drive/boundary.js:29`；`agent-harness.d.ts:658`）。Goal 的“停”必须同时停新领域提交和 lane 推理，不能只发一句 steer“停下”。

### 3.2 指定示例读后结论

| 已读示例 | 可借鉴什么／不能直接搬什么 |
|---|---|
| `C/examples/extensions/custom-compaction.ts:21`、`:100` | 展示换摘要模型与返回 hook 结果；文件头声称丢弃全部旧 turns，但实际仍返回原 `firstKeptEntryId` 保留近尾，按实现判断。v1 不复制其 fallback，也不照注释宣称全量替换。 |
| `trigger-compact.ts:3`、`:27` | 100000 token 是演示阈值，通过 `ctx.compact` 调框架；不能照抄成所有模型统一阈值。 |
| `summarize.ts:68`、`:106`；`handoff.ts:80` | summarize 取 user／assistant 文字和工具调用描述；handoff 用 LLM 生成新线程提示词让用户审阅。都不是无损恢复；handoff 不能用来不断创建新项目逃避上限。 |
| `todo.ts:114`、`:154` | 完整 todo 状态在 tool result details；session_start／session_tree 从当前分支重建。是一等持久对象，而非仅提示词中的勾选框；但勾选仍是模型声明。 |
| `plan-mode/index.ts:116`、`:200`、`:340`；`plan-mode/utils.ts:1` | `appendEntry('plan-mode',…)` 存模式、todos、executing、原工具列表；执行前注入剩余项，识别 `[DONE:n]`；resume 扫最后一次 execute 之后的消息。恢复使用 getEntries，与 todo 的 getBranch 不同；不能直接承诺跨分支计划一致。只禁内置写工具的代码计划模式也不自动禁止自定义付费工具。 |
| `subagent/index.ts:300`、`:552`、`:645`；`subagent/README.md:1` | 独立 pi 进程、`--mode json -p --no-session`；单任务／顺序链（`{previous}` 回流）／最多 8 任务且 4 并发。结果回工具 content，完整细节在 details，父模型可见输出有限；失败停止链、abort 杀子进程。不是可重启的子任务账本，没有替 Nomi 实现预算共用和素材一致性。v1 不起子 agent。 |
| `file-trigger.ts:18` | 文件变化触发消息并清文件，是演示，不是带游标、幂等与恢复的可靠 inbox；已有 production 事件渠道优先。 |
| `git-checkpoint.ts:11`、`:20`、`:49` | 内存 Map + git stash create/apply，结束清空；不是视频资产／预算 checkpoint，也不是跨崩溃的全项目备份。 |
| `structured-output.ts:18`、`:42` | TypeBox 参数 + `terminate:true` 减少一次回答回合；schema 合法不等于交付物合格。Goal 完成仍须验证器接受证据。 |
| `C/examples/sdk/11-sessions.ts:16`；`12-full-control.ts:28`；`13-session-runtime.ts:37` | 依次示范传统 SessionManager 持久／resume、自管配置、替换会话后重绑订阅。12 的示例明确关闭 compaction，不能整段复制；13 的替换机制不是 Harness 的 resume 接口。 |

## 4. 参考实现逐层对照

判定对准**当前基线能否支撑本任务的完整闭环**；“没想到”表示 Goal 所需不变量尚未闭合，不指此前没人写过相关文档。共九层，六层需在实施前补齐。

| 层 | 参考实现与 Nomi 现状 | 判定 |
|---|---|---|
| ① 目标契约 | Codex Goal 的 objective／预算／宿主状态与工具权限分开（[Goal spec](https://github.com/openai/codex/blob/1e66885a16161048215a3782ecdd1739aab0aabf/codex-rs/ext/goal/src/spec.rs)）。Nomi 已有 brief.goal、contract.specs 和 policy，却没有“原剧本版本 + 五约束 + 交付验收”闭合契约（`electron/productionRun/productionRunTypes.ts:102`、`:115`）。 | **没想到**：必填校验、冲突拒绝、约束变更使哪些授权失效。 |
| ② 规划与分解 | pi plan-mode 把计划落 entry（`C/examples/extensions/plan-mode/index.ts:116`），Codex Goal 复用同一 thread 续轮（[runtime](https://github.com/openai/codex/blob/1e66885a16161048215a3782ecdd1739aab0aabf/codex-rs/ext/goal/src/runtime.rs)）。Nomi stages 是固定 playbook 模板（`electron/productionRun/productionPlaybooks.ts:34`）。 | **没想到**：计划能重排／修订，而不是加另一条固定短剧流水线；领域步骤必须可验收。 |
| ③ 持久进度账本 | pi 管对话和操作；Nomi Run 已存 shots／jobs／artifacts／revision／budget（`electron/productionRun/productionRunTypes.ts:341`；`productionRunPaths.ts:15`）。 | **有意不同（领域约束）**：真实供应商副作用归 Run；不能仅用会话 todo 表示已付款或已产片。 |
| ④ 上下文压缩策略 | pi 的默认摘要由 LLM 写、近尾保留，custom 不永久 pin（`A/dist/harness/compaction/compaction.js:413`；`session/context.js:13`）。 | **没想到**：领域状态每轮重投影、正文与稳定 ID 分离、压缩后不遗忘已失败策略；不能只加一句“请记住目标”。 |
| ⑤ 续跑与重接 | pi open 指定 session + resume（`electron/agentLane/laneSession.mts:83`；`laneHost.mts:227`）；Run 已区分 poll／reconcile／dispatch（`electron/productionRun/productionRunResume.ts:14`）。 | **没想到**：两者身份关联、重启先对账再继续、关窗后谁持有 lane 与渲染依赖未贯通。 |
| ⑥ 质量闭环 | Claude `/goal` 用独立小模型判断对话，不读产物（[官方说明](https://code.claude.com/docs/en/goal)）；Nomi 已有三轴审片、有限重试（`electron/capabilityCore/shotVerifyCore.ts:31`；`electron/productionRun/productionQaVerdict.ts:89`）。 | **没想到**：判不了不算过；整片动作／声音／节奏、按真实报价限制重试、质量失败后的降级与剧情完整性。 |
| ⑦ 人的介入点 | pi before_tool 提供执行拦截口（`A/dist/harness/agent-harness.d.ts:550`）；Nomi 有信任档位、预算门和 anchor gate（`electron/productionRun/productionRunTypes.ts:10`；`anchorCheckpoint.ts:51`）。 | **有意不同（领域约束）**：既定金额和视觉代价不能套代码写文件权限；自动放行只能来自有效授权或预先批准的质量政策。 |
| ⑧ 失败处理 | pi 管模型请求重试／overflow；Nomi outbox 区分未提交与回执未知（`electron/productionRun/submissionOutbox.ts:8`），取消不保证退款（`productionRunControl.ts:9`）。 | **有意不同（领域约束）**：厂商接单是不可回滚外部事实；超时先对账，不能由 Agent 重新“试一次”。 |
| ⑨ 交付 | 既有 driver 有 QA→组装→粗剪门→导出（`electron/productionRun/productionRunDriverOps.ts:612`、`:663`），但固定停门、质量报告与 MP4 未形成一个完成证明。 | **没想到**：成片 hash／可播验证／完整分镜覆盖／获准降级清单齐备才 complete；本地导出可预授权，发布另论。 |

### 4.1 “没想到”实施前置门（六条，不留到 v2）

1. **契约闭合**：五约束有机器校验；原剧本版本与产物血缘绑定；所有付费类别进同一预算责任视图。
2. **计划有 owner**：Run 持久存计划修订与证据，Agent 只提议下一步；模型自报 DONE 不能写完成事实；不会和原 driver 双重调度。
3. **压缩免疫**：跨两次真实压缩，目标／约束／已完成镜头／失败谱系／预算逐项不漂移；只从 Run 重建，不从摘要猜。
4. **恢复可兑现**：projectId／runId／sessionId／laneName 显式关联；提交中断先查回执，授权等待重启不复活；关窗、退出、重开、素材移动有明确行为。
5. **质量及成本闭合**：三轴之外的必要成片检查有证据；审片失败／不可评单列；真实单价预留重试预算，不能一镜按“一单位”估算。
6. **交付可证明**：自动导出走既有能力；漏镜、无对白音轨、降级超约定不能偷过；成片和降级清单绑定同一产物版本。

### 4.2 市场层：通用 Agent 的长程设计

**最近的参考已经是原生 Goal，不只 Ralph。** Claude Code 官方 `/goal` 在原会话上挂 Stop hook，小模型每轮判断达成／未达成／不可能；未达成继续原会话。Codex 把 Goal 做成独立控制扩展，在原 thread 空闲时开启下一轮，没有第二个模型执行内核。Nomi 应借这层控制关系，保留自己的视频领域验收。

| 项目 | 本轮实读的官方机制 | 对 Nomi 的结论 |
|---|---|---|
| Claude Code `/goal` | [官方 Goal](https://code.claude.com/docs/en/goal)：后台子任务未结束则推迟评审；Goal 不改变 permission mode。**评审小模型只看对话，不读文件或运行工具**；resume 恢复目标条件但重置回合／时间／token 统计；需用户修复的鉴权、余额耗尽、压缩仍溢出、模型不可用会清 Goal（宿主管理鉴权有例外），无工具连续空转会停。 | 借“是否继续”与“是否放行工具”分离；不照搬计数重置和仅看对话的完成判定。Nomi 预算是跨会话真实债务。 |
| Codex 原生 Goal | [runtime.rs:399](https://github.com/openai/codex/blob/1e66885a16161048215a3782ecdd1739aab0aabf/codex-rs/ext/goal/src/runtime.rs#L399) 读持久 Goal、串行控制、`start_turn_if_idle` 续原 thread；[状态类型:14](https://github.com/openai/codex/blob/1e66885a16161048215a3782ecdd1739aab0aabf/codex-rs/state/src/model/thread_goal.rs#L14) 区分 active／paused／blocked／usage_limited／budget_limited／complete；[spec:60](https://github.com/openai/codex/blob/1e66885a16161048215a3782ecdd1739aab0aabf/codex-rs/ext/goal/src/spec.rs#L60) 只允许模型设置 complete／blocked，预算与暂停归宿主。 | 这是最贴近的控制边界。只借状态职责，不把其 token 限额冒充视频供应商费用上限。 |
| Codex 的继续提示词 | [continuation.md:23](https://github.com/openai/codex/blob/1e66885a16161048215a3782ecdd1739aab0aabf/codex-rs/ext/goal/templates/goals/continuation.md#L23) 区分权威状态推进／已验证等待／无进展；完成前逐项核证，不许因预算将尽缩目标；同一阻塞三轮才可标 blocked。 | 视频侧不机械等三次付费失败。只要下一次将越预算，就在提交前停；等待厂商不是无进展空转。 |
| Claude Code auto-compact | [How it works](https://code.claude.com/docs/en/how-claude-code-works)、[Commands](https://code.claude.com/docs/en/commands)：先清旧工具输出，再摘要，保留用户请求与关键代码；早期细指令仍可能丢。`/compact [instructions]`／CLAUDE.md 的 Compact Instructions 可以引导保留。 | 引导摘要不是保证。其文件 checkpoint 不覆盖远程 API 副作用，Nomi 同样不能用会话回退退款。 |
| Claude 任务与计划 | [Task list](https://code.claude.com/docs/en/interactive-mode#task-list) 跨 compaction 持久化；可用 `CLAUDE_CODE_TASK_LIST_ID` 共享任务；[common workflows](https://code.claude.com/docs/en/common-workflows) 先只读计划、再执行。新模型的 todo 工具可为 opt-in，SDK 仍有 TodoWrite 类型。 | 不把旧名 TodoWrite 当所有版本默认协议。Nomi 可借持久计划，不增加每一步审批。 |
| Claude subagent／SDK | [sub-agents](https://code.claude.com/docs/en/sub-agents)、[sessions](https://platform.claude.com/docs/en/agent-sdk/sessions)、[TypeScript](https://platform.claude.com/docs/en/agent-sdk/typescript)：子任务隔离上下文，结果回流；resume 指定 ID、continue 选最近、fork 新 ID。`maxTurns` 限 agentic round trips；到 turn／budget 限制后可 resume，`persistSession:false` 则不能。 | 项目不能用“最近一个会话”猜身份；一次 SDK run 的限额不等于整片预算。 |
| Anthropic 上下文工程 | [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)：compaction、结构化外置笔记、subagent 三路；保留关键决策／未解决问题、去冗余输出。文章的“最近五文件”是示例，不是现版本固定契约。 | 外置的是业务真相和大产物，送模型的是有界工作集；不能为此重写 pi。 |
| Anthropic 工作流与上下文平台 | [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) 区分预定义 workflow 和动态 agent，evaluator-optimizer 要有明确评价标准；[Managing context](https://www.anthropic.com/news/context-management) 的 context editing 清旧工具结果，memory tool 存储由客户端控制。 | 先确定镜头怎么判合格，再谈自动重试；memory tool 不等于供应商替我们保管项目账本。 |
| Anthropic compaction API | [官方 API](https://platform.claude.com/docs/en/build-with-claude/compaction)：`compact_20260112`，input_tokens trigger 默认150000、最低50000；模型产 compaction block，可设 instructions／pause_after_compaction 后补必须保留消息；额外采样计费。 | 这是该供应商协议，不把阈值或 API 格式写进通用 Goal；pi 已提供通用层。 |
| Codex CLI | [noninteractive](https://developers.openai.com/codex/noninteractive)：`codex exec resume --last` 或 session ID；[权限](https://developers.openai.com/codex/agent-approvals-security)：sandbox 与 approval policy 分开，never 不是无沙箱；当前文档把 full-auto 列为兼容旧选项。 | 自动续跑不扩大原权限。Nomi 的无人值守仍需有效付费授权。 |
| Codex 压缩 | [compact.rs:119](https://github.com/openai/codex/blob/1e66885a16161048215a3782ecdd1739aab0aabf/codex-rs/core/src/compact.rs#L119)：auto/manual 共用任务、模型摘要、pre/post hooks、持久替换上下文；源码提示多次压缩可降低准确度。 | 长上下文和多轮 compact 不保证质量，关键状态必须重读。 |
| OpenHands | 用户指定旧路径在 main 已迁移；[0.56.0 旧 condenser](https://github.com/OpenHands/OpenHands/blob/0.56.0/openhands/memory/condenser/impl/llm_summarizing_condenser.py#L17) 可读，max_size=100、keep_first=1；现役 [SDK README:13](https://github.com/OpenHands/software-agent-sdk/blob/df2ea8fa5542d5d2a543e108bc8b2d4fbbab34b1/openhands-sdk/openhands/sdk/context/condenser/README.md#L13) 是 append-only events + condensation event + model view；[实现:48](https://github.com/OpenHands/software-agent-sdk/blob/df2ea8fa5542d5d2a543e108bc8b2d4fbbab34b1/openhands-sdk/openhands/sdk/context/condenser/llm_summarizing_condenser.py#L48) 可插拔，默认240／keep_first=2、也支持 token cap。 | 压缩视图，不删事实日志；策略／版本不能混写。pi transcript 与 Run 已分工，不搬其 event store。 |
| Manus | [Context Engineering 原文](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)：文件系统外置记忆、反复更新 todo.md 把目标拉回近期注意力、保留错误供后续纠正。 | 借“重申目标+失败证据”，但 Nomi 的 todo 是 Run 派生视图，不增加一个需要用户维护的文件格式。 |
| LangChain Deep Agents | [官方 overview](https://docs.langchain.com/oss/python/deepagents/overview)：文件系统／backend、上下文卸载、隔离 subagents；task 返回结果，子任务无可持续多轮往返；**v0.7 起 planning 为 opt-in**，TodoListMiddleware 提供 write_todos。 | planning+filesystem+subagents 是设计模式，不是必须安装的三件套；不能为长任务引入第二 harness。 |
| Ralph Wiggum | [Geoffrey Huntley 原文](https://ghuntley.com/ralph/) 用外部 while 循环重复喂目标，重读 specs／fix_plan，倾向每轮做一件；作者也承认计划会走偏、需要重建。 | 适合明确测试反馈与磁盘进度，不提供视频付费幂等和审片质量。无限重复目标只是推进器。 |
| OpenCode | [compaction.ts:271](https://github.com/anomalyco/opencode/blob/ecbc6ccac85b3e8087b6445e584318419b9e2b34/packages/opencode/src/session/compaction.ts#L271)：prune 老工具输出、保近期尾部与 skill；独立 compaction agent、插件 hook 注入上下文／提示词，明确失败与继续路径。 | 可借保留近尾和失败显式化；不抄另一套压缩引擎。 |
| Gemini CLI | [chatCompressionService.ts:38](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/context/chatCompressionService.ts#L38)：默认50%窗口触发、保约30%近期 history、工具结果预算50000 token、检查空／膨胀摘要；[session docs:9](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/docs/cli/session-management.md#L9) 按项目保存，resume 最近／ID，默认保留30天。 | 参数取舍因系统而异。Nomi 业务账本不能受“聊天30天清理”影响。 |

**判断**：市场没有支持“把上下文窗口撑大就能稳定自动成片”的证据。原生 Goal 负责持续，外置事实负责不丢，评价器负责判断；Nomi 还必须把评价器接到真实视频，而不是对话转述。

**Codex 预算不能直接当视频钱闸。** Goal token 计数为 input − cached input + output，并累计子任务增量（[accounting.rs:441](https://github.com/openai/codex/blob/1e66885a16161048215a3782ecdd1739aab0aabf/codex-rs/ext/goal/src/accounting.rs#L441)、[:297](https://github.com/openai/codex/blob/1e66885a16161048215a3782ecdd1739aab0aabf/codex-rs/ext/goal/src/accounting.rs#L297)）；达到限额后停续轮，在途 usage 仍计入（[测试:1184](https://github.com/openai/codex/blob/1e66885a16161048215a3782ecdd1739aab0aabf/codex-rs/state/src/runtime/goals.rs#L1184)），不是请求前硬费用预留。resume 仅恢复 active Goal，续跑还依赖 thread 存活及工具可见（[runtime.rs:375](https://github.com/openai/codex/blob/1e66885a16161048215a3782ecdd1739aab0aabf/codex-rs/ext/goal/src/runtime.rs#L375)）；持久化不等于后台永远运行。

### 4.3 视频近邻与商业流程

| 开源／论文 | 实际 pipeline 与可借鉴边界 |
|---|---|
| FilmAgent | [原项目](https://filmagent.github.io/)／[论文2501.12909](https://arxiv.org/abs/2501.12909)：Unity 3D 虚拟空间中导演、编剧、演员、摄影协作，靠中间脚本反馈改进；不是通用视频模型生成整片。官网仍链旧仓名，但当前 [仓库](https://github.com/HITsz-TMG/VideoClaw) 已转 VideoClaw，现行 README 展示策划→角色场景→分镜→参考图→视频→后期及中间资产编辑／重新生成。两代不能混称同一论文成果。 |
| MovieAgent | [论文2503.07314](https://arxiv.org/abs/2503.07314)、[run.py:139](https://github.com/showlab/MovieAgent/blob/main/movie_agent/run.py#L139)：剧本拆解→场景→shot plot→生成与拼片，中间 JSON 持久化；`:312` 的 Final 用 MoviePy concatenate。**[tools.py:255](https://github.com/showlab/MovieAgent/blob/main/movie_agent/tools.py#L255) 音频 predict 被注释**，不能只看 README 就承诺完整有声短剧。 |
| Anim-Director | [论文2408.09787](https://arxiv.org/abs/2408.09787)、[代码与说明](https://github.com/HITsz-TMG/Anim-Director/tree/main/Anim-Director)：故事／导演脚本／角色→参考及场景图→图文生视频；GPT-4 多模态反思和候选评选。论文效果依赖 Midjourney／Pika，免费替代并无同质量承诺。 |
| AniMaker（后续） | [论文2506.10540](https://arxiv.org/abs/2506.10540)、[pipeline.py:49](https://github.com/HITsz-TMG/Anim-Director/blob/main/AniMaker/Pipeline/pipeline.py#L49)：Director 出分镜，Photography 用 MCTS-Gen（尝试候选并沿较好的分支继续），Reviewer 用 AniEval 审故事／动作／表现，后期剪辑配音；pipeline.json 保存／加载，`:117` 跳过已完成阶段。可借候选筛选与持久进度，不能据此推断付费幂等。 |
| StoryDiffusion 系列 | [论文2405.01434](https://arxiv.org/abs/2405.01434)、[官方仓库](https://github.com/HVision-NKU/StoryDiffusion)、[项目页](https://storydiffusion.github.io/)：一致自注意力生成连续角色图，语义运动预测连图成视频；是生成一致性方法，不是 Goal。**本轮 README 的视频模型源码／权重仍未打完成勾**，开源运行范围主要漫画图，不能当即插即用自治成片底座。 |

| 商业产品 | 用户可见流程／在哪里介入 | 证据边界 |
|---|---|---|
| LTX Studio | [官方 script-to-video](https://ltx.io/studio/platform/script-to-video)：上传剧本→选模型／画幅→**Review shot breakdown**，审角色／物体并编辑→满意再 add motion／生成；导出 MP4 或 pitch deck。 | 明确将审分镜放在视频生成之前。对 Nomi 的设计启发是“贵之前看对不对”，Goal 可在预授权范围内自动审核，不要求全程逐镜人工。 |
| MiniMax Hailuo Agent | [官方 Agent 页](https://hailuoai.video/agent-landing-page)：可视 canvas／节点串接，分段生成与预览，调整参数、转场迭代。 | 公开页未给强制审核节点、费用预留、崩溃续跑、质量停止条件；未登录实测，不补造这些保证。 |
| Kling Canvas Agent | [官方 release history](https://kling.ai/release-note/release-history)：2026-01-29 条目含 Smart Multi-Shot、多角度扩展、多轮对话、一键批量。 | 可证对话与批量镜头入口，不能推出数小时自治交付。 |
| 可灵“AI Director” | [VIDEO 3.0 指南](https://kling.ai/quickstart/klingai-video-3-model-user-guide)：Multi-Shot 开关自动规划转场，Custom Multi-Shot 可手设镜数／内容／时长，绑定角色元素；长度3–15秒。 | 单次多镜头模型能力与长程 Goal 是不同层；不能因叫“导演”就视为完整自治编排。 |
| Vidu Agent | [官方 vidu-claw](https://www.vidu.com/zh/vidu-claw)：当前是基于 OpenClaw、Q3 驱动的营销智能体，输入产品／想法→脚本、场景、音乐、视频；有 [Vidu Skills](https://github.com/shengshu-ai/vidu-skills)。 | 当前公开定位营销制作，未公开逐镜审批／预算门／自动返工协议，不能承诺任意长剧本闭环。 |

视频近邻证明“分镜化、持久产物、候选评价再拼装”有可借的结构；本轮没有复现论文，也没有执行商业生成，**没有证据证明任一产品在任意剧本、任意预算下都能交优质成片**。

### 4.4 自媒体来源（TikHub）

本轮通过 [TikHub OpenAPI](https://api.tikhub.io/openapi.json) 确认接口 `POST /api/v1/douyin/search/fetch_general_search_v3`，以“AI 短剧 全自动”“剧本 生成 成片 agent”“Ralph loop”“长任务 agent”查询，四组均返回 `code=200`。凭证仅在进程内从环境变量 `TIKHUB_API_KEY` 读取；没有写入文档、日志或命令行。按用户只交两份 Markdown 的要求，未另存 JSON 附件，以下直接保存可追溯原视频 URL 和描述证据。

| 创作者／来源 | 描述中表达的摩擦或推荐 | 本文怎样使用 |
|---|---|---|
| [Frank的Agent实验室](https://www.douyin.com/video/7639305124271650283) | 长程 Agent 要看目标有没有漂、状态有没有丢、结果能不能验、下一轮能不能接。 | 作为用户关注点，支持持续性必须配证据。 |
| [柳贯一](https://www.douyin.com/video/7650815406215584997) | 抱怨改一点就总结、没验证也说完成；推荐 Ralph Stop hook。 | 解释为什么“说完成”不能当完成标准。 |
| [Ai产品汪](https://www.douyin.com/video/7638307236518972691) | Ralph Loop 要给任务、检查和重启轨道。 | 不是无限自由发挥，而是检查后推进。 |
| [宫二](https://www.douyin.com/video/7641479417634191738) | 自称鸡肋版剧本工具测试，希望逐步全自动以释放劳动。 | 摩擦在步骤没接完，不能只加聊天入口。 |
| [超哥自媒体](https://www.douyin.com/video/7632965824646582246) | 教剧本、分镜、画面、配音剪辑四步。 | 创作者仍要组织整条链，音频与剪辑不能从成功定义消失。 |
| [梦](https://www.douyin.com/video/7644974882673804283) | 推荐小云雀短剧 Agent，称上传剧本全自动、角色稳定。 | 仅记为推荐／营销说法，未验证效果。 |

另外，[CodexGPTChat](https://www.douyin.com/video/7634756528931343845) 与 [yes工程师](https://www.douyin.com/video/7639304682477200741) 提到原生 `/goal`，本轮因此回到官方核实，结果见 §4.2；视频称“Codex 0.128.0 首次加入”的版本号未证实，不采纳。

这是关键词首页有限样本的**视频描述文本**，未观看完整视频、未读评论、未做代表性统计；不能写“多数创作者都认为”。TikHub 已查成，实际 API 计费金额未查到，不报零元。

### 4.5 Nomi 内部现状：哪些能直接站上去

**先纠正任务书中的三处名称／完成状态。** 指定基线未找到 `LANE_MAX_MODEL_REQUESTS`，也不存在 `scripts/agent-lane-replay-shadow.mjs`（已用 `rg`、`git ls-files` 和文件存在检查核验）。3a 审批已在 `laneHost.mts:179`；3c 看门狗调用仍在旧 `electron/harness/runtime/pi/run.mts:164`，不能把计划中的 lane 请求上限和 L2 回放写成已交付。L2 要求位于 `docs/plan/2026-09-07-agent-rebuild-stage3-5-deep-plan.md:229`；当前 L1 证据是 `tests/agent-runtime/lane-shadow-parity.test.mts:1`。

`.nomi/agent-session.json` 是已退役的 pre-Host 文件，打开项目时归档；现役旧对话上下文是 `.nomi/agent-thread-context-v1.json`（`electron/harness/context/contextPaths.ts:11`）。宿主 `snapshot-v1.json` 在注入 rootDir 的 `project-agent-host/<partition>/`，不是每个项目里同名文件（`electron/projectAgentHost/projectAgentRepository.ts:350`）。新 lane 才是 `<project>/.nomi/agent-sessions/`（`electron/agentLane/laneSession.mts:25`）。本轮未越出限定 worktree 寻找私人项目快照，所以这些是**实现路径证据，不是冒称看过某位用户的真实转录**。

| 能力 | 已有入口和边界 |
|---|---|
| 文稿／分镜／画布 | lane 目录组合 document／canvas／timeline（`electron/agentLane/laneToolCatalog.ts:41`）；`nomi_storyboard_write` 提供整表、改指定镜、落轴（`laneCanvasTools.ts:174`）。这里尚未完整装配生产、审片与导出工具。 |
| 批量出片 | `multiShotBatchScheduler.ts:9`：每 tick 读 durable Run→纯 derive→副作用；等待供应商采用有界观察，3s 到 15s 退避，超观察期由 caller 再 kick，不让模型空转（`:24`）。 |
| 断点／预算 | `productionRunPaths.ts:15`：run.json、events、commands、approvals、budget-ledger、intents；`budgetLedger.ts:52`：available=authorized−reserved−actual−unsettled；`productionRunResume.ts:14`：回执未知先 reconcile。 |
| 角色先定再拍 | `anchorCheckpoint.ts:51`；既有 `anchorAutoReleaseMs` 是时间驱动，不是质量判据（`batchScheduleDerivation.ts:232`）。Goal 不以超时自动通过审美岔路。 |
| 审片／重试 | `shotVerifyCore.ts:31` 三轴 1–5、阈值 3、0=不可评；`shotVerifyOrchestrate.ts:43` 默认两次重试；`productionQaVerdict.ts:89` 为差镜建新 job 保留谱系。生产 QA 路径仍需要 renderer（`productionRunDriverOps.ts:165`）。 |
| 落时间轴 | `src/workbench/generationCanvas/agent/sendStoryboardToTimeline.ts:84` → `src/workbench/adoption/adoptStoryboardBatch.ts:161`，同一批采纳、字幕和转场一并派生（`:199`），不要另写“拼接所有 URL”。 |
| MP4／产物 | `electron/export/exportJobs.ts:205` 已有 production export；`src/workbench/timeline/agent/exportToolCall.ts:178` 有导出、状态、verify 工具；`electron/productionRun/artifactProjection.ts:205` 投影产物预览。临时预览 URL 不是持久索引，应记 artifactId／版本／hash。 |

**研究发现的接线风险，不在本轮改码：** `productionQaVerdict.ts:126` 用“每个可重试镜头至少一预算单位”作资格判断，不等于真实模型报价；最终付费边界仍应校验，不能宣称该判断已保证重试总成本。`shotVerifyOrchestrate.ts:91` 在未评时 `passed` 可为 true，因此 Goal 必须同时看 evaluated／skipped／不可评计数。`productionRunDriverOps.ts:627` 组装和 `:671` 默认导出仍请求 renderer；“主进程活着”不足以保证关窗后整片完成。

**已有调研的关系。** `docs/research/2026-09-07-long-running-tasks-for-agent.md:17` 已讲清 deferred 是模型侧异步响应，不是视频任务；本文不重造它的 start／subscribe／artifact 结论。`2026-09-07-pi-reference-implementation-conformance.md:120` 已指出压缩领域错配，本轮进一步核实 Harness 的 custom 截断与 transform_context。`2026-09-07-pi-0.85.1-probe-report.md:1`、`2026-09-07-pi-package-ecosystem.md:1` 的探针和生态结论作为背景；本轮未重复安装或声称重跑。`2026-09-07-agent-self-review-of-generated-shots.md:373` 已盘点审片入口，Goal 只补“何时够交付”，不再造第二个判官系统。

## 5. 方案梯度：默认 v1

**取舍只有一个：先让一部短剧可靠交付，还是先做能运行任意长任务的平台。推荐前者。** 通用的会话、恢复、调度已有 owner；Nomi 值得写的是镜头质量与成片验收政策。

| 档位 | 解决哪个摩擦 | 加什么 | 为什么现在不加更多 |
|---|---|---|---|
| **v1：一个 Run、一条 lane、一部片** | 用户不用守着催“继续”，失败后不用手工找回镜头和预算 | 有界目标契约、Run 内计划与证据、同一 lane 续轮、质量／授权决策、交付验证 | 最小闭环已需解决六个前置门；优先花钱验证真实成片，不同时引入多 Agent 与新调度平台。 |
| v2：只把有证据的瓶颈并行化 | v1 数字证明审片／分镜规划串行拖慢总耗时 | 在同一 pi 内核委派只读、隔离上下文的子任务，统一预算；改善跨镜动作／声音审查 | 子 Agent 结果回流、素材冲突、评审成本会增加；没有 v1 的耗时和误判数据，不知道该并哪一步。 |
| v3：机器离线也持续的服务 | 用户合上电脑后仍希望新镜头生成、审片和导出继续 | 把有权持有同一任务的执行部署到持久在线环境，沿用 Run／授权／产物契约 | 涉及上传剧本／素材、存储与长期费用、权限迁移，属于新的产品承诺；本地可恢复不等于云端持续执行。 |

### 5.1 v1 怎样运行：只加决策闭环，不再造执行循环

1. **接剧本并建契约。** 使用现有 document／artifact 能力固定剧本版本。用户自然语言约束转换到已有 brief／contract／policy，新增最少的 Goal 验收和会话关联字段。模型只提交提案，宿主做 schema、权限、模型能力、时长和价格可行性校验。
2. **计划成为 Run 的领域数据。** Agent 规划“哪些镜头怎样实现”，持久写计划修订、依赖和预期证据；已生成状态派生自 jobs／artifacts，不再手抄一个完成数组。改第三镜只使相关产物失效，预算和旧成片不回滚。固定阶段名可作分类，不规定必须走固定 30 步。
3. **调用现成执行部件。** lane 提交有据的动作；生产提交、等待、下载、费用预留与对账仍交给 productionRun。scheduler 的 callback／游标事件说明结果已变，再唤醒同一 lane；不每秒问模型。
4. **压缩后继续认同一件事。** 每次推理用 `transform_context` 派生最新小状态块；runId／sessionId／laneName 与计划版本固定绑定。工具的大产物只返回 ID 和摘要，完整证据按需读取。不要造 goal-memory.json、progress.md、todo.md 三份同步文件。
5. **有界质量迭代。** 技术检查→已有逐镜审片→整片检查。默认上限可沿用“首发+最多两次定向重试”，但须与用户授权的 maxAttempts 取更严值、按真实单价预留。每次重试要有变更理由与被验证的差异；同一失败无改善不重复。动作／对白／节奏是验收必须检查的内容，不能因为 v1 简化而漏掉。
6. **决定继续／等待／停／交付。** `before_run_end` 只在 Run 未完成、允许继续且有下一决策时回 followUp；供应商在跑则结束本轮、保留 Goal，等事实事件再续。达到请求／时间／预算限额时安全停，不能通过创建新 run 清零。宣告目标已完成只接受交付验证器结果。

这里的**宿主**是负责落盘、权限与调工具的 Nomi 代码，不是另一个模型。它判断预算和是否存在产物；Agent 判断怎么修镜头。让宿主掌握“还能不能继续”，可避免模型对自己的失败既当选手又当裁判。

**完成证据最小形状（候选语义，非新外部协议）**：同一 Run 下指向 sourceScriptVersion/hash、goalRevision、timelineArtifactId/version、exportArtifactId/hash；镜头覆盖表记录 shotId→selectedArtifactId 或 approvedDegradation；质量记录区分 evaluated／skipped／failed，引用实际帧／音频／技术检查；费用引用既有 ledger 游标；降级清单由这些事实生成。对外读取走既有 production artifact 扩展点，实施时按 R31 核对既有协议，不创造平行“Goal 项目格式”。

### 5.2 写哪些文件、删哪些旧东西

以下是**实施候选落点**，不是本轮改动清单；必须在阶段 4 切换后的真实基线上重新确认。

| 档位 | 新写文件（候选） | 修改／复用的 owner | P1 删除或替换 |
|---|---|---|---|
| v1 | `electron/productionRun/goalContract.ts`（验收与关联字段校验）；`goalPolicy.ts`（继续／等待／质量岔路派生）；`goalDelivery.ts`（证据核验与降级报告）；`electron/agentLane/laneGoalBinding.mts`（hook 和事件接线）；对应契约与旅程测试 | `productionRunTypes/Repository/Reducer` 扩展同一 Run；`laneHost` 装绑定；现有 production／timeline／export／shotVerify 能力；按需补当前缺失的 lane 工具面 | 同一 Goal 执行范围内，将 driver 中固定“QA→组装→必须人工粗剪确认”的决策分支移到唯一 goalPolicy owner，原函数保留实际执行能力；不留两套续跑条件或双重 scheduler。阶段 4 负责删旧宿主，不把它的删除算成本功能功劳。若阶段 4 已删相关分支，此项为零，不能为了 P1 删除无关模块。 |
| v2 | `laneGoalDelegation.mts`（只有测出收益才写）、对应回流测试 | pi 现有子 lane／委派能力，Run 仍唯一领域账本 | 替换 v1 相应串行决策调用点，不保留两个 selectable runner；不引入新的子任务持久库。具体接口需补 R29 字段裁决。 |
| v3 | 部署入口如 `goalWorkerEntry.mts` 与归属转移适配；名称仅表示边界，不是定稿 | 同一 pi + productionRun，素材与凭证按正式部署方案处理 | 替换被迁移的本地驻留触发器；单任务同时只有一个执行 owner，不同时跑本地和远端两套。架构与安全方案未定，不能现在列虚构的精确删除数量。 |

不新增 Goal 页面。启动、暂停、质量岔路和交付先走既有对话／审批／产物展示能力；将来若增加控件，另按 P5 出真实布局样张。v1 的“最小”省的是平台和 UI，不是质量检查、钱闸和恢复正确性。

### 5.3 验收：数字和真实短剧一起交

本轮是调研，**以下均为未来验收门，未实跑、未产生合格率或生成费用**。

| 层级 | 验收方法与门槛 |
|---|---|
| 前置切换 | 先取得阶段 4 切换及原有 G1/G3/G4/G5 证据。指定基线 lane 仍不注册给用户（`electron/agentLane/laneIpc.ts:9`）；不能在影子 lane 上宣称产品交付。请求上限、看门狗、production／export 工具可达、L2 脚本均重新实核。 |
| 零额度 CI | 至少正常完成、两次压缩、提交后断线、审批中崩溃、重复完成事件、预算耗尽、质量失败且无重试额度、人工停止、切项目九类脚本。正确性要求：跨重启身份不变，重复扣费／重复提交=0，未授权调用=0，漏镜不允许 complete。 |
| 工具写对率（R30） | 分母=每个工具意图的首次调用数；分子=首次即选对能力、通过 schema、绑定正确项目／镜头且满足授权。失败按选择／schema／绑定／输出／端到端归因。loopback 应 100%；真实样本总体≥95%、写入与付费安全错误=0。每类列 n/N，重试成功不能冲淡首错。 |
| 回合成功率（R30） | 分母=有明确预期结果的决策回合数；分子=模型正常收尾且 Run 到达预期领域状态。正常等待也有预期状态，不用“有文字”冒充完成。真实至少三种任务各三次，有效样本≥9，目标≥90%；同时单报 Goal 完成率，不能混同。 |
| 1–2 分钟 MiniMax H3 真跑 | 固定真实剧本、5 约束与价格快照，生成多镜短剧，跑通角色参考→镜头→审片修正→声音／字幕→落轴→MP4；至少注入一次可恢复中断、一次低质重试，并证明合格镜头没有重生。额外用小窗口 fixture 强制两次压缩，避免真实样本没触发就当压缩验收过。 |
| 真实质量 | 人工完整看成片并听声音，保存关键画面／帧、音轨检查、逐镜质量证据和降级表；核对角色一致、剧情因果、动作可读、对白可听、字幕可读、无黑场缺镜、节奏与时长。VLM 不可评单列；评审模型与人工分歧记录，不以平均分遮蔽关键镜失败。 |
| 花费与停机 | generation + planning + compaction + judge + audio 全记实际账并与供应商记录对账；未知账单保持 unsettled，不释放额度。关窗／进程退出后分别重开，核验不重交；暂停期间不发新付费请求，既有供应商结果照收。 |
| v2 增量 | 重跑 v1 全部关键场景与 H3 真跑；与串行基线比较总耗时、成本、首调正确率、镜头冲突和回合成功率，安全错误仍为0。有显著收益才保留并行。 |
| v3 增量 | 在远端重跑同一 H3 闭环；断开本机、重启 worker、执行权转移、多端重连不能产生双提交；上传／存储费纳入总预算。未通过这些，不宣称“关机也不停”。 |

**六角色书面复核（同一研究员换视角，不冒称六名独立评审）**：CTO 看有没有第二内核／双 owner；设计看是否让用户守着审批；PM 看是否把“成片质量”缩水成“文件存在”；前端看关窗和既有 renderer 依赖；后端看提交未知与账本责任；真实用户看我是否仍要逐镜盯着修。结果都落在上述六条前置门。正式方案仍需按 R7 做独立角色评审，本研究不是实施放行。

## 6. 待拍板问题

只保留三个产品岔路；v1 的代码分层、字段命名和测试实现不占用用户决策。

| 真岔路 | 推荐项及理由 | 核心取舍 |
|---|---|---|
| 什么算可接受降级？ | 启动时允许仅修提示词、调整非关键剪辑；换主角／改结局／删关键情节／对白变静音／动态变静帧必须问。预算用完仍不能达标就给待处理结果，不能强行标完成。 | 少打断，与保住作品意图之间的边界。 |
| “一直跑”是否包含关闭 Nomi／电脑离线？ | v1 承诺应用可用期间自治、崩溃后可续；切换到别的任务不丢进度。关闭创作窗口后若 renderer 依赖尚未解除，明确暂停相应步骤；不承诺关机仍做本地审片和导出。若必须离线不停，直接进入 v3 的部署决策。 | 本地优先与全天候托管的成本／素材外传取舍。 |
| “开始”一次授权覆盖多大范围？ | 选“总预算封顶 + 模型允许集合 + 最大尝试数 + 明确局部重规划范围”，范围内不逐镜问，变更越界才问。现有合同绑定 planHash／job／attempt，必须先实现正式授权派生规则；未实现前不能承诺一句全自动就绕过收据。 | 完全不打断，与对费用及重规划保有可证明控制之间的取舍。 |

## 7. 来源清单与查阅边界

查阅日期统一为 **2026-09-08**。上文表格每格有 file:line 或官方 URL，以下集中列入口，区分查过、没查成和未执行。

### 7.1 安装包与仓内一手来源

- pi 版本：`C/package.json:3`；文档：`C/docs/compaction.md:1`、`sessions.md:1`、`session-format.md:1`、`sdk.md:1`；指定 SDK 11／12／13 与扩展示例逐项见 §3.2。
- Harness 真实现：`A/dist/harness/compaction/compaction.js:75`、`:295`、`:413`；`runtime/drive/structural.js:28`、`:837`、`:872`；`runtime/drive/checkpoint.js:59`；`runtime/drive/boundary.js:29`、`:90`；`runtime/drive/generation.js:120`；`session/context.js:13`；`agent-harness.d.ts:501`、`:510`、`:582`、`:645`。
- Nomi lane：`electron/agentLane/laneHost.mts:107`、`laneSession.mts:23`、`laneProjection.mts:140`、`laneApprovalGate.ts:215`、`laneToolCatalog.ts:41`、`laneIpc.ts:9`。
- Nomi production：`electron/productionRun/productionRunTypes.ts:341`、`productionRunPaths.ts:15`、`multiShotBatchScheduler.ts:9`、`anchorCheckpoint.ts:51`、`approvalPolicy.ts:77`、`budgetLedger.ts:52`、`submissionOutbox.ts:15`、`productionRunResume.ts:14`、`productionRunDriverOps.ts:612`、`productionQaVerdict.ts:89`、`artifactProjection.ts:205`。
- Nomi 成片：`electron/capabilityCore/shotVerifyCore.ts:31`、`shotVerifyOrchestrate.ts:43`；`src/workbench/adoption/adoptStoryboardBatch.ts:161`；`src/workbench/timeline/agent/exportToolCall.ts:178`；`electron/export/exportJobs.ts:205`。
- 主线：`docs/plan/2026-09-07-agent-rebuild-stage3-5-deep-plan.md:180`、`:229`、`:367`；既有研究关系见 §4.5，不把旧研究的外部链接冒充本轮重新访问。

### 7.2 外部一手来源

- 原生 Goal：Claude [Goal](https://code.claude.com/docs/en/goal)／[Commands](https://code.claude.com/docs/en/commands)；Codex [Goal runtime](https://github.com/openai/codex/blob/1e66885a16161048215a3782ecdd1739aab0aabf/codex-rs/ext/goal/src/runtime.rs#L399)、[状态](https://github.com/openai/codex/blob/1e66885a16161048215a3782ecdd1739aab0aabf/codex-rs/state/src/model/thread_goal.rs#L14)、[继续提示词](https://github.com/openai/codex/blob/1e66885a16161048215a3782ecdd1739aab0aabf/codex-rs/ext/goal/templates/goals/continuation.md#L23)。
- Anthropic 三篇指定文章：[Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)、[Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)、[Managing context](https://www.anthropic.com/news/context-management)；[Compaction API](https://platform.claude.com/docs/en/build-with-claude/compaction)、[SDK sessions](https://platform.claude.com/docs/en/agent-sdk/sessions)、[SDK TypeScript](https://platform.claude.com/docs/en/agent-sdk/typescript)。
- 其他通用实现：Codex [exec](https://developers.openai.com/codex/noninteractive)／[权限](https://developers.openai.com/codex/agent-approvals-security)；OpenHands [旧版 condenser](https://github.com/OpenHands/OpenHands/blob/0.56.0/openhands/memory/condenser/impl/llm_summarizing_condenser.py#L17)；Manus [原文](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)；Deep Agents [overview](https://docs.langchain.com/oss/python/deepagents/overview)；Ralph [原文](https://ghuntley.com/ralph/)。OpenHands 新 SDK／OpenCode／Gemini 的固定 SHA 源码链接完整列于 §4.2。
- 视频论文：[FilmAgent](https://arxiv.org/abs/2501.12909)、[MovieAgent](https://arxiv.org/abs/2503.07314)、[Anim-Director](https://arxiv.org/abs/2408.09787)、[AniMaker](https://arxiv.org/abs/2506.10540)、[StoryDiffusion](https://arxiv.org/abs/2405.01434)；各代码入口与实际实现锚点见 §4.3。
- 商业官方：[LTX](https://ltx.io/studio/platform/script-to-video)、[Hailuo Agent](https://hailuoai.video/agent-landing-page)、[Kling release](https://kling.ai/release-note/release-history)／[3.0 guide](https://kling.ai/quickstart/klingai-video-3-model-user-guide)、[Vidu Claw](https://www.vidu.com/zh/vidu-claw)。
- 自媒体：TikHub [OpenAPI](https://api.tikhub.io/openapi.json) 与 §4.4 的8条原视频链接；这些是创作者观点证据，不是官方能力证据。

外部原文通过公开页面／官方源码读取；部分 Claude 官网直取403后经 Jina 读取。公开搜索通过自己创建的浏览器标签页完成，搜索摘要仅定位；标签页已关闭。Codex 固定提交日期2026-09-07，OpenHands SDK／OpenCode 为2026-09-07，Gemini 为2026-09-04；网页无统一更新日期，不编造“刚发布”。

### 7.3 没查成／没有做

- 本机 `codex --search` 已实际尝试，但该 CLI 会话报告原生 web_search 不可用；改用公开浏览器搜索和官方页面／源码读取。不能声称 --search 成功。
- 商业产品的登录后审批／恢复／预算行为未实测；论文代码未运行，完整 demo 未观看；FilmAgent arXiv HTML 未查成，已用原项目页和论文摘要确认 Unity 范围。TikHub 描述查询成功，评论／转录层与真实计费金额未查。
- 当前工具清单没有 Context7 可调用接口；用安装包源码、官方文档与官方仓库补证，本轮 Context7 未查成。
- `LANE_MAX_MODEL_REQUESTS`、`scripts/agent-lane-replay-shadow.mjs` 在指定基线不存在；不得跨到其他 worktree 替它补证。
- 未访问限定目录外的真实用户项目转录，未运行生成、VLM、UI 走查或 H3 成片测试；本文不报告虚构的成功率、成片效果或实际生成费用。
- 本文给 R29 四列表与九层裁决；未改 framework-boundaries 登记／逐字段裁决文件，也未出 UI 样张。它是实施输入，不能当作框架接入／产品验收已完成。

### 7.4 本次文档交付验证

`delivery:preflight` 通过；文档来源交叉复核与 `git diff --check` 通过。`pnpm run gates:contracts` 跑完全部73项：70通过、2阻断失败、1 advisory 失败。阻断为既有软链依赖的 `check:electron-install`（runtime missing / node_modules symlink）以及未改动的 `videoDepth.worker.ts` 对 `onnxruntime-web` 的6处类型错误；advisory 是另一篇既有研究缺自媒体来源。本轮没有改生产文件，也按任务禁令没有安装或修依赖；这些失败保留为验证限制，不能报告全绿。未额外跑生产单测或成片测试。
