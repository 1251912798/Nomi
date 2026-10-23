# 方向检查：门岗族（自写登记 `gate-family`）——引擎换现成工具、规则留着自写

> 2026-10-22。触发：`node scripts/fix-churn.mjs` 对门岗脚本命中自写登记 `gate-family`（under-review，近 30 天 86 个 fix）。
> 用户 10-22「按推荐」批了下面 §6 的改造（G1–G8，一个概念一个 PR）。本文是调研的一页摘要，G 系列提交的 `Direction-Check:` 都引用它。

## 0. 一句话根因

门岗总在修，主要不是规则错，而是 **107 道门每道手写一套引擎**：自己扫文件、自己用正则读源码或 PR 散文、自己做棘轮基线、自己处理 Windows 路径和起进程。手写引擎的洞一处一处冒，每次补一刀。

## 1. 归类表（近 30 天碰门岗脚本的 96 个 fix）

| 类 | 个数 | 直接原因 | 例 |
|---|---|---|---|
| 随产品改基线 / 登记 | 37 | 基线、白名单写在脚本源码里，产品一改它就改——门岗本身没错 | `check:filesize` 9 次全是这类 |
| 漏报 | 19 | 判据是正则 / 字符串猜，新写法没想到 | 不谈钱门 5 次、PR 证据 5 次 |
| 新规则 | 12 | 往已有门里加规则 | — |
| 误报 | 11 | 同上，反方向 | PR 判据把测试里的 AbortController 当成可打断 |
| 重构 / 口径 | 9 | 正则改语法树 | canvas-edge-writers、llm-stream-owner |
| Windows 平台 | 8 | 每道门各自手拼 file URL、反斜杠、`pnpm.cmd`、python3 | 5 道门一直空跑报绿 |

## 2. 为什么这一类会一直出现

- **判据读散文**（PR 正文、界面文案、函数名）或**读手抄清单**：散文和清单总会长出没想到的形状，误报漏报交替。启发式的 36 道门 30 天修逻辑 41 次，其它 71 道合计 38 次，按道算差一倍。
- **很多门只在 CI 跑**，推送前不跑，每拦一次多一轮 CI。
- **写法类规则的地盘有洞**：`eslint.config.mjs` 把 `scripts/`、`tests/ux/`、`evals/` 整片忽略，于是这三片的写法规则只能各写一个脚本门（test-waits、main-guard、git-path-quoting、script-network-retry、e2e-launch、walkthroughs 的 no-undef、mjs-parse），每道各坏一遍。
- 铁律 ⑩⑪⑫：不适用（这是工程门岗，不是产品体验路径）。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| `fix-churn` 里 `gate-family` 永远是热点、告警没人看 | `node scripts/fix-churn.mjs scripts/check-test-waits.mjs` |
| 读 PR 正文的 `check:pr-judgement` 继续每周误报 / 漏报 | `git log --since=… -- scripts/pr-judgement-lib.mjs` |
| 三片目录里再出现「写了等其实没等」「漏 import」这类只能跑到才炸的错 | 10-22 isVisible 事故：三条付费样本空等 20 分钟 |

## 4. 靶子独立性

门岗的「靶子」就是规则本身。规则多数是对的（领域：花钱、分镜、画布、模型档案、MCP 工具面、设计流水线），坏的是执行方式，所以不动规则、换引擎。

## 5. P0：哪些是我们独有的

- **引擎不是领域**：扫文件、选择器匹配、棘轮基线、读 PR、取 git 路径、跨平台起进程——都有成熟工具：ESLint（含 9.24 起的批量抑制 https://eslint.org/docs/latest/use/suppressions ）、dependency-cruiser 原生 `--baseline`（https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md ）、Danger JS（https://danger.systems/js/ ）、gitleaks、cross-spawn（https://github.com/moxystudio/node-cross-spawn ）。
- **规则多数是领域**：留着自写，但写成这些引擎能吃的形状（ESLint 选择器、依赖规则、JSON Schema、生成物 + `--check`）。

## 6. 选项与推荐（用户 10-22 批了推荐项）

| 选项 | 做什么 | 代价 | 推荐 |
|---|---|---|---|
| 接入现成方案 | 写法类规则进 ESLint（先让它看见三片目录），棘轮用 ESLint 批量抑制 / dependency-cruiser 基线，PR 证据改结构化，本机入口去 python3 | 每步一个小 PR；所有线的 PR 模板改一次 | **推荐** |
| 补 | 继续按事故往各门里加正则 | 每次一刀，永远补不完 | 否 |
| 重写 | 自写一个统一门岗框架 | 又一个自写引擎 | 否 |
| 删 | 13 道只是单测套件的门并成一个 job；transport-assembly 改类型必填后删 | 小 | 与接入并行做 |

批了的 8 条（一个概念一个 PR，按顺序）：G1 ESLint 覆盖 `scripts/`、`tests/ux/`、`evals/` + 拦 isVisible / isHidden 带 timeout；G2 方向检查按单道门计数、只改基线不算 fix；G3 「只改错误文案」例外档由 diff 自动判；G4 验收后只改严测试由协调核 diff 放行；G5 PR 证据结构化；G6 新门准入 + 误报率登记、超标自动复评；G7 新依赖一个一个 PR；G8 本机 gates 入口去 python3 与 shell 长链。

## 7. 用户要权衡的核心

换引擎要每条线改一次习惯（PR 模板、ESLint 存量冻结），换来的是「门岗不再每周修、推送前就能看到 CI 会拦什么」。

## 特征测试

- G1：`scripts/eslint-script-coverage.test.mjs`（三片不被忽略；isVisible / isHidden 带 timeout 在代表路径上都红；走查 no-undef；lint:changed 的抑制判据）。10-22 三处真事故在修复前的版本上都能抓到（`e241cc976^` 的 3 处）。
