# 设计卡：开机动画「跳过」被顶栏压住——全屏层的层级只走刻度

改动名：开机动画盖住顶栏，全屏层的层级只走刻度  线/负责人：I-splash-skip（Mac，Claude Sonnet，实现线）  类别：其他（纯 bug 修复 + 门岗，不出样张）

### 功能分类
- [x] 新界面 / 改交互：只因路径命中（`src/design/overlayLayers.ts`、`SplashIntro.tsx`）；没有新增或重排任何元素，开屏的样子、「跳过」的位置、时长都不动，按 `pure-bugfix` 例外认领。
- [ ] 花钱
- [ ] 长跑 / 可打断
- [ ] Agent 行为
- [ ] 大数据量 / 画布 / 长列表
- [ ] 生成效果
- [ ] 数据格式
- [x] 新增功能 / 性能：只因路径推出（改 `src/**/*.tsx`）；没有新增用户操作，`perf-scenario` 写不适用（★7 同理）。

## 先看问题（实测，构建 = 7e1bd4e0f 之后的 origin/main ea724ce51，无源码改动）

首次启动的开屏动画右上「跳过 ›」点不到，中英一样。我在 1280×933 内容区、macOS、隔离资料、`--lang=zh-CN` / `--lang=en-US` 两轨实测（探针与原始 JSON 在协调 tmp 目录，不进仓库）：

| 量 | zh-CN | en-US |
|---|---|---|
| 开屏 `.nomi-splash` | `position: fixed`，`z-index: 60`（`SplashIntro.tsx` 手写 `z-[60]`，两处） | 同左 |
| 顶栏外层 Mantine `AppShell.Header`（`header.m_3b16f56b`） | `position: sticky`，`z-index: 100`，`--app-shell-header-z-index: 100` | 同左 |
| 顶栏内层 `ShellTopBar` 的 `<header data-shell-topbar>` | `position: relative`，`z-index: auto`（协调探针读到的 `auto` 就是它，不是真正起作用的那一层） | 同左 |
| 「跳过」中心 (1227.6, 37) 的 `elementFromPoint` | 顶栏里 `role="toolbar"`「全局操作」，`isSkip=false` | 顶栏里「Global actions」，`isSkip=false` |
| 顶栏 40px 带（每 40px 取一点，共 32 点） | 32/32 落在顶栏、0 落在开屏 | 同左 |
| Playwright 真点「跳过」（不 force，3s） | 超时（被顶栏截走） | 超时 |

截图（自己 Read 过）：中文轨整条顶栏（「项目库」+ 右侧两枚图标）画在开屏上面，「跳过 ›」只在 y≈38 露出下半截；英文轨同样（「Projects」、「Skip ›」被切掉上半）。

## 根因三层

- **症状**：开屏动画开着时，「跳过」点不到，只能等约 13 秒放完。
- **直接原因**：开屏手写 `fixed inset-0 z-[60]`，顶栏所在的 Mantine `AppShell` 没有传 `zIndex`，取 Mantine 默认 `100`（`getDefaultZIndex('app')`）。10-08 外壳重做（`f59b38d80`）把顶栏放进 `AppShell.Header` 之前，没有任何东西的层级高过 60 又盖到开屏上；之后顶栏 100 > 开屏 60，整条顶栏画在开屏上面，「跳过」（`top-7`，y 28–46）有 12px 在顶栏 40px 带里。
- **类根因**：全屏层（`position: fixed`）的层级由各处手敲的数字决定，而不是只走 `src/design/overlayLayers.ts` 这一份刻度；外壳自己的层级（Mantine 默认 100）也不在刻度里，所以谁也说不清「开屏该在顶栏上面还是下面」。设计系统 §2.0 写了「禁止硬写数字」，但没有任何门岗拦；`src/` 里的手写数字层级远不止简报数到的 6 处（简报只数了 `fixed inset-0 z-[N]` 这一种写法；行内 `zIndex`、命名常量、没有 `inset-0` 的 `fixed` 层都没数），和任意 ≥100 的数字层级一样没人管；确切清单以扫描器与基线为准（动手后在交付报告里给数）。还有第二层：14 条走查经 `evals/lib/isoApp.mjs` 的 `dismissSplashIfPresent` 点掉开屏，它在 Playwright 真点超时后悄悄改用 DOM `click()` 兜底，所以 10-08 以来「跳过被盖住」在这些走查里一直是绿的。

## 入口表（door-map）

- `node scripts/door-map.mjs SplashIntro`：1 扇读门，`src/workbench/NomiStudioApp.tsx`（挂在公共根，视图之外）。
- `node scripts/door-map.mjs NOMI_OVERLAY_Z_INDEX`：14 扇读门（`AnchoredPopover`、`confirmDialog`、`menu`、`NomiSelect`、`overlays`、`nomiTheme` ×6 处、`ShellRail`、`feedbackLayer`、`ComfyuiWorkflowSettingsPage`、`director/panels/Popover`、`TimelineContextMenu`、`SpendConfirmDialog`、`SettingsDialog`），没有写门（常量）。
- 手写数字层级（扫描器普查，见 ★3 与基线 `scripts/overlay-z-baseline.json`）：同类入口按形状分 5 种：className `z-[N]`、行内 `zIndex: N`、`zIndex={N}`、命名常量 `*_Z_INDEX = N`、CSS `z-index: N`；已有的都登记基线，开屏两处本单迁掉。
- 外壳层级来源：只有 `ShellFrame.tsx` 一处 `AppShell`（`git grep "<AppShell"`）。

| 格 | 结论 | 证据 |
|---|---|---|
| ★1 用户怎么用 | **当**创作者第一次打开 Nomi（或在设置「关于」点「重看开屏动画」）**我想**看够了或不想看时点一下右上「跳过 ›」就进项目库，**以便**不用干等约 13 秒。步骤：①开屏全屏出现 → ②「跳过 ›」在最上层、整条顶栏被开屏盖在下面 → ③点它 → ④开屏淡出（0.44s）→ ⑤项目库可用（顶栏「项目库」/ Projects、新建入口都在）；重看路径：设置「关于」→「重看开屏动画」→ 设置先关、开屏再放 → 同样点得到。**不做什么**：不改开屏的样子 / 位置 / 时长；不挪「跳过」；不碰顶栏内容；其余已有的手写层级不在本单迁（登记基线，逐处写判档理由，留待以后迁；实测被盖住用不了的除外）；Windows 原生窗口按钮区与「跳过」位置的关系不在本单（见 ★9 残余风险）。**已知坑**：Mantine `AppShell` 默认 100；开屏在 React 树内不走 BodyPortal，和顶栏同在根层叠上下文里比大小。**真实任务**：①全新安装、中文系统首次启动 → 点跳过 → 进项目库；②全新安装、英文系统首次启动 → 点 Skip → Projects；③在设置「关于」里重看开屏 → 点跳过。**指标与量具**：主指标 = 首启「跳过」中心最上层是按钮本身的比例，修前 0/2（探针 zh、en 都落在顶栏「全局操作」），目标 3/3（zh-CN、en-US、de-DE→en 三轨），量具 `tests/ux/first-launch-system-locale.walk.mjs`；质量指标 = 真点一下后开屏 3s 内消失且项目库可用的比例，修前 0/2（真点超时），目标 3/3，同量具；护栏 = ①开屏盖住整条 40px 顶栏带（采样点 100% 命中开屏）同量具；②层级阶梯 `shellChrome < floatingPanel < applicationModal < dialog < popover < confirmation < feedback`，量具 `src/ui/feedbackLayer.test.ts`；③`fixed` 或 ≥100 的手写数字层级总数 ≤ 基线，量具 `pnpm run check:tokens` 第 9 类；④花钱确认卡仍压在素材预览浮层上，量具 `tests/ux/overlay-z-order.walk.mjs`。 | `tests/ux/first-launch-system-locale.walk.mjs`；`src/ui/feedbackLayer.test.ts`；`pnpm run check:tokens`；`tests/ux/overlay-z-order.walk.mjs` |
| ★1b 连带界面 | 没有新增文案，开屏文案沿用 `onboardingProviders.splash.*`（中英）。开屏现在盖在顶栏、更新弹窗（130）、溯源面板（210）这些低档层之上：开屏播放期间它们即使弹出也被盖住，开屏结束后才看得见——可接受，开屏最长 13 秒且随时可跳。**花钱确认卡（`dialog` 9100）、设置（`applicationModal` 9000，同档，DOM 后者在上）、菜单 / 下拉（`popover`）、toast（`feedback`）都仍在开屏之上**，所以开屏期间弹出的付费确认不会被盖住。Agent 回执、通知、任务列表、错误卡、撤销提示：不涉及。 | `tests/ux/overlay-z-order.walk.mjs`；本卡 ★9 B |
| ★2 谁说了算 | 概念「全局层级刻度」唯一 owner = `src/design/overlayLayers.ts` 的 `NOMI_OVERLAY_Z_INDEX`（设计系统 §2.0）；允许的消费者 = 设计系统原语、Mantine 主题默认、需要全局层的业务层，只经 `style.zIndex` / `z-<档>` 类名读它。碰 1 个概念；同一份事实存 1 份（CSS 变量 `--nomi-z-*` 与 Tailwind `zIndex` 刻度由它派生）。**顶栏层级的来源（实测）**：Mantine `AppShell.Header` 的 `--app-shell-header-z-index` = `AppShell` 的 `zIndex` prop，`ShellFrame` 没传，取默认 100。**决定**：在刻度里登记最低一档 `shellChrome: 100`（等于 Mantine 默认，行为不变，只是有了名字和不变量），并在 `src/theme/nomiTheme.ts` 的 `components.AppShell.defaultProps.zIndex` 接上——和 `Modal` / `Drawer` / `Menu` / `Popover` / `Select` 同一处接线，`ShellFrame` 不再各传一份（不留两处）；不选「`ShellFrame` 显式传 `zIndex`」是因为主题接线对将来任何新增的 `AppShell` 都生效，而 `ShellFrame` 传值只管这一个。开屏两处 `z-[60]` 改 `z-application-modal`（§2.0 判档口径「接管整屏」）。没有靠「东西不见了」猜意图：开屏何时消失仍由显式 `finish()`（点跳过 / 5 段放完）。同步 §2.0 的表与档数（六档 → 七档）。 | `node scripts/door-map.mjs SplashIntro`（1 扇）；`node scripts/door-map.mjs NOMI_OVERLAY_Z_INDEX`（14 扇读门）；`git grep "<AppShell"`（1 处） |
| ★3 一致与复用 | **复用**：门岗扩现成的 `check:tokens`（`scripts/check-design-tokens.mjs`）加第 9 类，扫描器放 `scripts/lib/overlayZScan.mjs`、自证放 `scripts/overlayZScan.test.mjs`，基线 `scripts/overlay-z-baseline.json` 用 `{ 文件: { count, reason } }`——和同文件第 7 类 `accent-outline-baseline.json` 一模一样的做法，**不新起平行脚本**；Mantine 接线与 `Modal` 等同处；`SettingsDialog` 已是 `applicationModal`，开屏同档。**第二份定义**：`FULLSCREEN_Z_INDEX = 3000`（`fullscreenZIndex.ts`）是刻度之外的另一份数字，有自己的不变量测试（`feedbackLayer.test.ts`），本单登记基线、不并入。**判据（写进 §2.0 一句话）**：视口级层（`position: fixed`）的层级只许走刻度；任何 ≥100 的手写数字层级也不许（100 以下是组件内局部层叠，随组件走）；形状覆盖 className / 行内 style / `zIndex={N}` / 命名常量 / CSS。 | `pnpm run check:tokens`；`git grep -n "z-\[[0-9]"`；`node --test` 之外的 `pnpm exec vitest run scripts/overlayZScan.test.mjs` |
| ★4 全状态 | 开屏只有一个状态机：播放第 1–5 段（「跳过」随时可点）→ 点跳过或第 5 段放完 → `leaving` 0.44s 淡出 → 卸载。**取消中**：淡出的 0.46s 里再点一次，`doneRef` 守卫不重复收尾（现状，不改）。空 / 加载 / 失败 / 部分成功 / 过期：不适用——开屏不依赖模型、网络或数据；`AudioContext` 创建失败静默降级（现状，不改）。**能力不可用**：不适用，没有要模型或外部资源的动作。文案：无新增，沿用 i18n 中英。 | 走查截图（中英）；`check:i18n` |
| ★9 验收与回滚 | **验收清单（动手前写全，实现线按它自验、验收线只核它）**：A 中 / 英 / de→英三轨真机（隔离资料）：开屏出现 → 「跳过」中心 `elementFromPoint` 命中按钮本身 → 真点一下 → 开屏关掉、项目库可用；截图自己 Read 过。命令 `python3 /Users/aoqimin/Desktop/Nomi/.claude/worktrees/coord-main/scripts/with-gates-lock.py -- node tests/ux/first-launch-system-locale.walk.mjs`。B 开屏盖住整条 40px 顶栏带（32 个采样点全部命中开屏），同一次运行里顶栏图标点不到。C 阳性对照（同一次运行内）：把开屏内联 `z-index` 改回 60，A 的断言必须翻红（命中顶栏「全局操作」）。D 反例（源码）：把 `SplashIntro` 改回 `z-[60]` → 重建 → 走查红；还原 → 重建 → 绿。E 反例（门岗）：`fixed` 元素新写 `z-[123]` / 行内 `zIndex: 123` / 命名常量 `FOO_Z_INDEX = 123` / CSS `position: fixed; z-index: 123` → `pnpm run check:tokens` 红，还原绿；合规写法（`z-application-modal`、`style={{ zIndex: NOMI_OVERLAY_Z_INDEX.dialog }}`、`absolute z-[2]`）不误伤。F 不变量测试：`shellChrome` 是最低档且小于其余每一档；`nomiTheme` 的 `AppShell` 默认 zIndex 等于 `shellChrome`；渲染 `ShellFrame` 得到的顶栏层级等于 `shellChrome`。G `tests/ux/overlay-z-order.walk.mjs` 照旧绿。H `scripts/settings-model-access-save-first-walkthrough.mjs` 能过开屏那一步（它后面在设置页「自定义 API」那步红是走查自己过时，不归本单，照实记）。I `dismissSplashIfPresent` 的 DOM 兜底：真点超时且中心被别的元素盖住时抛错，没被盖住时行为不变；单测覆盖两支。J `pnpm run gates` 退出码 0；推送前快检 `NOMI_PR_BODY_FILE=.tmp-pr-body.md node scripts/pre-push-contracts.mjs` 通过。**这一类会从哪回来**：入口——另一个全屏层手写数字（门岗拦新增、基线只减）、另一个 `AppShell`（主题接线）；形状——5 种（见 ★2 入口表）都有红例和绿例；边界——局部层叠（`absolute`、<100）不受限，不误伤；版本——Mantine 升级改默认 100 不影响（显式接线 + F）；平台——Windows `titleBarOverlay` 原生按钮区（高 40，约 138px 宽）与「跳过」位置的重叠本机测不到，写进残余风险交协调；旧数据——不涉及，`nomi:splash:v1` 键语义不变。**回滚**：revert 修复提交（`SplashIntro.tsx`、`overlayLayers.ts`、`nomiTheme.ts`）；门岗与基线可独立保留。**独立验收**：验收线待协调派（编号不得与 I-splash-skip 相同）。 | 上面各命令；`## 独立验收` 一节 |

### 结构决定
开屏进刻度的 `applicationModal`，顶栏作为刻度地板 `shellChrome` 进同一份刻度；手写数字层级由 `check:tokens` 第 9 类按棘轮拦（新增红、清理黄），存量逐文件带判档理由登记。走查层面，首启走查在开屏出现时就断言「跳过」可点，`dismissSplashIfPresent` 不再静默兜底。

### 拍板图清单：链接
不适用：纯 bug 修复（`pure-bugfix`），不改布局、元素、文案，只修层级；开屏样子不动，修后的真机截图（中英）由走查产出并附在 PR 正文。
