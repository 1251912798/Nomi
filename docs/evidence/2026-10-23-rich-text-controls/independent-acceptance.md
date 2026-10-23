# 独立验收报告：点外面就收 + 富文本格式按钮

- 验收线编号：L-acc-sonnet-20261023（与实现线不同会话）
- 验收 HEAD：`59c836ee8`（范围 `origin/main..HEAD` 两个提交：6ef8c3e6b、59c836ee8）
- 日期：2026-10-23
- 结论：**有条件通过**。没有发现阻断项。两个条件：① 真机走查（zh / en）我这边没能复跑（构建戳被另一会话的未提交改动判陈旧，按要求没有自己 build），合并前要在重建后跑一次；② 夜间走查 `tests/ux/rich-editor-p1.walk.mjs` 的定位器被这次改动打断（应修，测试侧小改）。其余是建议项。

## 一、检查项 → 结果 → 证据

### 第 2 步：命令复跑（命令一字未改）

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

### 第 3 步：边界场景（临时脚本放在 scratchpad，没有进仓库）

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

## 二、代码审查发现

没有阻断项。逐个看了 9 个迁移点的「点在自己身上」判据：与改前等价或更正确（TaskCenterPanel 把触发钮算作自己，顺手修掉了「按触发钮先关后又被 toggle 打开」；ShellRail 判据逐字保留；AnchoredPopover 的 `isInsidePopupAbove` 让位规则原样保留）。`useRichTextActions` 的 hook 调用顺序稳定（三个壳都在任何早返回之前调用；`WorkbenchEditorToolbar` 的早返回已删）；`ids` 用模块常量；深比较确实挡住了每键重渲；`TextDocumentNode` 的 `onEditingChange` 在卸载 / 失焦 / 重挂时都归 false；`lockNodeId={null}` 与白板编辑条先例一致（编辑期间锁 / 复制条收起，失焦即回来）。

1. **应修**（测试侧，小）：`tests/ux/rich-editor-p1.walk.mjs:184` 用 `toolbar.locator('[title="高亮"]')`（及删除线 / 插入表格 / 待办列表）找格式钮，注释写着「WorkbenchIconButton 会带 label → title」。`RichTextActionButton` 没有 `title`（只有 `aria-label` + 设计系统 Tooltip），我在测试页里验证这 4 个定位器都命中 0 个。该走查不在 `tests/ux/nightly-ci-exclusions.json` 里，夜间会多红 4 条「工具栏·…」。建议改成 `getByRole('button', { name })` 或 `[data-rich-text-action="highlight"]`，与同目录 `document-format-persist-undo.walk.mjs` 一致。
2. **建议**（潜伏，当前被碰巧遮住）：`src/workbench/common/richTextActions.tsx:93` 的 selector 读的是快照里的 `current`，不是入参 `editor`。TipTap 3.23 的 `useEditorState` 在换编辑器实例（`useNomiTiptapEditor(..., [placeholder])` 里 placeholder 一变就重建，创作区切语言即触发）后，快照要等新实例的第一次事务才刷新，期间读到的是已销毁的旧实例，`readActionStates` 返回 `[]`，格式钮整排消失。测试页里无事务时 17→0→点一下才回 17。现在创作区没出事，是因为 `WorkbenchEditor.tsx:154` 的 layout effect 会在换实例后派发一个事务；画布文本节点 placeholder 恒为 `''` 不换实例。这条靠别处的副作用兜着。建议改法：selector 用闭包里的 `editor`（`selector: () => readActionStates(editor, ids)`，每次渲染重建 selector，快照仍负责触发重算），再补一个「换实例后钮仍在」的单测。
3. **建议**：`src/design/outsidePress.structure.test.ts:32` 的 `PRESS_LISTENER` 要求处理器写成标识符（`[\w.]+`）。我逐条验证：`document.addEventListener('mousedown', (e) => …)`、`function (e) {…}`、`el.ownerDocument.addEventListener(…)`、Mantine `useWindowEvent('mousedown', …)`、`'click'` 监听都**漏过**门岗，只有具名处理器会被抓。现状 src 里没有这类写法，所以今天不红，但「新浮层照最近的抄」恰恰最常写内联箭头。建议把正则放宽到任意表达式，或改成 ESLint `no-restricted-syntax` / AST 扫描。同类现存一例未迁：`src/workbench/sidebar/CategoryTree.tsx:106` 用 `window.addEventListener('click', close)` 收右键菜单。
4. **建议**（文档准确性，P3 对账）：`docs/engineering/direction-checks/2026-10-23-outside-press-and-rich-text-controls.md:39,62` 写「修前走查 3/10」，而同提交的 `docs/evidence/2026-10-23-rich-text-controls/walk-before-zh-CN.json` 是 1/10 通过（9 条失败）。另 `src/workbench/creation/storyboard/shotRow/StoryboardShotRow.tsx:276` 的注释还写「点外面那一下是 mousedown 关菜单」，现在是 pointerdown 捕获。
5. **建议**（既有，非本次引入）：`AssetPickerPopover`（无 `anchorRef`，锚点是 0 尺寸占位）的触发钮不算「自己」，再点触发钮是「先关后开」，关不掉（修前修后一致，见上表）；`ShellRail` 的让位选择器不含光秃秃的 `role=listbox`（真 `NomiSelect` 的下拉我验证过带 `.mantine-Popover-dropdown`，所以被覆盖；不带这几个属性的 portal 弹层不覆盖，S4b 实测会收抽屉）。两条都可以顺手收，但不属于这次改动。
6. **存疑**：`SelectionGeneratePopover.tsx:62` 下方分支新加了 `Math.max(contentTop + 8, …)`。选区被滚出正文区上沿时，浮条会钉在正文区顶边（修前会被算到工具栏上方 / 根外），选区看不见了浮条还在。验证法：在创作区选一行、把文稿滚到选区在可视区上方，看浮条是否还钉在顶边。算术上不会出现负值；编辑器矮到 < 约 104px 才会掉出底边。我没有在真页面上验证这条。

## 三、没能验证的

真机走查 zh / en 没能自己复跑（构建戳被另一会话对 `scripts/pre-push-scan-guards.mjs` 的未提交改动判陈旧，按约定不自己 build；我已证明 dist 本身与 HEAD 一致，所以实现线的截图与 10/10 结果可信，但不是我这条线复跑的）；因此「文本节点编辑完点空白后锁 / 复制条回来」「TaskCenterPanel 真实触发钮」「NomiBrowserDialog / 素材筛选 / 帧菜单 / TimelinePreview 文字菜单 / EditingLayoutMenu」这些只能靠读码和同类机制的测试页佐证，没有在整 App 里点过。
