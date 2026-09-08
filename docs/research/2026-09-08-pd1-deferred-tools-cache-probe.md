# P-D1：deferred tools 的报文顺序、缓存边界与成本

日期：2026-09-08。状态：**第二段真实三传输 × 三回合 usage 已测；原生 deferred 扩展收益仍为 PARTIAL_PROOF**。

本轮只新增测试与文档，未改生产代码。底座 `906ef9ab0a45d22b4cc8d016755e1c374b85373c`；pi 锁定 `0.85.1`（`pnpm-lock.yaml:8-12`）。第二段实际付费请求 **11 次**（9 次完整序列 + 2 次 Haiku 校准），消费 **0.33288 Credits = $0.033288**，按预算汇率 7 保守折算 **¥0.233016 ≤ ¥0.30**。原始白名单收据见 [usage.json](2026-09-08-pd1-deferred-tools-cache-probe/usage.json)。

## 结论与证据边界

建议对确认支持 deferred 的模型使用 pi 原生放置；其他端点默认**会话粘性解锁**：开始只提供常驻工具，首次需要 coding 时加入，之后不收回。第二段实测支持这个保守默认：普通 Messages 解锁时重建缓存、第三回合恢复；Responses/Chat 扩菜单仍保留部分缓存。原生 deferred 开关没有在 APIMart 付费认证，不能称为实测最省。

旧报告 §6 把“HTTP tools 数组增加约 5 KB”写成“缓存失效 20%”及“零缓存代价”，应停止引用这些百分比作为计费或缓存证据。字节变化只能证明报文变化。特别是 Anthropic 官方明确说明：`defer_loading` 的定义依然随请求发送，但服务端将其排除在模型前缀之外，在 `tool_reference` 的位置展开。因此**顶层 tools 变长并不能推出 Anthropic 缓存失效**。[官方工具缓存说明](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching)、[官方工具搜索说明](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)。

**第一段历史**：当时没有本地 `node_modules`；`tsc`、`tsx`、Electron 开发运行器均不可解析。遵守任务“不装包、不碰其他 worktree”的限制，未安装依赖或借用其他工作树。已请求只读复用授权，执行时尚未收到答复。第一段 pi 行号核自锁定版本的公开发布文件，存于未提交的 `.tmp/pd1-upstream/`。**第二段**已按用户要求锁文件安装，并读本地 pi 0.85.1 源码；构建、Electron 安装身份检查和 placement 12/12 已通过。

## 1. 传输 × deferred × 顺序

本节缩写 `PI` = `node_modules/@earendil-works/pi-ai/dist`；公开发布源码根为 [pi-ai 0.85.1 dist](https://unpkg.com/@earendil-works/pi-ai@0.85.1/dist/)。表中每个机制都带源码位置。这里的“开启”表示显式实验开关，不能从协议名字推定已开启。

| 传输与来源 | 是否 deferred / 条件与来源 | 出站工具放置顺序与来源 |
|---|---|---|
| `anthropic-messages`，`PI/api/anthropic-messages.js:781` | `supportsToolReferences`；默认取模型身份判断，`PI/api/anthropic-messages.js:125-146` | `tools = immediate → deferred`；尾部新工具标 `defer_loading:true`，`PI/api/anthropic-messages.js:835-839,1108-1133`。常驻末项保留 `cache_control`，deferred 项不带缓存标记；转录的 tool result 放 `tool_reference`，`PI/api/anthropic-messages.js:900-925`。 |
| `openai-responses`，`PI/api/openai-responses.js:210` | `supportsAdditionalTools` 默认 false；其次 `supportsToolSearch`，`PI/api/openai-responses.js:58,210-215` | 顶层 `tools` 只含 immediate；新增定义以 `additional_tools` 紧跟 `function_call_output`，`PI/api/openai-responses.js:215-219,244-249`、`PI/api/openai-responses-shared.js:209-240`。 |
| `openai-codex-responses`，`PI/api/openai-codex-responses.js:374` | 同样需要显式支持标志，`PI/api/openai-codex-responses.js:374-384` | immediate 在顶层，新定义在转录；共用同一个转换器，`PI/api/openai-codex-responses.js:379-384,409-414`、`PI/api/openai-responses-shared.js:227-240`。 |
| `openai-completions`（Chat Completions），`PI/api/openai-completions.js:611` | 通用路径不开；仅显式 `deferredToolsMode:'kimi'` 有特殊扩展，自动检测不设它，`PI/api/openai-completions.js:1088-1090,1310,1351` | 通用路径完整 `context.tools` 按输入/catalog 顺序进入顶层 `tools`，`PI/api/openai-completions.js:611-612`。Kimi 扩展在 tool result 后增加 system 定义段，`PI/api/openai-completions.js:1129-1139`；本轮不把这个扩展当通用 Chat Completions 支持。 |

共同规则：`splitDeferredTools` 用 Map 按输入顺序去重；从历史 tool result 的 `addedToolNames` 找装载点，最后按原始工具顺序分组（`PI/utils/deferred-tools.js:3-34`）。Responses 转录内定义的顺序则跟随 `addedToolNames`，且同名只装一次（`PI/api/openai-responses-shared.js:227-240`）。因此既要稳定 catalog 顺序，也要稳定新增名字顺序。

### Nomi 当前实际接到了哪一层

- `laneToolMenu` 固定拼 `catalog → nomi_request_tools → coding`；解锁理由非空便始终亮着（`electron/agentLane/laneToolGroups.mts:54-81`）。`addedToolNamesForUnlock` 返回同一份 coding 名单（同文件 `:92-94`）。
- 当前 `laneHost` 只 `createLaneTools(options.tools)`，随后 `activeToolNames: tools.map(...)`（`electron/agentLane/laneHost.mts:178-192`）；没有 `laneToolMenu` / `addedToolNamesForUnlock` 调用。故本轮测试是**菜单到真实 pi 传输的契约探针**，不是宿主动态解锁已接通的验收。
- provider 装配只登记三种普通协议，模型构造没有 deferred compat（`electron/agentLane/laneModelProvider.mts:58-62,116-143`）。实验显式开关不代表产品现有开关；Codex 也不在这张生产协议表里。
- 数量口径需区分：旧探针直接取 catalog + 7 个 coding，**漏掉了** `nomi_request_tools`（`scripts/probe-lane-deferred-tools.mts:107-125`）；菜单实际还会加一个解锁入口。因此测试打印 `catalogCount` 与 `unlockFixtureCount`，不为凑“11 → 18”而少发一个工具。此底座没有该解锁入口的生产 descriptor，测试使用最小 fixture schema，并明确标记。

## 2. 零额度三回合夹具

文件：`tests/agent-runtime/lane-deferred-tools-placement.test.mts`。复用 `tests/agent-runtime/httpFixture.mts:75` 的 HTTP/SSE 服务器；生产 catalog 和 pi coding 工厂提供 schema，工具执行不发生。Codex 的测试 token 是本地构造的未签名占位 JWT，仅用于 loopback 账户字段解析，绝不发送到外网。

| 请求 | 输入与观察 |
|---|---|
| 1 | 常驻菜单；夹具回复 `nomi_request_tools` 调用，读取真实 pi 解析后的调用 ID。 |
| 2 | 追加该 tool result 与 `addedToolNames`，菜单解锁 coding；捕获出站完整工具定义与转录。 |
| 3 | 保留全部历史及解锁状态，再追加用户文本；验证菜单没有回收、排序没有漂移。 |

四种传输 × 三个实验臂，共 12 个测试、36 次本地请求：① 显式开关；② 未声明开关（生产 provider 的现有形状）；③ 声明开关但摘掉 `addedToolNames`（阳性对照）。Chat Completions 的三臂都应是普通全量顶层工具。

断言不仅比较名字：还比较完整 schema、描述、标志与顺序；Responses 检查新增定义紧跟工具结果且第三回合转录前缀不变；Anthropic 检查 deferred 标记和 reference 数量。没有开 deferred 的 Anthropic 会把 `cache_control` 从旧末项移动到新末项，测试单独断言这个变化，不能把它藏在“前缀稳定”里。Codex 请求的 zstd 压缩在夹具边界无损解码，不改 pi 生成的 JSON。

复跑命令（依赖已就绪的环境）：

```sh
pnpm exec tsc -p tests/agent-runtime/tsconfig.json
node --test --test-concurrency=1 --test-timeout=60000 .tmp/agent-runtime-tests/tests/agent-runtime/lane-deferred-tools-placement.test.mjs
```

**第一段本地历史：未运行成功**。`pnpm exec tsc ...` 返回 `Command "tsc" not found`。`node --check tests/agent-runtime/lane-deferred-tools-placement.test.mts` 通过，**只证明语法，不证明类型或断言通过**。不能把预期数组长度、fixture 回传的假 usage 或旧探针数字当成本轮实测。

### 远端零额度实测：12/12 通过

第一段本地保持“不装包”；PR 的既有 CI 在完整安装锁定依赖后执行了夹具。[Unit 收据](https://github.com/aqm857886159/Nomi/actions/runs/34186472836/job/101935763351)，测试 commit `17f8ee7d2d3f6528f731658d6da5f36ccb3b8024`，UTC 2026-09-08 04:22:33。以下均为真实 pi → loopback HTTP 出站数据，**不是供应商缓存实测**。源码确认的 menu 实际为 **catalog 11 + 解锁入口 1 → 加 coding 7，即 12 → 19**；旧 11 → 18 是漏计解锁入口的口径。

| 传输 | 臂 | 顶层工具数：1 / 2 / 3 | tools JSON UTF-8 字节：1 / 2 / 3 | 断言 |
|---|---|---|---|---|
| anthropic-messages | enabled | 12 / 19 / 19 | 23678 / 28809 / 28809 | 通过；原常驻前缀和缓存标记保留，新 7 个尾部 deferred |
| anthropic-messages | default / 去掉 addedToolNames（各跑一组） | 12 / 19 / 19 | 23678 / 28662 / 28662 | 两组通过；定义顺序不变，缓存标记移动到新末项 |
| openai-responses | enabled | 12 / 12 / 12 | 24335 / 24335 / 24335 | 通过；新 7 个在转录，第三请求转录前缀稳定 |
| openai-responses | default / 去掉 addedToolNames（各跑一组） | 12 / 19 / 19 | 24335 / 29214 / 29214 | 两组通过；coding 按固定顺序在顶层尾部 |
| openai-codex-responses | enabled | 12 / 12 / 12 | 24503 / 24503 / 24503 | 通过；新 7 个在转录，第三请求转录前缀稳定 |
| openai-codex-responses | default / 去掉 addedToolNames（各跑一组） | 12 / 19 / 19 | 24503 / 29480 / 29480 | 两组通过；完整菜单留在顶层 |
| openai-completions | 三臂各跑一组 | 12 / 19 / 19 | 24671 / 29746 / 29746 | 三组通过；catalog 固定序，第三回合稳定 |

Chat Completions 本次解锁增加 **5,075 字节 tools JSON**；这是网络载荷增量，不是 5,075 token，更不是缓存失效金额。测试代码在补录本节时未改变。上面的 12 条均通过；整个 agent-runtime suite 为 302 条、301 通过、1 skipped、0 失败。

## 3. APIMart 真实探针与费用

### 前置核查

APIMart 官方列出 [Messages `/v1/messages`](https://docs.apimart.ai/en/api-reference/texts/general/claude-messages)、[Responses `/v1/responses`](https://docs.apimart.ai/en/api-reference/texts/openai/responses) 和 [Chat Completions](https://docs.apimart.ai/en/api-reference/texts/general/chat-completions)。**端点存在不等于支持工具装载扩展或会返回可用缓存数字。** [模型列表](https://docs.apimart.ai/en/api-reference/texts/models/list) 还需结合账户分组/模型权限核实。

[APIMart Codex CLI 接入](https://docs.apimart.ai/en/integrations/dev-tool/codex-cli) 明确是 API key + `wire_api=responses` + `/v1`。pi 的 `openai-codex-responses` 会先从 JWT 解析 `chatgpt_account_id`，再请求 `/codex/responses`（`PI/api/openai-codex-responses.js:167,455-462,1247-1259`）。不能把 APIMart 的普通 API key 装成 OAuth token，也不能用普通 Responses 的成功替它填表。此原生 Codex 传输在 APIMart 上**未查成**。

凭据路径为隔离 Electron 主进程 `readCatalog → decryptApiKeyRecord → safeStorage`。第二段通过 `isoApp.prepareIsolation` 拷贝加密 catalog，四路目录隔离（包括 `NOMI_CAPABILITY_DIR`），再用 `launchNomiApp` 启动真实开发 Electron。认证余额和模型列表 HTTP 200；用户源 catalog 哈希未变，每次结束删除临时凭据目录。key 未打印、写报告或截图。

当前 `agent-runtime-production.walk.mjs` 是 loopback，真实付费参考是 `agent-runtime-provider.walk.mjs`。本探针复用 `stage3ProbeHarness.openProbeLane`：真实应用内的 pi lane、生产 provider/session/schema，同 lane 连发三条用户输入。第二条附 `probe.js` 短代码，探针调用公开 `lane.setActiveTools` 解锁并保持。副作用工具全部阻断。**这是隔离探针接线，不能证明产品 UI/宿主已接通动态解锁。**

### 三回合 usage 表（第二段实测）

`input` 为 pi 归一后的非缓存输入；Messages 三种输入互不重叠，OpenAI 非缓存输入为总输入减 cached_tokens。`—` 表示供应商未返回字段。每种传输自己的三回合保持同一个 sessionId，完整 ID、每次 HTTP 200、菜单与 raw usage 均在 [收据](2026-09-08-pd1-deferred-tools-cache-probe/usage.json)。

| 传输 | 回合 | cacheRead | cacheWrite | input | output | 状态 |
|---|---:|---:|---:|---:|---:|---|
| 第一段历史（三种普通传输） | — | — | — | — | — | 未查成：缺运行依赖，未读取应用 key；0 次生成、¥0.00 |
| anthropic-messages / Haiku 4.5 | 1 | 0 | 7626 | 3 | 4 | 第二段实测；首次写缓存 |
| anthropic-messages / Haiku 4.5 | 2（附代码解锁） | 0 | 8977 | 3 | 4 | 第二段实测；扩菜单后重写 |
| anthropic-messages / Haiku 4.5 | 3 | 8977 | 12 | 3 | 4 | 第二段实测；命中扩展后的缓存 |
| openai-responses / GPT-5 nano | 1 | 0 | 0 | 4733 | 19 | 第二段实测；原始总输入 4733 |
| openai-responses / GPT-5 nano | 2（附代码解锁） | 4480 | 0 | 1111 | 19 | 第二段实测；总输入 5591 |
| openai-responses / GPT-5 nano | 3 | 5504 | 0 | 103 | 19 | 第二段实测；总输入 5607 |
| openai-completions / GPT-5 nano | 1 | 0 | — | 4814 | 10 | 第二段实测；总输入 4814 |
| openai-completions / GPT-5 nano | 2（附代码解锁） | 4480 | — | 1192 | 10 | 第二段实测；总输入 5672 |
| openai-completions / GPT-5 nano | 3 | 5504 | — | 184 | 10 | 第二段实测；总输入 5688 |
| openai-codex-responses | 1 / 2 / 3 | — | — | — | — | 未查成：APIMart 不提供该原生 Codex OAuth 传输，未发送请求 |

三种实测出站顶层菜单均为 **12 → 19 → 19**（11 常驻 + 解锁入口 1 + coding 7），第三回合工具 JSON 哈希与第二回合一致；Messages 三个请求均有 3 个 cache marker。本次为默认 compat 的**粘性解锁对照**，`defer_loading`/`additional_tools` 计数均为 0。不能把它说成原生 deferred 开关认证。

计量修正：首次采集发现 `lane.findEntries()` 默认倒序，直接 `.at(-1)` 会重复首回合 usage。交付脚本已按 `seq` 排序后取最后一条，并核对 raw usage。早先 Responses/Chat 数字从主进程保存的 **LaneSnapshot.stats.usage 累计量相减**恢复，逐字段与原始供应商 usage 相符；无须再次付费。收据注明这一来源，没有拿旧助手消息重复填表。

### 预算与实际花费

- 官方 [Messages URL](https://docs.apimart.ai/en/api-reference/texts/general/claude-messages) 为 `https://api.apimart.ai/v1/messages`；Responses 为 `/v1/responses`，Chat 为 `/v1/chat/completions`。`wire_api=responses` 对应普通 Responses，不对应 pi Codex OAuth。
- [APIMart 公开价目](https://apimart.ai/pricing) 数据包含 Haiku 4.5 默认组美元/百万 token：输入 0.8、5 分钟缓存写 1、缓存读 0.08、输出 4；GPT-5 nano 默认组为 0.04/0.004/0.32（输入/缓存读/输出），预算对 OpenAI 使用未折扣的 0.05/0.4。价格快照随收据保留，公开价格不能替代逐请求账单。
- [余额接口](https://docs.apimart.ai/en/api-reference/account/token-balance) 起止 `used_balance` 为 **185.691884 → 185.725172**；同时 `used_credits = used_balance × 10`。按官网 **10 Credits = $1** 面值，实际消费 **0.33288 Credits / $0.033288**。参考当天 [USD/CNY 6.7108](https://www.investing.com/currencies/usd-cny-historical-data) 约 **¥0.22339**；预算采用更保守的 **7**，合计 **¥0.233016**。这是额度面值换算，不是用户充值汇率。
- 11 次生成含两次 Haiku 首回合预算校准：两次均写 7626 缓存 token，分别输出 4/5 token，后续请求在发送前被预算守卫拒绝；最终 Haiku 完整三回合另起同一条新 lane。没有隐去这些调用或把它们计成免费。免费 token-count 路由 HTTP 404，没有假定它可用。
- 脚本跨启动保存 `.tmp/pd1-cache-budget.json`，累计费用不自动归零。发送前预留冷输入/缓存写中较高价与 64 输出 token；初始完整 JSON 字节上界，校准后为实测输入 token + 仅追加内容的字节差 + 包装余量。已消费取余额差与 usage 估价的较高值。先前保守的全冷历史估价经多次稳定余额读取结清；最后完整序列费用仍全部计入。
- 余额不是逐请求账单：Chat 的同步余额查询未立即反映扣费，不能把那些行称免费；不据零差额或 pi 的占位 `cost=0` 推导每回合真实金额。最终累计余额是本轮付费收据。

手动复跑（**会继续使用同一预算台账，不在 CI 执行**）：

```sh
pnpm install --frozen-lockfile
pnpm run check:electron-install
pnpm build
pnpm exec tsc -p tests/agent-runtime/tsconfig.json
NOMI_AGENT_LIVE=1 node tests/ux/pd1-deferred-tools-cache.probe.mjs
```

## 4. Chat Completions 每回合多花多少

**本轮已有真实 token 增量，独立工具费用仍未查成。** Chat 总输入 4814 → 5672 → 5688：首次扩展增加 858 token（含 coding 定义、短代码和历史，不是纯工具差值），第三回合再增 16 token。解锁回合仍读缓存 4480，不能说“全量前缀失效”；第三回合命中 5504/5688 ≈ 96.8%。没有全量常驻的同模型付费对照，也没有逐请求账单，不能把这些数字直接换成策略净节省。

 旧报告记录 catalog 的估算 5,748 → 6,854 token，差 1,106，但它使用字节/字符近似且不含解锁入口，不能直接写成某模型的计费 token。[旧口径](2026-09-07-pi-coding-tools-layer.md#6-p-d1--解锁一次打掉多少缓存分传输的数字)。

可复核的计算式（价单位为人民币/百万 token）：

`每回合工具增量费用 = (新增冷输入 token × 冷输入价 + 新增缓存读 token × 缓存读价 + 新增缓存写 token × 缓存写价) / 1,000,000`。

若只作敏感性示例，**假设**增量恰为 1,106 计费 token，冷输入单价为 ¥1/百万，则全冷增量为 ¥0.001106/回合；缓存读价为冷价 1/10 时，全命中增量为 ¥0.0001106/回合。**这两个单价与数字只是算术示例，不是 APIMart / DeepSeek / GLM / Kimi 的报价或实测。**

工具数组始终随请求发送，并不意味着每回合都按冷输入价付费。首次扩展可能减少前缀命中，第三回合工具稳定后是否恢复、恢复多少，都要看真实 usage。字节层的共同前缀也不等于供应商分词后的共同前缀。

## 5. 默认策略建议

| 传输 / 条件 | 默认建议 | 为什么 / 证据级别 |
|---|---|---|
| Anthropic，端点明确支持 tool references | 原生 deferred + 单向解锁；常驻顺序不变 | 官方说明 deferred 定义不进入缓存前缀；pi 保留常驻缓存标记。**文档/源码事实；第二段只实测 APIMart 默认 compat，原生 deferred 未认证**。不因 HTTP 数组变长就改成全量常驻。 |
| OpenAI Responses，端点明确支持 additional tools / tool search | 原生 deferred + 单向解锁 | 新定义进历史，顶层常驻工具不变。**源码事实，扩展未认证时不盲开 compat；APIMart 默认走粘性解锁，本次仍保留 4480 缓存 token。** |
| 原生 Codex Responses，具备正确账户鉴权和扩展支持 | 同上 | 共用 Responses 装载转换器；**源码事实，APIMart 路径未查成**。 |
| Chat Completions，或上述传输 compat 未认证 | 会话粘性解锁 | 不需要 coding 的会话省下整个 coding schema；解锁后不再反复改菜单。**第二段支持缓存可保留/恢复；节费净额仍为推断**。APIMart Messages 为 0 → 0 → 8977 读缓存；Responses/Chat 为 0 → 4480 → 5504。 |

非 deferred 的核心取舍：**为每个不开 coding 的会话持续携带说明书，还是只在真正需要 coding 时承受一次菜单变化。**

| 方案 | 用户看到 | 成本与限制 |
|---|---|---|
| 全量常驻 | 开始就有全部 coding 能力 | 从第一回合起菜单稳定；所有无 coding 会话也携带全部 schema，工具注意力影响未测。适合已明确是 coding 的任务，但不能据本轮宣布普遍更便宜。 |
| 会话粘性解锁（推荐） | 需要时解锁，之后一直可用 | 解锁前省 schema，首次扩展可能少命中一部分缓存；依赖解锁入口真正接入宿主。当前宿主尚未接通的缺口需由切换 PR 验收。 |

若解锁前有 K 次请求、每次常驻 coding 增量成本为 d、首次解锁额外缓存损失为 B，则粘性相对常驻的净收益约为 `K × d − B`。K 可由任务分布观察；d、B 仍缺本轮真实数字。**阶段 4 可以沿用粘性默认；P-D1 已取得普通传输真实缓存收据，仍不能声称原生 deferred 或所有供应商已认证。**

## 6. 验证与交付状态

- 第二段：`git pull --ff-only`、锁文件安装、Electron 身份检查 **13/13**、`pnpm build` 通过；没有新增依赖或复用别的 worktree。
- `delivery:preflight` 初次因用户要求保留的未跟踪 `PD1-LAST.md` 报 dirty，未删除交接文件。push 前已将最新 `origin/main` `28654f269` 正常整合进现有任务分支。
- agent-runtime 严格编译通过；P-D1 placement **12/12** 本地实跑通过；三种真实协议 **9/9** 目标请求均 HTTP 200，菜单 12/19/19，usage 收据可与原始字段、lane 累计量逐项核对。
- `gates:contracts` 完整 73 项：**71 通过、0 阻断失败、2 advisory**（文档索引/其他研究文档来源）；lint 0 error、81 warnings 在棘轮内，类型检查 0 error。最终文件另过静态检查和收据对账。
- 今日模型雷达已执行；APIMart 文本车道纯 Node 无法读 safeStorage，没查成，不等于没有新模型。未更新基线或把雷达扩展为接入任务。
- 实际额度 **0.33288 Credits = $0.033288，按预算率折算 ¥0.233016**；0 次媒体生成。此数不含 commit/push hook 的 Codex 评审（不是 APIMart 探针费用）。
- 交付仍为现有 [PR #639](https://github.com/aqm857886159/Nomi/pull/639)，不另开分支/PR；完成 commit/push 后转 Ready，**不合并**。原生 deferred 与 Codex OAuth 的限制不随 Ready 状态消失。
