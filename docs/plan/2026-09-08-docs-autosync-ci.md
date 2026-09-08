# Docs autosync: one reviewable PR with normal CI

> 📋 草稿 PR #640 · 2026-09-08 · 待测试范围授权与专用 token 配置，不合并

## 根因与最终行为

`250bb3db43e37b82bc4d28e45ed4d3a00660173c` 把直推 main 改为开 PR 时沿用了 `[skip ci]`；按 main SHA 命名分支，每次 merge 又开一条。实查 #604/#631/#632/#634/#635/#637/#638 均缺少 PR required checks。第三个原因由 GitHub 实跑确认：默认 GITHUB_TOKEN 创建的 PR 会产生 action_required 的 PR workflow，单独 workflow_dispatch 全绿仍未解除本仓 PR 汇总的阻塞。

最终采用独立 `DOCS_AUTOSYNC_TOKEN`（专用 PAT，或由外部系统维护的 GitHub App installation token），让普通 pull_request 事件启动现有 Quality Gate。没有 default-token fallback，也不复制/伪造 check status。缺少 secret 时在 checkout、commit、push、开 PR 之前明确失败。该 secret 必须具备本仓 Contents 和 Pull requests 写权限；短期 App token 必须由其所有者负责续期，不可把一次性安装 token 当永久凭据。

## 先查别人

| 一手来源 | 已核实事实 | 裁决 |
| --- | --- | --- |
| [GitHub: Triggering a workflow from a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow) | 默认 token 不递归触发 push；当前 PR opened/synchronize/reopened 会需要批准；dispatch 是例外 | 不把 dispatch 的作业成功当作 PR 解锁证明 |
| [GitHub: GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token#when-github_token-triggers-workflow-runs) | 无需人工批准的自动 PR CI 应改用独立 App/PAT token | 发布凭据改为必须显式配置的专用 token |
| [GitHub: Skipping workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs) | 跳过的 required checks 会 Pending | commit/body 均删掉跳过标记 |
| [create-pull-request v8.1.1](https://github.com/peter-evans/create-pull-request/releases/tag/v8.1.1) / [固定 SHA 源码](https://github.com/peter-evans/create-pull-request/blob/5f6978faf089d4d20b00c7766989d076bb2fc7f1/src/create-pull-request.ts#L239-L243) | 固定分支支持单 PR，但内部使用 force-with-lease | 因本任务禁 force-push，移除该 action；不新增依赖或 marketplace action |
| [Git merge ours strategy](https://git-scm.com/docs/merge-strategies) | 保留当前 tree，记录被合分支为祖先 | 从最新 main 重生成 docs 后保留旧生成 head 的祖先关系，普通 push 必须 fast-forward |
| [GitHub: Troubleshooting required checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks) | head、merge commit、check source 和 PR 汇总必须分别核实 | 同时检查 run、head check-runs、PR mergeable_state，不能只看运行绿 |

遵循 GitHub Actions、Git、gh 的标准格式，无自定义外部协议。

## 防循环与唯一 PR

入口只监听 main；出口只向 docs/autosync 普通 push。专用 token 发出的 push 位于另一个分支，不会再次启动 autosync。将补账 PR 合入 main 后，确定性补齐无 diff 即退出。串行 concurrency 保证单写者；不使用 actor 过滤而遗漏合法 merge，不忽略所有 docs。

每次从当前 main 重生成，再让三个 docs 门本人验绿。旧生成分支只保留祖先关系，内容不参与生成结果合并。相同 tree 不长 commit；固定 head 只开一条 PR；如果 main 已补齐，则关闭过时固定 PR。生成分支上的手改不作为真源，源文档经正常 PR 进入 main。

## 范围、验证与回滚

8 个文件、约 350 行：2 个 workflow、方案及索引、教训及索引、schema-v3 根因合同、文档内测试。原有 `scripts/run-gates-contracts.node-test.mjs:180` 硬性要求旧 action、SHA 分支与 skip 标记；它在用户白名单之外，已请求仅此文件的范围扩展，尚未获答，不修改、不跳过、不伪造注释过测试。

4 条回归读取真正的 workflow shell，在临时 Git 裸远端实跑首次创建、同树重跑、main 前进、无 diff 收敛；另验证缺 token 在发布前失败、checkout 和 gh 使用同一凭据、正常 PR 事件负责 CI。gh 是记录调用的 fixture，不能证明远端 token 权限。首版旧 workflow 红，最终版 4/4 绿；两份 workflow 通过官方 actionlint v1.7.12（发布包 SHA256 已验，npx 无 executable 后下载二进制，未改依赖文件）。根因检查、47 条 Quality Gate 合同检查、lint、TypeScript 与测试类型检查通过。

`pnpm run gates:contracts` 已跑完 73 项。首次阻断是旧断言和新测试的 Node 全局名 lint；后者已改为显式 import，完整 lint 复验为 0 errors / 81 既有 warnings。最终实现再次跑完整套 73 门：只余旧断言一项阻断，另有 3 项文档/研究 advisory 提示。最终专用 token 路径尚不能进行 GitHub 实跑，因为仓库未配置 secret，不能称本修复已完成。

回滚 workflow 与对应测试可撤销新编排。关闭的 PR 和旧分支均保留历史；不改主 checkout、不强推、不合并。token 缺失是显式配置门，不能用旧默认凭据静默降级。

## GitHub 实跑与清理收据

逐个算 merge-base 并验证 docs-only diff 后，关闭 #604/#631/#632/#634/#635/#637，最初保留 #638；#633 是已合并业务 PR，始终未动。

#638 head `94060aa00ca4491cf0f40ffa2c4e48791d45628e` 的 [Quality Gate 34185315866](https://github.com/aqm857886159/Nomi/actions/runs/34185315866) 9 项作业全部通过，但 PR 汇总仍只显示旧 Cloudflare，mergeable_state=blocked；去掉旧正文跳过标记、关闭并重开也未修复。这证明默认 token + 单独 dispatch 不是本仓 PR 解锁的充分条件。

中间版本 `f2547b36a042df19a389c076406abaed4452b97c` 的 [Docs Autosync 34186588015](https://github.com/aqm857886159/Nomi/actions/runs/34186588015) 在 GitHub 成功普通 push 固定分支并创建 [#642](https://github.com/aqm857886159/Nomi/pull/642)，head `a9c23a8e50c3c7dcadbeb7896f12acb7f0f9ac65` 无跳过标记。其 dispatch run 为 [34186619330](https://github.com/aqm857886159/Nomi/actions/runs/34186619330)，但原生 PR run [34186621088](https://github.com/aqm857886159/Nomi/actions/runs/34186621088) 是 action_required。已经使用维护者身份批准该 CI 运行（不是 PR review/merge），恢复本次补账；最终实现因此改为官方的独立 token 发布路径。

最终关闭 #604/#631/#632/#634/#635/#637/#638，只保留固定分支自动 PR #642。最终 #642 原生 PR Quality Gate 已通过，mergeStateStatus=CLEAN；明细写入 #640 正文和未提交的 AUTOSYNC-LAST.md。最终代码的 token 路径待配置后实证；中间版本的默认 token 实跑不能替它背书。
