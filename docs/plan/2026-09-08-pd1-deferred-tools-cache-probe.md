# P-D1：工具装载与缓存探针

状态：📎 交接/日志；第二段 Electron 三传输各三回合已实测，零额度夹具本地及远端 12/12 通过。底座 `906ef9ab0a45d22b4cc8d016755e1c374b85373c`；仅本任务分支。收据与限制见同日研究报告；交付到现有 PR #639，不合并。

## 范围与验收

- 读现役 pi、lane 菜单和宿主，记录协议开关、顶层工具及转录顺序。
- 复用 `tests/agent-runtime/httpFixture.mts`，验证三次请求（常驻、解锁、保持解锁）；覆盖 Messages、Responses、Codex Responses，另加 Chat Completions 对照。使用真实 catalog/schema 与 pi 序列化，模型由本地 HTTP 替代。
- 只通过 `readCatalog` → `decryptApiKeyRecord` 读取 APIMart 凭据；凭据仅驻内存，输出限定状态、模型、usage 和费用。所有付费请求合计最多人民币 0.3 元；价格或凭据不能核实则不发生成请求。
- 报告分别标明源码事实、零额度模拟、真实测量和推断；缺失 usage 用“未查成”，不填零。工具报文字节变化不等于缓存失效或计费 token。
- contracts 与所选 agent-runtime 测试；版本化 Ponytail hooks；commit、任务分支 push、创建 PR，不合并。未提交的 `PD1-LAST.md` 不超过 10 行。

## 先查别人

- 现有探针：`scripts/probe-lane-deferred-tools.mts:107` 从 catalog 和 pi 工厂生成 schema；沿用来源，不用字节数冒充缓存失效。
- 现有夹具：`tests/agent-runtime/httpFixture.mts:75` 已覆盖三个协议的真实 HTTP/SSE；直接复用，不另造 provider。
- 上游分流：[pi 0.85.1 splitDeferredTools](https://unpkg.com/@earendil-works/pi-ai@0.85.1/dist/utils/deferred-tools.js)；交给 pi 处理，不复制其分流算法。
- 官方语义：[Anthropic 工具缓存](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching)；HTTP tools 数组与模型缓存前缀分别验证。

规范：[Anthropic 工具搜索](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)、[APIMart Messages](https://docs.apimart.ai/en/api-reference/texts/general/claude-messages)、[APIMart Responses](https://docs.apimart.ai/en/api-reference/texts/openai/responses)、[APIMart 缓存](https://docs.apimart.ai/en/api-reference/texts/general/claude-context-cache)。协议不扩展；兼容开关实验只存在测试中。Codex CLI 可用不等于 pi 的 Codex OAuth 传输可用，需分别核实。

## 不动项与回滚

不改 `electron/agentLane/**`、生产代码、依赖、设置、旧研究及旧探针。回滚只需 revert 本任务提交。第二段按用户明确授权在本 worktree 执行 `pnpm install --frozen-lockfile`，不新增包、不借其他 worktree 依赖。

## 风险

首次解锁导致工具定义变化；不能据此断言整个前缀缓存全失效。三回合只能说明这次样本，不代表所有供应商。APIMart 中转不能认证官方端点。此底座 `laneHost` 仍直接启用传入工具，测试不声称已验证宿主动态解锁。

## 第二段：Electron 真实探针（2026-09-08）

- 前置：当前分支 fast-forward pull、锁文件安装、Electron 身份 13/13 已通过；`delivery:preflight` 识别到用户要求保留的未跟踪 `PD1-LAST.md`，不删除交接记录、不换分支。
- 根因边界：上一段缺运行依赖，未到认证；本段复用 `isoApp.prepareIsolation`、四路隔离和应用 `readCatalog → decryptApiKeyRecord`。同类入口已核对 `agent-runtime-provider.walk.mjs` 与 `evals/verify-shot-smoke.mjs`，不用 `hasApiKey` 猜原因。仅修手动探针装配，不修生产路径，因此不新增生产修复合同。
- 装配：复用 `stage3ProbeHarness.openProbeLane`（其接口明确服务 Electron 真模型探针），在真实 Electron 主进程运行；同一 lane 连续三次用户输入。工具定义来自真实 catalog/pi 工厂；解锁动作只在探针挂接，所有有副作用工具禁止执行。不声称现役 UI 已接通 lane 解锁。
- 官方核查：APIMart `/v1/messages`、`/v1/responses`、`/v1/chat/completions`，价格来自官方 pricing 页面/账户模型清单，余额来自官方 `/v1/balance`。Playwright 主进程执行依据官方 Electron API（Context7 已查）。不改变标准报文；raw usage 白名单与 pi/LaneUsage 分开保留。
- 预算：最多 ¥0.30，每次发送前预留该请求的冷输入、缓存写与输出上界；禁重试、限制输出。若端点不支持、凭据或预算无法核实，给该传输明确未查成原因，绝不补零。报告记实际账单差额及其单位/换算依据。
- 验收：脚本不注册 CI；真实付费序列、12 条既有 placement 测试、contracts 全部执行后汇总。只改探针、计划、报告与 ≤10 行交接；版本化 hooks 正常 commit/push 更新 #639，最后 `gh pr ready 639`，不合并。

第二段预算补充：APIMart token-count 路由 HTTP 404；先以完整 JSON 字节加固定包装余量限额。已有真实冷输入计数后，固定单向追加序列用实测 token 加新增字节保守估算，仍按全冷/缓存写较高价预留。预算台账跨脚本重启累加，余额与 usage 估价取高；不把 pi 未配置的 cost=0 当免费。
