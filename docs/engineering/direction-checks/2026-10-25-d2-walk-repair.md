# 方向检查：D2 付费卡走查收尾（2026-10-25）

## 0. 一句话根因

D2 这条线把卡、指向元素和画布状态接到同一套生产件后，仍缺少「共享渲染边界必须可挂载、父卡已表达的决策状态不能在子元素重复表达」的结构性回归；因此错误分别以 renderer 运行时崩溃、覆盖层拦截走查手势和单卡重复小标的形式逃出。

## 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| `d58276026` 后首卡标题等待失败 | `AgentPanelV4SpendCardBody` 调用 `cn` 未导入，挂载付费卡时 renderer 抛 `ReferenceError` | 共享组件新依赖没有挂载回归 |
| 生成剩余 / 逐镜恢复点击失败 | 恢复覆盖层出现在缩略图中央，走查把中心当作 hover/click 目标，按钮反过来拦截定位动作 | 可点击目标的状态层与测试手势几何未对齐 |
| SpendCardQ1 单卡重复「等你确认」 | `NodePointer` 对 `card` 密度无条件渲染 `awaiting_confirmation`，没有父卡已表达决策状态的抑制契约 | 父子状态语义没有在共享指向元素边界收口 |

## 2. 为什么这一类会一直出现

这条线同时改生产组件、设计实验室和真实 Electron 走查；过去的组件单测覆盖纯投影，真实走查覆盖交互，但没有一条测试把「同一组件挂载 + 状态层覆盖 + 父卡文案去重」当成共享合同。问题属于体验铁律 ⑫「点了=以为的」：用户进入一格后，中央动作应可点且不改变定位目标；父卡问确认时，子格不应再次问同一件事。最小证据是 `tests/ux/design-lab-spend-card.walk.mjs` 的单格去重断言、`tests/ux/agent-spend-generate-remaining.walk.mjs` / `agent-spend-per-shot.walk.mjs` 的真实手势，以及 `NodePointer.test.tsx` 的 awaiting 状态渲染测试。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 新的 NodePointer 宿主会再次复制父级状态小标 | `rg -n 'awaiting_confirmation|data-node-pointer-status' src/workbench/ai src/devlab`，并跑 `node tests/ux/design-lab-node-pointer.walk.mjs` 与 `design-lab-spend-card.walk.mjs` |
| 新的 cellAccessory 会让中心覆盖层再次拦截定位或 hover | 在 `agent-spend-generate-remaining`、`agent-spend-per-shot` 中按真实格子边缘进入后点中央动作，观察 Playwright hit-test 失败 |
| 新增共享 helper 后会在 Electron chunk 才暴露未导入绑定 | `pnpm exec vitest run src/workbench/ai/v4/AgentPanelV4SpendCardBody.test.tsx` 加 `pnpm run build` 后跑首卡真实 Electron 走查 |

## 4. 靶子独立性检查

NodePointer 设计实验室与 SpendCard 走查分别提供静态状态和真实 Electron 交互，规则来自画布方案一注记与现有设计系统；它们不是同一条断言线。此次失败先由 renderer console 和实验室截图分别复现，再修代码与走查手势；没有通过放宽精确文案断言来消红。

## 5. P0：这些是我们独有的吗？现成方案有哪些

React、Playwright 和 `clsx`/`cn` 都是通用能力，继续使用现有组件、class combiner 和 Playwright hit-test。唯一自有部分是 Nomi 的「卡问决策、指向元素只呈现节点执行状态」语义，已登记在 `chat.node-pointer` 与 SpendCardQ1 板中，不能由通用 UI 库推断。

## 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 保持 React 组件、现有 `cn`、Playwright 与实验室走查 | 无迁移 | 无法表达父卡与子格的领域语义 |  |
| 补 | 在 NodePointer 共享边界增加 `suppressAwaitingConfirmation`，并为卡体挂载补静态渲染测试 | 少量 API 与测试 | 需所有宿主明确是否父卡已提问 | **推荐** |
| 重写（限一个模块） | 重写整套指向元素状态系统 | 大 | 破坏既有 NodePointer 板与真实走查 |  |
| 删 | 删除恢复覆盖层或等待状态 | 小 | 丢失方案一已拍板的恢复与节点状态可见性 |  |

## 7. 用户要权衡的核心

保留一个共享指向元素家，同时让父卡和子格各自只说自己拥有的那一层事实。

## 特征测试清单（动结构前先锁住现状）

- `src/workbench/ai/v4/AgentPanelV4SpendCardBody.test.tsx`：付费卡排除 accessory 可挂载，`cn` 缺失不能再到 Electron 才暴露。
- `src/workbench/ai/pointer/NodePointer.test.tsx`：付费卡显式抑制 awaiting 小标；默认 NodePointer 板仍保留等待状态。
- `tests/ux/design-lab-spend-card.walk.mjs`：中英单卡、组卡和 31 个方案一状态。
- `tests/ux/design-lab-node-pointer.walk.mjs`：独立 NodePointer 12 个状态，确保通用等待小标没有被付费卡规则误删。
- `tests/ux/agent-spend-generate-remaining.walk.mjs`、`agent-spend-stop-midway.walk.mjs`、`agent-spend-per-shot.walk.mjs`：真实 Electron 中英手势与生成/停止/逐镜闭环。
