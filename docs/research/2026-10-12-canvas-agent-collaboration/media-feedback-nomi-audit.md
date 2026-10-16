# Nomi 图片 / 视频定点反馈接缝核查

核查日期：2026-10-12。只读源码；基线 `0c1ed6a0c9421091f238413d682af97e9aa18d9d`（已对报告涉及的源码逐文件比对原研究基线，均无变动）。没有执行真实模型请求或 UI 验收。下文“已有”只表示源码路径存在。

## 判断

有条件成立，而且不用引入新 Agent runtime。当前已具备图片本地处理、结果版本、白板绘画、项目素材附件、多模态输入、视频真实取帧、生成审批和 Run 记账。真正要补的是：**把用户正在指的原图 / 视频版本、区域、时间、文字意见，作为同一份可检查的反馈草稿带入现有 Agent composer；发送后仍用这一份目标执行并对账。**

现有白板是内容编辑器；橡皮是在 Leafer 画面中擦掉像素 / 对象显示，不是已接通模型的 inpaint 蒙版。定点评论不能默认把标记涂进原图，图片改图也不能统一说成“只改 prompt 就能局部修改”。

## 已有能力与边界

| 面 | 已有路径 | 可以直接复用 | 必须补 / 不得过度声称 |
|---|---|---|---|
| 图片简单编辑 | [useNodeImageEditing.ts:29–75](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/nodes/useNodeImageEditing.ts#L29-L75)、[useNodeImageEditing.ts:279–440](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/nodes/useNodeImageEditing.ts#L279-L440) 用 ImageBitmap + OffscreenCanvas 输出 PNG；裁剪、旋转、翻转写本节点结果历史；宫格切分出多个派生节点 | 统一图片持久化、进度、项目绑定、历史版本 | 没有在该模块找到像素宽高 resize 入口；画布卡片改大小不等于图片重采样 |
| 移除背景 | [useNodeImageEditing.ts:443–520](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/nodes/useNodeImageEditing.ts#L443-L520) → [removeBackground.ts:90–98](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/lib/removeBackground.ts#L90-L98) → [removeBackground.worker.ts:1–10](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/lib/removeBackground.worker.ts#L1-L10) 的 `@imgly/background-removal` | 现有按需下载模型、CPU worker、进度/失败提示；不必绕 Agent 再调用云模型 | 首次要下载模型资源；是本机推理，不是保证任何图都准确；源码存在不代表已验收 |
| 白板笔刷 / 橡皮 | [whiteboardCanvasTypes.ts:3–11](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/nodes/whiteboard/whiteboardCanvasTypes.ts#L3-L11)；[whiteboardCanvasNodeOps.ts:124–165](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/nodes/whiteboard/whiteboardCanvasNodeOps.ts#L124-L165) 使用 Leafer `eraser:'path'`；[WhiteboardModal.tsx:125–177](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/nodes/whiteboard/WhiteboardModal.tsx#L125-L177) 保存 PNG 快照及白板状态到结果历史 | 同一图片焦点面、笔划交互、状态存储与导出 | 当前保存会得到含绘画的内容图；没有评论线程、反馈编号、mask 输入协议。不要把“擦透明”叫“擦除物体并补全背景” |
| 图片快捷改图 | [ImageQuickActionsToolbar.tsx:125–259](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/quickActions/ImageQuickActionsToolbar.tsx#L125-L259) 已接白板/本地变换/去背景；[deriveFromNode.ts:14–25](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/quickActions/deriveFromNode.ts#L14-L25)、[deriveFromNode.ts:143–210](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/quickActions/deriveFromNode.ts#L143-L210) 建下游节点、参考边、提示词与模型 | 保留当前工具条及模型能力缺失引导；可参考“先备好，不立即生成”交互 | 按当前明确拍板：快捷动作不自动生成、不花钱；不要让新增评论入口暗中改变它 |
| Composer 附件 | [composerAttachmentTypes.ts:10–28](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/ai/composer/composerAttachmentTypes.ts#L10-L28)；[useComposerAttachments.ts:61–85](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/ai/composer/useComposerAttachments.ts#L61-L85) 上传为项目素材，得到 assetId/hash；[projectAgentAttachments.ts:6–25](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/ai/projectAgentAttachments.ts#L6-L25) 发 assetId/version claim | 图片附件 chip、加载/失败状态、项目保存、输入草稿恢复 | 附件模型只有 image/file，没有区域/时间/意见；不能只塞一张画过红圈的图便声称已精准锚定 |
| 主进程多模态输入 | [laneDesktopInput.ts:64–107](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/electron/agentLane/laneDesktopInput.ts#L64-L107) 主进程解析项目附件并读取 bytes，交 `buildAgentUserContent`，转成 pi image content | 原图 bytes 传模型；主进程资产解析边界；既有 pi transcript/order/retry | 视频附件没有原生 video part：[agentUserContent.ts:57–100](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/electron/ai/agentUserContent.ts#L57-L100) 对非图非 PDF 走抽文本。视频反馈应显式传截帧和时间上下文；别只把 MP4 当 file 附件 |
| 输入目标快照 | [useAgentPanelV4Actions.ts:47–84](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/ai/v4/useAgentPanelV4Actions.ts#L47-L84)、[useAgentPanelV4Actions.ts:160–247](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/ai/v4/useAgentPanelV4Actions.ts#L160-L247) 同步冻结选中节点/clip/文稿上下文，ACK 后仅清理本次已发送草稿和附件 | 现有 Admission、项目会话地址、草稿 revision、发送失败恢复 | 目前生成面主 target 是 canvas/nodeIds；不携带媒体区域/时间评论。用户选中 A 后发起反馈、发送前再选 B，必须仍指 A 的冻结反馈目标 |
| 目标与前提 | [capabilityTargeting.ts:7–39](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/electron/shared/capabilityTargeting.ts#L7-L39) 已有 canvas-result、asset、timeline target 与 results/clips/timeline preconditions；[canvasWriteTarget.ts:54–64](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/agent/canvasWriteTarget.ts#L54-L64) 已有结果指针证据 | 在现有 target/precondition 家族扩展或组合；继续走 Canvas Write admission | 当前没有 image-region/video-region selector。坐标需要原图尺寸与显示变换逆映射；nodeId 单独不足以定位哪一次结果 |
| 视频定点基础 | [NodeVideoFrameToolbar.tsx:1–75](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/nodes/NodeVideoFrameToolbar.tsx#L1-L75) → [extractVideoFrameToNode.ts:21–50](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/nodes/extractVideoFrameToNode.ts#L21-L50)、[extractVideoFrameToNode.ts:65–97](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/nodes/extractVideoFrameToNode.ts#L65-L97) → [extractVideoFrame.ts:134–187](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/electron/video/extractVideoFrame.ts#L134-L187) 抽真实 PNG 落项目素材 | 任意秒、首尾帧取帧；sourceVideoNodeId/sourceFrame/sourceTime；项目绑定与失败反馈 | UI [frameTimecode.ts:1–15](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/nodes/frameTimecode.ts#L1-L15) 取整至 0.1 秒；返回只含 url，没有实际解码 PTS / frame index。不能直接宣称逐帧精确，VFR 尤须标明 |
| 时间轴映射 | [timelineTypes.ts:32–50](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/timeline/timelineTypes.ts#L32-L50) 保存 start/end/offset；[timelineVisualFeedback.ts:44–76](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/timeline/timelineVisualFeedback.ts#L44-L76) 解析源窗口 | 当前等速 clip 的 timeline frame → source window；源节点 provenance | 评论必须分清 timeline frame 与 source time；裁剪/取景需逆变换。clip 可移位/裁切，旧标注不能跟着当前播放头重算目标 |
| 生成与费用 | [writeVerbs.ts:190–195](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/electron/shared/agentCapabilities/verbs/writeVerbs.ts#L190-L195)、[writeVerbs.ts:286–295](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/electron/shared/agentCapabilities/verbs/writeVerbs.ts#L286-L295) 的 draft_shots / generate；[generationRunController.ts:535–591](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/runner/generationRunController.ts#L535-L591) 项目绑定、输入冻结、托管披露、确认、Run 入口 | Agent 先改草稿，再按当前授权策略请求生成；保留现有费用 / 上传语义 | “发送意见”是输入提交，不自动成为新的任意花费权限。生成成功不等于意见已满足；保留原结果和候选结果供对照 |

## 建议最小接缝（方案，未实现）

1. **反馈层与内容层分开。** 在现有图片 / 视频焦点预览上加“评论”模式，点、框、笔刷只是意见锚；默认不写图片像素。使用主方案中的统一反馈记录 owner，不给白板或视频再建各自评论库。白板继续作为真内容编辑器；两者可共用笔刷等成熟底层能力，但结果语义不同。
2. **定点时冻结目标。** 绑定 project、nodeId、resultId、assetId/contentHash、媒体原始宽高；selector 归一化到媒体坐标。视频另外绑定源媒体时间、取样帧附件；若来自时间轴，附 clipId/timeline revision、timeline frame、source-window/framing 快照。框选不是自动对象分割或跨帧追踪。
3. **回到同一个输入框。** 用户完成标记后，把“图 1 · 反馈 3 条”作为现有 composer 的草稿引用，而不是立刻发请求；保持用户已有输入、附件和选中技能。展开可看每条缩略图、区域、时间、原文和删除操作。原图、反馈可视化图、mask 是三个不同用途的 asset；原图永远保留。
4. **发送冻结同一个反馈集合。** 提交 comment id + opinion revision/fingerprint + 媒体身份 + selector；把这一批 feedback draft 与既有 admission/contextSnapshot 一起校验、持久化。文本投影给 Agent，原图/取帧作为现有多模态 attachment。提交/ACK/失败/重试沿现有 `laneClient.say` 与草稿恢复路径，不做第二套消息队列。ACK 后只清理已发送条目，保留用户随后新增意见。
5. **分三条执行路径。** 本地轻操作（裁剪/旋转/背景移除等）调用现有能力，其中背景移除仍依赖模型质量；全图重生成用现有参考图 + prompt / parameters；局部修补只有模型明确支持 mask 且适配器证明传递了同尺寸 mask 才显示“局部编辑”。查到 [modelAccessCapabilities.ts:202](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/electron/shared/contracts/modelAccessCapabilities.ts#L202)、[modelAccessCapabilities.ts:283](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/electron/shared/contracts/modelAccessCapabilities.ts#L283) 有 mask 能力词汇，但本次未找到从白板/评论到通用 inpaint 执行的闭环；不能因为枚举存在就算可用。
6. **视频首版只做“定位意见 → 优化对应镜头并再生成”。** 暂停、标区域和时间（或明确时间段），传真实帧 + 原视频身份 + 意见；Agent 调整既有镜头草稿及生成参数，复用生成门。标在一个采样帧只说明那个时刻，不承诺整段物体跟踪、视频去物或时序一致 inpaint。多时间点可传多个编号采样帧；当前用户附件多图通道循环产生 image parts，但仍需对实际选中模型做实测。
7. **结果归属与验收。** 生成记录关联 feedback batch；展示原结果 / 新结果及对应意见状态。Agent 的“已生成”只进入待审；用户确认后才完成该意见。结果已切换、源文件变化、评论被重写，旧批次不能自动覆盖或关闭新意见。

## 准确性补充

- 项目素材的版本号当前恒为 1：[projectAssetStore.ts:691–733](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/electron/assets/projectAssetStore.ts#L691-L733) 解释内容寻址，改变内容应生成新 assetId；[assetReferenceIdentity.ts:4–11](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/electron/assets/assetReferenceIdentity.ts#L4-L11) 现场读取文件计算 hash。**不要把 version:1 宣传成已有可递增媒体修订链。** Node 结果历史的 versionNo 由 [nodeResultLifecycle.ts:109–118](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/model/nodeResultLifecycle.ts#L109-L118) 独立维护。媒体反馈应同时绑定结果身份与素材内容哈希；文件外部改变时按反馈冻结 hash 对账，不只按今天的 assetId 取图。
- [useNodeImageEditing.ts:153–159](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/nodes/useNodeImageEditing.ts#L153-L159) 现有 await 后重读 result/history，避免覆盖新历史；这不等于新增异步反馈天然具有全部 stale-result 拒绝语义。新反馈执行应复用现有 admission 证据并冻结原始媒体身份。
- 缩放/裁切/letterbox 的评论坐标使用媒体 intrinsic dimensions 加当前 framing 逆变换；不要复用 React Flow 画布坐标当图片像素。不同版本比例变化不可直接复用原框。
- 原生 MP4 理解、实际 frame PTS、mask 精确区域保持与视频时序修补，本次均未验证；这些是能力验证项，不是产品宣传语。


## 背景移除现有许可核验

只读当前安装包 `@imgly/background-removal@1.7.0`，没有联网推定最新版本或商业合同：

- Nomi 已依赖此库：[package.json:316](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/package.json#L316)；锁定解析版本：[pnpm-lock.yaml:133–136](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/pnpm-lock.yaml#L133-L136)。
- 安装包 `package.json` 的 `license` 字段要求查 `LICENSE.md`；该文件第 1–3 行标明 GNU Affero General Public License，Version 3。安装包 README 的第 178–180 行 License 节也写 AGPL，并提供联系 IMG.LY 咨询其他许可选项的途径。此处只能确认“其他许可需另询”，不能据此声称 Nomi 已取得商业许可。
- 安装包 `ThirdPartyLicenses.json` 分别将 ISNET 模型和 onnxruntime-web 标为 MIT；这些第三方条目不能替代 `@imgly/background-removal` 包自身的 AGPLv3。
- 因此“技术路径可复用”不等于“可无条件按 MIT/Apache 方式搬用”。本次未核验 Nomi 的授权合同或完整分发合规状态；实施阶段应核对已有许可选择，而不是再接入时忽略这个既存依赖。
- 可复核的本机证据目录：`node_modules/.pnpm/@imgly+background-removal@1.7.0_onnxruntime-web@1.21.0/node_modules/@imgly/background-removal/`；`LICENSE.md` SHA-256 为 `5ffb8eaf206c79f334260d6373dc8deda5235901d14e0c34e9b77e4c82cecb87`。这是本次安装包观察，不是法律适用结论。

## 最小验证样本（建议，未运行）

- 图片两处意见、不同原图尺寸 / contain / fill 缩放；发送前选择另一节点，确认仍编辑原结果。
- 标注后原节点产生新图；旧意见能看但拒绝作为当前结果的静默写授权；重新选择才执行。
- 发送过程中新增第三条意见，ACK 只清前两条；失败/重试不丢标注、不重复花费。
- 原图/带编号示意图/mask 同时存在时，模型、适配器明确分清角色；无 mask 能力只允许整图参考重生成。
- 视频 2.34 秒、时间轴裁切并移位、帧比例/取景改变；展示抽样时间精度，不把0.1秒采样伪装成frame-exact。
- 人工意见→Agent调整草稿→现有花费授权→真实模型结果→用户验收/拒绝→版本保留，至少三轮；对应指标为位置复述次数、误改结果率、意见满足率和返工成本。
