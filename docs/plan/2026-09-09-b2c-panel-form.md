# B2c · 已批准面板形态实施

状态：🚧 进行中。基线 a52109461，保留 B2a 的折叠、浮层与模型行语义。

## 范围与 owner
- V4Row 统一附属信息的 inline flow；Receipt、Thinking、Process、Cards、Composer 消费同一行布局。
- collapseV4Flow 归并明确的工具与 thinking；回答无论出现在调用前后均保留展开，失败沿用 V4ErrorBar。
- workbench store 的 editingPanelLayout.assistantWidth 是已持久化的宽度 owner，删除并行 assistantWidth 字段；四面消费同一值、同一分隔与 inset。
- 品牌统一 NomiBrand；运行时 display font token 对齐已安装 Variable 字族。
- check:tokens 加行尾棘轮，AI 目录硬零，其余路径按现状登记。

## 先查别人
- 复用品牌：`src/design/identity.tsx:95` 的 NomiBrand；Variable 字族依据已批准样张品牌小节，不引入另一套标记。
- 复用模型默认 owner：`src/workbench/settings/defaultGenerationModelOptions.ts:49` 保留双段身份与默认偏好，仅共享展示投影。
- 复用持久化宽度：`src/workbench/preview/editingPanelLayoutSlice.ts:167` 的 syncEditingPanelSize 已负责更新并标记持久化，四面统一消费。

本轮不引入框架或协议。已批准样张及其 Beautiful UI 形态研究见 docs/design/2026-09-09-agent-process-state-and-panel-frame.md；继续用现役 details、品牌组件、宽度边界与持久化布局，不增加依赖。现役生成面的 pointer capture 拖动是可复用实现；预览的 react-resizable-panels 继续负责已有预览布局。

## 不动项 / 回滚
冻结 electron/agentLane、src/workbench/ai/lane、reactFlow；不更改 B2a 审批、停止、消息保留、模型选择语义。回滚本任务提交即可恢复，宽度沿用已有持久化字段无需数据迁移。

## 验收
先红后绿：调用夹 thinking、回答先于调用、失败保留；行尾门岗故意违规；宽度共享/钳制/恢复。新增 specimen 单独录基线；真实三态与四面截图逐项对照批准 PNG；完整 gates exit 0 后才 commit/push/PR。保留旧基线。

## 21:45 增补：模型弹层
#680 model.png 的夹具 tests/ux/fixtures/agent-panel-mechanics/main.tsx 只传对话行，真实 ProjectAgentResidentShell 始终构建三行。删 modelHint 中英与标题，使用内容宽度；模型验收必须走真实三类目录与宿主，保留缺目录时的真实空态。单价仅展示目录已知值。

## 真机补证：预览助手外层
600px 切到预览实测缩成 487px，根因是助手仍受预览外层 Group 的独立 minimum 分配约束。删除助手专属 Panel/Separator/同步目标，四面外层统一 AssistantPane + store 宽度；预览内部 Group 保留现有能力。

## B2c-finish：过程行底板核查
用户授权只定向更新 ps-14-identity / ps-16-preview-host，两张之外不重录。旧 Electron 展开截图证实所有未展开工具行出现灰底；Receipt / ToolGroup / Process 复用无名 group，祖先 open 状态误触发后代背景和箭头。共享收据组件用具名分组隔离，删除无名展开传播；保留批准样张已有的 hover、明细 pre 与左侧引导线。Message / Panel / V4Row 无新增过程底板。真实 Electron 三态补背景/边框/阴影断言，先红后绿并截图；冻结区和 B2d/B2e 不动。
