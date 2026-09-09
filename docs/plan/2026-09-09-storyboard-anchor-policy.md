# B3 P0/P1/P2 分镜单一真相与锚消费策略

状态：实施中。2026-09-09；方案 B 已拍板，授权 P0/P1/P2；所有确认、角标、采纳/丢弃原地内联，禁止模态框。
基线：b657d5c6907e7fbc64291540c7cb21c9969b5626；独立分支 fix/storyboard-anchor-policy-p0p1-20260909。

## 现状与根因（定稿方案 §1）
分镜内容持久化在方案，节点独立持久化提示词、模型与参数；只有执行态从节点投影。
`storyboardRowActions.ts:108 syncShotNodeWithRow` 在生成前把方案盖到节点，忽略已在画布修改的内容。
`storyboardNodeBinding.ts` 按 designId×shotId 绑定；不重建节点也会发生覆盖。
`storyboardRowStatus.ts rowConsumesReferences` 把任意参考槽当图片槽；无槽生成跳过锚边但不报告。
类根因：写回边界缺少逐字段归属；计划引用关系与实际图片消费能力没有共享判据。归类 recurring。

## 先查别人（沿用已定稿方案 §2 的研究结论）
| 近邻 / 规范 | 已定稿依据 | 本期处置 / 偏差理由 |
| --- | --- | --- |
| Blender 场景条 | 场景正本、条子局部覆写；https://docs.blender.org/manual/en/latest/video_editing/edit/montage/strips/scene.html | 方案正本 + 节点逐字段覆写，不另建双向同步副本 |
| ComfyUI 子图 | 独立实例副本；https://github.com/Comfy-Org/ComfyUI/issues/10522 /11271 | 不再静默声称两份数据已同步 |
| Figma 组件实例 | 逐属性覆写 | 已拍板：节点 meta.overriddenFields，逐属性采纳/丢弃 |
| Nomi 槽契约 | electron/shared/videoCapabilities/types.ts:31；referenceEdgeCapability.ts:64 SLOT_ACCEPTS | 复用现有槽与图片接受映射，不新增供应商矩阵 |
| Agent Skills | https://agentskills.io/specification；现役 skills/workbench-storyboard-planner/SKILL.md | 只调整正文选模式规则，无新格式、无扩展文件 |

## 策略（定稿方案 §5）
`anchorPolicy.ts anchorsConsumedBy(mode)` 纯函数从 slots 派生 character / scene / firstFrame / none；档案不得手填 consumesAnchors。
共享 SLOT_ACCEPTS 的图片接受判据；不改任何档案默认模式、默认解析顺序或供应商身份。
`validateAnchorModelFit(plan)` 合入 validatePlan，返回 anchor-not-consumable 提示；写入仍接收，工具结果包含换同模型可吃图片的模式或移除视觉锚的纠正文本。
提示词每模式说明吃什么；引用视觉锚必须显式选择模式。用户点名 t2v 保留选择，并诚实说明参考图不会使用。
行执行返回跳过锚与原因，行态新增中性 anchor-ignored；锚卡展示引用数与消费数差值。
方案是内容正本；节点 meta.overriddenFields 持久化逐字段覆写。effectiveShotValue 是唯一生效值 owner；生成不得覆盖已标字段。画布/Agent 手改在共享写入边界打标，方案编辑即时更新未覆写投影。行内展示「画布改的」与图标+短标签「采纳到方案 / 丢弃」，灰字说明本次按画布值生成；节点卡同一枚角标。采纳写回 PlanShot 并清单字段标记；丢弃清标记并恢复方案投影，接既有撤销。控件属于覆写发生时的 L2 情境簇，不加常驻工具栏。

## 四条没想到（定稿方案 §6 #1–4）
1. 变体节点：只认 storyboardNodeBinding.preferOriginal 找回的原节点；变体不参与覆写。
2. 存量同名方案：保留现有数据，不合并或迁移；没有绑定节点的仍按需物化。
3. durationSec 模型钳制：durationSec 不进入覆写，不把模型钳制当用户编辑。
4. 默认解析漂移：生产改动前后枚举全档案与供应商，调用两个真实默认解析入口保存快照；任何默认模型/模式变化立即停工报告。
其余 §6：重排不做；MCP .describe() 零改动；与 2026-09-07-storyboard-table-node.md §6.4 B 交叉引用：覆写标记在节点不在表，表仍是投影。

## 范围、回滚与验收
不做 P3/P4，不碰 electron/agentLane/**、src/workbench/ai/lane/**、reactFlow/**，不改 MCP 散文。
回滚：整体 revert 本任务提交即可，无数据迁移。
先保留每组夹具红日志，再实现与绿日志，路径 storyboard-anchor-policy-evidence/。
验收含默认解析快照零漂移、真实锚卡与内联覆写控件截图（新版任务书明确禁止确认框）、loopback 视觉锚+t2v 返回可执行纠正，完整 with-gates-lock gates exit 0 后才能提交推送 PR。

## 实施证据（持续更新）
- `red-overrides-policy.log`：旧实现的 Agent/手改缺标记、生效值 owner 缺失，3 条红灯。
- `green-overrides-policy.log`：对应夹具与默认快照 6/6 通过。
- `policy-lifecycle.log`：消费判据、工具结果、采纳/丢弃/撤销、全档案结构约束 9/9。
- `final-focused.log`：6 文件 93 条通过；`store-regression-fixed.log`：真实 store + proposal 写入 6 条通过。
- `defaults-before.json` 是改动前保存的全档案/供应商 + 合并 catalog 默认解析；改后逐值相等。
- 真实 Electron `walk.log`：打开项目→分镜→锚卡橙字→第 3 行覆写→原地丢弃。
- `screenshots/00-anchor-warning.png`、`01-inline-night.png`、`02-discard-dusk.png` 经人眼检查：原有表布局中展示，图标+短标签同一行，无冲突弹框；消费提示仅行/卡展示，不放 footer 红色阻断汇总。
- R30 零额度 loopback：`storyboardAnchorPolicy.test.ts` 的真实 applyCanvasToolCall 接收视觉锚+t2v并回纠正文本；`storyboardOverrides.integration.test.ts` 的 set_node_prompt→materialize 保留夜景。该数字只证确定性执行，不冒称真实模型选工具率。
- 类型检查、lint（81 个现有 warning / 0 error）、边界棘轮通过；完整 gates 仍待完成。

集成基线：2026-09-09 开工后 origin/main 前进 3 提交，已无冲突 fast-forward 到 `2baa00d5e`，任务文件原样保留；最终 gates 在新基线上运行。

补充验证：`red-orphan-variant.log`→`green-orphan-variant.log` 证明原节点缺失时变体不抢行身份（regeneratedFrom / derivedFrom 两路）；`final-generation-loopback.log` 证明真实行生成入口向 runner 交付夜景。`screenshots/03-canvas-badge.png` 为真实节点卡角标。

全量套件补充：提示词入口保留 `canvas.node.prompt-changed` 与编辑突发撤销，只共用 `markStoryboardOverrides`，不把专用事件退化为通用 node.updated。全模块 mock 改为只 mock IPC 读取，真实模型档案纯函数参与投影。53 条定向回归转绿。
