# 空节点按操作上下文展开引导：独立功能普查

- 独立线编号：`V-node-guidance`；与实现线不同。
- 日期：2026-10-11。
- 范围：只读检查现有生产源代码，未运行构建、测试或真 App 验收。本表不是运行通过收据。
- 用户已批准：浏览或多选时空节点内部仅显示类型图标；单独选中或刚创建时显示既有引导；保留外部名称、连接点、已有内容和业务状态；遵循现有设计系统。
- 以下代码出处均为仓库相对路径，记录的是改动前基线，后续行号可能移动。

## 共享边界与状态所有权

1. `nodes/render/NodeEmptyState.tsx:23` 已统一普通与音频横向空态，应成为图标/完整引导的唯一视觉边界。
2. `reactFlow/GenerationCanvasReactFlowNodes.tsx:192-194` 已从 React Flow 派生 `primarySelection`；应在这个共同宿主提供上下文，避免每种空态各自查选区。
3. `BaseGenerationNode.tsx:103,217` 已有单选生成框门；原 `PendingGenerationPlaceholder` 的 `selected` 在 `render/CardCommon.tsx:158` 仅写 DOM 标记，没有控制内容。
4. `nodes/renderRegistry.tsx:48-70` 是类型图标唯一源。`PendingGenerationPlaceholder` 原本只区分 video/model3d/其他图片，keyframe/shot/output 会落图片兜底；scene 与 panorama 的空态图标也与 registry 不一致。
5. `store/canvasNodeActions.ts:124` 已默认选中新建节点，不需新增持久化的“刚创建”状态。
6. 教学引导与业务状态必须显式区分。等待上游、派生备好、生成/导入、本地处理、失败、可找回、缺失内容诊断都不能因为失选而消失。

## 现有功能全表

路径统一以 `src/workbench/generationCanvas/` 为前缀。

| ID | 功能与代码出处 | 新设计归宿 / 回归要求 |
|---|---|---|
| F01 | 图片类型/状态及文生图、参考图配方：`nodes/render/CardCommon.tsx:156-165` | 浏览/多选只留类型图标；单选显示原完整引导 |
| F02 | 视频首帧/首尾帧/文生视频配方：同上；`quickActions/nodeTryRecipes.ts:91-109` | 同上，配方仍按当前模型能力可用性显示 |
| F03 | 配方建结构、模式切换、单步撤销、聚焦提示词：`quickActions/nodeTryRecipes.ts:126-133` | 保留原动作，不转成生成入口 |
| F04 | 视频等待上游：`nodes/render/CardCommon.tsx:176-180`；`nodes/BaseGenerationNode.tsx:205,435` | 明确作为状态，失选/多选也保留 |
| F05 | 派生节点提示词备好：`nodes/render/CardCommon.tsx:169-177` | 保留状态，不显示教学配方 |
| F06 | 3D 模型图标与说明：`nodes/render/CardCommon.tsx:153-155,173-181` | 浏览仅 3D 图标，单选恢复说明和既有生成框 |
| F07 | keyframe/shot/output：`nodes/registry.ts:155,217,230`；`nodes/render/CardCommon.tsx:152-155` | 使用真实类型图标与对应类型文案，避免原图片兜底 |
| F08 | 角色上传、FileReader 项目上下文隔离：`nodes/render/CharacterCardNode.tsx:35,55`；`nodes/render/CardCommon.tsx:395-415` | 保留上传；浏览首次点击应先选中展开 |
| F09 | 角色 tagline/用量/变体/名称编辑：`nodes/render/CharacterCardNode.tsx:38-79` | 内容不受空态引导门控制 |
| F10 | 场景上传/预览/mood/用量/变体/悬停信息：`nodes/render/SceneCardNode.tsx:31-75` | 保留；图标与 registry 对齐 |
| F11 | 道具上传/所有者关联/用量/名称：`nodes/render/PropCardNode.tsx:30-68` | 保留；道具为 image + prop renderKind，需保留道具语义 |
| F12 | 三种上传卡整面 label 与拖动手势：`nodes/render/CardCommon.tsx:413-432` | 藏文字不等于关闭 label；首次指针按下时须记录激活准入，拖动不打开文件框 |
| F13 | 文本类型/状态/三种文本加工：`nodes/render/TextDocumentNode.tsx:199-230` | 浏览/多选仅图标，单选未编辑显示完整引导 |
| F14 | 文本编辑/格式条/选区/结果落地/聚焦：`nodes/render/TextDocumentNode.tsx:109-115,129-162,182-198,233` | 保留 EditorContent，图标层不阻断正文与键盘聚焦 |
| F15 | 文本加工能力不可用的禁用原因：`nodes/render/TextDocumentNode.tsx:215-221` | 原能力判据与原因保留 |
| F16 | 文本运行/停止、拆条数、长文本 footer：`nodes/render/TextDocumentNode.tsx:119-123,235` | 失选不隐藏任务状态 |
| F17 | 声音空态、整面 label 上传：`nodes/render/AudioStripNode.tsx:244-249` | 浏览仅波形，单选恢复说明与上传；首次点击准入同 F12 |
| F18 | 声音播放/进度/字幕复制与生成：`nodes/render/AudioStripNode.tsx:225-238,252-280` | 完全保留；字幕态不能误判为普通无 URL 空态 |
| F19 | 画板打开、选中节点、恢复保存内容：`nodes/whiteboard/WhiteboardCardBody.tsx:32-63` | 浏览先选中，单选再激活；已有内容/Modal 保持 |
| F20 | 画板内部标题：同文件 `:40-43` | 外部名称保留；内部重复标题需明确归宿 |
| F21 | 全景上传：`nodes/PanoramaUploadFallback.tsx:22-33` | 浏览先选中，单选激活；图标用 registry 的全景图标 |
| F22 | 全景结果及历史 meta.imageUrl 查看/截屏：`nodes/BaseGenerationNode.tsx:376-390` | `meta.imageUrl` 也代表已有内容，不能只按 result.url 判断 |
| F23 | 剪辑空态画布点选/素材库添加：`quickActions/NodeTryList.tsx:64-105`；`nodes/ClipNode.tsx:633` | 独立宿主接共享门，浏览仅剪刀；原动作保留 |
| F24 | 剪辑时间轴添加/拖放/选片/拖动缩放：`nodes/ClipNode.tsx:622-633` | 空态层不能覆盖 drop 区或时间轴操作 |
| F25 | 剪辑头部数量/时长/动作/导出：`nodes/ClipNode.tsx:587-618` | 原位保留，不是教学引导 |
| F26 | 导演空态及打开编辑器：`nodes/director/DirectorNode.tsx:180-204` | 独立宿主，无内容浏览仅电影图标，单选恢复提示 |
| F27 | 导演对象/相机统计、入连摘要、预览失败重试：同文件 `:195-220` | 统计及失败不可随空态文案隐藏 |
| F28 | 镜头表无源/空事实/运行/失败：`nodes/shotTable/ShotTableNode.tsx:87-102` | 状态型空白，作为普通教学空态例外保留 |
| F29 | 镜头表选择/列编辑/重试/取消：同文件 `:108-117` | 原位保留 |
| F30 | 素材导入/结果预览/失败重导：`nodes/BaseGenerationNode.tsx:158,325-327,392-429` | 素材无手动空节点；导入/失败不能变纯图标 |
| F31 | Agent 产物内容、缺元数据诊断、工具栏：`nodes/artifact/artifactNodeSlots.tsx:49-67` | 缺元数据是异常诊断，保留文字 |
| F32 | 生成状态/导入进度/取消：`nodes/NodeGeneratingOverlay.tsx:29-38`；`nodes/BaseGenerationNode.tsx:313-315,466` | 不受教学引导门控制 |
| F33 | 错误全文、重试/关闭、recoverable 拉取：`nodes/BaseGenerationNode.tsx:319-345` | 所有选中态保留原行为 |
| F34 | 本地操作进度/已有结果模糊等待层：`nodes/BaseGenerationNode.tsx:428-429,448-450` | 不被纯图标替代 |
| F35 | 外部标签、镜头身份、设定卡关联/派生状态：`nodes/BaseGenerationNode.tsx:288-312` | 原位保留 |
| F36 | 只读：`nodes/BaseGenerationNode.tsx:217`；`quickActions/NodeTryList.tsx:69` | 不得通过完整引导恢复写入口；上传体也须受门控制 |
| F37 | 插件与缺失插件：`nodes/renderRegistry.tsx:103-104` | 保留插件自身契约，不覆盖整块 body |
| F38 | 远景/大画布轻量节点：`components/LightweightGenerationNode.tsx:77-96` | 原无预览时是空白；承诺所有空节点有图标时需覆盖该宿主 |
| F39 | 懒加载 fallback：`reactFlow/GenerationCanvasReactFlowNodes.tsx:304-311` | 同样使用轻量节点；不能闪出一份完整引导 |
| F40 | React Flow 单选/框选：同文件 `:192-194,314-317`；`reactFlow/generationCanvasReactFlowAdapter.ts:110` | selected 不等于 primarySelection；覆盖框选进行中与 store 同步 |
| F41 | 分组框/折叠组：`reactFlow/GenerationCanvasReactFlow.tsx:196-205` | 整组浏览不展示重复引导；单成员分组也需检查 |
| F42 | 列表视图：`src/workbench/generation/list/` 未检出 NodeEmptyState/NodeTryList 复用 | 本次为画布呈现调整；不可删列表的输入、生成、错误能力 |

## 最小回归矩阵

| 编号 | 场景 | 必须观察到的结果 |
|---|---|---|
| M01 | image/video/text/model3d/keyframe/shot/output/character/scene/audio/whiteboard/panorama/clip/director，未选中/单选/多选 | 图标/完整引导/图标；类型正确 |
| M02 | image + cast/scene/prop/audio renderKind，旧显式 renderKind | 原专属 body 仍优先，正确语义图标 |
| M03 | 新建、批量创建、框选、全选、整组、单成员组 | 单节点自动展开；多节点及组浏览不重复引导 |
| M04 | 上传卡/音频/全景/画板首次点击与再次激活 | 首次只选中展开；第二步打开原入口；拖动不激活 |
| M05 | 图片/视频配方 + 无模型/不兼容模式 | 原能力过滤；建结构、聚焦、撤销正常；不生成 |
| M06 | 文本点击、输入、加工、禁用原因、停止 | 编辑正文不被拦；状态/持久化/能力理由保留 |
| M07 | 图片/视频/音频/历史全景/3D/文本/画板/剪辑/导演/artifact 内容 | 内容不被空态门替代 |
| M08 | 等待上游/derivedReady/queued/running/importing/error/recoverable/local-op | 失选、多选、只读也不丢状态和诊断 |
| M09 | zh/en × light/dark；120px 高、最小宽、常见比例、密集分组 | 图标不偏位，完整引导不溢出，动作保持单行 |
| M10 | 远景 LOD、懒加载、只读、缺失插件、shot_table 空/运行/失败 | 适当图标或诊断；不丢内容/任务状态/权限边界 |

旧 `nodes/render/CardCommon.test.ts:17-26,47-65` 锁定未选中完整引导，应更新；`:29-37` 的等待上游/派生备好断言应保留。

## 独立验收方案：指针时序与宿主边界

本节为待执行方案，非通过报告。最终验收必须列出实际运行命令、截图及未验证项。

### 激活时序

关键风险：未选中空卡的 pointerdown 使节点变成单选，随后 click 在重渲染后读到已选中，误以为本次点击可以上传/打开。不能在 click 时仅检查当前 selection。

1. 用真实 pointerdown → 宿主选择变化 → pointerup → click 顺序，针对角色/场景/道具/声音/全景/画板逐类测试。
2. 准入在本次 pointerdown 时捕获；若当时尚非可写单选，本次 click 只能选择，不能提交 input 的默认激活或打开 Modal。
3. 已单选后再次按下，click 允许原动作。按下后变多选或只读时，不得使用过期准入执行写操作。
4. 输入默认行为也必须拦住：label 的默认 click 会转发给隐藏 input；仅不调用手写回调不足以保护。
5. 键盘 Enter/Space、读屏/程序产生的无 pointerdown click 不得沿用旧指针准入；按实时单选与只读判据处理，保留原按钮键盘语义。
6. 拖过阈值、pointercancel、右键、快速连点和选区切换后检查准入复位。不能让前一次允许的 pointerdown 污染下一次激活。
7. 上传 input change 后重复选择同一文件仍有效，继续验证原项目上下文防串项目逻辑没有移动或删除。

### React Flow 及其他宿主

- 独立验证 `selected=true, primarySelection=false`（多选）和 `multiSelectionActive=true`（框选尚未结束）。空态显示图标，不能挂可写动作。
- `selected=false, primarySelection=false` 浏览态保持图标；`selected=true, primarySelection=true, readOnly=false` 才完整引导。
- `readOnly=true` 永不允许上传、打开可写编辑器、配方建节点，即使 selected/primarySelection 为真。
- 新建默认单选、点击组头、选整组、折叠/展开、单成员组、远景点击恢复全量渲染、懒加载完成均需真 App 走查。
- 开发实验室/SSR 等没有 React Flow provider 的宿主须有明确默认，生产展示合同和测试都应显式包对应上下文；不可让无 provider 自动获得写权限。

### 状态优先级

- `guidance` 才按单选隐藏文字/动作；`status` 始终显示业务事实。
- 任意选中上下文下，等待上游/派生备好优先于配方教学，queued/running/importing 保持进度与取消，error/recoverable 保持诊断/恢复。
- 异常 artifact 缺元数据、缺失插件、shot_table 无源/失败不走普通纯图标分支。
- 已有内容判据由各业务 owner 提供（全景 meta.imageUrl、文本 contentJson、画板持久状态、剪辑 clips、导演 stats、artifact meta），不新增全局 result.url 判空真相源。

## 验收状态

- 源码功能普查：完成。
- 实现差异审查：待实现通知。
- 自动化针对性验证：未执行。
- 真 App zh/en 截图与逐项点验：未执行。
- Windows：unverified。
