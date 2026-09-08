# Agent lane 动态输入结构评审

状态：已评审；模型清单恢复已实现，完整 gates 待重跑，真实小样 2/3。覆盖 `electron/agentLane`，延续 `docs/audit/2026-09-08-agent-lane-cutover-structure.md`，不是新增运行时方案。

## 聚类判断

29 份合同集中于迁移组装层：SDK 能保存传入的上下文，却不能发现应用遗漏的资料。本轮与 input-context / continue-context 同族；model-selection 管对话模型，availableModels 管创作模型目录，两者不能互代。input-admission 和 desktop-write-receipts 分别管持久入队与写权限，均不承担目录装配。

## 逐层 owner 对账

| 输入事实 | 当前 owner / 证据 | 本轮裁决 |
|---|---|---|
| 模型身份、发布模式、供应商可用性 | `src/config/modelCatalogCache.ts:143` 的共享目录投影；`electron/catalog/modelCatalogListing.ts:175` 的 keyStatus | 保留既有目录，渲染侧不另建目录，不暴露凭据 |
| 模型参数和参考槽 | `src/workbench/generationCanvas/agent/availableModels.ts:31` 的 buildAgentModelEntries，join 现役 archetype | A 已能携带完整结构化能力，不需要主进程再 join 一份 |
| 用户当下的选择、附件、目标 | `src/workbench/ai/v4/useAgentPanelV4Actions.ts:122` 的 send | 先捕获现有上下文，再异步取目录；等待后检查 workspace owner，避免跨项目发送 |
| IPC 输入形状 | `electron/agentLane/laneDesktopInput.ts:33` 的 parseLaneComposerContext | availableModels 和所有原有字段同一严格 parser；不是 executable authority |
| 每回合消息与队列 | `electron/agentLane/laneHost.mts:201` 的 toProviderMessages；input-context 合同 | 保留 nomi.input 持久快照，不用最新全局目录重写旧回合；不改 SDK 接线 |
| 提供给模型的用户消息 | `electron/agentLane/laneDesktopInput.ts:57` 的 providerContent | snapshot、附件、模型清单在原有转换边界合成；共享 formatter 空清单省略且稳定排序 |
| 表单分镜入口 | `src/workbench/generationCanvas/agent/runStoryboardPlanner.ts:33` | 复用同一 formatter；删除渲染层旧实现，不保留并行文本规则 |
| 真实验收观察 | `tests/ux/agent-lane-observer.mjs:7` | C0 R30 必须读 native transcript；退役 Host 事件不能判断 pi lane 完成 |

## 六个评审视角

以下是单一评审的六个视角，不代表六位独立人员批准。

- CTO：恢复应用输入扩展点，不新增 SDK 层或 runner。
- 后端：严格 parser 和原 256 KiB 限额保持，目录不能授予写权限。
- 前端：共用 send，异步目录等待后检查 workspace owner。
- 设计：复用既有分镜卡，不增加控件或手贴配置流程。
- PM：同时检查出站清单和落盘参数，不以正确推理代替写入。
- 用户：nano 两次均八镜正确；deepseek 受实验总预算拦截，明确计失败。

## 防复发与边界

真实目录→桌面输入→HTTP 红绿测试覆盖空清单、后续回合更新和无效 IPC。loopback 请求必须含真实投影键；C0 读取 native transcript，删除旧 Host 事件观察路径。

结论：原有 owner 分层可保留，在共享输入边界恢复字段即可。本任务只有 development 小样 2/3，不证明整个 #646 或 packaged C0 完成；打包晋级归主会话。256 KiB 原限额仍是明确边界，不用放宽它掩盖目录体积问题。
