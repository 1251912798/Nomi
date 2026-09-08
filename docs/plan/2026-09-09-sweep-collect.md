# 一次扫全：记录并继续与完整证据

状态：已实现，完整 gates 通过，待 PR 评审。范围 tests/ux、scripts、本文；package.json 仅注册 sweep 命令及其验证入口。生产代码、C0 原断言与预算不变。回滚撤回任务提交；不迁移用户数据。

## 先查别人

2026-09-09 通过仓库 .mcp.json 的 Context7 HTTP tools/call query-docs 查询 /microsoft/playwright，并直接核对官方文档。

| 方案 | 它提供什么 | 我们还缺什么 |
|---|---|---|
| [BrowserContext tracing](https://playwright.dev/docs/api/class-tracing) | 浏览器动作、截图时间线、DOM 快照、network；[Electron context](https://playwright.dev/docs/api/class-electronapplication#electron-application-context) 返回 BrowserContext | 业务 store、主进程模型请求、原生 pi 转录、费用与断言 |
| [expect.soft](https://playwright.dev/docs/test-assertions#soft-assertions) | Playwright Test runner 内失败继续并使测试失败 | 独立 Node 走查不支持；本任务保留 runner，只在断言边界记录 |
| 现有截图等待入口 `tests/ux/_assert.mjs:532` | screenshotSettled 等待画面稳定并保存截图 | 不含动作/网络轨迹；只复用每站截图，轨迹仍用 tracing，不自建录像器 |

保留已安装 Playwright 1.60.0；直接 start({screenshots:true,snapshots:true,sources:true}) / stop({path})。不安装 SDK、不拆框架 internals、不自建录像。trace 不声称包含模型隐藏思考；只保存实际收到的原生思考块。console 的渲染/主进程边界分开记录。原生转录只拷贝真实文件，缺失即 deviation，禁止由 UI 消息重建冒充。

框架四列表：它提供 tracing/expect；我们用公开 context/tracing/expect；我们另写领域站点记录与 repair；未拆散框架。公开接触字段只有 screenshots/snapshots/sources（常量 true）、path（按 case 派生）。没有新框架或生产接入层。规范采用 Playwright trace.zip、pi 原生 JSONL；仓内 deviation 是测试报告，不是外部互通协议。

## 根因与边界

按 root-cause-remediation 流程分类 recurring（测试机制，不涉及生产修复）。症状：C0 首次失败使后续站完全不可观测。直接原因：step catch 重抛；类根因：验收 fail-fast 和探索 collect 未区分。实查 C0.step、_assert 的导出 expect、agent-runtime-walk-support.finalizeRuntimeWalk：都以首错终止或最终失败处理。共享断言边界保留默认 fail-fast；显式 collect 会记录每次失败，站边界捕获不可执行动作，repair 前保全证据。修补不算通过，后续站标 reachedViaRepair。失败的探针证明不得生成有效 provenBy。

## 实施与验收

- 共享 collect session 与断言适配；站点上下文隔离；所有 deviation 包含断言/期望/实际/时间/证据/repair。
- 每个 case/input 独立 profile 和 trace；每站截图、payload、费用增量、时间、情绪日志；Agent 原生转录与工具调用、R30 原始 n/d。
- cases.json 增加 surfaces/inputs；原 stage-4/gap 保持不跑，当前可用子任务明确限定覆盖范围，不冒充完整 C0 或未来功能验收。
- runner 串行全量收集，单 case 错误不影响其余 case；全局预算默认 ¥3，媒体仅 loopback，真实文本显式开启，拒绝未知报价。
- 单测先红后绿，loopback sweep 与截图人工检查；完整 gates 排锁最长 40 分钟；推分支与 PR（引用本文和报告），SWEEP-LAST ≤15 行。

六视角自审：CTO 复用 tracing；设计 保留失败现场；PM 统计未到达而非假覆盖；前端 不改 UI；后端 原生转录不重建；用户 一次拿全问题清单，repair 单列可追溯。

## 实测与兼容边界

- C0 保留原始断言和默认 fail-fast；collect 在原 step 外加站点 session。首轮零费用完整 00–07 通过，含模拟 MP4 与冷重启。原脚本当前 main 是 8 站、预算常量 ¥8，与任务书描述的候选分支 13 站/¥50 不同；本任务不改其预算或断言。
- 旧运行时原生转录实际住在 `.nomi/agent-thread-context-v1.json` 的 native 快照内（`electron/harness/runtime/pi/snapshot.mts:64` 原样导出 SessionManager）；校验 SHA256 后将原始 header/entries 原样写为 JSONL，并保留完整原容器、leafId、来源说明。新 lane 的 `.nomi/agent-sessions/**/*.jsonl` 直接拷贝。两者均不从 UI 气泡重建。
- #662 当前 OPEN（核对 head `7294a6c5f03206b82daf909df99f6bf7d5908db4`），`scanFeel(page,{label})` 是只读公开入口；当前 main 缺失则每站写不可用原因，case 记 deviation。未复制扫描器，也未改 installFeelObserver 接线。
- 9 surfaces 各 ≥3 runnable 输入。现有 G1 的未来整链状态不变，S1 当前输入只测已可用的技能导入，不声称新 lane 自动触发通过。T1/T3/M1/M3/D1 输入明确为当前 surface 子任务，完整原始任务仍按 G1 卡独立验收。
- 真实 APIMart 文本 gpt-5-nano：已捕获 HTTP 400 `nomi_generation_plan` schema 错误；先截图、存原始请求/响应与原生转录，再测试侧写固定分镜并重开创作。两条样本的 Agent 站仍 failed/repaired，下游 storyboard passed/reachedViaRepair。没有生产修复，没有媒体付费请求。
- 文本预留沿用 c0-real-budget.requestQuote/reserve，外层共享 sweep ceiling ≤¥3；只允许 APIMart 文本端点，报价未知/非文本/预算超限在发送前拒绝。站点费用记预留增量，case 最终费用取 APIMart token balance 增量（共享 token 并发可能计入别人使用，保留归因限制）。
- Collect、repair、并发隔离、原生转录 checksum/来源、报告失败保留、文本预算/并发重试/媒体拒绝共 13 项 Node 测试已通过，纳入 check:walkthroughs。

### 已取得的收据（提交前最终验证仍在进行）

- 全量 loopback：`artifacts/sweep/2026-09-08T21-38-47.504Z/report.md`；33 输入 / 213 站 / 33 trace / 6 pi 转录；费用 ¥0；32 条均为 #662 未合入导致的 feel 缺失。九面截图并排人工检查见同目录 contact-sheet.jpg。
- 真文本：`artifacts/sweep/2026-09-08T21-40-08.786Z/report.md`；两次 gpt-5-nano HTTP 400，均 repaired，后续 storyboard reachedViaRepair；余额增量 ¥0，预留上界 ¥0.0953344。原始 response 明确指向 nomi_generation_plan schema.type 缺失，初判契约层；root_cause_cluster 保持空。
- 单测现为 14 项，新增证据扫描失败不能被领域 fixture 误标 repaired；check:walkthroughs 已绿。C0 情绪日志所有站保留，重启截图链接使用 restart/ 前缀。
- 交付性质是收集机制与当前 surface 子任务覆盖；并未承诺所有原始 G1 大任务（深度模型整链、外部双宿主完整出片等）已验收通过。
- 补充：站点 requires 前置失败时记 unreachable，仍继续独立站点，不计入到达站数；仅领域断言失败可触发其 repair，截图/体感问题不会被领域 fixture 洗成 repaired。单测合计 15 项。

### 最终全量复扫（05:52–05:56，零费用）

- 最终报告：`artifacts/sweep/2026-09-08T21-52-31.897Z/report.md`。33 输入 / 213 站记录 / 33 trace / 6 原生 pi 转录，¥0。所有 case 均被执行；不等于所有功能通过。
- 40 条 deviation：33 条 `_feel.mjs` 缺失；C0 第 04 站模拟审片超时、05/06/07 后续步骤失败、子进程退出共 6 条；人工看图新增 1 条「缩略图加载失败但显示已生成 8/8」。保留本轮红收据，不用此前完整出片的绿收据替换。
- 先读 C0 原生转录与 model-requests：两次分镜请求、两次审片请求，未收到另外六次预期审片。初判与证据进总账，未把猜测当根因，root_cause_cluster 留空。生产不修改。
- 人工检查九个 surface 的截图与 C0 失败现场，见 human-review.md；并非 213 张逐张签收。当前覆盖仍以登记子任务为限。
- 报告按每站/每条 deviation 的实际 surface 汇总；跨页面输入可以计入多面，费用仅归输入主 surface，避免重复记账。报告单测覆盖跨面不可达场景。保留原执行 source-files.json，报告重算另记 report-generator.json。
- 本会话真实文本站累计 10 次请求、全部 HTTP 400；预留总上界 ¥0.476672，所核对余额增量 ¥0。媒体请求均 loopback。最终不再追加真模型请求。
- 完整 contracts 首轮唯一阻断为 lint 扫到 artifacts 中的临时 CJS 桥接与撤回草稿；所有其他门岗通过。修在临时桥接 owner：attach 的 finally 清理一次性 loader，成功/失败路径单测覆盖；旧证据与撤回草稿只追加 .txt 后缀、字节保留，没有放松 lint。独立 lint 复核已绿；重新跑完整 gates。
- 最终 gates：`artifacts/sweep/gates-delivery.log` exit 0；75 项 contracts 全部阻断项通过，Vitest 1294 文件 / 12077 测试通过（另 1 文件、2 测试跳过），Agent/runtime 检查与构建通过。新机制及 cases 校验共 16 项 Node 测试；远端基线 `bbc2d037efba` 已整合。首次正式排锁约 22 分钟，未绕锁或跳钩子。
