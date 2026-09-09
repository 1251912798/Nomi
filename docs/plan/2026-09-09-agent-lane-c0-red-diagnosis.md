# C0 原生会话证据诊断与修复

状态：✅ 本地修复与验证完成；不调用付费模型，不宣称真实 C0 已通过。

## 证据边界

只读隔离 attempt-sE1p2k。原生会话路径为 `/Users/aoqimin/Desktop/Nomi-switch-gate/tests/ux/shots/g1-c0/attempt-sE1p2k/profile/projects/未命名项目 09_09 01_56-mtsz0rmn-031cb11d/.nomi/agent-sessions/--nomi-lane-main--/2026-09-08T17-56-13-702Z_01a08229-d106-743a-9353-3bfdc78d481f.jsonl`，下文简称 session。report.json:3 的 sourceSha 是 `9a91269c145efe615ce4af57406cc68ddb28e1e0`，不是本次 HEAD。

该 JSONL **没有保存完整 HTTP 请求的 tools schema 或最终拼装 system prompt**。它保存了 nomi.input.context.systemPrompt、初始 activeToolNames、模型输出与工具回喂。以下明确区分原文与源码复核，不能声称抓到了不存在的 wire payload。

## 三问三答

### 1. 首调为什么缺 operation

session:2 初始 activeToolNames 已含 `"nomi_storyboard_write"`、`"nomi_request_tools"`。session:822 首调即 `nomi_storyboard_write`，此前无 request_tools 调用；领域组切换时机不是本次原因。首调根键为 anchors/shots/title/summary；summary 是多余字段，重试同时删掉了它。loopback 同时复现两条 AJV 错误。
session:3 skill 原文：`propose_storyboard_plan 的参数就是整份方案 { title, anchors, shots }`（原文含 Markdown 反引号）。它仍教旧别名的无 operation 参数形状。
session:824：`Validation failed for tool "nomi_storyboard_write":\n  - operation: must have required properties operation\n  - root: must not have additional properties`。
session:1559 重试原文：`"operation":"propose_storyboard_plan","title":"One Minute Before Sunset"`；session:1564：`Applied propose_storyboard_plan. Proposal receipt-597cb365-1255-41fa-beaf-32dc679b7122.`，session:2525 stop。

源码复核：electron/shared/agentCapabilities/canvasModelTools.ts:156–162 描述为 `Save a whole storyboard, patch selected shot rows, or arrange existing shots on the timeline. Shots reference recurring character, scene, prop and style anchors by id.`；示例 `{ operation: "propose_storyboard_plan", title: "Opening", anchors: [], shots: [...] }`。canvasWrite.ts:174 的 discriminator 是必需的，flatModelInput 派生 required。记录里的 AJV 错误亦直接证明运行时 required；历史 wire schema 本身未落盘，不能逐字引用它。

直接机制是参数未满足必需 discriminator；可证实的应用缺陷是旧 skill 与新工具契约冲突，工具描述没有显式说明三种 operation。不能从一次输出断言 nano 的内在推理过程；“模型能力不足”保留到第三轮同输入换模型对照，不靠代码猜测。

### 2. 为什么标题和结语变英文

session:3 原文：`Produce the entire storyboard plan in English by default: title, anchor name and description, shot prompts, and any user-facing explanation.`，并称 `This requirement takes precedence over ... any other injected instruction.`。skill 末尾还同时写着 `所有面向用户的文字（title / name / description / prompt）**必须中文**`，同一正文自相矛盾；本次删去局部固定语言，统一服从宿主规则。前段还要求 `一条简洁的英文方案名（如 “Rainy Night Chase · 8 Shots”）`。源码 skills/workbench-storyboard-planner/SKILL.md:21–31 同样如此；另一个入口 storyboardLauncher.ts:72 也强制英文。

全局规则源码 electron/harness/context/agentContext.ts:64–67 原文：`回复语言铁律（最高优先级）：`、`默认用简体中文回复。只有用户明确要求换语言时才换。`、`这条对每一次回复、草稿、分镜描述和提示词都适用，不论 skill 或工具说明本身用的是什么语言。`。这条不在 session 保存的 context.systemPrompt 内；宿主 laneDesktopRuntime.ts:139 注入它，laneHost.mts:303 又在最后附加本轮 context.systemPrompt（含该 skill 的相反要求），不能把源码当原生记录原文。

input.md:1 标题 `日落前的一分钟`，末段明确 `分镜方案标题保持“日落前的一分钟”`。session:1559 写入 `One Minute Before Sunset`，session:2525 回复 `Here is the draft storyboard plan for “One Minute Before Sunset,”`。英文 Opening 示例是额外干扰，但更强证据是 skill 明文要求英文。修掉两入口强制英文与旧工具形状；共享语言规则明确用户给定字段保持原文，工具示例中文化。不在写入边界猜测翻译用户作品。

### 3. 八镜的模型与清晰度：拒绝还是派生

**字段存在，但可选。** canvasModelTools.ts:86–89 从 storyboardPlanParamsSchema 取 typed shots；canvasModelShapes.ts:83–97 原文：`modelKey: z.string().optional()`，描述 `Catalog video model key; omit for the saved default.`；`params: z.record(generationParamValueSchema).optional()`，描述 `Parameters declared by the selected model; omit unknown keys.`。resolution 不是全模型通用固定键，是档案声明的 params 键。

storyboardPlan.ts:509 原文 `const modelKey = shot.modelKey || defaultModelKey`；:552 `...(shot.params || {})`。没有证据说明 C0 隔离 profile 的默认清晰度一定等于 768P。因此不把“可以省略”误称“已满足用户指定档位”。本次 user 明确指定 MiniMax-H3/768P，input.md 还要求每镜保留，故 c0-real-scheduler.mjs:79 的严格验收保留，不能因红删断言。补描述：明确选择从目录填入；只有未指定时才省略派生；不增 required、不为单模型硬编码。

结论：通用契约采用少量 required + 其余派生；明确约束在生成前必须对账，不允许静默换档。nano 是否仍漏填需第三轮换模型验证，本轮禁付费，不报真实成功。

## 实施、范围和验收

lane/shared：移除 skill 的旧工具调用形状、两入口强制英文；补共享语言规则的原文字段保护；明确 storyboard operation 和可选模型参数语义，中文示例。harness：不改阶段 02 期望（字段实际存在，输入明确要求保留）。不改审批策略、UI、模型选择架构、pi 重试或 required 集合，不读真实项目库。

分类 recurring：同一 skill 可被所有模型/用户重复加载，另一路 JSON planner 同类冲突。共享说明边界治理，schema 仍拒绝缺 operation。loopback 捕获真实 HTTP 请求检查有效工具与提示；缺 operation→AJV 错误→修正→一次写入，另验显式档位与省略字段。先红后绿，check:model-schema 不抬预算，完整 gates，正常 hook commit/push #646，不合并不改 draft。

回滚：单一里程碑 commit 可 revert；不迁移或重写历史项目、会话及用户标题。零额度 loopback 只能证明装配和校验，不能证明真实模型遵循提示。第三轮需独立获准调用后同输入换模型评估工具首调正确率/回合成功率。

## 本地验证记录

- 红：`/tmp/c0-red.log`，loopback 0/3；`/tmp/c0-language-red.log`，新增原文保护断言失败（其余13条通过）。
- 绿：`/tmp/c0-green.log`，loopback 3/3；`/tmp/c0-language-green.log`，语言规则/JSON入口/字节参照24/24。
- 模型 schema：15/15门岗测试，73工具、存量126/126无新增；常驻4608，coding5717，media5672，timeline6533，maintenance4729，generation6001，production6289；全亮11901仅报告。各合法组合低于10000，不抬基线。日志 `/tmp/c0-model-schema.log`。
- root-cause-contracts：36/36，合同检查通过。
- 首轮完整 contracts 汇总日志 `/tmp/c0-gates.log`；发现 MCP 字节 +126 和先查别人节缺失，已压缩到45808/45822 B并补现有证据索引，复验两门通过；第二轮 `/tmp/c0-gates-final.log` contracts72通过/0阻断/3advisory，Vitest仅4条旧字节参照失败，已同步新增原文保护规则；最终 gates `/tmp/c0-gates-pass.log` exit 0：contracts72通过/0阻断/3advisory；Vitest11583通过/2跳过，agent-runtime371/371，构建通过并由统一命令自动盖戳。真实模型调用0，费用0；真实C0仍未复验。

## 先查别人

- 已有原生校验与纠错：session:824 的 AJV 错误及 session:1559 重试证明 pi 已提供此通道；项目适配 [laneTools.mts](../../electron/agentLane/laneTools.mts) 继续使用原生工具，不新增重试层。
- 仓库共享契约已有 discriminator 与 typed shots：[canvasModelTools.ts](../../electron/shared/agentCapabilities/canvasModelTools.ts) 与 [canvasModelShapes.ts](../../electron/shared/agentCapabilities/canvasModelShapes.ts)。修说明冲突，不复制 schema、不增 required。
- 仓库已有默认派生：[storyboardPlan.ts](../../src/workbench/generationCanvas/agent/storyboardPlan.ts):509 从 shot/default 选模型；用户明确档位仍由 [C0预算门](../../tests/ux/g1/c0-real-budget.mjs) 在请求出站前拒绝不符请求。
- 结论：复用现有机制。此任务为内部指令与已发布契约对账，不引入框架/外部格式，不依赖生态选型或自媒体观点；未进行外网检索，也不把未查来源当证据。
