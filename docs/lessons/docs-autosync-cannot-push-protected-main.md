# Docs autosync 固定 PR 与 CI 合同必须一起迁移

> 📎 教训 · 首次记录 2026-09-05 · 更新 2026-09-08 · 修复在 PR #640，待合入

最初直接推受保护 main 遇到 GH006；改走 PR 时又沿用 CI 跳过标记和 SHA 后缀分支，导致每次 merge 新开一条缺少 required checks 的 PR。随后手写 gh 发布器替代 action，却没有迁移旧合同，Contracts 在第 186 行失败。

当前裁决：`peter-evans/create-pull-request@v7` + 固定 `docs/autosync` + 默认 GITHUB_TOKEN。保留 action 断言，分支断言改为精确固定名，原来的跳过 CI 正向断言改为禁止所有跳过标记。两处 workflow 测试同时迁移，删除手写 Git/gh 和额外 token 配置要求。三个 docs 门仍须在发布前逐个验绿。

[GitHub 官方触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)说明默认 token 的 push 不递归启动工作流；当前自动 PR 的 opened/synchronize/reopened 工作流可能需要维护者批准。防循环可以依赖这项 token 语义，但不能把它描述成无人值守 CI。修复 PR 全绿只证明修复分支的检查通过。

验证分别确认：三门失败是否拦发布、固定分支是否唯一、提交是否无跳过标记、准确 head 的 required checks 与 mergeStateStatus 是否通过。具体范围与证据见 [执行方案](../plan/2026-09-08-docs-autosync-ci.md)。
