# Agent 权限挡位改两档 + 两个刹车 · 设计卡（2026-10-12 · 第一轮）

```
改动名：Agent 权限挡位 三档 → 两档（请求批准 / 直接生成）+ 刹车   线/负责人：L19   类别：[花钱][长跑][可打断][新界面]
```

状态：第一轮（设计卡 + 必红测试）。实现、走查、截图、真付费验收是第二轮，由协调会话另行通知。

## 0. 用户拍板（10-12，原话摘）

- 「挡位这个地方有问题啊 相当于没有挡位 我觉得设计成两个 一个是请求批准 一个全部可以直接生成……然后每个挡位下面写个灰字描述会发生什么」
- 刹车：「不设固定次数，只在同一镜头连续失败重试超过 2 次、或超出它说好的计划时才停。ok」
- 升级默认：「全部落在『请求批准』」。

## 1. 现状核对（和任务书有两处出入，先写明）

1. 任务书说「三档 spend 轴恒 confirm、钱的闸 = 每次看报价」。**代码里这句只对了一半**：`agentPanelV4Types.ts` 的 `PERMISSION_POLICIES` 三档 `spend` 确是 `confirm`，但 2026-09-12 用户已经拍板「档位本身就是授权」，`capabilityApprovalPolicy.ts#spendDecidedByPolicy` 现在对 `mode === 'project'`（全自动）返回 `true`，主进程 `generationDispatcher.ts` / `generationTransportAdapters.ts` / `tryModel.ts` 已经在全自动下由策略代答付费（收据 `decidedBy: policy:full_auto`）。所以今天的「全自动」**已经**会直接花钱；`agentPanelV4Types.ts` 里「三档 spend 恒 confirm」的注释是过期的，第二轮顺手随旧三档一起删。09-10 那条「钱的闸 = 每次提交看报价确认」的**真正被改**的时间点是 09-12，10-12 是第二次改口，设计记录两处都标注（见 §7）。
2. 「请求批准 / 直接生成」不是新能力，而是**把今天的三档收成两档并加刹车**：「自动改」(safe-auto) → 请求批准；「全自动」(project) → 直接生成（刹车是新增的）；「每步问」(step) 删。用户抱怨「相当于没有挡位」的根因就是「每步问」与「自动改」在花钱 / 不可逆上行为完全一样，只差可撤销的本地改动。
3. 灰字今天有，但**只显示选中那一档**（`V4PermissionPopover` 只渲染 `permissionWhy[permission]`）。用户要的是「每个挡位下面写个灰字」，第二轮改成每档按钮下各一行。

## 2. 目标设计

| 挡位 | 能撤销的本地改动 | 花钱的生成 | 撤销不了的操作 | 灰字 |
|---|---|---|---|---|
| 请求批准（默认） | 直接做 | 每次先看报价，确认才跑 | 每次问 | 改文案、摆节点这类能撤销的直接做；要花钱生成，或做撤销不了的事，先停下来等你确认。 |
| 直接生成 | 直接做 | 不再逐次问，直接开跑 | 每次问 | 要生成就直接开跑，不用一次次确认；同一个镜头连续失败、或要做计划外的生成时会停下来问你，随时可以点停止。 |

English gray text（第二轮落进 `agentPanelV4.permissionWhy`）：
- request：`Undoable edits like rewriting text or placing nodes happen directly. Anything that spends on generation, or can't be undone, waits for your confirmation first.`
- direct：`Generation starts right away, with no confirmation each time. If one shot keeps failing, or a generation falls outside the plan, it stops and asks you. You can press Stop at any time.`

刹车（只在「直接生成」档生效；「请求批准」档每次本来就问，不重复打断）：
1. 同一镜头连续失败：重试超过 2 次 → 停下问。判定：最近连续失败的 attempt 数 **>= 3**（失败 1 → 可重试，失败 2 → 可重试，失败 3 → 第 3 次重试前停）。任务书写「第 3 次失败重试前停」，按这个读；请协调确认（§9 Q1）。
2. 超出这一轮开头说好的计划 → 停下问。基线与 owner 见 §3。

其它：停止键随时有效；切到「直接生成」弹一次确认（复用 `useAgentPanelAutoMode` 那套，文案改成说清会自动花钱）；升级迁移——旧三档全部落到「请求批准」（包括旧的「全自动」，用户要自己重新点出来）；文案只说事实，不出现价格 / 预算 / 额度字样。

## 3. 概念占用表（★2 谁说了算）

| 概念 | 唯一 owner（文件:符号） | 今天 | 第二轮 | 允许的消费者 |
|---|---|---|---|---|
| 挡位（用户选的档） | `electron/shared/agentCapabilities/capabilityApprovalPolicy.ts` 的 `PROJECT_AGENT_APPROVAL_MODES` / `ProjectAgentApprovalPolicy`（词表）；落盘 `electron/settings/agentApprovalPolicySettings.ts#readAgentApprovalPolicy / writeAgentApprovalPolicy`（唯一读写口，`agentApprovalPolicyContract.ts#normalize...` 是形状） | `step / safe-auto / project` + `spend` 轴 | 词表改为 `request / direct`；`spend` 轴（`PROJECT_AGENT_SPEND_POLICIES`、`within-budget`）整根删（没有任何读者在认它，见 §1 第 1 条）；schemaVersion 1→2；`normalize` 是迁移唯一发生处 | 面板（`agentPanelV4Types.ts` 的 `PERMISSION_POLICIES`/`PERMISSION_TIERS` 只做词 → 合同映射，不另判）、lane（`laneDesktopRuntime`）、外部 MCP（`generationTransportAdapters`） |
| 花钱放行（宿主面「代答还是问」） | 同文件 `spendDecidedByPolicy` | `mode === 'project'` | `mode === 'direct'`；仍只有它一个回答者 | `generationDispatcher.ts`、`generationTransportAdapters.ts`、`modelOnboarding/tryModel.ts`（照旧，不新增） |
| 放行矩阵（可撤销 / 花钱 / 不可逆 × 档） | 同文件 `capabilityMayReuseSafeApproval` + `capabilityIsHardGated`；第二轮新增 `capabilityApprovalDecision` 作为矩阵的单一可读出口，**内部调用前两者，不复制判据** | 判据分散在两函数 + `spendDecidedByPolicy` | 矩阵测试钉死；硬闸（花钱 / 不可逆 / 解不出 / destructiveHint）一字不松 | `laneApprovalGate.ts`、`dispatcher.ts` |
| 「本轮计划」（说好要生成哪几镜） | **已有 owner，不自造**：制作流程的 Run 计划 `ProductionRun.generationPlan.shots`（`electron/productionRun/productionRunTypes.ts#ProductionGenerationPlan`），一次请求一份方案由 `electron/capabilityCore/generationDocumentPlan.ts#createDocumentPlanAuthoring` 保证（概念 `storyboard.plan-per-request`）。「**说好**」的基线 = 本 Run 第一次被放行的 `Approval.jobIds`（`productionRunTypes.ts#Approval`，同一个 Run 上的批准记录），刹车 2 由这条派生，**不另存第二份计划** | 无「计划外」判据；同一 Run 靠 `planHash` 绑定（`approvalPolicy.ts#authorizeSubmission` 的 `plan-changed` / `job-not-approved`）；请求外的镜头根本进不了这个 Run（admission 找不到） | 新增只读派生 `plannedJobIdsFromApprovals(run)`（`electron/shared/agentCapabilities/directGenerationBrakes.ts`）；允许的消费者只有派发闸一处 | `electron/productionRun/directGenerationDispatchGuard.ts`（新增，挂在既有 `productionShotDispatchGuard` 旁） |
| 「同一镜头」 | `electron/shared/productionShotJobs.ts#jobsForShot / currentShotAttempt`（概念 `production.shot-jobs`）；镜头归属判据 `electron/shared/decideShotClaim.ts` | 同 | 连续失败数 `consecutiveFailedAttempts(run, shotId)` 只读 `jobsForShot` + `productionJobPhase`，不自己数 | 同上 |
| 刹车判定 | 新增 `directGenerationBrakes.ts#directGenerationBrake`（纯函数：档位 + 计划 + 停止态 + 连续失败数 → 放 / 停 + 原因） | 不存在 | 新概念，登记 `docs/engineering/concept-owners/agent.direct-generation-brakes.json`（第二轮同提交） | 只有 `directGenerationDispatchGuard` |
| 停止 | 既有：`electron/productionRun/productionRunControl.ts#applyRunControl`（暂停 / 急停）+ `decideShotClaim` 的 `run_stopped` | 同 | 不新增停止通道；刹车 `stopped` 输入由派发闸读 Run 状态 | 同上 |
| 切档确认 | `src/workbench/ai/v4/useAgentPanelAutoMode.ts` | 切到 `project` 时问 | 判定抽成纯函数 `tierSwitchNeedsConfirm(from, to)`（`agentPanelV4Logic.ts`）；文案改 | 面板 |

同一份事实存几份：挡位 1 份（盘上文件，渲染层 `projectAgentApprovalPolicy` 是投影）、计划 1 份（Run）、失败数 0 份（每次从 jobs 派生）。没有靠「东西不见了 / 状态变了」去猜用户意图：刹车触发后用户的「继续」是显式事件（见 §5）。

门表：`node scripts/door-map.mjs spendDecidedByPolicy`（第二轮开工时贴结果；本轮读码确认入口为 `generationDispatcher.ts:273`、`generationTransportAdapters.ts:407/557`、`tryModel.ts:158`、`laneApprovalGate.ts`）。

## 4. 九格

| 格 | 结论 | 证据 |
|---|---|---|
| ★1 用户怎么用 | 当我让 Agent 一口气做完一组镜头时，我想选「直接生成」，以便不用每个镜头点一次确认；想谨慎时留在「请求批准」。步骤：①点输入框权限入口 → ②看到两档各一行灰字 → ③选「直接生成」→ ④弹一次确认，说清会自动花钱 → ⑤让 Agent 生成 → ⑥一路跑，中途点停止可随时收手 → ⑦某镜连续失败 3 次或要生成计划外的镜头，停下问我 → ⑧点继续 / 放弃。**不做**：不设固定次数 / 张数上限；不显示价格 / 预算 / 额度；不让不可逆操作自动放行；不做「本会话不再问花钱」。已知坑：旧「全自动」用户升级后回到请求批准，需要自己重新选一次（用户拍板）。真实任务（第二轮走查）：①6 镜分镜「直接生成」跑完；②其中 1 镜让上游连续失败 3 次（测试供应商）看刹车；③跑到一半点停止再重启。主指标：直接生成档下每镜头平均需要用户点击次数 = 0；护栏：重复扣费 0、停止后新增提交 0；基线 / 目标 / 样本在第二轮真付费验收填 | 测试 `capabilityApprovalTwoTiers.test.ts`；走查脚本第二轮 |
| ★1b 连带界面 | ①权限弹层两档 + 各一行灰字（zh / en）；②切档确认卡（`autoModeConfirm*`）：标题改「切到『直接生成』？」，正文说清「生成会直接开跑并自动花钱，不再逐次确认；不可逆的操作仍然每次问；随时可以点停止」；③常驻提醒条 `V4AutoModeBanner`：`直接生成 · 不可逆仍会问 [回到请求批准] ×`；④刹车卡（介入槽 `approval-reversible` 之外新一种「已停下」提示，复用介入槽原子）：标题「这一镜连续失败了 3 次，先停下」/「这次要生成的不在刚才说好的计划里，先停下」，按钮「继续」「放弃」（文案键 `brakeRetry` / `brakeOutOfPlan`）；⑤Agent 回执 / 任务列表对停下的镜写「已停下，等你决定」，不写「失败」；⑥设置里没有这个档位的第二处入口（已核：档位只在 composer 权限弹层）。以上全部不出现价格 / 预算 / 额度 | `agentPanelV4TwoTiers.test.ts`；截图第二轮 |
| ★2 谁说了算 | 见 §3，碰 6 个概念，5 个沿用既有 owner、1 个新登记（刹车判定） | `node scripts/door-map.mjs` |
| ★3 一致与复用 | 复用：`spendDecidedByPolicy`、`approvalReceipt` 的 `policy:full_auto` 收据路径、`productionShotDispatchGuard`、`useAgentPanelAutoMode`、`V4AutoModeBanner`、介入槽。不复用的只有刹车判定，因为现有 `maxAttemptsPerJob`（每个 job 的批准次数上限）是**批准记录里的上限**，语义是「这份批准最多能提交几次」，用户拍板明说「不设固定次数」，所以不能拿它当刹车；两者并存但职责分开，刹车是纯函数 + 一个派发闸，不是第二套调度。无第二份定义 | `check:self-written`；`git grep` 第二轮 |
| ★4 全状态 | 空：没有生成任务时挡位只是设置，无额外状态。加载 / 成功：与现状一致。失败：同一镜失败 1、2 次 → 直接重试，面板显示该镜「重试中（第 n 次）」；第 3 次失败 → 刹车 1。部分成功：计划内成功的镜保留，停下的镜标「已停下」。**取消中**：点停止后该镜已交出去的保持「生成中·不再续派」，未派的标「已停止」。过期：同意（`productionDispatchConsent`）过期仍走现有「需要处理」，不因直接生成而放宽。能力不可用：没有可用生成模型时「直接生成」档不改变现状（走现有「去接入模型」路径，不新增状态）。文案走 i18n zh / en；不写免费 / 不计费 / 没扣费 | `check:i18n`；`agentPanelV4TwoTiers.test.ts` |
| 5 中途表 | 见 §5 | `directGenerationStop.e2e.test.ts` + 第二轮真付费 |
| 6 外部数据与失败 | 外部来源：供应商提交 / 查询 / 取回；用户盘上 `agent-approval-policy.json`。偏差：盘上文件被手改或写坏 → `readConfigFileOrDefault` 改名留底并按默认「请求批准」（更常问，不会更少问）；认不出的 `mode` 一律落 `request`；旧 `schemaVersion 1` 一律落 `request`。供应商失败文案沿用 `production.shot-action-failure` 一条路，不新造；未知失败不甩给用户的 key | `agentApprovalPolicyTwoTiers.test.ts` |
| ★7 性能 | ①新增操作：打开权限弹层、切档、切档确认、刹车卡出现（点停止 / 继续）；②最坏规模：1000 镜头一个 Run、200 节点画布；③预算：弹层与切档反馈 ≤100ms（p95 ≤150ms）；刹车判定每次派发 O(该镜 job 数)，不扫全 Run（`jobsForShot` 已按镜过滤），1000 镜下单次 <1ms；打开到可操作不变；④场景：不新增画布节点渲染路径；复用 `perf:scenarios` 现有 agent 面板打开场景（第二轮执行并交 `perf-scenario：<id> 中位数 X / p95 Y / 预算 Z`），刹车判定写一个纯函数微基准加入 `tests/perf/scenarios/`（第二轮）。本轮：未验证（无实现） | 第二轮 |
| 8 真实条件 | Windows / 英文界面 / 最小窗口 / 真付费 / 键盘全程：本轮全部 `unverified`（无实现）；第二轮真付费走协调会话（花钱路径合并前真 App 验收，最小量） | 第二轮 |
| ★9 验收与回滚 | 验收：另一条线（≠ L19）用本卡 §6 测试表逐条核，红灯命令原样 `pnpm vitest run <四个文件>`；第二轮加 zh 亮 / en 暗两档截图自己 Read、真付费最小量验证（直接生成档 2 镜，其中停止一次）、硬门 ⑩⑪⑫ 逐项对账。回滚：revert 实现提交即回三档；盘上 `schemaVersion 2` 文件被旧版读到时 `normalize` 对未知 `mode` 落旧默认「自动改」，不会越权。独立验收报告链接：第二轮填 | `## 独立验收` |

## 5. 中途表（格 5）：「直接生成」档，生成进行中

事实基础（读码确认）：派发闸 `productionShotDispatchGuard` 在提交 outbox 第一笔耐久写（预留 / 提交意向）**之前**按盘上最新 Run 再判一次；停止后 `decideShotClaim` 返回 `run_stopped` 拒绝；同一镜的 jobId 由 `runId + contractHash + attempt + shotId` 派生，重复交同一镜只会命中同一个 job（幂等键同一个）；收据一次性消费。刹车在这条派发闸上叠加，不新增通道。

| 状态 × 打断 | 点停止 | 关窗 | 断网 | 重启 | 连点（重复提交 / 重复点继续） |
|---|---|---|---|---|---|
| 已交出、供应商生成中 | 看到：该镜保持「生成中」，后续镜标「已停止」；花费：该镜**照常扣一次**（已受理，撤不回；若供应商支持撤单则走既有撤单 / 核对，不在本卡新增）；回执：任务列表该镜「生成中·不再续派」 | 主进程继续跑已交出的，未交出的按 Run 当前态继续派发直到调度器停；**关窗不是停止**，不会因此多花或少花 | 已交出的镜靠轮询恢复，不重发；未交出的镜提交失败 → 记为失败 attempt，计入刹车 1 | 新调度器从 Run 的 `jobs[]` 重新派生，已有 job 的镜不重发（`needsDispatch` 为假）；不扣第二次 | 同一镜并发交两次 → 同 jobId，供应商只收一次（测试：连点 / 重启） |
| 排队、尚未交出 | 派发闸 `run_stopped`：一个字节不发，没有预留、没有提交意向，**不扣费** | 同上（继续按 Run 态派） | 提交前断网 → 失败 attempt（未到供应商，`provider_not_reached`，不扣费，也**不计入**刹车 1 的失败数——只有可能到过供应商的失败才计？见 §9 Q2） | 重启后继续派发剩余镜，已停的不派 | 连点停止：幂等，二次无副作用 |
| 刹车 1 已触发（某镜连续失败 3 次） | 点停止 = 整轮停；该镜不再重试 | 弹出的刹车卡在重开面板时从 Run 状态重建（卡不是独立状态，是 Run 上「该镜已停下·连续失败」的投影），不丢 | 同上 | 同关窗：重启后卡仍在，需用户点「继续」才再派 | 连点「继续」：第一次放行 1 次重试，该镜 attempt+1，计数从 0 重新开始；第二次点击见 job 已存在 → 无副作用 |
| 刹车 2 已触发（计划外的镜） | 点停止 = 整轮停 | 同上，卡重建 | 无外部调用 | 同上 | 连点「继续」：只放行这一镜一次；计划基线（首次批准的 jobIds）不变，所以下一个计划外镜仍会再停 |

刹车触发时界面显示：介入槽出现一张「已停下」卡，主文案说明原因（连续失败 3 次 / 超出刚才说好的计划），主按钮「继续」、次按钮「放弃」（× 规则：否定动作用 ×）。继续的含义：刹车 1 = 对这一镜再放行一次尝试；刹车 2 = 把这一镜加入计划并放行（等于用户当次批准了计划外的这一镜，走正常收据路径，`decidedBy` 记人为手势，不记策略）。放弃 = 这一镜标「已放弃」，其余计划内的镜继续跑。**不会因为用户没点而自动继续**。

## 6. 测试对照表（必红，一个提交，只有测试）

运行：`pnpm vitest run electron/shared/agentCapabilities/capabilityApprovalTwoTiers.test.ts electron/settings/agentApprovalPolicyTwoTiers.test.ts src/workbench/ai/v4/agentPanelV4TwoTiers.test.ts electron/productionRun/directGenerationStop.e2e.test.ts`

| 测试 | 对应格 | 现在红的原因 |
|---|---|---|
| 词表只有 request / direct；默认 request（`capabilityApprovalTwoTiers`） | ★2 / ★4 | 整个文件红：导入的 `directGenerationBrakes` 模块不存在（实现后还需 `PROJECT_AGENT_APPROVAL_MODES` 改词） |
| 放行矩阵 可撤销 / 花钱 / 不可逆 × 两档；未登记别名与 destructiveHint 两档都问；`spendDecidedByPolicy` 只有 direct 为真；模型面硬闸不变 | ★1 / ★2 | 同上（`capabilityApprovalDecision` 未实现；旧词表无 request / direct） |
| 刹车 1：连续失败 0/1/2 放行，3 → `retry-limit`；按镜头独立；请求批准档不触发；从 jobs 数连续失败、中间成功清零 | 格 5 / ★4 | 同上（`directGenerationBrake` / `consecutiveFailedAttempts` 未实现） |
| 刹车 2：计划内 6 镜放行，第 7 个 → `out-of-plan`；计划内重试不算计划外；计划基线取自 `approvals[].jobIds` 不另存 | 格 5 / ★4 / §3 | 同上（`plannedJobIdsFromApprovals` 未实现） |
| 停止 → `stopped`，优先于其它判断，两档都生效 | 格 5 | 同上 |
| 迁移：旧 step / safe-auto / project / within-budget → request；裸形状同；direct 保留；未知与缺省 → request；schemaVersion → 2（`agentApprovalPolicyTwoTiers`） | 格 6 / ★9 | 旧 `normalize` 保留 `project`，且版本号恒 1；`request` 词表未知 |
| 面板：`PERMISSION_TIERS`=[request, direct]、默认 request；合同映射（`agentPanelV4TwoTiers`） | ★1 | 旧三档 |
| 切档确认：request→direct 弹，direct→request / 同档不弹 | ★1b | `tierSwitchNeedsConfirm` 不存在 |
| 文案：zh 灰字与拍板原文逐字一致；en 只有两档；确认文案含「花钱」；全部文案无价格 / 预算 / 额度字样；刹车卡文案 zh + en 存在 | ★1b / ★4 | 旧三档文案；`brakeRetry` / `brakeOutOfPlan` 键不存在 |
| 真实边界·停止：已交出的镜不重发、未开始的镜一个字节不发、无预留（`directGenerationStop.e2e`） | 格 5 | `directGenerationDispatchGuard` 不存在（夹具已验证：用一个只委托既有派发闸的临时桩跑过，三条断言本身成立） |
| 真实边界·连点：同一镜并发交两次供应商只收一次 | 格 5 | 同上 |
| 真实边界·重启：新仓库实例 + 新提交出口再交已交出的镜，不重发 | 格 5 | 同上 |

未覆盖、第二轮补：刹车 2 的真实边界用例（在同一 Run 上经「补镜头」路径追加第 7 镜并被策略代批时被派发闸拒）。本轮读码发现：计划外的镜头今天**进不了**一个已封的 Run（admission 找不到，`landedAdmission` 抛 `did not land`），真正能超计划的只有「带 operationId 的新镜头补到同一份方案」（`storyboard.plan-per-request`）加上「全自动代答整份草稿」这条路，所以刹车 2 应该落在**策略代批的那一刻**（拿首次批准的 `jobIds` 对比这次要批的 job），而不是只在派发闸；第二轮开工时先用 door-map 确认补镜头路径的全部入口再接线（§9 Q3）。

## 7. 设计记录改动（本提交一并做）

- `docs/design/2026-10-08-approved-designs.md` 加 §⑦「10-12 用户：挡位改两档」。
- `docs/design/2026-09-10-spend-card-node-params-and-full-auto.md` 里 09-10 / 09-09「钱的闸 = 每次提交看报价确认」「花钱永远逐次问」三处旁各标注：「被 09-12 改为全自动档代答；被 10-12 改为两档，见 approved-designs §⑦」。不删原文。

## 8. 删什么（P1 加新必删旧，第二轮同提交）

- 删：`step` 档及全部词典（`permission.step`、`permissionWhy.step`）、`PROJECT_AGENT_SPEND_POLICIES` / `within-budget` / `spend` 轴、`approvalPolicyRank` 的三档分级（改两档）、`agentPanelV4Types.ts` 里过期的「三档 spend 恒 confirm」注释、`tests/ux/agent-spend-full-auto.walk.mjs` 与旧三档单测里的旧词（改写，不削弱）。
- 不留：旧词 → 新词的运行时别名；迁移只在 `normalize` 一处，读到旧值落 `request` 并以 v2 写回。
- 选「换」而不是「补」：在三档上加第四档或给「全自动」加刹车都会保留「每步问」这根没人要的档，并保留 `spend` 这根没有读者的轴（用户的原话就是「相当于没有挡位」）。

## 9. 需要协调拍板（各带推荐项）

1. **刹车 1 的计数口径**。A（推荐）：最近连续失败 attempt >= 3 时，第 3 次重试前停（失败 1、2 次后各自动重试一次）；B：失败 >= 2 次就停（「超过 2 次」读成「第 3 次失败起算」之外的更严读法）。A 和任务书「第 3 次失败重试前停」一致；B 会让用户永远只看到一次自动重试。
2. **哪种失败计入**。A（推荐）：只计「可能已到过供应商」的失败（`jobMayHaveReachedProvider` 为真），提交前断网（`provider_not_reached` / `provider_rejected`）不计——它们没烧钱，计入会让断网把无辜的镜头停下；B：全部失败都计，更简单但会被断网误触发。代价：A 要多读一个既有判据（已有 owner，不新增）。
3. **刹车 2 的拦截点**。A（推荐）：落在「策略代批」那一刻（`generationDispatcher` 铸 `policy_decision` 收据之前，拿首次批准 `jobIds` 对比），再在派发闸做兜底；B：只放派发闸。B 更小，但此时策略收据已经铸好、钱的预留已冻结，拦在后面多一步回滚；A 要碰 `generationDispatcher.ts` / `generationTransportAdapters.ts` 两处入口。
4. **旧「全自动」用户升级后降到「请求批准」要不要告知**。推荐：不弹窗，只在权限弹层里「直接生成」下的灰字保持可见（用户拍板「全部落在请求批准」，没有要求告知；多一个弹窗违背「少打扰」）。代价：习惯全自动的人第一次生成时会多点一次确认，才发现档位变了。
5. **刹车 2「继续」的含义**。推荐：把该镜追加进计划并当次放行（记人为手势收据）。备选：只放行这一次、不改基线（下一个计划外镜还会再停，等于每个计划外镜都要点一次）。前者更省事，后者更严；用户原话「超出说好的计划时停」没有说继续后基线是否更新。
