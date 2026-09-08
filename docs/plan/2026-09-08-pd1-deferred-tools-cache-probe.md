# P-D1：工具装载与缓存探针

状态：执行中。底座 `906ef9ab0a45d22b4cc8d016755e1c374b85373c`；仅本任务分支。

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

不改 `electron/agentLane/**`、生产代码、依赖、设置、旧研究及旧探针。回滚只需 revert 本任务提交。当前目录没有依赖；已请求允许只读复用已有目录，答复前不安装或链接其他 worktree。

## 风险

首次解锁导致工具定义变化；不能据此断言整个前缀缓存全失效。三回合只能说明这次样本，不代表所有供应商。APIMart 中转不能认证官方端点。此底座 `laneHost` 仍直接启用传入工具，测试不声称已验证宿主动态解锁。
