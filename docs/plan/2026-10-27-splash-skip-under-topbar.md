# 设计卡：开机动画「跳过」被顶栏压住——全屏层的层级只走刻度

改动名：开机动画「跳过」点不到，全屏层的层级只走刻度  线/负责人：I-splash-skip（Mac，Claude Sonnet，实现线）  类别：其他（纯 bug 修复 + 门岗，不出样张）

### 功能分类
- [x] 新界面 / 改交互：只因路径命中（`src/design/overlayLayers.ts`、`SplashIntro.tsx`）；没有新增或重排任何元素，按 `pure-bugfix` 例外认领。
- [ ] 花钱
- [ ] 长跑 / 可打断
- [ ] Agent 行为
- [ ] 大数据量 / 画布 / 长列表
- [ ] 生成效果
- [ ] 数据格式
- [x] 新增功能 / 性能：只因路径推出（改 `src/**/*.tsx`）；没有新增用户操作，`perf-scenario` 写不适用（★7 同理）。

## 待拍板（实现线停在这里，不自己挑）

任务书的停点：「实测发现顶栏压在上面是有意的设计……停下，把两个方案的代价写清楚交协调，不要自己挑」。实测触发了它，原因不是任务书猜的那一条，而是更深一层：

**光把开屏抬到顶栏之上，「跳过」真用户很可能还是点不到，而所有自动检查都会绿。** 依据全部是仓库里已有的、带测试的设计，不是我的推断：

1. 40px 顶栏**同时是系统拖拽带和窗口按钮区**。命中测试看几何、不看 DOM 层级，盖在它上面的东西落在带里的点击会被系统当成拖窗口吃掉（`src/ui/app-shell/windowChrome.ts` 头注；issue #58 Windows v0.19.0「浮卡右上角 × 点中心没反应」；2026-09-04 导演台整条顶部工具栏点不动，根因合同 `docs/fixes/2026-09-04-fullscreen-overlay-windows-windowbar.root-cause.json`）。
2. 类不变量早已写成测试：`src/ui/app-shell/windowChrome.test.ts`「全屏浮层不盖住合一顶栏」——导演台、ComfyUI 整页、全景、素材预览一律 `top: currentFullscreenOverlayTopOffset()`（= 40），不许 `fixed inset-0`。**开屏是 `fixed inset-0`，不在那份名单里，是同一类里没扫到的一员。**
3. 「跳过」`top-7 right-9`：矩形 y 28–46、宽约 33，有 12px 在 0–40 的顶栏带里，中心 y=37 也在带里。Windows 上这条带的右端 ≈138px 还是原生最小化 / 最大化 / 关闭三键（`electron/mainWindowChrome.ts` 的 `titleBarOverlay.height = 40`），「跳过」整个落在三键区水平范围内——中心点点下去是最大化（靠右边缘是**关闭**）。这条我在 Mac 上测不到，是按代码推算，已标明。
4. 合成点击绕过这一切：`tests/ux/director-windowbar.walk.mjs` 头注原话「CDP 合成的点击直接进渲染进程，绕过原生命中测试，就算真用户点不动它也会绿」。所以只抬 `z-index`、再让 Playwright 点一下，会得到一条绿的走查和一个仍然点不到的按钮。

我在**不改源码**的前提下，用运行时改样式量了四种候选（探针：`/Users/aoqimin/Nomi-coord/tmp/I-splash-skip/probe-options.mjs`，中英两轨，1280×933 内容区，macOS，隔离资料）。「系统视角」是按 Chromium 收集规则（DOM 顺序、后者覆盖前者）算出的中心点区域状态，不是真实 OS 点击——安静模式的窗口鼠标穿透，量不了真点：

| 方案 | DOM 命中跳过 | 与 40px 拖拽带重叠 | 系统视角（Mac） | Windows 推算 | 看起来 |
|---|---|---|---|---|---|
| 现状（z-60） | 否（落在顶栏「全局操作」） | 12px | — | — | 顶栏画在开屏上，「跳过」被切掉半截 |
| A 只抬层级（z-9000，跳过不动） | **是** | 12px | 中心在 `no-drag`（碰巧：右上的 `role=toolbar` 图标簇是 `no-drag`，簇多宽决定跳过哪几个像素能点） | 中心落在原生三键区，点到最大化 / 关闭 | 全屏，样子不变 |
| B 抬层级 + 跳过下移到带外（top 52px） | 是 | 0 | 带外，无条件可点 | 带外，不碰三键 | 全屏，仅「跳过」低 24px |
| C 抬层级 + 跳过加 `app-no-drag`（位置不动） | 是 | 12px | `no-drag`，靠 DOM 顺序的挖洞语义（#58 当年的补法） | 仍在三键区，`no-drag` 管不了原生三键 | 全屏，样子不变 |
| D 开屏整体从顶栏下沿开始（顶栏留在上面，同其它全屏层） | 是 | 0 | 带外 | 带外 | 顶栏（「项目库」+ 右侧图标）一直在开屏上方，开屏整体下移 20px 起 |

**推荐 B**（创作者视角：开屏是一次性的 13 秒品牌片，要的是整屏的样子，和在 Mac / Windows 真鼠标下「跳过」一定点得到；B 是唯一两样都满足、且不靠挖洞语义的）。它的代价：「跳过」下移约 20–24px（任务书说不改位置，所以停下问）；开屏盖住顶栏，要在 `windowChrome.test.ts` 登记开屏是「盖住顶栏但可交互内容全在带外」的有理由例外。D 次选：和其余全屏层完全一致、零例外，代价是开屏不再整屏、顶栏图标在开屏期间还能点。A、C 不推荐：A 在 Windows 点到窗口按钮，C 靠挖洞语义且 Windows 三键管不了。拍板后的实现量都很小（开屏 2 个类名 + 1 处 `top` + 走查几何断言 + 删基线里开屏那一条），见 ★9。

**本分支已交付的、与这个选择无关的部分**：外壳层级进刻度（`shellChrome`）、手写数字层级门岗与基线（`check:tokens` 第 9 类）、走查 helper 不再悄悄放过被盖住的「跳过」。开屏本身（`SplashIntro.tsx`）、首启走查的断言、根因合同留给拍板之后一次做完——合同的类根因要写进拖拽带这一层，现在写会写错。

## 先看问题（实测，构建 = origin/main ea724ce51，无源码改动）

首次启动的开屏动画右上「跳过 ›」点不到，中英一样。macOS、隔离资料、`--lang=zh-CN` / `--lang=en-US` 两轨、1280×933 内容区（探针与原始 JSON 在 `/Users/aoqimin/Nomi-coord/tmp/I-splash-skip/`，不进仓库）：

| 量 | zh-CN | en-US |
|---|---|---|
| 开屏 `.nomi-splash` | `position: fixed`，`z-index: 60`（`SplashIntro.tsx` 手写 `z-[60]`，主层与淡出层各一处） | 同左 |
| 顶栏外层 Mantine `AppShell.Header`（`header.m_3b16f56b`） | `position: sticky`，`z-index: 100`，`--app-shell-header-z-index: 100` | 同左 |
| 顶栏内层 `ShellTopBar` 的 `<header data-shell-topbar>` | `position: relative`，`z-index: auto`（协调探针读到的 `auto` 就是它，不是真正起作用的那一层） | 同左 |
| 「跳过」中心 (1227.6, 37) 的 `elementFromPoint` | 顶栏里 `role="toolbar"`「全局操作」，`isSkip=false` | 顶栏里「Global actions」，`isSkip=false` |
| 顶栏 40px 带（每 40px 取一点，共 32 点） | 32/32 落在顶栏、0 落在开屏 | 同左 |
| Playwright 真点「跳过」（不 force，3s） | 超时（被顶栏截走） | 超时 |

截图（自己 Read 过）：中文轨整条顶栏（「项目库」+ 右侧两枚图标）画在开屏上面，「跳过 ›」只在 y≈38 露出下半截；英文轨同样（「Projects」、「Skip ›」被切掉上半）。

## 根因三层

- **症状**：开屏动画开着时，「跳过」点不到，只能等约 13 秒放完。
- **直接原因**：开屏手写 `fixed inset-0 z-[60]`，顶栏所在的 Mantine `AppShell` 没传 `zIndex`，取 Mantine 默认 100（`getDefaultZIndex('app')`）。10-08 外壳重做（`f59b38d80`）把顶栏放进 `AppShell.Header`（Mantine 默认 100）之后，顶栏 100 > 开屏 60，整条顶栏画在开屏上面，「跳过」（y 28–46）有 12px 在顶栏 40px 带里。
- **类根因（两层，缺一不算修好）**：
  1. 全屏层（`position: fixed`）的层级由各处手敲的数字决定，而不是只走 `src/design/overlayLayers.ts` 这一份刻度；外壳自己的层级（Mantine 默认 100）也不在刻度里，谁也说不清「开屏该在顶栏上面还是下面」。设计系统 §2.0 写了「禁止硬写数字」，但没有任何门岗拦；同一类这是第三次（09-07 画布浮层 `z-[9999]` 压过花钱确认卡；10-09 #1136 文稿右键菜单 `fixed z-50` 沉到抽屉下面）。原来只有一个窄门岗 `portalLayer.structure.test.ts`（只认 `createPortal` 文件里同一行的 `fixed` + `z-数字`，一个存量），本单换成覆盖五种写法的 `check:tokens` 第 9 类并删掉它。
  2. 全屏层与系统拖拽带 / 窗口按钮区的几何关系没有统一规则覆盖到开屏（见上「待拍板」）。
  3. 第三层：14 条走查经 `evals/lib/isoApp.mjs` 的 `dismissSplashIfPresent` 点掉开屏，它在 Playwright 真点超时后悄悄改用 DOM `click()` 兜底，所以 10-08 以来「跳过被盖住」在这些走查里一直是绿的。已修（见 ★9 I）。

## 入口表（door-map）

- `node scripts/door-map.mjs SplashIntro`：1 扇读门，`src/workbench/NomiStudioApp.tsx`（挂在公共根，视图之外）。
- `node scripts/door-map.mjs NOMI_OVERLAY_Z_INDEX`：14 扇读门，没有写门（常量）。
- 外壳层级来源：只有 `ShellFrame.tsx` 一处 `AppShell`（`git grep "<AppShell"`）；Mantine 里有层级默认值又被本仓用到的组件：`AppShell`（本单接线）、`Modal` / `Drawer` / `Popover` / `Menu` / `Select` / `MultiSelect`（主题里早已接线）、`Notifications`（`FEEDBACK_LAYER_Z_INDEX`）。
- 手写数字层级：扫描器普查 37 处 / 24 个文件（简报只数了 `fixed inset-0 z-[N]` 的 6 处）。按写法：className 26、行内 / 命令式 `zIndex` 9、命名常量 2、CSS 0、`zIndex={N}` 属性 0；按判据：`fixed` 视口级层 32、非 fixed 但 ≥ 地板 3、命名常量 2。全部登记基线，逐处写了判档理由（`scripts/overlay-z-baseline.json`）；其中开屏 2 处是临时条目。

| 格 | 结论 | 证据 |
|---|---|---|
| ★1 用户怎么用 | **当**创作者第一次打开 Nomi（或在设置「关于」点「重看开屏动画」）**我想**看够了或不想看时点一下右上「跳过 ›」就进项目库，**以便**不用干等约 13 秒。步骤：①开屏全屏出现 → ②「跳过 ›」点得到 → ③点它 → ④开屏淡出（0.44s）→ ⑤项目库可用；重看路径：设置「关于」→「重看开屏动画」→ 设置先关、开屏再放 → 同样点得到。**不做什么**：不改开屏动画本身（画面 / 时长）；不碰顶栏内容；其余已有的手写层级不在本单迁（登记基线，逐处写判档理由，留待以后迁；实测被盖住用不了的除外，本轮没有）。**已知坑**：Mantine `AppShell` 默认 100；系统拖拽带按几何命中（见「待拍板」）。**真实任务**：①全新安装、中文系统首次启动 → 点跳过 → 进项目库；②全新安装、英文系统首次启动 → 点 Skip → Projects；③在设置「关于」里重看开屏 → 点跳过。**指标与量具**：主指标 = 首启「跳过」中心最上层是按钮本身、且不落在系统拖拽带 / 原生窗口按钮区里的比例，修前 0/2（探针 zh、en 都落在顶栏「全局操作」），目标 3/3（zh-CN、en-US、de-DE→en），量具 `tests/ux/first-launch-system-locale.walk.mjs`（拍板后加断言）；质量指标 = 真点一下后开屏 3s 内消失且项目库可用的比例，修前 0/2（真点超时），目标 3/3，同量具；护栏 = ①层级阶梯 `shellChrome < floatingPanel < applicationModal < dialog < popover < confirmation < feedback`，量具 `src/ui/feedbackLayer.test.ts`；②手写数字层级总数 ≤ 基线，量具 `pnpm run check:tokens` 第 9 类；③花钱确认卡仍压在素材预览浮层上，量具 `tests/ux/overlay-z-order.walk.mjs`。**Windows 原生三键区那一条 Mac 测不到，标 `unverified`。** | `tests/ux/first-launch-system-locale.walk.mjs`；`src/ui/feedbackLayer.test.ts`；`pnpm run check:tokens`；`tests/ux/overlay-z-order.walk.mjs` |
| ★1b 连带界面 | 没有新增文案，开屏文案沿用 `onboardingProviders.splash.*`（中英）。开屏进 `applicationModal` 后会盖在更新弹窗（130）、溯源面板（210）这些低档层之上：开屏播放期间它们即使弹出也被盖住，开屏结束后才看得见——可接受，开屏最长 13 秒且随时可跳。**花钱确认卡（`dialog` 9100）、设置（`applicationModal` 9000，同档，DOM 后者在上）、菜单 / 下拉（`popover`）、toast（`feedback`）都仍在开屏之上**，所以开屏期间弹出的付费确认不会被盖住。Agent 回执、通知、任务列表、错误卡、撤销提示：不涉及。 | `tests/ux/overlay-z-order.walk.mjs` |
| ★2 谁说了算 | 概念「全局层级刻度」唯一 owner = `src/design/overlayLayers.ts` 的 `NOMI_OVERLAY_Z_INDEX`（设计系统 §2.0）；允许的消费者 = 设计系统原语、Mantine 主题默认、需要全局层的业务层，只经 `style.zIndex` / `z-<档>` 类名读它。碰 1 个概念；同一份事实存 1 份（CSS 变量 `--nomi-z-*` 与 Tailwind `zIndex` 刻度由它派生）。**顶栏层级的来源（实测）**：Mantine `AppShell.Header` 的 `--app-shell-header-z-index` = `AppShell` 的 `zIndex` prop，`ShellFrame` 没传，取默认 100。**决定（已做）**：刻度里登记最低一档 `shellChrome: 100`（等于 Mantine 默认，行为不变，只是有了名字和不变量），在 `src/theme/nomiTheme.ts` 的 `components.AppShell.defaultProps.zIndex` 接上——和 `Modal` / `Drawer` / `Menu` / `Popover` / `Select` 同一处接线，`ShellFrame` 不再各传一份；不选「`ShellFrame` 显式传 `zIndex`」是因为主题接线对将来任何新增的 `AppShell` 都生效。同值硬编码 100 拦不住的那一层由门岗拦（地板以上的手写数字都红）。没有靠「东西不见了」猜意图：开屏何时消失仍由显式 `finish()`。§2.0 的表与档数已同步（六档 → 七档，加门岗与几何规则两段）。 | `node scripts/door-map.mjs SplashIntro`（1 扇）；`node scripts/door-map.mjs NOMI_OVERLAY_Z_INDEX`（14 扇读门）；`git grep "<AppShell"`（1 处） |
| ★3 一致与复用 | **复用 / 换**：门岗扩现成的 `check:tokens`（`scripts/check-design-tokens.mjs`）加第 9 类，扫描器放 `scripts/lib/overlayZScan.mjs`、自证放 `scripts/overlayZScan.test.mjs`，基线 `scripts/overlay-z-baseline.json` 用 `{ 文件: { count, reason } }`——和同文件第 7 类 `accent-outline-baseline.json` 一模一样的做法，**不新起平行脚本**；同时**删掉**窄的 `src/design/portalLayer.structure.test.ts` 及它在 `pre-push-scan-guards.mjs` 的登记（它的一个存量并入基线），不留两套。Mantine 接线与 `Modal` 等同处。**第二份定义**：`FULLSCREEN_Z_INDEX = 3000`（`fullscreenZIndex.ts`）与 `ASSET_PICKER_Z_INDEX = 60` 是刻度之外的数字，登记基线、不并入。**判据（写进 §2.0 一句话）**：视口级层（`position: fixed`）的层级只许走刻度；任何 ≥ 地板（100）的手写数字层级也不许（地板以下、不是 fixed 的数字是组件内局部层叠）；五种写法 className / 行内 style / `zIndex={N}` / 命名常量 / CSS 全扫。扫描器的局限（写出来）：静态扫描不知道 Portal，`createPortal` 到 body 的 `absolute z-[50]`（地板以下）判不出来。 | `pnpm run check:tokens`；`pnpm exec vitest run scripts/overlayZScan.test.mjs`（25 例） |
| ★4 全状态 | 开屏只有一个状态机：播放第 1–5 段（「跳过」随时可点）→ 点跳过或第 5 段放完 → `leaving` 0.44s 淡出 → 卸载。**取消中**：淡出的 0.46s 里再点一次，`doneRef` 守卫不重复收尾（现状，不改）。空 / 加载 / 失败 / 部分成功 / 过期：不适用——开屏不依赖模型、网络或数据；`AudioContext` 创建失败静默降级（现状，不改）。**能力不可用**：不适用，没有要模型或外部资源的动作。文案：无新增，沿用 i18n 中英。 | 走查截图（中英）；`check:i18n` |
| ★9 验收与回滚 | **验收清单（动手前写全，实现线按它自验、验收线只核它）**：A 中 / 英 / de→英三轨真机（隔离资料）：开屏出现 → 「跳过」中心 `elementFromPoint` 命中按钮本身 → 真点一下 → 开屏关掉、项目库可用；截图自己 Read 过。命令 `python3 /Users/aoqimin/Desktop/Nomi/.claude/worktrees/coord-main/scripts/with-gates-lock.py -- node tests/ux/first-launch-system-locale.walk.mjs`。A′（拍板后，几何）「跳过」矩形与系统拖拽带（`-webkit-app-region: drag` 元素的矩形，减去更靠后的 `no-drag`）的重叠为 0，或它自己是 `no-drag`；且不落在 Windows 原生三键区（x ≥ 宽−138、y < 40）。B 开屏盖不盖顶栏按拍板结果断言（B 方案：顶栏带 32 个采样点全命中开屏；D 方案：顶栏在开屏之上）。C 阳性对照（同一次运行内）：把开屏内联 `z-index` 改回 60，A 的断言必须翻红。D 反例（源码）：把 `SplashIntro` 改回 `z-[60]` → 重建 → 走查红；还原 → 重建 → 绿。E 反例（门岗，**已做**）：`fixed` 元素新写 `z-[123]` / 行内 `zIndex: 123` / 命名常量 `FOO_Z_INDEX = 123` / CSS `position: fixed; z-index: 123` → `pnpm run check:tokens` 红（实测 4 处命中、`z-dialog` 与 `absolute z-[2]` 不误伤），还原绿。F 不变量测试（**已做**）：`shellChrome` 是最低档且小于其余每一档；`nomiTheme` 的 `AppShell` 默认 zIndex 等于 `shellChrome`；渲染 `ShellFrame` 得到的顶栏层级等于 `shellChrome`，阳性对照（主题默认改 7 顶栏跟着变 7、ShellFrame 自己传 `zIndex={100}` 则红）。G `tests/ux/overlay-z-order.walk.mjs` 照旧绿。H `scripts/settings-model-access-save-first-walkthrough.mjs` 能过开屏那一步（它后面在设置页「自定义 API」那步红是走查自己过时，不归本单，照实记）。I `dismissSplashIfPresent` 的 DOM 兜底（**已做**）：真点超时且中心被别的元素盖住时抛错，没被盖住时行为不变；`evals/lib/isoApp.test.mjs` 5 例。J `pnpm run gates` 退出码 0；推送前快检 `NOMI_PR_BODY_FILE=.tmp-pr-body.md node scripts/pre-push-contracts.mjs` 通过。**这一类会从哪回来**：入口——另一个全屏层手写数字（门岗拦新增、基线只减）、另一个 `AppShell`（主题接线）、另一个压在顶栏带里的全屏层可交互内容（A′ 的几何断言，拍板后补进走查，并把开屏登记进 `windowChrome.test.ts` 的名单或例外）；形状——5 种写法都有红例和绿例；边界——局部层叠不受限，不误伤；版本——Mantine 升级改默认 100 不影响（显式接线 + F）；平台——Windows `titleBarOverlay` 原生三键区本机测不到，`unverified`；旧数据——不涉及，`nomi:splash:v1` 键语义不变。**回滚**：revert 修复提交（`SplashIntro.tsx`）；刻度登记、门岗与基线可独立保留。**独立验收**：验收线待协调派（编号不得与 I-splash-skip 相同）。 | 上面各命令；`## 独立验收` 一节 |

### 结构决定
外壳作为刻度地板 `shellChrome` 进同一份刻度；手写数字层级由 `check:tokens` 第 9 类按棘轮拦（新增红、清理黄），存量逐文件带判档理由登记，基线里开屏那一条是临时的、修开屏的提交同时删；原来窄的 `portalLayer.structure.test.ts` 同提交删除。开屏自己怎么摆（抬层级 + 「跳过」下移到带外 / 整体让开顶栏 / 其它）停在拍板点。

### 拍板图清单：链接
不适用：纯 bug 修复（`pure-bugfix`）。注意：若拍板选 B 或 D，「跳过」或整个开屏的位置会动 20–24px，那一条要协调确认算不算「改界面」——它不增删元素、不改文案，只挪位置。
