# 方向检查：项目库 / 文稿侧栏的「动作」和「报错」呈现没有单一出口（2026-10-10，L3）

触发：`node scripts/fix-churn.mjs` 对 L3 三件小修（删除失败提示、文稿行图标、项目库新手引导入口）命中——`NomiStudioApp.tsx` 近 14 天 2 个 fix（这刀第 3 个）、`DocumentListSidebar.tsx` 3 个（第 4 个）、`ProjectLibraryPage.tsx` 2 个（第 3 个）。`openWorkspaceFlow.ts` 未命中，但它是同类入口，一并复盘。这是先复盘、再做结构改法，不是又补一刀。

### 0. 一句话根因

「操作失败怎么跟用户说」和「一行里的动作怎么摆」在仓库里各做过几次、每次各写各的帮手，项目库和文稿侧栏这几处恰好是还没迁到共享做法的存量——缺的是「报错进界面前必须过的一道人话出口」和「≤3 个动作直接摆图标」这两条成文的共享规矩。

### 1. 归类表：bug → 直接原因 → 类

先交代一个对自己假设不利的事实：下面这 4 个文件近 14 天的 7 个 `fix` 提交，**没有一个是「报错呈现 / 行动作」类**。命中热点是因为它们是大枢纽文件，被顺手碰。

| 提交（日期） | 在这 4 个文件里改了什么 | 为什么 | 类 |
|---|---|---|---|
| bc45ad4b3（09-28） | 三个文件各加 1 行 JSX 类型导入 | React 19 类型基线 | 无关（升级顺带） |
| 59dd536bd（09-30） | `DocumentListSidebar.tsx` 1 行：新建方案是否打开改由显式 initiator 决定 | Agent 新建方案不该抢占界面 | 无关（Agent 归属） |
| 88d1e4339（10-07） | `NomiStudioApp.tsx` 8 行：打开项目不依赖 Agent lane | 退出 / lane 故障升级成项目级故障 | 无关（生命周期，已有复盘 direction-check-2026-10-07-quit-teardown.md）；但同一函数里有「主进程原串不进横幅」的注释，说明这条纪律当时就立了，只落在了恢复失败这一条路上 |
| aed983058（10-08） | `ProjectLibraryPage.tsx` 13+/16-：新手引导按钮由卡片改成图标钮 | 控件文案契约 §1.8（次动作 = 图标 + 悬停名字） | **同类（动作呈现）**：这刀把引导入口收成纯图标，直接造出了 F5「说不清是什么」 |
| 58522640b（10-09） | `DocumentListSidebar.tsx` 1 行：右键菜单 `z-50` → `z-popover` | 浮层被抽屉压住 | 同类边缘（⋯ 菜单自己是一个手搓浮层，要维护层级） |

仓库级的同类证据（不在这 4 个文件，但同一类）：

| 提交（日期） | 做了什么 | 类 |
|---|---|---|
| a4db9d337（09-24） | 保存失败文案收成 `projectSaveFailureText`，四条保存路径共用 | 报错转人话——只迁了「保存」 |
| 1780f4e24（10-08） | 更新失败话术按原因分，技术原文折叠进「技术详情」 | 报错转人话——更新面自己又做了一套 |
| `NodeErrorReport.tsx`（生成失败卡） | 原因 + 提示 + 折叠「技术详情」 | 报错转人话——画布面的第三套 |
| 2026-09-21（见 `DocumentListSidebar.tsx` 的 `onDeleteStoryboard` 注释） | 方案删除去掉确认框、改撤销 toast，保留 ⋯ 菜单里的「删除方案」 | 动作呈现——手势已改，菜单没跟着收，才有「垃圾桶和三个点重复」 |

**对假设的修正**：「侧栏、项目库、文稿行的动作和报错呈现没有单一出口」只说对了一半。
- 报错这半成立：同一件事（原文不进界面，说人话，原文折叠）至少做了 3 套（保存 / 更新 / 节点卡），项目库的删除、打开文件夹、选文件夹打开、加载失败 4 个入口还在用旧句式 `error.message ? 原文 : 兜底`。出口其实**有**，只是各面各一份，项目库操作面没接上。
- 动作这半成立：缺的是「≤3 个动作直接摆图标」这条成文规矩（设计系统里只有 §1.8 次动作用图标 + 悬停名，没有「⋯ 的上限」）。
- 「热点」本身是误报信号：枢纽文件的 fix 数不说明类根因。真正的类证据在上面第二张表。

### 2. 为什么这一类会一直出现

追到结构：`report(projectId, message: string)`（`NomiStudioApp.tsx:148`）收的是**任意字符串**。类型上无法区分「本地化文案」和「主进程原文」，所以每个调用点都可以把 `error.message` 塞进去，而没有任何东西拦。恢复失败那条路靠注释自觉、保存失败靠一个帮手自觉；新增入口（打开文件夹、选文件夹）就没自觉。动作侧同理：⋯ 菜单是手搓的 portal 浮层，每一行能放多少动作没有规矩，删除手势改了菜单还留着。

#### 三条体验铁律

| 铁律 | 类根因要回答的问题 | 最小证据 |
|---|---|---|
| ⑫ 点了=以为的 | 用户点删除 / 点小播放按钮，预期是「删掉了 / 看到什么」；实际是一串看不懂的内部报错、或点开才知道是新手引导。 | 用户截图 10/11/12；`tests/ux/full-walk/catalog.mjs` 里项目库删除失败、引导入口两行 `userExpectation` 对照（拍板后补） |
| ⑩ ⑪ | 不适用：不涉及意图抽取或模型档案。 | — |

### 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 项目库**重命名失败**之外的下一个新操作（复制项目、导入、导出到文件夹）又把 `error.message` 直接 `report` | `grep -n "error.message" src/workbench/NomiStudioApp.tsx src/workbench/library/*.ts*`；拍板后门岗会替这条守 |
| 画布 / 素材库有同样「原文糊界面」 | 同一条 grep 扩到 `src/workbench/assets`、`src/workbench/generationCanvas`（本轮只粗查，复盘批准后做成清单） |
| 下一个行内动作（素材行、节点行）又长出自己的 ⋯ | 在 `src` 里搜 `IconDotsVertical` + `role="menu"` 的手搓菜单个数；门岗拍板后按「动作数 ≤3 不许进菜单」计 |
| 纯图标按钮继续被造出来而没有 title / aria-label | 拍板后的门岗：`WorkbenchIconButton` 之外的纯图标 `<button>` 必带名字 |

### 4. 靶子独立性检查

- 尺子是谁写的：本复盘的归类表来自 `git log` / `git show` 实查，不凭印象；`fix-churn` 的计数是按 `fix` 前缀算的，本身把「顺手碰」也算进去——这个靶子偏高，所以第 1 节单列了「无关」行，没有拿 7 这个数当证据。
- 有没有「修对了反而出问题」的先例：10-08 把引导入口收成图标钮（aed983058）是按控件文案契约「修对」的，结果用户看不懂——说明 §1.8 对「次动作」一刀切太严；F5 按协调已定的方式补可见文字，不推翻 §1.8。
- 特征测试已钉住现状（见末节），修完会翻转，不是拿现状当正确答案。

### 5. P0：这些是我们独有的吗？现成方案有哪些

不是独有的，全是通用 UI 能力，仓库里已有现成件，**接入现成的**：
- 报错转人话：`src/workbench/project/projectSaveFailureText.ts`（`isWorkspaceBusyError` + 词典），保存路径已用；技术原文折叠：`NodeErrorReport.tsx`、`UpdateDialog.tsx` 的「技术详情」做法。不写第二套。
- 行动作：`WorkbenchIconButton`（`src/design/actions.tsx:124`，自带 `aria-label` + `title`）。
- 不属于自写登记（`self-written.json` 的领域目录里没有这几项）。

### 5a. 自写登记命中：gate-family

`check-icon-semantics.mjs` 属于自写登记 `gate-family`（status: under-review，reviewBy 2026-10-31，paths: scripts/check-*.mjs）。本轮在这条已有门岗上加一条规则（规则三：纯图标按钮必须带名字），不另起新门岗。**为什么现在换不了现成方案**：eslint 的 `jsx-a11y/control-has-associated-label` 能查「控件有没有名字」，但它不认 Tabler 图标组件是「没有文字的内容」、也不能按文件计数做只减不增的棘轮基线，而这道门岗的存量扫描、基线和 §6 图标词典登记都已经集中在这一个脚本里；把一条规则拆到另一套工具里，会多出第二份「谁算控件」的判据（`scripts/lib/jsxControls.mjs` 已是两道门岗共用的）。**哪天换**：gate-family 在 2026-10-31 前的合并 / 删除清单落地时，一并评估把规则三迁成 eslint-plugin-jsx-a11y 规则 + 基线文件；那时本规则随脚本一起迁，不留两份。

### 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 报错：把 `projectSaveFailureText` 扩成「按操作取人话」的单一出口，删掉 4 处 `error.message` 句式，原文只进 `logRendererError`；动作：文稿行 / 方案行直接摆 `WorkbenchIconButton`，删掉 ⋯ 菜单与行内垃圾桶 | 动 4 个热点文件，改词典 zh/en，改走查里点「⋯」的几处 | 低：行为面窄，有特征测试翻转为护栏 | **是** |
| 补 | 只改删除一处的句子、只给小播放按钮加字 | 最小 | 同类入口（打开文件夹、选文件夹、加载失败）和下一个新入口还会回来；这就是被命中的「第 3 个补丁」 | 否 |
| 重写（限一个模块） | 新造统一的「操作结果」状态机 / 全局错误中心 | 大，且与 `notify` 已有的 `report` 重叠 | 高，重复 owner | 否 |
| 删 | 删掉 `report` 里的 `message` 参数改成只收错误码 | 彻底，但需要全仓调用点改造 | 中，范围超出本类 | 作为下一步评估，不在本轮 |

### 7. 用户要权衡的核心

**一句话给用户拍板**：项目库 / 文稿这几处的「报错原文糊界面」和「⋯ 菜单 + 垃圾桶重复」，推荐一次做成「报错只说一句人话（原文进日志）、行内动作 ≤3 个直接摆图标」，并加门岗拦下以后的同类；代价是多动 4 个热点文件、改一轮词典和走查，好处是用户再也看不到 `[safe-delete]…` 这种串、同类入口不再各补各的；不推荐只补这三处，因为打开文件夹、选文件夹、加载失败和下一个新入口会再冒出来。

**用户 2026-10-10 拍板：一次改掉；F4 先不改，随目录设计一起定。**

## 拍板后实现范围（协调已定）

- F6 报错：`projectSaveFailureText` 扩成按操作取人话的单一出口，覆盖删除 / 打开项目文件夹 / 选文件夹打开 / 初始化；`openWorkspaceFlow.ts` 的硬编码中文进词典；加源码扫描门岗（项目表面文件里不许把 `error.message` 传给 `report` / `showMessage`）；加载失败的「原因」行是否折叠成「技术详情」随本轮定（`ProjectLibraryPage.tsx` 是热点，本轮一并处理）；逃逸账本补一条，占位 9999。
- F2 动作：文稿行 2 个图标（重命名、删除），方案行 3 个（重命名、复制、删除）；删掉 ⋯ 菜单和行内垃圾桶（含 `SwipeToDeleteRow` 的红底删除区）；方案行删除**保留**现在的「不弹确认 + 撤销 toast」，不改成确认框；文稿行删除保留原确认框；当前项用淡底色，不加蓝色描边；通用规矩写进 `docs/design/nomi-design-system.md`（「行内 / 工具条的动作 ≤3 个就直接摆图标，超过 3 个才用 ⋯。用户 2026-10-10」）；走查里点「⋯」的几处（`tests/ux/creation-plan-delete-undo.walk.mjs`、`creation-sidebar-delete.test.mjs`、`creation-work-surfaces.e2e.mjs`、`shell-redesign.walk.mjs`）跟着改走统一出口。
- F5 入口：新手引导按钮加可见文字（中「新手引导」/ 英「Tour」风格）+ hover 名字，不挪位置；门岗 = 纯图标按钮必须带 `title` / `aria-label`，**不**要求图标旁带字。
- F4（文稿列宽）：不在本轮，协调另与用户确认。
- 退出「Nomi did not respond」：三个可能原因留在 L3 报告里，不继续查。

## 特征测试清单（动结构前先锁住）

- `src/workbench/library/projectErrorSurface.characterization.test.ts`（5 条，现状全绿）：
  - 选文件夹打开失败、确认初始化后失败：`showMessage` 收到的就是主进程原文（真调 `openWorkspaceProjectFromPicker`）。
  - 删除项目、打开项目文件夹：`NomiStudioApp.tsx` 里 `error.message` 优先于本地化兜底、原文进 `report`（`NomiStudioApp` 没有可注入的单测 harness，钉源码形状；真机验证记 unverified，改完用测试里注入失败的截图补）。
  - 项目库加载失败：`projectsError.message` 原样渲染进「原因」行。
  - 拍板实现后这些断言翻转（界面只收人话、原文进日志）。
- 动作侧（⋯ 菜单）：已有走查 `tests/ux/creation-plan-delete-undo.walk.mjs`、`creation-sidebar-delete.test.mjs`、`creation-work-surfaces.e2e.mjs`、`shell-redesign.walk.mjs` 钉着「⋯」现状；未新增单测，原因：改成直排图标后这些走查本身就要改，等实现一并翻。
