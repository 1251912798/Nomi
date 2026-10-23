# 独立验收报告（L-acc-opus-20261023）：通过 · 验收 HEAD 48d6b79a9
验收线：L-acc-opus-20261023

> 本文件记了四轮：第一轮（59c836ee8，L-acc-sonnet-20261023，有条件通过）→ 复核（d20a4a1e1，L-acc-sonnet-20261023，通过）→ 最终验收（550ba434e，本线 L-acc-opus-20261023，通过）→ 增量复验（d7888639a，本线，见文末「增量复验」一节）。前几轮原文保留在下面，版本号统一写成「第一轮（…）」「复核（…）」「最终验收（…）」。
>
> 当前结论（d7888639a）：通过，没有阻断项。上一轮的应修 1（`closedByOutsidePressRef` 不复位）已修好，五种关法的真 Chromium 测试和本线测试页都确认了；建议 2、3、4、6 已做；建议 5（PR 正文）由协调随本结论一起改。存疑 7 实现线按默认定了「按下即算」，理由的结论站得住，但其中「xyflow 的 paneClickDistance 是 0」这条事实不对（装的版本默认是 1px），文字要改，不挡合并。

## 第一轮（59c836ee8）· L-acc-sonnet-20261023：点外面就收 + 富文本格式按钮

- 验收线编号：L-acc-sonnet-20261023（与实现线不同会话）
- 第一轮（59c836ee8）：范围 `origin/main..59c836ee8` 两个提交：6ef8c3e6b、59c836ee8
- 日期：2026-10-23
- 结论：**有条件通过**。没有发现阻断项。两个条件：① 真机走查（zh / en）我这边没能复跑（构建戳被另一会话的未提交改动判陈旧，按要求没有自己 build），合并前要在重建后跑一次；② 夜间走查 `tests/ux/rich-editor-p1.walk.mjs` 的定位器被这次改动打断（应修，测试侧小改）。其余是建议项。

### 一、检查项 → 结果 → 证据

#### 第 2 步：命令复跑（命令一字未改）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 5 个结构测试（outsidePress / richTextActions / popoverTracking / ToolbarActionMenu / CreationWorkspace） | 通过 | `5 passed (5)`，`20 passed (20)` |
| `node ./scripts/check-root-cause-contracts.mjs` | 通过（有保留） | 输出「本次无高风险生产路径变化」，即门岗没有对这两份合同逐项核对，只做了解析与历史校验；`ROOT_CAUSE_BASE_REF=origin/main` 同输出 |
| `pnpm run check:escape-ledger` | 通过 | 105 条（candidate 35 / reviewed 8 / fixed 62）；31 条「candidate 超 14 天」警告都是旧条目，不含本次两条 |
| 真机走查 zh：`node tests/ux/outside-press-and-text-format.walk.mjs --shot` | **未能运行** | 启动器拒跑：「构建产物比源码旧」。`dist/build-stamp.json` tree=`51182d0f…`，当前工作树 `sourceIdentity`=`1573c5cd…`。我用仓库自己的 `sourceIdentity` 算法把 `scripts/pre-push-scan-guards.mjs` 换回 HEAD 的 blob 重算，结果恰好等于 `51182d0f…`：即 dist / dist-electron 与 HEAD 逐字一致，只是被另一会话 15:04:28 对该脚本做的未提交 +2 行判成陈旧（该脚本不进产物，但戳把 `scripts/` 算作输入）。按要求没有 build |
| 真机走查 en（`--locale en`） | **未能运行** | 同上 |
| 截图亲眼读 | 已读，画面与断言一致 | 读了 `tests/ux/shots/outside-press-and-text-format/` 下 `canvas-text-node-zh-CN.png`、`creation-toolbar-zh-CN.png`、`canvas-text-node-en.png`。注意：这三张是实现线 14:43 / 14:32 在**与 HEAD 一致的 dist** 上产出的，不是我复跑的。所见：300% 缩放下画布文本节点格式条是恒定屏幕尺寸、夹在舞台顶边下、没有被顶栏盖住，悬停「斜体 / Italic」出设计系统提示，列表有圆点；创作区顶栏悬停「行内代码」出提示，选区浮条落在选区下方、没有盖住顶栏。`results-zh-CN.json` 10/10，`results-en.json` 10/10 |
| 反例 1：去掉 `outsidePress.ts` 的捕获参数 | 结构测试变红，已原样恢复 | `4 tests: 2 failed`（「owner 听的是捕获阶段」与「冒泡 pointerdown 只许减不许增」）；恢复后 `shasum` 与备份一致，`git diff --stat -- src` 为空 |
| 反例 2：在 `WorkbenchEditor.tsx` 里加一行 `isActive('bold')` | 结构测试变红，已原样恢复 | `1 failed | 6 passed`，违规列表指向 `src/workbench/creation/WorkbenchEditor.tsx`；恢复后同样一致 |
| 旁证：相关单测 | 通过 | `vitest run src/design src/workbench/{assets,creation,generationCanvas/nodes,generationCanvas/components,library…} src/ui/app-shell tests/ux/storyboard-popover-keyboard.test.mjs …`：340 个文件 / 3081 条全过 |
| 旁证：真 Chromium 渲染原版 `TextDocumentNode` | 通过 | `tests/ux/text-document-generation-ownership.test.mjs` 1/1 |
| 旁证：eslint（18 个改动文件） | 0 error | 1 条 `react-refresh` 旧告警（AssetLibraryPanel.tsx:73，非本次引入） |
| 旁证：`tsc -p tsconfig.app.json --noEmit` | 干净 | 无输出 |
| 旁证：`node scripts/check-boundaries.mjs` | 通过 | 72 处越界 = 基线 72 |
| P1 / 全局 CSS | 未发现违规 | `rg useClickOutside\|buildRichTextActions src` 只剩结构测试里的字面量；`workbench.css` 本次 −6 / +0 |

#### 第 3 步：边界场景（临时脚本放在 scratchpad，没有进仓库）

方法：用 esbuild 把**真实源码模块**打包成测试页，在本机已有的 headless Chromium（playwright）里真点；React Flow 用的是仓库里真的 `@xyflow/react`（d3-zoom 是真的），Mantine Drawer / Combobox / TipTap 也是真的。这不是 Electron 整 App，但每条都带了「修前实现」对照，证明脚本能抓到原来的 bug。脚本在 `/private/tmp/claude-501/-Users-aoqimin-Desktop-Nomi--claude-worktrees-pr-review-project-positioning-4eebec/60c58d99-0149-4b6c-baf1-e1e5354fc810/scratchpad/acceptance/harness/`。

| 场景 | 结果 | 证据 |
|---|---|---|
| 真 React Flow 空白处（d3-zoom 吞 mousedown）按一下，浮层收不收 | 修后收，修前不收（bug 复现） | 修前 `AnchoredPopover`（取自 origin/main）按后仍开=1；修后=0 |
| 真 `CanvasViewOptionsPopover`：拖缩放滑块 | 不关，值变 | 拖动后浮层仍开=1，zoom 100→252 |
| 拖拽从浮层里起、在浮层外松手 | 不关 | 仍开=1 |
| 真 `CanvasViewOptionsPopover` 在真 React Flow 空白处按下 | 收 | 开=0 |
| 浮层里自己弹出的 portal 下拉（`aria-expanded` 触发器 + `role=listbox`） | 选得中，浮层不关 | picked=b，仍开=1 |
| 真 `NomiSelect`（Mantine Combobox）放进浮层，portal 到 body / 指回浮层两种 | 选得中，浮层不关，点外面收 | 两种都 value=1:1、仍开=1、外面按下后=0 |
| 浮层里输入框点得进、打得进字；按外面输入框收并把焦点给它 | 正常 | `abc`、焦点落在外面输入框 |
| 点锚点按钮 | 关一次，不先关后开 | 开=0 |
| 真 `ShellRail` + 真 Mantine Drawer + 真 React Flow：点空白 / 再点同项 / 切项 / Esc / Shift 框选 | 收 / 收 / 切换 / 收 / 收 | S1 0，S2 0，S3 `[0,1]`，S6 0，S7 0 |
| 抽屉里点出的 `role=menu` / `role=dialog` / `data-radix-popper-content-wrapper` / `.mantine-Popover-dropdown`、抽屉本体 | 抽屉不收 | 四类都 =1，S5 =1 |
| 光秃秃的 portal `role=listbox` 按一下 | 抽屉会收 | 与改前同一份选择器，非本次引入（见建议 5） |
| 真 `useRichTextActions` + `RichTextActionButton` + TipTap（有 / 无特性扩展） | 14 / 17 颗；加粗按下 `aria-pressed=true` 且底色有 alpha（`oklab(… / 0.09)`），未按下 `rgba(0,0,0,0)`；键盘取消后弹起；撤销 / 重做无 `aria-pressed`；点钮后编辑器仍聚焦 | 控制台零错误 |
| 打 10 个字对工具栏的重渲 | 总共多 1 次（撤销可用态翻转那一下），不是每键一次 | 渲染计数 1→2；开关加粗再 +1 |
| 语言切换 | 标签更新 | `加粗`→`Bold` |
| 悬停禁用的「撤销」/ 启用的「加粗」 | 都出 Tooltip | `[role=tooltip]` 各 1 个 |
| 编辑器实例被替换（placeholder 变，创作区切语言会触发） | 格式钮会消失，直到下一次事务 | 无事务：17→**0**→（点一下编辑器）17；父层有 layout 派发事务：17→17→17（真实的 `WorkbenchEditor` 有这个派发，所以不可见，见发现 2） |
| `[title="高亮"]` 等老定位器 | 找不到 | 4 个标题全 0 个，`getByRole` 全 1 个（见发现 1） |
| 嵌套帮助浮层里点一下，两层一起关 | 修前修后一致（既有行为） | 修前实现同样 `[0,0]` |
| 无 `anchorRef` 的浮层（AssetPickerPopover 形态）再点触发钮 | 关不掉（先关后开） | 修前修后一致 `1` |

### 二、代码审查发现

没有阻断项。逐个看了 9 个迁移点的「点在自己身上」判据：与改前等价或更正确（TaskCenterPanel 把触发钮算作自己，顺手修掉了「按触发钮先关后又被 toggle 打开」；ShellRail 判据逐字保留；AnchoredPopover 的 `isInsidePopupAbove` 让位规则原样保留）。`useRichTextActions` 的 hook 调用顺序稳定（三个壳都在任何早返回之前调用；`WorkbenchEditorToolbar` 的早返回已删）；`ids` 用模块常量；深比较确实挡住了每键重渲；`TextDocumentNode` 的 `onEditingChange` 在卸载 / 失焦 / 重挂时都归 false；`lockNodeId={null}` 与白板编辑条先例一致（编辑期间锁 / 复制条收起，失焦即回来）。

1. **应修**（测试侧，小）：`tests/ux/rich-editor-p1.walk.mjs:184` 用 `toolbar.locator('[title="高亮"]')`（及删除线 / 插入表格 / 待办列表）找格式钮，注释写着「WorkbenchIconButton 会带 label → title」。`RichTextActionButton` 没有 `title`（只有 `aria-label` + 设计系统 Tooltip），我在测试页里验证这 4 个定位器都命中 0 个。该走查不在 `tests/ux/nightly-ci-exclusions.json` 里，夜间会多红 4 条「工具栏·…」。建议改成 `getByRole('button', { name })` 或 `[data-rich-text-action="highlight"]`，与同目录 `document-format-persist-undo.walk.mjs` 一致。
2. **建议**（潜伏，当前被碰巧遮住）：`src/workbench/common/richTextActions.tsx:93` 的 selector 读的是快照里的 `current`，不是入参 `editor`。TipTap 3.23 的 `useEditorState` 在换编辑器实例（`useNomiTiptapEditor(..., [placeholder])` 里 placeholder 一变就重建，创作区切语言即触发）后，快照要等新实例的第一次事务才刷新，期间读到的是已销毁的旧实例，`readActionStates` 返回 `[]`，格式钮整排消失。测试页里无事务时 17→0→点一下才回 17。现在创作区没出事，是因为 `WorkbenchEditor.tsx:154` 的 layout effect 会在换实例后派发一个事务；画布文本节点 placeholder 恒为 `''` 不换实例。这条靠别处的副作用兜着。建议改法：selector 用闭包里的 `editor`（`selector: () => readActionStates(editor, ids)`，每次渲染重建 selector，快照仍负责触发重算），再补一个「换实例后钮仍在」的单测。
3. **建议**：`src/design/outsidePress.structure.test.ts:32` 的 `PRESS_LISTENER` 要求处理器写成标识符（`[\w.]+`）。我逐条验证：`document.addEventListener('mousedown', (e) => …)`、`function (e) {…}`、`el.ownerDocument.addEventListener(…)`、Mantine `useWindowEvent('mousedown', …)`、`'click'` 监听都**漏过**门岗，只有具名处理器会被抓。现状 src 里没有这类写法，所以今天不红，但「新浮层照最近的抄」恰恰最常写内联箭头。建议把正则放宽到任意表达式，或改成 ESLint `no-restricted-syntax` / AST 扫描。同类现存一例未迁：`src/workbench/sidebar/CategoryTree.tsx:106` 用 `window.addEventListener('click', close)` 收右键菜单。
4. **建议**（文档准确性，P3 对账）：`docs/engineering/direction-checks/2026-10-23-outside-press-and-rich-text-controls.md:39,62` 写「修前走查 3/10」，而同提交的 `docs/evidence/2026-10-23-rich-text-controls/walk-before-zh-CN.json` 是 1/10 通过（9 条失败）。另 `src/workbench/creation/storyboard/shotRow/StoryboardShotRow.tsx:276` 的注释还写「点外面那一下是 mousedown 关菜单」，现在是 pointerdown 捕获。
5. **建议**（既有，非本次引入）：`AssetPickerPopover`（无 `anchorRef`，锚点是 0 尺寸占位）的触发钮不算「自己」，再点触发钮是「先关后开」，关不掉（修前修后一致，见上表）；`ShellRail` 的让位选择器不含光秃秃的 `role=listbox`（真 `NomiSelect` 的下拉我验证过带 `.mantine-Popover-dropdown`，所以被覆盖；不带这几个属性的 portal 弹层不覆盖，S4b 实测会收抽屉）。两条都可以顺手收，但不属于这次改动。
6. **存疑**：`SelectionGeneratePopover.tsx:62` 下方分支新加了 `Math.max(contentTop + 8, …)`。选区被滚出正文区上沿时，浮条会钉在正文区顶边（修前会被算到工具栏上方 / 根外），选区看不见了浮条还在。验证法：在创作区选一行、把文稿滚到选区在可视区上方，看浮条是否还钉在顶边。算术上不会出现负值；编辑器矮到 < 约 104px 才会掉出底边。我没有在真页面上验证这条。

### 三、没能验证的

真机走查 zh / en 没能自己复跑（构建戳被另一会话对 `scripts/pre-push-scan-guards.mjs` 的未提交改动判陈旧，按约定不自己 build；我已证明 dist 本身与 HEAD 一致，所以实现线的截图与 10/10 结果可信，但不是我这条线复跑的）；因此「文本节点编辑完点空白后锁 / 复制条回来」「TaskCenterPanel 真实触发钮」「NomiBrowserDialog / 素材筛选 / 帧菜单 / TimelinePreview 文字菜单 / EditingLayoutMenu」这些只能靠读码和同类机制的测试页佐证，没有在整 App 里点过。

## 复核（d20a4a1e1）· L-acc-sonnet-20261023

- 验收线：L-acc-sonnet-20261023（同一条线）；复核范围 `git diff 59c836ee8..d20a4a1e1`（a8ca01d08、d20a4a1e1）。
- 结论：**通过**。上一轮的应修项和全部建议项都已解决，真机走查这次能跑起来并全绿，没有发现新问题；只剩 3 条低优先级的新增建议（见下，不挡合并）。

### 构建与走查（这次是我自己复跑的）

构建戳 `dist/build-stamp.json` tree=`9f7699ab…`，等于当前工作树的 `sourceIdentity`（git status 干净），启动器没有拒跑，我没有 build。

| 检查项 | 结果 | 证据 |
|---|---|---|
| `outside-press-and-text-format.walk.mjs --shot`（zh-CN） | 通过 | `RESULT 10/10 passed` |
| `… --shot --locale en` | 通过 | `RESULT 10/10 passed`；另外不带 `--shot` 的 en 又跑两遍，都是 10/10（用来看 d20a4a1e1 修掉的英文轨偶发 1/4 还会不会复现，没有复现） |
| `rich-editor-p1.walk.mjs` | 通过 | `全部 14 项通过`（第一遍完整结果；第二遍我只看了工具栏那几行，也都通过）；`工具栏·highlight / strike / table / task-list` 各「找到 1 个」（修前是定位器命中 0 个） |
| 两份结构测试 + 另外 3 份 | 通过 | 5 个文件 / 21 条全过（上一轮 20 条，多出的是识别器自检用例） |
| 相关单测 | 通过 | `src/design`、`src/workbench/{common,creation,generationCanvas/nodes}`、两个真 Chromium 的 `tests/ux/*.test.mjs`：271 个文件 / 2577 条全过 |
| `tsc -p tsconfig.app.json --noEmit`、eslint（6 个改动文件） | 通过 | 无输出 / 0 error |
| `check-concept-owners`、`check-self-written`、`check-file-sizes`、`check-boundaries`、`check-root-cause-contracts`、`check:escape-ledger` | 通过 | 全部 ✅（新增的两个概念、两条自写登记都过；`BaseGenerationNode.tsx` 合并注释后文件体积门岗通过） |
| 截图亲眼读 | 一致 | 读了这次产出的 `creation-toolbar-zh-CN.png`、`canvas-text-node-en.png`：格式条夹在舞台顶边下、悬停出提示、选区浮条落在选区下方没盖工具栏 |

### 逐条核上一轮发现

| 发现 | 是否真解决 | 证据 |
|---|---|---|
| 1 应修：夜间走查按 `[title]` 找钮 | 已解决 | 改按 `data-rich-text-action`（`highlight/strike/table/task-list`，这些 id 在 `richTextActions.tsx` 里都有）；走查实跑 4 条都找到 1 个 |
| 2 建议：换编辑器实例后格式钮消失 | 已解决 | selector 改读闭包里的 `editor`（`richTextActions.tsx:95`），结构测试正则钉住 `selector: () => readActionStates(editor,`。测试页（真源码 + 真 TipTap）：无事务派发时换实例，修前 17→**0**→17，修后 17→17→17；换完新实例上加粗 `aria-pressed=true`、键盘取消后 `false`、再换一次仍 17 颗；换实例后打 10 个字工具栏只多渲 1 次（没有每键重渲） |
| 3 建议：结构测试只认具名处理器 | 已解决（有残余，见新增 a / b） | 识别改为取整个调用的括号内容；自检用例覆盖内联箭头、`function`、`ownerDocument`、`useWindowEvent`、`{ capture: true }`。我用测试里识别器的逐字副本验证：内联箭头 mousedown、`function` click、`ownerDocument`（含 `?.`）、`useWindowEvent`、多行调用都被认出；`click` 纳入「冒泡只许减不许增」，`CategoryTree.tsx` 的 `window` click 冻进基线 |
| 4 建议：文档数字与注释 | 已解决（有残余，见新增 c） | direction-check 改成「修前 cad909708 上 1/10、只含第一个提交的中间构建 3/10」；`StoryboardShotRow.tsx:276` 注释改成 pointerdown 捕获 |
| 6 存疑：选区滚出视野浮条钉在顶边 | 已解决 | `SelectionGeneratePopover.tsx:57` 选区整段在正文区上沿之上或根下沿之下时返回 `null`。测试页（真 `SelectionGeneratePopover`，修前版本取自 59c836ee8 对照）：选区滚到上方，修前浮条钉在 `relTop=58`（选区看不见浮条还在），修后隐藏；选区在下方，修前摆到 `relTop=721`（出了编辑器），修后隐藏；滚回选区修后重新出现（`relTop=193 / 121`，位置与修前一致）；第一行选区仍落在选区下方 `relTop=83`，没盖工具栏 |
| 5 既有行为，本 PR 不改 | 认可 | 写进 PR 的「没做的」即可 |
| `BaseGenerationNode.tsx` 合并注释 | 无行为变化 | diff 只动注释与一行尾注释，`textEditing` 状态与浮条逻辑不变 |

### 上一轮没能点的路径，这次在整 App 里点了

临时脚本放在 scratchpad（`acceptance/app-walk.mjs`，没进仓库），用仓库的启动器起真 Electron（生产构建、窗口挂屏幕外、隔离资料目录、零花费）：

| 场景 | 结果 | 证据 |
|---|---|---|
| 选中文本节点（点头部，不进正文） | 节点浮条在 | 浮条标签 `["复制为变体"]` |
| 点进正文 | 格式条顶替节点浮条 | `["文本格式"]`，不叠 |
| 再点节点头部（编辑器失焦、节点仍选中） | 节点浮条回来，锁在 | `["复制为变体"]`，节点浮条里锁按钮 1 个，没有格式条 |
| 编辑后点画布空白 | 浮条全部消失 | `[]` |
| 编辑过一轮后重新选中 | 节点浮条正常回来 | `["复制为变体"]` |
| 任务中心：点触发钮开、再点一下、再开后点画布空白 | 开 / 关（不再先关后开）/ 收 | `1 / 0 / 0` |

### 新增建议（均低优先级，不挡合并）

a. `src/design/outsidePress.structure.test.ts` 的 `lastTopLevelArgument` 不处理尾逗号：多行写法 `document.addEventListener('pointerdown', handler, { capture: true },\n)` 会把最后一个参数读成空串，合法的捕获监听被判成冒泡（假红，方向安全；仓库现在没有这种写法）。
b. 仍认不出的写法（用逐字副本验证）：`const doc = document; doc.addEventListener(…)`、`globalThis` / `self` 上的监听、模板字符串或变量做事件名。比上一轮窄得多，不过这类别名写法是下一个绕过口。
c. owner 的测试不再钉 `removeEventListener('pointerdown', fn, true)`（上一版有这条断言，现在只扫 `addEventListener`）：清理时漏写 `true` 会让监听泄漏，而测试仍绿。建议补回一条断言。另外「基线 3 处」的措辞在四处没跟着改成 4 处（`docs/fixes/2026-10-23-outside-press-capture.root-cause.json:56,245`、`direction-checks/…controls.md:52`、`concept-owners/ui.outside-press-dismiss.json:32`），因为 CategoryTree 的 click 也冻进了基线。

### 仍没验证的

整 App 里没点过的只剩：NomiBrowserDialog、素材筛选菜单、帧菜单、TimelinePreview 文字菜单、EditingLayoutMenu 这五处迁移点（只靠读码和同机制的测试页）；选区浮条的滚出隐藏只在测试页里点过，没在整 App 里点。

## 最终验收（550ba434e）· L-acc-opus-20261023

> 这一节是 550ba434e 那一轮的原文。其中的应修 / 建议 / 存疑在文末「增量复验（d7888639a）」逐条核过；PR 正文现在要写的验收 HEAD 是 d7888639a，不是下文里的 550ba434e。

- 验收线：L-acc-opus-20261023（Opus 子代理，只读复核）。实现线是会话「PR审查与项目定位策略」，前两轮是 L-acc-sonnet-20261023，三条线互不相同。日期 2026-10-23。
- 范围：`git diff d20a4a1e1..550ba434e` 的六个提交（62932ad80、0f550988c、13f5ffbfb、71e648c85、1f934d337、550ba434e）。这一段里 src 只改了 `src/design/AnchoredPopover.tsx`（+9 / −1：因点外面关闭的不还焦点）和 `src/design/outsidePress.structure.test.ts`，其余是走查、拍板图、证据、合同与登记。前两轮核过的部分没有重做。
- 结论：**通过**，没有阻断项。★9 验收清单我逐条自己复跑，全部通过。13f5ffbfb 的焦点改动和 71e648c85 的 C19 改法，我都用反例证明了检查能抓到问题，改法也没有掩盖问题。剩 1 条应修，不挡合并，可以跟进修；另有 5 条建议、1 条存疑和 1 条本 PR 之外的顺带发现，见第三节。
- CI（550ba434e）：Unit ×3、E2E Walkthroughs ×4、Canvas Acceptance ×2（含改过的 C19）、Canvas Performance、Core Flow Smoke ×2、Design Lab 全部绿。Contracts 红，只是因为 `check:pr-judgement`（107 个门岗过了 106 个）：PR 正文的「## 独立验收」缺「报告首行 / 验收 HEAD」，仓库里的旧报告首行认不出结论，验收 HEAD 还是 59c836ee8。Quality Gate 汇总跟着它红。本报告提交后（只改 `docs/evidence/**`，验收 HEAD 550ba434e 仍然有效），把 PR 正文「## 独立验收」按本报告第一行、`验收 HEAD：550ba434e`、`验收线：L-acc-opus-20261023` 改好，再重跑 Contracts 和 Quality Gate 就行。我用 `scripts/pr-body-criteria.mjs` 的 `checkIndependentAcceptance` 按严格档模拟过这样一段正文加本报告：五条全 ✅。

### 一、检查项 → 结果 → 证据

| 检查项 | 结果 | 证据 |
|---|---|---|
| HEAD / 工作树 | 550ba434e，干净 | `git rev-parse --short HEAD`；开始时 `git status --short` 为空 |
| 构建新鲜度 | 新鲜，没 build | `dist/`、`dist-electron/build-stamp.json` 的 tree 都是 `f6fab69f…`，和我用 `scripts/package-build-stamp.mjs` 的 `sourceIdentity` 现算的一致；启动器没拒跑 |
| 走查 zh：`node tests/ux/outside-press-and-text-format.walk.mjs --shot` | 12/12 | `RESULT 12/12 passed`（20:53） |
| 走查 en：`… --shot --locale en` | 12/12 | `RESULT 12/12 passed`（20:54） |
| 走查暗色：`… --shot --scheme dark` | 12/12 | `RESULT 12/12 passed`（20:54） |
| 走查里「焦点不落回『⋯』」这条能不能抓到旧行为 | 能 | 测试页用真 `AnchoredPopover`、真 React Flow 空白处和设计系统 Tooltip，Playwright 真点，断言顺序照走查（点空白 → 等浮层隐藏 → `not.toBeFocused`）。当前版 3/3 过：焦点在 BODY，0 个提示。d20a4a1e1 版 3/3 红：焦点回到触发钮，挂着 1 个提示，正是 13f5ffbfb 要修的现象 |
| `node tests/ux/canvas-shortcuts.walk.mjs` | 全过 | `✅ 画布快捷键走查通过：17 项`；未改动的原文件跑了两遍，都过 |
| C19 反例 ①：点空白后抽屉到底收没收 | 收了 | 临时加一行日志，输出 `catalog drawer visible right after blank click = false`：重开那一步是必要的，而且确实在重开 |
| C19 反例 ②：去掉 Ctrl+Z 和两条 graph / 磁盘轮询 | 重开后的分组行断言变红 | `expect(locator).toBeVisible() failed … button[title="C19 restore whole group"] … element(s) not found`。重开抽屉掩盖不了「分组没恢复」，而且前面两条 graph / 磁盘轮询（含 `groups`）本来就先拦住。两次临时改动都已恢复（`git hash-object` 等于 HEAD 的 738e916a） |
| `npx vitest run tests/ux/storyboard-popover-keyboard.test.mjs src/design/outsidePress.structure.test.ts src/workbench/common/richTextActions.structure.test.ts` | 15/15 | `Test Files 3 passed (3)`、`Tests 15 passed (15)`；其中分镜三个 Portal 弹层「Esc 关闭后焦点回到打开前的元素」都过 |
| 结构测试反例：owner 解绑时漏写 `true` | 红 | `owner 听的是 document 上捕获阶段的 pointerdown` 失败 1 条；已恢复（hash e8f0a240 等于 HEAD），恢复后 `sourceIdentity` 回到 `f6fab69f…` |
| `pnpm run check:board-parity` | 过 | 49 条脚本自测通过，输出「拍板图对账通过：12 张板，候选全部认领；其它日期目录 13 张板全部按完整规则查过」。另外单独对 TextFormatDismiss 调 `checkBoardManifest`：43 个候选，0 错；6 个元素的 `board:TextFormatDismiss/<id>` 断言都在走查里（dismiss 3 处，canvas-bar 2 处，其余各 1 处）。CI 上是「✅ 拍板图：认领的元素都有去处（TextFormatDismiss）」，另提示待协调确认（coord-approve） |
| `node ./scripts/check-escape-ledger.mjs` | 过 | `105 条（candidate 35 / reviewed 6 / fixed 64）`。本 PR 两条从 reviewed 改为 fixed，带 `completionCommits` 和 `fixedInPr: 1299`（账本里 66 条都这么写）；31 条超期警告都是旧条目 |
| `node ./scripts/check-root-cause-contracts.mjs` | 过（有保留） | 同前两轮，输出「本次无高风险生产路径变化」：两份合同只做了解析和历史校验，没有逐项核 |
| 旁证：`check-self-written`、`check-concept-owners` | 过 | 自写登记 50 项，0 未认领；概念 owner 272 个，第二写口 0 新增 |
| 旁证：550ba434e 换上的出处 | 属实 | 用 Context7 查 tiptap.dev：`https://tiptap.dev/docs/ui-components/components/mark-button` 写的正是 `npx @tiptap/cli@latest add mark-button`。合同引用的 custom-menus 页原文也写着：React 里 `isActive()` 不自动响应，要用 `useEditorState` |
| 旁证：Radix 出处 | 属实，但少写了一个限定 | 本机 `@radix-ui/react-dropdown-menu/dist/index.mjs:105-124`：`onCloseAutoFocus` 里 `hasInteractedOutsideRef` 为真时不 focus 触发钮，每次关闭后复位；只有 `!context.modal \|\| isRightClick` 时才置真（见建议 6） |
| 截图亲眼读（本线 20:53–20:54 这一轮产出） | 与断言一致 | `dismiss-after-zh-CN.png`：「⋯」浮层已收，缩放簇还在，「⋯」上没挂提示；`dismiss-after-zh-CN-dark.png` 同样。`canvas-text-node-zh-CN-dark.png`：暗色格式条在舞台顶边下、顶栏下面，悬停「斜体」出提示，列表有圆点。`creation-toolbar-en.png`：悬停出英文提示「Inline code」，选区浮条在选区下方、没盖顶部工具栏，有序列表有序号。另外看了 `canvas-text-node-zh-CN.png` |
| 普查：还有没有走查依赖「点画布不收抽屉 / 浮层」 | 除 C19 外没发现 | 两个只读扫描脚本找「打开抽屉 /『⋯』/ 任务中心 / 节点浮条面板 → 在画布空白或节点上按下 → 继续在里面找东西」，扫了 `tests/ux` 下 745 个文件，候选逐个读过：`canvas-shortcut-parity.walk.mjs:304-357` 靠幂等的 `openCanvasViewOptions`（关了就重开）；`_goldenOriginalStoryboard.mjs:61/134` 与 `core-a-storyboard-undo.e2e.mjs:80/133/139` 先看 `aria-pressed` 再开；`shell-redesign.walk.mjs` 开着抽屉时的按下都在抽屉里（:437、:592 拖宽把手，:728 把素材拖进画布）；`process-feedback-electron.e2e.mjs:132/140/204` 用「关闭任务面板」钮显式关；`node-timeline-toolbar.walk.mjs:206` 先按 Esc 关抽屉；其余命中在按下前就已经关了 |
| 挑跑：`node tests/ux/core-a-storyboard-undo.e2e.mjs` | 过 | `{"status":"passed",…,"checks":4}`（文稿抽屉开着时切到画布点节点，之后按 `aria-pressed` 重开） |
| 挑跑：`node tests/ux/shell-redesign.walk.mjs` | 红，与本 PR 无关 | ① `:456`「Ctrl+J 打开后焦点不在 Agent 输入框」每次都红，单独跑也红。诊断：按 Ctrl+J 后 3 秒内焦点一直在 BODY，页里根本没有 `#project-agent-resident textarea`（rAF 正常触发，窗口 visible）。见顺带发现 8，本 PR 没碰这段。② 跳过这一项再跑，`#13 节点拖进分组没生效` 红过一次。加诊断重跑时拖放落地了（乙组 `["shot-2"]`），抽屉全程开着（`drawerVisible=true`，没被「点外面」打断）；之后卡在不相关的「退出导演台」按钮上（点之前元素被卸载重挂）。判为本机离屏窗口下的不稳定，不是本 PR 引入 |
| 旁证：CI 上的一条重试 | 原来就不稳定 | Unit (3) 里 `tests/ux/text-document-generation-ownership.test.mjs` 重试 1 次后才通过；本机连跑 17 次红 1 次；main 上 021cef0b9、0b985b6a8 两次 push 也有同一条重试，不是本 PR 引入 |

### 二、逐条核复核（d20a4a1e1）的新增建议

| 建议 | 是否解决 | 证据 |
|---|---|---|
| a 尾逗号 | 已解决 | `outsidePress.structure.test.ts:56-58` 先去掉尾逗号再取最后一个参数；自检用例新增了多行写法，认成 `pointerdown:true` |
| b 别名 / globalThis / 变量事件名认不出 | 转成已登记的残余风险 | 写进 `docs/fixes/2026-10-23-outside-press-capture.root-cause.json` 的 `residual_risks` |
| c 解绑断言与「基线 3 处」措辞 | 已解决 | owner 测试补了 `removeEventListener('pointerdown', fn, true)` 断言（反例验证会红）；合同、方向检查和概念登记都改成 4 处（3 处冒泡 pointerdown + 1 处冒泡 click），和 `BUBBLE_PRESS_BASELINE` 的 4 条一致 |

### 三、代码审查发现

**阻断**：未发现。

**应修**（不挡合并，可以跟进 PR 修）

1. `src/design/AnchoredPopover.tsx:130 / 200 / 249`：`closedByOutsidePressRef` 只在点外面时置真，之后不再复位。所以浮层被点外面触发了 `onClose`、调用方却没卸载它的话，后面不管怎么关（按 Esc，或在浮层里选一项），都不会再把焦点还给触发钮。
   - 仓库里有这种调用方：`src/workbench/generationCanvas/nodes/ClipNode.tsx:306-311` 的 `closePicker` 在 `uploading` 时直接 `return`，它就是 `:681` 素材选择浮层的 `onClose`。其余生产调用方的 `onClose` 都会卸载浮层，我逐个读过：ProjectSyncBadge、CanvasControlsHelpPopover、CanvasViewOptionsPopover、StoryboardShotRow、PromptSkeletonSegments、ShotReferenceStrip、TimelineTransitionPicker、NodeEffectChips、AssetPickerPopover 的 6 个调用方，以及 ToolbarActionMenu 和 WhiteboardEditingToolbar 的面板。设计实验室有两处 `onClose` 是空函数（`src/devlab/designLab/primitivesSurfaces/states/02-overlays.tsx:118`、`src/devlab/designLab/editing/states/01-transition-picker.tsx:32`），本来就不会关，不影响用户。
   - 触发场景：在 Clip 卡上点「添加素材」并选文件开始上传；上传途中点一下画布空白，关闭被拒，浮层还开着，焦点落到 BODY；上传失败，浮层里出现「重试」；这时按 Esc 关掉浮层，焦点仍留在 BODY，不回到「添加素材」钮。键盘用户只能从页首重新 Tab。
   - 证据：测试页用真 `AnchoredPopover`，`onClose` 照 `closePicker` 的写法在忙时拒关。当前版先拒一次点外面，之后按 Esc 或在浮层里选一项，焦点都停在 BODY。d20a4a1e1 版这两种情况都会回到触发钮。对照组（没有那次点外面）在当前版里，Esc 和选一项都会回到触发钮；关掉后重开的新实例按 Esc 也照常还焦点。
   - 和合同对不上：`docs/fixes/2026-10-23-outside-press-capture.root-cause.json` 的 invariant 写着「按 Esc 关闭照旧还焦点」，PR 正文★9 也这么写，但在这条路径上不成立。Radix 的 `hasInteractedOutsideRef` 在调用方忽略关闭时，也会保留到下一次关闭，所以这个行为和所引的先例一致，只是和本 PR 自己写的合同不一致。
   - 改法（两行）：在 `dismissOnEscape` 里调用 `onClose()` 之前加 `closedByOutsidePressRef.current = false`，因为这一次关闭来自 Esc，就该还焦点；在浮层根的 `onPointerDown` 里也复位一次，表示用户回到浮层里点东西了。再在 `tests/ux/storyboard-popover-keyboard.test.mjs` 这类真 Chromium 测试里补一条：「拒一次点外面 → Esc → 焦点回到触发钮」。如果决定照 Radix 的语义不改代码，就把 invariant 改成「点外面之后，到下一次关闭为止都不还焦点」，并把 ClipNode 写进 `residual_risks`。

**建议**

2. `src/workbench/generationCanvas/nodes/NodeEffectChips.tsx:37` 和 `src/workbench/generationCanvas/components/CanvasControlsHelpPopover.tsx:28-31` 的 `close` 每次都自己 `focus()` 触发钮，因点外面关闭时也一样，绕过了 AnchoredPopover 这次定的规矩。大多数时候没有影响：点的是画布空白时，浏览器随后的 mousedown 默认动作会把焦点挪走（测试页：焦点在 BODY，0 个提示）。但如果点的元素在 mousedown 里 `preventDefault`（`src/workbench/common/RichTextActionButton.tsx:26`、选区浮条和 AI 改写条的按钮、`NomiSelect` 的选项），或者是禁用的按钮，焦点就会停在触发钮上，提示一直挂着（测试页：触发钮有焦点，挂着 1 个提示）。改法：删掉这两处显式的 `focus()`，因为按 Esc 或选一项时，FocusScope 本来就会把焦点还给打开前的元素；或者让 `onClose` 带上关闭原因。
3. `tests/ux/outside-press-and-text-format.walk.mjs:106-112` 那条「走节点浮条外壳」只断言了两件事：格式条顶边不高于舞台顶边，节点里只有一条浮条。拍板元素 `format.canvas-bar.shell` 里「恒定屏幕尺寸」那一半没断言。外壳本身由结构测试钉着，风险不大。补一句 300% 缩放下 `bar.height < 60`，这一半也就能直接看到了：现在约 42px，如果跟着画布放大会到 120px 上下。
4. `tests/ux/canvas-shortcuts.walk.mjs:252`：抽屉已开时 `openRailDrawer` 什么也不做，所以 C19 对「点空白有没有收起抽屉」不敏感，注释里说的「收起了」没有断言（我加日志确认过，确实收了）。可选：重开前加一句 `expect(railDrawer(getWin(), 'catalog')).toBeHidden()`，把这个前提钉住。C19 的改法本身合理：撤销后分组有没有恢复，有两道检查兜着，一是前面两条 graph / 磁盘轮询（含 `groups`），二是重开后的分组行（反例证明会红）。去掉的只是「抽屉开着时撤销，行实时回来」这一路，而在新规矩下这一路走不到：要让 Ctrl+Z 落到画布上就得先点画布，抽屉就收了。
5. PR 正文有两处没跟上：「## 系统改进」写的是「冒泡 pointerdown 基线 3 处只减不增」，「## 没做的」也只列了 3 处冒泡 pointerdown，而仓库里已经是 4 处（还有 CategoryTree 的冒泡 click）。「## 独立验收」也要换成本报告：报告首行、验收 HEAD、验收线。
6. 拍板图的 `priorArt` 和 PR 正文「## 先查别人」把 Radix 概括成「因点外面关闭时不把焦点还给触发钮，只有 Esc 等键盘关闭才还」，少了一个限定：Radix 只在非模态（或右键）时才置这个标记，默认是模态的 DropdownMenu，左键点外面照样还焦点。AnchoredPopover 是非模态的，拿它作先例没错，措辞上补一句「非模态时」就行。

**存疑**（产品取舍，需要用户定）

7. 「点外面」在 pointerdown 时就判定，所以在画布空白处按下开始平移（左键拖或中键拖，`panOnDrag=[0,1]`）也会收起左栏抽屉和锚点浮层。修前 d3-zoom 吞掉了 mousedown，抽屉开着也能照常平移画布，比如开着素材抽屉，先拖动画布找好落点，再把素材拖进去。现在一按下抽屉就收了。这和 Floating UI / Radix 的默认一致，也符合拍板元素「点画布空白处收起」，但拍板图和方向检查都没提到平移，要不要这样请用户定。如果希望「平移不收，原地点一下才收」，可以只让抽屉改在 `click` 时判定：d3-zoom 在拖动之后会吞掉那次 click，原地点一下照常会收。不过这样就要改「只有一种听法」的设计。

**顺带发现**（不属于本 PR，交协调会话）

8. Mod+J 打开 Agent 后不会聚焦输入框：`src/ui/app-shell/shell/ShellAgentHost.tsx:62-70` 的 `focusComposerSoon` 找的是 `#project-agent-resident textarea`，而 Agent 输入框从 ed086ea3e（2026-10-12）起已是 TipTap 的 `PromptEditor`（`src/workbench/ai/v4/AgentPanelV4Composer.tsx:228`），页里没有 textarea，焦点也就不会移过去。`tests/ux/shell-redesign.walk.mjs:455-456` 也按 `TEXTAREA` 判断，所以这条走查在这里每次都红。main（cad909708）上这两处代码与本分支相同，本 PR 没碰。夜间走查在 main 上天天红（例如 run 39925968614）；我没下载产物，没核实其中是不是有这一条。

### 四、没能验证的

- ClipNode 那条路径（上传途中点外面 → 上传失败 → Esc）没在整 App 里真走一遍：那要造一次进行中、随后失败的上传。结论来自读 `ClipNode.tsx`，加上测试页（真 `AnchoredPopover`，`onClose` 照 `closePicker` 的写法拒关）。
- Windows 和窄窗口：同 PR，没跑。
- 拍板图里用户的原话（「我试过了，可见变化 OK」）是实现线转述的，本线无法独立核实。
- 只在夜间跑的走查，除了上面挑跑的两条，其余只做了静态普查。
- 性能：按约定没跑 `perf:scenarios`（它经 with-gates-lock）。CI 的 Canvas Performance 在 550ba434e 上是绿的；13f5ffbfb 之后 src 只改了 AnchoredPopover 的焦点判断，不在打字路径上。

### 五、临时文件与工作树

- 扫描脚本、测试页（打包真源码）和各次日志都在 `/private/tmp/claude-501/-Users-aoqimin-Desktop-Nomi--claude-worktrees-pr-review-project-positioning-4eebec/60c58d99-0149-4b6c-baf1-e1e5354fc810/scratchpad/opus-acc/`，没进仓库。
- 对 `tests/ux/canvas-shortcuts.walk.mjs`、`tests/ux/shell-redesign.walk.mjs`、`src/design/outsidePress.ts` 的临时改动都当场恢复了，hash 与 HEAD 的 blob 一致。改 src 的那一次，恢复后 `sourceIdentity` 回到 `f6fab69f…`，之后的走查不受影响。走查截图写在已被忽略的 `tests/ux/shots/` 下。`git status --short` 只多出本报告这一个文件。

## 增量复验（d7888639a）

文字修正 48d6b79a9：只改措辞，已核

- 验收线：L-acc-opus-20261023（同一条线）。日期 2026-10-23。
- 范围：`git diff 550ba434e..d7888639a`，三个提交：a69ae08df（只提交了上一轮报告）、f736d9ac9（应修 1、建议 2）、d7888639a（建议 3、4、6，以及存疑 7 写进拍板图与方向检查）。src 只改了四个文件：`src/design/AnchoredPopover.tsx`（标记三处复位）、`NodeEffectChips.tsx` 和 `CanvasControlsHelpPopover.tsx`（删掉关闭时自己调的 `focus()`）、`src/design/outsidePress.structure.test.ts`（新普查）；另新增真 Chromium 测试 `tests/ux/anchored-popover-focus.test.mjs` 及其测试页。
- 结论：**通过**，没有阻断项。应修 1 修好了，测试两个方向都钉住，反例证明会红。删掉两处 `focus()` 后，在整 App 里焦点都落在合理的位置。建议 3、4、6 已做，建议 5 待协调改 PR 正文。存疑 7 的理由结论站得住，但有一条事实写错了（见第五节），只是文字问题，不挡合并。
- 构建：`dist/`、`dist-electron/build-stamp.json` 的 tree 都是 `13c7bdb7…`（22:10 写入），和现算的 `sourceIdentity` 一致；启动器没拒跑，我没 build。
- CI（d7888639a，写报告时）：Unit ×3、E2E Walkthroughs (1)(2)(4)、Canvas Acceptance ×2（含 C19 新断言）、Core Flow Smoke ×2、Design Lab 已绿；Contracts、Canvas Performance、E2E (3) 还在跑。PR 正文「## 独立验收」要改成本报告第一行、`验收 HEAD：d7888639a`、`验收线：L-acc-opus-20261023`，否则 Contracts 里的 `check:pr-judgement` 还会红。

### 一、检查项 → 结果 → 证据

| 检查项 | 结果 | 证据 |
|---|---|---|
| HEAD / 工作树 | d7888639a，干净 | `git rev-parse --short HEAD`；开始时 `git status --short` 为空 |
| `npx vitest run tests/ux/anchored-popover-focus.test.mjs src/design/outsidePress.structure.test.ts src/workbench/common/richTextActions.structure.test.ts tests/ux/storyboard-popover-keyboard.test.mjs` | 22/22 | `Test Files 4 passed (4)`、`Tests 22 passed (22)`；新测试五种关法：点画布空白关、Esc 关、被拒关后按 Esc、被拒关后在浮层里点一项、被拒关后键盘选一项，全 ✓ |
| 反例：换回 550ba434e 的 `AnchoredPopover.tsx` 跑新测试 | 后三条红 | `3 failed \| 2 passed`（三条「被拒关后」）。三条各对应一个复位点：Esc 的 `dismissOnEscape`、点一项的根 `onPointerDown`、键盘选一项的根 `onKeyDown`；已恢复，hash 4ea99517 = HEAD |
| 反例：换回 d20a4a1e1 的 `AnchoredPopover.tsx` 跑新测试 | 第一条红 | 「点画布空白关」失败：触发钮上挂着提示（`locator resolved to 1 element`），其余 4 条过。可见这份测试两个方向都钉住了：既不许点外面后还焦点，也不许标记卡住。已恢复 |
| 反例：换回 550ba434e 的 `NodeEffectChips.tsx`、`CanvasControlsHelpPopover.tsx` 跑结构测试 | 红，两处都认出 | `渲染 AnchoredPopover 的文件不自己把焦点塞回锚点` 失败，列出 `CanvasControlsHelpPopover.tsx anchorRef.current?.querySelector('button')?.focus(` 和 `NodeEffectChips.tsx anchorRef.current?.focus(`；已恢复，`sourceIdentity` 回到 `13c7bdb7…` |
| 新普查的盲区现状 | 目前没有漏网的 | 合同已写明，这条普查认不出经包装组件或 props 透传的锚点。实查：渲染 `<AnchoredPopover` 的 13 个文件，加上经 `AssetPickerPopover` / `ToolbarActionPanel` 包一层的 14 个调用方文件，`rg "\.focus\("` 只命中 `StoryboardShotRow.tsx` 里两处编辑器 focus 和 `:533` 行内 Enter 的 `box?.focus()`，都不是关闭时把焦点塞回锚点 |
| 测试页复跑（上一轮那版：真 `AnchoredPopover` + 真 React Flow 空白处 + 设计系统 Tooltip，`onClose` 照 `closePicker` 忙时拒关） | 修好了 | 见第二节 |
| 走查：`node tests/ux/outside-press-and-text-format.walk.mjs --shot`，以及 `--locale en`、`--scheme dark` | 三轨各 12/12 | 22:21 三轨都是 `RESULT 12/12 passed`。临时加一行日志读新断言的实测值：`zoom=3.000 bar.height=42 bar.y=48 stage.y=40`（已恢复，hash = HEAD） |
| `node tests/ux/canvas-shortcuts.walk.mjs` | 17 项全过 | `✅ 画布快捷键走查通过：17 项`，包括新加的「C19 点画布空白后目录抽屉该已收起」 |
| 截图亲眼读（22:21–22:22 这一轮产出） | 与断言一致 | `dismiss-after-zh-CN.png`：「⋯」浮层已收，「⋯」上没挂提示。`canvas-text-node-zh-CN-dark.png`：暗色格式条高约 42px，在顶栏下面，悬停「斜体」出提示，列表有圆点。`creation-toolbar-en.png`：悬停出「Inline code」提示，选区浮条在选区下方。`canvas-shortcuts/02-c19-group-restored.png`：重开的目录抽屉里「C19 restore whole group」和 C19 one / two 两个成员都在，画布上组框和两张图都回来了 |
| 相关单测 | 过 | `npx vitest run src/design src/workbench/generationCanvas/components src/workbench/generationCanvas/nodes`：251 个文件 / 2078 条 |
| tsc、eslint | 过 | `tsc -p tsconfig.app.json --noEmit` 无输出；8 个改动文件 0 error（4 条 warning 都是「tests/ux 下的文件被忽略」提示） |
| board-parity、escape-ledger、root-cause-contracts、self-written、concept-owners | 过 | 输出同上一轮；自写登记「新增代码文件 4 个（0 个未认领）」 |
| 方向检查增补里的历史说法 | 属实 | 两处 `focus()` 分别来自 b48bbb3e3（2026-08-07）和 eabe66ef7（2026-09-20），FocusScope 接管还焦点是 565a78a90（2026-10-05），确实是早于它的旧实现 |

### 二、测试页复跑：复位时机有没有新漏洞

| 场景 | HEAD（d7888639a） | 550ba434e | d20a4a1e1 |
|---|---|---|---|
| 拒一次点外面 → Esc | 回触发钮 | BODY | 回触发钮 |
| 拒一次点外面 → 在浮层里点一项 | 回触发钮 | BODY | 回触发钮 |
| 拒一次点外面 → 在浮层输入框里打字 → Esc | 回触发钮 | BODY | 回触发钮 |
| 拒一次点外面 → 在浮层 portal 出去的下拉（`role=listbox`，`aria-controls` 指回浮层）里点一项 → 调用方程序关 | 回触发钮 | BODY | 回触发钮 |
| 点浮层 portal 出去、但不算「上层弹层」的子元素（调用方接受关闭） | BODY，0 个提示 | BODY | 回触发钮，挂着提示 |
| 同上，但调用方拒关 → Esc | 回触发钮 | BODY | 回触发钮 |
| 拒一次点外面 → 调用方程序关（如上传结束自动收起） | BODY | BODY | 回触发钮 |
| 先在浮层里按一下 → 再点画布空白 | BODY，0 个提示 | — | — |
| 点画布空白 / 点 mousedown 里 `preventDefault` 的按钮 | BODY，0 个提示 | — | — |
| 直接 Esc | 回触发钮 | — | — |

回答协调问的两点：

- **portal 下拉的按下会不会经 React 合成事件冒到浮层根、把标记复位？会。** 第四行就是证据：只有走了这条冒泡，程序关时焦点才会回来。这正是想要的语义。标记只在浮层还开着时有意义；用户在浮层自己弹出的下拉里点了东西，最近一下就是「回到浮层里」，之后关闭理应还焦点。
- **同一次按下里会不会「先置真、又被合成事件复位」，把挂提示的毛病带回来？不会。** 点外面的监听挂在 document 的捕获阶段。调用方收起浮层的更新是离散优先级，React 19（package.json `^19.3.0`）在这个监听返回后的微任务里就提交卸载。浮层连同它 portal 出去的子元素都卸掉了，React 根上分发合成事件时找不到它们，复位不会发生（第五行：BODY、0 个提示）。只有调用方拒关、浮层还在时，合成事件才会复位（第六行），而那时用户点的确实是浮层自己的东西。
- **「先在浮层里按下、再点外面」的顺序对。** 里面那一下先复位，外面那一下再置真，浮层关掉、焦点不回（倒数第三行）。
- 「拒关后由调用方程序关，不还焦点」是合同 `residual_risks` 里写明的有意行为（用户最后一下点的是别处），和实现一致。

### 三、删掉两处 `focus()` 之后焦点去哪（真 Electron）

用临时脚本起真 Electron：生产构建、屏外窗口、隔离资料目录，开 `NOMI_TEST_NETWORK_GUARD=1` 不出网，零花费。种了一个只有一张图片节点的项目。

| 场景 | 焦点 | 提示 |
|---|---|---|
| 「⋯」里「画布操作」整行：开帮助 → Esc | 回到「画布操作」那一行，「⋯」仍开着 | 「画布操作」 |
| 同上，再点那一行收起帮助 | 那一行 | 无 |
| 帮助开着时点画布空白 | BODY；「⋯」和帮助都收了，「⋯」钮也没焦点 | 无 |
| 图片节点「提示词预设」：搜「三视图」，选「人物三视图」 | 落在生成框的提示词编辑器里（插入的文字在里面），不在触发钮上 | 无 |
| 选完再点触发钮 | 重新打开，焦点进搜索框 | 无 |
| 打开后按 Esc | 回到触发钮 | 「提示词预设」 |
| 打开后再点触发钮收起 | 触发钮 | 无 |
| 打开后点画布空白 | BODY（节点取消选中，生成框连同触发钮一起卸掉） | 无 |

- 选一项这一路比修前更好。选中时 `applyPromptPickerItem` 先把焦点放进提示词编辑器（`NodeGenerationComposer.tsx:259-267` 的 `focus('end')`）；修前 `close()` 紧接着把焦点抢回触发钮，触发钮的提示随之弹出，用户得再点回编辑器才能接着写。现在 FocusScope 看到焦点已经在编辑器里，就不动它了。
- 按 Esc 关闭后焦点回到触发钮、提示随焦点出来，修前就是这样；对键盘用户这是对的，不算新问题。

### 四、逐条核上一轮的应修 / 建议 / 存疑

| 上一轮 | 处理 | 核验结果 |
|---|---|---|
| 应修 1：`closedByOutsidePressRef` 不复位 | 已修（f736d9ac9） | 三处复位（`dismissOnEscape`、浮层根 `onPointerDown`、浮层根 `onKeyDown`）；新测试 5/5，换回旧版各自会红；测试页「拒关后 Esc / 点一项 / 打字后 Esc」都回触发钮；合同 invariant 改成「按 Esc / 选一项关闭照旧还焦点；只记最近一下」，与实测一致 |
| 建议 2：两处调用方自己 `focus()` | 已删，并加了普查 | 普查对旧文件会红；整 App 里焦点都落在合理位置（第三节） |
| 建议 3：格式条恒定屏幕尺寸没断言 | 已加 | 先断言 zoom ≥ 2，再断言高 < 60px；实测 zoom 3.000、高 42px |
| 建议 4：C19 前提没钉住 | 已加 | 重开前 `toBeHidden`；canvas-shortcuts 17 项全过 |
| 建议 5：PR 正文过时 | 待协调随结论改 | 现在核不了；要改的有：系统改进的「基线 3 处」→ 4 处、没做的补 CategoryTree 冒泡 click、独立验收换成本报告首行和 `验收 HEAD：d7888639a`、先查别人里 Radix 补「非模态时」 |
| 建议 6：Radix「非模态时」限定 | 拍板图已补 | `TextFormatDismiss.board.json` 的 priorArt 写明非模态（或右键）才不还焦点、默认模态照样还；PR 正文那一处随建议 5 一起改 |
| 存疑 7：平移画布也会收 | 按默认定了「按下即算」，事后报用户 | 拍板元素 `dismiss.outside-press` 的说明、方向检查增补、合同 invariant 都写了；理由核验见第五节 1 |
| 顺带发现 8：Mod+J 不聚焦 Agent 输入框 | 已提成独立任务卡 | 不在本 PR |

### 五、新发现

1. **建议（文档事实，不挡合并）**：存疑 7 的理由里有一条事实不对。方向检查增补和协调消息里写「xyflow 在 selectionOnDrag=false 时用的 paneClickDistance 也是 0」，合同 invariant 写「手抖 1px 的按下被 d3-zoom 当拖动吞掉 click」。实际是：
   - 本仓库装的 `@xyflow/react` 12.11.5 里，`ReactFlow` 的默认值是 `paneClickDistance = 1`（`dist/esm/index.mjs:3745`），Nomi 没有覆盖（`rg paneClickDistance src` 为空）。
   - `@xyflow/system` 0.0.81 把它原样交给 d3-zoom：`clickDistance(selectionOnDrag ? Infinity : paneClickDistance)`（`dist/esm/index.mjs:3002`）。
   - d3-zoom 判定拖动的条件是「位移平方 > clickDistance²」（`d3-zoom/src/zoom.js:289`）。一旦算作拖动，就在 window 捕获阶段吞掉随后那次 click（`d3-drag/src/nodrag.js:15-21`）。

   我在真 React Flow 空白处实测了 document 捕获阶段收到的 click：不动 1 次，横移 1px 1 次；斜移 1px（√2）、横移 2px / 5px / 40px 都是 0 次。pointerdown 每次都收到。所以结论仍成立：改成 click 判定后，手抖超过 1px 的点击会被吞掉，「点了没反应」会回来。要改的只是两处措辞：方向检查增补里的「clickDistance 是 0」「手抖 1px 就算拖动」，和合同 invariant 里的「手抖 1px」，都改成「xyflow 默认 1px：横移 1px 仍算点击，超过就被吞」。还可以补上没选的那条路：把 `paneClickDistance` 调大（比如 4px），再改用 click 判定，这样平移不收、轻微抖动照样收。代价是画布空白处的 onPaneClick / 取消选中也改按 4px 判，而且要改「只有一种听法」。这仍然是交给用户的产品取舍，本线不替用户拍板。

除此之外，复位时机和删掉 `focus()` 这两处都没发现新问题。

### 六、没能验证的

- `tests/ux/node-prompt-presets.walk.mjs`（只在夜间跑，覆盖效果预设的完整旅程）没跑：它的公共提示词和配图要连外部源，这条线不出网。焦点相关的关键路径，已用上面的真 Electron 脚本在测试网闸开着的情况下点过。
- ClipNode「上传中拒关」的整 App 路径仍没真走一遍（要造一次进行中、随后失败的上传）。这条路径由新的真 Chromium 测试和测试页覆盖：同一个 `AnchoredPopover`，同样的拒关写法。
- CI 里还在跑的几项（见本节开头）。
- Windows、窄窗口：同前。

### 七、临时文件与工作树

- 本轮新增的临时文件都在 `/private/tmp/claude-501/-Users-aoqimin-Desktop-Nomi--claude-worktrees-pr-review-project-positioning-4eebec/60c58d99-0149-4b6c-baf1-e1e5354fc810/scratchpad/opus-acc/` 下：测试页的 `harness/run4.mjs`、`harness/run5.mjs`、`harness/MidAnchoredPopover.tsx`（550ba434e 版），以及真 Electron 脚本 `app-focus.mjs`。没进仓库。
- 临时改动都当场恢复了，hash 与 HEAD 的 blob 一致：`src/design/AnchoredPopover.tsx`（两次换回旧版跑反例）、`NodeEffectChips.tsx` 和 `CanvasControlsHelpPopover.tsx`（换回旧版跑普查反例）、`tests/ux/outside-press-and-text-format.walk.mjs`（加一行日志读实测值）。每次改 src 后都确认 `sourceIdentity` 回到了 `13c7bdb7…`，所有走查和真 Electron 脚本都在恢复之后跑。`git status --short` 只有本报告这一个文件。
