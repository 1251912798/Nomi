# Docs autosync: one reviewable PR with real CI

> 📋 实施中 · 2026-09-08 · 本任务只提交 PR，不合并

## 问题与根因

`250bb3db43e37b82bc4d28e45ed4d3a00660173c` 把直推 main 改为开 PR 时，沿用了原直推实现的 `[skip ci]`。同时用 main SHA 作为分支后缀，每个 main push 都另开 PR。2026-09-08 实查 #604/#631/#632/#634/#635/#637/#638 缺失 Quality Gate；#633 实际是已合并的业务 PR，不属于清理对象。

缺失的不变量：自动写回必须有唯一待审分支，且该 head 必须有明确可启动的正式 CI；防递归不能关闭 required checks。

## 先查别人

| 一手来源 | 查到的机制 | 本次裁决 |
| --- | --- | --- |
| [GitHub: Triggering a workflow from a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow) | GITHUB_TOKEN 写入不会递归触发 push；当前 PR opened/synchronize/reopened 可进入需批准状态；workflow_dispatch/repository_dispatch 明确例外 | 保留默认 token，赋予 actions:write，显式调用现有 Quality Gate 的 workflow_dispatch，不新增凭证 |
| [GitHub: Skipping workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs) | 跳过 push/PR workflow 会让 required checks 保持 Pending | commit 与 PR body 均删除跳过标记 |
| [create-pull-request v8.1.1](https://github.com/peter-evans/create-pull-request/releases/tag/v8.1.1) / [实现](https://github.com/peter-evans/create-pull-request/blob/5f6978faf089d4d20b00c7766989d076bb2fc7f1/src/create-pull-request.ts#L239-L243) | 默认固定分支可更新一个 PR，但实现用 force-with-lease 推送 | 本次用户明确禁 force-push，所以移除该 action；用 Git 原生 ancestry merge + 普通 push，既不加依赖也不绕过禁令 |
| [Git merge ours strategy](https://git-scm.com/docs/merge-strategies#Documentation/merge-strategies.txt-ours) | 保留当前 tree，同时记录被合并分支为祖先 | 从最新 main 重生成 docs 后，将旧的专用生成分支记入祖先，保留重生成结果；普通 push 必须 fast-forward，否则失败 |
| [GitHub CLI workflow run](https://cli.github.com/manual/gh_workflow_run) | --ref 选择被执行分支；输入传给原有工作流 | 在 docs/autosync head 运行正式 Quality Gate；保留现有 full 手动验证策略 |

格式遵循 GitHub Actions workflow / Git / gh CLI 标准，无自定义协议。没有新增 marketplace action；现有 checkout/setup action 不变。

## 范围与行为

预计 8 个文件、约 350 行：autosync 与 Quality Gate workflow、方案、根因合同、文档内回归测试、教训与索引。旧测试文件 `scripts/run-gates-contracts.node-test.mjs` 明确要求错误旧行为，已向用户请求仅该文件的范围扩展。

1. main push / 手动补账均串行运行，固定 `docs/autosync` 分支。每次从当前 main 重生成，验证三个 docs 门，再普通 push。旧生成分支只是祖先，不参与生成内容合并。
2. 无 main 差异时不提交，若固定 PR 已被 main 的其它修复覆盖则关闭。相同生成 tree 不产生新 commit。一个固定 head 只开一个 PR。
3. 删除 commit/body 跳过标记；显式 dispatch 正式 Quality Gate（full），不复制测试实现、不改 required checks。dispatch 失败直接让 autosync 红。
4. 默认 token 的 push 不递归。Quality Gate 没有写回动作；main 合并再运行补齐是幂等追账，无 diff 即停止。无需忽略整个 docs 路径，也不按 actor 跳过合法 merge。
5. 旧 PR 按作者、标题、docs/autosync-* 分支及 docs-only diff 核验，只保留最新自动 PR，其余 `gh pr close --comment`。用 gh pr update-branch 或显式 dispatch 恢复最新 PR CI；不合并。

## 验证与回滚

回归测试直接读取 workflow 的 publish shell，在临时 Git 裸远端与可记录调用的 gh fixture 执行：首建、同树重跑、main 前进、无差异收敛、dispatch 失败；验证普通推送祖先关系、单 PR、生成 tree 与正式 CI 调用。另检查默认 token、actions 权限、无跳过标记及主线范围。

本分支运行 `pnpm run gates:contracts`、`actionlint`；远端对保留自动 PR 启动正式 CI，并报告实际状态。机器 fixture 仅证明 Git/CLI 编排，不冒充 GitHub 已执行。

回滚 workflow 与对应测试可撤销新编排；旧关闭 PR 保留历史，可单独 reopen。任务不修改主 checkout，不 force-push，不合并。修复 PR 未合入前，main 仍运行旧版本，可能继续产生旧式 PR，交付时再次核对。

## 当前验证与清理收据

- 清理前逐个计算 merge-base，所有候选 diff 都仅含 docs。已关闭 #604/#631/#632/#634/#635/#637，保留 #638；#633 已核实为 MERGED 的业务 PR，未动。
- #638 head `94060aa00ca4491cf0f40ffa2c4e48791d45628e` 已启动正式 [Quality Gate 34185315866](https://github.com/aqm857886159/Nomi/actions/runs/34185315866)，事件为 workflow_dispatch。完整结果以该 run 为准。
- workflow 行为回归：旧版 4/4 红，新版 4/4 绿；首次创建、同树重跑、main 前进、无修复关闭、dispatch 失败/重试均由真实本地 Git 裸远端验证。gh 是记录调用的 fixture，不冒充远端执行。
- actionlint v1.7.12 通过。一次性 `npx actionlint` 报 could not determine executable；改从 rhysd/actionlint 官方 release 下载 darwin_arm64 二进制并校验官方 SHA256，无依赖文件改动。
- 根因合同检查通过。`gates:contracts` 已跑完 73 项：首次阻断为旧测试断言和本次新增测试的 Node 全局名 lint（后者已改成显式 import，定向 lint/回归通过，完整 lint 复验中）；旧的 `scripts/run-gates-contracts.node-test.mjs` 要求旧 action、SHA 分支与跳过标记，属于明确的阻断断言。该文件超出用户白名单，尚未得到修改授权，绝不通过伪造注释、跳过测试或放宽门岗规避。
