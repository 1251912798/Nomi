# 方向检查：导演台参考删除共享边界

## 0. 一句话根因

参考删除、模式自动回收和预演对账分属相邻入口，过去没有把「用户删掉后只在下一次出成片重挂」作为同一个生命周期不变式，所以每轮修补都容易只补一个入口。

## 1. 归类表

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 2026-10-25 B 走查 | 视频 / 音频数组没有清理 prompt @；删除后自动回收方式触发对账器重新挂接 | 参考生命周期写入与模式派生没有共享删除事实 |

## 2. 为什么会一直出现

`removeFromArray` 是参考删除的唯一 owner，但旧实现只对图片数组清理 mention；`useRevertToTextMode` 把空参考自动切回文生，而 `previewAttachReconciler` 把模式变化当成模型变化，于是系统自己的回收被当成用户换模式。类根因落在 ⑫「点了=以为的」：用户点 × 的期望是删除并保留 attached 标记，实际经历了删除、系统切模式、自动重挂三段。

最小证据：`referenceWrites.director.test.ts` 的 3 来源 × 3 媒体矩阵；`directorProduce.reference.test.ts` 的 B3 回文生 / 方式切换 / 变体身份测试；真实 `director-reference-attach.walk.mjs` B 删除后数组为空、B2 才重新挂接。

## 3. 不改结构的可验证预测

| 预测 | 验证 |
|---|---|
| 视频 / 音频删除后会留下孤儿 @ 标记 | `referenceWrites.director.test.ts` 媒体矩阵 |
| 自动回收模式会让预演对账器立即重挂 | 中文走查 B 删除后的同步节点状态 |
| D 无槽→有槽切换可能被错误阻止 | 中文 / 英文走查 D 直接点 ↑ |

## 4. 靶子独立性检查

底层 Vitest 与 Electron 走查是两条线；走查只录请求并拒绝上游，不调用真实生成。变异副本从 `git archive HEAD` 还原旧写法，5 个用例重新变红，证明测试没有只镜像新实现。

## 5. P0：现成方案

参考槽来源判定、提示词 mention 清理和 React 状态写入均已有仓库 owner：`decideArrayReferenceRemoval`、`removeMention`、`useGenerationCanvasStore.updateNode`。不新增通用库或供应商分支；领域约束只保留在参考生命周期 owner。

## 6. 接入 / 补 / 重写 / 删

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 复用 `removeFromArray` 的统一清理，并把对账键收成供应商、模型键、档案 id 三段身份 | 无新依赖 | 需要把变体只改参数、不改槽形状写成档案约束 | **推荐** |
| 补 | 在对账器里继续为每种方式或删除状态补条件 | 改动少 | 再次按状态猜意图，未来方式仍会漏 | 不选 |
| 重写 | 重做整套参考状态机 | 范围过大 | 破坏现有边 / 上传契约 | 不选 |
| 删 | 删除系统自动回文生或整个预演对账 | 破坏 B3 或换模型自动重挂 | D 场景 / 空参考规则退化 | 不选 |

## 7. 用户要权衡的核心

对账器到底把什么变化当成“换模型”：若继续把方式变化算进去，B3 的系统回收会把刚删的预演立即挂回；若完全不对账，换模型后预演会失真。本次选择只认供应商、模型键、档案 id，保留 B3 空参考回文生，删除后的预演只在下一次真实出成片时重挂。

## 8. 拍板

已拍板的产品方向是两条同时成立：参考删空后方式仍由输入决定，按 B3 回到文生；预演对账只在模型身份改变时重挂，系统回文生、用户切换生成方式或切换同档案变体都不能触发它。变体档案当前只叠加参数，不改变参考槽形状，因此不算换模型。

## 特征测试清单

- `src/workbench/generationCanvas/nodes/controls/referenceWrites.director.test.ts`
- `src/workbench/generationCanvas/nodes/controls/generationModePresentation.test.ts`
- `NOMI_WALK_OFFSCREEN=1 NOMI_WALK_LANG=zh-CN node tests/ux/director-reference-attach.walk.mjs`
- `NOMI_WALK_OFFSCREEN=1 NOMI_WALK_LANG=en node tests/ux/director-reference-attach.walk.mjs`
