# 方向检查：MCP 画布写操作接全（2026-10-17）

触发：`node scripts/fix-churn.mjs electron/capabilityCore/mcpProtocol.ts` 命中自写登记 `mcp-protocol`（to-replace，近 30 天第 31 个 fix）。任务书（F-mcp，协调 10-17）已定「接上，不丢功能」，并预见带 `Direction-Check:` trailer。本文是同日 `direction-check-2026-10-17-mcp-host-reliability.md` 的同一登记条目 `mcp-protocol` 的补充，只回答这一刀。

### 0. 一句话根因

画布写的「有哪些操作」和「每个操作走哪条传输」是两份手写名单，加操作的人只改了前一份；缺的是把两者绑成一张必须覆盖全集的表。

### 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 摆位 / 运镜两个操作回 capability_unsupported（V-3dbox，#1221 已修） | 主进程只把 patch_shots 送渲染端 | 操作名单与路由名单分写 |
| tidy_canvas / propose_storyboard_plan / arrange_storyboard_to_timeline / set_node_text 同样回 unsupported（D-3dbox 第五轮） | 同上；#1221 只补了当时发现的两个，把另外 4 个记成「冻结只许减」的旧账 | 同上 |

### 2. 为什么这一类会一直出现

#1221 把路由收成「两份名单」（无头 / 渲染端），门岗 `mcpCanvasWriteRoutes` 只比对**工具说明里写着的**操作，并容许一份冻结的旧账；于是新增操作仍然是「先上面、再有人想起补名单」。铁律 ⑩⑪⑫ 均不适用。

### 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 下一个新加的画布写操作又一次上了工具面却没路由 | 现在加进 `CanvasWriteOperation` 却不在 `CANVAS_WRITE_OPERATION_ROUTES` 里，`tsc` 当场红（已用变异验证：删一行即报 TS1360） |

### 4. 靶子独立性检查

尺子来自 D-3dbox 第五轮用官方 SDK 实调的发现，不是本线写的；本线测试同样走官方 SDK 客户端实连本机链路。

### 5. P0：这些是我们独有的吗？现成方案有哪些

路由表属于「Nomi 画布操作怎么落账」的领域，不是通用能力；协议与传输由官方 MCP SDK v2 承担（登记 `mcp-protocol`，见同日另一份复盘），本刀不新增任何协议代码，只把两份名单收成一张类型约束的表。

### 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 无适用的现成库（领域内的操作路由） | — | — | 不适用 |
| 补 | 再往渲染端名单里加 4 个名字 | 最小 | 下次又漏（第 31 个 fix） | 否 |
| 重写（限一个模块） | 把两份名单收成一张 `Record<CanvasWriteOperation, route>` 表，两份名单从它派生 | 小 | 低（行为只多了 4 个操作的路由） | 是（已做，同时清零旧账） |
| 删 | 把 4 个操作从对外面拿掉 | 丢功能 | 协调已定不丢 | 否 |

### 7. 用户要权衡的核心

对外 MCP 上，新接通的分镜方案与「排进时间轴」两个写入，我们沿用 patch_shots 的做法：客户端能弹确认时先问一次（拒绝则不写）；整理画布与文本节点正文不问（和已有的 set_node_prompt 一样）。

## 特征测试清单（动结构前先锁住）

- `electron/capabilityCore/mcpCanvasWriteRoutes.test.ts`（工具面 × 路由）、`mcpDirectorReferenceOps.sdk.test.ts`（官方 SDK 实调）、`src/workbench/capability/mcpDirectorReferenceOps.test.ts`（渲染端执行）、`mcpStoryboardPatchConfirm.test.ts`（先问再写）、`mcpCanvasWriteHeadlessFallback.test.ts`：均已覆盖；其中 4 个新操作的用例改前是红的。
