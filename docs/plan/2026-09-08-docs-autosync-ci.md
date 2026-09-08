# Docs autosync: one fixed action PR without CI skip markers

> 🚧 PR #640 · 2026-09-08 用户已裁决 · 本地与远端 CI 验证中，不合并

## 根因与裁决

CI Contracts 在 `scripts/run-gates-contracts.node-test.mjs:186` 拦下手写 gh 发布器：现有合同要求 create-pull-request v7，但实现移除了 action。后面的旧合同又要求 SHA 后缀和 CI 跳过标记，与用户裁决冲突。根因是发布边界与两套验证没有一起迁移。

恢复 `peter-evans/create-pull-request@v7`，固定 `branch: docs/autosync`、`base: main`，不设 branch-suffix；由 action 管理同一条 PR 的创建、更新与无差异收敛。显式使用 GITHUB_TOKEN，移除专用 token 前置条件和手写 Git/gh 发布逻辑。提交与 PR 正文不含跳过 CI 的指令。生成物仅限 docs；每次从 main 补齐后，仍由三个门岗本人验绿才发布。

## 先查别人

| 一手来源 | 当前事实及采用方式 |
| --- | --- |
| [create-pull-request v7](https://github.com/peter-evans/create-pull-request/tree/v7#action-behaviour) | 默认固定分支更新同一 PR；不加 branch-suffix。保留 v7 action 存在性断言。 |
| [GitHub workflow 触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow) | GITHUB_TOKEN 的 push 不递归启动 workflow；dispatch 是例外，当前 opened/synchronize/reopened PR 事件会进入需批准状态。本实现不额外 dispatch。 |
| [GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token#when-github_token-triggers-workflow-runs) | 配 contents / pull-requests write；无需配置额外 secret。默认 token 不保证自动 PR 的 CI 无人值守启动。 |
| [跳过 CI](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs) | 跳过 required checks 会留下 Pending；禁用所有跳过标记。 |

格式遵循 GitHub Actions/action 官方输入，无自定义协议。近邻 `.github/workflows/seo-radar.yml:41` 已采用同一 v7 action 固定分支。用户本轮明确恢复 action；任务分支仍只普通 push，不手动 force-push，不直写 main。

## 范围、回滚与验收

更新 autosync workflow、两处合同测试、本文/根因合同/教训及关联索引；保留 quality-gate 中现有 autosync 测试入口。不修改运行时产品代码和其它自动 PR。合并最新 origin/main 时保留双方的文档索引条目。

1. 保留现有红灯输出 `/tmp/nomi-640-red.log`，新测试先对旧发布器验红。
2. `pnpm run check:gates-chain` 与 `node --test scripts/run-gates-contracts.node-test.mjs`、文档内 autosync 合同测试必须通过。
3. 完整 `pnpm run gates:contracts`，按正常 hooks commit/push；轮询 PR #640 的准确 head 和 mergeStateStatus 到 CLEAN。
4. 更新 PR 正文与本地 AUTOSYNC-LAST.md；不合并 PR。

回滚对应 workflow 和合同测试可撤销本次实现；保留旧分支历史，不回滚 main。

## 证据边界

已有自动 PR #642 的原生 CI [34186621088](https://github.com/aqm857886159/Nomi/actions/runs/34186621088) 曾进入 action_required，维护者批准后通过。这印证默认 token 的限制，不能把本次修复 PR #640 全绿说成未来自动 PR 已实现无批准 CI。此次验证覆盖发布配置与 CI 合同；v7 的远端 PR 更新行为依赖官方实现及仓库 Actions 的 PR 写权限。
