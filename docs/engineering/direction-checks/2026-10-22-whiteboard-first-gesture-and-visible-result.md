# 方向检查：画板「打开后第一下」和「完成后看见什么」（2026-10-22）

触发：用户 10-22 反馈画板用不了，要修的两个文件命中 `fix-churn`：`WhiteboardDrawingTool.tsx` 这刀会是第 4 个 fix，`WhiteboardCardBody.tsx` 会是第 3 个。前面的 fix 多是 #1189 的评审轮次和空节点排版。逃逸账本：`tests/ux/full-walk/escapeLedger/FB-20261022-whiteboard-board-unusable.json`。诊断报告在协调状态目录 `reports/R-whiteboard.md`。

> **拍板（2026-10-22）**：用户拍板选 A，推翻 InlineWhiteboard 清单 O40；方向检查按「换」批准，协调转达。默认工具恢复成画笔，协调按回归批准。

### 0. 一句话根因

画板的验收只核「盘上存了什么」，从没核过「创作者打开后第一下会发生什么、按完成后在画布上看见什么」；所以默认工具被悄悄换掉、完成后节点一片空白，这两件事都能全绿合入。

### 1. 归类表

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 9291455b57（#1189）默认工具 brush → select | 新编辑器初始化时 `useState<ToolKey>('select')`，拍板清单和设计卡都没写默认工具 | 首个手势没有合同 |
| 画板节点完成后只剩启动器（0.23.0 起就是这样） | `WhiteboardCardBody` 永远只画 `EmptyStateLauncher`；清单 O40「完成只保存 state，不截图」 | 完成后的可见结果没有合同 |
| 走查 51 项全绿没拦住 | `stroke()` 先替用户点 brush；结果只读 `meta.whiteboardState` | 尺子测的是数据，不是体验 |

### 2. 为什么这一类会一直出现

落在铁律 ⑫「点了 = 以为的」上：画板的两个入口都没写「用户预期」。创作者点开画板会预期拖一下就出线，按「完成」会预期画布上留下自己画的东西。拍板清单按函数逐条普查（O1…On），全是「功能还在不在」，没有一条是「创作者那一刻看见什么」。走查照着清单写，自然只核数据。之后换编辑器、换外壳、换默认值，只要数据还在，就都是绿的。

### 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 再改一次工具条或编辑器，默认工具又会漂，走查照样全绿 | 把 `firstGestureStroke` 那两条断言删掉，再改默认工具，跑 `node tests/ux/whiteboard-refactor.walk.mjs --repo-media` |
| 其它「打开 → 编辑 → 完成」类节点（导演台、3D、全景）也有完成后节点上看不见结果的情况 | 逐个看 `NodeCardBody` 的分发：有结果时还渲染启动器的就算 |
| 老项目里只有 `whiteboardState`、没有 `result` 的画板，在任何改法下都还是空的 | 用 `_whiteboardFixture.mjs` 预埋一份只有 state 的画板，打开项目看节点 |

### 4. 靶子独立性检查

- 走查和 #1189 的实现是同一条线写的，替用户点画笔的 `stroke()` 也出自这条线。尺子本身有偏，所以先修尺子：已在 `tests/ux/whiteboard-refactor.walk.mjs` 加了三条断言，并在 203886f10 上确认三条都红。
- 没有「修对反而掉分」的先例。

### 5. P0：是我们独有的吗

是。画板节点在画布上怎么呈现、按镜头怎么出版本，属于画布领域。画画用的 Leafer 是现成的库，这次不动它。缩略图导出也复用现有的 `captureViewportFile` 和 `persistNodeImageFile`，不另写。

### 6. 对比表

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 不适用：问题出在我们自己的节点呈现合同，不是缺通用能力 | — | — | — |
| 补 | 在 `WhiteboardCardBody` 里加一个「有 state 就……」的分支 | 小 | 又多一个特例分支，下一刀还是热点 | 否 |
| 换（推荐） | 默认工具换回 brush，删掉 'select' 初值；画板节点「完成且有内容」时像图片节点一样把结果当节点结果显示（Q1 选 A），启动器只在没内容时出现。两处都是换，不留旧路径 | 中：完成时多导出一张 PNG，节点有版本 | 推翻清单 O40，要用户拍板；老数据（只有 state）首次打开要有明确处理 | 是 |
| 删 | 去掉独立画板节点，只留图片上的画板 | 小 | 丢功能，违反「改设计不能丢功能」 | 否 |

### 7. 用户要权衡的核心

画板节点按「完成」时要不要直接出一张图：出图，画布上就看得见、能连下游，代价是每次完成多一个版本；不出图，就得靠用户自己记得按相机截图。

## 特征测试清单（动结构前先锁住）

- `tests/ux/whiteboard-refactor.walk.mjs`：`image entry: the first drag after opening draws and leaves the photo where it was`、`standalone entry: the first drag after opening draws a stroke`、`standalone Done leaves the drawn content visible on the board node`。在 203886f10 上三条都红：前两条得到 0 笔，第三条找不到 img。前两条和产品取舍无关；第三条按 Q1 = A 写，用户选别的就跟着改。
- 现有 51 项仍是现状的特征测试，例如 `Done creates exactly one saved raster version` 和 `unchanged reopen and Done does not duplicate result history`。
