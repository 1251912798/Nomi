# 方向检查：剪辑节点时间轴片段的叠层（标签 × 手柄）类根因复盘（2026-10-12）

> 触发：`node scripts/fix-churn.mjs src/workbench/generationCanvas/nodes/ClipNodeTimeline.tsx` 命中（近 14 天 5 个 fix，这刀是第 6 个）。
> 结账挂的类检查：`tests/ux/clip-label-under-handle.walk.mjs`（真 Electron 里量文字与手柄的几何）+ `src/workbench/generationCanvas/nodes/clipNodeGestureModel.test.ts`（选中态是最宽态）。

## 0. 一句话根因

片段里「压在边缘的东西」（手柄、命中垫）的宽度由 `clipNodeGestureModel.ts` 一处推导，而片段里「铺满全宽的东西」（标签）的内边距是组件里另写的一个固定数字 6px——两边没有任何推导关系，手柄一变宽就压住标签首字符。

## 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 10-12：英文暗色标签 "Image" 显示成 "mage" | 标签 `px-1.5`（6px）；选中态手柄 8–16px、z-30，盖住首字符 | 同一片段内两个元素的几何各写各的 |
| 近 14 天同文件 5 个 fix（`58c7624c5`、`21c444038`、`d8ab1bca8`、`f02ede49e`、`e48aa37e5`） | 手势归属、手柄宽度、命中垫、读屏隐藏——都是「手势」类，不是「标签」类 | 手势归属 / 命中几何（已收进 `clipNodeGestureModel.ts` 与手势会话入口，owner 登记 `canvas.clip-gesture-geometry`） |

结论：近期那 5 个 fix 与这一刀不同类；它们已把手势几何收成一处 owner，这一刀正是漏掉了「owner 的另一个消费者（标签）」。

## 2. 为什么这一类会一直出现

手柄宽度随缩放、选中、片段宽度变化（8–16px，按屏幕像素换算），标签却按设计像素写死 6px；手柄 `absolute inset-y-0 z-30` 天然在标签之上。没有任何测试量过「标签首字符在手柄之外」，旧走查只量手柄的命中，不量文字。

三条体验铁律：⑫「点了=以为的」相关（用户看见的名字被盖住，认不出是哪个素材）；不涉及 ⑩ ⑪。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 以后谁再调手柄宽度（`CLIP_HANDLE_MAX_HIT_PX` 等），标签又会被压 | 走查 `clip-label-under-handle.walk.mjs` 量首字符左边界 vs 手柄右边界；改常量后该走查会红 |
| 片段上再加任何铺满全宽的东西（时长角标、状态条）会同样被手柄压 | 同一走查的几何断言按 `[data-clip-label]` 取；新元素要进同一处推导 |

## 4. 靶子独立性检查

- 走查用浏览器的 `Range.getBoundingClientRect()` 量文字、`getBoundingClientRect()` 量手柄，判据不依赖修复代码内部。
- 修前该走查红（zh 亮 / en 暗、选中 / 悬停四个场景共 16 条断言全红：首字符左边界 591 < 手柄右边界 599.3），修后全绿。
- 修复没有减少任何功能，不存在「修对了掉分」的先例。

## 5. P0：是不是我们独有的？现成方案

片段手柄与标签的几何是剪辑节点的领域内部几何，不是通用能力；CSS 层面没有「让出另一个绝对定位兄弟的宽度」的现成机制（手柄是脱离文档流的 absolute 兄弟，flex / grid 不会为它留位）。不用新增库。未查 Context7（纯 CSS 几何，无三方库可接）。

## 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 无现成方案（见 5） | — | — | 不适用 |
| 补 | 标签内边距改读 `clipHandleHitWidth({ selected: true })`（owner 的最宽态），删掉固定 `px-1.5`；加几何走查 | 一行；窄片段（约 40px）标签只剩首字符 + 省略号 | 窄片段可读性差 | 推荐（本刀） |
| 重写（限一个模块） | 标签挪到手柄带之外的另一行 / 悬浮提示 | 改片段布局，需拍板图 | 改了可见布局 | 另议（见 7） |
| 删 | 窄片段不显示标签 | 丢信息 | 丢功能 | 否 |

## 7. 用户要权衡的核心

让标签永不被手柄压住，代价是窄片段（2 秒片段在默认轴上约 40px）的标签几乎只剩一个字符：要不要为此给窄片段补悬浮全名，或把标签挪出手柄带（需新样张）？

## 特征测试清单（动结构前先锁住）

- `src/workbench/generationCanvas/nodes/clipNodeGestureModel.test.ts`：手柄宽度 8–16px、悬停最小宽度、选中态最宽（本刀新增）。
- `tests/ux/clip-label-under-handle.walk.mjs`：标签不被手柄压住的几何（本刀新增）。
- `tests/ux/clip-gesture-ownership.walk.mjs`、`tests/ux/clip-node-editing.walk.mjs`：手柄手势未改，本机未重跑（见 PR 正文）。
