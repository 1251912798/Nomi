# 方向检查：左栏抽屉盖住刚打开的编辑器（2026-10-12）

触发：`ShellRail.tsx`、`DocumentListSidebar.tsx` 近 14 天各已有 2 个 fix，这一刀是第 3 个；`src/ui/app-shell/shell/` 目录 14 天 7 个 fix。协调会话否决了「在 `selectStoryboard` 里补一个回调」的第一版（那是第 N 处特例），改为结构修。

## 0. 一句话根因

左栏抽屉是浮在内容上的面板，却没有「里面选中了什么就收」的统一通道：收起只靠点外面 / 再点同一项 / Esc / 切项目，选中文稿或方案这一类「内容已经换了」的事件没人负责，抽屉就盖着刚打开的页面。

## 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 外壳重设计（`f59b38d80`）把「创作内容」列改成浮层抽屉；分镜表走查在 main 上红：行首「⋯」被抽屉盖住 | 旧列占位、不会盖内容；新抽屉浮着，点开方案后不收 | 容器语义变了（占位 → 浮层），依赖旧语义的「点完就看到内容」没跟着改 |
| 第一版补法（只在 `selectStoryboard` 收） | 点文稿行仍不收；以后新入口各自要记得回调 | 按入口各补各的（同一语义多处写） |

## 2. 为什么这一类会一直出现

「当前文稿 / 方案 / 工作模式」是唯一真相（`workbenchStore` 的 `activeDocumentId`、`activeStoryboardId`、`workspaceMode`），但抽屉不看它，要靠每个入口自己通知抽屉。入口有 6 扇写门（`CreationDocumentSwitcher` 两处、`DocumentListSidebar` 两处、`openStoryboardPlanRow`、`StoryboardWorkspace` 等），靠回调就一定漏。落到铁律：⑫ 点了 = 以为的。

## 3. 结构修（本刀）

`ShellRail` 订阅上述三个字段，抽屉开着时它们的组合变了就收（`selectionKey`，单一 owner 在 ShellRail 一处）。`DocumentListSidebar` 不再带任何抽屉回调。文稿行、方案行、新建 / 复制方案、顶栏切模式、Agent 改当前方案，全部自动覆盖，以后加的入口也自动覆盖。点方案收、点文稿不收的不一致消掉。

door-map 数过：`setActiveStoryboardId` 写入口 6 扇都写这同一个 store，被这一处订阅覆盖。

### 已知限制与其它抽屉

| 项 | 结论 |
|---|---|
| 抽屉里点「已经是当前」的文稿 / 方案行（模式也没变） | 状态不变，抽屉不收；内容本来就在，只是抽屉还开着，再点一下外面即收 |
| 双击非当前文稿行标题改名 | 第一下点击就是选中，抽屉随之收起，改名框出不来。改名还有行菜单「重命名」一条入口，功能没丢；是否要为双击改名保留抽屉，交协调定 |
| 目录 / 素材 / 流程 / Skill / 提示词抽屉 | 它们不写文稿 / 方案 / 模式；素材全屏预览自带层级（applicationModal），目录点节点是否会让画布定位被抽屉盖住未实测，不在本刀覆盖，记为后续核对项 |

## 4. 靶子独立性检查

走查（`storyboard-table-structure.walk.mjs`）是 10-05 另一条线写的，用 elementFromPoint 判可点，不是本线的尺子。本刀给它加了「点开方案后抽屉必须已收」的断言和暗色参数。走查里「用作…」菜单一段对着 10-07 已删除的功能（`f07824de5`），属过期，删掉该段。

## 5. P0：这些是我们独有的吗

不是。抽屉是 Mantine Drawer + `useClickOutside`（已接入）；这里只是用既有 store 字段驱动 `open` 状态，不写新基础设施。自写登记不命中。

## 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | Mantine Drawer 无「内容选中即收」内建 | | | 无 |
| 补：入口回调（第一版） | 在 `selectStoryboard` 收 | 3 行 | 入口各补各的，文稿行已漏 | 否决 |
| 换（采纳）：抽屉订阅唯一 owner | 抽屉自己看 store 三个字段 | 12 行 + 走查对账 | 顶栏切模式也会收抽屉；双击改名限制（见上） | 采纳 |
| 删：回到占位列 | 推翻 10-08 拍板 | 大 | | 否 |

## 7. 用户要权衡的核心

抽屉「选中即收」换来「新打开的内容永远不被盖」，代价是在抽屉里连续切换多篇文稿要重新点开抽屉，和双击改名要走菜单。

## 特征测试清单

`storyboard-table-structure.walk.mjs`（命中测试 + 抽屉已收断言，亮 / 暗两跑）；`creation-sidebar-multi-doc.walk.mjs`、`core-a-creation-plans.e2e.mjs`、`shell-redesign.walk.mjs`（改为点完再开抽屉）；`storyboard-editor-entry.test.mjs`、`creationResourceTreeModes.test.ts`。
