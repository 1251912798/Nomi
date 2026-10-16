# 参考入口重设计：旧功能普查与发送边界审计

审计线：`/root/reference_census`（独立只读线）。日期：2026-10-12。基线：`origin/main` `6d28f38632`；从 `4399/Nomi` 读取下列 owner，已比较此基线，所列发送、参考槽、素材与 Agent owner 无差异。本文只增加报告，未改生产代码。静态代码审计；未执行真实模型、付费生成、Electron 操作或 Windows 验收。下面“存在”表示代码存在，不表示这轮真实 provider 验收通过。

用户合同：原有小鼠标 `IconPointer` +「参考」文字；打开节点立刻可见；节点与 Agent 使用同一素材选择 / 点选实现；引用要进入实际发送链，不能只添一个显示 chip。

## 最重要的三个发现

1. 节点种类不止图片 / 视频：文本已支持图片输入，3D 已支持首帧图片，图片族包括角色 / 场景 / 关键帧。`NodeGenerationComposer.hasReferenceControls` 目前只包括图片 / 视频 / 音频 / 3D，不能照抄这个 UI 条件后声称覆盖所有可引用节点。
2. Agent 当前 `projectAgentReferences` 普通 canvas / asset chip **不进入 V4 send**：发送时仅 `.filter(isStoryboardReference)`。媒体原件走 `projectAgentAttachments → projectAgentAttachmentClaims → laneClient.say → createDesktopLaneInput.providerContent`。新入口只写普通 references 会发生“界面带了、请求没有”。
3. Agent 接受上传视频 / 音频，但主进程把非图片归为 `file`，`buildAgentUserContent` 对 file 只处理 PDF 或抽文档文本，视频 / 音频没有原生媒体 part。不能把“有附件 claim / 有视频 chip”当成“模型看过视频 / 听过音频”。新增入口要明确能力边界，并验证实际 provider payload。

## 节点种类全表及新入口归宿

种类权威：`electron/shared/canvas/edgeAdmission.ts:18` `NODE_KIND_CONNECTS`；执行族权威：`electron/shared/canvas/nodeExecutionKinds.ts`；组件投影：`nodes/registry.ts`。新入口应由这些声明和当前模型能力派生，避免另抄类型名单。

| 节点 | 原有输入 / 用法 | 原有入口 / owner | 新入口归宿与必须保留项 |
|---|---|---|---|
| text 文本 | 图片 + 上游文字；看图写描述、扩写、翻译、拆条 | 左 +；`runner/textActions.ts:31`、`connectedTextPrompt.ts` | 文本加工框也要考虑参考入口；保留选区改写、整篇替换、续写；不能只覆盖媒体 composer |
| character 角色 | 图片执行族，参考由模型各模式声明 | `NodeGenerationComposer.tsx:215`、`NodeParameterControls.tsx` | 同图片入口，保留角色编号与 @ 对应 |
| scene 场景 | 同图片族 | 同上 | 同图片入口，不能只判断 kind=image |
| image 图片 | 文生图 / 改图 / 多图参考等能力由模型声明 | 同上 | 打开即见鼠标 + 参考；无槽的文生图需走已有 mode promotion / 可行动不可用状态 |
| keyframe 关键帧 | 图片执行族 | 同上 | 同图片入口；作为视频上游时保留首帧语义 |
| video 视频 | 首帧、首尾帧、图片参考、视频参考、音频参考、源视频，均由模式声明 | 同上 | 同入口但保留槽用途；不能把首帧 / 尾帧折叠成无差别参考 |
| audio 音频 | 配音 / 音频参考 / 转写；是否有参考由模式声明 | composer `audioIsTranscribe`；`NodeParameterControls.tsx` | 转写保留无台词输入；参考音频、模型切换和上传错误不丢；不是所有 speech 模式都收音频 |
| model3d 3D | 图生 3D 首帧参考；亦可接文本 prompt | composer 明确补有 3D reference controls | 同入口，单帧语义保留；模型无图生能力时不可假成功 |
| director 导演台 | 收图片，自有场景 / 镜头交互；输出图片或视频 | 左 +；`nodes/director/DirectorNode.tsx` | 原自有交互原地保留；不要强塞媒体生成框；Agent 的镜头目标 chip 与参考源分开 |
| clip 剪辑 | 收图片 / 视频；自己读上游素材 | 左 +；clip upload、空态点选 | 保留原有输入与上传，不称为供应商“参考槽”；新统一入口若覆盖此类应仍调用原输入 owner |
| panorama 全景 | 不接输入，可输出图片 | `NODE_KIND_CONNECTS` | 不新增无效参考入口，保留原上传 / 查看能力 |
| whiteboard 画板 | 不接输入，可输出图片 | 同上 | 可作为参考源，不能作为收参考目标 |
| asset 素材 | 不接输入，可作为图片 / 视频 / 音频源 | 同上；`AssetRef` mapper | 保留导入 / 出边；不可在素材自身加“输入参考” |
| shot_table、shot、output、agent-artifact | 不收输入 | 同上 | 不添加无效参考入口；保留已有节点自有功能 |
| 导入 ComfyUI 工作流 / 参数声明型模型 | 任意显式参数参考槽及 source_video；是否吃 prompt 由 binding 判 | `model/parameterReferenceSlots.ts`、`controls/parameterControlModel.ts` | 参数 key、group、首帧 / 图片字段及无 prompt 提示都保留，不能只按六种 archetype 槽硬编码 |

## 模式 / 槽合同

唯一槽词表及媒体准入在 `electron/shared/modelArchetypes/anchorPolicy.ts:7`，数量、必填和依赖在当前 `ArchetypeMode.slots`，不得从模型名字推测。

| 槽 | 接受 | 既有交互 / 发送语义 |
|---|---|---|
| first_frame | image、video | 图片原件；视频是待抽帧接力，`pending-extraction`，不能用视频 URL 或 poster 冒充首帧 |
| last_frame | image | 与首帧有独立语义；两槽时标签保留 |
| image_ref | image | 单 / 数组、characterIndexed 编号；部分模型的首帧位于 image_ref[0]，保留“首帧” tag |
| video_ref | video | 运镜 / 多模态参考视频；不可混入图片数组 |
| source_video | video | 视频编辑 / 处理的源视频，保留单输入意义 |
| audio_ref | audio | 音频参考；`requiresAnyOf` 等跨槽依赖继续由声明校验 |

`resolveReferenceSlots`（`runner/referenceSlots.ts:96`）把画布边 + 手动上传合成一份有序 fills：边按 order 优先、上传补剩余、去重、pending 占容量。UI / 删除 / 容量 / 生成的语义必须一致。`resolveCanvasReferenceConnection`（`model/canvasReferenceConnection.ts:9`）是手动连接准入；`resolveMentionReference`（同文件 :77）是 @ reference-only 策略。@ 永远不建首尾帧边；已有首尾帧时禁止隐式切换破坏语义。新鼠标入口必须明确调用现有哪一种意图，不能自写第三个判据。

## 旧功能逐行保留清单

以下表的“目标位置”是新实现必须对账的合同；实现线 / 独立验收线后续补截图或真实走查名，本文不把未发生的操作填成已通过。

| ID | 原功能及出处 | 目标位置 / 保留规则 | 本轮真 App |
|---|---|---|---|
| N01 | 左 + 给它加输入，新建文字 / 图 / 视频 / 音频；`quickActions/nodeDeriveMenuModel.ts` | 原入口仍可用；新入口共用写入 owner | unverified |
| N02 | 左 + 从素材库添加，`nodeInputActions.ts:122 addAssetInput` | 保留素材卡建在左侧及真实连边 | unverified |
| N03 | 左 + 在画布上点选，`:114 pickCanvasInputFor` | 共用 `canvasPickMode`，一次选择即回，不改变目标 | unverified |
| N04 | 点选 Esc / 空白取消，`components/CanvasPickModeLayer.tsx` | 保留草稿 / 参考，无写入；原始选择器入口可回到 | unverified |
| N05 | 自己 / 不支持 / 满额 / 已接边不可选；`canConnectInput` | 与 commit 同一准入函数，不能只看 MIME | unverified |
| N06 | 添加 / 新建并连线一步撤销；`runAsSingleUndoStep` | 新入口仍走该 owner | unverified |
| N07 | 上传导入 + 连线一步撤销；`addUploadedInput` | 上传中关闭只留已导入素材，不悄悄连边 | unverified |
| N08 | Picker 当前画布 + 项目素材、搜索、加载、上传、浏览全部；`assets/AssetPicker.tsx` | 共用组件、素材池、定位翻转 / clamp；不另造 library | unverified |
| N09 | 单帧槽独立用途、首尾帧标签；`AssetReference.tsx:109` | 首尾帧仍可各自选择、替换、删除 | unverified |
| N10 | 数组多媒体混合行、编号、容量；`AssetReference.tsx:138` | 新入口置顶常见，已选缩略图仍由旧槽投影 | unverified |
| N11 | 参考缩略图点击插入 @；`AssetReference.tsx:151` | 不丢；编号与发送顺序一致 | unverified |
| N12 | 数组同槽重排 / 跨槽禁止；`:152`、`NodeParameterControls.handleReorder` | 保留，不另建顺序副本 | unverified |
| N13 | 删除边来源必须断边、上传来源删 meta；`decideArrayReferenceRemoval` | 新入口显示的删除使用同 owner | unverified |
| N14 | Array 满额和总额、pending 占位；`NodeParameterControls.tsx:350` | 不以显示缩略图数量代替实际容量 | unverified |
| N15 | 拖文件 / 项目文件到节点、上传进度 / 错误；`nodes/useNodeAssetDrop.ts` | 保留原动作，项目 epoch 保护不丢 | unverified |
| N16 | @ 当前参考 / 已出图画布 / 项目素材；`nodes/useNodeMentionSource.ts` | 真建边 / 上传后插 chip，不能仅改 prompt | unverified |
| N17 | 模式切换、模型切换、变体切换、窄能力指路；`NodeParameterControls.tsx` | 模式条留在滚动口外；不能新入口替换掉原模式控制 | unverified |
| N18 | 只读 / locked / panel writeAccess 限制；`nodeWriteAccess` | 付费确认卡只能改自己参考，不擅改画布 | unverified |
| N19 | 上游尚未生成→备齐依赖、视频待抽帧；`NodeGenerationComposer.tsx:185`、run controller | 新入口不触发付费，原生成前守卫不绕过 | unverified |
| N20 | Comfy 无 prompt、显式参数 key及源视频 | 保留原控件和提示 | unverified |
| A01 | Agent + 文件上传 accept 图片 / 视频 / 音频 / PDF / Office / CSV / TXT / MD；`useComposerAttachments.ts:14` | 新参考菜单仍提供原上传，不能只剩媒体 picker | unverified |
| A02 | Agent 拖入文件 / 粘贴图片 / native file；同文件 :100、:160 | 保留三入口、size 限制、预览 ObjectURL 释放 | unverified |
| A03 | 上传中禁止发送、失败禁止发送；`useAgentPanelV4Actions.ts:161` | 新选素材也需真实 ready claim，失败可恢复，不伪 ready | unverified |
| A04 | 附件显示、删除、恢复，`composerAttachmentsFromProjectAgentRefs` | 共用 projectAgentAttachments；不另建素材 chip 数组 | unverified |
| A05 | 项目切换保护 / recovered draft，`useComposerAttachments`、`projectAgentDraftRecovery` | 延迟 I/O 不写进新项目，不删用户后来添加的新参考 | unverified |
| A06 | ACK 后只清捕获的附件、用户中途修改的草稿保留；`useAgentPanelV4Actions.ts:234` | 同 send cleanup，不能选完立即清或失败清空 | unverified |
| A07 | 原 Skill / prompt / 权限 / 模型 / 输入 / 发送 / stop等 composer控制 | 入口增量接入，不挤掉既有控制 | unverified |
| A08 | 导演台“正在改：镜头” focusTag，`ProjectAgentResidentShell.tsx:257` | 保留 target语义；挑参考源不切换正在改的对象 | unverified |
| A09 | canvas 当前选中 nodes -> TargetRef / frozen context；`captureSendContext` | 拾取 source 不改 selectedNodeIds；send 同步冻结真实目标 | unverified |
| A10 | 分镜明确 plan / shot reference，`isStoryboardReference`、`storyboardShotIdsForTarget` | 保留定向分镜引用与过期拒绝；与媒体 claim 分开 | unverified |

## 节点参考进入生成 request 的链

`真实边 / meta上传 → resolveGenerationReferences → buildCatalogTaskRequest.buildReferenceExtras → buildArchetypeInputParams（只当前模式槽） → task extras(archetypeInput + 标准参考面) → electron/catalog/archetypeInput.ts → 既有传输解析 / provider mapping`。

关键出处：`runner/generationReferenceResolver.ts:118`；`runner/catalogTaskActions.ts:195`、`:222`、`:540`；`nodes/controls/archetypeMeta.ts`。图片 / 视频 / 音频按媒体类型分流，不能将 video_ref 放 referenceImages；首帧 / 尾帧与数组参考按当前模式互斥。UI 新入口只接原写入路径，无需另改此 request builder，但必须以 request 测试及真实任务验证没有掉引用。

## Agent 真实发送链与缺口

1. 原文件入口：`ProjectAgentResidentShell.tsx:500` 隐藏 input → `useComposerAttachments.addFiles` → `withProjectAction` 捕获 binding → `importWorkbenchLocalAssetFile` → 主进程导入回执。
2. ready 必需 `asset.id + data.url + data.contentHash`；renderer `projectAgentAttachmentClaims` 只提交 `{assetId,version}`，不信 renderer URL / hash / MIME。
3. V4 `send` 在 enqueue 前捕获附件及选中对象；上传 / error 拒绝；`laneClient.say(... attachments: projectAgentAttachmentClaims(...), target, contextSnapshot)`。普通 `projectAgentReferences` 仅 storyboard 进入该分支。
4. `electron/agentLane/laneDesktopInput.ts:77` 在 prepare 校验项目 claim，`:84` providerContent再次解析；主进程 `resolveProjectAgentAttachmentClaims` 查项目文件及 identity，按实际文件派生 URL / MIME / size / contentHash。
5. `buildAgentUserContent`：vision图片读原件 bytes → image part；支持 native PDF时file part → adapter改写；Office / CSV / TXT / MD读文本进入 prompt。unsupported image / PDF 当前会被丢弃并在模型文本内附注，用户 composer 不一定有明确阻止，这是既有能力提示缺口。
6. video / audio当前不是媒体part，会进入文档 extractor并返回null。必须诚实区分“传入某素材的身份，Agent可以用工具处理”和“这轮模型实际收到影音内容”；不能只靠 prompt 写 URL 解决。
7. 目标为独立 `TargetRef`；当前普通 canvas目标取发送瞬间 `selectedNodeIds`。`focusTag` 只实现导演台计划镜头，不是通用节点 pin。若本轮增加通用固定目标，需显式 owner / 发送合同，不能仅修改显示 tag。

## AssetRef → 真正附件 claim：可复用方式与陷阱

- `AssetRef.id` 不是 projectAsset id：项目源是 `relativePath`；画布源是 `nodeId:resultIdentity`（`assets/assetTypes.ts:160`）。必须保留 `origin`，尤其多结果的 `resultId`，不能总取主结果。
- 已落盘项目素材：`desktop.assets.list`（`src/desktop/bridgeAssetsSurface.ts:13`）返回主进程 canonical DTO。按 `origin.projectId + relativePath` 找回真实资产，再转换成既有附件形状；不要在 renderer 发明 stableAssetId。
- 已落盘画布结果：精确解析 `nodeId + resultId`，优先现有 result.assetId，或原件 result.url 对应项目资产 canonical记录。主进程发送仍验证所属项目和文件；thumbnailUrl只可显示，不可用来代替原件。
- 列表有 cursor，必须遍历；`resolveProjectAssetReferenceIdentity` 已复用 `findProjectAssetById`做分页。**当前 `resolveProjectAgentAttachmentClaims` 只 list前500条**（`projectAssetStore.ts:744`），选到旧素材会拒绝，建议同 owner复用既有分页 helper，避免引入第二套查找。
- 远端 / data画布结果：可复用 `importWorkbenchRemoteAssetUrl`，走绑定项目导入原件，再获取 canonical回执；URL不可直接发vendor，也不可 renderer fetch缩略图再冒充原件。
- **nomi-local importRemoteUrl 不是 canonical附件回执**：`projectAssetStore.ts:573` 这条分支“不复制”，返回 `stableLocalReferenceId`，缺contentHash / size，与list的 `stableAssetId(projectId,relativePath)`不同。直接把该返回对象标ready，会被发送owner拒绝；应再canonical lookup或在主进程添加复用identity owner的精确解析接口。
- 项目workspace文件不一定在 `assets/` 索引内；`workspaceNodeToAssetRef` 可产生任意媒体relativePath，而 `listProjectAssets`只扫assets目录。若不在该索引，必须走现有安全导入 / 主进程解析成内容寻址资产；不能仅字符串改URL。
- imported项目文件、canvas结果跨项目、项目切换、读取失败都需使用原 `withProjectAction + assertCurrent + settleAttachment`；失败保留错误态，不写入新项目。

## 现有测试位置（存在，本文未运行）

| 领域 | 测试 | 已覆盖的核心边界 |
|---|---|---|
| 点选 / upload | `store/canvasPickMode.test.ts`、`quickActions/nodeInputActions.upload.test.ts` | 一次选中退出、取消、上传关闭后不连边、一步撤销 |
| 准入 / @ | `model/canvasReferenceConnection.mention.test.ts`、`agent/referenceEdgeCapability.test.ts`、`.target.test.ts` | reference-only、满额、帧边阻止切模式、种类准入 |
| 槽 / 显示 | `runner/referenceSlots.test.ts`、`referenceSlotsFirstFrameTag.test.ts`、`assets/AssetReference.test.ts` | 顺序、pending、视频抽帧、去重、删除来源、首帧tag |
| 发送投影 | `runner/generationReferenceResolver.test.ts`、`catalogTaskActions.test.ts:902` | 所有档案/模式声明槽可进入request；有序character_ref、video_ref、首尾帧互斥 |
| 参数工作流 | `model/parameterReferenceSlots.test.ts`、`parameterReferenceFirstFrame.test.ts`、`runner/parameterReferenceCatalog.test.ts`、`parameterReferenceVideoRelay.test.ts` | 显式key / group、first-frame、视频relay |
| 文本看图 | `runner/textActions.test.ts:243` | 已连接图片进入request.extras.referenceImages |
| Agent附件 | `ai/projectAgentAttachments.test.ts`、`composer/useComposerAttachments.structure.test.ts` | identity-only claim、拒绝display-only ready、恢复版本、三个原入口 |
| Agent发送 | `ai/v4/useAgentPanelV4Actions.test.ts` | 捕获 / ACK / 保护后来输入、未完成附件不发、分镜定向 |
| canonical identity | `electron/assets/assetReferenceIdentity.test.ts` | 第500条之后、cursor循环、缺失拒绝；当前附件resolver尚未复用此能力 |
| Agent wire | `electron/ai/agentUserContent.test.ts`、`tests/agent-runtime/attachments.test.mts`、`electron/shared/agentLane/laneProjection.test.ts` | image/PDF/text转换、PDF adapter、历史附件展示。没有证明影音原生输入 |
| provider transport | `electron/catalog/referenceOutboundContract.test.ts`、`referenceReachability.test.ts`、`electron/parity/referenceChannelByMode.test.ts` | 声明槽到wire通道对账，仍不等于真实provider响应验收 |

## 实现线必须补的验证

新入口直接共用 old owner，分别断言：(1) 选图后真边/槽状态、数量和顺序；(2) request对应image/video/audio/frame字段确实含选中原件；(3) Agent selected asset转换成canonical assetId claim，主进程产生原件bytes而非renderUrl / poster；(4) 来源拾取前后target不变；(5) 500条之后、历史多结果、workspace非assets文件、原件缺失、非vision、影音能力不足、跨项目和延迟I/O；(6) 上传/拖入/粘贴/删除/取消/重排/撤销逐行保留。

真实 Electron、真实模型/provider、Windows、付费请求均仍为 `unverified`。fixture断言payload有字节只能证明本地转换链，不证明供应商接收或Agent实际理解参考。

## 初版 diff 独立审查（2026-10-12，非最终验收）

审查范围：本任务 worktree 未提交 diff；实现线仍在修订。下列是该轮发现，状态只代表本轮读取时的事实，后续必须用最终 diff / 测试重新结账。未运行应用或真实 provider。

### 必须修复

| 编号 | 级别 | 发现 / 触发 | 影响 / 推荐修复 | 此轮状态 |
|---|---|---|---|---|
| R01 | P1 | 初版 `NodeParameterControls` 只在 `referencesSectionIsEmpty=true` 返回无槽入口；helper 将 `showModeBar` 算作非空 | 多模式模型默认t2i/t2v、当前无slot时没有鼠标入口，直接违背打开即见参考。入口基于实际可呈现 `assetSlots`，并按模型全部可用模式派生媒体 | 实现线已在审查途中改成 `inputReferenceEntry` 并在非empty分支渲染；静态已见，真实UI待验 |
| R02 | P1 | `NodeInputReferenceEntry.onPick` 对 canvas AssetRef仅调用 `connectExistingInput(origin.nodeId,nodeId)` | 素材picker展开同节点所有history，选旧版却连接当前主图，`resultId`被丢。须精确结果，或复用原 `addAssetInput` 创建选中版本的素材节点 | mustfix，已报实现线 |
| R03 | P1 | `useComposerAttachments.addAsset` 用 `canvasNodeToAssetRefs` 验证；mapper允许 `result.url`空、仅 `thumbnailUrl` 的结果作为renderUrl | 缺失原件会导入poster/thumbnail；新main nomi-local分支查不到preview索引便复制成asset，随后prompt称其为selected original。必须从精确 `resultId` 检查原件URL / 原件identity；主进程拒绝preview冒充原件 | mustfix，已报实现线 |
| R04 | P1 | `ProjectAgentResidentShell.pickReferenceOnCanvas` 没有保存/清理 `enterCanvasPickMode`返回的cancel；线程变化只关闭popover | 开始pick后切thread / 卸载宿主仍可用旧闭包添附件到新上下文。绑定发起项目、thread、surface的这一次pick，并在变化/卸载时cancel | mustfix，已报实现线 |
| R05 | P1 | `useComposerAttachments.addAsset` 的附件实例id为 `reference:${asset.id}` | 移除后立即重选，或相同asset在多个recoveredDraft里出现，旧I/O的settle会命中新的/多个实例。`settleProjectAgentAttachment`依赖实例id唯一；应复用 `nextAttachmentId`，去重用独立source/canonical identity | mustfix，已报实现线 |
| R06 | P2 | `addAsset` updater判重不append时，后面仍无条件调用 `uploadOne`；外层opts.attachments可为同一渲染快照 | 同步重复动作可以不增加chip却重复import/preview I/O，复用实例id会放大settle竞争。只让成功准入的新实例启动I/O | mustfix，已报实现线 |

### 应验证 / 规模风险

- 新 nomi-local workspace分支 `fs.readFileSync(absolutePath) → writeAsset` 将大视频整体读入主进程；Agent size限制在导入后检查。建议stat预检和复用现有stream/copy owner。当前作为P2规模风险记录，未实测内存或卡顿。
- 新 `NodeParameterControls.onPickOnCanvas` candidate由旧render闭包的slot/capacity和值判断；应测试point期间模式/容量/target变化，并在提交时用最新owner判定，且回收卸载后的pick。
- `NodeParameterControls`在 `canConnect=false`宿主提供canvas picker不必然越权：既有 `handleAssetPick` 会回落该宿主自己的slot meta，并不建边。应测付费确认卡仅改自己的slot，不能简单把这条路径一概删除。
- 顶部button用于数组选择时popup仍挂在数组行位置；首尾帧时顶部button默认打开首槽。应亲眼检查附着位置、填满时替换/删除、第二槽仍能访问、键盘关闭和恢复焦点。
- Agent source拾取本身未调用selection mutation，通用目标tag也由同一selectedNodeIds派生；静态符合“选参考不改目标”。仍应真实走查单目标、多目标、director focus优先、Esc、thread切换。
- 新 `providerContent` 将main-resolved `assetId`放入媒体reference block，image依然进入bytes；video/audio只给可执行素材identity，并明确未观看/试听。这能支持生成时reuse原件，不证明这轮LLM具有视频/音频理解能力。新增测试目前只覆盖文本block，必须保留image byte断言并做真实任务验证。

### 初版结论

不通过最终交付验收。canonical claim / 分页resolver修复方向正确，已保留原上传按钮、文件格式、Skill等控制；R02–R06与原件身份问题未结账前，不应声称“确实带了用户选择的参考”。本轮审查无生产修改，只追加证据文档。

## 修订版独立复审与行为验证

复审线仍为 `/root/reference_census`，与生产实现线不同。复审对象：实现线针对 R01–R06 的当前未提交修订 diff。本节取代上一节“尚未结账”的时点结论；上一节保留用于审计，不代表当前实现仍有那些缺陷。

| 编号 | 修订证据 | 复审结论 / 边界 |
|---|---|---|
| R01 | `NodeParameterControls.inputReferenceEntry` 独立按 `assetSlots.length` 判定，在empty和普通分支均呈现，媒体类型由模式槽派生 | 静态已核，不再受 ModeBar 非empty条件遮掉；图片/视频/音频/3D真实首开交互仍由实现线走查 |
| R02 | `NodeInputReferenceEntry`所有选素材统一 `addAssetInput`，精确克隆所选 AssetRef；`NodeParameterControls.handleAssetPick`仅当当前结果URL相等时建节点边，否则 `setSingleFrameUrlMeta`存选中的历史原件URL | 静态已核；同URL不同结果身份按同一内容地址消费，不判为带错媒体；单槽完整UI / request待真实走查 |
| R03 | hook精确查 `listNodeMediaResults`的 `resultId`并要求original.url匹配；main拒绝 `isStoredAssetPreviewPath` | hook拒绝poster-only / stale原件的行为测试通过；main guard静态已核，本线未实测磁盘预览拒绝 |
| R04 | Agent保存这一次cancel，在 project/thread/surface/collapsed变化与卸载cleanup；NodeParameterControls也保存cancel并cleanup | 静态已核；真实线程切换/收起/点选循环待实现线走查 |
| R05 | 每次准入调用 `nextAttachmentId`，`referenceSource`仅用于去重；remove/clear同步更新附件ref | 删除重选与旧I/O隔离行为测试通过，不再复用实例id |
| R06 | 用同步 `attachmentsRef`预留准入，后续重复pick直接返回 | 同一个React回合连续两次pick，真实hook只启动一次导入，行为测试通过 |

workspace文件复制修订为现有 `copyAssetFile` owner，替换整份 `readFileSync → writeAsset`路径，静态已核。API回执仍由main-owned identity派生，Agent只提交canonical assetId/version，视频/音频通过可执行原件identity供后续生成复用并诚实说明未语义分析，image仍走现有bytes part。

### 本线新增并运行的行为测试

文件：`src/workbench/ai/composer/useComposerAttachments.behavior.test.tsx`。

命令：`pnpm exec vitest run src/workbench/ai/composer/useComposerAttachments.behavior.test.tsx`。

结果：1个文件、5项通过。验证真实React hook准入/settle行为：

1. 同步连点两次，同一个原件只启动一次导入。
2. 删除后重选拥有新实例id，旧导入完成不把新附件提前标ready。
3. A项目延迟导入不会settle到B项目当前输入。
4. poster-only、原件已变化的canvas结果在导入前拒绝。
5. 选择history原件时导入选中旧版URL，不替换成当前主图。

测试通过ReactDOM挂载真实hook，外部I/O、项目绑定与store读取以确定性替身控制延迟；null DOM宿主不渲染实际控件。因此它是hook行为证据，**不是**真实磁盘导入、Electron选择器、供应商请求、影音理解或Windows证据。

### 修订版结论

当前读取到的修订 diff 中，R01–R06未发现剩余必须改生产代码项；此结论只覆盖本报告范围的独立代码/行为复审，不能替代最终交付验收。最终仍要以生产Electron逐项走查旧功能清单及真实任务结账，特别补：视频首帧选择图片节点历史旧版 → 参考槽及最终生成request确为旧版原件；Agent选参考前后目标稳定；thread切换取消点选。真实provider接收/理解参考、Windows、未跑场景保持 `unverified`。

## 节点 slot point helper 拆分复核

复核 `nodes/nodeSlotReferencePick.ts`：从 `NodeParameterControls`抽出的point选择保留相同slot写入回调，仍调用共享 `enterCanvasPickMode`；source从当前store读取，原件缺失时不可选。`NodeParameterControls`在node/project/mode/meta/edges变化或卸载时取消旧配置pick，避免保留旧slot闭包。

本线新增：`src/workbench/generationCanvas/nodes/nodeSlotReferencePick.test.ts`。命令：

`pnpm exec vitest run src/workbench/generationCanvas/nodes/nodeSlotReferencePick.test.ts src/workbench/ai/composer/useComposerAttachments.behavior.test.tsx`

结果：2文件、11项通过，其中nodeSlot helper新增6项：类型/self/缺失过滤、pending满额与总容量、poster-only拒绝、首个原件精确identity、当前已引用时history原件identity、视频/音频正确路由并读取live source。返回cancel也确认为共享pick owner返回的同一函数。

边界：单槽替换允许总容量满时继续选择是保留行为；当前有总容量限制的档案为数组模式，未发现现有single槽总额可触发的回归。当前point候选会遍历history，若主图已引用则可能使用旧版；测试记录这份现有候选策略，不表示新增了“隐式选择旧版”的产品批准，若未来要求点可见主图必须由owner统一调整。helper测试捕获共享pick callbacks并使用确定性store替身，不证明真实point层鼠标命中或provider接收。

本次拆分范围未发现新的mustfix。Agent交互随后根据用户新要求改为提示词内缩略图 / @ 引用，上方附件显示方案不再作为最终交互合同；前述Agent hook/identity复审仍能作为底层边界证据，新PromptEditor/AssetMention发送位置投影需另行独立审查，本文尚未为新交互出最终结论。


## Agent 句中引用 / @ 的独立审查（最新用户合同）

审查线 `/root/reference_census`；本线只写两份自有行为测试与本文，生产修改由实现线完成。新合同以用户后续纠正为准：节点和 Agent 的小鼠标「参考」立即进入共享画布点选；节点后方独立「+」打开原素材选择器；Agent 保留原「+」多文件上传，打 `@` 使用共享素材候选。引用落在指令句中，沿用节点 `PromptEditor + AssetMention`，不能另起上方一排媒体chips。

### 当前链路核实

- `useAgentReferenceMentions`将 ready 的媒体附件按统一 `numberPromptReferences`编号，给同一 `PromptEditor`注入候选及选择回调。素材库 / 画布候选不是纯插 chip：先 `api.addAsset`取得main canonical receipt，完成后 `insertAssetMentionWhenReady`通过ProseMirror bookmark映射插回句子，图片 / 视频 / 音频共用atom。
- 删除某URL的最后一枚inline atom，经 `droppedMentionUrls`删除同URL媒体附件；同一URL还有其它atom时保留。当前参考候选可再次引用同一原件，不启动第二条导入实现。
- `useAgentPanelV4Actions.send`捕获同一个 `projectAgentAttachments` owner，仍只提交 `assetId/version` claims。主进程 `laneDesktopInput.providerContent`重新resolve这些claims，`projectAgentPromptForSend`按canonical URL对齐并把句中的marker投影为 `@imageN / @videoN / @audioN`；缺少canonical附件的粘贴marker拒绝发送。
- `buildAgentUserContent`的manifest用相同附件顺序绑定编号和assetId；image另有原件bytes image part；video/audio原件assetId只供后续生成复用，明确未观看/试听，不伪装成影音语义输入。Renderer原始URL不会作为vendor URL直接发送。
- 用户气泡从本条消息自己的附件display恢复同一缩略图，不显示内部marker字符串；老消息没有inline marker时仍保留原文件chips，不能抹掉旧附件历史。
- 指向参考不会改变 `selectedNodeIds`。Agent发送target仍由原 `captureSendContext`决定；本次inline URL是参考身份，未额外建立一套目标选择状态。对于用户要求「分别改某些节点」，仍需实现线实证target与canvas snapshot可定位这些原件对应节点；仅manifest存在不能代替真实任务验收。

### 本轮发现及结账状态

| 编号 | 级别 | 触发 / 影响 | 当前核实状态 |
|---|---|---|---|
| R07 | P1 | Agent textarea换共享PromptEditor后，Shift+Enter产生hardBreak；原serializer只保留text/assetMention，发送时两行合并 | 已报实现线；已静态看到共享 `promptEditorContent.contentToPrompt`支持hardBreak→换行，新增serializer回归通过；真实键盘走查由实现线完成 |
| R08 | P1 | creation中立即 `setWorkspaceMode('generation')`后直接建立pick，新surface的旧cleanup取消刚创建的request | 已报实现线；已静态看到pending intent记录project/thread，进入generation后effect才启动pick，cleanup先执行；真实creation首击仍由实现线走查 |
| R09 | P2 | 将Agent原「+」改成单文件AssetPicker会让旧multiple input失去可达入口 | 已报实现线；实现线决定恢复原+直接多文件上传，素材库快速选择走@。本轮首次读取时撤回仍在进行，最终应重新核查 |
| R10 | P1 | A线程显式选参考、I/O中切B、完成后回A：lifetime正确阻止写B，但A recovered附件已ready且有referenceSource，auto-inline effect跳过它；hiddenAttachmentIds却隐藏全部ready媒体，形成用户看不到但会真send的引用 | 已报实现线，当前待修。必须让恢复/取消路径保持ready媒体与句中atom一致，或至少保留可见、可删除的孤儿引用，不可无条件隐藏 |

本轮还核对了旧resident Shell：HEAD本来未挂 `handlePaste/dragHandlers`。因此本文不把该旧缺口误报为此次重设计的回归；hook里保留这些能力不等于resident已经有真实paste/drop入口。

### 本轮运行证据

按新 `addAsset` Promise返回合同修正自有测试：先保存admission Promise，释放确定性延迟I/O之后再await；避免在`act`中提前等待未完成导入造成超时。自有canvas result fixtures补齐required `createdAt`。

命令：`pnpm exec vitest run src/workbench/generationCanvas/nodes/nodeSlotReferencePick.test.ts src/workbench/ai/composer/useComposerAttachments.behavior.test.tsx src/workbench/assets/promptEditorContent.test.ts electron/ai/agentUserContent.test.ts src/workbench/ai/projectAgentAttachments.test.ts`。

结果：**5文件38项通过**。其中自有两文件11项为真实hook / shared point-helper行为；其余为共享serializer、main prompt投影+媒体bytes/manifest、claims的确定性边界测试。仍不是Electron、真实磁盘I/O、provider接收、影音理解或Windows验收。

当前结论：inline引用共用旧owner及canonical claim路径正确；R10未结账前不能通过最终独立验收。R07/R08修复需真实交互复核，R09需最终源码复核。没有新增生产实现，未执行push、merge、付费请求。


### Inline 修订二次复核及新行为回归

本节取代上节待修时点结论；生产仍由实现线修订。

- R09：Agent新增reference picker路径已撤回，原「+」继续原input的multiple上传；节点「+」保留同AssetPicker。Agent小鼠标直选画布，`@`搜索素材池。
- R10：`pendingSources`计数与admissionRevision避免未完成显式选择被auto-inline抢跑；非pending ready媒体缺marker时从同owner恢复atom。删除永久seen跳过，外部替换draft也能恢复inline；hidden只在draft真有对应marker时隐藏ready媒体，不留下隐形附件。
- R11（P2，新）：重复文件上传可由内容寻址owner复用canonical identity，但原UI按附件实例编号、main claims去重，会使UI图片3对应main图片2。已改 `projectAgentAttachments.composerMediaReferences`，按同assetId/version、原发送顺序去重后才编号。新增重复实例 `[A,A,V,B]` → `image1/video1/image2`测试，当前已绿。
- R12（P1，新）：ACK前编辑含@的句子，旧ACK清理会保留新draft却删除其仍引用的captured附件，下一次发送因marker缺claim失败。已改ACK：仅在可清draft时移除所有captured媒体；保留修改后draft中还引用的canonical附件。新增回归先复现红、生产修订后转绿：发送A/B、ACK前新句只留A、ACK后仅保留A附件、再次发送仅claim A、未修改第二次ACK后清空。

本线追加2项真实React inline hook生命周期回归（编辑器为命令宿主，不是实际Tiptap DOM）：A来源显式参考在B线程完成不改B，回A恢复ready参考入句；外部替换draft后同ready媒体恢复inline。与ACK/编号回归一起运行：`pnpm exec vitest run src/workbench/ai/v4/useAgentPanelV4Actions.test.ts src/workbench/ai/projectAgentAttachments.test.ts src/workbench/ai/composer/useComposerAttachments.behavior.test.tsx`，当时 **3文件56项通过**。

### 句中引用到canvas节点locator的独立复核

实现线增加 `resident/agentReferenceContext.ts`：canvas原件准入时保存验证过的 `{nodeId,resultId,originalUrl}`，发送时重新比对live node/result，符合才把现有只读 ContextSnapshot source handle合并进去，标题 `@imageN · node.title`；TargetRef、附件claims与写权限不变。canonical导入后URL与远端原始URL可以不同，该校验以referenceNode原URL验证来源，以附件canonical URL匹配inline marker。

本线新增 `resident/agentReferenceContext.test.ts`，**1文件4项通过**：

1. 两个不同原件的节点按canonical发送编号分别指回原node，prompt出现顺序改变不影响绑定。
2. 源节点删除、同URL结果身份替换、同结果身份URL替换均不冒认。
3. 精确历史结果仍存在时，主图变动不把历史引用替换成主图。
4. 无实际marker、uploading、无canonical assetId、无canvas provenance时不按名字推断节点。

R13（P2，新，当前待修）：已有上传附件canonical URL与显式canvas选择相同，`addAsset`去重分支直接返回，遗漏这次已验证canvas provenance，因此handle不建立。已新增真实hook回归复现：无第二次I/O、仅一个附件实例，但 `referenceNode`为undefined。此回归所在自有hook文件当前8项中1红；等待生产去重分支统一补来源后重跑。

产品边界：一个canonical原件可以被多个canvas节点复用，当前inline格式只保存URL、单一referenceNode不能区分同URL两枚atom分别指哪一个节点。不能靠覆盖单一来源来宣称支持分别调整这些复用节点。不同原件的两节点locator已由单测确认；同原件多节点的操作仍须TargetRef显式目标或明确的多source/拒绝策略，已通知实现线。

尚无本线真实Electron/provider/Windows证据。上述locator单测与hook宿主不能代替Agent实际节点修改闭环。最终独立验收目前只剩R13及同原件多节点歧义策略未结账，不能将旧时点green总数当最终green。


## 最终独立代码 / 行为复审结论（冻结前）

以下为本线最终读取的生产diff和测试结论，取代本文前述各轮尚待修的时点判断。

- **R01–R13均已在本线审查范围结账，无剩余must-fix。** R13去重分支在同一附件owner补验证过的canvas来源，不重复导入；新增真实hook回归现已转绿。
- 同canonical原件多canvas节点：保留首个referenceNode并聚合显式选过的referenceNodes；每个仍存在的精确结果各产一个只读source handle，不覆盖前一个来源。句中同URL仍是同一个媒体引用；设计卡明确这时须用节点名区分，不宣称两枚同URL atom可分别定位两个节点。该限制应保留在交付说明。
- 当前小鼠标入口静态均直入共享pick owner；节点「+」仍原AssetPicker，Agent「+」恢复原multiple上传，Agent `@`走共享素材池。creation→generation的pending pick等待切面后启动，与先前cleanup取消新request的结构不同；最终真实鼠标首击、取消/切项目/线程交互由实现线验收。
- Agent inline / @ / 恢复 / 删除 / ACK均收敛同 `projectAgentAttachments` canonical claim owner。没有以显示URL绕过main identity，也没有另一套refchip发送实现；各类media编号与claims去重后发送顺序一致。

冻结前最终命令：

`pnpm exec vitest run src/workbench/ai/resident/agentReferenceContext.test.ts src/workbench/ai/v4/useAgentPanelV4Actions.test.ts src/workbench/ai/projectAgentAttachments.test.ts src/workbench/ai/composer/useComposerAttachments.behavior.test.tsx src/workbench/generationCanvas/nodes/nodeSlotReferencePick.test.ts src/workbench/assets/promptEditorContent.test.ts electron/ai/agentUserContent.test.ts`

结果：**7文件88项全部通过**；随后 `git diff --check`通过。自有hook文件8项包含R13回归，source-locator新增4项，slot helper6项；ACK/编号新增两项已先红后绿。测试代码保留required createdAt、等待导入的新Promise合同。

本线验收等级：**独立代码 / 确定性行为复审通过**。不是最终交付或已解决收据：本线没有执行真实Electron、真实vendor、付费生成、Windows或merge后验收；没有最终用户样张逐项视觉签收。image bytes和video/audio assetId的本地payload断言只证明进入本地wire转换边界；不代表provider接收或影音语义理解。生产Electron和最终build/gates由实现线提供独立标注的实证，不能用本报告的88项green替代。

本线修改范围仅为证据文档、自有2份测试，以及实现线随后明确授权的ACK/编号/helper测试；从未修改生产源、push或merge。本次报告写完后停止写入，供实现线稳定build。


## 后续只读复查（Agent纯图标 / mounted editor / async插入）

独立线 `/root/reference_census` 在用户“agent上面删掉参考两个字”“保留鼠标icon就行”后只读复查：Agent单处传入iconOnly，节点仍默认有文字；IconPointer复用、aria-label/title保留，未发现must-fix。PromptEditor在原生create/isInitialized后通知；ready媒体变化复用原useAssetPool.refresh，不新增store。

实现线真实Electron发现异步导入与恢复effect重复插atom；独立线指出canonical去重附件可能没有referenceSource。实现线新增两条真实React hook生命周期回归，分别先红后绿：恢复presence读取live Editor JSON而非滞后draft；显式插入pending直到共享insert finally才释放；恢复同时查raw source与project+canonical URL。独立线亲读生产修改与红/绿日志，最终10项hook回归通过，无新增must-fix。本轮独立线未写文件。完整Electron结果仍由实现线报告。

## 最终范围收窄与手势复查（实现线转录）

独立线 reference_census 最终只读消息确认：声明槽恢复原加号数量与位置，小鼠标继续共用点选；捕获拦截器保留到 click 完成再退出，关闭提前卸载导致选择泄漏的窗口。无新增 must-fix，该线没有扩大 UI 或修改生产文件。随后实现线真实 Electron target.preserved / target.sent 均通过；该事实由实现线提供，详见 [实证记录](2026-10-12-reference-entry/acceptance.md)，不能当作独立线亲自操作。


### 最终边界复审（2026-10-12）

独立线 reference_census 只读复核：resident hook 迁移删旧；renderer/main 媒体类型沿原 owner；generation ball→float 使用既有 form owner，未另写 collapsed；PromptEditor 从 transaction.before 透传 previous，删除不读滞后 props。无新 must-fix，无额外 UI 或身份 owner。测试宿主补 mutation 接口、外显异常，DOM-less 性能 adapter 隔离范围明确。该线未写本附记、未执行此次新 Electron；以上为实现线记录其返回的独立结论，真实闭环见 acceptance.md。

### 原加号框独立复核

reference_census 只读核对三个 AssetReferenceButton 调用者：onAdd/open/IconPlus 已删除；AssetReference 声明槽空/已有素材/满额语义保持；NodeInputReferenceEntry 空/已有媒体行均复用未改的 AssetAddTile；Agent 原文件加号仍走 onAddFile。git diff --check 通过，未发现新的 UI 越界或 must-fix。该线未执行真实 Electron，截图和 21 项测试来自实现线。

### 用户授权的同框 icon 设计复核

reference_census 只读复核：原 + 和节点 pointer 共用原 56px 虚线 AssetActionTile，无第二套框样式；原 + 的锚点/label/onClick/selected/className/IconPlus 透传保持，Agent 24px 控件及 16px icon 保持。未发现 must-fix，diff --check 通过。真实 Electron 同框/同排/无文字和交互结果由实现线报告。
