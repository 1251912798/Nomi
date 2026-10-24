# 方向检查：节点挂件（浮条 / 浮框）与节点本身的事件边界

日期：2026-10-18 · 触发：`NodeFloatingToolbar.tsx` 14 天内第 10 个 fix；概念「画布浮动工具栏更新」第 11 个（commit-msg 闸）· 现场：拆解前选模型第一批真机走查 `tests/ux/shot-table-node.walk.mjs` ①

## 0. 一句话根因

浮条、生成框、拆解栏都**挂在 React Flow 节点的 React 子树里**，节点自己有一整套交互（拖、平移、滚轮缩放、点击选中），而「挂件里的手势不算节点的手势」这条边界没有归属——每个挂件各抄一份 `stopPropagation`，每份漏的不一样。

## 1. 归类表

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 本次：「拆解 ▾ → 镜头表」新表被选回视频 | portal 菜单的 click 沿 React 树冒到节点 `onClick`（xyflow `handleNodeClick`），浮条只拦了 pointerdown | 挂件事件冒到节点 |
| 15350ead7 浮条贴边被舞台裁掉 / fbf55fcea 测量容差 / b4be405ab 反向缩放 | 浮条在节点的缩放坐标系里，得自己反缩放、自己测量 | 挂件住在节点坐标系里 |
| 997bdbd9f 菜单压住自己的按钮 | 同上：菜单定位要从缩放坐标换算 | 挂件住在节点坐标系里 |
| 038311650 / 2c7e4882a / 5a2af8f82 时间轴悬停把手位置 | 把手占节点本体、和节点悬停 / 拖动抢 | 挂件与节点抢手势 |
| 08dda23cf 原生时间轴手势被画布吃掉 | 拖拽事件冒到画布 | 挂件事件冒到节点 / 画布 |

## 2. 为什么这一类会一直出现

挂件住在节点里是有意的（跟着节点走、拖动时一起隐身、不用另算位置），代价是**每个挂件都要声明「我这片不归节点管」**。React Flow 只给了类名开关（`nodrag` / `nopan` / `nowheel`），**点击选中没有类名开关**（xyflow 12.11.5 节点 `onClick` 直接调 `handleNodeClick`），所以点击只能在 React 树上拦；而拦截写在每个调用方：生成框、文本框、拆解栏各抄 pointerdown + wheel，都没抄 click；浮条抄了 pointerdown 没抄 click。以前没出事，是因为挂件里没有「同步选中**另一个**节点」的动作——第一个这样的动作（先建表、再拆）一上就撞。

铁律落点：⑫ 点了=以为的——用户点「镜头表」以为会得到一张选中的新表，实际选中的仍是视频。证据：走查 ① 断言「新表被选中、下方拆解栏出现」。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 视频浮条「剪辑 → 确定」（`trimVideoToNode` 同步 `selectNode(created)`）选中的新视频被选回源视频 | 修前：在 T12 夹具上点剪辑确定，看 `selectedNodeIds`；修后同一步应是新卡 |
| 快捷动作 `nodeTryRecipes` 同步 `selectNode(focusId)` 从浮条 / 浮框触发时同样被改回 | `node scripts/door-map.mjs selectNode` 列出同步调用点逐个走 |
| 下一个往生成框里加「建节点并选中」的动作，再踩一次 | 结构测试 `canvasControlsStructure.test.ts`「owns the composer/node event boundary once」 |

## 4. 靶子独立性检查

走查与实现同一条线写，但断言的是产品语义（存储里的选中 = 新表、DOM 里出现它的拆解栏），不是像素；单测（`shotTableNodeFlow.test.ts`）只测 store，测不到 React 树冒泡——这正是它漏掉的原因，不是靶子错。

## 5. P0：现成方案

- xyflow 的 `NodeToolbar`（12.11.5，`dist/esm/index.mjs` `function NodeToolbar`）解决「坐标系」那一半（不随缩放、自己定位），但它仍是节点组件的 React 子节点，**点击照样冒到节点**——解决不了本次这一半。
- xyflow 类名开关只覆盖拖 / 平移 / 滚轮；点击选中没有。
- 结论：点击边界只能自己在 React 树上拦，但应**只拦一处**，归挂件的宿主组件，而不是每个调用方。

## 6. 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 浮条换 xyflow `NodeToolbar` | 重写浮条定位（已有 10 个 fix 沉淀的测量 / 避让逻辑） | 大；且点击冒泡照旧 | 否（不解决本类；坐标系那一半另立题） |
| 补（本次做的） | 事件边界收进两个宿主：`FloatingToolbarFrame` 与 `ComposerAnchor` 自己拦 pointerdown / wheel / click；三个调用方删掉各自那份；`ComposerAnchorProps` 去掉这三个 handler，调用方传不进来 | 小，4 个文件 | 低：挂件里的点击本来就不该是「点节点」；文档级 click 监听只有一处且在捕获阶段 | **是** |
| 重写（一个模块） | 挂件统一挪出节点子树、挂到画布级图层 | 大；拖动隐身、跟随、编辑器不重建都要重做 | 大 | 否（现在没必要） |
| 删 | — | — | — | 不适用 |

## 7. 用户要权衡的核心

挂件继续住在节点里（省掉定位和跟随的活），代价是「哪些手势不归节点」必须由挂件宿主统一声明——本次把这条声明从各调用方收回到两个宿主，按默认已做；要不要进一步把浮条换成 xyflow `NodeToolbar` 解决坐标系那一半，是另一道题，不在本批。

## 特征测试清单

- `src/workbench/generationCanvas/components/canvasControlsStructure.test.ts`：浮条外壳拦 pointerdown + click；`ComposerAnchor` 自己拦三样且 props 类型去掉这三个 handler
- `tests/ux/shot-table-node.walk.mjs` ①：真点击「拆解 ▾ → 镜头表」后新表被选中、拆解栏出现（中英光暗四轨）
- 现状测试：`src/workbench/generationCanvas/nodes/**` 196 个文件全过（改动前后同数）
