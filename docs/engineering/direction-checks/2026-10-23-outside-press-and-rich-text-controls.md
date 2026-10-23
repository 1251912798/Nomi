# 方向检查：点外面收不起 / 格式按钮点了没反应（2026-10-23）

> 触发：`node scripts/fix-churn.mjs` 命中——BaseGenerationNode.tsx（14 天第 6 个 fix）、TextDocumentNode.tsx（第 4 个）、ShellRail.tsx / useCanvasFrameActions.ts / TimelinePreview.tsx（第 3 个），目录 `src/design/`、`src/ui/app-shell/shell/`、`src/workbench/preview/`、`src/workbench/assets/`，概念「TipTap 编辑器的唯一入口」「按钮点开的浮层放在哪儿」。
> 来源：用户 2026-10-23 实测反馈，逃逸账本 `USER-20261023-outside-press-swallowed`、`USER-20261023-rich-text-controls-dead`。

### 0. 一句话根因

两类都是「同一件事各写各的」：「点外面就收」有十几份听法，「格式按钮」有三份清单、三种读状态和摆位置的方式；哪一份选错了事件、阶段或外壳，就在用户手里坏掉，而没有任何一层规定「只能怎么写」。

### 1. 归类表：bug → 直接原因 → 类

| bug（用户实测） | 直接原因 | 类 |
|---|---|---|
| 画布左下「⋯」点开后点画布中间不收 | AnchoredPopover 听 document 冒泡 mousedown；d3-zoom 在 mousedown 上 `stopImmediatePropagation` | A 点外面的听法 |
| 左栏抽屉、任务中心点画布不收（同查出） | Mantine `useClickOutside`（document 冒泡 mousedown）/ window 冒泡 mousedown | A |
| 文本节点「上面有格式功能但是无法使用」 | 格式条自写 absolute 定位，跟着画布缩放（300% 时放大三倍），节点贴顶时整条被顶栏盖住；不走节点浮条共享外壳 | B 格式按钮多份实现 |
| 格式按钮按下态不跟光标 / 空选区点「代码」没反应 | 编辑器关了按事务重渲，壳在渲染时读一次 `isActive`；创作区顶栏连按下态样式都没有 | B |
| 创作区「代码」等钮点不到 | 选区浮条（第三份格式清单）以整个编辑器为界摆位，选中第一行时盖在顶栏上 | B |
| 点「无序 / 有序列表」只看到整段右移 | Tailwind preflight 清掉 `list-style`，全局 CSS 只补了缩进 | B（按下去要看得见） |

近 14 天命中这些文件的 fix（`git log --since=2026-10-09`）：ce54ad6ac / cf340183e / ed77bae92 / 30dfd448a（BaseGenerationNode，各自是错误卡、图片源、空节点档位——与本类无关，热度来自巨壳本身）、7f19d701e / 58522640b（ShellRail 抽屉层级 / Esc，同属「浮层开合」）、5c57f29e2（文稿格式保存，同属 B）、a7cdc4664（AnchoredPopover 跟踪，同属「浮层」）。

### 2. 为什么这一类会一直出现

- **A**：「点外面」没有 owner。仓库里 25 处 document / window 按下监听，11 处捕获阶段（对）、11 处冒泡 pointerdown、3 处 mousedown，外加一处 Mantine `useClickOutside`。每个新浮层照着最近的那份抄；框架默认值（Mantine）恰好是会被 d3 吃掉的那种。没有测试点空白处去关浮层（`tests/ux/_shell.mjs` 只从「⋯」自己收起）。
- **B**：「一份定义两个壳」只做到了一半——`buildRichTextActions` 统一了清单，但「怎么读状态」「怎么摆」留给各壳；选区浮条另抄了第三份。编辑器为 React 19 选区稳定关掉了按事务重渲（`useNomiRichTextEditor` 正确的决定），壳却没换成订阅式读法。画布那一壳没走 `FloatingToolbarShell`（P1 收口时漏网的一条）。
- 铁律对照：落在 **⑫ 点了=以为的**——两类都是「点了，界面没给出用户以为的结果」。走查目录里没有「点画布空白收浮层」「点格式钮看正文变化」的 `userExpectation`，本次补了真机走查 `tests/ux/outside-press-and-text-format.walk.mjs`。

### 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 下一个用 Mantine `useClickOutside` 或 mousedown 写的浮层，画布上点不收 | 修前 `rg "addEventListener\('mousedown'" src` 有 3 处、`useClickOutside` 1 处；修后结构测试 `src/design/outsidePress.structure.test.ts` 红 |
| 第四个格式壳（例如分镜表提示词框加格式）再出一份清单，状态又不刷新 | 修后 `src/workbench/common/richTextActions.structure.test.ts` 在 owner 之外出现 `isActive('…')` / `toggleBold(` 就红 |
| 别的节点类型自写浮条，缩放后被顶栏盖住 | 现存自写 absolute 浮条：`NodeHoverTimelineHandle`（悬停把手，刻意不反向缩放）；新增的会在走查里暴露 |

### 4. 靶子独立性检查

- 尺子是用户实测 + 本线新写的真机走查；走查在修前构建（cad909708）上 1/10、只含第一个提交的中间构建上 3/10、修后 10/10（zh / en 两轨），截图本线逐张读过。修前失败点与用户描述一一对应（「⋯」不收、节点格式条点不到、按下态不变、悬停无提示）。
- 没有「修对了反而掉分」：打字性能同机对照修前 15.2 / 16.3ms、修后 16.1 / 16.6ms（预算 50ms）。

### 5. P0：这些是我们独有的吗？现成方案有哪些

- A：通用能力。现成方案是 Radix `DismissableLayer`（Radix Popover / Menu 自带，`onPointerDownOutside`）与 Floating UI `useDismiss`（官方文档 https://floating-ui.com/docs/useDismiss ，2026-10-23 经 Context7 核对：`outsidePressEvent` 默认 `'pointerdown'`，`capture.outsidePress` 默认 `true`）——本次的听法与它的默认值一致。我们的 AnchoredPopover 用 Floating UI 的 `autoUpdate` 做定位，没用它的 React 交互层；其余 10 处是散装 effect。
- B：格式按钮清单与「按下态订阅」用的是 TipTap 官方的 `useEditorState`（现成）；工具栏外壳复用我们自己的 `FloatingToolbarShell`（画布反向缩放 / 夹边是领域约束，已登记）。

### 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 11 处浮层全换 Radix Popover / Floating UI `useDismiss` | 每处浮层的开合、焦点、portal 都要重写，约 11 个组件 | 大：AnchoredPopover 已有焦点 / 让位规则（overlayLayers），换库要重新对齐 | 否（本次）；AnchoredPopover 以后整体换 Floating UI React 时，`listenOutsidePress` 一并删 |
| 补（本 PR） | A：新增唯一听法 `listenOutsidePress`（pointerdown 捕获，与 Floating UI 默认一致），迁 9 个文件 12 处，余 4 处（3 处冒泡 pointerdown + 1 处冒泡 click）冻结在基线；B：`useRichTextActions`（TipTap `useEditorState`）+ `RichTextActionButton` 一份定义三个壳，画布壳进 `FloatingToolbarShell` | 2 个新文件 + 2 份结构测试 | 小：行为只差在「点外面」先于目标处理器触发，判据不变 | **推荐** |
| 重写 | 浮层体系统一重写 | 大 | 大 | 否 |
| 删 | 删掉选区浮条里重复的四颗格式钮 | 小 | 产品取舍（用户说过底部功能累赘，但没拍到这一条） | 另议，不在本 PR |

### 7. 用户要权衡的核心

这次是「补一个唯一入口 + 门岗」而不是「整体换成 Floating UI 的交互层」：前者今天就把两类问题关死、改动面小；后者更彻底但要重写 11 个浮层，等 AnchoredPopover 下次大改时再做。

## 特征测试清单（动结构前先锁住）

- 修前现状：真机走查 `tests/ux/outside-press-and-text-format.walk.mjs` 在修前构建（cad909708）上 1/10（`docs/evidence/2026-10-23-rich-text-controls/walk-before-zh-CN.json` 与 before-*.png）；修后 10/10。
- `src/design/outsidePress.structure.test.ts`（类 A 普查，已验证对修前源码会红：AnchoredPopover / TaskCenterPanel 的 mousedown、AssetLibraryPanel 的冒泡 pointerdown）。
- `src/workbench/common/richTextActions.structure.test.ts`（类 B 普查）。
- 性能：`canvas-text-node-typing`（新登记）、`document-long-typing`（复跑）。

## 增补：最终验收之后（L-acc-opus-20261023，验收 HEAD 550ba434e）

- **应修 1，已修**：AnchoredPopover 的「被点外面关掉」标记只置真、不复位。调用方拒关时（ClipNode 上传中），后面按 Esc 或选一项关，焦点都会掉到 BODY。现在只记最近一下：用户回到浮层里按一下 / 按键，或按 Esc，就复位。真 Chromium 测试 `tests/ux/anchored-popover-focus.test.mjs` 遍历五种关法，修前后三条红，修后 5/5。
- **建议 2，已删**：NodeEffectChips、CanvasControlsHelpPopover 在自己的关闭里把焦点塞回触发钮，绕过了 AnchoredPopover 的规矩。两处都早于 2026-10-05 FocusScope 接管还焦点，属于留下的旧实现，同提交删掉。`outsidePress.structure.test.ts` 加了一条普查：渲染 `<AnchoredPopover anchorRef={x}>` 的文件不许出现 `x.current…focus(`。对修前两个文件跑过，两处都能认出。
- **存疑 7，按默认定了，事后报用户**：「点外面」按下即判定，所以在画布上拖动平移的起手也会收起抽屉和浮层；滚轮 / 触控板平移不产生 pointerdown，不收。不改成「原地点一下才收」，理由是：
  - 画布平移用的 d3-zoom 把「按下到松开移动超过 clickDistance」算拖动，并吞掉随后的 click。xyflow 12.11.5 给的 paneClickDistance 默认 1px（Nomi 没改）：独立验收 L-acc-opus-20261023 实测横移 1px 仍有 click，斜移 1px 或移动 2px 以上 click 就被吞。按下时稍一抖就可能被当成拖动，用户报的正是「点了没反应」，改成 click 判定会把它换个样子带回来。另一个选项是调大 paneClickDistance 再用 click 判定，代价是多一种听法，仍留给用户定。
  - 这样还要第二种听法，违背「只有一种听法」。
  - 与 Floating UI `useDismiss`、Radix DismissableLayer 的默认一致。

  代价：开着素材抽屉时用鼠标拖动画布找落点，抽屉会收起，要再点一下左栏重开。拍板图元素 `dismiss.outside-press` 的说明已写明。
