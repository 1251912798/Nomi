# Nomi 0.24 交互方案（探索样张）

> 日期：2026-10-18 建，2026-10-19 同步到画布第 62 版或更新（版本号 `1792386632-a305`）。画布原件：https://claude.ai/artifact/RXjiGoUcsL9S691U9u6eZX（Nomi 0.24 交互方案，**需要用户账号**才能打开）。本目录是它的原样副本，不登录任何账号的 AI 也能拿去实现。

## 这是什么

这是 0.24 交互方案的**探索样张**，共 124 格，**没有全部拍板**（下面分组表写了每组状态，以用户 10-18 晚到 10-19 说的为准）。样张只是画面，不是实现合同：拍板以后才会生成 `docs/design/boards/` 下的清单，那才是实现合同（见 `docs/engineering/design-pipeline.md`，`check:board-parity` 守这一条）。没有对应清单的格子，不要直接照着实现，先问协调会话。

## 统一规则 7 条（画布顶部便签原文）

1 容器：卡片统一用 1px --nomi-line 细线、10px 圆角、白底。面板里的卡片不加阴影；画布上浮着的东西（节点、生成框、意见线程、浮层和弹出菜单）带 --nomi-shadow-md，和现在产品一致。卡片里不再套卡片。

2 主按钮：每一块只有一个主按钮，黑底 pill，永远放在右边（行尾或卡片右下角）。次要按钮放在它左边，用无框文字。关闭和放弃用 ✕，放在右上角。

3 生成：画布生成框里用 ↑ 圆钮。Agent 卡片里的确认，用带字的「生成」pill，和现在产品一致，不加箭头。

4 参考图：统一放在文字上方一行，小图 32 到 40px。平时只显示小图，悬停时显示名字和 ✕；展开态和详情里可以常显名字。不放在按钮下面。

5 文字：标题 13/600，正文 13，次要信息 12 号字、--nomi-ink60。不写解释句。

6 间距：卡片内边距 12，行与行之间 8，各元素左边对齐到同一条线。

7 图标：一律 Tabler，按钮里 16/2，顶栏 18/1.5。AI 一律用 NomiLogoMark（带底）。

> 10-21 更正：顶栏应为 **18/1.8**。以下面分组表第 2 行 F1 的四档拍板为准（13/1.8、16/2、18/1.8、24/1.5）；便签原文里的 18/1.5 是协调会话总结时的笔误。

## 分组和状态

| 顺序 | 组 | 格子 | 在讲什么 | 状态 | 要用户定的点 |
|---|---|---|---|---|---|
| 1 | 生成框（B3）+ 付费卡精简版（D2，**按 10-22 新原则重画，原样张作废**）+ 复用宿主（E1） | B3a–B3q、D2a–D2i（D1a–D1h 是旧版对照）、E1a–E1d | 画布生成框的新排法（参考行、参数弹层、首尾帧、渠道）；Agent 付费卡精简成三行，一行三颗参数；同一个生成框放进分镜行、Agent 输入框、列表详情、节点错误报告 | B3 已拍板，D2、E1 按本表实现。10-18 晚到 10-19 的定稿：生成钮改回原来的 ↑ 圆钮；参数区一律照现有组件原样（见下「参数区定稿」）；付费卡展开后嵌的就是生成框，参数在原地展开、盖住提示词 | 无（D2c 的「盖住提示词」已定） |
| 2 | 图标统一（F1） | F1a–F1d | 节点浮条、生成框底栏、顶栏、空态的图标线宽和字号 | 已按推荐拍板 | 四档：13/1.8、16/2、18/1.8、24/1.5 |
| 3 | 标注 → Agent 极简版（M） | M1–M8（A3a–A3j 是对照） | 评论模式、线程、意见列表 | 已按推荐拍板；**排 0.25**（用户 10-21 定） | 三点：底栏放「评论」、节点浮条去掉「提意见」、列表分未解决 / 已解决两档 |
| 4 | 分页 | 方案四 D1–D8 是推荐；方案一 P2a–P2m、A2、A4，方案二 B1–B6，方案三 C1–C6 都是对照 | 顶栏页签 + 「全部页面」替代左栏「目录」 | 已按推荐拍板：选方案四；**排 0.25**（用户 10-21 定） | 实现前先出结构方案（页面归属和业务身份拆开） |
| 5 | 写作区 | 方案二「分场」WB1–WB9、WD1–WD2 三套共用；方案一 WA、方案三 WC 是对照 | 创作区的稿子组织方式、选中文字的 AI、空行续写 | **暂不改，只做 Agent 改写**：写作区结构先不改，只做「选中文字 → AI 改写」（WD1）；WD2（空行按空格续写）这次不做；WA / WB / WC 的结构样张这次都不实现 | 无 |
| — | 文稿方案确认挪进 Agent | C3a、C3b | 报价卡、计划外镜头的刹车 | 已实现（main 上 #1224 等） | 无 |

### 参数区定稿（B3q 是这一条的对比格）

B3q 左边是现有真组件（画布节点的参数面板），右边是样张旧画法。以左边为准：

- 参数条上**模型和变体各一颗**；摘要那一颗**只印当前值**（比例 · 清晰度 · 时长）。
- **生成方式放在面板顶部**；供应商这一组叫「**供应商**」。
- 面板就是现有组件原样：宽 320、每组标题在上分段在下、圆角 16；比例带小图形，时长是滑杆，生成音频是开关。
- B3 原先的两条**作废**：「版本放进弹层」「模型和版本合成一颗」。画布 `canvas.json` 里 `n-variant` 便签（「版本在参数弹层第一组选，模型按钮上写模型名 + 当前版本」）是旧话，以这里为准。
- B3a、B3c–B3f、B3h–B3m 等格里参数条的旧画法同理只看位置，不照画；以 B3b、B3g、B3o、B3q 为准。

### 付费卡展开（D2c）

> **按 10-22 新原则重画，原样张作废**（一个东西一个家：付费卡不再嵌生成框、不在聊天里调参，见 `docs/design/2026-10-08-approved-designs.md` §⑪）。D2 的 28 项功能去处里第 10、11、12 项同样随重画重排。以下为历史内容。

付费卡展开后，卡里嵌的就是生成框；点参数条上的参数，参数在**原地展开、盖住提示词框**，选完收起，卡片高度不变（D2c 右图）。现在真代码是在下方展开、把卡片撑高，所以实现时要改 `inlinePanelSlot`。

## 实现顺序和每块的流程

**实现进度（10-21）**：
- 第 1 块「生成框 + 复用宿主」在做。
- 写作区「Agent 改写（WD1）」是 PR #1264，要等文本任务迁到 pi-ai 之后才能合。
- 付费卡 D2 是下一个 PR。
- 第 2 块图标在 0.24 里做。

**版本范围（用户 10-21 定）**：第 3 块「标注」和第 4 块「分页」挪到 **0.25**，作为下一版的主菜。原因有两个：
- 两块都要先做数据设计。评论要跟着节点的哪个版本走，镜头归哪一页，这些得先定下来。
- 它们排在依赖链最后，放进 0.24 会让生成框、文本、性能这些天天碰到的修复晚很久才能发。

样张和拍板保持不变，0.25 开工时照本表来做。

按上表顺序，一块一块来，每块都走：

1. 用户拍板；
2. 改清单（`docs/design/boards/`）；
3. 实现；
4. 真机截图（中 / 英、明 / 暗）和样张逐格对照；
5. 用户点头后再做下一块。

## 重要的实现提示

- **参数面板一律复用现有真组件**：`src/workbench/generationCanvas/nodes/InlineParameterBar.tsx` 和 `controls/ParameterControlBody.tsx`。样张里参数弹层的画法（两列、圆角、宽度）和真组件有出入，只用来示意位置，不要照画。
- **付费卡展开后放的就是画布那件生成框**（用户 09-10 定），不是另画一套。
- **顶栏、外壳以 origin/main 的真组件为准**，比如画布 / 列表是单图标切换；样张里的顶栏只示意新增的东西。
- **改设计不能丢功能**：最后对照 `docs/design/boards/2026-10-18/ComposerB3.board.json` 的 103 项普查做功能对比验收，一项不能少。

## 怎么看

- `preview/`：每格一张 PNG，直接看，文件名和格名一致。浅 + 暗两栏的格画在同一张图里。
- `source/`：Claude Design 画布的格子源文件（`*.dc.html`）和 `canvas.json`（每格位置、尺寸、标题，以及画布上的说明便签，含各组的「功能去处」对照）。`.dc.html` 需要画布运行时才能交互；没有运行时也可以直接读里面的 HTML / CSS 取尺寸和颜色。
- 画布原件在用户账号里，链接见顶部，**需要用户账号**。
- 画布上的便签（`canvas.json` 的 `notes`）有各组的功能去处对照（目录原有功能、付费卡 28 项、创作区功能等），实现前读一遍。

## 未渲染

无。124 格全部出了预览图（2026-10-19 同步：B3q 新增，B3b、B3g、B3o、D2a–D2i 共 12 格内容有变，预览图已重画）。预览用无头浏览器按格子自身宽高截取，没加载网络字体，字体用系统回退，和画布上的字形会有细微差别。

## 说明

- 只收画布 `canvas.json` 引用到的格；画布上已不在用的旧格（A1、旧 B2、Main、WPA / WPB 等）不收。
- 源文件按原样存放，仅把一处便签里的措辞改成中性说法（公开仓库不放金额类字样）。

## 格子索引

### 1 生成框 + 付费卡精简版 + 复用宿主（38 格）

| 格 | 标题 | 尺寸 | 预览 | 源文件 |
|---|---|---|---|---|
| B3a-video-empty | B3a 视频 空，默认参考（浅 + 暗） | 1200×320 | [png](preview/B3a-video-empty.png) | [dc.html](source/B3a-video-empty.dc.html) |
| B3b-video-params | B3b 视频 参数弹层，生成方式 | 600×560 | [png](preview/B3b-video-params.png) | [dc.html](source/B3b-video-params.dc.html) |
| B3c-video-three-refs | B3c 视频 参考 3 张，含连线 | 600×380 | [png](preview/B3c-video-three-refs.png) | [dc.html](source/B3c-video-three-refs.dc.html) |
| B3d-video-first-last | B3d 视频 首尾帧，尾帧可不填（浅 + 暗） | 1200×340 | [png](preview/B3d-video-first-last.png) | [dc.html](source/B3d-video-first-last.dc.html) |
| B3e-video-ambiguous | B3e 视频 参考 2 张，有歧义提示 | 600×340 | [png](preview/B3e-video-ambiguous.png) | [dc.html](source/B3e-video-ambiguous.dc.html) |
| B3f-video-switch-first-last | B3f 视频 3 张参考切到首尾帧 | 600×340 | [png](preview/B3f-video-switch-first-last.png) | [dc.html](source/B3f-video-switch-first-last.dc.html) |
| B3g-image-empty | B3g 图片 空，弹层没有生成方式（浅 + 暗） | 1200×500 | [png](preview/B3g-image-empty.png) | [dc.html](source/B3g-image-empty.dc.html) |
| B3h-image-three-refs | B3h 图片 放 3 张图 | 600×340 | [png](preview/B3h-image-three-refs.png) | [dc.html](source/B3h-image-three-refs.dc.html) |
| B3i-image-no-ref-model | B3i 图片 模型不收参考图 | 600×380 | [png](preview/B3i-image-no-ref-model.png) | [dc.html](source/B3i-image-no-ref-model.dc.html) |
| B3j-model-swap | B3j 换模型：菜单不加说明，换完界面自己变 | 1200×300 | [png](preview/B3j-model-swap.png) | [dc.html](source/B3j-model-swap.dc.html) |
| B3k-compare | B3k 现在 vs 新 | 1200×420 | [png](preview/B3k-compare.png) | [dc.html](source/B3k-compare.dc.html) |
| B3l-english | B3l English | 1200×380 | [png](preview/B3l-english.png) | [dc.html](source/B3l-english.dc.html) |
| B3m-bar-layouts | B3m 底栏两种排法 | 1200×780 | [png](preview/B3m-bar-layouts.png) | [dc.html](source/B3m-bar-layouts.dc.html) |
| D1a-card-single | D1a 单段默认 | 440×436 | [png](preview/D1a-card-single.png) | [dc.html](source/D1a-card-single.dc.html) |
| D1b-card-expanded | D1b 卡内展开编辑 | 440×823 | [png](preview/D1b-card-expanded.png) | [dc.html](source/D1b-card-expanded.dc.html) |
| D1c-card-multi | D1c 多段：清单加当前一段 | 440×575 | [png](preview/D1c-card-multi.png) | [dc.html](source/D1c-card-multi.dc.html) |
| D1d-card-progress | D1d 逐段进行中 | 440×420 | [png](preview/D1d-card-progress.png) | [dc.html](source/D1d-card-progress.dc.html) |
| D1e-card-failures | D1e 失败：哪段、发没发、怎么办（三种） | 1280×714 | [png](preview/D1e-card-failures.png) | [dc.html](source/D1e-card-failures.dc.html) |
| D1h-compare | D1h 现在 vs 新 | 960×538 | [png](preview/D1h-compare.png) | [dc.html](source/D1h-compare.dc.html) |
| D1f-english | D1f English（单段 + 多段） | 960×579 | [png](preview/D1f-english.png) | [dc.html](source/D1f-english.dc.html) |
| D1g-dark | D1g 暗色（单段） | 440×396 | [png](preview/D1g-dark.png) | [dc.html](source/D1g-dark.dc.html) |
| E1a-storyboard-row | E1a 分镜表镜头行（宽 / 窄 / 最窄） | 1520×352 | [png](preview/E1a-storyboard-row.png) | [dc.html](source/E1a-storyboard-row.dc.html) |
| E1b-agent-input | E1b Agent 输入框的参考按钮 | 960×319 | [png](preview/E1b-agent-input.png) | [dc.html](source/E1b-agent-input.dc.html) |
| E1c-list-detail | E1c 列表视图详情用新生成框 | 1080×704 | [png](preview/E1c-list-detail.png) | [dc.html](source/E1c-list-detail.dc.html) |
| E1d-node-error | E1d 节点错误报告里的参数区 | 700×561 | [png](preview/E1d-node-error.png) | [dc.html](source/E1d-node-error.dc.html) |
| B3n-hover-preview | B3n 悬停：小提示与大图预览怎么同屏 | 1240×864 | [png](preview/B3n-hover-preview.png) | [dc.html](source/B3n-hover-preview.dc.html) |
| B3o-model-menu-channel | B3o 模型菜单：渠道直选 | 1320×860 | [png](preview/B3o-model-menu-channel.png) | [dc.html](source/B3o-model-menu-channel.dc.html) |
| B3p-channel-missing-mode | B3p 渠道缺模式：参考行行尾的小字（中 / 英） | 1240×438 | [png](preview/B3p-channel-missing-mode.png) | [dc.html](source/B3p-channel-missing-mode.dc.html) |
| D2a-compare | D2a 现在 vs 精简：展开态对比 | 920×880 | [png](preview/D2a-compare.png) | [dc.html](source/D2a-compare.dc.html) |
| D2b-single | D2b 精简 · 单段（推荐） | 440×380 | [png](preview/D2b-single.png) | [dc.html](source/D2b-single.dc.html) |
| D2c-expanded | （按 10-22 新原则重画，原样张作废）D2c 点开以后：复用画布生成框，参数原地展开、盖住提示词框 | 920×700 | [png](preview/D2c-expanded.png) | [dc.html](source/D2c-expanded.dc.html) |
| D2d-multi | （按 10-22 新原则重画，原样张作废）D2d 多段：一行一段，底部一颗「全部生成」，点一行就地展开 | 920×700 | [png](preview/D2d-multi.png) | [dc.html](source/D2d-multi.dc.html) |
| D2e-progress | D2e 进行中：第几段在发、哪些已发出，加「停止」 | 440×360 | [png](preview/D2e-progress.png) | [dc.html](source/D2e-progress.dc.html) |
| D2f-failure | D2f 失败：哪一段、发没发出去、下一步，加一颗对应的按钮 | 1360×360 | [png](preview/D2f-failure.png) | [dc.html](source/D2f-failure.dc.html) |
| D2g-minimal | D2g 更极简的备选：整张卡就是 Agent 的一句话加两颗按钮 | 440×360 | [png](preview/D2g-minimal.png) | [dc.html](source/D2g-minimal.dc.html) |
| D2h-english | D2h English（D2b） | 440×380 | [png](preview/D2h-english.png) | [dc.html](source/D2h-english.dc.html) |
| D2i-dark | D2i 暗色（D2b） | 440×380 | [png](preview/D2i-dark.png) | [dc.html](source/D2i-dark.dc.html) |
| B3q-param-panel-compare | B3q 参数面板：现在 vs 样张旧画法 | 1220×760 | [png](preview/B3q-param-panel-compare.png) | [dc.html](source/B3q-param-panel-compare.dc.html) |

### 2 图标统一（4 格）

| 格 | 标题 | 尺寸 | 预览 | 源文件 |
|---|---|---|---|---|
| F1a-icons-node | F1a 节点浮条与媒体控件 | 1160×406 | [png](preview/F1a-icons-node.png) | [dc.html](source/F1a-icons-node.dc.html) |
| F1b-icons-bar | F1b 生成框底栏 | 1200×249 | [png](preview/F1b-icons-bar.png) | [dc.html](source/F1b-icons-bar.dc.html) |
| F1c-icons-topbar | F1c 顶栏 | 1020×284 | [png](preview/F1c-icons-topbar.png) | [dc.html](source/F1c-icons-topbar.dc.html) |
| F1d-icons-empty | F1d 空态图标 | 820×540 | [png](preview/F1d-icons-empty.png) | [dc.html](source/F1d-icons-empty.dc.html) |

### 3 标注到 Agent 极简版（18 格）

| 格 | 标题 | 尺寸 | 预览 | 源文件 |
|---|---|---|---|---|
| A3a-enter | A3a 进入：提意见 / 编辑图片 | 1540×970 | [png](preview/A3a-enter.png) | [dc.html](source/A3a-enter.dc.html) |
| A3b-place | A3b 落点：画一笔、点一下、选已有的，写一句 | 1660×598 | [png](preview/A3b-place.png) | [dc.html](source/A3b-place.dc.html) |
| A3c-global-list | A3c 全局列表：连续编号，点一条回原处 | 1080×532 | [png](preview/A3c-global-list.png) | [dc.html](source/A3c-global-list.dc.html) |
| A3d-before-send | A3d 发送前：原文、版次、预览，一个发送 | 1260×598 | [png](preview/A3d-before-send.png) | [dc.html](source/A3d-before-send.dc.html) |
| A3e-nomi-reply | A3e Nomi 回复：线程里对比，待确认 | 920×660 | [png](preview/A3e-nomi-reply.png) | [dc.html](source/A3e-nomi-reply.dc.html) |
| A3f-resolved | A3f 已解决：筛选能找到，可重新打开 | 880×385 | [png](preview/A3f-resolved.png) | [dc.html](source/A3f-resolved.dc.html) |
| A3g-draft-retry | A3g 草稿与重试 | 1600×437 | [png](preview/A3g-draft-retry.png) | [dc.html](source/A3g-draft-retry.dc.html) |
| A3h-target-gone | A3h 目标失效：意见保留，不悄悄改绑 | 1640×356 | [png](preview/A3h-target-gone.png) | [dc.html](source/A3h-target-gone.dc.html) |
| A3i-english | A3i English（落点 + Nomi 回复） | 1660×1300 | [png](preview/A3i-english.png) | [dc.html](source/A3i-english.dc.html) |
| A3j-dark | A3j 暗色（进入） | 1540×970 | [png](preview/A3j-dark.png) | [dc.html](source/A3j-dark.dc.html) |
| M1-bottom-bar | M1 底栏：现在 vs 新 | 1260×198 | [png](preview/M1-bottom-bar.png) | [dc.html](source/M1-bottom-bar.dc.html) |
| M6-node-bar | M6 节点浮条：去掉「提意见」钮 | 1000×520 | [png](preview/M6-node-bar.png) | [dc.html](source/M6-node-bar.dc.html) |
| M2-comment-mode | M2 评论模式：点一下钉点，拖一下框区域 | 1580×520 | [png](preview/M2-comment-mode.png) | [dc.html](source/M2-comment-mode.dc.html) |
| M5-comment-list | M5 意见列表：未解决 / 已解决，点一条回原处 | 1080×492 | [png](preview/M5-comment-list.png) | [dc.html](source/M5-comment-list.dc.html) |
| M3-thread | M3 线程：回复带缩略图，接受 / 放弃，圈一下 | 760×467 | [png](preview/M3-thread.png) | [dc.html](source/M3-thread.dc.html) |
| M4-circle-it | M4 圈一下：白板只留画笔、撤销、完成 | 860×516 | [png](preview/M4-circle-it.png) | [dc.html](source/M4-circle-it.dc.html) |
| M8-dark | M8 暗色（线程） | 760×467 | [png](preview/M8-dark.png) | [dc.html](source/M8-dark.dc.html) |
| M7-english | M7 English（评论模式 + 线程） | 1580×983 | [png](preview/M7-english.png) | [dc.html](source/M7-english.dc.html) |

### 4 分页（37 格）

| 格 | 标题 | 尺寸 | 预览 | 源文件 |
|---|---|---|---|---|
| P2a-now-vs-new | P2a 现在 vs 新：目录里展开分类 → 标题栏里的自定义页面 | 2680×900 | [png](preview/P2a-now-vs-new.png) | [dc.html](source/P2a-now-vs-new.dc.html) |
| P2b-pages-normal | P2b 正常宽度：标题栏里的自定义页面，Agent、生成框、时间轴同在 | 1360×880 | [png](preview/P2b-pages-normal.png) | [dc.html](source/P2b-pages-normal.dc.html) |
| P2c-narrow | P2c 窗口窄了怎么让位：滚动、缩短项目名、收成下拉 | 1360×780 | [png](preview/P2c-narrow.png) | [dc.html](source/P2c-narrow.dc.html) |
| P2d-page-menu | P2d 新建、改名、右键菜单、删除要说清后果、可撤销 | 1360×760 | [png](preview/P2d-page-menu.png) | [dc.html](source/P2d-page-menu.dc.html) |
| P2e-catalog-assets | P2e 左栏：目录按页面，素材按类型 | 1360×800 | [png](preview/P2e-catalog-assets.png) | [dc.html](source/P2e-catalog-assets.dc.html) |
| P2f-old-project | P2f 旧项目第一次打开：分类自动变成同名页面 | 1360×560 | [png](preview/P2f-old-project.png) | [dc.html](source/P2f-old-project.dc.html) |
| P2g-list | P2g 列表视图：每条标出所在页面，点了回到那一页 | 1360×1060 | [png](preview/P2g-list.png) | [dc.html](source/P2g-list.dc.html) |
| P2h-global-notes | P2h 全局意见：页面、对象、版次，点一条回到来源页 | 1360×640 | [png](preview/P2h-global-notes.png) | [dc.html](source/P2h-global-notes.dc.html) |
| P2i-cross-draft | P2i 跨页草稿：去别的页面找参考，草稿和引用都在 | 1360×640 | [png](preview/P2i-cross-draft.png) | [dc.html](source/P2i-cross-draft.dc.html) |
| P2j-background-gen | P2j 后台生成：完成提示指向原节点，不抢视口 | 1360×540 | [png](preview/P2j-background-gen.png) | [dc.html](source/P2j-background-gen.dc.html) |
| P2k-reopen | P2k 重开项目：恢复视口、首次全貌、上次那页已不在 | 1360×600 | [png](preview/P2k-reopen.png) | [dc.html](source/P2k-reopen.dc.html) |
| P2l-english | P2l English | 1360×880 | [png](preview/P2l-english.png) | [dc.html](source/P2l-english.dc.html) |
| P2m-dark | P2m 暗色版 | 1360×880 | [png](preview/P2m-dark.png) | [dc.html](source/P2m-dark.dc.html) |
| A2-twenty-pages | A2 窄窗放 20 个长页名：溢出与「全部页面」，当前页仍可辨认 | 1360×640 | [png](preview/A2-twenty-pages.png) | [dc.html](source/A2-twenty-pages.dc.html) |
| A4-rename-reorder-list | A4 重命名、重排一页后切到列表：镜号和片子顺序不变 | 1360×760 | [png](preview/A4-rename-reorder-list.png) | [dc.html](source/A4-rename-reorder-list.dc.html) |
| B1-current-page-button | B1 平时只占顶栏一处：第一页不用命名就能开始摆内容 | 1360×852 | [png](preview/B1-current-page-button.png) | [dc.html](source/B1-current-page-button.dc.html) |
| B1b-narrow | B1b 窄窗：当前页按钮怎么让位 | 1360×520 | [png](preview/B1b-narrow.png) | [dc.html](source/B1b-narrow.dc.html) |
| B2-twenty-pages | B2 展开 20 页：静态小预览 + 完整名称 + 固定的新建入口，找回旧试验 | 1360×852 | [png](preview/B2-twenty-pages.png) | [dc.html](source/B2-twenty-pages.dc.html) |
| B3-search-object | B3 搜一个对象名：跨页结果带页名，点后直接定位该对象 | 2680×880 | [png](preview/B3-search-object.png) | [dc.html](source/B3-search-object.dc.html) |
| B4-background-gen | B4 在 A 页创建时浏览 B 页：完成提示能回到 A | 2680×880 | [png](preview/B4-background-gen.png) | [dc.html](source/B4-background-gen.dc.html) |
| B4b-no-result | B4b 搜不到时：说明可以怎么找 | 1360×852 | [png](preview/B4b-no-result.png) | [dc.html](source/B4b-no-result.dc.html) |
| B5-english | B5 English（B1） | 1360×852 | [png](preview/B5-english.png) | [dc.html](source/B5-english.dc.html) |
| B6-dark | B6 暗色（B1） | 1360×852 | [png](preview/B6-dark.png) | [dc.html](source/B6-dark.dc.html) |
| C1-two-styles | C1 同一广告的写实 / 水彩两组并排，引用同一个角色 | 1360×852 | [png](preview/C1-two-styles.png) | [dc.html](source/C1-two-styles.dc.html) |
| C2-thirty-zones | C2 30 个分区：大纲里搜「第二场」跳过去，小地图仍给全局位置 | 1360×852 | [png](preview/C2-thirty-zones.png) | [dc.html](source/C2-thirty-zones.dc.html) |
| C3-present-zone | C3 只展示选定分区：其余区域仍在画布上，页面不暗示分享已隔离 | 1360×852 | [png](preview/C3-present-zone.png) | [dc.html](source/C3-present-zone.dc.html) |
| C4-old-zone-task | C4 进入旧稿区查看后继续原修改：Agent 的目标没有变成整个大板 | 1360×852 | [png](preview/C4-old-zone-task.png) | [dc.html](source/C4-old-zone-task.dc.html) |
| C5-english | C5 English（C1） | 1360×852 | [png](preview/C5-english.png) | [dc.html](source/C5-english.dc.html) |
| C6-dark | C6 暗色（C1） | 1360×852 | [png](preview/C6-dark.png) | [dc.html](source/C6-dark.dc.html) |
| D1-three-pages | D1 3 页时直接排开：点一下就切换，不多点 | 1360×852 | [png](preview/D1-three-pages.png) | [dc.html](source/D1-three-pages.dc.html) |
| D2-twelve-pages | D2 12 页溢出：收进「▾ 全部页面」，点开有搜索和小预览 | 1360×852 | [png](preview/D2-twelve-pages.png) | [dc.html](source/D2-twelve-pages.dc.html) |
| D3-search-object | D3 搜对象名：跨页跳到那个对象并选中 | 2680×880 | [png](preview/D3-search-object.png) | [dc.html](source/D3-search-object.dc.html) |
| D4-narrow | D4 窄窗：项目名先缩短，页签逐步收进「全部页面」 | 1360×620 | [png](preview/D4-narrow.png) | [dc.html](source/D4-narrow.dc.html) |
| D5-rail-now-vs-new | D5 左栏去掉「目录」：现在 vs 新 | 1360×880 | [png](preview/D5-rail-now-vs-new.png) | [dc.html](source/D5-rail-now-vs-new.dc.html) |
| D6-catalog-functions | D6 目录原有功能的去处：找对象、节点右键、拖到页签复制、组右键 | 1360×740 | [png](preview/D6-catalog-functions.png) | [dc.html](source/D6-catalog-functions.dc.html) |
| D7-english | D7 English（D2） | 1360×852 | [png](preview/D7-english.png) | [dc.html](source/D7-english.dc.html) |
| D8-dark | D8 暗色（D2） | 1360×852 | [png](preview/D8-dark.png) | [dc.html](source/D8-dark.dc.html) |

### 5 写作区（25 格）

| 格 | 标题 | 尺寸 | 预览 | 源文件 |
|---|---|---|---|---|
| WA1-paste | 一·1 现在 vs 接稿：粘贴后保留原格式，可以不整理 | 3040×1010 | [png](preview/WA1-paste.png) | [dc.html](source/WA1-paste.dc.html) |
| WA2-read | 一·2 通读：没有常驻聊天，目录按需展开 | 1520×940 | [png](preview/WA2-read.png) | [dc.html](source/WA2-read.dc.html) |
| WA3-rewrite | 一·3 局部改稿：选中后就地给结果，接受 / 丢弃 / 再试一次 | 1520×940 | [png](preview/WA3-rewrite.png) | [dc.html](source/WA3-rewrite.dc.html) |
| WA4-reorder | 一·4 改顺序：整场移动，检查前后承接 | 1520×940 | [png](preview/WA4-reorder.png) | [dc.html](source/WA4-reorder.dc.html) |
| WA5-handoff | 一·5 首次交接：先核对拆分再确认 | 1520×940 | [png](preview/WA5-handoff.png) | [dc.html](source/WA5-handoff.dc.html) |
| WA6-reedit | 一·6 投产后再改：只列相关镜头，旧画面保留 | 1520×940 | [png](preview/WA6-reedit.png) | [dc.html](source/WA6-reedit.dc.html) |
| WA7-english | 一·7 English（局部改稿） | 1520×940 | [png](preview/WA7-english.png) | [dc.html](source/WA7-english.dc.html) |
| WB1-import | 二·1 接稿并校正：拆成分场，错拆可合并 | 1520×940 | [png](preview/WB1-import.png) | [dc.html](source/WB1-import.dc.html) |
| WB2-story | 二·2 看故事：五场分场摘要排在一起 | 1520×940 | [png](preview/WB2-story.png) | [dc.html](source/WB2-story.dc.html) |
| WB3-reorder | 二·3 重排并细写：第 4 场移到第 2 位，展开写对白 | 1520×940 | [png](preview/WB3-reorder.png) | [dc.html](source/WB3-reorder.dc.html) |
| WB4-ask | 二·4 求助与采用：Notion 式，结果就地出现 | 1520×940 | [png](preview/WB4-ask.png) | [dc.html](source/WB4-ask.dc.html) |
| WB5-shots | 二·5 一场到多镜：只拆选中的场 | 1520×940 | [png](preview/WB5-shots.png) | [dc.html](source/WB5-shots.dc.html) |
| WB6-return | 二·6 制作后返改：回到来源场，确认镜头更新 | 1520×940 | [png](preview/WB6-return.png) | [dc.html](source/WB6-return.dc.html) |
| WB7-english | 二·7 English（求助与采用） | 1520×940 | [png](preview/WB7-english.png) | [dc.html](source/WB7-english.dc.html) |
| WB8-dark | 二·8 暗色（重排并细写） | 1520×940 | [png](preview/WB8-dark.png) | [dc.html](source/WB8-dark.dc.html) |
| WC1-import | 三·1 接稿拆段：左声音右画面，错位可修正 | 1520×940 | [png](preview/WC1-import.png) | [dc.html](source/WC1-import.dc.html) |
| WC2-voice | 三·2 只改声音：结果就地出现，画面不动 | 1520×940 | [png](preview/WC2-voice.png) | [dc.html](source/WC2-voice.dc.html) |
| WC3-picture | 三·3 只改画面：口播已确认，不被连带改写 | 1520×940 | [png](preview/WC3-picture.png) | [dc.html](source/WC3-picture.dc.html) |
| WC4-two-shots | 三·4 一段多镜：一句口播跨两镜，检查总时间 | 1520×940 | [png](preview/WC4-two-shots.png) | [dc.html](source/WC4-two-shots.dc.html) |
| WC5-openings | 三·5 比较开场：只并排差异，其余沿用 | 1520×940 | [png](preview/WC5-openings.png) | [dc.html](source/WC5-openings.dc.html) |
| WC6-music | 三·6 音乐与交接：允许无口播、空镜 | 1520×940 | [png](preview/WC6-music.png) | [dc.html](source/WC6-music.dc.html) |
| WC7-english | 三·7 English（一段多镜） | 1520×940 | [png](preview/WC7-english.png) | [dc.html](source/WC7-english.dc.html) |
| WB9-same-scenes | 二·9 分场 ↔ 分镜方案：同一份场，改名、换顺序两边同步 | 1520×880 | [png](preview/WB9-same-scenes.png) | [dc.html](source/WB9-same-scenes.dc.html) |
| WD1-ai-menu | 共用·1 选中文字 → AI 菜单 → 就地结果（特写） | 1570×520 | [png](preview/WD1-ai-menu.png) | [dc.html](source/WD1-ai-menu.dc.html) |
| WD2-space | 共用·2 空行按空格，让 Nomi 接着写 | 1570×460 | [png](preview/WD2-space.png) | [dc.html](source/WD2-space.dc.html) |

### 文稿方案确认挪进 Agent（2 格）

| 格 | 标题 | 尺寸 | 预览 | 源文件 |
|---|---|---|---|---|
| C3a-quote-card | 3a 请求批准档 报价卡 | 440×760 | [png](preview/C3a-quote-card.png) | [dc.html](source/C3a-quote-card.dc.html) |
| C3b-off-plan | 3b 刹车 2 计划外镜头 | 440×900 | [png](preview/C3b-off-plan.png) | [dc.html](source/C3b-off-plan.dc.html) |
