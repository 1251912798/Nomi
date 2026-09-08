# P-D1：deferred tools 的报文顺序、缓存边界与成本

日期：2026-09-08。状态：**PARTIAL_PROOF；真实缓存成本未查成**。

本轮只新增测试与文档，未改生产代码。底座 `906ef9ab0a45d22b4cc8d016755e1c374b85373c`；pi 锁定 `0.85.1`（`pnpm-lock.yaml:8-12`）。实际付费请求 **0 次，实际花费 ¥0.00**，预算上限 ¥0.30。

## 结论与证据边界

建议对确认支持 deferred 的模型使用 pi 原生放置；其他端点默认**会话粘性解锁**：开始只提供常驻工具，首次需要 coding 时加入，之后不收回。这个默认是基于机制和使用成本的**推断**，尚无本轮付费 usage 支撑，不能称为实测最省。

旧报告 §6 把“HTTP tools 数组增加约 5 KB”写成“缓存失效 20%”及“零缓存代价”，应停止引用这些百分比作为计费或缓存证据。字节变化只能证明报文变化。特别是 Anthropic 官方明确说明：`defer_loading` 的定义依然随请求发送，但服务端将其排除在模型前缀之外，在 `tool_reference` 的位置展开。因此**顶层 tools 变长并不能推出 Anthropic 缓存失效**。[官方工具缓存说明](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching)、[官方工具搜索说明](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)。

本轮没有本地 `node_modules`；`tsc`、`tsx`、Electron 开发运行器均不可解析。遵守任务“不装包、不碰其他 worktree”的限制，未安装依赖或借用其他工作树。已请求只读复用授权，执行时尚未收到答复。下列 pi 行号核自锁定版本的公开发布文件，**不是声称读过本目录不存在的 node_modules**；文件保存在未提交的 `.tmp/pd1-upstream/` 供本轮对账。

## 1. 传输 × deferred × 顺序

本节缩写 `PI` = `node_modules/@earendil-works/pi-ai/dist`；公开发布源码根为 [pi-ai 0.85.1 dist](https://unpkg.com/@earendil-works/pi-ai@0.85.1/dist/)。表中每个机制都带源码位置。这里的“开启”表示显式实验开关，不能从协议名字推定已开启。

| 传输与来源 | 是否 deferred / 条件与来源 | 出站工具放置顺序与来源 |
|---|---|---|
| `anthropic-messages`，`PI/api/anthropic-messages.js:781` | `supportsToolReferences`；默认取模型身份判断，`PI/api/anthropic-messages.js:125-146` | `tools = immediate → deferred`；尾部新工具标 `defer_loading:true`，`PI/api/anthropic-messages.js:835-839,1108-1133`。常驻末项保留 `cache_control`，deferred 项不带缓存标记；转录的 tool result 放 `tool_reference`，`PI/api/anthropic-messages.js:900-925`。 |
| `openai-responses`，`PI/api/openai-responses.js:210` | `supportsAdditionalTools` 默认 false；其次 `supportsToolSearch`，`PI/api/openai-responses.js:58,210-215` | 顶层 `tools` 只含 immediate；新增定义以 `additional_tools` 紧跟 `function_call_output`，`PI/api/openai-responses.js:215-219`、`PI/api/openai-responses-shared.js:209-240`。 |
| `openai-codex-responses`，`PI/api/openai-codex-responses.js:374` | 同样需要显式支持标志，`PI/api/openai-codex-responses.js:374-384` | immediate 在顶层，新定义在转录；共用同一个转换器，`PI/api/openai-codex-responses.js:379-384`、`PI/api/openai-responses-shared.js:227-240`。 |
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

**本地执行状态：未运行成功**。`pnpm exec tsc ...` 返回 `Command "tsc" not found`。`node --check tests/agent-runtime/lane-deferred-tools-placement.test.mts` 通过，**只证明语法，不证明类型或断言通过**。不能把预期数组长度、fixture 回传的假 usage 或旧探针数字当成本轮实测。

## 3. APIMart 真实探针与费用

### 前置核查

APIMart 官方列出 [Messages `/v1/messages`](https://docs.apimart.ai/en/api-reference/texts/general/claude-messages)、[Responses `/v1/responses`](https://docs.apimart.ai/en/api-reference/texts/openai/responses) 和 [Chat Completions](https://docs.apimart.ai/en/api-reference/texts/general/chat-completions)。**端点存在不等于支持工具装载扩展或会返回可用缓存数字。** [模型列表](https://docs.apimart.ai/en/api-reference/texts/models/list) 还需结合账户分组/模型权限核实。

[APIMart Codex CLI 接入](https://docs.apimart.ai/en/integrations/dev-tool/codex-cli) 明确是 API key + `wire_api=responses` + `/v1`。pi 的 `openai-codex-responses` 会先从 JWT 解析 `chatgpt_account_id`，再请求 `/codex/responses`（`PI/api/openai-codex-responses.js:167,455-462,1247-1259`）。不能把 APIMart 的普通 API key 装成 OAuth token，也不能用普通 Responses 的成功替它填表。此原生 Codex 传输在 APIMart 上**未查成**。

凭据路径已读源码核实：`readCatalog`（`electron/catalog/catalogStore.ts:72`）→ `decryptApiKeyRecord`（`electron/catalog/secrets.ts:142`），后者只接受 safeStorage 记录。参考隔离读法在 `tests/ux/agent-runtime-provider.walk.mjs:24-42,72-81`；不能转去读 shell 环境、其他工具的 auth 文件或直接解码密文。本轮缺本地运行依赖，**没有执行应用凭据读取，也没有执行任何认证请求**。旧报告的 safeStorage 失败只算旧记录，不能替代本轮尝试。

### 三回合 usage 表

“—”是没有测量值，绝不是 0。预算日志：发送前 0 次，发送后 0 次，¥0.00；没有账单可核对，也没有未计入的付费重试。

| 传输 | 回合 | usage.cacheRead | usage.cacheWrite | usage.input | 状态 / 原因 |
|---|---:|---:|---:|---:|---|
| anthropic-messages | 1 | — | — | — | 未查成：缺运行依赖，未读取应用 key |
| anthropic-messages | 2（解锁） | — | — | — | 未查成：未发请求 |
| anthropic-messages | 3 | — | — | — | 未查成：未发请求 |
| openai-responses | 1 | — | — | — | 未查成：缺运行依赖，未读取应用 key |
| openai-responses | 2（解锁） | — | — | — | 未查成：未发请求 |
| openai-responses | 3 | — | — | — | 未查成：未发请求 |
| openai-codex-responses | 1 | — | — | — | 未查成：仅有 APIMart API-key 接入，原生 Codex OAuth 路径未证实 |
| openai-codex-responses | 2（解锁） | — | — | — | 未查成：未发请求 |
| openai-codex-responses | 3 | — | — | — | 未查成：未发请求 |
| openai-completions（对照） | 1 | — | — | — | 未查成：缺运行依赖，未读取应用 key |
| openai-completions（对照） | 2（解锁） | — | — | — | 未查成：未发请求 |
| openai-completions（对照） | 3 | — | — | — | 未查成：未发请求 |

### 补测时的计量约束

1. APIMart 官方缓存文档中 Messages 的普通输入、缓存写、缓存读是互不重叠的三个量；总输入为三者相加。Chat Completions 的 `prompt_tokens` 与 details 是不同口径，必须保留原始 usage 字段并注明归一规则。[APIMart 缓存字段](https://docs.apimart.ai/en/api-reference/texts/general/claude-context-cache)。
2. 使用同一个模型、稳定系统提示词和缓存会话标识；每次只改变必需的历史追加与工具解锁。先确认模型缓存最小长度和 cache marker 生效。第一回合没有缓存写/读证据时，第二回合零命中不能证明“解锁打掉缓存”。
3. 记录 usage 字段缺失为缺失，不能把 pi 的默认零当服务器明确回传的零。实际费用以该 APIMart 模型及账户组价核算；不能把 pi 占位 `cost=0`、官方直连价或旧估算当账单。
4. 生成前预留后续三回合**全部冷输入 + 最大输出 + 缓存写入**的保守预算；无法把最坏累计支出压到 ¥0.30 以内就停止，不先花超再报。关闭重试，限制输出，禁止执行模型建议的工具。只输出白名单里的 usage、状态和费用，不输出凭据、header、完整异常对象或截图。

## 4. Chat Completions 每回合多花多少

**本轮实测人民币增量：未查成。** 旧报告记录 catalog 的估算 5,748 → 6,854 token，差 1,106，但它使用字节/字符近似且不含解锁入口，不能直接写成某模型的计费 token。[旧口径](2026-09-07-pi-coding-tools-layer.md#6-p-d1--解锁一次打掉多少缓存分传输的数字)。

可复核的计算式（价单位为人民币/百万 token）：

`每回合工具增量费用 = (新增冷输入 token × 冷输入价 + 新增缓存读 token × 缓存读价 + 新增缓存写 token × 缓存写价) / 1,000,000`。

若只作敏感性示例，**假设**增量恰为 1,106 计费 token，冷输入单价为 ¥1/百万，则全冷增量为 ¥0.001106/回合；缓存读价为冷价 1/10 时，全命中增量为 ¥0.0001106/回合。**这两个单价与数字只是算术示例，不是 APIMart / DeepSeek / GLM / Kimi 的报价或实测。**

工具数组始终随请求发送，并不意味着每回合都按冷输入价付费。首次扩展可能减少前缀命中，第三回合工具稳定后是否恢复、恢复多少，都要看真实 usage。字节层的共同前缀也不等于供应商分词后的共同前缀。

## 5. 默认策略建议

| 传输 / 条件 | 默认建议 | 为什么 / 证据级别 |
|---|---|---|
| Anthropic，端点明确支持 tool references | 原生 deferred + 单向解锁；常驻顺序不变 | 官方说明 deferred 定义不进入缓存前缀；pi 保留常驻缓存标记。**文档/源码事实，APIMart 命中未实测**。不因 HTTP 数组变长就改成全量常驻。 |
| OpenAI Responses，端点明确支持 additional tools / tool search | 原生 deferred + 单向解锁 | 新定义进历史，顶层常驻工具不变。**源码事实，缓存收益推断**；扩展未认证时不盲开 compat。 |
| 原生 Codex Responses，具备正确账户鉴权和扩展支持 | 同上 | 共用 Responses 装载转换器；**源码事实，APIMart 路径未查成**。 |
| Chat Completions，或上述传输 compat 未认证 | 会话粘性解锁 | 不需要 coding 的会话省下整个 coding schema；解锁后不再反复改菜单。**默认策略推断**；不承诺冷输入/缓存失效的具体金额。 |

非 deferred 的核心取舍：**为每个不开 coding 的会话持续携带说明书，还是只在真正需要 coding 时承受一次菜单变化。**

| 方案 | 用户看到 | 成本与限制 |
|---|---|---|
| 全量常驻 | 开始就有全部 coding 能力 | 从第一回合起菜单稳定；所有无 coding 会话也携带全部 schema，工具注意力影响未测。适合已明确是 coding 的任务，但不能据本轮宣布普遍更便宜。 |
| 会话粘性解锁（推荐） | 需要时解锁，之后一直可用 | 解锁前省 schema，首次扩展可能少命中一部分缓存；依赖解锁入口真正接入宿主。当前宿主尚未接通的缺口需由切换 PR 验收。 |

若解锁前有 K 次请求、每次常驻 coding 增量成本为 d、首次解锁额外缓存损失为 B，则粘性相对常驻的净收益约为 `K × d − B`。K 可由任务分布观察；d、B 仍缺本轮真实数字。**阶段 4 可以沿用粘性默认，但不能声称 P-D1 已完成缓存成本认证。**

## 6. 验证与交付状态

- `delivery:preflight`：通过，干净独立分支与 `origin/main` 同 commit。
- `node --check`、`git diff --check`、`check:prior-art`：通过；仅对应各自静态边界。
- `gates:contracts`：完整尝试 73 项；首轮 25 项阻断，其中新增 plan 的 prior-art 格式已修并复跑通过，其余依赖环境失败仍在。日志在未提交 `.tmp/pd1-contracts.log`；不能称 contracts 全绿。
- agent-runtime 编译/执行：缺 `tsc`，未查成；12 条测试尚未取得运行通过证据。
- 今日模型雷达：`radar:models` 因缺 `tsx` 没查成，不表示没有新模型。本任务未扩展为其他研究或修改雷达快照。
- 实际付费 **¥0.00**；不含仓库提交/推送闸门使用的 Codex 会话，后者不是 APIMart 付费探针。

后续同分支验证如成功，应替换本节状态及 usage 空表，并保留本轮失败原因，不能把计划中的断言和三回合当成已执行收据。
