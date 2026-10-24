# 方向检查：图标尺寸归谁管（F1 四档，2026-10-24，交用户拍板）

触发：同一 PR 验收第 2 次不过（P1）。F1 第 1 轮协调退回；第 2 轮（`41722c947`）协调复核又不过。

### 0. 一句话根因
图标尺寸有两个主人：容器（按钮组件用 CSS `[&>svg]:size-4 [&>svg]:stroke-2` 强制 16/2）和图标自己（F1 在调用处传 `ICON_TIERS` 的 size / stroke），CSS 优先级更高，图标自己传的值被静默盖掉。

### 1. 归类表
| 现象 | 直接原因 | 类 |
|---|---|---|
| 第 1 轮：为了让档位生效，在按钮里包了一层 span（ICON_TIER_CLASSES） | 绕开 `[&>svg]` 选择器 | 同一件事两套写法 |
| 第 2 轮：去掉包裹层后，顶栏导出（拍板 13/1.8）、布局菜单（18/1.8）、任务中心（18/1.8）实际渲染回 16/2；报告的 DOM 表量的是 svg 属性，不是渲染尺寸 | `WorkbenchButton` / `WorkbenchIconButton` 的 CSS 盖掉属性 | 一个概念两个写口（R33） |

### 2. 为什么会一直出现
- 用了档位的 8 个文件里有 5 个的图标在 `Workbench(Icon)Button` 里（ShellTopBar、NodeGenerationComposer、InlineParameterBar、EditingLayoutMenu、TaskCenterButton）。
- 仓库里另有约 20 处 `[&>svg]:size` / `[&_svg]:size` 写法：现有惯例是**容器**管图标大小。F1 按「图标自己传」落地，和惯例相反；只要容器有 CSS，传了也白传，而且没有任何门岗会报。

### 3. 不改结构，接下来会冒出什么
1. 任何按钮里的图标改 size / stroke 都不生效，评审只看代码会以为生效（可用 computed style 验证）。
2. 为了生效继续包 span 或加 `!` 覆盖，按钮里出现第三种写法。
3. 设计实验室基线和走查断言各量各的（属性 vs 渲染），互相打架（第 2 轮音频窄条断言已经冲突）。

### 4. 靶子独立性
三处顶栏图标、composer、参数条都是同一个原因，不是三个独立 bug。

### 5. P0：现成方案
- 不是领域独有：按钮决定图标尺寸是设计系统的常见做法（Mantine `Button` 的 `leftSection` 由按钮 size 定尺寸；Radix Themes `IconButton` 的 size 决定子图标；Tailwind UI 的按钮同样用容器类定 svg 尺寸）。
- 不加依赖，用现有 `ICON_TIER_CLASSES` 做容器类。

### 6. 对比表 + 推荐
| 选项 | 做法 | 代价 |
|---|---|---|
| **A 容器管（推荐）** | `WorkbenchButton` / `WorkbenchIconButton` 加 `iconTier`（默认 tool = 现在的 16/2），由 `ICON_TIER_CLASSES` 出 `[&>svg]` 类；容器里的图标**不许**传 size / stroke（加 lint 门岗）；只有不在容器里的裸图标才用 `ICON_TIERS` 属性 | 改设计系统按钮（默认档不变，存量按钮像素不变）；F1 这 5 个文件改成给容器传档位 |
| B 图标管 | 删掉按钮里的 `[&>svg]` 强制，所有按钮图标都传 `ICON_TIERS` | 全仓按钮图标都要补属性，漏一个就变 24px（Tabler 默认），改动面大 |
| C 不动 | 保留两套 | 本 PR 的顶栏 / composer 改动实际不生效 |

推荐 A：和仓库现有 20 处惯例一致，默认档不变所以存量不动，门岗能把「容器里的图标传尺寸」挡死。

**用户 2026-10-24 拍板：按钮说了算**（选 A）。落地见 `src/design/actions.tsx` 的 `iconTier` / `chevron`、`src/design/iconTiers.ts`、`check:icon-semantics` 规则四。

### 7. 用户要权衡的核心
图标多大，是**按钮说了算**（改一处按钮档位，里面的图标跟着变），还是**每个图标自己说了算**（灵活，但容器一有 CSS 就失效）。推荐按钮说了算。

## 特征测试清单（动结构前先锁住）
- 默认档按钮里的图标渲染 16/2（computed style，不是属性）。
- `iconTier="bar"` 的按钮里图标渲染 18/1.8；`corner` 13/1.8。
- lint：容器里的 Tabler 图标传 size / stroke → 红。
- 走查断言一律量渲染尺寸（getBoundingClientRect + computed stroke-width）。
