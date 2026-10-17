# 方向检查：画布壳整层订阅——选中一次整个画布重走一遍（2026-10-16）

> 触发：`node scripts/fix-churn.mjs src/workbench/generationCanvas/reactFlow/GenerationCanvasReactFlow.tsx` 命中——文件近 14 天 6 个 fix，这一刀是第 7 个；概念「画布高频位置投影」（`canvas.high-frequency-projection`）同为 6 个；`GenerationCanvasReactFlowViewport.tsx` 4 个。用户 10-16 拍板：链路上一眼能定、框架明确的卡顿直接修；结构性岔路写进第 6 节交协调。

## 0. 一句话根因

本波共同类根因：选中、显示这些高频路径上，各功能各自往里挂东西（同步 IPC、全量扫描、挂载时回写、整表订阅、原图上画布），既没有结构约束，也没有按操作计数的预算。本概念的特化：**画布壳（`GenerationCanvasReactFlowInner`）是所有画布功能唯一的接线板**——每个功能要的状态都由壳整表订阅、再当参数递下去，于是「谁订阅了什么」= 「壳订阅了所有人要的东西的并集」。选区、整张 `nodes` 都在这个并集里，选中一张卡、任何一张卡写一次进度，整个约 800 行的壳带着它的几十个 hook 和投影重走一遍。

## 1. 归类表：近 14 天这个文件的 6 个 fix

| 提交 | 直接原因（这个文件里改了什么） | 类 |
|---|---|---|
| 5a7336cc4 分组交互对齐 | 组工具条要 `canvasZoom`；拖动起点要知道「拖的是不是选中组里的卡」→ 壳里改 `handleNodeDragStart` 的依赖、给 `useCanvasGroupToolbar` 加参数 | 功能经壳接线 |
| 6ae1ccd18 只按组批量生成 / 组色 / 工具条位置 | 删批量坞 hook、给组工具条加偏移与舞台尺寸参数 | 功能经壳接线 |
| e48aa37e5 拉环只在用得上的一侧 / 左「+」加输入 | 壳包一层 `GenerationFlowHandleMenuScope`、把素材选择器的 4 个回调穿给 Overlays | 功能经壳接线 |
| 58d3ac98e 拖放期间浮层不吃命中 | 壳挂 `watchCanvasDropActive` 副作用、根节点加类名 | 功能经壳接线 |
| 21daf44ef 加节点条挪到底部正中 | 给 `CanvasToolbar` 穿 `stageWidth` | 功能经壳接线 |
| 29ea8caa9 组工具条直接摆图标 | 删 `openFrameMenu` 参数 | 功能经壳接线 |

六个 fix 没有一个是壳自己的逻辑错：全是别的概念（分组、拉环、拖放、工具条）的改动**必须**改这个文件，因为它们的输入只能从壳拿。

## 2. 为什么这一类会一直出现（为什么这个文件 14 天修了 6 次）

同一个结构缺口同时造成「改动扎堆」和「整层重渲」：

1. **没有「各取所需」这一层**。React Flow 官方性能指南点名的反模式是在组件或视口层直接取整个 `nodes`（「Avoid accessing nodes in components」，https://reactflow.dev/learn/advanced-use/performance ，@xyflow/react 12.11.5），推荐把派生状态单独放、让组件只在自己那份变了时重渲；Zustand（4.5.7）的做法是选择器只取用到的那一片、事件回调里用 `getState()` 读最新值、高频值用 `subscribe` 不进渲染（https://github.com/pmndrs/zustand/blob/v4.3.3/readme.md 「Transient updates」「Selecting multiple state slices」）。我们的壳反着来：功能 hook 不自己订阅，由壳订阅后当参数递——功能一改，壳就改（churn）；功能要的东西一多，壳订阅的并集就大（重渲）。
2. **上一次修同类时只写了文字，没有门**。2026-10-05 的根因合同（`docs/fixes/2026-10-05-canvas-high-frequency-projection.root-cause.json`）已写下不变式「读者不订阅整张 nodes / edges，能用稳定标量就用标量」，但没有任何门岗：之后新挂的读者照样 `useGenerationCanvasStore((s) => s.nodes)`。普查今天全仓还有 25 处 nodes / edges 整表订阅（见本线报告；本刀删 2 处后冻结在 23 处），其中一处是没人引用的死 hook（`useNodeDisplayPrompt`）。
3. **投影没有把「选区」当成一层**。选区和节点结构混在同一个 memo 里：选区一变，节点投影 O(N) 全走、边投影 O(E) 全走（虽然对没变的会交回旧对象，但工作量跟 N、E 走，不跟选区走）。

铁律 ⑩ ⑪ ⑫：不适用——这是渲染层的工作量问题，不涉及意图抽取、模型参数清单或可点目标的预期。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 下一个画布功能（例如 #1189 白板就地编辑）又往壳里加一个整表订阅或一个依赖选区的参数 | `pnpm exec vitest run scripts/canvas-store-subscriptions.test.mjs` 与 `pnpm run lint:ci`：本刀之后这两道会红 |
| 生成中的卡越多，平移 / 拖动越卡：每次进度写入都让壳重走投影链 | `canvas-pan-while-generating` 场景的帧间隔与长任务数（D-perf 量具） |
| 选中生成框的冷启动里，壳的重渲占一大块 | `canvas-select-composer-*` 场景；壳渲染次数（本刀之后选区写入为 0） |

## 4. 靶子独立性检查

- 尺子是 D-perf 线写的 `tests/perf/canvas-scale-bench.mjs` 场景表，不是本线；本线的计数测试是确定性的（Proxy 数投影读了几个下标、对象身份 `===`），不依赖机器忙闲。
- 没有「修对了反而掉分」的先例。

## 5. P0：这些是我们独有的吗？现成方案有哪些

不是。「父层别订阅整张表、派生值单独放、回调里读最新值」是 React Flow 与 Zustand 官方文档的标准做法；门岗用 ESLint 自带的 `no-restricted-syntax`（仓库已经在用它守退出生命周期、超时下限），不自写扫描器。投影里「选区叠在结构上、按 id 只换变了的」是在现有适配器（`generationCanvasReactFlowAdapter.ts`，React Flow 的受控投影）上补增量，没有通用库能替：输入是我们的画布领域模型（编组端口、折叠编组聚合边）。

## 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案（本刀做） | 按 React Flow / Zustand 官方做法：壳不再订阅选区（选区由真正画它的视口层和浮层自己订阅，回调里 `getState()`）；投影把选区当增量层；整表订阅用 ESLint `no-restricted-syntax` 拦新增、存量冻结只减不增 | 本刀范围内 | 低：用户可见行为不变，走查覆盖选中 / 多选 / 拖动 / 连线 / 框选 / 撤销 | **推荐（已做）** |
| 补（本刀做） | 删死 hook `useNodeDisplayPrompt`；`useCanvasGroupActions` 不再整表订阅 | 很小 | 无 | **推荐（已做）** |
| 重写（限一个模块，交协调拍板） | 卡片按 id 自己从 store 读自己的节点（React Flow 推荐的「节点组件按 id 取数据」），壳只订阅「几何 + 结构」签名（id、位置、尺寸、分类、编组）。这样一张卡写进度时**只有那张卡**重渲，壳一次都不渲 | 中：`GenerationFlowNodeView` 改读法；编组端口 / 折叠代理这类不在 store 里的合成节点要单独给；`BaseGenerationNode`（P-compose 持有）入参不变但要核一遍 | 中：合成节点、撤销恢复、拖动草稿三处要逐一钉测试 | 本刀不做。**推荐下一刀做**，做完「进度写入壳 0 次重渲」才成立 |
| 重写（限一个模块，交协调拍板） | 壳拆成「接线壳 + 叶子组件」：分组工具条、到达提示、自动适应、框工具这些按各自要的那一片自己订阅，不再由壳递参数 | 中到大：壳里 20 多个 hook 逐个搬 | 中：这正是 14 天 6 个 fix 的那片地，搬的时候要一个功能一个功能对 | 和上一行一起做；搬完这个文件的 churn 应自然下降 |
| 删 | — | — | — | 不适用 |

## 7. 用户要权衡的核心

现在「选中一张卡」壳已经 0 次重渲，但「别的卡在写生成进度」壳还会重走投影（卡本身不重渲）；要把后者也降到 0，得让卡片按 id 自己取数据——这是一刀中等大小的结构改动，值不值得排在 P-compose 之后做。

## 特征测试清单（动结构前先锁住）

- `src/workbench/generationCanvas/reactFlow/canvasFlowSelectionProjection.test.ts`：选中只动变了的卡和挨着的边、对象身份、读下标计数（修前红）。
- `src/workbench/generationCanvas/reactFlow/generationCanvasReactFlowAdapter.test.ts`：原有投影复用测试，未改。
- `src/workbench/generationCanvas/components/canvasControlsStructure.test.ts`：拖动草稿、投影同步进非受控内核，未改。
- `scripts/canvas-store-subscriptions.test.mjs`：整表订阅存量冻结（修前对新基线红）。
