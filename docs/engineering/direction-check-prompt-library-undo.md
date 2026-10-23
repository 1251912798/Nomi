# 方向检查：我的库提示词删除撤销

## 0. 一句话根因

删除动作没有由存储 owner 产生可恢复的完整快照，撤销只能在面板里按当前已知字段重新新增，因此每次字段扩展或新增入口都可能继续丢数据。

## 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| F-prompt-undo：我的库提示词删除后撤销丢参考图和标签 | `handleDelete` 的撤销调用 `user.add` 只传三字段，新增生成新 id | 删除撤销没有共享快照契约 |

## 2. 为什么这一类会一直出现

数据 owner 在主进程 JSON 存储层，删除却只返回列表；恢复语义被推给 renderer 面板，面板只能凭当时知道的字段拼对象。这个方向会让未知字段、跨窗口并发和未来字段持续成为静默丢失点。问题属于铁律 ⑫「点了=以为的」：用户点击撤销的预期是“原记录回来”，实际是“新记录按三字段重建”；当前最小证据是 `electron/promptLibrary/userPromptStore.test.ts` 的完整字段恢复断言与 `src/workbench/api/promptLibraryApi.test.ts` 的 IPC 往返断言。⑩/⑪ 不适用：没有模型参数或入口参数清单。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 新增字段后撤销再次静默丢失 | 在 JSON 加入 futureField，运行 `pnpm exec vitest run electron/promptLibrary/userPromptStore.test.ts` |
| 另一个提示词删除入口复制三字段重建 | `rg -n "user\\.add\\(|onUndo:.*add|deleteUserPrompt" src electron`，结果必须只有快照恢复路径 |
| 参考素材 owner 误被提示词删除牵连 | 删除带 `nomi-local://` 引用的提示词并检查项目素材文件仍存在 |

## 4. 靶子独立性检查

存储单测和 API 单测分别覆盖主进程记录语义与 renderer IPC 映射，避免只由面板测试自证。没有评测 oracle 或回滚先例；真实 Electron 窗口由协调线独立验收。

## 5. P0：这些是我们独有的吗？现成方案有哪些

完整快照删除/恢复是本地用户库的领域约束，现有 `showUndoToast` 已提供撤销窗口，原子 JSON 写入也已存在。引入通用 undo 库不能替代跨 IPC 的记录 owner，因此当前不新增依赖；若未来提示词库与项目/技能库统一历史，再评估复用统一命令日志。

## 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 复用现有 `showUndoToast` 与原子 JSON store（`src/utils/showUndoToast.ts`、`electron/promptLibrary/userPromptStore.ts`） | 无新依赖 | 仍需维护 IPC 快照字段 | 推荐 |
| 补 | 在现有 store 增加 delete/restore 成对操作 | 改动 5 个产品文件 | 若调用方绕过 store 会回归 | 本次采用 |
| 重写（限一个模块） | 为所有库建立统一命令日志 | 迁移格式和历史语义大 | 范围远超本 bug | 不推荐 |
| 删 | 去掉撤销 | 失去用户明确控制 | 不能满足任务目标 | 不采用 |

## 7. 用户要权衡的核心

要的是“撤销原记录”，所以完整性必须由存储边界保证；代价是恢复必须接受并保存整份快照，而不是继续允许面板自由拼对象。

## 特征测试清单（动结构前先锁住现状）

- `electron/promptLibrary/userPromptStore.test.ts`：删除返回快照、id/tags/referenceImages/updatedAt/futureField 全量恢复、无撤销时记录移除且引用文件不被误删。
- `src/workbench/api/promptLibraryApi.test.ts`：renderer 映射保留 futureField，删除快照经现有 user-add restore envelope 回传。
- 变异证据：`git archive HEAD` 导出副本并叠加两份新测试，基线生产代码产生 4 个失败测试；因此测试先红后绿。

结构性结论：本次先固定存储 owner 的快照不变量；统一库级命令日志属于后续方向决策，不在本修复中扩展。
