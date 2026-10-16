# 方向检查：合并前扫描在检出里读 PR 可扩充的数据（2026-10-15）

> 触发：`fix-churn` / 提交钩子报 `gate-family` 命中热点（近 30 天 111 个 fix，本次是第 112 个）。自写登记 id：`gate-family`（reviewBy 2026-10-31，见 `docs/engineering/self-written.json`）。本复盘是 `gate-family` 的复审输入：要不要换现成方案，见第 5 节，结论交用户拍板。

## 0. 一句话根因

门岗（合并前扫描、PR 判据）读「已知登记项」时，取数口径不分「政策」和「数据」：有的从检出读，检出在合并前扫描时是 origin/main，在 CI 时是 PR 头。PR 自己新增的登记数据因此在合并前扫描里看不见（误红），或者在 CI 里被 PR 自己的版本放宽（漏拦）。缺的是「谁是政策、谁是数据」这一层的显式约定，以及一个统一的取数入口。

## 1. 归类表

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| #1193 合并前扫描判「document-switch-after-storyboard 不在登记表」 | `perfVerdict` 只读检出的 `tests/perf/scenarios/`，PR 新增的场景文件不在检出里 | 在检出里读 PR 可扩充的数据 |
| 同类：CI 的路由政策表 | `check-pr-judgement` 的 `evaluatePrBody` 默认用检出的 `test-routing.json`，CI 检出是 PR 头，PR 能放宽自己的路由要求 | 在检出里读政策（取错来源，方向相反） |
| 同类：逃逸账本 | 已经正确：转 fixed 看 base 与 merge-base 两版，条目 id 从 HEAD 目录取 | 对照组（取数口径已对） |

## 2. 为什么会一直出现

「检出」在两条门岗里代表不同的版本（合并前扫描 = main；CI = PR 头）。任何新增「PR 可以扩充」的数据的门岗，只要图方便写 `loadXxx(repoRoot)`，就会在其中一条路径上出错。这次修的是场景登记；同一个口子还留着路由表（CI 侧）。

## 普查：merge-preflight / pr-judgement 读的每一份数据

用 `grep -n "load\|show(\|ghApi\|gitPaths\|readFileSync" scripts/merge-preflight.mjs scripts/check-pr-judgement.mjs scripts/pr-judgement-lib.mjs scripts/pr-body-criteria.mjs` 列出。标注「政策」= 取 main（PR 不能放宽），「数据」= 取 PR 头 / 本 PR 的 diff（PR 可扩充）。

| 数据 | 合并前扫描取法 | CI（check-pr-judgement）取法 | 标注 | 结果 |
|---|---|---|---|---|
| 路由政策表 `test-routing.json` | 检出（= main） | 原为检出（= PR 头），**已改为 base 版本** | 政策，取 main | CI 侧标错，本次改正 |
| 判据代码（`pr-judgement-lib` / `pr-body-criteria` / `PROTECTED_PATHS`） | 检出（= main） | 检出（= PR 头） | 政策 | CI 运行的是 PR 头代码，无法在不换调用方式的前提下改取数；由「规则与门岗范围」判据守住（改这些文件必须在正文点名）。**未改，记为残余风险** |
| 性能场景登记 `tests/perf/scenarios/` | 基线：gh api 读 base；PR 新增/改动：gh api 读 PR 头 | 基线：`git show base`；PR：`git show HEAD` | 数据（PR 可扩充） | **标错的一处，本次改正**：原来只读检出 |
| 场景文件结构（DRIVERS 适配、validateScenarios） | 不做（只核 id） | 不做（只核 id） | 合并引用上的 CI `check:perf-scenarios` 负责 | 按协调裁定：不拿 main 的 DRIVERS 校验 PR 文件 |
| 逃逸账本条目（转 fixed / 删除） | merge-base 版本 + PR 头版本（gh api） | merge-base 版本 + HEAD（git show） | 数据（PR 可扩充） | 已正确 |
| 逃逸账本已结账合同（settledContracts） | base 整本（GraphQL） | `loadEscapeLedger(base)` | 数据，取 base（已结账的事实不能由 PR 改写） | 已正确 |
| PR 新增的 `*.root-cause.json` 合同 | PR 头（gh api） | HEAD（git show） | 数据（PR 可扩充） | 已正确 |
| 拍板图清单 `loadManifests()` | 检出（= main） | 未读 | 待定：拍板图清单按设计它是 PR 可扩充的数据，应取 PR 头；本刀不改，列入后续 | 未决 |
| PR 正文、文件表、diff、创建时间 | gh（PR 数据） | git diff / gh pr view | PR 数据 | 正确 |

## 3. 结构档补法（为什么不是重复修补）

- 唯一的已知 id 算法：`scripts/perf-scenarios-lib.mjs` 的 `knownScenarios`（(基线 − PR 删掉的) ∪ PR 新增/改动可解析出的 id；PR 头取不到 / JSON 坏 → problems → 判红）。两条门岗都调它，取数方式各自给。
- 政策不随 PR 变：CI 显式传 base 的路由表（`evaluatePrBody({ table })`），`evaluatePrJudgement` 缺省才用检出；合并前扫描的检出就是 main。
- 注释里写清分工，判据代码与政策表一律取 main。
- 这是结构（取数入口只有一处 + 参数强制显式传政策表），不是新加一条「记得取 base」的文字规则。

## 4. 不是重复修补的证据

- 上一轮只改了场景 id 的读取（修补）；本次把「谁来给政策 / 数据」变成参数，并修掉 CI 侧路由表的同类错误。
- 残余：CI 上判据代码仍是 PR 头版本（第 2 节第二行）。要彻底消掉，需要把判据代码也从 base 跑（改 CI 工作流），那是另一刀，本次不做，交协调拍板。

## 5. gate-family 的复审（P0：现成方案）

`gate-family` 登记条目（under-review，reviewBy 2026-10-31）已有 `alternativesChecked`。本次只改取数口径，不改门岗族本身。结论：门岗族的整体替换不在本刀范围；复审日 **2026-10-31** 前由协调拍板是否换成现成方案（候选见登记条目）。

## 6. 动作

- 已改：`scripts/perf-scenarios-lib.mjs`、`scripts/pr-judgement-lib.mjs`、`scripts/pr-body-criteria.mjs`、`scripts/check-pr-judgement.mjs`、`scripts/merge-preflight.mjs`，测试 `scripts/pr-judgement-lib.node-test.mjs`。
- 残余：CI 判据代码仍随 PR 头；拍板图清单取数待定。
