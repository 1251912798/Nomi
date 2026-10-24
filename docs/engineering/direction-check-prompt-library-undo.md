# 方向检查：我的库提示词删除撤销

## 0. 一句话根因

删除动作没有由 owner 保证“先拿到完整快照，再删除，再恢复”，提示词恢复还借用了新增通道；技能导出备份失败时也没有阻止删除，因此同类入口会产生字段丢失或空撤销。

## 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| F-prompt-undo：我的库提示词删除后撤销丢参考图和标签 | `handleDelete` 的撤销调用 `user.add` 只传三字段，新增生成新 id | 删除撤销没有共享快照契约 |
| F-prompt-undo-r2：技能删除备份为空仍删除 | `SkillLibraryContent.handleDelete` 未区分空/抛错的 exportPackage 结果 | 删除前完整快照没有 fail-closed 闸 |

## 2. 为什么这一类会一直出现

数据 owner 在主进程 JSON 存储层，删除和恢复却分别被调用方拼接；技能包 owner 在目录导出层，删除前也没有把“备份成功”作为前置条件。这个方向会让未知字段、跨窗口并发和空快照持续成为静默丢失点。问题属于铁律 ⑫「点了=以为的」：用户点击撤销的预期是“原记录回来”，实际可能是“新记录按三字段重建”或“提示撤销但没有包”。本轮证据是 `userPromptStore.test.ts`、`promptLibraryIpc.test.ts`、`promptLibraryApi.test.ts` 和 `deleteSkillWithUndo.test.ts`。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 新增字段后撤销再次静默丢失 | 在 JSON 加入 futureField，运行 `pnpm exec vitest run electron/promptLibrary/userPromptStore.test.ts` |
| 另一个提示词删除入口复制三字段重建 | `rg -n "user\\.add\\(|onUndo:.*add|deleteUserPrompt|user-restore" src electron`，结果必须只有完整快照恢复路径 |
| 技能导出失败仍继续删除 | `deleteSkillWithUndo.test.ts` 对空返回和抛错分别断言 remove/toast 均未调用 |
| 参考素材 owner 误被提示词删除牵连 | 删除带 `nomi-local://` 引用的提示词并检查项目素材文件仍存在 |

## 4. 靶子独立性检查

存储单测覆盖主进程记录语义，IPC 单测覆盖独立 channel 与 sender guard，API 单测覆盖 renderer 映射，技能 helper 单测覆盖删除前置；避免只由面板测试自证。没有评测 oracle 或回滚先例；真实 Electron 窗口由协调线独立验收。

## 5. P0：这些是我们独有的吗？现成方案有哪些

完整快照删除/恢复是本地用户库的领域约束，现有 `showUndoToast` 已提供撤销窗口，原子 JSON 写入也已存在。引入通用 undo 库不能替代跨 IPC 的记录 owner，因此当前不新增依赖；若未来提示词库与项目/技能库统一历史，再评估复用统一命令日志。

## 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 复用现有 `showUndoToast` 与原子 JSON store（`src/utils/showUndoToast.ts`、`electron/promptLibrary/userPromptStore.ts`） | 无新依赖 | 仍需维护 IPC 快照字段 | 推荐 |
| 补 | 在现有 store 增加 delete/restore 成对操作，并为技能删除补共享备份前置 | 增加独立恢复 channel 和一个纯逻辑 helper | 新调用方仍需走共享边界 | 本次采用 |
| 重写（限一个模块） | 为所有库建立统一命令日志 | 迁移格式和历史语义大 | 范围远超本 bug | 不推荐 |
| 删 | 去掉撤销 | 失去用户明确控制 | 不能满足任务目标 | 不采用 |

## 7. 用户要权衡的核心

要的是“撤销原记录”，所以完整性必须由存储边界保证；代价是恢复必须接受并保存整份快照，而不是继续允许面板自由拼对象。

## 特征测试清单（动结构前先锁住现状）

- `electron/promptLibrary/userPromptStore.test.ts`：删除返回快照、id/tags/referenceImages/updatedAt/futureField 全量恢复、无撤销时记录移除且引用文件不被误删。
- `electron/promptLibrary/promptLibraryIpc.test.ts`：独立 user-restore 注册、sender guard、字段矩阵和 futureField 原样传递；user-add 源码不再接受 restoreSnapshot。
- `src/workbench/api/promptLibraryApi.test.ts`：renderer 映射保留 futureField，删除快照经 user-restore 回传。
- `src/workbench/skillLibrary/deleteSkillWithUndo.test.ts`：技能备份为空/抛错时不删除、不出撤销提示，成功时撤销使用同一快照。
- 变异证据：`git archive HEAD` 导出副本，叠加本轮新增测试并把生产代码退回旧写法；记录两层恢复和技能失败路径的红格数。

## 8. 同类入口普查（本轮）

| 入口 | 撤销靠什么恢复 | 快照是否在删之前保证拿到 | 结论 |
|---|---|---|---|
| `PromptLibraryContent.handleDelete` | `userPromptStore.restoreUserPrompt` 写回原记录 | 是，`deleteUserPrompt` 返回完整 `deleted` | 本轮改为独立 `user-restore` |
| `SkillLibraryContent.handleDelete` | `exportPackage` → `importPackage` | 是，`deleteSkillWithUndo` 对空/抛错 fail closed | 本轮修复 |
| `DocumentListSidebar.onDeleteStoryboard` | `restoreStoryboardDesign(removed, documentId, index)` | 是，删除前抓 `removed/index` | 已满足 |
| `StoryboardPlanEditor.deletedPlanUndoRef` | `restoreStoryboardDeletion` | 是，`deleteStoryboardRows` 同步生成完整 deletion | 已满足 |
| `useCanvasShortcuts` 批量删除 | canvas store undo snapshot | 是，删除 API 内先记 undo | 已满足 |
| `deleteAssetResult` / `NodeVersionCardsHost` | canvas undo journal + 延后文件删除 | 是，先 `pushUndoSnapshot` | 已满足 |
| `PromptLibraryPanel.handleSendToCanvas`、`NodeGenerationComposer.applyPromptPickerItem` | 节点删除或 prompt 原文回写 | 是，创建前/编辑前保存目标 | 属于新增/编辑撤销，不是删除快照缺口 |
| `CategoryTree` 两个 copy 入口、`SkillLibraryPanel` 两个 apply 入口 | 删除刚创建的副本或回写 `before` | 是，副本/旧文本在动作返回前已持有 | 属于新增/编辑撤销，不是删除快照缺口 |

结构性结论：提示词恢复和技能删除现在各自拥有明确的共享边界；统一库级命令日志属于后续方向决策，不在本修复中扩展。

## 9. 协调收尾（2026-10-24）

- `electron/promptLibrary/promptLibraryTypes.ts`：门岗收尾把类型挪进 `electron/shared/contracts/promptLibrary.ts` 后，这个文件只剩一行没人引用的转出口；协调在同一分支把整个文件删掉（改法是「删」，不留兼容层）。方向检查按文件口径算它 14 天第 3 个 fix，三次都是本 PR 自己的提交，文件删掉后不会再被补；和 `src/desktop/bridge.ts` 一起交用户拍板。
- 真 App 验收 V-prompt-undo 有条件通过：用户报的路径（带参考图和标签的提示词删除 → 撤销）逐字段一致、重启仍在，技能备份失败不删并提示。同时测出同一类的三处：技能撤销走「导出文本包 → 再导入」，带非文本文件的技能撤销后少文件、脚本权限位不保留（改前就这样）；提示词撤销送回的是渲染层规范化后的副本，无标签记录多出空 `tags`；删除 / 撤销失败界面不提示。类是「撤销放回的是加工过的副本，不是原件」，方向是主进程删除时留原件、撤销原样挪回；这条线已两轮，第 3 轮按 P1 先交用户定方向，另立任务，不在本 PR 里补。
