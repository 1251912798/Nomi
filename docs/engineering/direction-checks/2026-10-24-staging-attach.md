# 方向检查：站位参考图接目标镜头（2026-10-24 导演台走查 ⑤）

日期：2026-10-24。线：I-director-fixes（实现）。性质：fix。
任务书把 ⑤ 放在「文件本身不是热点」那一批；开工跑 `node scripts/fix-churn.mjs`，有两个文件按**目录 / 词典功能键口径**命中，文件本身都没命中。按任务书「结果不一样就按第二批办」，先写这页。

| 单位 | 近 14 天 | 本次碰不碰 |
|---|---|---|
| `generationCanvas/agent/applyCanvasToolCall.ts` | 文件本身 0；目录 `generationCanvas/agent/` 5 个 fix（3 个文件） | 碰：站位回执那半句换成判据给的话 |
| `i18n/locales/director.ts#agent` | 3 个 fix（全是预演挂接） | 碰：加两句提示文案 |
| `director/agent/createStagingReferenceNode.ts` | 0 | 碰：判据 + 写边门住这里 |
| `director/agent/StagingCaptureHost.tsx` | 0 | 碰：改调写边门 |

## 0. 一句话根因

「能不能接」和「接」分在两处，接的结果却没人回报。写边总闸（`connectNodes` 里的 `validateReferenceEdge`）拒边时只是不写、返回 `void`。站位这条链的两半都默认接上了：
- 工具受理时，Agent 回执无条件说「并连到镜头作 composition_ref」；
- Host 出图后连一下就走，不看结果。

工具栏默认图片模型只吃文字，于是用户以为接上了，其实没有。

## 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| `949e364bb` `d8575797b` 视频比例默认值 | 默认值有多个出处、挂载时改写 | 画布默认值口径 |
| `03c4f99e8` Agent 选的变体落画布 | 候选 → 节点投影丢字段 | 投影表 |
| `148df3d6f` `6ec6983b8` 分镜 shotKind 默认 | 说明文字与常量各写一份 | 说明与常量两份 |
| `66e1fc74b` `e65ffa7d4` `aafea7949`（director.ts#agent） | 预演挂接按旧现状判、过期没挡 | 预演挂接时效 |
| 本次 ⑤ 站位图静默没接上 | Host 不看连线结果；回执照预设许诺 | 写边结果不回报，上游各自假设 |

目录热和词典热都不是站位这个概念带来的。本次是这一族里唯一一条站位的 fix。

## 2. 为什么这一类会一直出现

写边总闸只有一扇，所有写边的人都过它（手拖、点「+」、@、Agent、MCP、自动引用），这是对的。代价是：要对用户说「接上了」的调用方，必须自己读回结果。

| 调用方 | 读不读回结果 |
|---|---|
| 手拖连线（`completeNodeConnection`） | 读，接不上给提示 |
| Agent 的 `connect_canvas_edges` | 先判，跳过的边回报 `skippedEdges` |
| @ 引用（`useNodeMentionSource`） | 先判 |
| 运镜 / 预演 | 有自己的门 `attachCameraMoveForNode`，带结果 |
| 站位（修前） | 唯一既不判也不读回的写边方 |

这一条落在铁律 ⑫「点了 = 以为的」：Agent 说的和画布上发生的不一致。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 目标镜头换成只吃文字的模型以后，再调 create_staging_reference，回执照样说「连到镜头」 | 修前：`applyCanvasToolCall.test.ts`「回执照接不接得上说」只吃文字那条红 |
| 再加一个往镜头写 composition_ref 的入口（比如手动「做站位图」按钮），又不看结果 | `attachDoors.guard.test.ts` 新加的两条：别的文件写这条边、或说这句承诺 → 红 |
| 判据和写边门判得不一样（目标有参数参考槽时总闸走另一条路） | `stagingAttach.test.ts`「判据说能接、写边却没落下」：以画布为准报没接上 |

## 4. 靶子独立性检查

- 尺子是写边总闸本身：判据直接调 `validateReferenceEdge`，没有另抄一份规则。
- 写边门最后读画布，以画布为准，不信判据。
- 走查 ④ 原来的断言是「composition_ref 边在」，只覆盖能接这一支，默认模型一换成只吃文字就红了。现在两支都走：
  - 默认模型：没有假边，有提示；
  - 换成能接参考图的模型：边落盘，不提示。

## 5. P0：这些是我们独有的吗

「站位图接哪个镜头、接不上怎么办」是领域（镜头与参考的语义），自写。
- 连线准入：用现成的写边总闸。
- 提示：用现成的 `notify`（后台档 +「定位节点」，与 `completeNodeConnection` 同一写法），不新造组件。
- 文案语气：照运镜参考的 `previewPromptOnly`。

## 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 无现成的「站位接镜头」；连线准入、通知已是接入现成 | — | — | 已在用 |
| 补 | Host 那行后面加一句「没连上就 toast」，回执另加一个 if | 两处各判一次 | 两半判据会分叉，下一个入口还会漏 | 否 |
| **换（本次）** | 判据 `stagingAttachForTarget` + 写边门 `attachStagingReference` 住一处。Host 那行直连删掉改调门；回执里无条件那半句删掉改用 `stagingAttachReceipt`。门岗拦别处再直写这条边 | 4 个产品文件（含文案） | 低：只多一次读画布 | **是** |
| 重写（限一个模块） | 让 `connectNodes` 返回落没落下（13 个写边调用方都得接） | 大，超本线文件上限 | 波及面广 | 以后单独立项 |
| 删 | 不连了，只出图 | 失去站位控构图 | 产品倒退 | 否 |

## 7. 用户要权衡的核心

接不上时只出图、留在画布上并提示，不自动把站位改写成文字塞进关键帧提示词。

运镜有「镜头运动：」这句现成的文字地板。站位没有一句话能说清站位、朝向和机位，硬编一句会悄悄改用户的提示词，生成效果也没评测过。要文字路线，Agent 可以按回执的建议改用 customBlocking。

## 特征测试清单（动结构前先锁住）

- `src/workbench/generationCanvas/nodes/director/agent/stagingAttach.test.ts`：
  - 判据五种目标：只吃文字 / 能接 / 没选模型 / 不收输入 / 不在画布上；
  - 写边门四种结果；
  - 回执与写边门一致的类测试，覆盖 7 种目标。
- `src/workbench/generationCanvas/agent/applyCanvasToolCall.test.ts`「回执照接不接得上说」两条。
- `src/workbench/generationCanvas/nodes/director/agent/attachDoors.guard.test.ts`「站位参考图接目标镜头只有一扇门」两条。
- `tests/ux/director-electron.walk.mjs` ④a / ④b。
