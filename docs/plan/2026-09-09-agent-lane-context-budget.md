# Agent lane 上下文预算与技能加载（B1b）

状态：B1b-finish 交付中。基线 `5fba6d571`，沿用原分支与 PR #646；用户已明确授权先按簇提交，再本地 merge 最新 `origin/main`，完整 gates exit 0 后推送原分支。不新建 PR、不重新打包。

## 问题与证据

C58/C59/C60/C61 已逐条读取。只读 R71mJo 的 pi v4 JSONL（逐行解开事务数组）得到 24 个 nomi.input、63 条 usage；首回合模型目录 89 项（image 37、video 35、text 17）。完整目录是每条历史用户消息的投影，因此每轮既增加目录，又让之后的全部请求重读它。压缩未配置；切组同时改变工具与系统提示两处前缀。C60 自动换模型和 C61 新话题 UI 不在本批；本批负责成本阈值与压缩后的上下文连续性。

## 先查别人

| 参考 / 规范链接 | 稳定段与动态段 | 压缩 | 技能加载 | Nomi 裁决 / 偏差理由 |
|---|---|---|---|---|
| [Claude Code 官方运行机制](https://code.claude.com/docs/en/how-claude-code-works)、[Skills](https://code.claude.com/docs/en/skills) | 持久规则放 CLAUDE.md；请求和工具结果进入会话 | 接近窗口时清理工具输出、再摘要；Compact Instructions 控制保留内容 | 会话开始只看 descriptions，使用时才读正文 | 同样分离稳定索引与历史；视频创作长会话需要比最大窗口更早压缩以限制成本 |
| [Codex CLI compact.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/compact.rs) | compact 请求使用 base_instructions（实读源码 :288）；用户历史另组装 | 受 token limit 控制重建压缩历史（:676–700） | [官方 skills 文档](https://developers.openai.com/codex/skills) 定义渐进披露 | 目录作为 base context，不逐回合重复；保留任务引用 |
| [pi system-prompt.ts](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/system-prompt.ts) :44–67,160–162；[compaction](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/compaction.md) | 身份、工具、技能索引一次组装；动态消息走历史 | `contextTokens > contextWindow - reserveTokens`，keepRecentTokens 留近期，摘要逐次更新 | `formatSkillsForPrompt` + 原生 `read`，读工具存在才注入技能 | 保留原生 read 和 SKILL.md；未解锁 coding 时只允许真实安装根目录；没有格式分叉 |

Context7 `/earendil-works/pi` 已查询；实际安装版本 0.85.1 的 `harness/compaction/compaction.d.ts:31–38`、`agent-harness.d.ts:582–591,629` 是本次 API 准据，CLI 的 session_before_compact 不是 harness hook。不引入依赖，不重写压缩器和转录。

## 实施约束

1. 模型索引以类型分区、modelKey + 默认 modeId + 模式档位简表进入稳定系统段；text 只给当前对话模型。更详细的槽、参数及其它类别通过现有 `nomi_read target=models`。不删除任何目录数据、模式或供应商偏好；只改模型可见投影。分镜/画布只需 image/video。用户消息只记录相邻目录的增量，历史投影必须可重算，禁止易失的“上回合目录”副本。
2. `OpenLaneOptions` 提供 tokenBudget，默认 80,000。通过 pi 原生 compaction 设置与公开 hook 实施成本阈值，保留近期上下文与最新目录/分镜/画布引用。模型真实窗口与价格不伪造；小窗口安全余量仍有效。
3. 真实 schema 基线：常驻 4,619；加 coding 5,728；加 media 5,683；加 timeline 6,544；加 maintenance 4,740；加 generation 6,116；加 production 6,300；全组 12,016 token。全组常驻或无限累计都会越 10k，拆子组本身不能降低最终总量。已请求裁决：超预算时明确压缩重建前缀，或全组无损瘦身后常驻。确定前不改变此路径。
4. 常驻 read 原生工具；真实路径检查限制技能包，coding 解锁后才能读项目。`details.skill` 是结构化结果，B5 负责显示。删掉要求先 coding 才读技能的描述。12 个常驻工具门槛不抬，优先把范围时间轴检查归回 timeline 组，基础 read_timeline 留常驻。

## 根因与边界

归类 recurring：桌面 prompt、steer/follow-up、恢复旧会话和不同供应商共用同一投影/装配边界。缺失不变量是“稳定元数据不能作为每个用户回合的增量；工具可见性不能隐式扩大文件权限；压缩必须在成本预算内保留可恢复任务引用”。修在 lane 输入投影、原生工具装配和 pi 配置处；不动分镜/画布数据层。

## 验收与回滚

先跑新夹具并留失败输出，再改生产代码。24 句真实回放总输入下降至少 60%、每轮新增 <2k，目录新增/失效可见；跨预算产生真实 compaction entry，标题引用恢复原节点 id；切组前缀稳定；常驻读技能成功、src 和链接越界失败；R30 三回合 DeepSeek 总预算 ≤¥1，报新增输入、技能加载和档位 8/8，失败如实记录。完整 gates 排锁 exit0 后正常 hooks commit/push 原分支；SWITCH-LAST 顶部 ≤20 行并复制指定 scratchpad。回滚通过本批 scoped commits，不修改旧转录。

## 六角色复核（实施约束复核，不代替真实模型验收）

| 视角 | 结论及约束 |
|---|---|
| CTO | 不增加转录存储或压缩算法；只用 pi `setCompactionSettings`、`before_compaction`、`compact`，配置读写幂等。目录差异从相邻的持久化输入重算。 |
| 设计 | 本批只产出 details.skill；B5 决定中文加载标签。没有新 UI，不引入样张偏差。 |
| PM | 模型目录只裁模型可见索引，不删除配置；失效在下一回合明确标记；试拍不得冒充媒体已生成。 |
| 前端 | 不碰分镜/画布状态 owner；范围时间轴读取只调整可见分组，继续走原 typed timeline port。 |
| 后端 | read 的 access/readFile 都先做 canonical skills-only 检查；恢复旧 lane 必须补齐新常驻工具；不能拿文件路径授予 coding 权限。 |
| 真实用户 | “重新拆一遍”能看到既有方案和模型变更；压缩后按镜头标题仍能找回节点。端到端 loopback 已覆盖，模型是否遵守需 R30 数字确认。 |

## 实施中证据

- `agent-lane-b1b-evidence/red.log`：目录系统段缺失、常驻 read 缺失；初次 fixture 环境错误已修正后重跑，只保留断言红。
- `agent-lane-b1b-evidence/compaction-red.log`：百万窗口、81k usage 不触发摘要。
- 24 回放口径：真实 HTTP 请求体用 pi `estimateTokens` 统一量新旧；旧侧重建 HEAD 的每用户消息全量目录投影，不把 loopback 的模拟 usage 冒充供应商实际 token。首调需区分固定宿主/工具前缀与本次新增目录；后续增量为本次首调输入减上一回合末调输入（净新上下文另扣除上轮输出）。
- 目录进一步合并同一模型同档位的模式，保留大小写和默认模式；完整 89 项目录的发现索引约 777 pi-estimated token（含 text 当前模型后略增），完整模式参数仍可按需读取。
- 发现 `nomi_read(models)` 原来只有 MCP 可用，现有 lane 缺入口；新增 lane 原生只读投影，沿用 target=models 与 modelKey 身份，在 models 组按需打开。原模型数据未改。
- 暂存/提交/推送尚未执行；切组超预算策略等待任务内澄清，不把当前 C58/C61 绿当作 C59 全部完成。

## B1b 原实施轮交付阻断（历史记录）

完整 gates 已结束 exit 1；76 contracts 唯一阻断为 check:vocabularies。验证期间共享 origin/main 前进至 d3fa25888，旧 productionShotActions ToastKind 债在该基线已删除；本分支未合 main（任务明确禁止），未触碰词表基线。传输/成本补验21/21，lint、生产与测试类型检查通过。全量 test/build 未执行，无 commit/push。C59 工具策略仍待裁决，R30 仍为2/3，不宣称完成。

## B1b-finish 收尾授权与交付

2026-09-09 用户任务书覆盖原来的禁止并 main 限制：按簇正常 pre-commit 后，执行 `git fetch origin && git merge --no-edit origin/main`，冲突以 main 为准并保留 lane 意图；完整 `python3 scripts/with-gates-lock.py -- pnpm run gates` exit 0 才可正常 push 原分支。不使用 update-branch、不新建 PR、不绕 hook、不 force-push、不重新打包。C59 切组属于 B1c，排除在本批；真实模型试拍任务失败仍按原证据报告。

首次 delivery:preflight 因本批既有未提交文件返回 dirty_worktree；按任务书明确顺序先提交，随后重新核对并线与干净身份。既有 19 个已修改文件及新模块/夹具/证据均按本批归档；原始红绿日志一并交付，避免 README 引用只存在本机的 ignored 文件。大夹具单独提交，以满足 Ponytail 每笔 150KB 上限。

### 本地并线冲突裁决

并线前 HEAD `1a1dc601e`；fetch 后 main 为 `d3fa258883c6db9cf6565be6699c0f92cf4fbe2b`，merge-base `f708568df`。

- `scripts/vocabularies-baseline.json`：采用 main 删除 productionShotActions ToastKind 债的决定，保留 lane 的 registered/converged 变更；两边已消除的债均不复活，debtCap 按合并后实际 debt 条目数收紧为 70，未提高门槛。
- `src/workbench/NomiStudioApp.tsx`：保留 main 新通知策略、project feedback 清理及展示；冲突 import 保留 laneClient/laneReceiptClient，不恢复已删除的 projectAgentClient/projectAgentProjectionStore；焦点事件随 main 归入 useProjectNotificationTarget，删除 App 已不使用的两个焦点 import（实扫 hook 保留节点聚焦路径）。

正常 pre-commit 完成 merge 后运行完整 gates；日志 `.tmp/b1b-finish/gates.log`，最终提交/推送身份写入 ignored `SWITCH-LAST.md` 和指定 scratchpad 收据。

### 并发 main 前进后的追加并线（#683）

首次完整 gates 于 `bdba2ed56` exit 0（76 contracts 零阻断、Vitest 11828/2 skipped、runtime 394/394、build 通过）。首批正常 push 已到 `e07781284`。交付期间 fetch 发现 main 从 d3fa25888 前进至 `ad95ab47e`（#683），暂停后续推送，追加本地 merge 后重跑完整 gates。

- `agentPanelV4LabHost.tsx`：保留 laneClient 真宿主注入，采纳 main 的 editingPanelLayout.assistantWidth 唯一宽度 owner。
- `agentPanelV4.ts`：保留 lane 历史/队列文案，采纳 main 删除 brand/logo 文案；两种语言一致。
- `residentShellDisplay.ts`：保持 lane 的精简显示边界，不复活依赖旧 ProjectAgentItem 的 residentItemClassName。
- `AgentPanelV4Message.tsx`：保留真实思考正文展开、streaming 和观测计时；采纳 main 的 V4Row/V4Shimmer，删除重复高光动画与尾部 spacer。
- `agentPanelV4Projection.ts` 与其测试：保持删除；新面板继续从 laneViewModel 获取投影。
- `agentPanelV4Types.ts`：toolCallId 行操作身份和 main 的可选 turnId 计时身份并存，各司其职。
- `useAgentPanelV4Data.ts`：保持 laneViewModel、lane 审批与队列；不恢复旧 Host turn/queue/projection。
- `agentPanelV4Collapse.ts`：保留 main 新过程聚合，仅将旧 Host turn 类型改成实际读取的最小字段形状。lane 未提供历史 turn 时不伪造耗时。
- `b2cFormFixtures.tsx` / `06-b2c-form.tsx`：新样张复用 V4ToolStatus，计时夹具显式给定三字段，不依赖已删除的 Host 合同和旧 labHostState.turns；样张数据和像素预期保持。

应用 tsc exit 0；后续完整门岗、测试、设计实验室及构建日志 `.tmp/b1b-finish/gates-latest.log`。
