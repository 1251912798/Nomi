# 参考入口验收（合并前）

实现线 reference-entry-root；独立线 reference_census。基线 origin/main 6d28f3863244edbdf6e013bea33d26baff0f9615。用户最终要求仅原小鼠标和已确认的引用交互，删除擅自加的展示。

## 最终范围

- Agent 删除「参考」文字，仅原 IconPointer；原文件 + 不变。
- 声明槽移除新 header +，恢复原数组末尾 / 首尾帧 / 源视频加号及容量 owner。没有声明槽的 fallback 恢复未改动的 AssetAddTile 虚线方框，删除新增裸加号；没有第二套素材库 / 点选实现。
- 删除新目标展示、上方 ready 媒体条及先搜索再点选流程。点小鼠标直接共用 canvasPickMode，@ 共用素材池；引用以共享 PromptEditor 的句中缩略图呈现。
- 点选保留原修改目标；发送携带 canonical claim、原件 bytes / 原件身份和已验证 source handle。未自动生成或花钱。

## 真实 macOS Electron 证据

[成功记录](report.json)，原始目录 `.tmp/pi-reference-entry-development-1791744428854`。Electron 43.4.1，开发构建，真实 UI 导入仓库 JPG 和 MP4。2 次 loopback 文本请求，0 付费。素材身份来自实际 main 导入，未种入 mock assetId。

通过：原文本附件 + 可移除（正探针）；多文件导入；删除引用持续消失（非瞬时 count=0）；@ 搜索 / Enter 选择；句中两个缩略图分别跟随指令；Shift+Enter 换行保留；长文增长后清空缩回；图片 / 视频 / 文本小鼠标直接进入共享点选而没有先弹 picker；文本原 + 选素材产生上游边；generation 先收起为小球后，creation 首击恢复原 Agent 浮窗并进入点选；选择来源后原选中 target 不变；实际 outbound 与持久化 nomi.input 带 canonical 原件和精确 source locator、原 TargetRef。

图片 bytes 真进入请求；视频只携带原件身份用于后续生成复用，明确未观看 / 试听。loopback 返回文本，未执行 Agent 实际改图工具，不代表付费供应商接收、视频理解或完整工具修改闭环。

实现线已亲读中文亮色和英文暗色 1100×720 截图：

- [Agent 句中引用 / 仅小鼠标](01-agent-inline-references-zh.png)
- [图片首次打开](02-image-reference-first-open-zh.png)、[视频首次打开](04-video-reference-first-open-zh.png)、[文本首次打开](06-text-reference-first-open-zh.png)
- [Agent 画布来源入句](08-agent-direct-inline-reference-zh.png)
- [英文暗色点选](09-agent-direct-pick-en-dark-narrow.png)、[@ 候选](10-agent-at-picker-en-dark-narrow.png)

此前两次补拍因实际可用空间低于既有 2GiB 预留而 no-disk-space 失败，不能作通过证据。用户随后授权磁盘清理：只清缓存和旧测试包，清理后可用约 6.3GiB。最终重新导入同一 JPG / MP4 并完成上述真实闭环。每个原生模型槽的 live 全状态仍 unverified。

## 确定性与构建验证

- 12 文件 221 项相关测试通过，含原槽加号数量 / 容量、原件准入、@ 编号、异步插入恢复、ACK 保留、定位来源和 main 序列化。
- production build 与四路 typecheck 通过；新增延迟 echo 删除测试、媒体 × vision 矩阵通过。推送前相关测试和检查以钩子最终收据为准。
- 45 模型 / 64 槽 reference contract 通过。独立代码 / 确定性行为验收通过，见 [独立报告](../2026-10-12-reference-entry-census.md)。
- [生产组件清单](../../design/boards/2026-10-12/ReferenceEntry.board.json) 用现有 board parity 纯函数校验；预览是生产 DOM 摘录，图片为真实 fixture，视频缩略图取同一真实 MP4 首帧，非第二套交互原型。所有状态列的是需覆盖清单；unverified 项明确标注。

全量 gates 未全绿：design-lab 约 73 个视觉差异 / 106 通过，包含此次 Agent 编辑器几何及既有区域，未擅改基线；原工作树 shot-table 对照也有 2 个失败。/var 符号链接使 hook 阳性对照主模块未执行，改用真实 /private/tmp 后 git-path-quoting 9 项和 main-guard 通过；完整 hook 套件因磁盘压力停止，没有全绿结论。

## 边界

Windows、打包版、真实付费 provider、影音语义理解、所有 hover 和模型槽 live 状态未验。一个 canonical 原件被多个节点复用时，句中引用仍是同一媒体身份，需在指令中明确节点名。未合并，不宣称「已解决」。


## 复审与预期对账

| 动作 | 预期 | 实际 / 判断 |
|---|---|---|
| Agent 原 + 上传 JPG / MP4 | 原件可用，句中小图 | 原 main 身份、两个句中 atom；无上方重复媒体行 |
| 上传后立即清空 | 引用随内容删除 | transaction.before 释放 claim，持续检查无重插 |
| 节点小鼠标 | 立即进入画布选取 | image/video/text 共用 canvasPickMode，未先弹 AssetPicker |
| 节点原 + | 保持原素材选择 | 实际 AssetPicker 开启并建立文本上游边 |
| 创作 Agent 小鼠标 | 首击切画布并选择 | 已收起的 generation 恢复既有 float，首击成功 |
| 点 source 再发送 | 原 target 保留，source 原件带入 | 选中集及持久化 TargetRef 相同，canonical claim/source handle 实际入请求 |

reference_census 最后两轮只读复审（媒体 owner / form 与 transaction.before）均无新 must-fix；未替实现线运行 Electron。性能测试无 DOM，明确只隔离 editor adapter；不能用其绿灯冒充编辑器体验验收。没有新增产品 UI。

## 用户圈出的加号框纠正

此前 fallback 使用自写 30px 裸加号，超出用户只加小鼠标和引用交互的确认范围。已删除 AssetReferenceButton.onAdd/open/IconPlus API，fallback 空态及已有媒体行直接复用原 AssetAddTile；该轮恢复时 AssetTile.tsx 相对 origin/main 无改动；随后用户明确要求两个入口使用同样方框，已从原加号组件提取共用 AssetActionTile，保持原加号的输出样式和行为。Agent 原文件 + 保留。21 项相关检查通过，真实 Electron 图片/视频/文本首次打开均检查原框 56×56px 和 dashed 边框；原框打开原 AssetPicker，鼠标直接点选，文本选择建立上游边。reference_census 本轮只读复审无新 must-fix。截图与 DOM 是实测证据，不代表用户已确认视觉；清单 approvedOn 已撤回为空。

自动化边界：上一轮 1791743845468 使用 contenteditable.fill(空串) 时引用未持续消失，已保留失败报告。最终走查用真实 ControlOrMeta+A / Backspace 删除，持续消失及之后 @ 重选/发送通过。fill 与原生键盘差异尚未归因，不能将这轮通过说成编辑器所有输入路径已验证。

用户随后明确要求同排：AssetReference 和无声明槽 NodeInputReferenceEntry 仅调整为鼠标入口与原缩略图/加号框同一行，原组件不改。16 项相关检查通过；真实走查加入矩形中心线与左右顺序检查，最终真实 Electron 走查通过，矩形中心线/左右顺序、原 56px 虚线框、原 picker 和鼠标直达均通过；中文亮色与英文暗色截图已更新。

用户最新明确：节点同排两个入口都用右边一样的框，内部只放 icon。鼠标入口改为原 56px 虚线方框，复用唯一 AssetActionTile；原加号仍由 AssetAddTile 输出，Agent 紧凑图标不变。22 项相关检查通过，原加号无重复；真实走查补充左右框尺寸/边框相同及节点入口无文字检查。

本轮同框设计真实 Electron 通过：image/video/text 入口与原加号框均为 56×56px/dashed，同排、垂直居中、鼠标框无文字；点选/原 picker/@ 与实际 canonical 请求保持，2 次 loopback 文本请求，0 付费。本轮执行 renderer build 与 22 项相关检查；没有将 renderer build 当作新的完整打包构建收据。独立 reference_census 确认唯一方框样式 owner、原 + 行为和 Agent 紧凑控件保持。
