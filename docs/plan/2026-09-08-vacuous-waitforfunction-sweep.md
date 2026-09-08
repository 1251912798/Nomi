# Async waitForFunction sweep

> 状态：✅ 已实现并验证，按 PR 交付（尚未合入主线）。

Scope: tests and the test-waits gate only; no product code or dependency changes.
Root cause (recurring): async predicates return truthy Promises before the persisted-state condition is fulfilled. The shared gate omitted walk/e2e files and had no async-predicate rule.

Repository scan: 7 direct async callbacks across mcp-client-activation (trusted Cursor host), narrowed-mode-guidance (dismissal saved), agent-vertical-spine (new project readable), storyboard-agent-canonical-patch (three storyboard shots readable), production-budget-recovery (budget, provider and model permissions saved). No additional matches outside docs.

Plan: add an AST rule in RULES, scanning test sources including walk/e2e/helper scripts; retain existing rules' unit-test scope to avoid unrelated migrations. Prove the gate rejects the seven original callers before replacing them with expect.poll + page.evaluate. Reuse narrowed-mode-guidance's existing persisted reader. Add regression fixtures covering multiline callbacks, comments/strings, sync predicates and file discovery.

Prior art: Playwright official docs https://github.com/microsoft/playwright/blob/main/docs/src/test-assertions-js.md (Context7 checked 2026-09-08); local playwright 1.60.0 coreBundle.js predicate() truthiness check and matchers/expect.js invokePollMatcher awaiting actual(). Existing tests/ux/agent-runtime-production.walk.mjs and video-depth-real-task.walk.mjs already use expect.poll for asynchronous reads. Retain 1.60.0; async waits belong to expect.poll. Reconsider this policy only with upstream awaited-predicate implementation and a never-true timeout regression proving it.

Validation: changed gate regression tests, R17 red on original callbacks, green after sweep, deterministic delayed/never-ready Playwright sampling check, pnpm run gates captured to file. Full real journeys depend on their existing app/model prerequisites; report precisely what ran.
Rollback: revert this scoped commit (restores the old tests and gate together).
Acceptance: seven old callbacks removed, synchronous waits retained, async rule hard-zero with no baseline; gate fixtures and gates green. No UI changes; no mockup needed.

R17 evidence: before migrating callers, node scripts/check-test-waits.mjs exited 1 with all seven original locations; after migration it exited 0. Chromium 1.60 control: old always-false async wait resolved false; expect.poll on the same always-false async read timed out; a condition becoming true on sample three required exactly three reads. Logs: .tmp/wait-sweep/.

## 先查别人

- 依赖已有：Playwright 1.60.0 `node_modules/playwright/lib/matchers/expect.js:12951` 用 `await actual()` 获取采样值；使用现成 expect.poll，无需自建轮询器。
- 仓库已有：`tests/ux/agent-runtime-production.walk.mjs:54` 已用 expect.poll 等异步持久化读取；本次统一遵循它。
- 生态已有：官方 [expect.poll 文档](https://github.com/microsoft/playwright/blob/main/docs/src/test-assertions-js.md) 明确支持 async 回调及 timeout，Context7 已查询。
- 事故证据：[PR #602 教训](../lessons/wait-for-function-with-async-predicate-never-waits.md) 记录不等待 async 判据；本次已用当前安装包做 Chromium 对照重现。
- 自媒体：这是确定性框架 API 语义问题，源码与官方文档足够，未查 TikHub。
- 结论：复用已有 expect.poll；门岗使用仓库已有 TypeScript 解析器，避免正则对跨行和文本样例产生漏报/误报。

Additional real-app validation: production-budget-recovery.walk.mjs passed (zh-CN, policy saves through approval; screenshot inspected), and storyboard-agent-canonical-patch.e2e.mjs passed 15 assertions through MCP, persistence, receipt and cold restart.

Final validation: pnpm run gates exited 0 on origin/main 73afe44fd714 (Vitest 11,917 passed; Agent runtime 276 passed; contracts and renderer/Electron build passed). Earlier runtime cleanup ENOTEMPTY was recorded, its single test and full file reran green, and the final full gates run passed without modifying that unrelated code.
