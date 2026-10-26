# 付费卡只摆这一次还没定的镜头（不点名的范围）· 设计卡

日期：2026-10-27。线：I-shot-scope-undecided（实现）。基线：`origin/main` @ `6c05eebae`。
类别：花钱（9 格全填，含 ★0）。来源：0.24 发版阻断项里的花钱错；协调调研「付费阻断项」第 2 节的门表与修法。
**状态：设计卡 + 方向检查已写，实现未开工。** 停在任务书停点：要改的 `electron/capabilityCore/mcpGenerationTools.ts` 本身是热点（14 天内第 3 个 fix），而且门表比调研多出入口（★2）。§四 的决定确认后再开实现提交。
方向检查（类根因复盘，结构性结论交用户）：[`2026-10-27-shot-scope-undecided-direction-check.md`](2026-10-27-shot-scope-undecided-direction-check.md)。

## 开工三问

1. **近 14 天修过几次**（`node scripts/fix-churn.mjs <要改的 9 个文件>`，exit 1）：`mcpGenerationTools.ts` **文件本身**已有 2 个 fix（`54c444e53` null 参数被整次拒、`af998f85d` 自建中转线上名，都不是范围问题），这一刀是第 3 个；另有目录 / 概念口径命中：`electron/productionRun/`（15 个）、`src/workbench/capability/`（10 个）、`electron/shared/agentCapabilities/verbs/`（10 个）、概念「参数准入」（6 个）。文件本身命中 → 按任务书停在设计卡。
2. **是不是我们独有的领域**：是。按镜头的花钱语义在 `docs/engineering/self-written.json` 的领域目录里；「这一次出价还没定哪几镜」是我们出价账（`generationPlan.presentations`）上的事实，没有可接的库。通用部分（点名数组的校验）十来行纯函数，不引库。
3. **补还是换**：换。「没给 `shotIds` 就全量」换成「只取当前出价还没定的」，同一个提交删掉旧默认的全部四份写法（§一），不留开关、不留回退。

## 一、现场：症状 → 直接原因 → 类根因

**复现**（临时 e2e，跑在现有 `agentPanelSpendConfirmTestUtils.spendWorld` 上，跑完即删、不进仓库；exit 1 = 4/4 红，是预期的红）：

| # | 形状 | 按任务书规则应得 | 现状 |
|---|---|---|---|
| R-a | 三镜草稿，第一次点名只摆 `shot-1`，卡开着；Agent 不点名再 `generate` | 卡上只有 `shot-1` | 卡和回执 `shots` 都是 `shot-1/2/3` |
| R-b | 三镜不点名摆卡；用户在卡上点 `shot-1` 生成（交给画布，在生成），再点取消（卡关，`closedBy: user_closed`，没定 `shot-2/3`；回执告诉 Agent「他要的话对同一份草稿再调 generate」）；Agent 照做、不点名 | 卡上只有 `shot-2/3` | 卡上 `shot-1/2/3`：**正在生成的 `shot-1` 又被摆回卡上**。「直接生成」档会替用户再决一次 → 同一镜花两次钱 |
| R-c | MCP gate，不点名，卡开着但一镜都不剩待定 | 不封，明确拒绝 | 封 `shot-1/2/3`（回退「没封过的全部」） |
| R-d | MCP gate，不点名，最近一次出价已关、还没定的只有 `shot-2` | 只封 `shot-2` | 封 `shot-1/2/3` |

**直接原因**：同一个写法「没给就全量」写了四份，再加一处把「没点名」翻译成「点名全部」：

1. `electron/shared/agentCapabilities/generationShotScope.ts:3`：`requested === undefined` → 返回全部。
2. `electron/capabilityCore/mcpGenerationTools.ts:558`：handler 在交给 store **之前**就用它把「没点名」变成「点名全部」。持久 store 自己那套不点名规则（`presentationScope`）根本没机会跑——R-a、R-b 都死在这一行。
3. `electron/capabilityCore/mcpGenerationMultiShot.ts:692-695`（`resolveGateScope`）：只认开着的卡（`closedBy === "open"`），卡上没剩、或卡已关，就回退 `open` 全集（R-c、R-d）。
4. `electron/productionRun/productionGenerationSeal.ts:131-135`（`sealScopeOf`）：reducer 里同一个回退（`onCard.length > 0 ? onCard : open`）。今天多镜封印都带着 scope 进来，这是一扇休眠的门：下一个不带 scope 的调用者就会封全部。
5. `electron/productionRun/productionGenerationPresentationEdits.ts:69-71`（`presentationScope`）：不点名时「没送过的」为空，就回退成 `standing` 全部（「整份再来一轮」）。

**类根因**：范围的主人只认「计划里有哪些镜」，「这一次出价还没定哪几镜」不是它的输入。于是「没点名」在第一扇门就被翻译成「点名全部」，后面每一层都分不清「用户点名了」和「谁都没点名」；每扇门各补一份缺省，最省事的缺省永远是「全部」。「直接生成」档按「这一次出价摆的镜」替用户决定（`electron/shared/agentCapabilities/directGenerationBrakes.ts:184`），越界的范围在这一档就是真花钱。
上一次同类修复（`docs/fixes/2026-09-19-generation-scope-and-dismissal.root-cause.json`，「三镜请求摆出 33 镜」）只把**点名**的范围收进了共享边界做原子校验，**不点名**的默认没收进同一个主人——这一次补的是这一半。

## 二、设计卡（花钱：9 格全填）

```
改动名：付费卡只摆这一次还没定的镜头   线：I-shot-scope-undecided   类别：[花钱][其他：模型可见说明 / 拒绝文案]
```

| 格 | 结论 | 证据 |
|---|---|---|
| ★0 先查别人 | 8 条，见下面「先查别人（★0）」一节；改了的决定：D1（当前出价读最近一次，开着或已关）、D2（卡上没剩就拒绝、不回退全集）、D6（拒绝改成模型可读、带下一步）、D7（说明写明省略的含义）；确认了的：点名路径不放宽也不收窄、去掉过的镜不自动复活 | 下节链接与 `文件:行` |
| ★1 用户怎么用 | 「当 Agent 已经给我出过一张卡、我只说了下一句（『剩下没点的也来』『第二张改夜景再生成』），我想新卡上只出现这一次还要我决定的镜，以便已经在生成的、我去掉的、我没提过的镜不会混进来再花一次钱。」步骤：① Agent 起草 N 镜；② 第一次 `generate` 不点名 = 草稿里勾着、没送过、没去掉过的全部；③ 我在卡上逐镜点「生成」/「不生成 ×」，或者不动；④ 我打字或点取消，卡关，没定的留在账上；⑤ Agent 不点名再 `generate` = 只摆最近一张卡上还没定的，要别的镜必须点名；⑥ 卡上没剩没定的、Agent 又不点名 → 拒绝，并告诉它可以点哪些镜。**不做什么**：不改花钱判据（`spendConfirmationRequirement`）、不改界面 / IPC / 落盘字段、不改涨价 / 报价 / 授权上限、不改拆解取消；点名照旧（重试、点名计划里任何一镜都行）。**已知坑**：点名重摆一镜「正在交给画布」的镜时，负债检查 `hasUnsettledLiability`（`electron/productionRun/productionGenerationPlanEdits.ts:144`）看不到画布那一侧的交接，见残余风险，本卡不改。**真实任务**（真模型 + 真供应商才算真跑；本线不花钱，全部记 unverified 交协调）：T1 三镜分镜，「先生成第一张看看」→ 看完说「剩下的也生成」；T2 卡上点了第 1 镜生成，又打字「第二张改成夜景」（卡被打字关掉）→ Agent 改完再 `generate`；T3「直接生成」档第一轮生成到一半被停，Agent 再 `generate`。**指标**（目标 → 信号 → 指标 · 量具）：主：不点名的再出价不越界 → 卡上的镜 ⊆ 最近一次出价还没定的镜 → 越界次数 / 不点名再出价次数，基线 4/4（R-a…R-d），目标 0 · 量具：★9 的 vitest 类测试（确定性）；线上占比：未验证：缺量具（没有「出价范围」遥测事件）。质量：Agent 被拒后一步改对 → 拒绝后下一次 `generate` 点名且被收下 → 一步改对率 · 量具：未验证：工具未建（R13.1 工具写对率 / 回合成功率，`tests/agent-tools` 未建；真模型评测要额度，交协调；评测句子种子见 ★9-E）。护栏：同一镜一次出价只花一次 → 一次出价里同一镜的交接 / 授权数 ≤ 1 → 双扣数 = 0 · 量具：`electron/productionRun/doubleChargeMap.e2e.test.ts` + ★9 A2 / A12；真付费：未验证（`spend-paid-sample` 交协调） | 复现见 §一；人工 |
| ★1b 连带界面 | **Agent 回执**：`generate` 回包的 `shots` 改成「这一次出价摆的镜」（今天读 `included`，`mcpGenerationTools.ts:560-563`：R-a 里回执说三镜、卡上应是一镜）；`electron/shared/agentLane/generateOutcomeReceipt.ts:54`「call generate on this same draft if he wants them later」保留，新规则正好兑现这句话。**模型可见说明**（英文工具面）：`electron/shared/agentCapabilities/verbs/verbProjections.ts:252` 的 `shotIds`「Only these shots of the draft; omit for all.」改成写明省略的含义（草稿：`Shots to put on the card. Omit to re-offer what is still undecided on the latest card (first card: every included shot not yet generated); name shots for anything else, including retries.`，实现时按工具面长度预算定稿）；`electron/shared/agentCapabilities/verbs/writeVerbs.ts:288`（`"run all six"`）与 `:290` 同步；`electron/shared/agentCapabilities/generationPlanSchemas.ts:186` 注释「缺省全部」同步；`scripts/model-face-baseline.json` 随之更新。**新拒绝文案**（给模型，英文，带下一步）：① 最近一张卡上没剩没定的：说清每一镜现在的状态（在生成 / 去掉了），「要再试就在 shotIds 里点名」并给出可点名的 id；② 点名无效（空数组 / 空项 / 重复 / 不存在）：说清哪一镜、可以点哪些。今天这几条落进兜底码 `generation_execution_failed`（`electron/capabilityCore/generationTransportAdapters.ts:133-153` 的放行表里没有 `generation_scope_invalid`），模型读到的是「可能已提交」——不给路还误导。**用户界面**：不改；卡上少出现的镜就是规则本身；画布小标、任务列表、通知读的都是 `offerShots`，不变；zh / en 界面文案无新增。**外部 MCP**：`presentationOutcome` 不变；`nomi_operation_gate` 本来就不收 `shotIds`（`electron/capabilityCore/mcpGenerationToolCatalog.ts:99-124`），外部宿主只走不点名 → 卡上没剩没定的时被拒（今天封全部） | 回执 / 拒绝文案测试（★9 A1、A5）；`check:model-schema` 基线 diff |
| ★2 谁说了算 | **概念**：摆哪几镜 = `production.spend-card-presentation`（owner `presentGenerationPlan`）；封哪几镜 = `applyGenerationSeal`；事实（这一次出价、每镜状态、送没送过）的唯一读口 `electron/shared/productionGenerationPresentation.ts`（`currentPresentation` / `generationPresentationOutcome` / `shotEverSent` / `standingShotIds`）。不新开概念，范围规则记进该概念 notes。**唯一范围规则**：`resolveUndecidedGenerationShotScope`（`generationShotScope.ts`，纯函数，§三），旧 `resolveGenerationShotScope` 同提交删除。**谁来算不点名的范围**：持有事实的那一层——持久出价 = reducer `presentationScope`；封印 = MCP `resolveGateScope`（读 operation 视图里同一个函数算的 `presentationOutcome`），reducer `sealScopeOf` 只验点名；渲染层文稿方案（没有出价账）显式传「没有当前出价」；handler 原样转交 `params.shotIds`，不再预解析。**门表**（`node scripts/door-map.mjs`，exit 0）：`resolveGenerationShotScope` 读 5 扇——`generationTransportAdapters.ts:557`、`mcpGenerationOperationMemoryStore.ts:66`、`mcpGenerationTools.ts:558`、`productionGenerationPresentationEdits.ts:68`、`storyboardPresent.ts:50`；`resolveGateScope` 1 扇——`mcpGenerationTools.ts:631/635`。**调研没列的**：`sealScopeOf` 写 1 扇（`productionGenerationSeal.ts:174`，不点名回退 `:131-135`）；present 回执 `shots`（`mcpGenerationTools.ts:560-563`）；模型可见说明（`verbProjections.ts:252`、`writeVerbs.ts:288/290`）；范围拒绝到模型的码（`generationTransportAdapters.ts:133-153`）；两条现有 e2e 把旧默认写成了预期（`electron/capabilityCore/agentPanelSpendCardStop.e2e.test.ts:119`、`:133`）。**只读消费者（不改）**：`directGenerationBrakes.ts:184`（直接生成档决定的就是这一次出价的镜）、`electron/agentLane/laneExtendedDesktopPorts.ts:256-264`（不点名时按全集查导演台预览，更保守，见残余风险）。**同一份事实几份**：出价账 1 份；但「这一镜还能封吗」今天有两份定义（MCP 视图 `!shot.contract`，`mcpGenerationMultiShot.ts:691`；reducer「这一次出价里没批过」，`productionGenerationSeal.ts:128-130`）——本卡不合并（不改封印判据），记后续。**靠「东西不见了」猜意图**：没有；范围只读出价账上的显式事件（点生成 / 不生成 / 取消 / 打字关卡 / 重启收回） | door-map 输出（报告里）；`node scripts/check-concept-owners.mjs` |
| ★3 一致与复用 | **复用**：出价账读口（`generationPresentationOutcome` / `shotEverSent` / `standingShotIds`）；点名校验沿用旧函数语义（原子、重复即拒、按计划顺序返回，09-19 合同的不变量）；有在等的授权：复用信封 jobs / 点名别的先撤再封，沿用 `resolveGateScope` 现有分支与 `abandonWaitingAuthorization`。**删**：`resolveGenerationShotScope`；`presentationScope` 的「没送过的为空 → 全部再来一轮」；`resolveGateScope` 的 `onCard → open` 回退与 `requestedShotIds` 的静默去重（点名规则只留一份）；`sealScopeOf` 的不点名分支（D4）。**第二份定义**：内存 store 的 present（只有测试在用）见 D5。不新增通用能力 | `git grep -n resolveGenerationShotScope`；`pnpm run check:self-written` |
| ★4 全状态 | **空**（没东西可摆：全被去掉 / 都送过且从没出过价）：模型收到「没有可摆的镜，要重试就点名」，界面无卡。**加载**：不适用（纯函数，出价写入走现有命令）。**成功**：卡上只有规则给出的镜，回执 `shots` 与卡一致。**失败**：点名无效 / 卡上没剩没定的 → 模型可读拒绝，什么都不写（Run 版本不涨）。**部分成功**：不适用，范围原子，要么整份收下、要么整份拒。**取消中**：上一张卡正在取消、排队的交接在收回时 Agent 不点名再出价：命令串行，读落盘那一刻的出价账；还在「交」的镜不算没定 → 不会被重摆。**过期**：上一张卡因重启被收回（`withdrawStalePresentations`）→ 它仍是「最近一次出价」，没定的就是它的 `undecided`。**能力不可用**：不适用——范围判断不依赖模型或外部资源；供应商不可用时出价照摆，点生成时由现有链路报（不改）。**文案**：只改模型可见英文；界面无新增文案，不写钱话 | ★9 A1–A13；`check:i18n` 不涉及 |
| 5 中途表 | 见下面「中途表」一节（4 个状态 × 5 种打断，每格「看到什么 · 花费 · 回执在哪」） | ★9 A2、A12；现有 `agentPanelSpendCardStop.e2e.test.ts` 的重启 / 被顶掉 / 交到一半 |
| 6 外部数据与失败 | **模型写的 `shotIds`**（Agent `generate`）：规范 = `generationPlanSchemas.ts:187`（≤40 个、非空字符串）；偏差：模型常省略或复读上一轮的 id → 省略按 §三；点名无效 → 模型可读拒绝。**外部 MCP 宿主**：`nomi_operation_gate` 不收 `shotIds`（`mcpGenerationToolCatalog.ts:99-124`），外部宿主建的 operation 没有出价（只有 in-app present 会开出价，`productionGenerationPresentationEdits.ts:107`）→ 走「没有当前出价」，形状与今天一致。**旧 Run**（只存 `shots`、没有 `presentations`）：读盘归一 `normalizeLegacyPresentation`（`electron/productionRun/productionRunRepository.ts:176`）是唯一一处把旧 `cardHidden` 折成出价记录的地方；归一后有出价就按它，没有就是「没有当前出价」；不新增归一、不猜用户定没定。**旧 MCP 草稿**：`normalizeStoredDraft`（`mcpGenerationTools.ts:538`）只清参数残留，不涉及范围，不改。**渲染层文稿方案**（`storyboardPresent.ts`，没有出价账）：显式「没有当前出价」→ 这一轮的锚卡与镜头全集，再按现有规则只跑可跑的行，用户在确认框里逐行勾（现有）。**失败时用户看到什么**：界面无新失败；Agent 收到可读拒绝；不甩锅给 key | 各 `文件:行`；★9 A6–A8、A10 |
| ★7 性能 | 不适用：bug 修复，没有新增用户操作；范围计算是 O(镜数) 纯函数（单次出价 ≤40 镜），不在任何交互热路径上；扫描器若按 `production*` 路径推出「新增功能 / 性能」，PR 正文写同一句不适用理由 | `generationPlanSchemas.ts:187` |
| 8 真实条件 | Windows：unverified（本线 Mac）；英文界面：不涉及界面（模型可见文案本来就是英文）；最小窗口：不涉及；真规模：40 镜上限的类测试（vitest）；干净安装：不涉及；真付费：unverified（`spend-paid-sample` 交协调：免费演练先过、产物标记字面量 `shot-scope-undecided`、专用工作树）；键盘全程：不涉及 | 人工 |
| 拍板图清单 | 不适用：不改界面——卡的元素、状态、文案都不变，只是卡上摆的镜按规则不再越界（纯 bug 修复，例外 `pure-bugfix`） | — |
| ★9 验收与回滚 | 见 §五（验收清单与反例动手前写全）；回滚：revert 实现提交（单提交，无开关、无迁移、无落盘字段），设计卡提交独立；独立验收：待协调派验收线 | §五 |

### 功能分类

- [ ] 新界面 / 改交互
- [x] 花钱
- [x] 长跑 / 可打断
- [x] Agent 行为
- [ ] 大数据量 / 画布 / 长列表
- [ ] 生成效果
- [x] 数据格式
- [x] 新增功能 / 性能

（长跑 / 可打断、新增功能 / 性能、数据格式是扫描器按路径会推出的下限：`production*`、`*Stop*`、`*Schemas*`。证据计划：`spend-walks` 阻断子集零花钱走查；`spend-paid-sample` 交协调；`spend-fault-injection`：现有故障注入不受影响，跑 `agentPanelSpendCardStop.e2e.test.ts`；`run-e2e-chain`：`agentPanelSpendCardStop.e2e.test.ts` + `doubleChargeMap.e2e.test.ts`（重启收回、被顶掉、交到一半，不重复扣）；`perf-scenario`：不适用（★7）；`upgrade-path`：★9 A7 旧 Run 归一；`agent-intent-eval`：未验证：要额度，交协调。）

## 先查别人（★0）

- `docs/fixes/2026-09-19-generation-scope-and-dismissal.root-cause.json` · 同一类（「三镜请求摆出 33 镜」）：把**点名**范围放到共享 Run 变更边界原子校验、按计划顺序摆 · **确认了**：点名路径不放宽也不收窄（重试照常）；**改了**：不点名的默认也必须收进同一个主人——上次漏的正是这一半。
- `electron/capabilityCore/mcpGenerationMultiShot.ts:692` 与 `electron/productionRun/productionGenerationSeal.ts:133` · 仓库里已有「不点名 = 卡上没定的」读法，但只认开着的卡、空了就回退全集 · **确认了**规则方向（与任务书同一条）；**改了**：删掉回退，读最近一次出价（开着或已关）。
- `electron/shared/agentLane/generateOutcomeReceipt.ts:54` · 卡关掉时回执告诉模型没定的镜「要的话对同一份草稿再调 generate」 · **改了** D1：「当前出价」= 最近一次出价（开着或已关，与 `currentPresentation` 同一个定义）；只认开着的卡的话，这句话恰好把模型带进 R-b。
- https://kubernetes.io/docs/reference/kubectl/generated/kubectl_delete/ · `kubectl delete` 必须给名字、选择器或显式 `--all`，什么都不给不等于「全部」 · **确认了** D2：不点名、卡上又没剩没定的 → 拒绝并让模型点名，不回退全集。
- https://cli.github.com/manual/gh_run_rerun · `gh run rerun` 不加 `--failed` 时默认重跑全部 job（省略 = 最宽）——坏先例：放在花钱的上下文里就是 R-b 的形状 · **确认了**：不抄「省略 = 全部」。
- https://www.anthropic.com/engineering/writing-tools-for-agents（「Prompt-engineering your tool descriptions」「Optimizing tool responses for token efficiency」两节）· 说明里把隐含的默认写明；错误要说清哪里错并给出照着就能改对的写法；评测用真实多轮任务，看工具错误率 · **改了** ★1b：`shotIds` 说明写明省略的含义；范围拒绝改走模型可读拒绝并列出可点名的镜（D6、D7）。
- `docs/lessons/refusal-text-must-also-tell-the-agent-a-path.md` · 给模型的错误必须带它自己走得通的下一步 · **确认了**拒绝文案格式（带可点名的镜 id）。
- `docs/plan/2026-09-30-paid-card-per-shot.md:120`（Q9）· 去掉的 / 被静默移出的镜不自动复活 · **确认了**：「没有当前出价」分支排除去掉过的镜（`standingShotIds`）。

## 中途表

| 状态 \ 打断 | 停 | 关窗 | 断网 | 重启 | 连点（Agent 连发两次 `generate`） |
|---|---|---|---|---|---|
| 出价开着、有没定的镜 | 卡关（stopped），没定的留账 · 不扣 · 回执列「没定的 + 原因」 | 卡随项目会话收起，账在盘上 · 不扣 · 重开后回执读同一份账 | 出价是本地命令，照摆 · 不扣 · 点生成时由派发链路报 | `withdrawStalePresentations` 收回卡 · 不扣 · 之后不点名再出价摆的就是这张卡上没定的 | 命令串行；第二次 = 对同一批没定的再出价、顶掉第一张，范围不变大 · 不扣 · 回执是第二张卡的结局 |
| 有镜正在交给画布（在交 / 交到了 / 结果未知） | 排队的交接收回（`withdrawn`，回到没定）· 已到供应商的照常扣 · 回执「在生成」 | 交接照常落定 · 已交的扣 · 画布小标 | 交的那一下可能 `unknown` · 可能已扣 · 卡上「结果未知」 | 孤儿回收收回没绑上的 · 不扣 · 不点名再出价不会摆在交的镜（今天会 → R-b） | 第二次不点名：在交的镜不算没定 → 不重摆（今天会重摆）· 不重复扣 · 卡上没剩没定的 → 拒绝，回执告诉 Agent 点名 |
| 最近一次出价已关（取消 / 打字 / 都定了） | 无卡可停 · 不扣 · — | 无变化 · 不扣 · — | 无变化 · 不扣 · — | 无变化 · 不扣 · 不点名再出价摆那张卡上没定的 | 两次不点名 = 两次同一范围，第二次顶掉第一次 · 不扣 · 第二张卡的结局 |
| 封印门在等（外部宿主 gate） | 门撤（现有）· 不扣 · gate 回执 | 门在等直到过期（现有）· 不扣 · gate 回执 | 同左 · 不扣 · 同左 | 同左 · 不扣 · 同左 | 再 request 不点名 → 复用在等那道门的信封镜（不变）· 不扣 · 同一道门 |

## 三、规则（实现合同）

```ts
/** 最近一次出价（开着或已关）上还没定的镜；或者调用方明说「没有当前出价」。不许传 undefined 混过去。 */
export type CurrentOfferFacts =
  | Readonly<{ kind: "offer"; undecided: readonly string[] }>
  | Readonly<{ kind: "no-current-offer" }>;

export function resolveUndecidedGenerationShotScope(input: Readonly<{
  planShotIds: readonly string[];   // 计划顺序；点名只能在这里面
  requested: unknown;               // 原样的 shotIds；undefined = 没点名
  currentOffer: CurrentOfferFacts;
  offerable: readonly string[];     // 这一扇门此刻能摆 / 能封的镜（计划顺序）
}>): string[];                      // 失败抛模型可读的范围拒绝（D6）
```

| 输入 | 结果 |
|---|---|
| 点名：非空数组、每项非空字符串、无重复、都在 `planShotIds` 里 | 按计划顺序返回点名的镜；不扩大、不收窄成「只许没定的」（封印门另验 ⊆ 可封） |
| 点名无效：不是数组 / 空数组 / 空项 / 重复 / 不存在 | 拒绝：哪一镜、可以点哪些 |
| 没点名 + 有当前出价，`undecided ∩ offerable` 非空 | 这几镜（计划顺序） |
| 没点名 + 有当前出价，交集为空 | 拒绝：最近一张卡上没有还在等他的镜，要再试就点名（附可点名 id） |
| 没点名 + 没有当前出价，`offerable` 非空 | `offerable`（本轮仍勾着、没送过 / 没封过、没去掉过的） |
| 没点名 + 没有当前出价，`offerable` 为空 | 拒绝：没有可摆的镜 |

| 门 | 当前出价从哪来 | offerable | 备注 |
|---|---|---|---|
| 持久出价 `presentationScope`（`productionGenerationPresentationEdits.ts:66`） | `currentPresentation(plan)` 有 → `generationPresentationOutcome(run).undecided`；没有 → 没有当前出价 | `standingShotIds(run)` 去掉 `shotEverSent` 的 | 负债检查保留：点名重摆送过的镜要等之前的每一笔落定 |
| handler present（`mcpGenerationTools.ts:558`） | 不算 | — | 原样转交 `params.shotIds`；回执 `shots` 读 store 返回的这一次出价 |
| 内存 store present（`mcpGenerationOperationMemoryStore.ts:66`） | D5 | D5 | 只有测试在用 |
| MCP gate `resolveGateScope`（`mcpGenerationMultiShot.ts:677`） | operation 视图 `presentationOutcome` 有 → 有当前出价；没有 → 没有当前出价 | `open`（勾着、没封过；今天的定义不动） | 有在等的授权：没点名或同一批 → 复用信封 jobs；点名别的 → 先撤再封（不变） |
| reducer `sealScopeOf`（`productionGenerationSeal.ts:122`） | 不算（D4） | 点名 ⊆ open | 多镜封印必须带 scope |
| 适配器（`generationTransportAdapters.ts:557`，有分镜选择时） | 不算 | — | 选择本身就是用户的点名：模型没点名 → 传选择；点名 → 必须 ⊆ 选择（新函数的点名分支） |
| 渲染层（`storyboardPresent.ts:50`，文稿方案） | 显式没有当前出价 | 锚卡 + 镜头全集 | 之后照旧只跑可跑的行，确认框逐行勾 |

## 四、要确认的决定（带推荐项与代价）

| # | 问题 | 推荐 | 代价 | 另一选项的代价 |
|---|---|---|---|---|
| D1 | 「当前出价」读哪一张 | 最近一次出价，开着或已关（`currentPresentation` 的定义） | 卡关了之后，草稿里后来新加、从没摆过的镜要点名 | 只认开着的卡：卡一关就回到「没送过的全部」，从没提过的镜被混进来（任务书要修的正是这个形状，R-d） |
| D2 | 不点名、最近一张卡上没剩没定的 | 拒绝，列出可点名的镜 | 「剩下的也生成」这类话 Agent 要多一步点名（拒绝直接给出 id，一步可走）；外部宿主（不能点名）在这种状态下拿不到封印 | 回退「没送过的全部」或「整份再来一轮」（今天）：后者就是 R-b 的双扣通道 |
| D3 | 两条现有 e2e 把「卡上两镜都在交时不点名再出价 = 整份再摆」写成了预期（`agentPanelSpendCardStop.e2e.test.ts:119`、`:133`） | 改成点名再出价，保留它们守的事（顶掉时排队的同意收回、在交的照样写回）；不点名那一种改成「拒绝」的类测试 | Agent 可见行为变化，PR 正文「用户能力变化」写明 | 保留原预期 = 保留旧默认，与 D2 冲突 |
| D4 | reducer `sealScopeOf` 的不点名分支 | 删：多镜封印必须带 scope，结构上封不出「全部」 | 测试夹具 `electron/productionRun/productionGenerationAuthorizationTestUtils.ts` 要显式带 scope（26 个测试文件经它，改一处） | 留着但改调同一个 helper：门还在，只统一规则 |
| D5 | 内存 store（只有测试在用）的 present | 删 present：它没有出价账，算不出「当前出价」，留着就是第二份默认；现有测试没有调它的 present | 任务书「内存 store 与持久 store 同输入、同范围、同顺序」那条测试改成「内存 store 拒绝 present，持久 store 是唯一实现」——请确认算满足 | 给它补一份最小出价记录 = 第二份出价账（第二份事实） |
| D6 | 范围拒绝到模型的码 | 走 `refuseToModel(GENERATION_ARGUMENT_REFUSAL, 文案)` | 无 | 把 `generation_scope_invalid` 加进放行表：裸码，说不出下一步；不改：落兜底 `generation_execution_failed`，in-app 说成「可能已提交」 |
| D7 | `shotIds` 说明改写（模型可见面） | 按 ★1b 草稿改，并同步 `writeVerbs.ts:288/290`、基线 | 模型可见工具改动按 `docs/engineering/model-facing-tool-checklist.md` 要真模型数字验收（工具写对率 + 回合成功率）→ 本线不花钱，记 unverified 交协调 | 不改：说明仍写「omit for all」，与行为相反 |

## 五、★9 验收清单与反例（动手前写全）

验收线（另一条线，不得是 I-shot-scope-undecided）只核这份清单；红灯用同一条命令复跑。

**A. 类测试（vitest，先红后绿）**

- A1 `electron/capabilityCore/mcpGenerationTools.test.ts`（持久 store，经 handler）：三镜，第一次点名 `shot-a`，卡开着；第二次不点名 → 卡与回执 `shots` 都只有 `shot-a`（R-a）。
- A2 同文件：第一次不点名摆三镜，`shot-a` 交给画布，取消关卡（没定 b / c）；不点名再出价 → 卡只有 b / c（R-b）；变体：卡上两镜都在交时不点名 → 拒绝，Run 不变。
- A3 gate：`open=[a,b]`、开着的卡 `undecided=[b]`，不点名 → `seal [b]`；卡已关、`undecided=[b]` → `seal [b]`（R-d）；卡上没剩没定的 → 拒绝、不封（R-c）。
- A4 gate：有在等的授权（信封 jobs = [b]）：不点名 → 复用 [b]；点名 [b] → 复用；点名 [a] → 先撤再封 [a]。
- A5 点名：重复 / 空数组 / 空字符串 / 不存在 → `generation_input_invalid`，文案点出那一镜并列出可点名的；Run 版本不涨。点名一镜已送过（重试）→ 收下，不收窄成只许没定的；负债检查照旧。
- A6 没有出价（新草稿）不点名 → 勾着、没送过、没去掉过的全部，计划顺序。
- A7 旧 Run：没有 `presentations`、没有 `cardHidden` 的草稿 → 读盘归一成开着的卡（勾着的镜）→ 不点名 = 这几镜；`cardHidden: true` → 走「没有当前出价」。读盘之外不另猜。
- A8 `electron/capabilityCore/generationTransportAdapters.test.ts`：分镜选择只给 `shot-a`，模型不点名 → present 参数 `shotIds = ["shot-a"]`，不出现 `shot-b`；点名选择外的 `shot-b` → 拒绝；点名未知 → 模型可读拒绝。
- A9 内存 store vs 持久 store（按 D5）：同输入同范围同顺序，或内存 store 拒绝 present。
- A10 `src/workbench/capability/storyboardPresent.test.ts`：上一轮问过 `shot-1`（被拒）后，这一轮点名 `shot-2` → 批量与确认框只含 `shot-2` 的节点；不点名 → 显式「没有当前出价」→ 这一轮可跑的全部（现有行为，测试钉住）。
- A11 画布批量（`batchPlanPreview.test.ts` / `appIntegrationCanvasShot.test.ts`）：只给确认框里勾着的节点开 Run，操作里另有没定的镜不增 Run。
- A12 直接生成档：R-b 形状下不点名再出价，策略只替这一次出价摆的镜决定，`shot-a` 不被决第二次（一次出价里同一镜交接数 ≤ 1）。
- A13 reducer：多镜 `generation.seal` 不带 scope → 拒绝（D4）；带 scope 且 ⊆ open → 收下。

**B. 门岗（每条记退出码）**：改到的 vitest（排锁）；ESLint 改到的文件；`node scripts/typecheck.mjs`（排锁）；`node scripts/check-concept-owners.mjs`；`node scripts/check-root-cause-contracts.mjs`（新合同 `docs/fixes/2026-10-27-shot-scope-undecided.root-cause.json`，doors 取 door-map 输出，door_reduction：7 扇门收成 1 个规则）；`pnpm run check:model-schema`、`check:mcp-tool-refs`、`check:walkthrough-tool-args`（说明改了）；`check:filesize`（`mcpGenerationTools.ts` 冻结 1034 行、`mcpGenerationMultiShot.ts` 冻结 850 行已顶格 → 规则搬进 `generationShotScope.ts`，冻结文件只减不增）；`git diff --check`；推送前快检。

**C. 走查（零花钱，`spend-walks` 阻断子集，协调排）**：`tests/ux/agent-spend-card.walk.mjs`、`agent-spend-confirm-executes`、`agent-spend-full-auto`、`agent-spend-generate-remaining`、`agent-spend-stop-midway`、`core-smoke-spend-confirm` 照旧全绿。

**D. 中英**：不涉及界面文案；模型可见文案英文，`check:model-schema` 基线 diff 逐字核。

**E. Agent 评测句子种子**（真模型评测用，未验证：要额度，交协调）：「先生成第一张看看」「剩下的也生成吧」「第二张改成夜景再生成」「刚才没点的那几张也来」「算了先不生成」「第一张再来一版」「全部重新生成」「加一个结尾镜头然后生成它」「把第三张去掉其他的生成」「生成吧」「只生成选中的这两张」「上一轮没生成的继续」「刚才失败的那张重试」「把视频那段也做了」「换个模型再生成第二张」「第二第三张按第一张的风格生成」「我改了提示词，重新出卡」「先别管第二张，生成第三张」「没生成完的继续」「这一镜不要了，剩下的生成」。

**反例**（实现线附「反例 → 结果 → 证据」表）

| 反例 | 必须红的格 |
|---|---|
| H1 把「没给就全量」放回 `generationShotScope.ts` | A1、A2 |
| H2 handler 继续把「没点名」预解析成「点名全部」（即使 store 规则对） | A1、A2 |
| H3 只认开着的卡（D1 选另一项） | A3 关卡那格 |
| H4 卡上没剩没定的时回退全集 | A3 R-c 那格、A2 变体 |
| H5 点名收窄成「只许没定的」 | A5 重试那格 |
| H6 `sealScopeOf` 留着不点名回退 | A13 |
| H7 范围拒绝落兜底码 | A5（断言码与文案里的镜 id） |

**这一类还会从哪回来**：① 新车道直接调 `store.present` 不经 handler → 规则在 reducer，守住（A1 同形测试经 store 也跑一遍）；② 新的出价写口 → `concept-owners` 守写口；③ 旧数据 → 读盘归一只有一处（A7）；④ 外部宿主 → gate 不收 `shotIds`，走同一个规则（A3）；⑤ 出价账形状升级 → `generationPresentationOutcome` 是唯一读口，类测试读它；⑥ 新的封印调用者不带 scope → reducer 拒绝（A13）。

**回滚**：revert 实现提交（单提交，无开关、无迁移、无落盘字段）；本设计卡提交独立。
**独立验收**：待协调派验收线（不得是 I-shot-scope-undecided），报告链接写进 PR 正文 `## 独立验收`。
**花钱走查**：本线不花钱；`spend-paid-sample` 交协调（免费演练先过、产物标记字面量 `shot-scope-undecided`、专用工作树）。

## 系统改进（计划）

- 删掉：四份「没给就全量」回退和旧函数，同一个提交。
- 结构上做不出来：handler 不再预解析；`CurrentOfferFacts` 逼调用方明说「没有当前出价」，`undefined` 混不过去；多镜封印必须带 scope（D4）；内存 store 不再有第二份 present 默认（D5）。
- 门岗自动拦：类测试 A1–A13 与反例 H1–H7；根因合同（doors 取 door-map）；model-face 基线锁住说明文案。
- 规则文字：`production.spend-card-presentation` 的 notes 记一句「不点名的范围只有 `resolveUndecidedGenerationShotScope` 一条规则」。

## 残余风险

- 点名重摆一镜正在交给画布的镜：`hasUnsettledLiability` 只看制作 Run 自己的作业，看不到画布那一侧的交接 → 点名路径仍可能把在交的镜再摆一次（不点名路径本卡堵上）。属于负债判据，不在本卡范围，交协调另派。
- 「这一镜还能封吗」两份定义（MCP 视图 `!shot.contract` 与 reducer「这一次出价里没批过」）会在「新一轮重试已封过的镜」时给出不同答案；本卡不合并。
- `laneExtendedDesktopPorts.ts:256-264` 不点名时按全集查导演台预览：比实际摆的范围大，只会多拦、不会多花；记后续。
- 文稿方案没有出价账：不点名时仍是这一轮全集，靠确认框逐行勾控制花钱；要让文稿方案也有「上一轮没定」的事实，得给它建出价账，不在本卡。
