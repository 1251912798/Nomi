# 参考入口验收（合并前）

实现线 reference-entry-root；独立线 reference_census。基线 origin/main 6d28f3863244edbdf6e013bea33d26baff0f9615。用户最终要求仅原小鼠标和已确认的引用交互，删除擅自加的展示。

## 最终范围

- Agent 删除「参考」文字，仅原 IconPointer；原文件 + 不变。
- 声明槽移除新 header +，恢复原数组末尾 / 首尾帧 / 源视频加号及容量 owner。没有声明槽的 fallback 使用原输入 +；没有第二套素材库 / 点选实现。
- 删除新目标展示、上方 ready 媒体条及先搜索再点选流程。点小鼠标直接共用 canvasPickMode，@ 共用素材池；引用以共享 PromptEditor 的句中缩略图呈现。
- 点选保留原修改目标；发送携带 canonical claim、原件 bytes / 原件身份和已验证 source handle。未自动生成或花钱。

## 真实 macOS Electron 证据

[成功记录](report.json)，原始目录 `.tmp/pi-reference-entry-development-1791741845614`。Electron 43.4.1，开发构建，真实 UI 导入仓库 JPG 和 MP4。2 次 loopback 文本请求，0 付费。素材身份来自实际 main 导入，未种入 mock assetId。

通过：多文件导入；@ 搜索 / Enter 选择；句中两个缩略图分别跟随指令；Shift+Enter 换行保留；长文增长后清空缩回；图片 / 视频 / 文本小鼠标直接进入共享点选而没有先弹 picker；文本原 + 选素材产生上游边；creation 首击进入点选；选择来源后原选中 target 不变；实际 outbound 与持久化 nomi.input 带 canonical 原件和精确 source locator、原 TargetRef。

图片 bytes 真进入请求；视频只携带原件身份用于后续生成复用，明确未观看 / 试听。loopback 返回文本，未执行 Agent 实际改图工具，不代表付费供应商接收、视频理解或完整工具修改闭环。

实现线已亲读中文亮色和英文暗色 1100×720 截图：

- [Agent 句中引用 / 仅小鼠标](01-agent-inline-references-zh.png)
- [图片首次打开](02-image-reference-first-open-zh.png)、[文本首次打开](06-text-reference-first-open-zh.png)
- [Agent 画布来源入句](08-agent-direct-inline-reference-zh.png)
- [英文暗色点选](09-agent-direct-pick-en-dark-narrow.png)、[@ 候选](10-agent-at-picker-en-dark-narrow.png)

视频首次截图中的节点落在视口右侧外，不能作为首屏视觉签收。随后走查增加既有 Fit View / 收起 Agent 操作以补拍；两次补拍均被实际 no-disk-space 准入阻止，未通过。停止本任务额外启动的 hook 检查并删除其唯一自建临时仓库，释放约 786MB；剩余约 1.3GB，仍低于既有 2GB 导入预留，不绕过守卫、不清理其它任务 / 用户资料。视频完整首屏截图、每个原生模型槽的 live 全状态仍 unverified。

## 确定性与构建验证

- 12 文件 221 项相关测试通过，含原槽加号数量 / 容量、原件准入、@ 编号、异步插入恢复、ACK 保留、定位来源和 main 序列化。
- 最终 production build、四路 typecheck、改动 ESLint、git diff --check 通过。
- 45 模型 / 64 槽 reference contract 通过。独立代码 / 确定性行为验收通过，见 [独立报告](../2026-10-12-reference-entry-census.md)。
- [生产组件清单](../../design/boards/2026-10-12/ReferenceEntry.board.json) 用现有 board parity 纯函数校验；预览是生产 DOM 摘录，图片为真实 fixture，视频缩略图取同一真实 MP4 首帧，非第二套交互原型。所有状态列的是需覆盖清单；unverified 项明确标注。

全量 gates 未全绿：design-lab 约 73 个视觉差异 / 106 通过，包含此次 Agent 编辑器几何及既有区域，未擅改基线；原工作树 shot-table 对照也有 2 个失败。/var 符号链接使 hook 阳性对照主模块未执行，改用真实 /private/tmp 后 git-path-quoting 9 项和 main-guard 通过；完整 hook 套件因磁盘压力停止，没有全绿结论。

## 边界

Windows、打包版、真实付费 provider、影音语义理解、所有 hover 和模型槽 live 状态未验。一个 canonical 原件被多个节点复用时，句中引用仍是同一媒体身份，需在指令中明确节点名。未合并，不宣称「已解决」。
