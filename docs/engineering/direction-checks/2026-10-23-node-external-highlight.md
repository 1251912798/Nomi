# 方向检查：节点外部高亮（悬停 / 闪一下）——D2 指向元素第②步

日期：2026-10-23。线：I-d2（实现）。性质：feat（不是 fix），但碰到的文件 fix-churn 命中，按交接「附一页方向检查」。协调 10-23 批选项 A。

`node scripts/fix-churn.mjs`（2026-10-23）命中：

| 单位 | 近 14 天 | 本次碰不碰 |
|---|---|---|
| `src/workbench/generationCanvas/nodes/BaseGenerationNode.tsx` | 5 个 fix（这一刀第 6） | **不碰**（选项 A：退回 main 原样） |
| `src/workbench/generationCanvas/reactFlow/GenerationCanvasReactFlowNodes.tsx` | 2 个 fix（第 3） | 碰：高亮画在外壳上，一行换成一个类函数 |
| `src/i18n/resources.ts` | 3 个 fix（第 4） | 碰：注册一个词典命名空间，3 行追加 |
| 概念「画布选区投影」（adapter + projection hook） | 2 个 fix（第 3） | 碰：投影的 `focusFlash` 布尔换成一格 `externalHighlight` |
| 概念「画布空节点引导与激活准入」 | 3 个 fix（第 4） | 只因 BaseGenerationNode 在内；不碰它之后不命中 |
| 概念「文案不断言零成本 / 会花钱」 | 15 个 fix（第 16） | 只因 resources.ts 在内；新文案不谈钱（check:i18n 绿） |

## 0. 一句话根因

这几处热，是因为它们是**装配点**：巨壳 BaseGenerationNode 把所有节点叠层装在一起，外壳 GenerationCanvasReactFlowNodes 把所有逐节点视觉态装在一起，resources.ts 注册所有词典——每个功能都要经过它们，不是同一类 bug 在复发。本次不往装配点里加分支：「画布外面点名了这个节点」换成投影里的一个字段，样子画在外壳上的一个类函数里。

## 1. 归类表

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| `ce54ad6ac` 错误卡主按钮按任务来源分 | 错误卡要 taskId，经巨壳透传 | 巨壳装配点 |
| `cf340183e` 预览 src 收成品牌类型 | 预览取图一行在巨壳里 | 巨壳装配点 |
| `ed77bae92` 空节点引导 / 更大的种类标 | 空卡占位挂在巨壳里（也碰外壳） | 巨壳 / 外壳装配点 |
| `30dfd448a` 空节点档位用渲染高度 | 同上 | 巨壳装配点 |
| `ae5e686ef` 剪辑面板与生成面板互斥 | 两个面板的挂载条件都在巨壳里 | 巨壳装配点 |
| `593adf2c9` 走查等卡成为正式节点、Suspense 兜底 | 外壳里的懒加载兜底 | 外壳装配点 |
| resources.ts 3 刀（项目库三修） | 新文案要注册 | 词典注册点 |
| `ee1368885`、`d6c076680`（选区投影概念） | 叠层表 / 整表订阅门岗 | 投影增量层 / 订阅纪律 |

## 2. 为什么这一类会一直出现

只要「节点在画布上的某种瞬时样子」各在卡面里画各的，每加一种（选中、闪、拖、拾取）都得往巨壳里塞一个 prop 和一段条件。
本次的改法把外部高亮从卡面里拿出来：投影只出一格两档，外壳画样子，卡面只拿一个布尔（`focusFlash`，本义就是「定位后在闪」）定预览优先级。

三条体验铁律：⑩ 不适用（不涉及参数）；⑪ 不适用；⑫「点了 = 以为的」：点指向元素 / 列表「去画布」 / 通知，画布对焦后那一张闪一下（中性），由 `tests/ux/canvas-focus-composer-visible.walk.mjs` 在真 Electron 里断言外壳 `data-external-highlight="flash"` 出现、不含强调色、1.4 秒后清掉。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 把悬停样式画进 BaseGenerationNode：大画布缩小到轻量档时（不渲 BaseGenerationNode）悬停不亮 | 200 节点缩到 < 0.55 倍，悬停指向元素看节点亮不亮（现在画在外壳上，轻量卡同样亮） |
| 巨壳继续过 500 行门岗 | `node scripts/check-file-sizes.mjs`（半成品版本就是 502 > 500 红） |
| 闪光继续用强调色描边 | `node scripts/check-design-tokens.mjs` 的去蓝棘轮（`generationCanvas.css` 那一条已删） |

## 4. 靶子独立性检查

不涉及评测分数；验收看拍板图（NodePointer 板）与走查断言，不是同一条线写的尺子。

## 5. P0：这些是我们独有的吗

外部高亮是画布节点的视觉态，属于画布领域；投影的增量（对象身份不变就不重渲）沿用现成机制（`projectGenerationFlowNodes`）。React Flow 没有「外部点名」这一档，只有 `selected` 与 className；我们用的就是它的节点 data 通道 + 外壳 className，不自写渲染。

## 6. 选项对比与推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| A 换（投影一个字段 + 外壳一个类函数） | `externalHighlight: 'hover' \| 'flash' \| null`；`externalHighlightShellClass` 外壳与实验室共用；卡面仍收 `focusFlash` 布尔 | 巨壳里那个 prop 名不改 | 低：巨壳一行不动 | **推荐（协调 10-23 批）** |
| B 照半成品改巨壳 prop | `focusFlash` → `externalHighlight` 一路改进 BaseGenerationNode / registry / 插件契约 | 巨壳第 6 刀、502 行要另删 2 行、插件契约跟着变 | 和 #1299（同文件改编辑态）冲突 | 不推荐 |
| C 外壳各自订悬停 store、不进投影 | 不碰选区投影概念 | 逐节点视觉态多一条路；200 个外壳每次悬停都跑一遍选择器 | 两条路漂 | 不推荐 |
| D 删（不做悬停联动） | — | 违反拍板（NodePointer 板 hover-link） | — | 不行 |

接入现成方案：没有可接的——这是我们画布节点的视觉态，用的已经是 React Flow 现成的 data / className 通道。

## 7. 用户要权衡的核心

最热的文件一行不动；换来的是巨壳里那个 prop 名仍叫 `focusFlash`（它的意思本来就是「定位后在闪」）。

## 特征测试清单（动结构前已钉住）

- `src/workbench/generationCanvas/reactFlow/generationCanvasReactFlowAdapter.test.ts`：闪 / 悬停投影、闪压悬停、结构不变时只重投前后被点名的两张卡（对象身份）、外壳类只用 ink（无强调色、无 in oklch）。
- `src/workbench/generationCanvas/components/canvasNodeLevelOfDetail.test.ts`（main 原样）：大画布轻量档里只有选中 / 定位后在闪的那一张给完整内容；外壳只把 `externalHighlight === 'flash'` 传进去，悬停不升档。
- `tests/ux/canvas-focus-composer-visible.walk.mjs`：真入口对焦后外壳闪一下、不含强调色、1.4 秒后清掉。
