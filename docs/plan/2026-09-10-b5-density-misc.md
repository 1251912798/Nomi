# B5 信息密度杂项

状态：🚧 进行中；七条实现与隔离真机验收完成，正在完成 gates 与 PR 交付。

范围：09-09 总账 DC21–DC24、C53 导入去重、C09 概览阅读、B4 显示名。每项独立小提交，一个 PR。用户本轮任务书授权依已有审计方向直接修复；以真实外壳改前/改后截图对账。仅隔离 Electron profile，不读取用户资料库。

## 先查别人

- 反方只读代理核对：`src/ui/notificationPolicy.ts:24` 已统一原地/后台归属；`src/ui/toast.tsx:99` 已按身份及原因更新 Mantine 单 store、计次和清旧动作。DC23 沿用并补证据，不重造。
- `electron/assets/projectAssetStore.ts:240` 已有 SHA256；`:246` bytes 与 `:341` native 落盘仍每次 uniqueAssetPath。C53 在这些共享上传边界复用同项目内容身份，保留同名异内容与生成产物。
- `src/workbench/generationCanvas/model/canvasFitBounds.ts:39` 已合并节点和框；`reactFlow/GenerationCanvasReactFlow.tsx:334` 调框架 getViewportForBounds。保留全景能力，以现役聚焦提供可阅读缩放，不提高最低缩放裁内容。
- `src/workbench/generationCanvas/nodes/render/CardCommon.tsx:149` 已有等待上游/首帧/生成的行动提示；删除完整 prompt 的第二投影，编辑器继续拥有全文。
- `src/workbench/taskCenter/exportJobTaskCenter.ts:28` 丢失原因且终态 action 为 null；沿既有 TaskCenter 动作与 bridge 补真实后续入口，禁止回显路径或原始错误。
- 外部依据沿已有通知政策的实读记录：[通知政策](2026-09-09-notification-policy.md)、[密度审计](2026-09-09-info-density-audit.md)。本次不引入依赖、协议、供应商或第二套通知/缩放内核。

## 实施与验收

DC21：占位只有当前下一步，图片/视频/3D 全覆盖。
DC22：结果不能停在裸失败标签，保留安全原因和真实可执行动作；恢复与阻塞分别验证。
DC23：证明同对象重复更新、不同对象不误合并、原地反馈撤回旧全局提示。
DC24：正常合法静默；重复教学删去。隐私、付费、不可逆授权与实际手势差异保留。
C53：按内容 SHA256 复用同项目上传素材；跨次、并发、bytes/native、同名异内容覆盖。
C09：概览保全景，既有聚焦/比例入口可以看清选中媒体，不引入第二缩放状态。
B4：先 git apply --check，再采用用户给定 patch，展示名与供应商身份分离。

验证：改前/改后隔离真机截图、人眼审核；针对性红绿回归；基线仅按本次变化定向更新并在 PR 列全名；`python3 scripts/with-gates-lock.py -- pnpm run gates` 等待锁直至完成。正常 hooks commit/push；一个 PR。回滚按条目 revert，小提交无用户数据迁移。最终写 b5-density-LAST.md 并复制到指定 scratchpad。

## 实现与真实验收收据

七条均已有实现或合流验证；DC23沿用已合入通知政策。DC24 因版本化 Ponytail 审查含上下文diff超过150KB，按钩子要求拆为设置/分镜轨道两提交，未绕过钩子。

截图与真实操作见 `docs/fixes/b5-density-evidence/README.md`；额外组件证据见 `docs/plan/2026-09-10-b5-density-evidence/component-evidence/provenance.json`（明确不替代真实旅程）。真实导入、冷重启后旧/新内容去重、3秒MP4导出与任务“查看成片”已跑通；失败原因与B4以真实组件+边界单测补证，不冒充付费模型验收。

定向源码基线： `src/workbench/settings/settingsDialogStructure.test.ts` 中 `src/workbench/settings/AiModelsSection.tsx`、`src/workbench/settings/AutomationPermissionsSection.tsx`、`src/workbench/settings/CanvasGestureSection.tsx` 三个源码SHA。未放宽任何走查断言、等待或基线阈值。

首轮完整 gates 排队后因 main 前进，被 check:fresh-base 阻止；同步最新 main 后重跑，最终状态另附。

定向视觉基线：`tests/ux/design-lab/__baselines__/canvas-frame/canvas-frame-shot-label-outside.png`，仅 DC21 提示文案变化；已并排查看实际/预期图。

全量单测首次发现4条旧契约预期（导入日期路径3条、被删设置说明1条），已按C53内容身份与DC24选中手势说明精确更新；43项相关单测通过，文件内容/类型/原生入口校验保留。未修改走查断言或超时。

合入 main 的分镜徽标更新时，同一视觉基线冲突；按合并后实际渲染重新取图并与最新main并排核对，保留主线徽标样式，本分支差异仍仅DC21提示文案。最终完整gates与PR收据见PR正文及本地 `b5-density-LAST.md`。
