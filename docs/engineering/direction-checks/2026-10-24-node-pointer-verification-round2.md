# 方向检查：指向元素（NodePointer）独立验收第 2 轮——D2 第②步 #1301

日期：2026-10-24。线：I-d2-r2（实现线续做，协调 10-24 定「这一轮一起修掉」）。性质：本 PR 自己新组件的补条件，不是已上线组件的补丁。

`node scripts/fix-churn.mjs`（2026-10-24）命中：

| 单位 | 近 14 天 | 本次碰不碰 |
|---|---|---|
| `src/workbench/ai/pointer/NodePointer.tsx`（文件 + 目录 `src/workbench/ai/pointer/`） | 2 个 fix（这一刀第 3） | 碰：摘要现算、焦点环、读屏名、英文词 |
| 概念「画布选区投影」（adapter + projection hook） | 2 个 fix（第 3） | 只加测试，不改它们 |

这两个 fix 都是本 PR 自己的过门岗提交（`d42824863` 概念写口撞名、`3d447ed2a` 推送前门岗）：新文件首次落地时被门岗卡了两回，不是已合入的组件被反复修。但这一轮是独立验收（V-d2-pointer，有条件通过）挑出的又一批改动，按 P1 写这一页。

## 0. 一句话根因

新组件把「接线」和「自带的瞬态」一起带进来，缺的是两层：接线那几行没有任何测试守（删掉或对调全绿），自带的瞬态用了「一个槽 / 一个存下来的字符串 / 组件自己加的 ring」——对「同一个节点被几个指向元素指着、目录后到、全局焦点环已存在」这三件事都不成立。

## 1. 归类表：验收发现 → 直接原因 → 类

| 验收发现（V-d2-pointer） | 直接原因 | 类 |
|---|---|---|
| 条件 2：点击派对焦 / 先收起再对焦 / 悬停进投影，三处删掉或对调，单测全绿 | 测试只钉纯函数（`agentCoversCanvas`、适配器），接线那几行没人守 | 接线无测试 |
| 偏差 8：悬停摘要缺模型名；悬停一格组高 +24px | 组把摘要拍成字符串存进 React state；摘要行悬停才出现 | 派生值被存下来 + 布局随交互改 |
| S5 反例（探针 E3）：后到者离开清掉先到者的亮 | 画布高亮认领是单槽 `hoverNodeId + hoverOwner` | 单槽模型对多实例 |
| 建议 C：行 / chip /「+N」/「回到对话」自带 ring，和全局 2px outline 叠成双环 | 组件各自加 `focus-visible:ring-*`，设计系统 §8「别再 per-component 加」只有文字 | 规则只写在文档里 |
| 建议 D：英文「Back to chat」3 词（§1.8 规则 3） | `check:controls` 量不到由变量渲染出来的标签 | 门岗盲区 |
| 建议 E：读屏名没有宿主给的结局 | 读屏名只拼节点自己的状态 | 同一个事实两处各读各的 |

## 2. 为什么这一类会一直出现

追到结构层：① 「谁来证明接线」没人认领——纯函数有测试、组件有测试，把它们接起来的那一行（`viewNodeInCanvas(...)`、投影里订阅 store 的那一行）夹在中间；② 瞬态状态（悬停认领、悬停摘要）写成「当前是谁」的单值，而世界里同时可以有几个；③ 设计系统的硬规则（焦点环全局、英文 ≤2 词）靠自觉，门岗只覆盖能静态判定的那一部分。

三条体验铁律：⑩ 不适用（不涉及参数）；⑪ 不适用；⑫「点了=以为的」：点指向元素的预期是「画布去到那个节点」，这一轮把它记成可断言的实际结果——`revealNodeFromChat.test.ts` 在画布监听的对焦事件处看收到的节点，窄窗口记「先收成小球、再对焦」的先后。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 第③步付费卡在同一节点上放第二个指向元素（卡 + 收据），先走后走都会把对方的亮清掉 | `nodeExternalHighlightStore.test.ts` / `NodePointer.test.tsx`：两种离开顺序（先进先出、后进先出）都要红在旧实现上 |
| 有人为了窄窗定位偏，在指向元素里自己 `setCenter` / `setViewport` | `pointerDoors.test.ts`：目录里出现视口写口即红 |
| 新增一种密度又自带 `focus-visible:ring` | `pointerDoors.test.ts` 焦点环那一条 + 实验室走查 `np-p2` 的 outline / box-shadow 断言 |

## 4. 靶子独立性检查

验收线（V-d2-pointer）与实现线不是同一条；变异证明在 `git archive HEAD` 导出的副本里做，不在工作树里做。不涉及评测分数，没有「修对了反而掉分」的先例。

## 5. P0：这些是我们独有的吗？现成方案有哪些

悬停联动本身是通用的 brushing & linking（两个视图同一份数据一边选一边亮），实现只用现成的 zustand store；认领摞是它里面最小的一层，没有现成库管「跨两棵 React 树的同亮认领」。焦点环用的就是现成的全局基础层（tailwind `addBase`），这一轮的改法是**删掉**组件自己的那份。英文词条走现成的 i18n。没有命中自写登记（`self-written.json`）的条目。

## 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 无可接的库（见 §5） | — | — | 不适用 |
| 补（同一 PR 续做，每处都是「换或删」，不新增分支 / 特例） | 认领单槽 → 一摞；摘要字符串 → 存 nodeId、渲染时现算、预留一行高；组件自带 ring → 删；英文词改 ≤2 词；读屏名带结局；接线补测试 + 目录搜索测试 | 悬停摘要行常驻一行高（组下面多约 18px 空白） | 低：只动新组件，0 个调用方 | **推荐（协调 10-24 定）** |
| 重写 | 把指向元素整个重做 | 一整轮 | 高：拍板稿 19 个元素已逐项对账 | 不推荐 |
| 删 | 去掉悬停联动 | — | 违反拍板（板 hover-link） | 不行 |

## 7. 用户要权衡的核心

悬停摘要这一行常驻（组下面永远多一行空白），换来第③步「生成」钮不会因为鼠标划过镜头而被顶偏。

## 特征测试清单

动结构前已钉住并随这一轮提交：

- `src/workbench/ai/pointer/revealNodeFromChat.test.ts`：点击 → 对焦事件、从别的页 / 视图点、窄窗口先收后对焦（浮窗盖住 / 停靠太窄）、宽窗口不收、已是小球不收、回到对话放回原形态并把焦点交回。
- `src/workbench/generationCanvas/reactFlow/useGenerationCanvasReactFlowProjection.test.tsx`：悬停 store → 真 hook → 对应节点 `externalHighlight` 为 `hover`，闪压过悬停。
- `src/workbench/ai/pointer/pointerDoors.test.ts`：视口写口（`setViewport` / `setCenter` 等）、唯一出口 `viewNodeInCanvas`、不许自带焦点环。
- `src/workbench/generationCanvas/store/nodeExternalHighlightStore.test.ts`、`NodePointer.test.tsx`、`nodePointerFace.test.ts`：认领一摞、摘要现算与常驻行、读屏名带结局、失败结局保持红、英文「Back」。
- `tests/ux/design-lab-node-pointer.walk.mjs`、`tests/ux/canvas-focus-composer-visible.walk.mjs`：真浏览器 / 真 Electron 的对应断言。
