# 方向检查：打开大分镜方案卡死（一次挂载全部镜头行）

> 触发：`node scripts/fix-churn.mjs` 命中——`StoryboardShotTable.tsx` 近 14 天第 3 个 fix、`StoryboardPlanEditor.tsx` 第 5 个、`StoryboardShotRow.tsx` 第 3 个。
> 这一刀不是在旧结构上再补：把「整张表全量挂载」**换**成成熟库的窗口化（P0 接入），同一提交删掉逐行测宽、逐行素材池。
> 结构性结论（第 6 节）交协调给用户过目。

### 0. 一句话根因

分镜表把方案里的**每一镜**都挂成完整的富组件行（提示词编辑器、参数区、素材池、宽度测量各一份），挂载成本随镜头总数线性涨，而这条路径上既没有结构约束（只挂看得见的），也没有按操作计数的预算——每给行加一样东西，打开大方案就再慢一点，只在用户手里才被发现。

（本波共同类根因：选中、显示这些高频路径上，各功能各自往里挂东西，既没有结构约束，也没有按操作计数的预算。本概念的特化：**行级组件各自做「整表只需做一次」的事**——量宽度、取素材池、建编辑器。）

### 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| storyboard-plan-open：320 镜打开 18.2 秒（预算 1 秒），期间整个应用不响应（C-trace 第 1 项） | `StoryboardShotTable` 直接 `group.shots.map` 挂 320 行；322 个 TipTap 编辑器、27,679 个元素；编辑器初始化约占可归因样本 31.2% | 全量挂载 |
| 同上，逐行布局读 | `StoryboardRowShell` 每行 `useElementWidth` → 布局 effect 读 `clientWidth`，自身约 17.7%；326 次 Layout | 行级组件做整表的事 |
| 同上，主进程扫描 | 每行 `useShotMentionSource` → `useAssetPool` → `useWorkspaceFiles` 挂载即 `workspace.listFiles`（上限 2000）：320 镜 = 主进程扫 320 遍同一目录 | 行级组件做整表的事 |
| 同上，同步 IPC（次要，约 6.4%） | 模型目录 `listModels` / 每行参数区 `listMappings` 走 `invokeSync` | 挂载时同步 IO（**归 P-compose**，见第 6 节） |
| C-0231：访问过分镜后切稿卡（#1193 已用 React.Activity 冻结隐藏树） | 隐藏的分镜树仍订阅文稿，切稿整表卸载 / 重挂、逐行测宽 | 全量挂载被放大 |
| 近 14 天三处热点的其余 fix（批量选择、页脚入口、描边、外壳重设计） | 各自的交互 / 版面修补，与本类无关 | 不同的类（热点是因为这几个文件是分镜页的主体，改动面集中） |

### 2. 为什么这一类会一直出现

- 表没有「视口」这个概念：行组件被假定为「便宜、数量不多」。2026-09 起行里陆续加了编辑器、画布同款参数区、@ 候选素材池、宽窄档测量——每一样单看都合理，乘以镜头数就失控。
- 行级组件拿不到「整表」这一层的 owner，于是把整表只需做一次的事（量宽、取素材池）在每行各做一次；代码评审看单行时看不出来。
- 没有按操作计数的门：性能只在 `perf-scenario` 毫秒数里出现，而那是 PR 外、机器忙时测不准的数；计数类断言（挂了几行、量了几次、扫了几次）从来没有。
- 体验铁律：⑫ 点了 = 以为的——点开方案以为马上能改，实际整个应用冻十几秒。

### 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 行里再加一样挂载即 IO / 布局读的东西（例：参考条预取缩略图），打开时间随镜头数再线性涨一截 | 在本刀之前的 `origin/main` 上给行加一个 `useLayoutEffect` 读 `offsetHeight`，跑 `storyboard-plan-open`（`node tests/perf/document-switch-bench.mjs --scenario plan-open`） |
| 1000 镜方案（长片 / 剧集）打开超过一分钟甚至卡死渲染进程 | `--shots 1000` 跑同一量具 |
| 切文稿 / 回分镜页时（Activity 重新显示）同样的全量成本再付一次 | `document-switch-after-storyboard` 场景 |

### 4. 靶子独立性检查

- 尺子：`storyboard-plan-open` 量具与 C-trace 剖析都不是本线写的；本线只把量具的「到位」判据从「320 个行盒子都可见」改成「行区报出逻辑总数 320 + 视口里的行可编辑」，并在停表后另验末镜够得着（C-trace 3.1 已指出旧判据在窗口化后必然不成立，**不能只降低断言数字刷绿**）。
- 本线新增的计数测试（`StoryboardShotTable.windowing.test.ts`）修前必红（320 / 320 / 320 / 320）、修后绿，断言的是不变量（与镜头总数无关），不是某个毫秒数。
- 没有「修对了反而掉分」的先例。

### 5. P0：这些是我们独有的吗？现成方案有哪些

- 长列表只渲染可见部分是通用能力，不是我们独有的领域。React 官方与社区标准做法是窗口化库。
- 仓库已在用 `@tanstack/react-virtual`（锁定 3.14.2，core 3.17.0）：素材库 `AssetLibraryPanel`、提示词库 `PromptLibraryPanel`、生成页列表 `GenerationListView`。本刀接同一个库，不自写虚拟化。
- 用到的官方能力（context7 `/tanstack/virtual` 查当前文档）：`measureElement` 动态行高、`scrollMargin`（列表上方还有执行计划条 / 参考卡区）、`rangeExtractor` + `defaultRangeExtractor`（钉住正在编辑 / 正在拖的那一行）、`scrollToIndex`（定位到某一镜）、`initialRect`（首帧 / 无滚动区时的视口）。出处：<https://tanstack.com/virtual/latest/docs/api/virtualizer>。
- 宽度档位与素材池不需要库：它们本来就该是整表一份（移到行容器 / 表级）。

### 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| **接入现成方案（本刀）** | `@tanstack/react-virtual` 3.14.2 表级窗口化：组头 + 镜头行摊平成一条列表，只挂视口 + 3 项缓冲；行宽由行区量一次经 context 递下；素材池整表一份；定位某一镜按下标滚；焦点行 / 拖拽行钉住不卸 | 改表的渲染结构（约 1 个文件的主体）+ 两个行级 hook 上移；量具判据跟着改 | 浏览器原生 Ctrl+F 只搜得到挂着的行（Electron 应用内无全文查找入口，影响小）；行高估算与实测差会让滚动条在首次滚过时微调 | **推荐**（已做） |
| 补 | 保留全量挂载，只做 memo / 懒初始化编辑器（先挂占位、点进去再建 TipTap） | 每行仍有 DOM、参数区、测量；只削掉编辑器那 31% | 320 → 1000 镜照样线性涨；「懒建编辑器」要处理焦点切换与输入法，复杂度不比窗口化低 | 不推荐：只削一段成本，类根因（成本随总数线性涨）不变 |
| 重写（限一个模块） | 自写虚拟列表 | 重复造仓库已有的轮子；P0 违规 | 动态行高、滚动校准、焦点处理都要自己趟一遍 | 不推荐 |
| 删 | 去掉行内编辑器，表只读、点行去别处编辑 | 产品形态大改，分镜「表就是编辑面」的拍板被推翻 | 用户控制权变少 | 不推荐 |

**要交用户 / 协调的结构性岔路（不在这一刀做）：**

1. **挂载时同步 IPC**（模型目录 `listModels`、参数区 `listMappings` 的 `invokeSync`）归 P-compose（`electron/preload/modelOnboardingBridge.ts` 及主进程侧、`nodes/controls/*` 是它的独占文件）。本刀之后，每次打开的同步 IPC 次数从「随镜头数」降为「随视口行数（约 5）+ 编辑器级 2 次」；降到 0 由 P-compose 的「模型目录映射改异步 + 渲染进程禁 invokeSync 棘轮」交付。任务书目标「打开方案时不走同步 IPC」因此**在本刀只部分达成**，待 P-compose 合入后复验。
2. **行内编辑器的成本**：窗口化后首屏仍有约 5 个 TipTap 实例。若以后要求「打开到可编辑 ≤ 300ms」，下一步是编辑器懒建（先渲染静态文本、聚焦时才建 TipTap），那是 PromptEditor（P-compose 独占）的结构改动。
3. **量具判据**：`tests/perf/document-switch-bench.mjs` 的判据本刀已改；D-perf 分支（`perf/canvas-p0-baseline`）把同一文件改接了统一计时器 `responseTimer.mjs` 的 `storyboardRowsAtLeast(320)` 判据——窗口化后这个判据永远不成立。两边合并时需要 D-perf 在 `responseTimer.mjs` 登记一个「行区报出逻辑总数 n + 视口行可编辑」的判据替换它（本刀的判据原文见量具 `openPlan`）。

### 7. 用户要权衡的核心

为了「打开 320 镜方案从十几秒变成不到一秒、打开时不再冻住整个应用」，接受「看不见的行不在页面里」：浏览器原生查找只找得到屏幕上那几行；其余（编辑、拖拽、多选、键盘、撤销、生成状态）都保持原样。

## 特征测试清单

- `src/workbench/creation/storyboard/StoryboardShotTable.windowing.test.ts`：挂载行数 / 编辑器数与镜头总数无关（320 = 1000）、≤ 首屏 + 缓冲；行宽测量次数为常数；素材池整表一份；结构上行不量自己、不各取素材池、表不靠 DOM 找行。修前 4 项红（320 行、1000≠320、320 次测宽、320 份素材池）。
- `tests/ux/storyboard-windowing.walk.mjs`：真 Electron 上逐条核对旧功能普查（行高变化重排、编辑中滚走不丢输入与撤销、键盘上下到视口外、跨屏 Shift 多选、拖拽排序、增删与撤销后的位置、生成中状态刷新、中英文 / 暗色 / 最小窗口）。
- 既有：`StoryboardShotRow.structure.test.ts`、`storyboardTableReach.structure.test.ts`（浮条不在裁切的行区里）照常绿。
