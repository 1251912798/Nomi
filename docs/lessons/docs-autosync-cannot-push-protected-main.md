# Docs autosync 必须走可执行 CI 的 PR，防循环不能靠跳过检查

> 📎 教训 · 首次记录 2026-09-05 · 更新 2026-09-08 · 新修法在任务分支，待 PR 合入

最初直接推受保护 main，遇到 GH006；`250bb3db43e37b82bc4d28e45ed4d3a00660173c` 改为开 PR 后，仍把 `[skip ci]` 留在 commit 中，又用 main SHA 命名分支。结果从“写入被拒”变成“每次新开一条没有 required checks 的 PR”。补索引内容不能修复这条写回链。

[GitHub 官方触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)说明：默认 GITHUB_TOKEN 写入不递归触发 push；当前自动创建/更新 PR 的工作流可能需要人工批准；workflow_dispatch 是可直接触发的例外。[跳过 CI 的后果](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)是 required checks 留在 Pending，不能作为防循环手段。

本次修法：默认 token + 固定 docs/autosync 分支 + 普通 push + 显式 dispatch 现有正式 Quality Gate。每次从 main 重生成，保留旧生成分支祖先关系，不强推、不复制 CI、不直写 main。无 diff 就停止；生成分支只放派生内容，源文档修改通过独立 PR 进入 main。

验证时分别看：补齐三个门是否绿、是否只留一条自动 PR、该 head 是否真的有 Quality Gate/Mac Package。`gh workflow run` 返回 run URL 只说明已启动，完成状态要读 run/checks。

本次清理与回归证据见 [执行方案](../plan/2026-09-08-docs-autosync-ci.md)。#633 是业务 PR，不可因编号相邻误关。
