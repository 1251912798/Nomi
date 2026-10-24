# director/agent/
> L2 | 父级: ../CLAUDE.md
> 「AI 来导」：画布助手的 create_staging_reference / create_camera_move 两个工具（契约住 agent/canvasDescriptors，工具名与 schema 不变）在导演台侧的执行体。
> 词表 spec → V1 形状场景（builder，含运行时自检）→ migration/ 迁成导演台工程 → 建 director 节点 + 打自动出图标志 → 常驻 Host 扫到标志才离屏出图 / 出片 → 落 image 节点 / 喂目标镜头。
> 运镜参考只有 AI 工具一条产路（视频节点上的手动运镜控件 2026-09-12 c1b1c9e02 已删），fps / frameCount / move 不变量只在 createCameraMoveReferenceNode 算一次。
> 依赖方向：本目录可 import migration/ 与 scene/（离屏出片要 three 世界），但 model/ 与 scene/ 不反向 import 这里；对外只暴露建节点入口与两个 Host。
> 成员清单
> stagingVocab.ts: 站位词表单一真相（布局 / 机位角度 / 高度 / 景别 / 环境 / 朝向的字面量联合 + 数值表），LLM 工具 schema 与 builder 同源
> cameraMoveVocab.ts: 运镜词表单一真相（13 种运镜、速度 → 秒、景别 → 距离、CAMERA_MOVE_LABEL / _EN 人话）；工具受理回执、工具摘要、运镜小片搭建、挂接提示词地板、镜头条运镜名同源
> cameraMoveFovMath.ts: 变焦 / 希区柯克 dolly-zoom 的 FOV 数学（等价视角保持主体尺寸）
> stagingBuilder.ts: 站位 spec → V1 形状场景（角色环形 / 直线 / 对峙布局、姿态别名 → 预设 id、机位由角度 / 高度 / 景别推）；auditStagingSpec 运行时自检（未知姿态 / 越界 → issues 人话）
> cameraMoveBuilder.ts: 运镜 spec → V1 形状场景（主体 + 机位路径绑定：推拉 / 环绕 / 升降 / 横移 / 弧线 / 变焦，速度决定绑定时长，fov 端点走 cameraMoveFovMath）
> cameraMoveSchedule.ts: frameTimes(start, end, count)：采样时刻序列单一真相（首尾含端点、等距）
> cameraMoveCaptureRetry.ts: 离屏出片重试纯逻辑：结局 ok / null / timeout × 轮次 → done / retry(延迟) / giveUp；默认 3 轮、30s 看门狗
> attachCameraMoveToTarget.ts: 运镜小片 / 3D-BOX 预演喂入目标镜头的纯核（computeAttachCameraMove）：只接视频节点；「已挂好」按当前模型实际槽 + 实际发送的参考列表（含画布连线视频）+ 网址 + 提示词引用对账，一致才 noop，网址标记只用来认上一次挂的是哪条（对外只读口 lastAttachedCameraMoveUrl 只给删参考判断）；有 video_ref 槽则切全能参考模式 + 填参考视频 + 写一句 @[asset:url] 引用标记的参考句（发送时投影成 @videoN，编号不写死），槽被用户的片占满不删用户的片、预演退文字兜底并提示；无槽降级为提示词地板
> directorPreviewReferenceLifecycle.ts: 预演退出事实的唯一 owner：directorPreviewReferenceRemoval（删的是不是此刻挂着的那份预演，挂着哪份由核的 lastAttachedCameraMoveUrl 给）、mark / clear / isDirectorPreviewDismissed（按网址记退出；只有显式挂接清除）
> previewAttachReconciler.ts: 挂了预演的视频镜头换模型身份时经 attachCameraMoveForNode 自动重挂（直接点节点 ↑ 也带预演）；由画布壳 GenerationCanvasReactFlow 挂载；只盯供应商 / 模型键 / 档案 id，不盯方式、变体或参考列表
> attachCameraMoveForNode.ts: 挂接的唯一入口（出成片 / 预演写回 / 运镜小片 Host 都只调它）：读此刻目标节点与连到它的视频边，交给纯核；attachDoors.guard.test.ts 拦生产代码直接调核
> createStagingReferenceNode.ts: 站位参考建节点入口：buildStagingSceneAudited → migrateScene3DState → create_nodes(kind director, meta directorProject + stagingAutoCapture)；readStagingAutoCapture。站位图接目标镜头的唯一判据与写边门：stagingAttachForTarget（与写边总闸同一条规则预判 none / missing / connect / rejected）→ stagingAttachReceipt（Agent 回执照预判说，接不上不许说「连到镜头」）；attachStagingReference（Host 出图后唯一写 composition_ref 边，连完再读画布：connected / not_connected 带一句提示）；attachDoors.guard.test.ts 拦别处直接写这条边
> createCameraMoveReferenceNode.ts: 运镜参考建节点入口（create_camera_move 唯一调用方）：buildCameraMoveScene → 迁移 → create_nodes(kind director, meta directorProject + cameraMoveAutoCapture{targetNodeId, fps 24, frameCount, move})；readCameraMoveAutoCapture
> DirectorHeadlessCapture.tsx: 离屏出片器：隐藏 FencedCanvas + 独立 store，只装环境 / 实体 / 播放求值 / CaptureBinder；等角色 GLB 落地（对象表里出现 characterMount）→ 按时刻序列逐帧 seek + 等两帧 → 机位 1 出片 → 一次回调 frames[]；短边可封顶（参考视频 720p）
> StagingCaptureHost.tsx: 常驻 Host（画布壳按 components/directorCaptureHostActivation 懒挂）：扫 stagingAutoCapture → 出一张 → persistDirectorScreenshot → image 节点（stagingComposition 标记）+ director→image(reference) + 经 attachStagingReference 接镜头（composition_ref；接不上不留假边，图留在画布上，经 hostNotice 后台提示 +「定位节点」）→ 截图写回工程 outputs.screenshots → 清标志
> CameraMoveCaptureHost.tsx: 常驻 Host（运镜小片 + 3D-BOX 整段预演两种请求，同一套重试 / 看门狗 / 落盘）：扫 cameraMoveAutoCapture → 沿机位 1 路径片段区间采 frameCount 帧（720p 封顶）→ persistDirectorFramesVideo 拼 mp4 → 写回 meta.cameraMoveVideo + 工程 outputs.videos → attachCameraMoveForNode 喂目标镜头（挂接提示经 hostNotice：后台档 +「定位节点」对准目标镜头）→ 清标志；看门狗 + 重试（attempt 当挂载 key 整棵重挂）；E2E 桥仅 localStorage 打标时暴露
> hostNotice.ts: 两个 Host 的唯一提示出口 notifyHostOutcome：notify 后台档 + 「定位节点」（FOCUS_GENERATION_NODE_EVENT 对准提示说的那个节点；图和目标镜头常在视口外）；attachDoors.guard.test.ts 拦 Host 自己 toast / notify / 发定位事件
> applyDirectorWrite.ts: 3D-BOX stage_shot（director.write）渲染端执行体：新建 = 编译计划建导演节点（工程 + 计划 + 修订号 + 预演标志）；补丁 = 比修订号 → 按名字应用 → 不变则 unchanged 不写 → 重编译走唯一外部写口；领域拒绝原样交回
> directorWriteCompensation.ts: director.write 一步的撤销补偿：新建删导演节点、补丁放回导演节点 meta，两者都把要挂预演的视频节点放回提议之前（restore-node-fields）
> directorPreviewCapture.ts: 3D-BOX 预演出片纯逻辑：整段 24fps 采帧计划（节目机位 + 等动作片段）、挂接写回 ready（唯一挂接核心，沿用提议事务身份）、重试用尽判 failed；修订变了即丢弃
> *.test.ts: 词表 / builder / 调度 / 重试 / 喂入纯逻辑单测
> 法则: 成员完整·一行一文件·父级链接·技术词前置
> [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
