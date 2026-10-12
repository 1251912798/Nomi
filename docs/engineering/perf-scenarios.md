# 性能场景：新功能必带性能分析和可重跑的脚本

> 用户 2026-10-11：「新增功能都要考虑性能分析，防止以后出现大量的性能问题、卡顿问题；每一个新功能都得做，而且自己弄好测试脚本，以后用来测试性能。」
> 病因：新功能不量性能，卡顿到用户手里才发现（2026-10-10 用户反馈：选中节点卡、拖组卡）。
> 规矩正本 `rules.json` 的 `P5`；设计卡 ★7（`design-card.md`）；登记表 `tests/perf/scenarios/`；跑法 `pnpm run perf:scenarios`。

## 谁要做

新增功能（`feat` 前缀的 PR，或功能分类里有「新增功能 / 性能」）：

1. 设计卡填 ★7：新增了哪些用户操作、最坏规模、每个操作的预算、覆盖它的场景 id + 基线数。
2. 每个新增操作登记成一个性能场景（下面的流程），跑出基线。
3. PR 正文 `## 验收证据` 交一行：`- perf-scenario：<场景 id> 中位数 X / p95 Y / 预算 Z`。

路径会自动推出这一类：改 `src/**/*.tsx`（设计实验室除外）、画布 / 时间轴目录、任务 / 队列 / 取消类文件、新增 `AbortController`。推出了而这个改动确实碰不到交互、规模、长任务（例如只改一行文案）：证据行写 `- perf-scenario：不适用：<具体理由>`。**「未验证」不算通过**——没有量具就先写量具。

纯文档 / 测试 / 门岗 / 根因明确的小修不要求。

## 默认预算（功能有理由偏离就在 ★7 写理由）

| 指标 | 默认预算 |
|---|---|
| 操作到可见反馈（response） | ≤100ms，p95 ≤150ms |
| 拖动 / 平移 / 缩放的帧间隔（frameGapP95） | p95 ≤2 帧（33ms） |
| 交互期间 >50ms 的长任务（longTasks） | 0 个 |
| 打开到能操作（openToInteractive） | ≤1s @100 节点 |

登记表里的 `budget` 对应 `metrics[0]`（主指标）；其余指标只在表里打印。

## 登记一个新场景

1. 找现有量具，把新操作写成它的**新场景或新参数**，不自写剖析器（P0：Playwright + CDP + `PerformanceObserver`）：
   - `tests/perf/canvas-scale-bench.mjs`：画布手势的帧间隔 / 长任务（拖动、框选、缩放、平移），可选规模 `--scales`、场景 `--scenarios`；
   - `tests/ux/project-open-stages.e2e.mjs`：打开项目分阶段计时；
   - 其余量具（`tests/ux/perf.e2e.mjs`、`tests/ux/windows-freeze-sweep.walk.mjs`、`tests/ux/canvas-real-suite.mjs`）要用时，先在 `scripts/perf-scenarios-lib.mjs` 的 `DRIVERS` 里补它的参数拼法和读结果（几行），再登记场景。
2. 新建 `tests/perf/scenarios/<id>.json`（id 小写字母数字加连字符，文件名同 id）：

```json
{
  "id": "canvas-drag-20-nodes",
  "feature": "画布多选 20 个节点一起拖动",
  "script": "tests/perf/canvas-scale-bench.mjs",
  "args": ["--scales", "I150", "--scenarios", "drag-nodes-20"],
  "scale": "150 个图片节点",
  "metrics": ["frameGapP95", "longTasks"],
  "budget": 33,
  "baseline": { "median": 0, "p95": 0, "runs": 0, "machine": "", "date": "", "commit": "" }
}
```

3. `pnpm run perf:scenarios -- --smoke --id <id>`（1 次冒烟，确认脚本跑得通），再 `pnpm run perf:scenarios -- --id <id> --update-baseline` 写基线（≥5 次；跑的时候别的线在忙就加 `--noisy`，基线标 `noisy: true`，退化只提示）。写基线只许协调会话或验收线做，实现线把冒烟和 5 次的数字贴进 PR 即可。
4. `pnpm run check:perf-scenarios` 通过（登记表结构门岗）。

## 统一跑法

```
pnpm run build                                      # 量具跑的是构建产物
pnpm run perf:scenarios                             # 登记表全部，每个 ≥5 次，出对照预算和基线的表
pnpm run perf:scenarios -- --id <id> --runs 7
pnpm run perf:scenarios -- --list
pnpm run perf:scenarios -- --out report.json        # 另存 JSON（夜跑用）
```

窗口在屏幕外、只用临时目录、不连真实资料（量具自己保证）。判定：中位数 > 预算 = `over-budget`；中位数比基线差 >20% = `regression`（基线标了 `noisy` 只提示）；没采到数据 = `no-data`。以上任一项都让命令退出码为 1。

## 门岗

| 门岗 | 管什么 |
|---|---|
| `check:perf-scenarios`（结构，进 `gates:contracts` 和推送前总跑集） | 登记表每条：id 唯一且同文件名、script 存在且是 `DRIVERS` 里有适配的现有量具、metrics 合法且量具量得出、budget 是正数、baseline 的 median / p95 / runs(≥5) 是数字、machine / date / commit 不空 |
| `check:pr-judgement` | 路径推出「新增功能 / 性能」类的 PR，`## 验收证据` 必须有 `perf-scenario` 行：格式对、id 在登记表里、「未验证」红、「不适用」要有具体理由；2026-10-11 之前开的 PR 不要求 |

已知缺口：`feat` 前缀本身不是路径，纯后端新增（路径没命中上面几类）的新功能靠设计卡 ★7 自己勾「新增功能 / 性能」，门岗拦不到；合并前扫描 / 独立验收线核设计卡时看这一项。

## 夜跑（只设计，本 PR 不加工作流）

目标：老功能不因后续改动悄悄变慢。做法：

- 每晚在一台**固定的安静机器**上 `pnpm run build && pnpm run perf:scenarios -- --out perf-nightly.json`；
- 退化（中位数比基线差 >20%）或超预算：输出报告并开一条待办，不自动改任何东西；
- 基线只在安静窗口里更新（`--update-baseline`，不加 `--noisy`），由协调会话或验收线做；
- 2026-10-06 用户定过「不设定时触发、全量由用户手动触发」（`experience-system.md`）：夜跑要不要上，需要用户点头；在那之前，同一条命令就是 `Full Experience Run` 全量跑里的 `perf-real-scale` 层。

## 种子场景

`canvas-drag-20-nodes`（拖动帧间隔）、`project-open-i100`（打开到能操作）：先登记这两条做样例，基线是本机有其它线在跑时量的（`noisy: true`）。其余老功能的场景由性能线的场景表后续补。
