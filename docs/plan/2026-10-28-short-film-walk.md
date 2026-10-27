# 短片走查在 Mac 和夜跑上都量得到「运行中 / 停止 / 重开」（I-short-film-walk）

改动名：`agent-v4-short-film` 走查的两处过期前提 + `agent-spend-priced-card` 走查漏 await　　线：I-short-film-walk　　类别：[其他]（测试 / 走查；不碰 `src/`、`electron/`）

> 纯走查改动：按 `docs/engineering/design-card.md` 只填带 ★ 的 5 格（1、2、3、4、9）。不新增功能、不改界面，所以 ★0 / ★7 / 格 5–8 不适用，理由写在各格里。

## 根因（证据在前）

| | 症状 | 直接原因 | 类根因 |
|---|---|---|---|
| A　夜跑红（ubuntu，run 40478193665，main 0c87662bc，产物 `nightly-walks-2`） | 走查 262 行 `toHaveAttribute('placeholder', /排队/)` 收到 null | Agent 输入框 2026-10-12（ed086ea3e）起是 PromptEditor（TipTap）：`[data-v4-control="input"]` 是 contenteditable，没有 `placeholder` 属性；占位是 Placeholder 扩展挂在**空段落**上的 `data-placeholder`，再由 CSS `::before { content: attr(data-placeholder) }` 画出来（`src/workbench/assets/tiptapPlaceholderClasses.ts`）。同一天 dabcf69af 把「读字」迁到了统一出口，占位这一处漏了 | 走查按组件当年的形态（标签 / 属性）读产品状态，产品换形态它就悬空。「读输入框的字」有统一出口 + 门（`composer-input-read`），「读输入框的占位」没有；10-12 起这一句就悬空，而这条走查只在夜跑里跑，没人在 PR 里看见 |
| B　Mac 本机红 | 213 行 `最小窗下对话流只溢出 35px`（本线在 main b51835990 上实跑复现，42 秒退出码 1） | 前提的「量」靠 fixture 回稿撑高度：`RECAP_TEXT` 用 `\n` 连五行，markdown 里单个换行是软换行，五镜渲染成**一段**（失败截图可见），本意是逐镜一行；高度只刚好够（任务书：Linux 够 80，Mac 只有 35） | 防恒真式的前提，其「量」由内容决定，却没有余量、也没记录实测值，平台字体 / 窗口底板一差就掉 |
| C　`agent-spend-priced-card` 夜跑红 | 55 行 `Received: Promise {}` | `pricedRow` 里 `card.locator(...).count()` 放进数组没 `await`（d3be41f5d，10-25 引入），`row.actionCount` 是个 Promise | 同 A：只在夜跑里跑，改走查的提交没真跑；它红着，就挡住了「报价卡动作行只留取消和主按钮」这条花钱卡检查 |

## 怎么改（换，不补）

1. **262 行**：`agent-runtime-walk-support.mjs` 新增 `composerPlaceholder` / `expectComposerPlaceholder`（与 `composerText` / `expectComposerText` 同族，Agent 输入框占位的**唯一读出口**），读的是空段落 `::before` 算出来的字——用户眼睛看到的那句；文案取词典 `agentPanelV4.placeholderRunning`，不写字面量。同一提交删掉旧的 `toHaveAttribute('placeholder', /排队/)`，不留并行写法。
2. **213 行**：80px 阈值不动、前提不删、不按平台跳过，**靠内容**——`RECAP_TEXT` 改成一镜一段（`\n\n`，一份真要「打印贴墙」的清单本来就该这样）并把每镜写全；实测溢出写进 `walk.report.minWindowFlowOverflowPx`，余量从此看得见。
3. **priced-card**：补上 `await`（单独一个提交，方便回滚）。

## ★1 用户怎么用

当我（发版负责人 / 夜跑值班）要在 0.24 发版前确认「Agent 从零做一条 20 秒短片」能走完——写脚本 → 改文稿 → 去画布 → 运行中改主意点停止 → 关掉重开东西还在——我想让这条走查在 Mac 本机和 Linux 夜跑上都能从头跑到尾，以便「停止（关系到花钱）」「重开（关系到丢东西）」这两件事有真量具。

1. 走查在隔离资料目录里起真 Electron，供应商是 loopback 夹具，每次模型调用预先声明；
2. 写脚本、改文稿、去画布；
3. 发一条会被夹具挂住的指令 → 输入框占位变成排队提示，停止钮出现；
4. 点停止 → 回合退出运行态，小球「出错」档接住坏消息；
5. 关掉整个 App 再开同一个项目 → 文稿、对话、收据原样在，重启不产生任何模型调用。

**不做什么**：不改产品（`src/`、`electron/` 不碰，反例③临时去掉再按字节还原）；不降 80px 阈值、不删前提、不按平台跳过；不扫别的走查里同类写法（夜跑分诊线 R-nightly-new-reds 在普查，测试欠账挪 0.25）；不新增英文段。**已知坑**：占位文字不是属性、是 CSS 伪元素；markdown 单个换行是软换行；`::before` 的 `content` 读出来带引号。

**真实任务**：①本走查本身（真 Electron + 隔离资料 + loopback 夹具，零花费），Mac 连跑 2 遍；②同批的 `agent-spend-priced-card` 走查（中英两段）；③夜跑 ubuntu（合并后由协调看 `nightly-walks` 产物，本机没有 Linux，记 `unverified`）。真付费不在本单。

**指标（目标 → 信号 → 指标，量具都点名）**

| 目标 | 信号 | 指标 / 基线 → 目标 | 量具 |
|---|---|---|---|
| 短片走查在 Mac 上量得到运行中 / 停止 / 重开 | 退出码、最后一步名字、总秒数 | 连跑 2 遍退出码 0；基线 main 上 0/1（213 行 35px） | `node tests/ux/agent-v4-short-film.walk.mjs`（report.json 的 `result`） |
| 运行中那句断言证的是「用户看到的」 | 产品去掉那句 → 走查红 | 反例③ 真红，按字节还原后回绿 | 同一走查 |
| 前提有余量，不是刚好够 | 实测对话流溢出 px | ≥ 160px（阈值 80 的 2 倍）；基线 Mac 35px | report.json 的 `minWindowFlowOverflowPx` |
| 不新增「测试抄文案」 | copy-literals 基线 | `agent-v4-short-film` 1 → 1，`agent-spend-priced-card` 0 → 0 | `pnpm run check:test-copy-literals` |
| 花钱卡检查重新量得到 | priced-card 走查中英退出码 | 红 → 0，`actionCount` 为 2 | `node tests/ux/agent-spend-priced-card.walk.mjs` |
| Linux 夜跑保持绿 | 夜跑结果 | 未验证：缺量具（本机无 Linux），合并后看夜跑 | `nightly-walks` 产物 |

## ★1b 连带界面

不适用：不改任何界面、回执、通知、错误卡的文字；走查只读现有文案（词典 `agentPanelV4.placeholderRunning`）。

## ★2 谁说了算

- 「Agent 输入框此刻画给人看的占位」：产品侧 owner = `AgentPanelV4Composer`（选哪一句）+ `PromptEditor` / Placeholder 扩展（怎么挂）+ i18n 词典（说什么）；走查只读不写。
- 读它的走查入口（`git grep` 数过）：Agent 输入框的占位只有 `agent-v4-short-film` 这一处在读；`archetype-modebar.e2e.mjs:181` 读的是生成节点的描述框（另一个组件，已按 TipTap 的 `data-placeholder` 写）；其余读 `placeholder` 属性的走查读的都是普通 `<input>`（如 `library-layout.walk.mjs:177`），正当。新 helper 成为 Agent 输入框占位的唯一读出口。
- 同一份事实存几份：1（词典）。没有靠「东西不见了」去猜意图。碰 1 个概念（走查如何读输入框占位），没有新增 owner。

## ★3 一致与复用

- 复用：`uiText`（`tests/ux/full-walk/invariants.mjs`）按键取文案；helper 与 `composerText` / `expectComposerText` 同文件同风格；读伪元素用浏览器标准的 `getComputedStyle(el, '::before')`，不自写任何东西（P0：这不是我们独有的）。
- 第二份定义：无。旧的 `toHaveAttribute('placeholder', …)` 同提交删掉。
- `check:test-copy-literals`：断言里不抄词典文案；`STARTER_FIRST`（基线里那 1 处）不动。

## ★4 全状态（走查读到什么）

- 运行中、框空：读到词典里那句排队提示。
- 空闲、框空：读到另一句（`agentPanelV4.placeholder`），不会被当成排队提示。
- 框里有字：占位不画，读到 `null`。
- 样式丢了（属性在、`::before` 画不出）：`content` 是 `none`，读到 `null`——只读属性会在这种坏法下仍然绿，这是选伪元素的理由。
- 取消中 / 停止后：composer 退出运行态（走查原有断言）。
- 能力不可用：不适用（不涉及要模型或外部资源才做得了的动作；供应商是 loopback 夹具）。
- 文案：走 i18n 词典，zh-CN 一段；英文词典同键存在（`Keep typing — it will be queued…`），本走查原本只有中文一段，本单不新增英文段（记 `unverified`）。

## ★9 验收与回滚

**验收**：另一条线 / 协调用下面这张清单核；实现线按它自验并在 PR 正文附「反例 → 结果 → 证据」表。验收线只核这份清单（新发现记后续，除非属于本 PR 引入的丢数据 / 花错钱 / 崩溃 / 安全）。

| # | 检查项 | 怎么验 | 通过标准 |
|---|---|---|---|
| 1 | 短片走查在 Mac 上从头到尾退出码 0，连跑 2 遍 | `python3 …/with-gates-lock.py -- node tests/ux/agent-v4-short-film.walk.mjs`，每遍记最后一步的名字和总秒数 | 两遍都 0；最后一步是 `12-cold-restart` |
| 2 | 262 那一步断言的是产品真实显示的排队提示 | 走查截图 `09-running`：亲眼 Read | 截图里看得见那句话；断言读的是空段落 `::before` 的 content，文案取自词典键 `agentPanelV4.placeholderRunning` |
| 3 | 反例①：断言改回 `toHaveAttribute('placeholder', …)` | 临时改回、跑走查 | 真红在运行中提示那一步（收到 null，与夜跑同形）；按字节还原后回绿 |
| 4 | 反例②：前提阈值临时改成 1000px | 临时改、跑走查 | 前提那道检查真抛，信息里带实测 px；按字节还原后回绿 |
| 5 | 反例③：产品代码临时去掉运行中的排队提示 | 临时改 `AgentPanelV4Composer.tsx`、重建、跑走查 | 走查在运行中提示那一步真红；按字节还原 + 重建后回绿，`git diff` 为空 |
| 6 | 前提靠内容，没有平台分支，阈值没降 | 读 diff | `80` 仍在、前提仍在、无 `process.platform` 分支；`minWindowFlowOverflowPx` ≥ 160 |
| 7 | 停止三态与「停下后不再发请求」 | 读走查报告 | `textRequests` = 声明过的请求数、`unexpected` 为空（夹具对没声明的请求回 400 并在收尾时 `assertClean` 报红）；重启前后请求计数相等（走查原有断言） |
| 8 | 重开：文稿 / 对话 / 收据都还在 | 走查原有断言全过 | 退出码 0；画布面本任务没有节点，只验画布面的对话与同一条 lane（见下「没覆盖」） |
| 9 | `agent-spend-priced-card` 补 await 后中英都过 | 经锁跑一遍 | 退出码 0；`actionCount` 为 2；若红在产品断言：停，截图交回 |
| 10 | 不新增测试抄文案；静态门全绿 | `pnpm run check:test-copy-literals`、`check:walkthroughs`、`pnpm run gates` | 基线 `agent-v4-short-film` 仍 1、`agent-spend-priced-card` 仍 0 |
| 11 | 推送前快检 + PR 正文判据 | `NOMI_PR_BODY_FILE=.tmp-pr-body.md node scripts/pre-push-contracts.mjs` | 红的项先改；贴最后几行 |
| 12 | 无残留进程、无多余产物 | `procs-in.sh <工作树>`，只停自己起的（按 PID） | 无残留；构建产物与走查截图只留报告要用的 |

**这一类会从哪些入口、形状、边界、版本回来**

- 别的走查再按 textarea 的形态读 Agent 输入框：`toHaveValue` / `inputValue` 已有门（`composer-input-read`）；用 `placeholder` 属性读 Agent 输入框这一种写法本仓 `git grep` 只有本条一处，本单换掉后为 0。把 `placeholder` 读也加进 `composer-input-read` 门是结构性预防，但改的是 `scripts/`，超出「只改这条走查」，写进报告交协调拍板。
- 产品再换输入框形态：helper 读「画出来的字」，不依赖标签名 / 属性，只依赖「空编辑器 + `::before`」这一层（Placeholder 扩展 + `tiptapPlaceholderClasses.ts`）；那层变了，反例③同形红，不会假绿。
- 别的平台 / 字体 / 窗口底板：内容更长则余量更大；阈值不动，报错带实测 px，余量记进报告，下次是「看得见在变小」而不是「某天突然红」。
- 同类前提（对话流溢出才有信号）：`git grep` 里只有这一处「溢出小于阈值就拒测」的前提。
- 漏 `await`：本线对 `tests/`、`evals/` 扫了数组里 `await x, y.count()` 这一形状和 `expect(y.count())`，全仓只有 priced-card 这 1 处（扫法写进报告）；别的形状不在本单。
- 夜跑独占：走查只在夜跑里跑，是红两周才被看见的原因；这不在本单范围，R-nightly-new-reds 在查。

**没覆盖（如实）**：Linux 夜跑（本机无 Linux，`unverified`）；英文界面段（本走查没有，`unverified`）；画布节点重开后还在（本任务夹具只读画布、没建节点，走查只验画布面的对话与同一条 lane）；真付费。

**回滚**：纯走查改动，`git revert` 对应提交即可（设计卡一个提交、短片走查一个提交、priced-card 一个提交）。
