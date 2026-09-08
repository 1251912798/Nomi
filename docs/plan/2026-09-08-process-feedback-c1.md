# 生成过程反馈 C-1

状态：实施前核对（2026-09-08）。分支 feat/process-feedback-phases-20260908，preflight 已验证 be6d4d84816bd6340185ca134346d7f4516abfdd 与 origin/main 同 commit、工作树干净。

## 设计来源

用户已批准 C0/C1/C2。原板目录：`/private/tmp/claude-501/-Users-aoqimin-Desktop-Nomi--claude-worktrees-gpt-discussion-review-06eb91/4b9987a0-fb6f-4af6-ad56-0eaa84ca67ea/scratchpad/sidebar-canvas-extract/`。
- `FeedNow.dc.html`：诚实骨架 + 真帧优先，删除微型大写徽标。
- `Phases.dc.html`：十阶段映射五段；八种状态条填充；动效及 reduced-motion 参数。
- `Consist.dc.html`：三处同句、同色；六条变异验收门。

## 真实现状与根因

- `src/workbench/observability/narrate.ts:8`：十阶段联合类型；`:35` Record 人话表。生成前 5 秒省略时长，retrying/comfyui-node 未统一带时长。
- `src/workbench/generationCanvas/nodes/BaseGenerationNode.tsx:434`：text-micro uppercase 徽标，优先 progress.message，缺省走 STATUS_LABEL。
- `src/workbench/taskCenter/TaskCenterPanel.tsx:406`：排队独立选择 waitingWave/waitingSlot，运行态又拼 elapsed。`taskCenterEntries.ts:84` 仅运行态传播 message。
- `src/workbench/timeline/TimelineClip.tsx:36`：只有 clip.label/text/sourceNodeId；未找到生成进度文案。`buildGenerationNodeTimelineClip.ts` 由已有结果构建片段。板上“现役幽灵段”不能作为已实现事实。
- `scripts/vocabularies-baseline.json:1222`：十阶段 owner 登记在 narrate.ts 的 GenerationProgressPhase。
- 归类 recurring：用户可见旁白被消费者二次解释，未在共享边界约束五段、人话与真实数值。

## 范围与不动项

按四笔里程碑：语汇及穷举/真实数值合同；状态条原子并删旧徽标；等待骨架与真实预览及减弱动态效果；三处接线及实验室、端到端证据。
不新增依赖，不改 electron/agentLane、src/workbench/ai/lane、generationCanvas/reactFlow，不改交互内核。保持节点几何、媒体采纳与时间轴编辑语义。批量卡密度、实时计费不在本刀。
时间轴差异已向用户提出：建议仅已有片段在源节点重新生成时接统一旁白，首次生成幽灵占位段留 C-2。
真实模型历史不足近十条，不展示估计；无真百分比、位次、采样、预览就省略对应信息。提交通常 1–3 秒只是设计说明，不是人为延迟。

## 回滚

四个 scoped commit 可逆序 revert；无持久数据迁移、无新依赖、无远端默认分支改写。PR 不合并。

## 验收门

六条均保留变异先红后绿证据：穷举/文案来源；假 percent 与假位次；三处同句；排队到完成几何；reduced-motion；60% 可读。实验室截图先放 docs/plan/process-feedback-evidence，主会话查看后方可更新基线。zh-CN/en、词表、token、重活门岗不增，最终 pnpm run gates。提交/推送运行版本化 Ponytail hook。PF-LAST.md 不提交、最多 15 行。
