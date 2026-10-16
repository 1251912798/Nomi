# Agent 权限挡位改两档 + 两个刹车 · 设计卡（2026-10-12）

> 状态：🚧 第二轮实现已本地提交（D-L19）；独立验收、真付费验收由协调会话安排

```
改动名：Agent 权限挡位 三档 → 两档（请求批准 / 直接生成）+ 刹车   线/负责人：L19   类别：[花钱][长跑][可打断][新界面]
```

## 0. 用户拍板（10-12，原话摘）

- 「挡位这个地方有问题啊 相当于没有挡位 我觉得设计成两个 一个是请求批准 一个全部可以直接生成……然后每个挡位下面写个灰字描述会发生什么」
- 刹车：「不设固定次数，只在同一镜头连续失败重试超过 2 次、或超出它说好的计划时才停。ok」
- 升级默认：「全部落在『请求批准』」。

协调会话对第一轮五个问题的拍板（10-12，第二轮依据）：①刹车 1 = 连续失败满 3 次、第 3 次重试前停，点「继续」后从这次确认重新数；②只计可能已到过供应商的失败（用既有判据）；③刹车放在「策略代批」那一个点，退回「请求批准」的正常确认卡，不新建派发闸、不加第二道兜底；④旧「全自动」用户升级不弹窗，全部落「请求批准」；⑤刹车 2 点「继续」= 这一镜追加进本轮计划并放行，记人为手势收据。

## 1. 现状核对（和第一轮任务书有两处出入，已按代码为准）

1. 任务书说「三档 spend 恒 confirm」。代码里 2026-09-12 起「全自动」已经由档位代答付费（`spendDecidedByPolicy`，收据 `decidedBy: policy:full_auto`）；`agentPanelV4Types.ts` 里「三档 spend 恒 confirm」的注释是过期的，随旧三档一并删。所以这次其实是：「自动改」→「请求批准」、「全自动」→「直接生成」并加刹车、删「每步问」和没有读者的 `spend` 轴。设计记录里被改的时间点是 09-12 和 10-12 两次。
2. 灰字原来只显示选中的那一档；现在每档标题下各一行。

## 先查别人

> 诚实前提：第一轮设计卡在动手前没写这一节，这是第二轮推送前按门岗补的检索；它没有推翻任何决定，但把「哪些是通用的、哪些是我们独有的」写清楚了。

- **依赖里已有？** 工具调用的拦截点用的是 lane 运行时自带的钩子：`beforeToolCall` 返回 `{ block, reason }` 就能挡住一次调用（[`node_modules/@earendil-works/pi-agent-core/dist/types.d.ts:35`](../../node_modules/@earendil-works/pi-agent-core/dist/types.d.ts)），审批闸 `laneApprovalGate` 就挂在它上面，这次没有另造拦截层。依赖里**没有**「按挡位决定要不要问」或「连续失败停下」的现成件：`ai@4.3.19`（`node_modules/ai/package.json:3`）的工具定义里没有审批字段，pi 的钩子只给「挡 / 不挡」这一个原语。
- **仓库里已有？** 全接，没有另写：档位判据 [`capabilityApprovalPolicy.ts:139`](../../electron/shared/agentCapabilities/capabilityApprovalPolicy.ts)（`spendDecidedByPolicy`）、镜 ↔ job [`productionShotJobs.ts:47`](../../electron/shared/productionShotJobs.ts)（`jobsForShot`）、「可能到过供应商」判据 [`productionShotJobs.ts:24`](../../electron/shared/productionShotJobs.ts)（`jobMayHaveReachedProvider`）、把出价标成要人工决定的既有路 `markGenerationPolicyDecisionFailed`（[`productionGenerationPresentationEdits.ts:115`](../../electron/productionRun/productionGenerationPresentationEdits.ts)）、切档确认与提醒条 `useAgentPanelAutoMode` / `V4AutoModeBanner`。刹车判定是这几样的组合，没有第二份计划、没有计数器。
- **生态里已有？**（只引通用规范与官方文档）
  - 工具调用要有人在回路里、并能逐次确认：MCP 规范的工具一章明写客户端应当给人确认敏感调用的机会（<https://modelcontextprotocol.io/specification/2025-06-18/server/tools>）——对应「请求批准」默认档、不可逆操作两档都问。
  - Agent 宿主协议把权限请求做成「这一次允许 / 一直允许 / 拒绝」的选项，由宿主问人（Agent Client Protocol 的工具调用一章，<https://agentclientprotocol.com/protocol/tool-calls>）——编码类 Agent 的审批模式普遍就是「逐次确认 / 自动批准」两态，不是三档；但它们的对象是文件 / 终端操作，没有「按镜头花钱」与计划、连续失败这些事实。
  - 「先给计划、按计划自动执行、计划外要再批」：基础设施工具的 plan / apply 与 `-auto-approve`（<https://developer.hashicorp.com/terraform/cli/commands/apply>）——对应刹车 2「超出说好的计划就停」。
  - 「同一目标连续失败就熔断、不再自动重试」：断路器模式（<https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker>）——对应刹车 1；我们只取「连续失败满 N 次就停下交给人」这一半，不做自动半开重试（用户拍板：停下问）。
- **TikHub 自媒体里怎么说？** 未查：TikHub 密钥按约定用时由用户临时提供、本线不碰任何密钥；这一项不影响结论（挡位语义由用户 10-12 直接拍板）。
- **结论**：拦截原语、档位判据、计划与失败事实全用已有；「直接生成档在什么事实上替用户停下」——按镜头的连续失败、Run 上已批的计划、停止——是按镜头花钱的领域语义，生态里没有可接的现成件，自研（`directGenerationBrakes.ts`，登记 `agent.direct-generation-brakes`）。

## 2. 目标设计

| 挡位 | 能撤销的本地改动 | 要生成的 | 撤销不了的操作 | 灰字（zh） |
|---|---|---|---|---|
| 请求批准（默认） | 直接做 | 每次先看确认卡，确认才跑 | 每次问 | 改文案、摆节点这类能撤销的直接做；要生成，或做撤销不了的事，先停下来等你确认。 |
| 直接生成 | 直接做 | 不再逐次问，直接开跑 | 每次问 | 要生成就直接开跑，不用一次次确认；同一个镜头连续失败、或要做计划外的生成时会停下来问你，随时可以点停止。 |

en 灰字：`Undoable edits like rewriting text or placing nodes happen directly. Anything that generates, or cannot be undone, waits for your confirmation first.` / `Generation starts right away, with no confirmation each time. If one shot keeps failing, or a generation falls outside the plan, it stops and asks you. You can press Stop at any time.`

**文案偏差，需要你知道**：用户原话和第一轮的灰字里有「要花钱生成」「自动花钱」。`check:i18n` 的「界面不谈钱」门岗（`POSITIVE_SPEND_CLAIMS` 含「花钱」）会拦这个词，该规矩来自用户 09-26 / 10-02 的拍板（现在走中转，界面不谈钱）。两条用户意思冲突，我按「文案只说事实、不出现价格 / 预算 / 额度 / 花钱」取了更窄的一条：把「花钱生成」写成「生成」，切档确认写「直接开跑、不再逐次问你」。如果要保留「花钱」二字，需要在 `NOT_MONEY` 登记并给出理由，这是产品措辞取舍，请协调确认。

刹车（只在「直接生成」档；「请求批准」档每次本来就问，不重复打断）：
1. **连续失败**：同一镜头**从上一次人批之后**连续失败满 3 次（失败 1、2 次后各自动重试一次），第 3 次重试之前停。只计「可能已到过供应商」的失败（`jobMayHaveReachedProvider`，既有判据）；提交前断网这类没写出去的不计也不重置；成功清零；最近一次失败没到过供应商时照样要这一次决定、照样判（V-1203）。「人批」读事实：批那次尝试的付费门属于哪次出价、那次出价是不是人在卡上点的。
2. **计划外**：这个 Run 里已经有镜被批过（= 说好的计划），而这一次要代批的是还没有 job 的新镜 → 停。第一次代批时 Run 里还没有 job，不存在计划外。

两个刹车都**只判这一次出价摆出来的镜**（`currentPresentation().shotIds`，出价的唯一 owner）：一个早就被晾在一边的失败镜，不让之后每一次不相干的出价都停下来问。
3. 同一处也判：**已停止**（Run 处于暂停 / 需要处理 / 已取消）——用户点过停止就不替他续跑。

刹车成立 = 这一次决定退回「请求批准」的正常确认路径：不请求付费门、不铸收据、不开跑，把这份出价标成「要人工决定」，报价卡立刻摆出来，卡上多一行说明为什么停（`PendingSpendConfirm.brake`，由 Run 现派生，不落盘）。用户在卡上点的是正常的人为手势确认。

其它：停止键随时有效；切到「直接生成」弹一次确认（复用 `useAgentPanelAutoMode`，判断收成 `tierSwitchNeedsConfirm`）；升级迁移——旧值全部落「请求批准」，不弹窗；文案只说事实。

## 3. 概念占用表（★2 谁说了算）

| 概念 | 唯一 owner（文件:符号） | 说明 |
|---|---|---|
| 挡位（词表） | `electron/shared/agentCapabilities/capabilityApprovalPolicy.ts` 的 `PROJECT_AGENT_APPROVAL_MODES = [request, direct]` / `ProjectAgentApprovalPolicy` | `spend` 轴、`step / safe-auto / project` 同提交删 |
| 挡位（落盘与迁移） | `electron/settings/agentApprovalPolicySettings.ts#readAgentApprovalPolicy / writeAgentApprovalPolicy`；形状与**迁移唯一发生处** `agentApprovalPolicyContract.ts#normalizeAgentApprovalPolicySettings`（schemaVersion 2；旧词与新词表无交集，认不出一律落 `request`），登记 `docs/engineering/concept-owners/agent.approval-tier.json` | 渲染层 `projectAgentApprovalPolicy` 是投影 |
| 花钱放行（带 Run 的入口） | **`electron/shared/agentCapabilities/directGenerationBrakes.ts#spendDecisionByPolicy`**（档位 + 三个刹车事实），登记 `docs/engineering/concept-owners/agent.direct-generation-brakes.json` | 档位那一半仍是 `spendDecidedByPolicy`（只剩它自己和 `tryModel` 这类没有 Run 的调用用） |
| 「本轮计划」 | Run 上**曾经**有过 job 的镜（`production.shot-jobs` 的 `jobsForShot`；去掉 / 移出批次的镜也算，V-1203 F1），不另存第二份计划；每次派生 | 点「继续」→ 走正常确认卡 → 这一镜有了 job → 自然进计划（拍板 5），无基线要维护 |
| 「同一镜头」与连续失败 | `electron/shared/productionShotJobs.ts#jobsForShot`（镜 ↔ job）+ `productionShotPhase.ts#productionJobPhase`（失败判定）+ `jobMayHaveReachedProvider`（计不计）；数法 `directGenerationBrakes.ts#consecutiveFailedAttempts` | 点「继续」之后「从这次确认重新数」读人批的事实（付费门 → 出价 → 谁决定的，`attemptApprovedByHuman`），不存计数器 / 标记位 |
| 停止 | 既有 `productionRunControl.ts#applyRunControl` + `isStoppedRunStatus` | 不新增停止通道 |
| 放行矩阵 | `capabilityApprovalPolicy.ts#capabilityApprovalDecision`（内部调用 `capabilityMayReuseSafeApproval` / `spendDecidedByPolicy`，不复制判据） | 硬闸（花钱 / 不可逆 / 解不出效果类 / destructiveHint / 逐次计划审阅）两档都问，一字不松 |
| 切档确认 | `agentPanelV4Logic.ts#tierSwitchNeedsConfirm` + `useAgentPanelAutoMode.ts` | |

**door-map 结论（`node scripts/door-map.mjs spendDecidedByPolicy`，改前 → 改后）**：改前 3 个文件 4 处直接调用（`generationDispatcher.ts:273`、`generationTransportAdapters.ts:407 / 557`、`tryModel.ts:158`）；改后带 Run 的入口收成 **2 扇**（`generationTransportAdapters.ts` 一处 `policyVerdict`，`generationDispatcher.ts` 一处）都问 `spendDecisionByPolicy`，`spendDecidedByPolicy` 只剩 `spendDecisionByPolicy` 自己和 `tryModel`。`generationDispatcher` 那一扇是没有 `requestGenerationGate` 的旧挑战路，不落任何 Run，刹车看的 job 事实根本不存在，所以只剩档位那一问（应用内与 MCP stdio 两个宿主都递了 `requestGenerationGate`，不走这里）。

## 4. 九格

| 格 | 结论 | 证据 |
|---|---|---|
| ★1 用户怎么用 | 当我让 Agent 一口气做完一组镜头时，我想选「直接生成」以便不用每个镜头点一次确认；想谨慎时留在「请求批准」。步骤：点输入框权限入口 → 看到两档各一行灰字 → 选「直接生成」→ 弹一次确认 → 让 Agent 生成 → 一路跑，随时点停止 → 某镜连续失败 3 次或要生成计划外的镜头，报价卡立刻出现、卡上一行说明为什么停 → 点确认继续 / 去掉。**不做**：不设固定次数 / 张数上限；不显示价格 / 预算 / 额度；不让不可逆操作自动放行。已知坑：旧「全自动」用户升级后回到「请求批准」，要自己重新选；Agent 在首次代批之后再往同一份草稿里加镜头，每个新镜都会停一次（刹车 2 的设计后果）。真实任务（协调会话真付费验收）：①6 镜分镜「直接生成」跑完；②其中 1 镜让上游连续失败 3 次；③跑到一半点停止再重启。主指标：直接生成档下每镜头平均需要用户点击次数 = 0；护栏：重复扣费 0、停止后新增提交 0 | 走查 `tests/ux/agent-permission-two-tiers.walk.mjs`；真付费验收（协调会话） |
| ★1b 连带界面 | ①权限弹层两档 + 各一行灰字（zh / en）；②切档确认卡（`autoModeConfirm*`）：「切到『直接生成』？」，正文说清「直接开跑、不再逐次问你；连续失败 / 计划外会停；不可逆仍每次问；随时可停止」；③常驻提醒条：`直接生成 · 撤销不了的仍会问 [回到请求批准] ×`；④刹车触发时报价卡多一行说明（`brakeRetry / brakeOutOfPlan / brakeStopped`，zh + en，介入槽 `summary`）；⑤设置里没有档位的第二处入口（已核）。全部不出现价格 / 预算 / 额度 / 花钱 | 截图；`check:i18n` |
| ★2 谁说了算 | 见 §3，碰 7 个概念：5 个沿用既有 owner，2 个新登记（`agent.direct-generation-brakes`、`agent.approval-tier`） | `node scripts/door-map.mjs`；`check:concept-owners` |
| ★3 一致与复用 | 复用 `spendDecidedByPolicy`、`approvalReceipt` 的策略收据路径、`useAgentPanelAutoMode`、`V4AutoModeBanner`、介入槽 / 报价卡、`jobsForShot`、`jobMayHaveReachedProvider`、`markPolicyDecisionFailed`（把出价标成要人工决定的既有路）。刹车判定是新概念（纯函数，无第二份定义）；现有 `maxAttemptsPerJob`（批准记录里的上限）语义不同，不拿来当刹车 | `check:concept-owners`；`git grep` |
| ★4 全状态 | 空：没有生成任务时挡位只是设置。成功 / 失败：同现状。失败 1、2 次：自动重试；第 3 次失败 → 刹车 1，报价卡出现并说明。部分成功：计划内成功的镜保留。**取消中**：点停止后已交出的保持生成中、不再续派；停止后再有草稿被代批时退回报价卡（说明「你点过停止」）。过期：同意过期仍走现有「需要处理」，不因直接生成放宽。能力不可用：没有可用模型时与现状同路径。文案 zh + en；不写免费 / 不计费 / 没扣费 | `check:i18n` |
| 5 中途表 | 见 §5 | `directGenerationStop.e2e.test.ts` + 协调会话真付费 |
| 6 外部数据与失败 | 外部来源：供应商提交 / 查询；用户盘上 `agent-approval-policy.json`。盘上文件被手改或写坏 → `readConfigFileOrDefault` 改名留底并按默认「请求批准」；旧词表（step / safe-auto / project）与新词表无交集，一律落 `request`；认不出的值落 `request`。供应商失败文案沿用既有路径，不新造；提交前断网不计入刹车 | `agentApprovalPolicyTwoTiers.test.ts`、`agentApprovalPolicySettings.test.ts` |
| ★7 性能 | ①新增操作：打开权限弹层、切档、切档确认、刹车卡出现；②最坏规模：1000 镜头一个 Run、每镜 3 次失败（3000 个 job）；③预算：弹层 / 切档反馈 ≤100ms；刹车判定一次 ≤50ms；④量具：`electron/shared/agentCapabilities/directGenerationBrakes.perf.test.ts`（`NOMI_PERF=1` 才计时，与 `canvasShotLatency.perf.test.ts` 同一约定；常规套件只跑「请求批准档不读 Run」那条正确性断言）。数字**待协调给安静窗口后重测**：第一轮那组 16ms / 33ms 是机器忙时量的，作废；第二轮只验了量具能跑通（预算 50ms，一次代批只判一次、同步在草稿落盘之后封印之前）。判定对每镜走 `jobsForShot` 过滤（O(镜 × job)），1000 镜内可接受；超过几千镜时再换成按镜分组（那需要先改 `jobsForShot` 这个唯一 owner）。页面交互只渲染两行文字，不依赖 Run 规模，不登记画布性能场景：`perf-scenario：不适用：新增交互只是弹层里两行文字 + 一次确认卡，渲染量与项目规模无关；规模相关的只有刹车判定，量具 directGenerationBrakes.perf.test.ts（NOMI_PERF=1），预算 p95 ≤ 50ms，数字待安静窗口重测` | `NOMI_PERF=1 pnpm exec vitest run electron/shared/agentCapabilities/directGenerationBrakes.perf.test.ts --silent=false` |
| 8 真实条件 | Windows 开发态真 Electron 走查已跑（见 PR 正文截图）；英文界面、暗色已覆盖；真付费、最小窗口、干净安装：`unverified`，由协调会话做真付费验收 | 截图路径；走查报告 |
| ★9 验收与回滚 | 验收：另一条线用本卡 §6 测试表逐条核；`## 独立验收` 待验收线填。回滚：revert 实现提交即回三档；盘上 `schemaVersion 2` 文件被旧版读到时，旧 `normalize` 对未知 `mode` 落旧默认，不会越权。逃逸账本 `REAL-20261012-01`（`fixedInPr` 占位 9999，开 PR 后换真号） | `## 独立验收`；`tests/ux/full-walk/escapeLedger/REAL-20261012-01.json` |

## 5. 中途表（格 5）：「直接生成」档，生成进行中

事实基础（读码确认）：派发闸 `productionShotDispatchGuard` 在提交 outbox 第一笔耐久写之前按盘上最新 Run 再判一次，停止后 `decideShotClaim` 返回 `run_stopped`；同一镜的 jobId 由 `runId + contractHash + attempt + shotId` 派生，重复交同一镜只命中同一个 job；收据一次性消费。**刹车不新增通道**，只在「策略代批」那一点把这一次决定退回报价卡。

| 状态 × 打断 | 点停止 | 关窗 | 断网 | 重启 | 连点 |
|---|---|---|---|---|---|
| 已交出、供应商生成中 | 该镜保持「生成中」，后续镜标「已停止」；该镜照常扣一次（已受理，撤不回），回执在任务列表 | 主进程继续跑已交出的，关窗不是停止 | 已交出的靠轮询恢复不重发；未交出的提交失败 → 记为失败 attempt（到过供应商才计入刹车 1） | 新调度器从 Run 的 `jobs[]` 重新派生，已有 job 的镜不重发，不扣第二次 | 同镜并发交两次 → 同 jobId，供应商只收一次（e2e 护栏） |
| 排队、尚未交出 | 派发闸 `run_stopped`：一个字节不发、无预留、不扣费 | 继续按 Run 当前态派 | 提交前断网 → 失败但未到供应商（`provider_not_reached`），不扣费，**不计入**刹车 1 | 重启后继续派剩余镜，已停的不派 | 连点停止：幂等 |
| 刹车已触发（连续失败 / 计划外 / 已停止） | 报价卡还开着：点停止 = 整轮停，这笔出价收回 | 报价卡是 Run 的投影（`brake` 由 Run 现派生），重开面板从 Run 重建，不丢 | 无外部调用 | 重启后卡仍在（出价没被收回），需用户点才再派；`stalePresentationSweep` 对要人工决定的出价照旧处理 | 连点确认：第一次放行，之后同一镜已有 job → 幂等无副作用 |

刹车触发时界面：报价卡原样（标题 / 参数 / 按钮与「请求批准」下一模一样），正文多一行「这一镜连续失败了，先停下问你 / 这次要生成的镜头不在刚才说好的计划里，先停下问你 / 你点过停止，这一次先不自动开跑」。继续 = 点卡上的确认（走正常人为手势收据）；放弃 = 点卡上的「去掉」。不会因为没点而自动继续。

## 6. 测试对照表

必红测试（第一轮已提交，第二轮实现后转绿）：`capabilityApprovalTwoTiers.test.ts`、`agentApprovalPolicyTwoTiers.test.ts`、`agentPanelV4TwoTiers.test.ts`。第二轮按协调拍板调整了两处**断言形状**（不是削弱）：①连续失败按 job 状态派生，并加「点继续后从这次确认重新数」「提交前没写出去的不计」；②计划基线取自 Run 上已有 job 的镜（原稿读 `approvals`）。另新增 `spendDecisionByPolicy` 一组（档位 + 刹车一起问）。

回归护栏（**不是必红**，本来就绿）：`electron/productionRun/directGenerationStop.e2e.test.ts`——「直接生成」档下停止 / 连点 / 重启不重复扣费，走现有派发路径。第一轮写成必红时假设了一个新的派发闸，拍板后撤销（「派发闸不加第二道兜底」）。

新增：`generationTransportAdapters.test.ts` 的「direct 档刹车」五条（真实适配器边界：连续失败 → 不请求门不铸收据且出价标成要人工决定；计划外同；不成立照旧代答；标记写失败不改结论、草稿结果照常返回；请求批准档连 Run 都不读）、`capabilityApprovalTwoTiers.test.ts`「只判这一次出价摆出来的镜」（带阳性对照）、`productionPendingSpend.test.ts`（卡带 brake）、`agentPanelSpendCard.test.ts`（多一行说明）、`directGenerationBrakes.perf.test.ts`。

lane 夹具：原来靠「每步问」制造等待点的 lane 测试（审批闸、排队、停止、重启、L1 拒绝场景、R30 审批臂等）改用 `tests/agent-runtime/laneFixture.mts#mustConfirm`——宿主「这一次必须当场确认」的事实（`forceConfirmation`），被测的等待语义不变，不依赖某个能力恰好是硬闸。

## 7. 设计记录改动（已做）

- `docs/design/2026-10-08-approved-designs.md` §⑦「10-12 用户：挡位改两档」。
- `docs/design/2026-09-10-spend-card-node-params-and-full-auto.md` 顶部标注被改，原文保留。

## 8. 删什么（P1，已同提交做）

删 `step` 档与全部词典、`PROJECT_AGENT_SPEND_POLICIES` / `within-budget` / `spend` 轴、`approvalPolicyRank` / `isNoWiderThan`、`agentPanelV4Types.ts` 里过期的「三档 spend 恒 confirm」注释、`laneApprovalGrantable` 里的 `step` 分支、`trustLevelFromApprovalPolicy` 里的 `confirm_all` 映射、适配器与分发器里各自直接调用的 `spendDecidedByPolicy`、设计实验室三个旧档位状态与基线图。不留旧词的运行时别名；迁移只在 `normalize` 一处。选「换」不是「补」：加第四档或给「全自动」加说明会保留没人要的「每步问」和没有读者的 `spend` 轴。

## 9. 已知缺口（诚实标注）

1. 刹车 2 在 Agent 分多次往同一份草稿里加镜头时会逐个停（设计后果，不是 bug）。
1b. 刹车 2 的「计划」是**一个 Run**（一份草稿）里已经批过的镜。文稿方案一次请求只有一份（D5，`generationDocumentPlan.planToExtend`），所以「同一轮里往方案里再补镜」在方案 Run 上算计划外（但文稿方案的生成当前根本不经刹车、每批都问人，见 4b）；但**画布草稿一次请求可以建好几份**（宿主刻意允许），Agent 在同一轮里另起一份新草稿时，新 Run 里没有 job、不算计划外，刹车 2 拦不到。要把「这一轮的计划」扩成「这一次请求建的所有 Run」，得先给画布草稿也立一个按请求的 owner（今天只有文稿方案有）——这是产品取舍，已报协调。
2. 旧挑战路（`generationDispatcher` 无 `requestGenerationGate` 时）没有 Run 可读，刹车不适用；两个生产宿主都不走它。
3. 三条真机走查（`agent-v4-short-film`、`stage4-switch`、`agent-runtime-provider`）原来靠「每步问」让可撤销的文稿写入也弹确认卡；第二轮改成「请求批准下直接做」并用因果证据钉住（工具结果回到模型之前没有任何点击）。短片走查里「带着待确认收起 → 胶囊『等你确认 1』」和「拒绝并写原因 → 冷重启后原因仍在」两段因此没有了触发点：前者由 `shell-redesign` 走查覆盖，后者在真 Electron 里暂时没有覆盖（lane 层由 `lane-approval-gate` / L1 F3 覆盖）。要补回真机覆盖需要一个在创作面上必然要确认的真实动作，见报告里的待拍板项。
3b. 用户点停止时被撤下的那次尝试（`needs_attention` 无错因 / `cancelled_remote` / `too_late`）目前也计入「连续失败」——偏保守（多问一次），不会少问。
3c. 收据账本里的策略签名字段沿用历史字面量（`policyMode: "project"`、`decidedBy: "policy:full_auto"`）：它们是已落盘收据的审计词表、带 MAC，不是用户看得见的档位；这次不改，改要另开一刀迁移收据。
4. 真 Electron 里「刹车报价卡」一张未走（需要真供应商连续失败三次的夹具）；该卡的多一行说明由真生产投影函数的单测钉住，截图用设计实验室里的生产组件出，真 App 走查留给协调会话的真付费验收。
5. 设计实验室的视觉基线是 darwin 渲染，本平台没有重录。

4b. **文稿方案的整批生成两档下都仍每批问一次**（2026-10-16 真付费验收发现、协调裁定先如实标注）：Agent 对文稿方案调 `generate` 走的是渲染层分镜批量那条路（`storyboardRowActions.runStoryboardBatch` → 全局确认框，同时是勾选清单），执行落在各镜各自的画布单镜 Run 上，不经 `spendDecisionByPolicy`，档位代答与两个刹车对它都不生效。这样**安全**：每批都有人点头，只是「直接生成」档在这条路上做不到免确认。界面已如实说（直接生成的灰字与切档确认各加一句「按文稿里的分镜方案出图，仍会每批问一次」，zh / en）；门岗 `eslint.config.mjs` 拦新的 `requestConfirm` 调用者，分镜批量改经 owner `confirmStoryboardPlanBatch`。结构解：文稿方案改走它自己的方案 Run，见 `docs/plan/2026-10-16-manuscript-plan-own-run.md`（需用户看样张拍板，0.24 设计线）。
