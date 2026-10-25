# 方向检查：参考上传授权范围

## 0. 一句话根因

异步参考上传把 Nomi 自己的项目 / Run 投影写入混进了用户授权范围判据，两个宿主各自补整版 revision 比较，导致同一类 self-write stale 反复出现。

## 1. 归类表

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 用户复现：真实延迟参考上传后确认被 `generation_reference_scope_changed` 拒绝 | appIntegration 与 mcpStdioServer 各自比较 project.revision + Run.revision | 异步授权范围与投影 revision 没有共享语义边界 |

## 2. 为什么会一直出现

授权信封的用户事实是项目绑定、候选 / 参考身份和选中镜头 Run 语义；画布节点绑定、缓存投影和 revision 是 Nomi 的实现投影。把两层压成一个数字后，任何异步 provider、文件 watcher 或 canvas landing 都可能制造假陈旧。

| 铁律 | 结论 | 最小证据 |
|---|---|---|
| ⑩ 说的=摆的 | 参考身份与候选内容必须与送审范围一致；revision 不是用户意图 | `generationReferenceScope.test.ts` 的候选 / 参考变化拒绝与 self-write 通过 |
| ⑪ 能选到 | 不适用；本修复不改模型档案入口 | `productionReferenceUrls.test.ts` 只验证既有上传合同 |
| ⑫ 点了=以为的 | 用户点确认后，只有范围真的变了才拒绝 | MCP-L2 C9 取消 / 重试与 C9 gate 证据 |

## 3. 不改结构的可验证预测

| 预测 | 验证 |
|---|---|
| 任一宿主仍复制整版 revision 比较，延迟上传的 self-write 测试会红 | `generationReferenceScope.test.ts` legacy whole-revision 反例 |
| 只修 App、遗漏 authenticated MCP 会留下第二个入口 | `node scripts/door-map.mjs prepareAuthorization` 与 `check:concept-owners` |
| 保留立即 URL fixture 会掩盖异步窗口 | `rg NOMI_E2E_FIXTURE_REFERENCE_URL tests/ux electron src`；MCP-L2 必须命中 `/v1/uploads/images` |

## 4. 靶子独立性检查

MCP-L2 走查和 loopback 上传夹具是独立于 guard 实现的请求 / UI 证据；Vitest 只验证语义快照。真实供应商扣费不在本分支执行，合并前由协调会话跑一次。

## 5. P0：独有部分与现成方案

multipart、HTTP、MCP 握手和传输均沿用现有库 / SDK。自写只保留领域约束：Nomi 必须区分“用户批准范围”和“自有投影 revision”。`mcp-protocol` 自写登记仍是 to-replace；本修复不重写协议层，因 guard 是生产授权领域判断，不是协议实现。

## 6. 接入 / 补 / 重写 / 删

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 继续使用官方 MCP TypeScript SDK v2 与现有 multipart / fetch | 无法表达 Nomi 的候选 / Run 语义快照 | 把领域判据交给通用库会丢用户边界 | 用于传输，已接入 |
| 补 | 在共享 guard 集中语义快照 | 一个小的领域 owner | 需覆盖两个宿主 | **推荐** |
| 重写 | 重写授权 / MCP 协议层 | 大范围回归与迁移 | 超出本 bug 的领域约束 | 不选 |
| 删 | 删除 stale 保护 | 可能把用户改动误发到供应商 | 付费安全回退 | 不选 |

## 7. 用户要权衡的核心

等待上传期间允许 Nomi 自己的投影变化，换取不误伤批准；真正用户改变候选、参考或 Run 状态仍必须停下。

## 特征测试清单

- `electron/capabilityCore/generationReferenceScope.test.ts`
- `electron/capabilityCore/productionReferenceUrls.test.ts`
- `pnpm exec node tests/ux/mcp-l2-journeys.e2e.mjs`
- `node scripts/check-root-cause-contracts.mjs`
- `pnpm run check:concept-owners`
