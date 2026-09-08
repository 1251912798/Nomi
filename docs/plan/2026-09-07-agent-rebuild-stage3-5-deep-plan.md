# Agent 运行时重做 · 阶段 3 / 4 / 5 深度方案（2026-09-07）

> 状态：📋 方案待拍板 —— **只写方案，一行产品代码未改**。§7 只留 **3 条**真岔路，其余按 P0 自主推进。
> 基线：`origin/main@ec480dc4f`。全文仓库侧 `file:line` 均在此 checkout 上实核；pi 侧一律相对 `node_modules/@earendil-works/`（锁定 `0.85.1`）。
> 母方案：[`2026-09-07-agent-runtime-rebuild.md`](2026-09-07-agent-runtime-rebuild.md)（§6 六阶段；阶段 1 已合，§11 是它的实施记录）。本文只写**阶段 3、4、5**，不重复母方案已定的边界（七对七、九层、三条岔路的拍板）。
> 起因：用户 2026-09-07 原话「主线任务你需要更多的做思考和盘算，尤其是深度调研和分析」——所以这一份的重心是**把每个阶段会让我们返工的地方在动手前挖出来**，而不是再写一遍要做什么。

---

## 先查别人

> R27 §16 / `check:prior-art`。四问按模板答；每格给可复核出处。这份方案的检索面比母方案多出三块：**pi 随包发布的 `docs/` + `examples/extensions/`**（一致性核对 §1 指出母方案没打开过的书架）、**Anthropic 平台文档当前版**（用户点名）、**三家 coding agent 的审批模型一手文档**。

| 问 | 答 | 出处 |
|---|---|---|
| 依赖里已有？ | 有。审批要挂的孔（`before_tool` 返回 `{block:{reason}}` / `{args}`）、队列（`steer`/`followUp`/`nextRun`/`cancelQueued` 三态）、中断（`abort` 返回未消费队列）、重试事件（`retry_scheduled/start/end` + `LaneSnapshot.operation.retry`）、宿主自定义条目（`appendCustomEntry` + `entryProjectors`）、回合上限挂点（`shouldStopAfterTurn`）——全在 0.85.1 里，阶段 0 探针逐一实跑过 | `pi-agent-core/dist/harness/agent-harness.d.ts:550-562`（hooks）、`:634/:642`（custom entry）、`:32-34`（cancelQueued 三态）；[探针报告](../research/2026-09-07-pi-0.85.1-probe-report.md) §4.2 / §5.4 / §6.2 / §6.3；[一致性核对](../research/2026-09-07-pi-reference-implementation-conformance.md) §6.1 / §6.4 / §6.8 |
| 依赖里**不**提供、100% 是我们的活？ | 审批策略本身（pi `docs/security.md`：无内置审批、无沙箱）、工具级超时（[#8857](https://github.com/earendil-works/pi/issues/8857)）、回合上限策略（`agent-loop.js:85` 是 `while(true)`）、路径包容、假模型 provider、工具正确率评测——这六样上游明说不做或压根没有 | 一致性核对 §1.18 / §1.19 / §9.2 / §9.3 / §8.4 / §8.6；`https://pi.dev/docs/latest/security` |
| 仓库里已有？ | 有：审批三档的产品语义（`["step","safe-auto","project"]` + `["confirm","within-budget"]`）、按 `effectClass` 分级（PR #495 已合）、付费闸「模型面不可达」（`GENERATION_HOST_ONLY_TRANSITIONS`）、MCP 的 elicitation 优先审批、lease 语义、`/v1/models` 带鉴权探测（`apimart-llm` 雷达泳道已在 main）、退役 id 剪枝（`RETIRED_APIMART_TEXT_MODEL_KEYS`）——阶段 3/5 不重造这些，只换挂载点与派生方式 | `electron/shared/projectAgentContracts.ts:48-63`；`electron/projectAgentHost/projectAgentExecutionPolicy.ts:27-31,78-89`；`electron/harness/tools/modelToolSurfaceManifest.ts:236-256`；`electron/capabilityCore/mcpProtocol.ts:558-561`；`scripts/model-radar.ts:17,264-302`；`electron/catalog/seedBuiltins.ts:331` |
| 生态里已有？ | 三家审批模型都读了当前版：Claude Code 六档 + 「任何模式都不自动批」六条；Codex 双轴（approval × sandbox）+ `destructiveHint` 硬闸 + `Denied{rejection}`；pi 只有 project trust。Cursor / Cline / OpenCode 各一行。Anthropic 工具文档当前版：`strict`、`input_examples`、tool search、context editing、compaction、skills best practices、MCP 注解 | `https://code.claude.com/docs/en/permission-modes`、`https://learn.chatgpt.com/docs/agent-approvals-security`、`https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference`、`https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool`、`https://platform.claude.com/docs/en/build-with-claude/compaction`、`https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices`、`https://modelcontextprotocol.io/specification/2025-06-18/server/tools`；[成熟产品调研](../research/2026-09-06-mature-agent-products.md) §2.3 / §3.3 / §4.3 |
| 上游最近两周动了什么？ | 0.85.1 仍是 latest（无 0.86）。窗口内与我们直接相关：[#9260](https://github.com/earendil-works/pi/issues/9260)「steer 改为打断当前回合」**已关但不在 0.85.1**（语义将变）；[#8826](https://github.com/earendil-works/pi/issues/8826) 重试退避无上限（open）；[#9221](https://github.com/earendil-works/pi/issues/9221) 工具跑到一半 reload 会把成功记成失败（open）；[#6451](https://github.com/earendil-works/pi/issues/6451) harness 投影漂移（open）；[#9263](https://github.com/earendil-works/pi/issues/9263) 兼容网关要 strict 形状但拒 `strict` 字段（已修）；Unreleased：内建工具默认开 strict-prefer 采样 | `https://registry.npmjs.org/@earendil-works/pi-agent-core`（dist-tags）；`pi-coding-agent/CHANGELOG.md`（本地实核：上述 issue 号在 0.85.1 段**零命中**）；`https://api.github.com/repos/earendil-works/pi/issues?since=2026-08-24T00:00:00Z` |
| TikHub 自媒体里怎么说？ | 本文是运行时内部架构与迁移方案，自媒体侧没有可比的一手经验。**明着标，不冒充覆盖。** 今日雷达已查过 TikHub（分镜节奏那条），与本文无交叉 | [`2026-09-07-radar.md`](../research/2026-09-07-radar.md) §自媒体来源 |

**结论**：三个阶段都是「用上游已有的孔 + 自研上游明说不做的策略」。本文的增量不是新能力，是把**六处「动了才发现」**提前变成**六条现在就能跑的探针**（§4.3）。

---

## 0. 这份方案怎么读（D6：先说解决什么摩擦、再说要权衡什么）

**三个阶段各对着一个用户可见的摩擦**：

| 阶段 | 用户那一刻卡在哪 | 这一阶段做完他看到什么 | 要权衡的那一个东西 |
|---|---|---|---|
| **3 · 闸与三行** | 「它要动我的画布，我想先看一眼再放行」——今天审批是宿主自己的状态机，重启后卡片就没了；「一次网络抖动整轮白等」；「花费/上下文/推理三行永远是空的」 | 每个写操作前一张卡：**允许这次 / 本会话允许这类 / 不要（可以直接打字说为什么）**；花钱的只有「确认 / 不要」。网络抖动看到「正在重试 2/4」而不是失败。三行有真数或明确不画 | **审批时 pi 的那一轮是「停在那儿等」还是「先拒掉、批了再来一遍」**（§1.2）——前者一张卡对一个动作、不多花一轮模型钱；后者转录干净但每次审批多一次往返 |
| **4 · 切换删旧** | 「我上周的对话还在吗」「顺序对了吗」 | 旧对话还在，顶部一行「旧版本对话：按写入顺序显示」；新对话按真实发生顺序 | **一个原子 PR 删旧接新，还是留旧路 N 天可回退**（§2.4）——前者回滚是 revert 一个 merge；后者两条路同时活着、两个写入者写同一份转录 |
| **5 · 内外同源 + 目录探测** | 「Claude Code 里调 Nomi 和 Nomi 自己的 Agent 看到的不是同一套工具」「模型列表里有死模型」 | 外部宿主与内部 Agent 从同一份契约派生工具；退役模型自动禁用并说明原因 | **退役 id「直接下架」还是「自动禁用 + 一键删」**（§3.3）——前者是母方案的原话，但 09-07 实探证明「列表说死了」有 2/3 是误报 |

**贯穿三个阶段的一条硬事实（本文新实核，母方案没写）**：**新通路今天没有任何传输层看门狗。** `observeNativeStream`（首响应 90s / 空闲 120s）只在旧路 `run.mts:164` 挂着；`laneHost.mts:65-69` 走 `createNomiProvider()` 直接把 provider 交给 `AgentHarness`，而 pi 的库路径**一点超时都不给**（一致性核对 §6.7：`configureHttpDispatcher` 只在 CLI 入口调用）。也就是说影子期的 lane 在供应商流卡住时会**永远转圈**——`lane-slice.test.mts` 全绿是因为 loopback 从不卡。这条进阶段 3 的第一项（§1.6）。

---

## 1. 阶段 3 · 闸与三行

### 1.1 参考实现逐层对照（R29）：三家 × 我们

> 判定三档：**一致** / **有意不同（理由必须是 Nomi 领域约束）** / **没想到**。出处：Claude Code `https://code.claude.com/docs/en/permission-modes`（§"Actions no mode auto-approves"）与 `/permissions`；Codex `https://learn.chatgpt.com/docs/agent-approvals-security`（原 `developers.openai.com/codex/agent-approvals-security` 308 跳转）与 `codex-rs/protocol/src/protocol.rs:984,1009,4056`（[成熟产品调研 §3.3](../research/2026-09-06-mature-agent-products.md)）；pi `https://pi.dev/docs/latest/security` + `pi-coding-agent/examples/extensions/permission-gate.ts:13-33`。

| 维度 | Claude Code | Codex | pi | Nomi（阶段 3 定稿） | 判定 |
|---|---|---|---|---|---|
| **档位** | 六档：`default`(manual) / `acceptEdits` / `plan` / `auto`（第二个模型当分类器）/ `dontAsk` / `bypassPermissions` | 双轴：`approval_policy`（`untrusted` / `on-request` / `granular`(5 个独立布尔闸) / `never`）× `sandbox_mode`（`read-only` / `workspace-write` / `danger-full-access`） | **无**。只有 project trust（`ask`/`always`/`never`），管「加不加载项目本地配置」，不管工具 | 三档 `step` / `safe-auto` / `project`（`projectAgentContracts.ts:48`）+ 花费轴 `confirm` / `within-budget`（`:51`），默认 `safe-auto` + `confirm`（`:60-63`）。**用户面只露两句话**：可撤销 →「本会话允许这类」；花钱/不可逆 →「每次确认」 | **有意不同**（三家都是「读/写/命令」三分，Nomi 的分轴是 **可撤销 / 花钱**——因为我们的写操作绝大多数可撤销、真正的风险是钱；pi 的空档位是我们**必须**自建的证据） |
| **规则叠在档位之上** | allow / ask / deny 三级，deny 在 `bypassPermissions` 下**仍生效**，allow 在 bypass 下无效 | `granular` 五闸 `false` = **自动拒绝且不展示**，不是放行 | — | 「本会话允许」按**能力**记（`approvalScope:'always'` 是 per-capability，`useAgentPanelV4Actions.ts:342-345`），不是全局；工作模式 `ask`/`editSelection`/`agent`（`projectAgentContracts.ts:31-35`）先于档位判：`ask` 只放 read | **一致** |
| **谁都不能自动批的清单** | 六条，含 `bypassPermissions`：显式 ask 规则、`AskUserQuestion` / MCP `requiresUserInteraction`、关键路径 `rm`（**allow 规则和 `PreToolUse` 的 `"allow"` 都批不动**）、跨会话消息、`blockReads…` | 「工具声明 `destructiveHint` 时**总是**要审批」；`.git` / `.codex` / `.agents` 在可写根内仍只读 | — | 硬清单**独立于档位**：① `generation.gate`（唯一 `effect:"paid"` 契约，`generation.ts:50-51`）② `effectClass:"irreversible"`（`canvas.delete`、`export.write`）③ MCP 侧任何带 `destructiveHint` 的调用。今天①靠「不投影给模型」（`modelToolSurfaceManifest.ts:236-256`），阶段 3 升级为「够得着但永远批不动」（母方案 §1.3） | **一致**（方向与 Claude Code 第 4 条、Codex 的 destructive 硬闸相同）；**没想到**：Codex 那条「hint 只能抬高摩擦、不能降低」要写死——MCP 规范说 hint **不可信除非来自受信服务器** |
| **审批的失败方向** | hook 超时**不阻断**（文档明说别指望卡住的 hook 当闸）；退出码 2 硬阻断压过 JSON | `ReviewDecision::default() = Denied{rejection:"denied"}` —— fail-closed 写进类型 | `tool_call` 是**唯一** fail-closed 的钩子（`runner.js:745-763` 无 try/catch）；无 UI 时 `confirm()` 直接 `false` | **fail-closed**：审批模块抛异常 = 拒绝；无 UI（MCP stdio / 走查脚本 / 关窗）= 拒绝并给可行动 reason；**审批等待不设自动超时**（lane 空转不花钱，见 §1.2） | **一致**（与 Codex / pi 同向；与 Claude Code 有意不同——它是 CLI 里人盯着的） |
| **用户答案的形状** | allow / deny / `defer`（交还正常流程）+ `updatedInput`（改参数再放行） | `Approved` / `ApprovedForSession` / `ApprovedExecpolicyAmendment` / **`Denied{rejection: String}`**（拒绝时带一句话，**turn 继续**）/ `Abort`（整轮停）/ `TimedOut` | `ctx.ui.select` 的选项 + block reason | 四个动作：**允许这次**（`before_tool` 返回 `undefined`）· **本会话允许这类**（同上 + 写 grant）· **不要 + 可选一句话**（返回 `{block:{reason}}`，reason = 用户原话或默认文案，回合继续）· **停**（`lane.abort`，整轮停）。**改参数再放行**走 `{args}`（有校验，一致性核对 §7.3），阶段 3 只做「改提示词」一种 | **一致**（Codex 的 `Denied{rejection}` 正是「不对，横屏」该走的路，§1.3） |
| **等待期间 agent 在干嘛** | 阻塞；`PermissionRequest` 事件 | 回合挂起，`ExecApprovalRequestEvent` 带 `available_decisions` | `ui_prompt_start/end`（0.84.4）让宿主分清「在干活」和「在等人」 | `before_tool` 内 `await` 宿主 promise（§1.2），lane 的 `operation` 保持非空；宿主发 `laneProjection.pending` 让面板画卡 | **一致**（pi 自己的 `permission-gate.ts` 就是在钩子里 `await ctx.ui.select`） |
| **批量** | `PostToolBatch` 事件 | 逐条 | 并行模式「先全部预检、再并发执行」，`block` 只拦那一次 | 我们的工具是 `executionMode:'sequential'`（`laneTools.mts:99`），所以是**预检一个、跑一个、再预检下一个**——卡片天然逐张出现，不会「先弹三张」；「拒一个不等于拒整批」是模型看到 reason 后自己决定，「停」才是整批停 | **有意不同**（领域：画布写操作本来就必须串行） |

**一条要写进拍板记录的更正**：外部调研把钩子写成 `tool_call`，本仓用的是 `before_tool`。两者都存在、不在同一层：`tool_call` 是 `pi-coding-agent` 扩展层的事件（`core/extensions/types.d.ts:716-720`），`before_tool` 是 `pi-agent-core` harness 层的钩子（`agent-harness.d.ts:550-562`）。我们不装 coding-agent 的扩展运行时（[扩展加载探针](../research/2026-09-07-pi-extension-load-probe.md) §6：不借），所以**只有 `before_tool`**，且 `{args}` 改写会重新校验（harness 层独有，`harness/execution/tools.js:44-53`）。

### 1.2 审批「等待用户」期间，lane 的 operation 是什么状态

**背后的逻辑（大白话）**：模型说「我要建 8 个镜头卡」，我们要先问用户。问的这段时间，pi 那一轮跑到一半。它是「停在那儿等」，还是「先告诉模型『没批』、用户点了再让模型重来一遍」？

| 方案 | 用户看到 | 代价 |
|---|---|---|
| **A. 停在 `before_tool` 里等** ⭐ | 一张卡对一个动作；点「允许」工具就跑，**不多花一轮模型钱**；转录里一个 toolCall 对一个 toolResult | lane 的 `operation` 在等待期非空——「它在等我」这个状态 pi 不认识，宿主要自己投影；进程崩溃时这次调用没跑，重启后是一张「重启前等你确认的动作没有执行」的失败卡（§1.5） |
| **B. 先 `block`、批了再由模型重发** | 转录干净（每次审批一段完整往返） | **每次审批多一轮模型请求**（钱 + 等待）；模型重发的参数不保证和批的那份一样（要做参数指纹比对）；这正是今天宿主 proposal→claimed→execute 的形状，用户撞到的「6 次拒收」就是它的近亲 |
| **C. `block` + `terminate`，批后 `nextRun` 合成一句「已批准」** | 回合干净收尾，审批卡是这一轮的最后一件事 | 同 B 的钱 + 参数漂移；且 `terminate` 只在整批都 terminating 时才停（一致性核对 §1.13） |

**推荐 A**。三家里做审批的两家（Claude Code `PreToolUse` 阻塞、Codex 回合挂起）和 pi 自己的参考扩展（`permission-gate.ts:20-33` 在钩子里 `await ctx.ui.select`）全是 A 的形状；B/C 的唯一好处「转录干净」在 A 下也成立——**等待本身不产生条目**。

**A 在 0.85.1 上的三条实核（决定宿主那一侧怎么写）**：
- **钩子抛异常 = 拒绝**：`hooks.js:113-118` 的 `catch` 把异常变成 `block = { reason: error.message }` 并 `break`。harness 层与 coding-agent 层的 `tool_call` 同向 fail-closed（G-13 在结构上已满足，G3a 只需钉一条阳性对照）。
- **钩子在操作的中止信号下运行**：`runToolWithGate`（`hooks.js:40-47`）用 `withAbortSignal(gate.signal, context)` 把 operation 的 signal 挂进 `hookContext`，但只在**进入前** `throwIfAborted()`——**等待中的 promise pi 不替我们打断**。所以宿主的 gate 必须 `Promise.race([用户决定, hookContext.abortSignal])`；忽略它就是「按停止没反应」。这是 B 案的一个反对理由被 A 案自己吃掉的地方，也是 §4.3 探针 P1 的核心断言。
- **停在预检里的调用在 `runningTools` 里不可见**（`execute` 还没开始）。所以「它在等我」必须由宿主投影（`LaneProjection.pending`），不能从 pi 快照推。

**A 的状态机（一次工具调用的生命周期，标明每个状态住在哪）**：

```
proposed ──► preflight ──┬─► auto-granted ─────────────────────► executing ──► settled
 (pi:       (laneHost:   │   (策略判定，不弹卡)                   (pi:          (pi:
 streaming  before_tool  │                                       runningTools  toolResult
 Message    进入)        ├─► awaiting-user ──┬─► granted-once ──► executing     entry)
 .toolCall)              │   (laneHost 内存  ├─► granted-session ► executing + 写 grant
                         │    + projection   ├─► denied(reason) ─► pi 收到 {block:{reason}} ► toolResult(isError)
                         │    .pending)      └─► cancelled ──────► lane.abort ► 合成 cancelled 结果（pi 6.4②）
                         └─► denied-by-policy ► {block:{reason}}（工作模式 ask / 硬清单 / 无 UI）
```

- **`proposed` / `executing` / `settled` 是 pi 的真相**（`LaneSnapshot.operation.streamingMessage` / `runningTools` / transcript）。
- **`preflight` → `awaiting-user` → 决定** 是宿主的真相，**只活在 laneHost 内存 + `LaneProjection.pending`**，不进转录。理由：等待不是「发生了的事」；写进转录的只有结果（§1.4）。
- **审批等待不设自动超时**。等待期 lane 不发请求、不花钱；Cline 的 5 分钟 fail-closed 是为无人值守的 CLI 设的。Nomi 的关窗 / 关 lane / 切项目 = `cancelled`（`lane.abort`），不是「超时视为拒绝」——两者用户看到的文案不同（「你关掉了」vs「你没回答」），不能折成一态（G6-④ 那族）。
- **无 UI 的调用面**（MCP stdio 走 lane、走查脚本、后台批）：`preflight` 直接 → `denied-by-policy`，reason 写「这个动作需要在 Nomi 窗口里确认」。抄 pi 的三层保险：显式 `hasUI` 信号 + 默认拒 + 示例里 `if (!hasUI) return block`（一致性核对 §7.6）。

**审批范围（用户的两档）在这张图上的落点**：

| 用户面 | 触发条件（`effectClass`） | 落在哪个状态 | 记在哪 |
|---|---|---|---|
| **本会话允许这类** | `reversible_local` 且档位 ≠ `step`；`requiresPlanReview` 的能力（`timeline.write`）首次必弹 | `granted-session` 后，同能力下次直接 `auto-granted` | laneHost 内存 grant 表，键 = 能力 id；**不落盘**（关 app 即忘——「本会话」是字面意思） |
| **每次确认** | `spend` / `irreversible`，或档位 `step` | 每次 `awaiting-user` | — |
| **永远批不动** | `generation.gate` 的 `nomi_start_generation` 类转换 | 内部模型面**不投影**（保留 §1.3 的信任边界）；就算投影了也在 `preflight` 直接 `denied-by-policy` | 硬清单住 `electron/shared/agentCapabilities/`，与档位无关 |

### 1.3 插话：steer / followUp / nextRun 与审批并存时怎么走

**pi 0.85.1 的确切时机**（一致性核对 §6.1，探针 §6.3 实跑）：`steer` 在**下一次模型请求之前**注入（三处轮询，全在请求边界）；`followUp` 只在内层循环跑干后；`nextRun` 是下一次 run。**队列跨回合活着**，`LaneSnapshot.queues` 里可见、可 `cancelQueued`（三态 `cancelled | already_consumed | not_found`，`agent-harness.d.ts:32-34`）。

**用户在等审批时打了一句「不对，横屏」——这句话是什么？** 90% 的情况它是**对这张卡的回答**，不是排队给下一轮的指令。所以：

| 面板状态 | 用户打字后的默认动作 | 映射到 pi | 次选（明确按钮） |
|---|---|---|---|
| **有卡在等** | = 「不要」+ 这句话当 reason | `before_tool` 返回 `{block:{reason: 用户原话}}` → 模型下一步看到「不对，横屏」，重新规划（Codex `Denied{rejection}` 的形状） | 「排到下一步」→ `lane.steer(text)`（卡仍在等） |
| **在跑、没卡** | steer | `lane.steer(text)`，下一次模型请求前注入 | 「等它做完再说」→ `lane.followUp(text)` |
| **空闲** | 新一轮 | `lane.prompt(text)` | — |

- **队列模式写死 `one-at-a-time`**（G-24）：harness 默认 `"all"`（`harness/runtime/harness.js:44-45`）会把连打的三句一次性注入同一轮；创作场景每条指令的效果要能单独看见、单独撤销。`AgentHarnessOptions.steeringMode / followUpMode` 显式传。
- **`cancelQueued` 三态各画各的**：`already_consumed`（刚被吃进去了）不能和「已取消」画成一样。
- **`abort` 把没送出去的话贴回输入框**：`AbortResult` 返回未消费的 steer/followUp（`lane.js:799-808`），抄 TUI 的 `restoreQueuedMessagesToEditor`——用户按停止，他刚打的字不能丢。
- ⚠️ **上游语义即将变**：[#9260](https://github.com/earendil-works/pi/issues/9260)（已关、**不在 0.85.1**）把 steer 改成「打断当前回合、当新回合送达」。升到含它的版本时，上表「在跑、没卡」那一行的体感会从「等这一步做完再听我的」变成「立刻停下听我的」。这是产品语义变化，要在 `radar:upstream`（一致性核对 §6）里当「要跟 / 有意不跟」分诊，不能随版本号静默带进来。

### 1.4 审批卡怎么写进转录、怎么和真正的工具结果 join

**规则一：只写结果，不写等待。** 决定落定后追加一条 custom entry `nomi.approval`（阶段 1 已有，`laneContracts.ts:80-88`），按 `toolCallId` join 那次调用的 toolResult，**永不复制**工具正文。

**规则二：按「模型该不该看见」分两个命名空间**（G-15，抄 pi 旧会话系统 `custom` / `custom_message` 的物理二分当命名约定）：

| customType | 进模型上下文？ | 为什么 | projector |
|---|---|---|---|
| `nomi.ui.approval`（= 今天的 `nomi.approval`） | **否** | 拒收的 reason 已经一字不改是那次调用的 toolResult（探针 §4.2 臂 B）；再投一遍是同一句话说两遍 | `() => undefined` |
| `nomi.ui.task`（生成任务卡，按 `productionRunId` / `operationId` 引用 K4） | **否** | 进度是领域投影按 id join 出来的，模型要状态走 `nomi_generation_status` 工具 | `() => undefined` |
| `nomi.ui.failure`（失败卡：`code` / `message` / `nextAction`） | **否** | 失败正文已在 toolResult | `() => undefined` |
| `nomi.ctx.retry`（重试记录：attempt / delay / errorMessage 归一后的分类） | **否**（先） | 面板要，模型不要；转录留痕是 G4 的判据④ | `() => undefined` |
| `nomi.ctx.*`（预留：用户在卡上改过的提示词等「模型下一步的依据」） | **是** | 这一类才需要 projector 返回消息 | 逐类型注册 |

**规则三：G-16 的雷 pi 0.85.1 自己已经拆了——但要知道它拆在哪。** 一致性核对把 [#8537](https://github.com/earendil-works/pi/issues/8537)（运行中插入的消息落在 toolCall 与 toolResult 之间，严格校验顺序的供应商拒绝整段历史；Anthropic 硬规则见 `https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls` §Important formatting requirements）列为岔路 2 的直接雷区。实核 harness 的实现：**操作进行中的 `appendCustomEntry` / `appendMessage` 不直接落转录，而是进 lane 的 inbox 排成 `kind:"write"`**（`runtime/lane.js:1490-1545`），在**下一次模型请求前的边界**与 steer 一起被选中、追加到当前 tip 之后（`runtime/drive/boundary.js:29-48`）。也就是说阶段 1 在 `before_tool` 内追加 `nomi.approval`（`laneHost.mts:94`）从来没有插进过 toolCall/toolResult 之间——不是因为 projector 是 `undefined`，是因为 pi 把它排队了。两条后果要写死：
- **等待期的 `LaneSnapshot.queues` 里会出现 `kind:"write"` 的项**（`agent-harness.d.ts:162-172`）。投影层**不得**把它画成排队的用户消息；它是「待落盘的宿主记录」。
- 非投影的 `nomi.ui.*` 也走同一条队列，所以「随时追加」的代价是**落盘延迟到边界**——审批卡在转录里的位置永远在那一批工具结果之后，与 §1.4 规则一「只写结果」一致。`nomi.ctx.*` 同理，不需要宿主再守一条「只在 run 边界追加」的纪律——pi 替我们守了；后端角色要的那条断言改成：**`operation !== null` 时追加的条目必须先出现在 `queues` 里、再出现在 `transcript` 里**（阳性对照：直接写存储层跳过 lane 的实现会当场红）。

### 1.5 超时 / 关窗 / 重启后，审批怎么恢复

> **先纠正任务书里的一个词**：0.85.1 的 harness **没有** `SuspendedOperation.reason: "crash" | "deferred"` 这个形状。它的词表是三样：`OperationStatus = "running" | "open" | "aborting"`（`agent-harness.d.ts:94`）、`SuspendedRun { status: "suspended", deferred: DeferredHandle }`（`:20-24`，**只用于供应商侧的异步响应**——`run_suspend` 事件的 `reason` 只有 `"deferred"`，`:213-218`）、以及 `lane.resume()`（`:656`，返回 `OperationResultRecord | SuspendedRun | NothingToResume`）。**「崩溃」不是一个 reason，是重开时发现一个 `open` 的操作**——record log 里有 `operation_started` 没有 `operation_finished`。所以任务书问的两个 reason 对应到我们是：`deferred` ↔ **不对应任何宿主行为**（那是模型侧的 deferred 响应，Nomi 今天没有走这种供应商）；`crash` ↔ **重开时 `resume()` 走恢复路径**。恢复路径的实现（`runtime/drive/recovery.js:12-27`、`runtime/drive/tools.js:96-121,345-357`）已读，下表按它写，不再是推断。

| 场景 | pi 那边发生什么（0.85.1 实核） | 用户看到 | 我们做什么 |
|---|---|---|---|
| **关窗 / 切项目**（lane 正常关闭，卡在等） | 宿主先 `lane.abort()` 再 `close()`：gate 的 race 被 `hookContext.abortSignal` 打断（§1.2），还没发布 intent 的调用得到合成结果「Tool execution was cancelled before completion.」（`abortedOutcome`，`drive/tools.js:96-101`；`isError:true, terminate:false`）；`abort()` 返回未消费的 steer/followUp（`:124-129`） | 重开这条对话：最后一张卡是「你关掉了窗口，这个动作没有执行」+「再发一次」；输入框里是他没送出去的话 | 这是 `cancelled` 分支，**不是**超时；`nomi.ui.approval{decision:'cancelled', cause:'window-closed'}` |
| **进程崩溃**（卡在等 / 工具跑到一半） | 重开后 `lane.resume()`：孤儿助手请求从已提交的帧前缀合成一条 `stopReason:"error"` 消息，带固定警告「Assistant request was interrupted…the external outcome is unknown」（`recovery.js:12-27`）；工具**只有 `replay:"safe"` 才重跑**（`drive/tools.js:348`），我们全部声明 `replay:'never'`（`laneTools.mts:102`）→ `interruptedOutcome`：已提交的 checkpoint 内容 + `INTERRUPTION_MARKER`（`:103-109`） | 「重启前等你确认的动作没有执行」/「重启前正在做的这步没有完成，结果未知」+「再发一次」 | **诚实交付**：不复活确认卡（今天 `projectAgentExecutionRecovery.ts:16-59` 也是给失败卡不复活卡片，语义一致）；对写画布的工具，**以领域收据（§2.2 G5）核对「到底写没写」**，不以转录里的 `isError` 为准——[#9221](https://github.com/earendil-works/pi/issues/9221)（open）正是「reload 时把成功记成失败」 |
| **供应商异步响应**（`SuspendedRun`） | `drive()` 返回 `waiting/deferred`，`LaneSnapshot.operation.deferred{handle, poll}` | — | Nomi 的文本供应商今天不走 deferred API；投影层遇到 `deferred` 字段按「不可知」画，不报错 |
| **审批等待很久**（用户离开一小时） | 什么都不发生：无请求在飞、不花钱；操作保持 `running` | 卡还在 | 不做自动超时；看门狗**不计时**（等待期没有请求在飞，`observeNativeStream` 根本没被 arm） |

**一条上游 open 的坑要写进探针**：[#9221](https://github.com/earendil-works/pi/issues/9221)「reload during an active extension tool can store a successful result as an error」——对我们是「崩溃恢复可能把已成功的画布写入记成失败」。所以恢复文案**必须**以领域收据为准，不以转录里的 isError 为准。

### 1.6 看门狗、重试、错误分类、超时（四件事，各有 owner）

| 事 | 上游给什么 | 我们做什么 | 门岗 / 判据 |
|---|---|---|---|
| **传输层看门狗** | **零**（库路径不装 dispatcher） | 把 `observeNativeStream`（`observeStream.mts:31`）挂进 `createNomiProvider()` 的流上——**新旧路同一份**（P1），阶段 4 删旧路时它随 provider 留下 | 注入卡住的 loopback：lane 必须在 `firstResponseMs` 内结束（今天**会永远挂**，阳性对照现成） |
| **看门狗触发后算什么错** | `isRetryableAssistantError` 按**英文正则**判（含 `"timeout"`，`pi-ai/dist/utils/retry.js:55`）；`stopReason:"aborted"` 永不重试（`:121-125`） | 实核：`observeStream.mts:66` 的 `fail()` 调 `controller.abort(error)` → 极可能落成 `aborted` → **永不重试**，一次抖动照样白等。阶段 3 改成让超时以 `error` + 含 `timeout` 的文本浮出（或在 provider 适配器把 `NativeStreamTimeout` 归一成可重试错误） | G-11 零额度断言：注入一次超时，断言 stopReason 与是否重试 |
| **重试策略** | 四套（一致性核对 §6.5）；harness `DEFAULT_RETRY_POLICY = {enabled:true, maxRetries:3, baseDelayMs:1000}`（`harness/config.js:1`），**无 jitter、无上限**（[#8826](https://github.com/earendil-works/pi/issues/8826) open） | 显式传 `retry:{enabled:true, maxRetries:3, baseDelayMs:1000}`，数值写死进 `laneHost`；3 次上限下最长 4s，#8826 对我们无感 | G4：loopback 第 N 次 429，断言 `retry_scheduled/start/end` 三事件 + `operation.retry{attempt,maxAttempts,nextAttemptAt}` + 面板「正在重试 2/4」 |
| **厂商错误归一** | 40 条英文正则是上游资产，**不改** | 在 Nomi provider 适配器把 APIMart / kie 的错误报文映射成上游认得的文本（402 / 余额不足 → 含 `insufficient_quota`；中文超时 → 含 `timeout`） | G-12：喂真实抓到的厂商报文（`docs/audit/attachments/` 已有样本），断言分类 |
| **工具级超时** | **零**（#8857） | 契约声明 `execution.timeoutMs`（读类 30s、生成类按能力）；`laneTools.mts` 用 `AbortSignal.timeout` 合并进 `context.abortSignal`；**审批等待期不计时** | 每能力一条：超时 → `isError` 结果带「下一步」 |
| **回合上限** | **零**。⚠️ 一致性核对 §6.8 说的挂点 `shouldStopAfterTurn` 是 `agent-loop.js:154`（老路 `createAgentSession`）的；**harness 的 `AgentHarnessOptions` 里没有它**（`agent-harness.d.ts` 零命中），harness 能停一个 run 的口子只有三个：`before_tool` 的 `block.terminate`、`after_tool` 的 `terminate`（`:560,:579`）、`requestAbort` | 唯一一层策略：在 `before_request`（每次请求带 `attempt` 与 `step`，`:523`）计数；到上限后模型仍发工具调用 → `before_tool` 返回 `{block:{reason:"本轮已到 N 次请求上限，请直接给出结论", terminate:true}}`——模型与用户看到同一句话，而不是一个 `step-limit` 错误码。删掉 `run.mts:260-262` 那条会说谎的第三层。**加一条 Nomi 独有规则**：同一工具 + 同一失败码连续 3 次 → `before_tool` 拦下并说「换方法或告诉用户做不到」；5 次 → `terminate` | 阳性对照：上限设 1，模型不发工具、正常收尾时**不得**出现任何拦截 |

### 1.7 三行（花费 / 上下文 / 推理）：三态，不是「> 0」

| 行 | 数从哪来 | 三态 | 今天会咬人的地方 |
|---|---|---|---|
| **花费** | `LaneSnapshot.stats.usage.cost.total`（pi `calculateCost`，**USD / 每百万 token**，`pi-ai/dist/models.js:539-543`） | 有值 / **不可知**（模型无价目 → `costUsd` 字段不存在，`laneContracts.ts:66-67` 已这么写）/ 不适用 | **G-10：Nomi 的模型全是自定义的，不声明 cost 就是 $0**（`provider-composer.js:71`；`model.mts:72` 今天就是全零）。**且 catalog 根本没地方放 token 价**：`Model.pricing` 是**每次生成的点数**（`electron/catalog/types.ts:275-281`，`shotPricing.ts:20-26`），不是 per-token。→ 阶段 3 加 `Model.tokenPricing?: { inputPerMTokUsd, outputPerMTokUsd, cacheReadPerMTokUsd?, cacheWritePerMTokUsd? }`，`createNomiProvider` 从它派生 pi `Model.cost`；门岗：每个 Agent 可选文本模型要么有 `tokenPricing` 要么显式 `free:true`；单测钉单位换算（差一次三个数量级） |
| **上下文** | `stats` + `Model.contextWindow`；压缩后到下一条有效助手响应之前 `getContextUsage()` 返回 `tokens:null`（`agent-session.js:2708-2748`） | 有值 / **不可知（刚压缩 / 首轮）**/ — | G-17：G5 的「> 0」在刚压缩完是假红；首轮估算不含系统提示词与工具 schema（低估几千 token）。「不可知」**不渲染或明确占位，绝不画 0** |
| **推理** | **逐消息** `usage.reasoning`（⊆ `output`，不是另加）；会话总计里**没有它**（`core/usage-totals.js:10-16` 丢掉 `reasoning`） | 有值 / 该档位下不适用（`getSupportedThinkingLevels` 只返回 `["off"]`）/ 不可知 | 档位由 `getSupportedThinkingLevels(model)` derive；`thinkingLevelMap[level] === null` 的档 UI 不可选；**`off` 为 `null` 的模型（关不掉思考）**要有对应 UI，不能出现一个不生效的「关闭」 |

### 1.8 阶段 3 的验收门（在母方案 G4 / G5 / G6 之上补的）

- **G3a · 审批 fail-closed 零额度判据**：把审批函数换成必抛版本，断言工具没跑、模型收到可行动 reason（G-13）。
- **G3b · 审批停在钩子里的三条**：① 等待期无模型请求（loopback 计数 = 0）② `abort` 时得到合成 cancelled 结果且输入框拿回未送出的话 ③ 崩溃恢复不复活卡片、写失败卡（P1 探针的产物）。
- **G3c · 看门狗存在**：卡住的 loopback 下 lane 在 `firstResponseMs` 内结束（**今天会红**——这是 R17 要的先红后绿）。
- **G3d · 三行三态**：刚压缩完 / 首轮 / 无价目模型三个夹具，断言分别渲染成「不可知」，**不渲染 0**。
- **G3e · 队列模式**：连打三句，断言三轮各吃一句（`one-at-a-time`），`queues` 里可见可取消，`already_consumed` 单独文案。
- **R30 数字**：用阶段 2 的五任务夹具复跑，**加审批介入**（介入槽一律「不要 + 一句话」），回合成功率不得低于阶段 2 的数字——审批不能把成功率打下来。

---

## 2. 阶段 4 · 切换删旧

### 2.1 三份落盘 → pi 一份：迁移三档（D4：能迁的迁、只能迁摘要的说清、丢的明说）

> 三份的实核形状：① pi 快照信封 `<project>/.nomi/agent-thread-context-v1.json`（`snapshot.mts:19-33,65-74`；`data.entries[]` 是 pi **旧会话系统 v3** 的条目，9 种类型，`snapshotSchema.mts:43-53`，助手 content 是**有序**的 `text|thinking|toolCall` 数组 `:21-26`）；② 宿主 `<userData>/project-agent-host/<partition>/snapshot-v1.json` + `commands-v1.jsonl`（`projectAgentRepository.ts:33-40,391-399`；7 种 item：`user/assistant/tool/proposal/task/artifact/failure`，`projectAgentContracts.ts:75-83`）；③ 渲染层 localStorage `nomi.agent.resident.tool-projections.v1:*`（`residentToolProjection.ts:42,113-117`；每次调用存脱敏 input/output 摘要 + `textOffset`）。

| 旧数据 | 档 | 迁成什么 | 用户看到的文案（面板顶部一行，仅迁移来的对话显示） |
|---|---|---|---|
| ① pi 快照信封 | ✅ **无损迁**（含真实顺序） | 逐条经 **lane 的公开 API** 写进新会话：`message` → `AgentLane.appendMessage(message)`（`agent-harness.d.ts:641`；它拒收 `stopReason:"pending"` 的助手消息，`runtime/lane.js:1495-1499`——正好把一致性核对 §6.8 要过滤的那种条目挡在门外）；`custom` → `appendCustomEntry('nomi.ui.legacy', …)`；`compaction` / `branch_summary` / `model_change` / `thinking_level_change` **没有公开追加口**——压缩条目改成一条 `nomi.ui.legacy-compaction` 记录 + 把它的 `summary` 以 `appendMessage` 写成一条用户消息（模型仍看得见摘要），另两种只影响设置回放、丢弃。**不碰存储层**——这是 §4.3 探针 P2 要证的事 | 「这段对话来自旧版本，已完整保留。」（有压缩条目的加一句「较早的部分是当时的摘要」） |
| ② 宿主 `snapshot-v1.json` 的 items | ⚠️ **迁内容，迁不回真实顺序** | 按 items 数组顺序（= 写入序）线性回填，**绝不按 `createdAt` 重排**（同回合 8 条工具去重后只有 1 个值）。`user`/`assistant` → 消息；`tool` → 一对 assistant(toolCall) + toolResult（正文 = 宿主存的结果摘要）；`proposal`/`task`/`failure`/`artifact` → `nomi.ui.legacy-*` custom entry（不投影）。**与 ① 冲突时以 ① 为准**——它是模型真正看过的 | 「这段对话来自旧版本：按当时写入的先后显示，不一定是真实发生顺序。」 |
| ② 宿主 `commands-v1.jsonl` | ❌ **不迁** | 它是旧状态机的幂等重放输入；新运行时有自己的 `accept/getResult`。**归档一个版本周期后删**（走 `projectAgentMigration.ts:9-17,42-52` 已有的「读旧、算 hash、上锁搬进 legacy archive、写清单」手法，**不删原件**） | 不显示（用户从没见过它） |
| ③ localStorage 工具正文 | ❌ **不迁** | 它本来就易失（清浏览器存储就没了），且是脱敏摘要不是正文。新通路正文在转录里 | 「旧对话里工具的详细参数已不再保留。」（只在有 tool item 的迁移对话上显示） |
| ②′ `<project>/.nomi/project-agent-proposal-receipt.json`（`schemaVersion:2`，带**撤销补偿程序**，`projectAgentProposalReceiptStore.ts:26,63`） | ✅ **不迁，原地保留** | 它不是转录，是领域收据（画布提案的 undo 程序），**MCP 外部宿主也写它**（`mcpStdioServer.ts:64`）。按 K3/K4「按 id join、不复制」——文件不动，owner 搬家（§2.2 G5） | — |

**迁移的机器判据**：迁移后打开每条旧对话，`LaneProjection.parts` 的条数 = 旧 items 数 + 合成的 toolCall 对；顺序 = 数组序；没有任何 `createdAt` 参与。迁移**可逆一个版本周期**：旧文件搬进 archive 不删，revert 切换 PR 时新写的 `agent-sessions/` 目录整体废弃、archive 原样搬回。

### 2.2 待删 ~58 文件按行为域分组：删了之后哪个用户可见行为会变、谁承接

> 实核：`electron/projectAgentHost/` 生产文件 **52 个 / 9 751 行**（母方案记 9 688）；`electron/harness/runtime/` **14 个 / 1 519 行**；渲染层 4 个 ≈ 1 000 行；死文件 4 个 1 001 行（`nomiSkillResources.mts` 在母方案里**被数了两次**）。

| # | 行为域 | 文件（行数） | 删了之后**用户可见**什么变 | 新通路承接点 | 判定 |
|---|---|---|---|---|---|
| G1 | 状态模型与 reducer 核心 | `projectAgentState` 803 · `projectAgentReducer` 629 · 15 个校验/归约文件 ≈ 1 085 | 面板转录里有哪些气泡/收据、8 种状态 | `LaneSnapshot` → `laneProjection.mts`；`LanePart` 六种（`laneContracts.ts:29-58`） | ✅ 被替换 |
| G2 | 线程/回合生命周期 | `projectAgentTurnExecution` 791 + 6 个 ≈ 576 | 多线程历史、「新对话」、流式文字、回合收尾 | 会话/回合 = pi（`laneSession.mts:29-45`）；**多线程 = 多 lane**（`laneName`，`laneIpc.ts:26` 自陈「一个窗口一条」是阶段 1 的限制） | ⚠️ **部分**：阶段 4 前要把「一个项目多条对话」接成多 lane，含列表/切换 |
| G3 | **排队指令编辑** | `projectAgentQueueMutationReduction` 164 · `projectAgentQueueEditReduction` 80 | 排队行的**改顺序 / 暂停 / 取消 / 跑前改内容** | pi 队列：`cancelQueued` + 重发 = 改顺序；**暂停无对应**；跑前改内容 = 取消 + 重发 | 🔴 **无承接点（1/3）**：「暂停」这个宿主自造的状态随旧路死。用户面文案：「排队的指令可以取消后重发」。理由：pi 队列是 FIFO 且没有 pause 概念；自造一个 = 撞 O4 |
| G4 | 审批/提案状态机 | `projectAgentProposalReduction` 265 · `Transitions` 220 · `Persistence` 148 · `ExecutionPolicy` 89 · `ApprovalHelpers` 57 | 每张确认卡、「不再问」、拒绝文案、工作模式拦截 | 阶段 3 §1.2 的状态机（`before_tool` + laneHost 内存 + `LaneProjection.pending`）；**产品语义原样搬**（三档 / 花费轴 / `effectClass` 判定 / `requiresPlanReview` / 工作模式先判） | ✅ 阶段 3 承接（阶段 4 的前置） |
| G5 | **收据与 provenance** | `projectAgentProposalReceiptStore` 465 · `DocumentReceipt` 82 · `ReceiptResolver` 45 · `ReceiptCorrelation` 31 | 画布提案的**撤销**（「撤销这次改动」）、崩溃后「批过的动作到底写没写」的核对 | **无**——且它有**活的非 Agent 调用者**：`mcpStdioServer.ts:64`、`rpcServer.ts:46`、`mcpDocumentWriteReceipt.ts:4` | 🔴 **无承接点（2/3）→ 判定「不删，搬家」**：owner 从 `projectAgentHost/` 移到 `capabilityCore/`（它本来就是领域收据，K3/K4 说的「领域状态住领域存储」）。阶段 3 的崩溃恢复文案（§1.5）就靠它 |
| G6 | 执行协调 | `ExecutionCoordinator` 730 · `Types` 307 · `Helpers` 280 · `Recovery` 135 · `AdapterResolvers` 143 | 工具调用 → 能力适配器派发、取消、重复调用防护、重启恢复 | `laneTools.mts` + `laneToolSchema.mts` + 阶段 2 的 `toolProjection`；今天只有 `document.*` 接了 | ⚠️ 阶段 2 把 22 个能力搬进来后才算承接 |
| G7 | 持久化/仓库/迁移 | `Repository` 552 · `CommandLedger` 497 · `CutoverManifest` 281 · `Migration` 241 · `CompactReplay` 63 · `Router` 40 | 对话跨重启存活；幂等重放 | pi `JsonlSessionRepo`（`laneSession.mts:26-28`）；命令账本**不迁**（§2.1） | ✅ 被替换；`Migration.ts` 的手法保留用于 §2.1 |
| G8 | IPC 与运行时装配 | `projectAgentIpc` 681 · `Host` 97 · `ProductionRuntime` 89 · `ContextBinding` 6 | 面板能做的一切（8 个通道，`preload.ts:673-712`） | `LANE_IPC_CHANNELS` 两个通道（`laneContracts.ts:101-106`）+ 阶段 3 加的审批/队列命令 | ✅（`preload.ts` 要加 `agentLane` 面） |
| G9 | 身份/分区 | `Identity` 24 · `SemanticIdentity` 55 | 看到哪个项目的对话 | `sessionsRoot` 在项目目录下 + 常量 slug（`laneSession.mts:23-26`） | ✅；`diagnosticsIpc.ts:15` 还 import `projectAgentPartitionKey`，要改 |
| G10 | 渲染层投影 | `agentPanelV4Projection` 459 · `PendingTools` 135 · `residentToolProjection` ≈180 · `ProjectionStore` 156 | v4 流：顺序、7 态、收据正文、运行中卡 | `laneViewModel.ts:107-176` 输出同一个 `V4FlowItem[]`；`laneClient.ts` 是 store | ✅ 且更好（删排序 / 删第二真相 / 删 localStorage） |
| G11 | 用量/花费 | 散在 G1/G6 | 上下文环、¥ 数字 | `LaneUsage`（`costUsd` 缺省不是 0） | ✅ 且更好 |
| G12 | 压缩重放 | `CompactReplay` 63 | 长对话不撞窗口 | pi 原生压缩 | ✅ |
| G13 | **生成任务卡** | 散在 `ExecutionCoordinatorTypes.ts:24,71`、`ProductionRuntime.ts:8,33`、`ExecutionCoordinator.ts:485-488` | 任务卡：进度 %、已花/预估、候选缩略图（`V4TaskFacts`，`agentPanelV4Projection.ts:51-61`） | **无**：`LanePart` 没有 `task` 种；`laneViewModel` 只出 user/assistant/thinking/tool | 🔴 **无承接点（3/3）→ 阶段 3 补**：`nomi.ui.task` custom entry 按 `productionRunId` 引用 + `LanePart.kind:'task'` + 领域投影按 id join（K4「永不复制状态」）|
| — | 旧接缝 `runtimePort.ts` + `pi/*.mts` | 14 文件 | — | ⚠️ **不能原样删**：`laneRuntimePort.ts:13` 仍 import `NomiModelConfig`；`laneHost.mts:17` 仍 import `createNomiProvider`（`pi/model.mts`）；`RuntimeToolCall` 等类型被 **11 个 `capabilityCore/*TransportAdapters.ts`** + `agentChatPolicy.ts:16` 等引用 | 先搬家再删（§2.4 前置 PR ③） |
| — | 词表 owner `electron/shared/projectAgentContracts.ts` | 不在删除清单 | `workbenchStore.ts:53,183-194,331-342` 只用它的 `approvalPolicy` / 草稿 / 附件 | 切换后它孤儿化 | 拆：审批词表进 `shared/agentCapabilities/`，草稿/附件留 `workbenchStore` |
| — | 死四件 | `canvasDescriptors` 471 · `documentDescriptors` 86 · `agentChatV2Ipc` 277 · `nomiSkillResources` 167 | 无 | `canvasDescriptors.ts` 的 `.describe()` 资产先迁进活契约（阶段 2）；**三个测试把它当源码文本读**（`stagingPoses.test.ts:56-60`、`agentChatPolicy.test.ts:49`、`runGenerationBatchTool.test.ts:4`）要先改家 | 前置 PR ① |
| — | 设计实验室宿主 | `src/devlab/designLab/v4/agentPanelV4LabHost.tsx:160-173` | **62 张视觉基线**（母方案写 57 时的数字）全靠它 `projectAgentProjectionStore.install` | 夹具改成 `LaneSnapshot` JSON（`tests/agent-runtime/__fixtures__/lane-projection.json` 已是这个形状） | 前置 PR ④ |

**无承接点的功能：3 个**（G3 排队暂停 / G5 撤销收据 / G13 任务卡）。裁决：G5 **搬家不删**；G13 **阶段 3 补承接点**（是阶段 4 的硬前置）；G3 的「暂停」**明说丢弃**，取消 + 重发覆盖其余。另有一个**结构性半承接**：G2 多线程 → 多 lane，阶段 4 前要接完。

### 2.3 影子比对「够稳可切」的机器判据

**先说清楚一件事**：真实模型不可能「同一句话跑两遍比结果」——非确定且花两份钱。所以影子比对分两层，**第二层是本文新加的**：

| 层 | 怎么比 | 判据（全部机器可判） | 谁在跑 |
|---|---|---|---|
| **L1 · 剧本影子**（阶段 1 已有） | 同一份 loopback 剧本喂两条通路，比转录/工具/花费/文稿终态（`lane-shadow-parity.test.mts`） | 阶段 2 把 22 个能力搬进来后：**≥ 5 个能力档 × 每档 ≥ 3 剧本 = 15+ 剧本全部 4/4** | CI 每次 |
| **L2 · 回放影子**（新） | 从真实用户的 ① pi 快照信封里取**真实供应商响应**（它就是模型真正吐过的东西），用夹具 provider 逐字回放进新 lane，比投影 | 最近 **≥ 200 个真实回合**（跨 ≥ 3 个真实项目）回放：段顺序、文字、toolCall 参数、toolResult 文本 **逐字一致率 100%**；崩溃 0 | 本地夜跑（数据不出机器）|
| **L3 · 真实模型数字**（R30） | 阶段 2 的 5 任务 × 3 次 + 审批介入臂 | 一次写对率 ≥ 90%（`canvas.write` 从 0/18 起）；回合成功率 ≥ 阶段 2 数字；五段归因（雷达 §2：工具选择 / schema 落地 / 参数绑定 / 输出处理 / 端到端）里**「输出处理」段的失败 = 0**（那是用户撞到的「连续拒收」） | 每个阶段 PR 各跑一次，数字进 PR |
| **时间维** | — | L1 + L2 **连续 7 天绿**（夜跑不红），期间 main 上的 Agent 相关 PR 每合一个重跑 | — |
| **冷重启** | G3 机器断言 | 200 个回放会话 close → reopen → 投影逐项相等 | CI |
| **真实闭环**（G1） | MiniMax H3 1–2 分钟短片（记忆里 09-06 拍板的验收目标） | 在**打包版**上跑通创作 → 分镜 → 画布 → 生成 → 时间轴 → 导出，截图人眼 + 情绪摩擦日志，冒出的问题**全修**（R16） | 切换 PR 合并前，一次 |

**够稳可切 = 上表六行同时成立。** 少一行都不切；不设「差不多」档。

**L2 已落成可跑**（2026-09-08）：`pnpm run replay:shadow`，怎么跑 / 报告在哪 / 7 天绿从哪天起算见 [`docs/engineering/agent-lane-replay-shadow.md`](../engineering/agent-lane-replay-shadow.md)。同一份文档记了一条与本节假设**不符**的实核：本机 369 个项目里 ① pi 快照信封 **0 份**，真实语料是 §2.1 没有盘点到的 `<project>/.nomi/agent-session.json`（旧 agentChatV2 存储）。首跑 126 个真实回合 / 48 个项目、逐字一致 100%、崩溃 0、冷重启 100%，但未达 200 回合，判定停在 `green-short-of-corpus`——**7 天绿还没开始数**。

### 2.4 切换 PR 的原子性：裁决

**背后的逻辑（大白话）**：同事的建议是「新旧并行跑稳了再删」。这句话有两种读法——**跑稳了再删**（对）和**留一个开关随时切回去**（错）。前者我们已经在做（影子期 + §2.3 六行判据）；后者意味着两条用户走得到的路 + **两个写入者写同一段对话**——那正是三份转录的来历（I2）。

| 方案 | 用户看到 | 代价 |
|---|---|---|
| **A. 一个原子 PR：删旧 + 接新 + 迁移 + 62 张基线零改动**（母方案 §4.2 原话） | 切换日之后只有一条路；回滚 = revert 一个 merge commit（迁移随 revert 一起回、archive 搬回） | 单 PR ≈ −11 000 / +1 500 行，评审面积大；任何一个领域模块偷偷依赖宿主导出，在 PR 里才发现 |
| **B. 两步：先接新默认开、旧路保留 N 天可回退** | 出问题能切回旧路 | **并行版**（P1）：两条可达的路；旧路继续写 `snapshot-v1.json`、新路写 jsonl，切回去时新路那几天的对话**旧路读不到**——「可回退」是假的；且 N 天里每个修复要修两遍 |
| **C. 原子 PR，但前面排四个「零行为变化」的前置 PR 把它瘦下来** ⭐ | 同 A | 前置 PR 各自可独立 revert；原子 PR 只剩「注册 laneIpc + 渲染层换 store + 删 + 迁移」 |

**裁决 C**。它是 A 的执行方式，不是 B 的妥协：**并行只在影子期存在（用户走不到），切换是一刀，可回退靠 revert + 数据 archive，不靠开关。** 四个前置 PR（每个都能今天就开，与阶段 3 并行）：

1. **死四件 + 测试改家**：删 `canvasDescriptors` / `documentDescriptors` / `agentChatV2Ipc` / `nomiSkillResources`；三个把 `canvasDescriptors.ts` 当文本读的测试改指活契约；`agentChatPolicy.ts:85-87` 那条恒空的 `author_skill` 分支一起删（用户已定 `skill.write` 远期）。
2. **G5 收据搬家**：`projectAgentProposalReceiptStore` 等 4 文件移到 `capabilityCore/`，MCP / RPC 的 import 跟着改；行为零变化，`check:boundaries` 基线只减。
3. **接缝类型搬家**：`NomiModelConfig` + `createNomiProvider` 移到 `electron/shared/agentLane/` / `electron/agentLane/`；`RuntimeToolCall` 等 11 个 transport adapter 用的类型移到 `shared/agentCapabilities/`；`runtimePort.ts` 变成纯 re-export（阶段 4 删它时零引用）。
4. **设计实验室夹具改源**：44 个夹具从「手写宿主 items」改成「手写 `LaneSnapshot`」，`agentPanelV4LabHost.tsx:160-173` 改吃 `laneClient`；**62 张基线一张不动**是这一步的验收（基线红 = 投影错了，不是基线该更新）。这一步之后实验室就是新通路的第一个真实消费者，切换 PR 时它已经证明过一遍。

然后原子 PR：`main.ts` 注册 `registerAgentLaneIpc`（同时删 `lane-unreachable` 断言与规则 O6）、`NomiStudioApp.tsx` 七处 + v4 hooks 换 `laneClient`、删 G1/G2/G3/G4/G6/G7/G8/G9/G10 与 `runtimePort.ts` + `pi/*.mts`、§2.1 迁移、`preload.ts` 加 lane 面删 8 个 `nomi:projectAgent:*` 通道。**「先 `--dry-run` 一次结构测」**（母方案 CTO 评审第 2 条）就是前置 PR ③ 做完后跑一次 `tsc` 看还有谁 import 宿主——那时答案应当是零。

**G7 的现实**：母方案的两条门岗 `check:pi-boundary` / `check:model-schema` **今天都还不存在**（`package.json` 零命中）；存在的是 `check:framework-boundary` 的 15 条债（14 条 pi + 1 条 xyflow，`scripts/framework-boundary-baseline.json`，due 2026-11-07），**14 条 pi 债全部落在阶段 4 要删的文件上**——切换 PR 合并 = 债自动归零，这就是 G7 的机器判据，不用等两条新门岗。两条新门岗的 S 规则（模型 schema）已经以**生成点**的形式活在 `laneToolSchema.mts:183-269`（根级 anyOf / const / 无 items 数组全部拒收）——比扫源码的 CI 规则更早一层（R28）。是否还要单独做门岗，阶段 2 结束时按 `check:framework-boundary` advisory 的误报率决定。

---

## 3. 阶段 5 · 内外同源 + 目录探测 + 技能

### 3.1 一个描述符、两个 profile：具体形状

**今天的现实（实核）**：描述符有**三种**互不相认的形状——`SemanticToolDescriptor`（`modelToolSurfaceManifest.ts:11-23`，含 version/risk/sideEffect）→ 压成 `AgentToolDescriptor`（`agentToolCatalog.ts:13-17`，只剩 name/description/parameters）→ `RuntimeToolDescriptor`；MCP 是 `McpCapabilityTool`（`mcpCapabilityProjection.ts:52-63`，schema **手写**在 `:154-199`，`parseCall` 手写映射在 `:207-266`）。**付费边界表达了两次**：注册表里 `generation.gate` 是唯一 `effect:"paid"`（`generation.ts:50-51`），而 MCP 的 `nomi_operation_gate` / `nomi_operation_execute` **根本不是注册表契约**，是手写 JSON Schema（`mcpGenerationToolCatalog.ts:121,147`）。

**目标形状**（住 `electron/shared/agentCapabilities/`，唯一 owner）：

```ts
// 每个「模型可见工具」= 一个契约的一个别名。别名不再是「同一个工具的两个名字」（母方案 §3.1）。
interface ModelFacingToolSpec {
  contract: CapabilityContractId            // 'canvas.write'
  alias: string                             // 'nomi_storyboard_write'（一别名一工具，别名定死的字段不进 schema）
  description: string                       // S4a：干什么 + 限制 + 截断上限（常量插值）
  promptSnippet: string                     // 一行，进系统提示词 "Available tools"（G-03 三通道之二）
  promptGuidelines?: readonly string[]      // 跨工具消歧，进 "Guidelines"，去重（三通道之三）
  schema: ZodTypeAny                        // 作者写法；模型可见 JSON Schema 只有一个生成点（岔路 3 = A）
  prepareArguments?(args: unknown): unknown // 容忍梯：JSON 字符串 / 单对象→数组 / 旧形状（G-06）
  effect / effectClass / requiresPlanReview // 从契约继承，审批闸与 MCP 注解都从这里派生
  execution: { mode: 'parallel' | 'sequential'; timeoutMs: number; replay: 'never' | 'idempotent' }
  //          ↑ 读类 parallel、写类 sequential（1.10）；超时逐能力（D-02）；replay 决定崩溃恢复敢不敢重跑
}

projectTools(registry, profile: 'internal' | 'mcp', capabilityProfile): ModelFacingTool[]
```

**两个 profile 允许的差异只有三处，全部来自声明**：

| 差异 | internal | mcp | 来源 |
|---|---|---|---|
| `leaseHandle` | 无 | 每工具 schema **首字段必填**，执行前 `dispatcher.ts:199-210` 验 | 契约 `execution.port === 'mcp'` 派生 |
| 付费闸 | **不投影** `generation.gate` 的转换别名（`nomi_start_generation` 等）；硬清单在 `before_tool` 再拦一次 | 投影为 `nomi_operation_gate` / `execute`，走 elicitation 优先（`mcpProtocol.ts:558-561`） | 契约 `effect:"paid"` + 别名表；**把 `mcpGenerationToolCatalog.ts:121/147` 那两个手写工具折进 `generation.gate` 的 mcp 别名**，付费边界只表达一次 |
| 注解 | 不输出 | `readOnlyHint` ← `effect==='read'`；`destructiveHint` ← `effectClass ∈ {irreversible, spend}`；`idempotentHint` ← `execution.replay==='idempotent'` | 今天 `mcpCapabilityProjection.ts:117-124` 只对 4 个工具手写 `readOnlyHint`，改为全量派生 |

**不允许的差异要被门岗消掉**：S9「MCP 广播 schema 不弱于执行 schema」在同源之后**结构上成立**（同一个生成点）。但 `mcpCapabilityProjection.ts:151-153` 自陈的约束仍在——自家 MCP 校验器**不实现 `anyOf` / `exclusiveMinimum`**。这与 Anthropic strict mode（不支持 `minimum`/`maximum`/`minLength`、`additionalProperties` 必须 `false`、`anyOf` 可但 `allOf`+`$ref` 不可，`https://platform.claude.com/docs/en/build-with-claude/structured-outputs` §JSON Schema limitations）和 Google OpenAPI 3.03（无 `anyOf`/`const`）合在一起，给出**模型可见 schema 的唯一合法子集**：

> **S12（新）**：模型可见 JSON Schema = 四家交集：根是扁平 object、无 `anyOf`/`oneOf`/`allOf`、无 `const`（枚举一律 `{type:"string", enum:[…]}`）、无数值/长度约束（写进 description、在 `execute` 里校验）、`additionalProperties:false`、数组必带 `items`。生成点 `laneToolSchema.mts` 已拦前三条与最后一条（`:183-269`），阶段 5 补数值/长度约束与 `additionalProperties`。

**三处手写映射收掉**：`mcpCapabilityProjection.ts:207-212 / :224-236 / :259-266` 的 `parseCall`（`"read"`→`read_timeline` 等）被「一别名一工具」替代——MCP 侧的时间轴读不再是 1 个带 `operation` 的工具，而是与内部**同一批**扁平工具（内部 3 / MCP 3），差别只剩 `leaseHandle`。MCP 从 42→15 归并的那次收敛（架构评审 §4.6）里**对的那一半**（合并字节级相同的 plan/edit，`mcpCapabilityProjection.ts:439-444` 写了理由）在同源后自动继承；**错的那一半**（把 3 个读工具折成 1 个 `operation` 枚举）撞 G-01，随同源一起消失。

### 3.2 资源发现改事件驱动：pi 的 26 个宿主方法里采纳哪些

> `ExtensionActions`（14 个）+ `ExtensionContextActions`（12 个）在 `pi-coding-agent/dist/core/extensions/types.d.ts:1246-1279`（扩展探针 §6.2 已点名它是「一个宿主该向工具暴露什么」的成品清单）；ctx 那 12 个实核在 `:1267-1278`：`getModel / getScopedModels / isIdle / isProjectTrusted / getSignal / abort / hasPendingMessages / shutdown / getContextUsage / compact / getSystemPrompt / getSystemPromptOptions`。**别把它和 `DefaultResourceLoader` 混成一个东西**：后者是资源加载器，公共面是 `getSkills / getExtensions / getPrompts / getThemes / getAgentsFiles / getSystemPrompt* / extendResources / reload`（`dist/core/resource-loader.d.ts:57` 的 `extendResources` 与包生态调研 §2.4 一致）。我们**不装**扩展运行时，所以这里采纳的是**形状**，落在 `laneHost` 与 `LaneCommand` 上。逐条判定：

| pi 宿主方法 | 采纳？ | 落点 | 理由 |
|---|---|---|---|
| `setActiveTools` / `getActiveTools` / `getAllTools` | **采纳（内部）** | `laneHost` 按能力档 + 技能 `allowed-tools` 收窄 `activeToolNames`；`addedToolNames` 留给 G-09 的动态装载判断 | S7 的 ≤12 靠档位静态收敛 + 这条运行期收窄 |
| `sendMessage` / `appendEntry`（custom entry） | **采纳** | 已有 `appendCustomEntry`（§1.4 的命名空间规则） | — |
| `getContextUsage` / `compact` | **采纳** | 三行（§1.7）+ 手动「压缩」入口；`session_before_compact` 挂领域摘要指令（G-22：保住 anchor / shot / node id） | — |
| `abort` / `isIdle` / `hasPendingMessages` | **采纳** | `LaneCommand.abort` 已有；`isIdle` = `operation === null`；`hasPendingMessages` = `queues.length` | — |
| `setModel` / `setThinkingLevel` | **采纳** | 模型框换模型 → pi 写 `model_change` 条目（§5.5：别在 UI 记第二份当前模型）；档位由 `getSupportedThinkingLevels` derive | — |
| `getSystemPrompt` | **采纳（只读）** | 走查 / 评测取证 | — |
| `resources_discover` 事件（`types.d.ts:403-411`）/ `extendResources()` | **采纳形状，不采纳实现** | 技能索引的输入改成可注入的 `SkillProvider`（`formatNomiSkillIndex` 的输入不再直读 `skillStore`，[包生态调研 P-1](../research/2026-09-07-pi-package-ecosystem.md)）；`skillLibraryChanged`（PR #582 已加）触发 **下一次 run 边界**重建系统提示词（中途改系统提示词会打爆 KV cache，上游 [#9117](https://github.com/earendil-works/pi/issues/9117) 的「增量」还未发布） | 技能不都在磁盘上（skill hub 是已定方向） |
| `registerTool` / `registerCommand` / `registerProvider` / `registerFlag` | **不采纳** | — | 扩展探针 §4.2：factory 阶段拿满进程权限；Nomi 的工具面由契约唯一 owner 派生 |
| `ui.select/confirm/input/editor/custom` | **不采纳实现，采纳三层保险** | 我们的 UI 是 IPC 卡片；抄 `hasUI` 显式信号 + 无 UI 默认拒 | §1.2 |
| `exec` / `shutdown` / `newSession` / `fork` | **不采纳**（fork 远期） | — | fork 时 Nomi 命名空间的 value 会被 `branch` scope 丢弃（§3.3）——再一次证明领域状态不进 lane value |

### 3.3 `/v1/models` 带鉴权探测与退役 id 下架：接线点（先说已经在 main 里的）

**已在 main 的（PR `fix/model-generation-core-path-20260907` 系列）**：`radar:models` 加了 `apimart-llm` 泳道，**打的就是带鉴权的 `GET /v1/models`**（`scripts/model-radar.ts:17,264-302`，`WATCHED` 已含 `"text"` `:42`）；`RETIRED_APIMART_TEXT_MODEL_KEYS` 剪枝（`seedBuiltins.ts:331`）已下架 `deepseek-v3.2-think`。**所以母方案阶段 5 的「改抓带鉴权 `/v1/models`」这一条已经做完了。**

**同批实探推翻的前提**（[core-path 方案 §6](2026-09-07-model-generation-core-path.md)）：「列表说死了」的三个 DeepSeek id 里 **2 个今天还能用**；真死的那个 `deepseek-v3.2-think` 反而**列表里还在**——「列表 ≠ 可用性」在两个方向上都翻过车。这改变了「直接下架」的正确性，见 §7 岔路 3。

| 要接的 | 接线点（file:line） | 做法 |
|---|---|---|
| **应用内 reconcile**（不只雷达脚本） | 列表探测复用 `electron/ai/onboarding/modelListProbe.ts:148-160` `fetchModelList(providerKind, baseUrl, headers)`（已 `Model`-free）；key 走 `readCatalog()` → `decryptApiKeyRecord`（`catalogStore.ts:322` 那对调用的样子） | 打开模型框 / 每日一次：对每个有 key 的文本 vendor 拉列表，seed 过但**未列出**的 id 标 `unlisted` |
| **退役的后果** | `Model.enabled`（`types.ts:261`）经 `upsertModelCatalogModel`（`catalogStore.ts:562-567`）；删除走 `deleteModelCatalogModels`（`:580-593`）；全部在 `mutateCatalog` 事务下（`:747`） | `unlisted` → **自动 `enabled:false` + 模型框旁注「供应商已不再列出」+ 一键删除**（§7 岔路 3 推荐）；`legacy` 分层从「只排序」（`modelIdentity.ts:58-68` 单一调用点）升级为「默认折叠进『更多』」 |
| **存量安装** | seeding 是幂等 upsert（`reconcileModels`，`seedBuiltins.ts:596+`）——**从 seed 删 id 不会从用户目录删** | 退役必须走显式迁移（先例 `apimartTextMigration.test.ts:33`） |
| **活性 ≠ 列表** | core-path §后续：真判据是带鉴权的最小 `/v1/chat/completions`，**每个 vendor 的最小可调形状不同** | 先在 vendor 档案声明一条「最便宜的活性探针」（P4：档案声明槽，通用系统填），雷达按周批量跑；零额度夹具进 gates。**本阶段只做声明槽 + 脚本，不在应用内自动打付费探针** |
| **新鲜度戳 + 条件请求** | 一致性核对 §5.1：pi 用 `.manifest.json` 的 `generatedAt` + ETag | 雷达快照带 `generatedAt`；探测带 `If-None-Match` |

### 3.4 技能：SKILL.md frontmatter 唯一格式在 lane 里的注入路径与自动触发

**前置**：PR #580（frontmatter 成唯一清单，`skill.json` 删除，`check:skills-format` 33/33 零 diagnostics）与 #582（导入后 `skillLibraryChanged` 失效信号 + 拖拽）合入。

**今天的两条并存语义（P1 要消一条）**：① 索引式——`formatNomiSkillIndex` 把 name/description 放进系统提示词 + `load_skill` 工具按需读正文（`agentChatV2.ts:147`、`skillReadTransportAdapters.ts:51`）；② 整段式——`buildSkillSystemPrompt`（`agentContext.ts:75,88-96`）把**选中技能的整个正文**每轮拼进系统提示词。**留 ①、删 ②**：② 让「一个 30KB 的技能」每轮都占上下文，且与 `/skill` chip 语义重叠。

| 环节 | 做法 | 出处 / 理由 |
|---|---|---|
| **发现** | `SkillProvider` 可注入（§3.2 P-1）；磁盘根仍是 `getSkillDiscoveryRoots()`（`skillStore.ts:51`）；`skillLibraryChanged` → 下一 run 边界重建索引 | — |
| **注入** | 系统提示词里一段 `<available_skills><skill><name/><description/><location/></skill>…`——pi 的形状（`core/skills.js:275-298`），**标准化的 progressive disclosure** | Anthropic skills 最佳实践：只预载 name/description，正文按需（`https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices`） |
| **自动触发** | **就是 description**：模型读索引自己决定调 `load_skill`（这就是 Claude / pi 的「description 触发」机制，没有宿主侧分类器）。**保留显式 `load_skill`**（D-06：pi 靠 `read` 工具、文档自陈「models don't always do this」；Nomi 不给模型 `read`，技能正文也不一定在盘上） | 一致性核对 §1.16 / §4.6 |
| **强制内联** | composer 的 `/skill` chip = pi 的 `/skill:<name>`：这一轮把正文作为用户消息的一部分送进去（不是系统提示词） | `agent-session.js:983-1007` |
| **frontmatter 字段 → 我们的语义** | `name`/`description` 必填；`disable-model-invocation` → 不进索引；`allowed-tools` → 映射到 `metadata.nomi.requestedCapabilities`（**只能收窄**，`agentChatPolicy.ts:101-103`）；`metadata.nomi.*` 装 Nomi 独有项。⚠️ **`allowed-tools` 在 pi 0.85.1 里是「文档有、代码不读」**：`pi-agent-core/dist/harness/skills.js:214-235` 只解析 `description` / `name` / `disable-model-invocation` 三个字段。所以「`allowed-tools` 收窄能力」是**我们的语义**，跨宿主不通用——在技能文档里明说，别让作者以为写了它在 Claude Code 里也生效 | `https://pi.dev/docs/latest/skills`；包生态调研 §4.2 |
| **门岗补两条** | 正文 ≤ 500 行、引用只允许一级（Anthropic 最佳实践的两条硬数）；description 第三人称 | 进 `check:skills-format`（PR #580 已建） |

---

## 4. 贯穿

### 4.1 Anthropic 官方文档逐条对照（Context7 / 官方站当前版）

| 文档条目 | 出处 | 我们各阶段的设计 | 判定 |
|---|---|---|---|
| 工具名 `^[a-zA-Z0-9_-]{1,64}$` | define-tools §Specifying client tools | `laneTools.mts:19` 正则是它与 pi 正则的交集，注册处校验 | **一致** |
| 描述「by far the most important factor」、≥3–4 句 | define-tools §Best practices | S4 拆成 S4a（description）+ S4b（`promptSnippet`/`promptGuidelines`）；阶段 1 已实证描述通道起作用（六条里六条先 `read_full_text`） | **一致** |
| 「把相关操作合成更少的工具，用 `action` 参数」 | 同上 | 与 G-01 不冲突：`action` 是**扁平对象里的枚举字段**，正是我们的处方（根扁平 + `operation` 降成 enum + 分支字段 optional） | **一致** |
| `input_examples`（每例必须合法，20–200 token） | define-tools §Providing tool use examples | **有意不同**：示例写进 description（S5）——跨供应商；Anthropic 专有字段会被别家丢掉 | 有意不同 |
| `strict: true`（语法约束采样）+ 结构化输出的 schema 限制 | strict-tool-use；structured-outputs §JSON Schema limitations | **没想到 → 已补为 S12**（§3.1）：无数值/长度约束、`additionalProperties:false`。pi Unreleased 也在给内建工具默认开 strict-prefer；[#9263](https://github.com/earendil-works/pi/issues/9263) 说明兼容网关（APIMart 这类）可能要 strict **形状**但拒 `strict` **字段**——阶段 5 探针要抓一次出站报文看 pi 的 Anthropic 适配器发不发 `strict` | 没想到（已补） |
| tool_result 必须紧跟 tool_use；`is_error` 要写「怎么办」 | handle-tool-calls | G-16 的 run 边界规则（§1.4）；`ToolFailure.nextAction` + `throw`（G-02） | **一致** |
| 「不可信内容放 `tool_result` 里，别放 system / user text」 | 同上 §prompt injection | **没想到**：用户导入的原稿走 `read_full_text` 结果——已经在 tool_result 里；但 `/skill` 强制内联把技能正文放进 user text。登记为 9.6 那条已知缺口的一个具体子项，阶段 5 之后处理 | 没想到（登记） |
| tool search：≥10 个工具就该 defer；30–50 个以上选择准确率下降；3–5 个热工具保持非 deferred；`defer_loading` 保 prompt cache | tool-search-tool；tool-reference §defer_loading | **有意不同（机制）**：Anthropic 专有；pi 的对应物是 `addedToolNames` 动态装载（G-09）。**一致（阈值）**：S7 ≤12 与「≥10 就该 defer」同向；production 档 30 个工具**必须**走动态装载，静态合并压不到 12 | 一致（阈值）/ 有意不同（机制） |
| context editing `clear_tool_uses`（先清最旧工具结果、留占位） | context-editing | pi 压缩时把工具结果截到 2000 字符、绝不在 toolResult 上切（§4.3）；**「先清旧工具结果」这个顺序值得在 `session_before_compact` 里复现** | 一致（方向） |
| compaction API（服务端摘要、`pause_after_compaction`、`usage.iterations` 要汇总） | compaction | pi 客户端压缩；G-22 换掉「保住文件路径」那句领域错配；花费按 §3.5「跨压缩扫全量条目」 | 有意不同（客户端 vs 服务端；领域摘要指令是我们的活） |
| skills：name ≤64 小写连字符、description ≤1024 第三人称、正文 ≤500 行、引用一级 | skills best-practices | §3.4 两条进 `check:skills-format` | **一致**（补两条门岗） |
| MCP：注解**不可信**除非受信服务器；SHOULD 有人在环、展示输入再调用 | MCP spec 2025-06-18 §Tool / §Security | Nomi 是 MCP **服务器**：我们**发**注解（§3.1 派生）；作为消费方（内部 lane 不吃 MCP 工具）不适用。写死一条：**hint 只能抬高摩擦、不能降低**（Codex 的读法） | 一致 |

### 4.2 验收矩阵：从阶段 1 的「两个数字」长成每阶段的门

| 指标 | 定义 | 阶段 2 前 | 阶段 3 前 | 阶段 4（切换）前 | 阶段 5 前 |
|---|---|---|---|---|---|
| **工具一次写对率**（R30） | 回合内**第一次**工具调用非错 / 首调数 | loopback 8/8 ✅ · 真实 8/8 ✅（document） | 22 个能力 loopback 全 ≥ 95%；真实 `canvas.write` ≥ 90% | 同左 + 审批介入臂不降 | MCP profile 同一套剧本经 `tools/call` 跑，数字与 internal 相等 |
| **回合成功率**（R30） | 收尾文字出现 **且** 领域终态符合预期 | 8/8 ✅ | 5 任务 × 3 次 ≥ 阶段 2 基线 | 同左 | 同左 |
| **五段归因**（雷达 §2） | 失败归到 工具选择 / schema 落地 / 参数绑定 / 输出处理 / 端到端 | — | 每次失败必归段；「输出处理」段 = 0 | 同左 | 同左 |
| **影子一致率** | L1 剧本 + L2 回放（§2.3） | L1 4/4 ✅ | L1 15+ 剧本 4/4 | **L1 + L2 200 回合 100% · 连续 7 天** | — |
| **冷重启一致**（G3） | close → reopen → 投影逐项相等 | 7/7 ✅ | 含审批/任务卡 custom entry | 200 个回放会话 | — |
| **花费准确度**（G5′） | `costUsd` 与供应商账单同量级；三态正确 | — | 三夹具三态 ✅ + 单位单测 | 真实闭环里花费与账单对得上 | — |
| **429 不死**（G4） | 三事件 + 面板重试行 + 最终成功 | — | ✅ | — | — |
| **看门狗**（G3c） | 卡住的流在 90s 内结束 | — | ✅（今天红） | — | — |
| **62 张基线** | `check:design-lab` 零改动 | ✅ | ✅ | ✅（夹具改源后仍零改动） | ✅ |
| **真实短片闭环**（G1） | MiniMax H3 1–2 分钟，打包版，截图人眼 + 情绪日志 | — | — | **必须**，切换合并前 | MCP 宿主（Claude Code）出一条同样的片 |
| **框架债** | `check:framework-boundary` 债数 | 14 | 14（不增） | **0**（G7） | 0 |

### 4.3 最可能逼我们再返工的五处 + 现在就能做的便宜探针

| # | 返工风险 | 为什么会返工 | 便宜探针（零额度，各 ≤ 半天） |
|---|---|---|---|
| **P1** | **审批停在 `before_tool` 里等：abort 穿不透 / 崩溃恢复形状不对** | §1.2 方案 A 押在「钩子里可以无限 await 且 abort 能穿透」上。0.85.1 实核已经回答了一半：抛异常 = block（`hooks.js:113-118`）、钩子拿得到 operation 的 `abortSignal`（`hooks.js:40-47`）但 **pi 不替我们打断等待**。剩下没跑过的是：等待期 `LaneSnapshot.operation.status` 是不是一直 `running`、`inspectExecution` 报什么、崩溃后 `resume()` 对「停在预检里」的调用给什么 | 20 行 harness 测试：钩子 `await Promise.race([never, abortSignal])` → ① 断言 `operation.status === "running"` 且 `runningTools` 为空 ② 调 `lane.abort()` 断言 race 被打断、得到 `abortedOutcome`、`AbortResult` 带回未消费的 steer ③ 不 close 直接丢 harness → 重开 `resume()`，断言得到 `interruptedOutcome`/合成错误而**不是**重跑。**③ 红 = 恢复文案改；① 红 = 翻到 §1.2 方案 B** |
| **P2** | **旧对话导不进新会话** | §2.1 第一档假设「`AgentLane.appendMessage` + `appendCustomEntry` 能逐条回填」可行（`agent-harness.d.ts:641-642`）；未验的是：toolCall/toolResult 成对追加会不会被 pi 的顺序校验拒收、压缩条目改写成用户消息后模型上下文是否仍连贯 | 拿一份真实 `agent-thread-context-v1.json`，40 行脚本：`openLane` → 逐条 `appendMessage`/`appendCustomEntry` → `close` → `open` + `watch`，断言段数与顺序 = 源文件；再跑一轮 loopback 断言供应商收到的历史里 toolResult 紧跟 toolUse。顺带验 [#8939](https://github.com/earendil-works/pi/issues/8939)（无 header 行）的错误路径是明说而不是静默 |
| **P3** | **lane 无看门狗 + 超时被归成 `aborted` 永不重试** | §0 的新实核：`observeNativeStream` 只在旧路；即便挂上，`fail()` 走 `controller.abort(error)` 大概率产出 `aborted` | loopback 首字节永不返回：① 断言 lane 今天**挂死**（阳性对照）② 挂上看门狗后断言 90s 结束 ③ 断言 stopReason 与 `retry_scheduled` 是否触发。三个断言就是 G3c + G-11 |
| **P4** | **花费行重做完还是空的**（用户抱怨三次的那行） | catalog 没有 token 价的类型（§1.7）；`model.mts:72` 全零；单位还有 per-million × 币种两重坑 | 写 `Model.tokenPricing` 类型 + 从它派生 pi `Model.cost` 的 20 行 + 一条单测：给 DeepSeek V4 Flash 填官网价，跑一次 loopback 回合，断言 `stats.usage.cost.total` 在 $1e-6 ~ $1e-2 之间且与手算相等 |
| **P5** | **根级扁平化后 `canvas.write` 的 25 个可选字段撑爆 S7 / 模型还是选错分支** | G-01 的处方（operation 降 enum、分支字段 optional）没量过 token 与选对率；HEART 论文说的「schema 解析收进工具内部」是另一个方向 | 用 `laneToolSchema` 生成扁平版 `nomi_storyboard_write` schema：① 数 token（≤ 1 200）② 3 条 loopback 畸形参数经 `prepareArguments` 通过 ③ 3 次真实调用（≈ ¥1，评测额度默认授权）看首调是否命中正确 operation。红 = 阶段 2 改成「三个工具各自扁平、无 operation 字段」 |
| **P6**（附） | **设计实验室 62 张基线在夹具改源时全红** | 44 个夹具是手写宿主 items；改成 `LaneSnapshot` 后任何投影差异都以基线红显形，而门岗文案会诱导「更新基线」 | 先改 3 个夹具（空态 / 单工具 / 审批卡）跑 `check:design-lab`；红了就是投影错，修投影不动基线 |

### 4.4 AgentHarness 是 pi 自己 coding agent 都没用的层：「继续 A / 阶段 2 后翻 B」更新判断

**结论：继续 A。** 但把「翻 B」的触发条件写死，不靠感觉。

阶段 1 的实证（母方案 §11.4 / §11.6）：harness 上真起 lane 跑真模型 8/8 · 冷重启 7/7 · 影子 4/4 · 151 条旧测试全绿；`LaneSnapshot.runningTools` / `streamingMessage` / `stats` / `retry` / `queues` 形状全部按类型面兑现。上游最近两周：0.85.1 仍是 latest、无回退发布；与 harness 直接相关的 open issue 三条——[#6451](https://github.com/earendil-works/pi/issues/6451)（投影路径漂移，**我们只读 `LaneSnapshot` 一条路，不受多路径漂移影响**）、[#9221](https://github.com/earendil-works/pi/issues/9221)（reload 中工具结果记错——§1.5 已把恢复文案改成以领域收据为准）、[#8826](https://github.com/earendil-works/pi/issues/8826)（退避无上限——3 次上限下无感）。**没有一条是「harness 路径不能用」级别的。** 风险形状仍是一致性核对层 3 那句：**我们是这条路上最早的重度用户，坑要自己上报自己等**。

**翻 B 的三条触发（任一命中即在下一阶段边界重判，不在阶段中途翻）**：
1. `radar:upstream`（一致性核对 §6）报 harness 的 `LaneSnapshot` / `before_tool` / `appendCustomEntry` 任一签名**无迁移路径地**破坏性变更，且连续两个版本；
2. §4.3 探针 P1 或 P2 红，且绕法要在 harness 外再写一层 > 300 行（那就是 B 的形状了）；
3. 上游把 `AgentHarness` 标 deprecated 或 [#9042](https://github.com/earendil-works/pi/issues/9042)「让 harness 成为 canonical」被明确拒绝。

**A 下的保险**：`laneHost` 保持薄（今天 152 行），pi 类型只在 `.mts` 岛里出现（`laneContracts.ts:3-6`）——翻 B 时换的是岛内三个文件，岛外契约不动。

### 4.5 与三份外部 PR 的接口：各自在新通路上的落点与阶段

| PR | 它是什么 | 新通路上的形状 | 阶段 | 审批档 |
|---|---|---|---|---|
| **#573 生成策略解析器**（`feat/generation-strategy-resolver-20260907`） | 确定性纯函数引擎：按真实模型档案逐镜校验/钳值，产出合并/拆条/阻断建议；已接成 `nomi_generation_plan` 的 `resolve` operation（stateless、**无 lease 可跑**）；GUI 与 agent/MCP 共用同一引擎 | **Agent 写分镜时的决策工具**：在 §3.1 的同源投影里它是 `generation.plan` 契约的一个**读类别名** `nomi_generation_resolve`（一别名一工具，不再是 `operation:"resolve"` 分支——G-01）；`execution.mode:'parallel'`；`promptGuidelines` 一句「写分镜行之前先 resolve，把阻断当硬约束」（S4b）。结果 `content` 给模型建议列表 + 机器理由，`details` 给面板的「为什么」 | 阶段 2 收进契约；阶段 5 同源投影（MCP 侧继续无 lease，与今天一致） | 读类：`auto-granted` |
| **#564 手艺产物节点**（`feat/agent-artifact-node-20260906`） | 画布新 kind `agent-artifact`（SVG / HTML 沙箱 / 表格 / Markdown / 3D 摆位），不调模型；P1 里明写「**Agent deliver 落盘工具**」是端到端交付的前提 | 新契约 `canvas.artifact.write`（`effect:reversible_write`，`effectClass:reversible_local`，`replay:'never'`）；模型面别名 `nomi_artifact_deliver`，扁平 schema：`fileType(enum) / title / body / anchorNodeId?`；结果 `content` 只回 `nodeId`（模型下一步要用），`details` 回渲染元数据。撤销走 G5 收据（搬家后的 `capabilityCore` owner） | 契约在阶段 2 尾或阶段 3 初（依赖 #564 合入）；承接点是 §2.2 G13 同一批加的 `LanePart` 扩展 | `safe-auto` 下首次弹卡 →「本会话允许这类」 |
| **#572 深度视频处理节点**（`codex/plan-video-depth-canvas-node-20260906`） | 本地 WebGPU 逐帧深度/骨架，输出可当 `video_ref` 的资产；一跑几十秒到几分钟 | 两条：① 建节点 = `canvas.write` 的一个扁平工具 `nomi_canvas_add_process_node`（kind 枚举含 `video_depth_process`，参数来自 `videoDepth.ts` 的 zod settings——同一份 schema 两处用，P1）；② 跑处理 = `generation.control` 家族的本地作业，**长工具**：`execute` 用 `onUpdate` 推进度（一致性核对 §1.17）+ 契约 `timeoutMs` 按分钟级（D-02）+ 任务卡 `nomi.ui.task` 按 jobId join | 阶段 3（长工具进度 + 超时 + 任务卡）；阶段 5 标 `mcp_safe` 带 lease 对外 | 本地不花钱：`reversible_local`，「本会话允许」 |

三份的共同接口约束：**都不新增描述符形状**——它们各出一个契约 + 若干扁平别名，进同一个 `projectTools`。谁先合谁先接，接的顺序不影响阶段 4 的切换清单（三者都不依赖 `projectAgentHost`）。

---

## 5. 六角色评审（R7）

**CTO**
1. 本文最值钱的一条是 §0 那句「新通路没有看门狗」——它是阶段 1 全绿之下的一个真空，loopback 永远不卡所以永远测不出。P3 探针必须先做，它给 G3c 一个先红后绿的阳性对照。
2. §2.4 裁决 C 我认。「留旧路可回退」的真实代价不是多一份代码，是**两个写入者**——那是我们正在治的病。四个前置 PR 把原子 PR 瘦到能评审的体积，这比争论「一刀还是两刀」有用。
3. §4.4 把「翻 B」写成三条触发而不是感觉，这样阶段边界上的重判是机器化的。要求：`radar:upstream` 在阶段 3 之前落地，否则触发条件 1 没人量。

**设计**
1. §1.3 那张「有卡在等时打字 = 回答这张卡」的表是本文对用户体感最重要的决定。它省掉一个「你是想回答还是想排队」的追问，但代价是次选按钮必须显眼。样张要画「卡 + 输入框 + 次选」三件在一屏的关系（P5/R8）。
2. 三行三态（§1.7）与「思考行不画 0」是同一条原则，这次终于写成了判据。`cancelQueued` 的 `already_consumed` 单独文案（§1.3）也是同族。
3. G3 排队「暂停」丢弃（§2.2）我接受，但面板上不能出现一个灰掉的「暂停」——要么没有那个控件，要么有且能用。

**PM**
1. 三个「无承接点」里，G5 收据不删是本文改掉母方案的一处（母方案 §4.2 把整个 `projectAgentHost/` 划进删除）。理由充分：MCP 在写它。这条要在切换 PR 描述里明写「保留 4 文件、搬家」，别让人对着 52 减 48 的数字找不同。
2. §3.3 承认母方案的「改抓带鉴权 `/v1/models`」已经在 main 里做完了——不重做，只做剩下的活性探针与应用内 reconcile。这是 D3「叫某东西是缺口前先看现状」。
3. 阶段 5 的 MCP 真实闭环（Claude Code 当宿主出一条片）与阶段 4 的 G1 是两次独立验收，别合成一次。

**前端**
1. 前置 PR ④（夹具改源）我最想先做：它让实验室成为新通路的第一个消费者，而且 62 张基线是我们唯一能证明「投影没改设计」的东西。P6 探针只改 3 个夹具就能知道方向对不对。
2. `LanePart` 要加 `task` 与 `pending`（审批等待）两种，但 `pending` **不进 transcript**（§1.2）——它是 `LaneProjection` 顶层字段，不是段。这条别写歪。
3. `laneClient` 仍然零状态机；审批的四个动作是四条 `LaneCommand`（`approveOnce / approveSession / deny{reason?} / abort`），身份仍由主进程铸造。

**后端**
1. §1.6 那张表回答了我在母方案里提的问题，而且比我想的更糟：不是「两套超时会打架」，是**新路一套都没有**。挂进 `createNomiProvider` 让新旧共用，阶段 4 删旧路时它自然留下。
2. G-12 厂商错误归一必须在 provider 适配器做，一条上游正则都不改；喂真实报文的单测里要有 402 / 余额不足 → **不重试** 的反向用例，否则余额耗尽还烧三次。
3. §1.4 规则三（投影进上下文的条目只在 run 边界追加）我要求做成断言：注册了非 `undefined` projector 的 customType，在 `operation !== null` 时调用 `appendCustomEntry` 直接抛。R28：让结构拦住，别靠人记得。

**真实用户**
1. 「它要动我的东西先问我，我打一句『不对』它就改」——§1.3 就是我要的，别让我在两个按钮里猜哪个是「回答」。
2. 旧对话顶上那行「按当时写入的先后显示」我看得懂，比「顺序可能不对」强。工具参数没了也没关系，我从来没看过那些。
3. 花费那行你们说了三次要修好。这次 P4 探针要是绿了我就信；要是重做完还是空的，我不会再看那一行。

---

## 6. 体量与顺序（含并行/串行）

```
                       ┌── 前置 PR ①②③④（零行为变化，各可独立 revert）──┐
阶段 2（在途）──►      │                                                   │
                       ├── 3a 审批闸 + 状态机 + 四条命令（依赖 P1 探针）      │
                       ├── 3b 三行 + tokenPricing + 单位单测（P4 探针）       ├──► 阶段 4 原子 PR ──► 阶段 5b/5c 收尾
                       ├── 3c 看门狗 + 重试 + 错误归一 + 超时 + 回合上限（P3）│         （§2.3 六行 + G1）
                       ├── 3d 队列/steer/abort 贴回 + 任务卡承接点（G13）     │
                       ├── 5a 同源投影 + S12 + 付费闸单点（与 3 并行）        │
                       └── 5b 目录活性探针声明槽 / 5c 技能注入（与 3 并行）──┘
```

| 阶段 | 体量（数量级） | PR 数 | 串/并 |
|---|---|---|---|
| 探针 P1–P6 | 6 个脚本/测试，各 ≤ 半天，总 ≈ 300 行测试 | 1（进仓库当阳性对照） | **先于一切**，一天 |
| 前置 PR ①–④ | 删 ≈ 1 000 + 搬 ≈ 800 + 夹具 ≈ 600 | 4 | 与阶段 3 并行；④ 依赖阶段 2 的投影稳定 |
| 阶段 3（3a–3d） | 新增 ≈ 2 500 行（含测试）；删 `run.mts` 第三层步数防线 | 3–4 | 3a 依赖 P1；3b/3c 与阶段 2 并行；3d 依赖 3a |
| 阶段 4 | 删 ≈ 11 000 / 增 ≈ 1 500（迁移 + IPC 注册 + 渲染层换 store） | **1**（原子） | **串行**：等 3a/3b/3d + 前置 ①–④ + §2.3 六行 |
| 阶段 5a（同源投影） | 改 `agentCapabilities` ≈ 10 文件 + 删三处手写映射 + 折两个手写付费工具 | 1 | 与阶段 3 并行；**须在阶段 4 之前合**（否则阶段 4 删 `modelToolSurfaceManifest` 的消费者时它还在两处表达付费边界） |
| 阶段 5b（目录） | 声明槽 + reconcile ≈ 400 行 | 1 | 任何时候 |
| 阶段 5c（技能） | 删整段式 ≈ −200，索引可注入 ≈ +150 | 1 | 依赖 #580 / #582 合入 |

**必须串行的只有两条**：阶段 4 在 3a/3b/3d 与 5a 之后；3d 在 3a 之后。其余全部可并行。

---

## 7. 只留真岔路的 R3 表（三条）

### 岔路 1 · 审批停在钩子里等（A），还是先拒掉、批了让模型重来（B）

**背后的逻辑**：见 §1.2。**要权衡的那一个东西**：A 一张卡对一个动作、不多花模型钱，但「它在等我」这个状态 pi 不认识、崩溃时这次调用没跑；B 转录每次完整往返，但每次审批多一轮模型请求且重发的参数可能漂。
**推荐 A**（三家参考实现全是 A 的形状；B 是今天宿主的形状，用户撞到的噪音正来自它）。**为什么必须用户拍**：它决定转录的形状与每次审批的钱，切换后回不去。

### 岔路 2 · 切换 PR：一刀（C = 原子 PR + 四个零行为前置 PR），还是两步留旧路 N 天

**背后的逻辑**：见 §2.4。**要权衡的那一个东西**：「可回退」靠 revert + 数据 archive（一刀），还是靠运行期开关（两步）——后者意味着两个写入者写同一份对话，切回去时新路那几天的对话旧路读不到。
**推荐 C**。**为什么必须用户拍**：同事给了相反建议，且这是不可逆取舍（删了 9 751 行）。

### 岔路 3 · 退役模型：「直接下架」（母方案原话），还是「自动禁用 + 旁注 + 一键删」

**背后的逻辑**：09-07 实探（core-path 方案 §6）证明「列表说死了」在两个方向上都错过：2 个被判死的还活着、真死的那个列表里还在。自动**删除**一个误报 = 用户配置静默丢失；自动**禁用**可逆且旁注说明原因。**要权衡的那一个东西**：目录干净（下架）vs 误报可逆（禁用）。
**推荐禁用**。**为什么必须用户拍**：「直接下架」是用户 09-06 的原话，本文在反转一条已拍板的决定，必须明着问。

---

## 8. 本轮交付边界

- 本轮**只产出本文档**（docs-only PR，不合并）。一行产品代码未改。
- 本文对 pi 的所有断言都在 **`0.85.1` 的 `dist/*.js` 实现**上核过（不是 `.d.ts`）。写作期间一份并行的源码调研把 `node_modules/.pnpm/` 里残留的 `0.84.3` 当成了安装版并据此判定「harness 是空壳、无 `before_tool`」——那对 0.84.3 成立、对本仓锁定版不成立（`package.json` `pnpm.overrides` 六个包全部 `0.85.1`，`dist/harness/agent-harness.js` 558 B、`HarnessNotImplemented` 零次）。记一条：**读 pi 源码先 `node -p require('…/package.json').version`，再 `grep -R`（`-r` 不跟 pnpm 的符号链接）**。
- 拍板 §7 三条后：先跑 §4.3 六个探针（一天），再按 §6 的图开工；探针红的那一格直接改本文对应节，不另开文档。
- 自媒体来源（TikHub）：本文为运行时内部方案，未查，理由见「先查别人」表末行。
