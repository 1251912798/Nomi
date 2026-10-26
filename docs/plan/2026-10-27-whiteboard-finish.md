# 设计卡：画板收尾——画过的看得见、尺寸不乱跳、失败说真话

改动名：老画板卡片显示画过的内容；画框尺寸的待提交不再把中间值写进文档；走查量取前先等元素就绪；「完成」失败的提示说真话
线/负责人：Mac Claude 实现线 I-whiteboard-finish / `fix/whiteboard-finish`（基于 origin/main 26fbc87d3）
类别：[其他]（纯 bug 修复：不新增元素、不改布局；路径推出的类别见文末「功能分类」）

方向检查：`docs/engineering/direction-checks/2026-10-27-whiteboard-finish.md`

**状态：📋 方案待拍板（停在设计卡）。** 要改的文件 `WhiteboardDrawingTool.tsx` 本身命中方向检查（14 天第 4 个 fix），按派工书停点，本轮只提交本卡和复盘，不动产品代码。下面「要定的事」答完再开实现。

## 0. 在现在的代码上核实（origin/main 26fbc87d3，2026-10-27）

派工书的行号是 10-24 对账时的，逐件重核如下。原始证据来自 10-24 的独立验收报告（协调状态目录 `reports/V-whiteboard.md`，下称 V 报告）。V 报告验收的提交是 2de50bba7，它和现在的 main 在 `WhiteboardCardBody.tsx`、`InlineWhiteboard.tsx`、`WhiteboardDrawingTool.tsx`、`render/CardCommon.tsx`、`render/NodeCardBody.tsx` 和走查文件上逐字相同（`git diff 2de50bba7 HEAD -- <这些文件>` 为空），所以它的真机截图就是现在代码的 before。本轮也起过一次构建想重拍：排队等锁期间，5 分钟负载升到 13–14（≥10），拿到锁刚开始构建就撤掉了，没拍，也没留下构建产物。下面引用的截图本线都亲眼看过：中英 `S3a-legacy-on-open.png` 里，老画板和空画板一样只有一个毛笔圆钮；中英 `S5-failure-feedback.png` 里，编辑器开着、红线还在，提示是旧句子。

| 件 | 派工书写的 | 现在的代码 | 结论 |
|---|---|---|---|
| 1 老画板看着像没画 | 卡片只有结果图时才显示内容，否则画启动器；`whiteboardHasVisibleContent` 只在「完成」里读 | `WhiteboardCardBody.tsx:40-55` 只在 `canvasImageSourceOf(node.result)` 有值时走图片分支，否则 `:57-73` 画启动器。`whiteboardHasVisibleContent` 全仓只有 `InlineWhiteboard.tsx:205` 一个读者（`door-map`：1 扇）。V 报告的截图 `probe-out/zh-CN-light-try1/S3a-legacy-on-open.png`：state 里有一笔红线的老画板，卡片上是「打开画板」 | 对得上。另有一处要记：用户 10-22 拍板原话（`InlineWhiteboard.board.json` O40）是「有内容显示缩略图……没内容才显示启动器」；10-22 设计卡验收清单里「入口 2：老画板打开项目仍显示启动器」比拍板原话窄。本卡按拍板原话，取代那一行；「不凭空出图」里「不落盘、不自动改写」的意思保留 |
| 2 尺寸被写成中间值 | `WhiteboardDrawingTool.tsx` 约 :555-583 的 ResizeObserver，同尺寸早退不撤 250ms 计时器 | 这段现在是 `:552-584`。早退有三处：`:566` 量不到（宽或高 <1）、`:571` 画框和文档差不到 1 个屏幕像素（10-22 加）、`:573` 换算取整后相等（#1189 起就有）。后两处既不撤 `commitTimer`，也不清 `liveDimensions`，`:576-579` 在 250ms 后把上一次的尺寸写进文档 | 对得上，而且范围比派工书写的宽：不只拖框。V 报告的 sizerace 探针往尺寸框零间隔连敲，18 次里 2 次停在中间值（敲 640 停在 64、敲 1000 停在 100，`probe-out/sizerace/results.json`）。撤销 `:544-551` 只清 live 尺寸，不撤待提交，属于同一类的另一扇门。缺陷从 #1189（9291455b5，10-12）就在，10-22 的 1 像素容差让它更容易碰上 |
| 3 走查不等就量 | `whiteboard-refactor.walk.mjs` 约 :92 的 `boundingBox()` 没等稳定 | 就在 `:92`：打开项目、收起 Agent 面板之后立刻 `getByText('Photograph').boundingBox()`。V 报告 en 首轮在这里拿到的是 null（元素还没可见），不是过渡中的尺寸。两种都属于「没等就量」。同一文件还有 7 处裸量取：`:59 :70 :143 :153 :175 :203 :235` | 对得上；失败形状比派工书多一种（null） |
| 4 失败文案是旧说法 | `snapshotSaveFailed`（约 :974），`InlineWhiteboard.tsx` 约 :158、:253 在用 | 键在 `generationCommon.ts:974`（zh）和 `:2683`（en）。`InlineWhiteboard.tsx:158` 在出图事务 `saveImageWhiteboardSnapshot` 里，三种操作会走到：画板「完成」、图片入口「完成」、图片入口相机「保存为主图」。`:253` 在 `handleCreateScreenshotNode` 里，只有画板入口的相机「截图并创建图片节点」会走到 | **`:158` 对得上，`:253` 对不上。** `:253` 那条路确实是截图（新建一个截图节点），旧句子在那里说的是真话；换成「请再点一次「完成」」反而会把人引去做另一件事，因为「完成」出的是画板自己的图，不会建截图节点。按派工书写进本卡，见 Q3。另核了「失败时内容还在」：代码上，`handleClose` 的 catch（`:219-225`）只报错，不关编辑器，也不写节点；真机上，V 报告 S5 把 assets 目录改成不可写后按「完成」，编辑器留着、报出错误、没有新版本，恢复权限后再按一次正好出 1 版，笔画逐字相同。所以句尾补「，画板里的内容还在」/「 Your board is unchanged.」 |

方向检查（`node scripts/fix-churn.mjs`，2026-10-27）：

| 文件 | 结果 |
|---|---|
| `WhiteboardDrawingTool.tsx` | **文件本身命中**：14 天里已有 3 个 fix（05521e29c 和 ccbbcea64 是文字对象的两轮评审，e26c56a65 是默认工具加 1 像素容差），本刀是第 4 个，按派工书停点在设计卡提交后停下。复盘交用户拍板 |
| `generationCommon.ts` | 词典按功能键数：命中的是 `#production`、`#observability`，本单只动 `#whiteboard`，没命中 |
| `WhiteboardCardBody.tsx`、`InlineWhiteboard.tsx`、`whiteboardRasterState.ts`、走查 | 没命中 |
| `render/CardCommon.tsx` | 目录命中（`render/` 14 天第 5 个）；本单只复用，不改 |

## 要定的事（每条带推荐）

- **Q1（交用户：热点文件）第 2 件怎么改。** 推荐用「换」：把「画框 → 文档尺寸」的同步抽成单独的小 hook，防抖改用已有的 Mantine 8.3.18 `useDebouncedCallback`（带 `cancel`），提交的那一刻重新读画框和文档：两边一样就不提交、只清 live 尺寸；不一样就提交画框此刻的尺寸。每次观察到「一样」都撤掉待提交并清 live 尺寸。另一个选法是派工书原话的「补」：在两个早退分支各加一句撤计时器、清 live 尺寸。两种都要改 `WhiteboardDrawingTool.tsx`。差别在于「补」挡不住撤销、改比例、尺寸框输入这几扇门：250ms 内仍会被旧的待提交盖回去。对比见复盘第 6 节。
- **Q2（协调：概念登记）第 1 件要动两份概念登记。** 现画预览需要一个离屏 Leafer 实例，但 `canvas.whiteboard-scene` 的说明写的是「LeaferCanvas 唯一创建/销毁 Leafer App」。推荐改登记：交互实例仍只归 `LeaferCanvas`；新增的离屏只读预览实例归新函数 `renderWhiteboardStatePreview`，一次性用，不带 editor，导出完就销毁；两者共用 `renderWhiteboardScene`，不另写渲染器。`canvas.whiteboard-document` 的 `allowed_consumers` 加上这个新文件（它读 state）。不推荐的替代：在卡片里挂一个隐藏的 `LeaferCanvas`。那样能不改登记，但每张老画板要常驻一个带 editor 的交互实例，导出的还是全尺寸原图，违反「画布只挂预览图」（`canvasImageSource.ts` 头注）。
- **Q3（协调：派工书没覆盖的路）画板相机「截图并创建图片节点」失败时（`:253`）说什么。** 推荐新键 `screenshotSaveFailed`，按句式和「完成」那句对齐：zh「截图没能存下来，请再点一次截图，画板里的内容还在」/ en「Couldn't save the screenshot. Take it again. Your board is unchanged.」。备选是复用已有的 `screenshotFailed`「画板截图失败」：不新增文案，但少了「再试一次」。不论选哪个，旧键 `snapshotSaveFailed` 都在同一提交删掉。
- **Q4（协调）图片入口相机「保存为主图」失败时**，走的是同一个出图事务，提示也会是「请再点一次「完成」」。推荐接受：再点「完成」重试的正是同一件事，结果一样。如果要分开说，会多出一个特例分支。
- **Q5（协调：证据口径）拍板图的例外 `pure-bugfix`**，登记标签写的是「不改布局、元素、文案」，但第 4 件要改文案。是照派工书用这个例外，还是认领 `InlineWhiteboard` 板清单，由协调定。
- **Q6（协调：范围）同一类的其它门**（见 ★2）：轻量卡、Agent 指向元素、生成列表、下游参考。它们对老画板仍然是空的。本单只收卡片，是否另派由协调定。

## ★1 用户怎么用

- 当我打开以前画过的项目（0.23.0 或 10-22 之前画的画板，只按过「完成」），我想在画布上一眼认出每块画板画了什么，以便不用逐个点开，也不会以为白画了。
- 当我在画板里拖框、点比例或在尺寸框里改尺寸，我想画板停在我最后定的那个尺寸，以便「完成」导出的就是我看到的范围。
- 当「完成」没存下来，我想知道是图没存下、我的画还在、再按一次「完成」就行。

步骤：
1. 打开一个有老画板的项目。
2. 老画板卡片上显示画过的内容，和出过图的画板长得一样，空画板仍是启动器。
3. 点它（先选中再点，规矩不变）打开，笔画、文字、图片都在。
4. 拖框或改尺寸，停手后工具条读数和盘上尺寸都是最后定的值。
5. 按「完成」。
6. 万一失败：编辑器留着，提示说真话，按钮能再点；再按一次就成功。
7. 卡片显示新出的图（10-22 的行为不变）。

不做什么：不给老画板自动补写结果，不落盘；打开画板和按「完成」的既有行为都不变；不改绘制、导出、素材面板、版本历史和节点外壳；不新增元素和卡片状态；现画的预览只给眼睛看，不当节点结果，所以要连到下游当参考仍要先按一次「完成」（和改前一样）。

已知坑：
- 现画预览和「完成」的导出共用 Leafer 的全局导出队列（`@leafer-in/export` 串行）。预览要自己排成一次一张，免得用户按「完成」时排在一串预览后面。
- 老画板多的项目，打开时会依次离屏渲染多张；成本没量过，见 ★9 E2。
- 预览和「完成」导出一样是 `#fbfbfa` 白底，暗色下是一块亮卡片，同现状的结果图。

真实任务（素材用仓库的真镜头 640×360，夹具在测试里自己造，不拷用户项目）：
1. 0.23.0 形态的老画板（只有 state：红色画笔一笔 + 一段文字 + 一张导入照片，没有 result）：打开项目后卡片显示内容；打开它，不改直接按「完成」，正好出 1 版。
2. 尺寸框零间隔连敲 900 / 640 / 900 / 720 / 900 / 1000，CPU 降速 1× / 4× / 8× 各一轮（V 报告 sizerace 手法）；另外把画框往外拖再拖回原尺寸。
3. 把项目 assets 目录改成不可写后按「完成」（V 报告 S5 手法）：看提示文案，编辑器留着；恢复权限再按一次，正好 1 版，笔画逐字相同。

指标（目标 → 信号 → 指标；量具逐个点名）：
- 主指标：有可见内容、没有结果的画板，打开项目后显示内容的比例。基线 0/1（V 报告 S3a 截图，2026-10-24），目标 1/1。量具：`tests/ux/whiteboard-refactor.walk.mjs` 加「老画板」断言（中英各跑）+ 卡片单测。
- 质量指标：尺寸停在中间值的比例。基线 2/18（V 报告 sizerace，2026-10-24），目标 0/18。量具：同一个探针重跑（不进仓库）+ 确定性单测，单测先红。
- 质量指标：Done 失败时的提示等于 `drawingSaveFailed` 键的值（中英）。基线：提示是「截图」说法。量具：InlineWhiteboard 失败路径单测、`check:i18n`、S5 手法真机截图（中英）。
- 护栏：打开项目不写盘（老画板节点记录打开前后逐字相同）；空画板仍是启动器；有结果的画板不触发现画；编辑中不重复现画。量具：走查读 `project.json` 比对 + 单测。
- 护栏：走查第一步不再因元素没就绪拿到 null。基线：V 报告 3 次首轮里 en 红 1 次。量具：zh / en / 暗色各真跑一遍，记首轮结果；连跑统计**未验证：缺量具**。

### ★1b 连带界面

- 画布轻量档（`LightweightGenerationNode`）、Agent 指向元素（`nodePointerFace`）、生成列表、下游参考芯片都按 `node.result` 取图，对老画板仍是空的。本单不改，记为残余（Q6）。
- 失败提示只出现在编辑器工具条下方的内联反馈里（`WhiteboardEditingToolbar` 的 `feedback`），不进通知中心，也没有 Agent 回执。

## ★2 谁说了算

- **画板节点在画布上的样子**：唯一 owner 是 `WhiteboardCardBody`，全仓只有它用 `EmptyStateLauncher` 画画板启动器。规则换成一条：有可见内容就显示画板的图（有结果用结果图，没结果用按 state 现画的预览），没有可见内容才显示启动器。「有没有可见内容」只有一个定义 `whiteboardHasVisibleContent`，卡片和「完成」读同一个函数。所以卡片显示启动器，等价于「完成」只存 state。
- **state → 图**：新增只读派生 `renderWhiteboardStatePreview`（新文件 `whiteboardStatePreview.ts`）。复用 `renderWhiteboardScene` 和 `restoreSceneTransforms`；离屏 Leafer 只用一次就销毁；按 `whiteboardRasterStateKey` 缓存，次数有上限；一次只渲染一张；不写 store，也不落盘。只在 `!node.result && whiteboardHasVisibleContent(state)` 时做，这一节点的画板会话开着时不做（读 `useWhiteboardSession`，`canvas.whiteboard-session` 已把 `WhiteboardCardBody.tsx` 列为消费者）。碰到的概念：`canvas.whiteboard-scene`（多一个离屏实例，要改登记，Q2）、`canvas.whiteboard-document`（加一个读者）。
- **画布尺寸**：文档的 `canvasDimensions` 归 `WhiteboardDrawingTool` 的文档历史（`setState` → `storeDocument`）。写口一共 5 扇：比例按钮 `setActiveRatio`、尺寸框 `handleDimensionsChange`、画框 ResizeObserver 的提交、撤销/重做 `moveHistory`、初始 state。`liveDimensions` 和待提交只归 ResizeObserver，其它 4 扇写口不知道它的存在，这就是这次 bug 的结构原因。
- **失败文案**：键归 `generationCommon.ts` 的 `#whiteboard` 段。调用点 2 个：`:158`（出图事务）、`:253`（截图建节点）。
- 同一份事实存了几份：老画板的图，落盘 0 份，内存缓存 1 份（派生，丢了可以重画）；尺寸，文档 1 份，加 live 1 份（只用于过渡显示，提交或撤销后清空）。
- 不靠猜意图：是否现画只看 `node.result` 和 `whiteboardHasVisibleContent`，都是显式事实。

## ★3 一致与复用

- 卡片外观：复用现有「有结果」分支，`CardActivationButton` + `DeferredNodeImage`。品牌类型 `CanvasImageSource` 通过 `canvasImageSourceOf({ type: 'image', url, previewState: 'source' })` 拿到：有界预览就是「源本身已有界」（bounded-source），所以不用改 `canvasImageSource.ts`。现画过程中显示 `DeferredNodeMediaPlaceholder`，就是结果图加载时同一块底，静态，不扫光。没有新样式、新元素或全局 CSS。
- 渲染：复用 `renderWhiteboardScene`（编辑器用的同一个场景渲染器）。离屏实例用 leafer-ui 2.1.7 的 `new Leafer({ width, height })`：不给 view 时会自建一个 canvas，见 `node_modules/leafer-ui/dist/web.esm.js:76-79,105-107`。导出用 `@leafer-in/export` 2.1.7：它会等 `waitViewCompleted` 和 `Resource.isComplete`（图片都加载完），并在全局串行，见 `export.esm.js:210-238`。否决「另写一个 SVG 渲染器」：那是第二份渲染器，橡皮蒙版、翻转、组合变换都要重写一遍，迟早会和导出图对不上。
- 缓存键用 `whiteboardRasterStateKey`，就是「完成」判断「没改动」用的同一个键；有没有内容用 `whiteboardHasVisibleContent`，同一个定义。
- 尺寸同步（如果 Q1 选「换」）：用 Mantine 8.3.18 的 `useDebouncedCallback`（已在依赖里，`useStateHistory` 出自同一个包），替掉手写的 `setTimeout`。
- 文案：沿用 `generationCommon.whiteboard` 命名空间。测试按键取值（`check:test-copy-literals` 不许抄字面），并核对 zh / en 句子里各自包含同语言的 `whiteboard.done`，这样按钮改名时这里会跟着红。
- 走查：复用 `_assert.mjs` 的 `waitForVisualQuiescence` 和 Playwright 的 `expect(locator).toBeVisible()`，不新写等待器。
- 第二份定义：没有。

## ★4 全状态

画板卡片（老画板 = 没有结果、有可见内容）：

| 状态 | 用户看到什么 |
|---|---|
| 空画板（没有结果，没有可见内容；只有橡皮、只有空白文字也算空） | 启动器「打开画板」（不变） |
| 有结果图 | 结果图（不变，不现画） |
| 老画板，现画中 | 和结果图加载中同一块底，能点开（同一个 `handleOpen`） |
| 老画板，现画好了 | 现画的图，样子和有结果时一样，点开规矩不变（先选中再点） |
| 老画板，现画失败（Leafer 加载失败或导出报错） | 回到启动器，也就是今天的样子，点开内容都在；记开发日志，不弹错，因为这不是用户的动作失败 |
| 老画板，素材图文件丢了 | 照 Leafer 现状画，缺的那块空着，和「完成」导出一致 |
| 编辑中（会话开着） | 卡片被编辑器盖住，不现画。关闭后：按「完成」出了图就显示结果图；空画板显示启动器；切项目卸载的，下次按最新草稿现画 |
| 只读 | 现画的图照样显示，点开无效（同现状） |
| 轻量档（大画布缩得很远） | 不渲染卡片正文，不现画；轻量卡对老画板仍是空的（残余，Q6） |
| 取消中 / 过期 / 能力不可用 | 不适用：现画不调模型、不联网，Leafer 是本地库 |

尺寸：拖框、点比例、改尺寸框时，工具条读数跟着 live 尺寸走。停手 250ms 后，把画框此刻的尺寸提交为文档尺寸；回到原尺寸时清掉 live 尺寸，不提交。撤销、重做、比例按钮、尺寸框写进来的尺寸，不会被旧的待提交盖回去（如果 Q1 选「补」，这一条记为残余）。

失败提示（中英）：

| 怎么走到 | 提示 |
|---|---|
| 画板或图片入口按「完成」，落盘拿不到地址 | zh「画好的图没能存下来，请再点一次「完成」，画板里的内容还在」；en「Couldn't save the drawing. Press Done to try again. Your board is unchanged.」（键 `drawingSaveFailed`）。编辑器留着，「完成」退出忙态，能再点 |
| 图片入口相机「保存为主图」，同一事务 | 同上一句（Q4） |
| 画板入口相机「截图并创建图片节点」 | 待 Q3 |

文案不提钱、不提计费。

## ★9 验收与回滚

验收清单（实现线自验、验收线只核这份；先写的单测要先红）：

- **A 第 1 件**
  - A1 单测（先红）：`kind=whiteboard`、没有 result、`meta.whiteboardState` 里有一笔 brush 时，`WhiteboardCardBody` 渲染 `whiteboard-open-preview`，不渲染 `whiteboard-empty-action`。
  - A2 单测：默认空 state、只有橡皮、只有空白文字，都是启动器；有 result 时显示结果图，现画函数调用 0 次。
  - A3 单测：按 `whiteboardRasterStateKey` 缓存。两张同键的卡只渲染 1 次；只改选中或图层名不重画；改笔画会重画。
  - A4 单测：这一节点的画板会话开着时不现画，草稿变化也不触发渲染。
  - A5 单测：现画全程不调 `updateNode`、`persistNodeImageFile` 或任何落盘口（mock 断言 0 次）。
  - A6 走查（中英各一遍）：`whiteboard-refactor.walk.mjs` 的夹具加一块老画板（红笔画 + 文字 + 一张导入照片，没有 result）。打开项目后，节点里 `whiteboard-open-preview` 内有 img，没有启动器；在页面内解码这张图，能读到红色笔画的像素；打开项目前后，这个节点在 `project.json` 里的记录逐字相同；打开它，笔画都在，不改直接按「完成」，正好 1 版。
  - A7 真机截图：中英各一张老画板卡片的 before 和 after，亲眼看。before 可以用 V 报告的 `probe-out/{zh-CN-light,en-light}/S3a-legacy-on-open.png`（代码逐字相同），也可以在本卡的提交上构建后重拍。
- **B 第 2 件**
  - B1 单测（先红）：画框在 250ms 内 S0 → S1 → S0，300ms 后文档尺寸是 S0，live 为空，工具条读数是 S0。
  - B2 单测：取整相等的分支同样撤掉待提交；画框量不到（宽或高 <1）时不动已排的提交，本卡把这条定为规则。
  - B3 单测（Q1 选「换」时写）：S0 → S1 之后 250ms 内撤销、点比例或在尺寸框输入新值，旧的待提交不会盖回去。
  - B4 单测：打开时 `InlineWhiteboard.tsx:81-86` 会把画框调成文档比例，这一下不得改写文档尺寸。节点是 4:3、文档是 16:9 时，打开后文档仍是 1280×720。
  - B5 真机：sizerace 探针 18 次，0 次停在中间值（基线 2/18）；中英各截一张「拖框来回之后」的工具条读数，并读盘上的 `canvasDimensions`。
- **C 第 3 件**
  - C1 走查 `:92`：先等元素可见，再 `waitForVisualQuiescence`，然后才量。拖完断言节点 position 真的变了，量错就红，不再静默。
  - C2 同一文件其余 7 处裸量取，都改走同一个本地 helper（等可见 + 安定）。
  - C3 zh / en / 暗色各真跑一遍 `node tests/ux/whiteboard-refactor.walk.mjs --repo-media`，记首轮结果。
- **D 第 4 件**
  - D1 单测（先红）：画板「完成」时落盘返回空，提示为 `t('generationCommon.whiteboard.drawingSaveFailed')`；`onClose` 没被调；没有带 result 的 `updateNode`；画板 state 不变。
  - D2 单测：画板相机落盘返回空时，提示为 Q3 定下的键。
  - D3 i18n：zh / en 都有新键，两边都没有 `snapshotSaveFailed`；zh / en 的 `drawingSaveFailed` 各自包含同语言 `whiteboard.done` 的值；`pnpm run check:i18n` 绿。
  - D4 真机：用 S5 手法，中英各截一张失败提示，亲眼看；恢复权限后按「完成」，正好 1 版，笔画逐字相同。
- **E 通用**
  - E1：改到的 vitest、ESLint、`node scripts/typecheck.mjs`、`pnpm run check:i18n`、`node scripts/check-concept-owners.mjs`、`git diff --check`、推送前快检，每条记退出码。schema v3 根因合同 `docs/fixes/2026-10-27-whiteboard-finish.root-cause.json`（第 1 件同属 10-22 逃逸那一类，第 2 件是同一段第二次修，合同必带），在写产品代码前起草。
  - E2：路径会推出 `perf-scenario` 证据。打开项目时现画老画板是新成本：建议在 `tests/ux/whiteboard-perf.probe.mjs` 加一个 scene（24 块老画板，每块 12 张图 + 24 笔），测「打开到全部预览出现」和期间超过 50ms 的长任务数，预算沿用 ★7 默认（打开到能操作 ≤1s，交互期间 >50ms 长任务 0 个）；或者由协调判「不适用」并写理由。

反例（实现后逐条做，记「反例 → 结果 → 证据」）：

| 反例 | 必须红的 |
|---|---|
| R1 拿掉第 2 件的「撤掉待提交 + 清 live 尺寸」 | B1 |
| R2 拿掉第 1 件的现画预览，卡片回到只认 result | A1、A6 |
| R3 现画里加一次 `updateNode` | A5 |
| R4 现画函数保留，但卡片判断改回「有 result 才显示图」（防「写了没接上」） | A1 |
| R5 文案键改回 `snapshotSaveFailed` | D1、D3 |
| R6 走查第一步的拖动起点故意偏到标题外（量错的样子） | C1 的「position 变了」断言 |
| R7（「换」）提交回调不重读画框，用观察时的旧值 | B3 |

同一类还会从哪些入口、形状、边界、版本回来：

- 第 1 件：老数据形状。只有 state 的画板（0.23.0 和 10-22 之前）本单收；有结果、但还有没按「完成」的草稿的画板，卡片显示的是旧结果图（残余）。其它呈现门：轻量卡、Agent 指向元素、生成列表、下游参考（残余，Q6）。
- 第 2 件：画框尺寸变化的全部来源：拖框（NodeResizer）、尺寸框、比例按钮、撤销 / 重做、打开时的 mount 调整（`InlineWhiteboard.tsx:81-86`）、画布缩放（缩放不改画框的 CSS 尺寸，不触发 ResizeObserver）。
- 第 3 件：本走查其余裸量取本单收；仓库里其它走查的裸 `boundingBox()` 不在本单，记残余（可以考虑做成门岗，另立）。
- 第 4 件：`saveImageWhiteboardSnapshot` 的三种触发，加上 `handleCreateScreenshotNode`。

回滚：revert 实现提交即可。现画预览不落盘、不改数据格式，revert 后老画板回到启动器；文案键 revert 后旧键回来。本卡和复盘是单独的文档提交，不用回滚。

## 功能分类

- [x] 新界面 / 改交互（路径推出：改了 `src/**/*.tsx`；本单不新增元素，拍板图用例外 `pure-bugfix`，文案那条见 Q5）
- [ ] 花钱
- [ ] 长跑 / 可打断
- [ ] Agent 行为
- [x] 大数据量 / 画布 / 长列表（路径推出：`src/workbench/generationCanvas/`）
- [ ] 生成效果
- [ ] 数据格式（现画不落盘，不改格式）
- [x] 新增功能 / 性能（路径推出；`perf-scenario` 证据见 ★9 E2）
