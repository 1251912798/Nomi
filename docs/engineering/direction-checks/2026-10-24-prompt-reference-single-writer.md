# 方向检查：提示词预设参考图单一写入边界（2026-10-24）

### 0. 一句话根因

生成框和「放上画布」各自编排参考图落槽，入口数量随功能增长，导致同一提示词预设在不同入口得到不同的槽位、去重和无槽反馈。

### 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| I-libraries-r3：生成框 `applyPromptPickerItem` 内联参考图写入 | 生成框没有调用已存在的 `applyPromptReferenceImages` | 参考图落槽多写入口 |
| I-libraries-r2：库 prompt 参考图在部分入口被静默丢弃 | 文字入口和画布入口的落槽编排不共享 | 参考图写入边界不集中 |

### 2. 为什么这一类会一直出现

功能入口直接持有「选模式、选槽、去重、写 meta」的细节，新增入口只需复制一段逻辑即可通过局部测试，却不会自动继承另一个入口后来补上的存储模型和边界。此次修复把生成框收口到 `promptReferenceImages.ts`；该函数再调用 `withUnplacedArrayReferences`、`resolveModeForReferenceDemand` 和 `addAssetUrlToNode`，因此槽位选择、列表存储、去重和不支持结果只有一个生产边界。

| 铁律 | 结论 | 最小证据 |
|---|---|---|
| ⑩ 说的=摆的 | 适用；提示词预设的参考图意图必须与节点实际参考列表一致 | `promptReferenceImages.test.ts`；`nodePromptPresets.test.ts` 约束生成框调用同一 writer |
| ⑪ 能选到 | 不适用；本次不增加模型参数入口 | — |
| ⑫ 点了=以为的 | 适用；选中预设后应按「放上画布」同一套落槽结果写入节点 | `library-layout.walk.mjs` 的 add-to-canvas 回执；表达包走查的画布节点检查 |

### 3. 不改结构的话，接下来会冒出什么（2–3 个可验证预测）

| 预测 | 怎么验证 |
|---|---|
| 新入口会再次复制参考图落槽代码，出现模式或容量差异 | `rg -n "addAssetUrlToNode\\(.*image|resolveModeForReferenceDemand" src/workbench/generationCanvas`；新增入口应只调用 `applyPromptReferenceImages` |
| 无模型节点会在某入口丢参考图、另一入口能暂存 | `pnpm exec vitest run src/workbench/generationCanvas/nodes/promptReferenceImages.test.ts`，覆盖无模型暂存和首次选模需求 |
| 参考图列表重构后旧入口会继续写旧槽键 | `pnpm run typecheck` 与 `check:root-cause-contracts`；检查 writer 只经 `referenceList` / `archetypeArrayValues` |

### 4. 靶子独立性检查

本次靶子是代码单源约束和节点结果，不以走查脚本自身的视觉发现作为唯一 oracle。`promptReferenceImages.test.ts` 是纯函数测试，`nodePromptPresets.test.ts` 独立检查生成框源码只保留共用 writer 调用；真实 Electron 走查只验证用户闭环和已知弹层超时。

### 5. P0：这些是我们独有的吗？现成方案有哪些

参考图如何按 Nomi 模型档案、模式、槽位和费用边界落入节点，是 Nomi 领域约束；React / Zustand / Vitest 等通用能力继续复用现有实现。本次没有引入新依赖。

### 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 让生成框调用 `promptReferenceImages.ts` 的现有共享 writer | 改动小，保留既有测试 | 需要维护共享函数合同 | **推荐** |
| 补 | 在生成框继续补齐内联分支 | 短期少改文件 | 继续制造第二套规则 | 不选 |
| 重写 | 同时重写画布、生成框和列表存储 | 影响面大 | 超出本轮任务，容易改变已验证行为 | 不选 |
| 删 | 删除生成框自己的参考图编排，保留共享边界 | 删除约 20 行，需补调用测试 | 若共享边界不完整会暴露测试缺口 | 与接入同时执行 |

### 7. 用户要权衡的核心

保留每个入口的局部便利，还是让所有入口接受同一套参考图落槽、存储和失败语义；本轮选择单一共享边界。

## 特征测试清单（动结构前先锁住现状）

- `src/workbench/generationCanvas/nodes/promptReferenceImages.test.ts`：无模型暂存、已选模型自动切模式、无参考槽返回 unsupported、去重。
- `src/workbench/generationCanvas/nodes/nodePromptPresets.test.ts`：生成框提示词预设入口调用 `applyPromptReferenceImages`，不再直接调用 `addAssetUrlToNode`。
- `pnpm exec vitest run src/workbench/generationCanvas/nodes src/workbench/library src/workbench/promptLibrary`：221 个文件 / 1896 条通过。
- `pnpm run typecheck`、`pnpm run build`：通过。
