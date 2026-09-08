# 交付流程去堵

日期：2026-09-08
状态：📋 A/B/C 已实现并验证；D 为待决策方案

## 范围与验收

A 在 Ponytail 共享收集边界排除所有 origin 远端追踪提交，保留逐提交评审和 combined merge diff；超限提前提示按目录拆提交。B 在 gates、contracts 和走查 npm 入口共享机器级互斥，打印持锁 cwd/pid/耗时，支持嵌套与死锁恢复。C 在唯一 validation-policy owner 识别纯文档删除，保留生产删除和验证基础设施的保守分类。先运行确定性红灯，再原样运行绿灯；执行 hook tests、锁 tests、分类 tests、contracts 和 gates。

不改产品源码、依赖、仓库设置、其他 worktree；D 仅研究推荐。最终仅推任务分支并创建 PR，不合并。回滚为撤销本任务提交，临时锁不属于产品持久化数据。

## 先查别人

- Git 官方 [rev-list](https://git-scm.com/docs/git-rev-list)：反方独立核实 `--not --remotes=origin` 表达远端已有提交的排除集，不能改用 `--all` 排除本地未审分支。规范无偏差，沿用官方 rev-list 语义。
- 官方 [git-show](https://git-scm.com/docs/git-show)：`--cc` 是 dense combined diff，只含相对各父都修改的内容，不能宣称涵盖所有选边决定。保留用户指定的 combined 审计范围，不自定义 Git 协议。
- [POSIX mkdir](https://pubs.opengroup.org/onlinepubs/9799919799/functions/mkdir.html)、[node-proper-lockfile](https://github.com/moxystudio/node-proper-lockfile)：成熟库使用原子获取和 stale 回收，但本机可直接用 [Python fcntl.flock](https://docs.python.org/3/library/fcntl.html) 内核锁，避免元数据未发布及并发清死锁的竞态；不安装新包，复用系统能力。
- 本仓唯一分类 owner `scripts/validation-policy.mjs:126` 及消费者 `scripts/select-quality-gate-profile.mjs:13`：文档允许列表不能覆盖生产/测试路径，现有主线和 merge_group 都走同一策略，不另造分类器。

自媒体来源：本次未用 TikHub；真实摩擦已有用户提供的五类现场，待核实的是 Git/POSIX/GitHub 的规范与仓库资格，官方文档和真实 Git/API 探针能直接裁决。没有生成 tikhub 附件，不把未查称为已查。

## 实施记录

开工分支 `ci/delivery-flow-unclog-20260908`；安装完成，preflight HEAD 与 origin/main 均为 `23a51ff4e86cc83ccd71a704cebf7383dac97b98`，工作区干净。A/B/C 均属于 recurring，共享边界与证据记录在本轮 schema-v3 根因合同。

## D 合并队列：推荐与现实前提

核心取舍：原生队列能在合并之前验证「最新 main + 队列中前面的 PR + 当前 PR」，不需要作者反复追主线；但它增加推测性 CI，并且本仓当前账户不具备启用资格。不能把它描述成「六个 PR 只跑一次」。

2026-09-08 实读 [GitHub Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)、[merge_group](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#merge_group)、[required checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)。只读 API 核实 `aqm857886159/Nomi` 为 `public`、owner.type=`User`。原生队列适用于组织拥有的公开仓库，组织私仓需要 Enterprise Cloud；**本仓不能直接开启**，先迁移至组织是另一项需用户决定的动作，本轮不做。

| 方案 | 用户看到什么 | 代价 |
|---|---|---|
| 保留现串行脚本 | 现在可以交付，每合一个再等 main 检查 | 合并后才发现组合问题；后续 PR 反复追主线，串行耗时 |
| 原生 merge queue（推荐目标） | 排队后自动验证组合结果，坏组合在进 main 前被挡住 | 先满足组织仓资格；推测性 CI 可能重建，不能保证总运行次数减少 |

### 启用条件与初始设置建议

- 精确保护 `main`；GitHub 不支持使用带 `*` 的 branch protection pattern 启用 merge queue。
- required checks 名称稳定，建议以现有 `Quality Gate` 聚合作为稳定阻断结论。PR 与 merge queue 使用同一 required-check 配置，不能只验 PR。
- `quality-gate.yml:10` 已有 `merge_group`；`:70` 已用事件 `base_sha` 分类，head 为 `github.sha`。本轮无需再加触发器。
- `quality-gate.yml:315` 的聚合器使用 `always()`，`:343` 起要求被选中的 job 成功；未选中的工作允许 skipped。官方接受完成的 success/skipped/neutral；**并非每个可选 job 都要伪装 success**。真正危险的是 paths/branches/commit-message 跳过整个 workflow，导致 required check 根本不产生、长期 Pending，或依赖失败导致聚合器没运行。
- `Build concurrency`（1–100）限制同时发出的 merge_group 构建；`Merge limits` 限制最终同时合入 main 的 PR 数，二者不是「每批一次 CI」。官方会分别验证 main+PR1 与 main+PR1+PR2；前序失败剔除后要重建后续组合。
- 满足资格后建议先 concurrency=2、minimum=1，保留 Only merge non-failing pull requests；按实际 CI 分钟和吞吐再调，不人为等待凑批。具体保护设置留待单独批准。

### 与 exact-SHA 收据兼容

沿用 [2026-08-30 风险分层证据方案](2026-08-30-risk-scoped-validation-evidence.md)。`scripts/git-delivery.mjs:10` 当前读取 `Quality Gate`、`Mac Package`，接受 success/skipped/neutral；`:241` 确认 expected SHA 被 fetch 得到的 main 包含；`:369` 只查该 SHA 的 check runs。

保留 main push workflow。队列的推测 SHA 不预设等于最终 main SHA：若一致，可以使用该 SHA 的检查；若不同，等真实最终 SHA 的 main push 检查，再运行 `delivery:verify-merged --expected-sha <真实SHA>`。同 tree 不代表同 commit，不移植收据。

批量合并应报告「批次最终 main SHA」作为集成验证对象，并单列各 PR/task commit。若坚持每个 PR 中间 merge SHA 都有独立收据，需先核实批量 push 只在最终 SHA 触发 workflow 的影响，不能默认中间 SHA 自动有 checks。

### 六角色复核

CTO：采用原生组合验证，不自建队列内核；设计：排队状态应由 GitHub 原生界面呈现；PM：账户资格是先决条件，不承诺本轮开启；前端：现有稳定聚合与 skip 条件不变；后端：推测与最终 SHA 分离，保留真实 main 收据；真实用户：减少反复更新分支，但明确 CI 重建和迁移代价。

## A/B/C 实测记录

- A：同一临时 Git worktree 场景旧实现混入 **2,400,510 bytes** 主线内容（缺 origin/HEAD、但 origin/main 存在）；新增两例先红。修后不依赖 symbolic HEAD，排除全部 origin tracking tips 与 advertised tip，新旧 ref 共享边界；30/30 node tests 通过。新分支二进制摘要以首个待审提交的父提交为基线，避免任意远端分支的图片误报；Git 查询错误 fail-closed；模型输入 150,000 bytes、Git I/O 独立约 8MB，超限提示按目录拆提交及分批 push。`--cc` 保留 dense combined 行为，不宣称覆盖直接选父版本的全部冲突决策。
- B：未加锁的阳性对照在第一个目录尚未释放时输出 SECOND；同一并发测试加锁后先打印 owner pid/cwd/耗时，再接管。使用 [Python fcntl.flock](https://docs.python.org/3/library/fcntl.html) 的系统锁（Windows 标准库 msvcrt），无需装包。固定 `/tmp/nomi-gates.lock` inode 不删除，避免 unlink 导致两个不同 inode 同时持锁；死持锁者由内核释放，旧元数据在成功获取后覆盖。覆盖 gates/contracts/test-system/直接 UX 与设计实验室走查入口；嵌套、退出码和持锁者被杀的生命周期有单独回归。
- C：真实二维码提交 `fb79d8ac94dddb350fef69ed5627868d2140e726` 共五项，含 `tests/ux/marketing-home.static.mjs`，完整 diff 前后都必须 full。其真实四项文档子集修前全维度，修后 `unit=focused, canvas=none, desktop/journeys/performance/package=false, reason=docs_only`。19/19 node tests 通过；生产/测试图片、混合危险改动与 rename 不降级。
- B 集成探针：本工作树完整 `pnpm run gates` 持锁期间，在独立临时 Git worktree 执行同一 gates npm 命令，第二棵打印 `pid=56210 cwd=/Users/aoqimin/Desktop/Nomi-ci-flow 已跑 1.0 分钟` 并等待，没有进入任何门岗；探针取消后清理临时 worktree。锁 node tests 8/8 通过（含 npm 入口覆盖、SIGTERM、owner 死后再嵌套、参数透传）。
- Hook 行为 15/15 与 Claude hooks 46/46 通过。未修改 hooks 注册、`.claude` 或模板，因为调用的共享适配器才是 A 根因所在。

日志位于本机 `/tmp/nomi-hook-a-red.log`、`/tmp/nomi-lock-concurrency-red.log`、`/tmp/nomi-scope-c-red.log`；提交的回归测试可重放这些边界。完整 `pnpm run gates` exit 0（a47cb1bde 基线 + 本次实现）：74 contracts 中 71 通过、0 阻断、3 既有 advisory；Vitest 11,966 passed / 2 skipped，原生 runtime 306/306，build 通过。随后快进整合 `7a6f9f293`，直接影响的 Antigravity/wiring 测试 46/46、独立 `pnpm run gates:contracts` exit 0（同为 74 项、0 阻断）及 Electron build 再次通过。Ponytail 独立评审指出重复冲突夹具，已将无 origin/HEAD 与 combined diff 断言并入已有冲突测试，保留所有断言并删除重复 fixture；简化后 hook 30/30。最终交付身份见 PR 与未提交 CI-LAST.md。

## 限制

机器锁要求调用本轮更新的入口；旧 worktree 与临时手写命令不会凭空加入锁。Windows 普通串行路径留给 CI 验证，本机未验证；Windows 不保证强杀包装进程后子进程继续保锁，POSIX 前台命令链有该回归。150KB 是本次现场预算，不保证任意内容都不会模型超时，超时仍严格阻断。D 不改变账户、分支保护或 required checks。
