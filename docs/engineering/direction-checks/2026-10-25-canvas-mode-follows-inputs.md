# 方向检查：画布生成方式跟随输入

### 0. 一句话根因

模式是输入的派生事实，却被拆成生成框挂载时的 React effect、连线后的局部派生和提交前兜底，任何不经过生成框的输入减少都能留下过期 modeId。

### 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| pb02 C 段：生成框收起时断开最后参考线仍停在参考方式 | `useRevertToTextMode` 只在组件 effect 运行 | 输入变化后的派生状态没有共享写边界 |
| 删除参考源 / Agent 改参考后提交前检查与画布状态不一致 | 删除、Agent、恢复走 store/文档写口，未调用回文生规则 | 同类输入写入口缺少统一收敛 |

### 2. 为什么这一类会一直出现

模式既是持久化字段又是由 nodes/edges/参考槽计算出来的派生结果；当前代码让不同调用者各自决定何时修正。组件 effect 只能看到挂载的节点，无法覆盖断线、删源、Agent、撤销/重做、导入恢复。结构上缺少一个对所有 store 写入都可见的共享收口，所以每新增一个写口就可能漏一次。

| 铁律 | 类根因要回答的问题 | 最小证据 |
|---|---|---|
| ⑩ 说的=摆的 | 生成方式字段是否与当前可消费的输入逐项一致？ | `resolveModeForConnectedReferences` 与 `resolveReferenceSlots`；本 PR 类测试 |
| ⑪ 能选到 | 参考模式判据是否由同一份档案槽声明覆盖连线与写入口？ | `referenceEdgeCapability.ts`、`referenceWrites.ts` 门图 |
| ⑫ 点了=以为的 | 断线/重连后用户看到的 mode 是否与 store 后态一致？ | `tests/ux/group-reference-direction.walk.mjs` 截图 |

### 3. 不改结构的话，接下来会冒出什么（2–3 个可验证预测）

| 预测 | 怎么验证 |
|---|---|
| 新的 Agent/导入写口会让节点停在无输入的参考方式 | 对所有 `updateNode`/`restoreSnapshot` 门做输入减少矩阵，生成框不挂载时读 mode |
| 撤销一次只恢复边或只恢复 mode | 运行 `canvasModeFollowsInputs.test.ts` 的 undo/redo 反例 |
| 提交前和 UI 的模式会出现一拍差异 | 在生成框收起后立即读取 store，再调用提交咽喉比较 modeId |

### 4. 靶子独立性检查

评测尺子是已有的 archetype 槽声明和 store 后态，走查由验收线执行；实现线只提供类测试和截图。没有发现同类“修对了反而掉分”的记录；若截图与槽声明冲突，以槽声明和真实提交输入为准并记入逃逸账本。

### 5. P0：这些是我们独有的吗？现成方案有哪些

React、ComfyUI、Blender 都提供通用节点/状态操作，但“参考边按 Nomi 模型档案模式升格、空参考回文生”是 Nomi 的领域规则，必须保留 `resolveModeForConnectedReferences` 与 `textModeToReturnTo`；通用的 effect 同步不再自写。

### 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 用 Zustand store 写口和现有 archetype 判据，统一调用一个 reconcile 函数 | 需要核全写入门 | 低 | **是** |
| 补 | 保留 effect，再给断线/删源各补调用 | 每个新门都要补一次 | 会继续漏门 | 否 |
| 重写（限一个模块） | 重写整个节点状态模型 | 范围过大 | 引入回归 | 否 |
| 删 | 删除回文生规则 | 参考方式会残留 | 直接退化 | 否 |

### 7. 用户要权衡的核心

用一个 store 收口换取所有输入写口的一致性，代价是系统纠偏成为一次可观察的节点写入；这是保留可提交状态正确性的必要取舍。

## 特征测试清单（动结构前先锁住）

- `src/workbench/generationCanvas/store/canvasModeFollowsInputs.test.ts`：先钉住当前 effect 只能在挂载组件时纠偏、store 断线后仍残留 mode 的现状，随后同一测试改为断线/删源/Agent/恢复/undo 的类回归。
- `src/workbench/generationCanvas/agent/referenceEdgeCapability.test.ts`：保留并扩展纯函数升格判据。
