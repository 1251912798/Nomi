# Agent runtime 测试资源生命周期修复

> 日期：2026-09-08；状态：🚧 结构性防线与合同已修，本地验收通过，PR #641 待审阅；分支：fix/agent-runtime-flakes-20260908

## 问题与范围

四个独立会话都报告崩溃恢复用例红后 runner 不退出，以及项目临时目录 ENOTEMPTY。分类 recurring。范围为 tests/agent-runtime/**、docs，以及 14:35 补充授权的 scripts/check-test-waits.mjs 与对应 node-test；不改 root-cause checker、electron/agentLane/**、依赖、产品 UI 或其他 worktree。

## 先查别人

- Node 官方 [child process](https://nodejs.org/api/child_process.html)：kill 只发送信号，close 才表示进程及 stdio 关闭；使用事件完成信号。
- Node 官方 [test](https://nodejs.org/docs/latest-v24.x/api/test.html#contextafterfn-options)：after 支持 async 清理；在项目夹具内明确依赖顺序，不依赖多个 hook 的注册顺序。
- 仓库近邻 tests/ux/agent-runtime-fixture.test.mjs:20 已按反向顺序等待清理。
- 已读 docs/lessons/flaky-test-check-other-worktrees-first.md；用户指定 repeated-timeout-means-check-the-assertion.md 在当前 Git 历史中缺失，按用户给出的要求检查死断言和子进程。
- 同类入口：lane-approval-gate G3b③；stage3-probe-p1-approval-wait P1③；全部 createLaneFixture/openProbeLane/openLaneWorkspace 调用者。

## 修复与验收

1. 保留双份并行基线与提高并发的崩溃用例输出。
2. 先加入确定性阳性对照：清理必须等待 close 完成；断言失败后子进程也必须关闭，且报告原始失败。
3. 项目夹具统一持有资源与清理顺序；两条崩溃路径统一启动、整行就绪信号、关闭和失败兜底。重启订阅竞争仅是初查假设，本次原始失败已经证实来自 teardown，不改生产恢复或等待语义。
4. schema-v3 合同与教训记录；5 次完整 agent-runtime、双份并行、gates。
5. scoped commit、push、PR，不合并；FLAKES-LAST.md 不提交。

回滚：整体 revert 本任务提交，恢复测试夹具及调用者，不涉及用户数据迁移。


## 实测证据

基线 SHA：906ef9ab0a45d22b4cc8d016755e1c374b85373c；Node 24.13.1 / macOS arm64；开始负载 13.79 / 7.15 / 4.95。

- 两份并行完整基线各 290/290（约 56.6 秒）；这不能推翻 flake。
- 16 份崩溃文件并行：spec reporter 两份红后不退出；改用 TAP 再跑，直接记录 `hookFailed` / `ENOTEMPTY .../.nomi/agent-sessions`。红后 46 秒仍有 runner 和 worker，崩溃子进程已退出。只终止了本任务记录的进程组，未触碰其他 worktree 进程。
- 修前阳性对照：受控 close 在写 last-write 时 ENOENT，证明 rm 已抢先删除目录；另一条关闭顺序断言失败。两条 0/2。
- 修后定向 slice 14/14。临时移除编译产物中的 child owner 是挂死阳性对照；源码未绕过任何门岗。
- 本地原始日志：`.tmp/agent-runtime-flakes-evidence/`，不提交机器临时路径与进程噪声。

## PR #641 结构性防线补齐（14:35 补充授权）

已用两个指定命令复现 `recurring repairs require changed structural prevention, not only tests or documentation`。门岗正确指出只有夹具修复、没有防止调用者重新引入旧写法的结构防线；保持 recurring，不修改 root-cause checker。

- 在现有 `check:test-waits` 的 `RULES` 中增加 `unowned-lane-directory-cleanup`：agent-runtime 的 node:test after / afterEach 钩子禁止直接删除 lane/projectDir（包含属性访问及局部别名），要求目录清理由共享 fixture owner 执行。单独等待一个 lane.close 不能证明其他资源已关闭，因此同样要走 owner。
- 复用已安装的 TypeScript AST 解析与遍历，按语法识别调用而非匹配注释/字符串；参考 [官方 Compiler API 示例](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)（Context7 已查）。不增加依赖或新检查器。
- node-test 覆盖旧钩子、afterEach、改名/多行写法与安全的共享 owner；R17 另把真实 laneFixture 临时改回旧钩子，运行 CLI 证明红，再还原证明绿。
- 合同 `prevention` 指向门岗执行体与 node-test。`invariant_owner_layer.layer` 按现有 schema 填真实门岗路径，`responsibility` 写“测试夹具层 + 门岗层”，tests 同时列夹具生命周期测试与门岗测试。
- 验收：指定两条 root-cause 检查、门岗 node-test、真实旧写法红/修后绿、完整 agent-runtime、gates:contracts。提交推送后每 60 秒查询 PR，直到 CLEAN；不合并。

回滚补充：revert 本次脚本、node-test 与合同修订会恢复此 PR 原来的合同红灯，不涉及产品数据。


## 原 PR 本地验收（2026-09-08，56e0afcd0）

- 最终代码连续 5 次 `pnpm run test:agent-runtime`：每次 294/294，57.90 / 53.78 / 53.75 / 53.63 / 53.90 秒。
- 两份 `pnpm run test:agent-runtime` 同时运行：各 294/294。
- 与基线相同的 16 份崩溃文件并发：16/16 退出成功，共 96 条用例通过。
- `pnpm run test`：Vitest 1284 个文件、11953 条通过，既有 1 文件 / 2 用例跳过；janitor 13/13、agent-runtime 294/294、stats 8/8。
- `pnpm run build` 退出 0；`lint:ci` 最终退出 0（81 个既有 warning）；typecheck / check:test-types / check:test-waits 通过。
- `pnpm run gates` 完整执行 73 个 contracts：68 通过、2 硬失败、3 advisory。硬失败中新增 prefer-const warning 已修并重跑 lint:ci 通过；唯一未解除项为 root-cause-contracts 的 tests/** 排除。其余 advisory 是 main 已有 docs 索引/状态/账本欠项；本任务文档已补索引与状态。
- 零额度 loopback 既有 R30 数字保持：工具首次写对 8/8，回合成功 8/8；没有调用付费模型，也不把这些数字称为真实模型认证。

交付边界：PR #641 已开放审阅；本次仅补现有测试门岗、node-test 与合同。未修改 root-cause checker 或 electron/agentLane/**，不请求合并、不称为 main 已解决。

## 本次修复验证

- 两条指定 root-cause 检查均通过：package 检查 35/35，直接 node-test 30/30。
- `check:test-waits` 的 node-test 7/7；完整仓库扫描通过。
- R17 真实回退探针：把 `laneFixture.mts` 临时换回 `906ef9ab0` 的版本，CLI 退出 1，精确报告 `laneFixture.mts:49 [unowned-lane-directory-cleanup]`；finally 恢复修后源码后同一 CLI 退出 0。探针期间不运行 runtime 测试。
- 本次新增日志：`/tmp/nomi-flakes-real-old-hook-red.log`、`/tmp/nomi-flakes-restored-hook-green.log`、`/tmp/nomi-flakes-contract-green.log`、`/tmp/nomi-flakes-contract-node-green.log`（本机证据，不入库）。
- 本轮完整 `test:agent-runtime`：294/294，通过且正常退出，70.23 秒；运行前负载 10.47 / 12.50 / 11.32。
- 本轮 `gates:contracts` 退出 0：73 项，72 通过、0 阻断失败、1 项既有 research-sources advisory；264.8 秒。包含 lint（81 个既有 warning）、typecheck 与 test-types。完整日志：`/tmp/nomi-flakes-gates-contracts.log`。
