# PR #661 loopback journey failure

> 状态：🚧 验证与交付中

Scope: reproduce the seven loopback journeys, capture the actual document-read result in production-mcp, repair the earliest demonstrated invariant, and verify gates plus PR CI.

CI evidence: run 34269881606, artifact linux-walkthrough-evidence, production-mcp fails at the missing-document assertion (line 205); all other journeys pass. No notification assertion failed. A green main run alone does not establish causality; compare the actual data and route before attributing this to sound behavior.

Initial diagnostic: preserve the assertion while adding its actual MCP result to the failure message. Local full journey execution is queued behind the shared gates lock.

Do not change approved attention-sound UX, add dependencies, reload the window, bypass hooks, or touch other worktrees. Roll back only this task's scoped commit if needed. Acceptance: red evidence, changed regression green, pnpm run gates, scoped commit/push, exact-head Quality Gate receipt at the top of AC-LAST.md.

## Root cause and decision

Local run `tests/system/runs/2026-09-08T19-54-08.159Z-real-user-journeys/report.md` reproduced 6 passed / 1 failed. The exact result was `isError: true`, message `Creation document not found`, but `nomiOutcome.errorCode: null`.

`documentSurface.projectDocument` throws a typed domain Error (`document_not_found`); `rpcServer` calls `rpcErrorWirePayload`, which only preserved codes on `RpcError` instances. GUI-connected stdio loses the domain code; direct headless dispatch keeps it. Both `mcpStdioServer` and `mcpNodeLauncher` decode this wire representation; `host` also uses the serializer. This is recurring transport parity failure, not a superseded sound assertion. The approved sound behavior stays intact.

Fix the existing shared serializer using `buildToolErrorOutcome`, the existing owner of public error projection, before converting the exception to wire data. Preserve existing RpcError recovery details. Unknown codes and arbitrary properties are not promoted. No new dependency or external protocol schema is introduced.

Red unit slice: mcpRpcError.test.ts, four new parity cases fail (document_not_found, project_not_found, node_not_found, capability_execution_failed); four existing/unknown-code cases pass. The regression also checks private details are not serialized. Root-cause contract: `docs/fixes/2026-09-09-mcp-rpc-public-error-parity.root-cause.json`.

Baseline clarification: main run `34269855450` at `b8162783cec8fd720be000fbb69fd1df51ce6883` has a successful E2E job, but its **Real user loopback journey gate step was skipped** (GitHub jobs API). It is not evidence that this journey passed on that exact main. The serializer and producer are unchanged relative to main. PR #660 also makes the launcher honor the shared capability directory, which exposes the GUI RPC path previously bypassed by a split instance-discovery directory.

Initial green verification: 43 tests passed across mcpRpcError, mcpToolResults and mcpSemanticOperationMatrix; root-cause contracts passed; fresh build passed. Full loopback green run queued.

Full loopback after fresh build: `2026-09-08T20-01-01.292Z-real-user-journeys/report.md` **7 passed / 0 failed / 0 blocked**. Production MCP passed all 58 assertions, including restart and H.264/AAC export. Nine captured screenshots reviewed as a contact sheet; task gates, preview and completed task are visible. No UI implementation change in this fix. Paid provider calls: zero.

## 先查别人

- Existing public projection: `electron/capabilityCore/mcpToolErrorResults.ts:88` already maps typed domain errors to a public code and sanitized message. Reuse it; no new vocabulary or third-party serializer is needed.
- Existing transport boundary: `electron/capabilityCore/mcpRpcError.ts:34` is already shared by `rpcServer` and `host`; its decoder is consumed by both stdio and the packaged launcher. Repair this owner rather than individual document or canvas callers.
- Existing producer and regression: `electron/capabilityCore/documentSurface.ts:34` emits document_not_found, and `electron/capabilityCore/mcpSemanticOperationMatrix.test.ts:305` tests direct dispatch. The missing coverage is serialization parity, now tested in mcpRpcError.test.ts.
- Baseline evidence: https://github.com/aqm857886159/Nomi/actions/runs/34269855450 has a skipped loopback step. The failing PR evidence is https://github.com/aqm857886159/Nomi/actions/runs/34269881606 . This is an internal code-loss defect, not external framework selection or a new protocol; ecosystem/social recommendations cannot decide this repository invariant.

Conclusion: use the existing projection at the existing serializer; no new dependency, protocol, or UI design.

Final local gates passed after integrating origin/main d566c99c3: 72 passing blocking contracts, zero blocking failures, three documentation advisories; Vitest 12075 passed / 2 skipped; agent runtime, stats and build passed. Gates stamp emitted.


## Linux follow-up: locale-independent safety assertion

Run 34276122424 at c1f1ac000e8521045c8cba956243d0ca2b582f1c passes Contracts/Unit/Mac Package but fails the preceding MCP L2 C7 T14 assertion before the loopback gate. The assertion searches natural-language text for receipt/approval/invalid or Chinese words. The repaired transport correctly projects receipt_invalid to the existing English user message, “This confirmation is no longer valid; confirm again in Nomi.” None of the old English alternatives match; Chinese still contains 确认.

Deterministic built-code reproduction with ReceiptScopeError → rpcErrorWirePayload → rpcErrorFromPayload → buildToolErrorOutcome: code is receipt_invalid in both locales; old assertion true for zh-CN, false for en. This is an outdated test contract, not a spend authorization failure. Keep provider-hit count zero and replace the text regex with exact structured code; add both-locale RPC parity tests. Repository scan: C9 staleGate in mcp-l2-journeys already asserts nomiOutcome.errorCode === receipt_invalid; generation elicitation journeys inspect typed operation outcomes. No production change required for this follow-up.

Real English Electron L2 passed all 67 assertions with temporary --lang=en in the shared test launcher (removed after verification). Actual C7 response: isError=true, nomiOutcome.errorCode=receipt_invalid, English recovery message; provider task submissions remained zero. Both-locale RPC regression passed (10/10 tests).

Final follow-up validation: loopback report `2026-09-08T21-16-57.602Z-real-user-journeys/report.md` passed 7/7; pnpm run gates passed with 72 blocking gates green, three advisories, Vitest 12077 passed / 2 skipped, runtime/stats/build green. Temporary language override is removed; only locale-independent assertion and bilingual tests remain.
