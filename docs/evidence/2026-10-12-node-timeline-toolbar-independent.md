# 加入时间轴工具栏迁移：独立验收准备

- 独立线：`V-20261012-TIMELINE`，与生产实现线不同。
- 状态：**已完成静态审查、待真实运行**。用户查看交互并确认「看到了 没啥问题」后，生产改动已在任务分支实现；正在等待新构建。以下准备和源码审查不是功能通过证据。
- 走查：`tests/ux/node-timeline-toolbar.walk.mjs`。
- 执行：生产实现获批并构建后运行 `node tests/ux/node-timeline-toolbar.walk.mjs`。
- 产物：`tests/ux/shots/node-timeline-toolbar/receipt.json` 及截图；只有实际运行且亲眼查看截图后才能更新本报告。

## 真实资源及边界

真实 Electron 开发构建，使用独立持久项目、隔离 profile/settings/projects/capability；不用用户项目或凭据，不调用模型，不花额度。画面取仓库登记的真实 AI 镜头 `tests/ux/fixtures/real-shot-640x360.mp4`，抽取 0.5 秒和 2 秒的不同真实帧；音频取现有 `real-narration.mp3`。禁止 `testsrc`、色块或绘制花纹冒充真实资源。项目播种作为前置条件明示，动作全部走生产 UI，没有 stub 或 store 写入伪造采纳成功。

覆盖：image/video/asset/audio 及 legacy shot/output 图片结果选中工具栏内唯一可访问 icon、删除旧刘海；click、真实 Enter/Space 激活贴尾、正确轨道、回执、UI 一步 Undo；经版本宫格换主结果后消费最新结果；icon 的原生 Chromium 拖拽分别进入全局时间轴和剪辑节点；zh/en、明暗、1000px 窄窗，检查可点击性和工具栏崩溃标记。

`board:NodeTimelineToolbar/toolbar.retained` 同时正向检查原有功能仍在：图片派生/改图/宫格/抠图/画板/全屏/下载/复制变体/生成记录/版本入口；视频截帧/剪辑/拆解/深度/全屏/下载/复制变体/生成记录；音频下载/复制变体/生成记录。此项对 zh/en 两轨均执行，避免只断新 icon、漏掉迁移时误删旧动作。

未验证：所有上述行为和截图目前均未运行；打包应用、Windows、真实导入 UI、付费生成、只读及多选真实交互闭环也不由本准备稿证明。`node --check` 只检查脚本语法，不可写成产品验证通过。

## 已完成的只读入口普查

刘海唯一生产挂载在 `BaseGenerationNode.tsx`；image/asset/character/scene/keyframe/whiteboard 等图片结果汇入 `ImageQuickActionsToolbar`；所有 video 结果按结果类型汇入 `NodeVideoFrameToolbar`；audio 结果用 `NodeResultDownloadButton` 的通用工具栏。三者均用 `FloatingToolbarShell`，是避免漏迁的最早共享 UI 边界。

全景本体原本排除落轴；全景截图成为 asset。导演台本体和剪辑卡本体是独立节点；它们的输出分别成为 image/video。Agent SVG/HTML/GLB 产物没有 result 媒体，原本无有效落轴入口；固化 SVG 后成为 asset。版本宫格的 hover 条原本只有设主图、下载、删除，不是旧刘海宿主；主节点落轴使用当前主结果。ClipNode 同时消费时间轴拖拽 MIME，因此迁移按钮时需保留拖拽源能力。

另外发现旧可用性门仅拒绝 panorama/error/空 URL，queued/running 残留旧产物会被广告为可用，但采纳 clip 构建随后拒绝；text/model3d URL 也可能误露刘海。这些应由共享媒体可用性门排除，音频的真实采纳能力应保留。

## 本轮源码审查结论

`FloatingToolbarShell` 统一挂载单份 `ToolbarTimelineButton`，点击与拖拽均在触发时重新读取当前主结果；旧刘海挂载、事件处理及整个组件删除。能力判断复用 `buildClipFromGenerationNode`，因此生成中、排队、失败的旧结果不会继续广告可用；结果类型白名单保留图片、视频、音频，排除文本和 3D 模型。全景本体继续明确排除，产物浮条的 `lockNodeId=null` 不获得媒体动作。

标准图片工具栏、视频工具栏、音频下载工具栏均被共享容器覆盖。静态审查发现 legacy shot/output 的图片结果之前虽有刘海，却不满足图片工具栏的 kind 白名单，主线已确认要删除该白名单并按结果类型装配；验收脚本加入了对应真实图片节点。原生 drag 是否被 ReactFlow 拖节点手势抢走仍需真机证明，不能由 JSX handler 存在推导成功。
