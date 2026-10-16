# 加入时间轴工具栏迁移：独立验收

2026-10-12，独立线 `V-20261012-TIMELINE`。**本报告范围内通过**：macOS 真实 Electron 开发构建的中文、英文完整任务闭环均成功，共 40 项通过、38 张截图。实现线与本验收线不同；验收线只编辑走查与本报告，没有修改生产代码。此结果不等于合入收据或全仓门岗通过。

最终已整合 main `fdb0b15438`（#1174），并在最新构建完整重跑 `tests/ux/node-timeline-toolbar.walk.mjs`，进程 exit 0。两个语言分别使用隔离 profile 和持久项目，经真实项目库卡片进入生成画布，两个 app 均已关闭。最终运行时 `dist/build-stamp.json`：HEAD `288c60482c4887f1a292a5728e0a74fea6b356fb`、含未提交改动的 tree `0972d955a8b7ddfbd04f57b164dbeedb8fa1f293`、dirty=true；不能把 HEAD 单独当作验收源码版本。后续仅归档截图和更新本报告，不改变已运行生产实现。

历史证据：整合前 HEAD `6da9dc1d78d321bfd9328c960e8900d30c5c1a52`、tree `a84753443d751bf1bbaba9e72ae778247110e352` 的完整双语也曾 40 项通过。它是前轮证据，最新交付判断以上段整合后复跑为准。

本地收据 `tests/ux/shots/node-timeline-toolbar/receipt.json`：state=passed，paidCalls=0，SHA256 `a45c25bcb8afbd9f61d899fb0f0810c627c9f7ba92ae60e1927b82e148513aa9`。原始目录被 Git 忽略；最终双语 app 全部关闭后归档下面两张关键截图，随 PR 可访问，其余 36 张与原始收据仅本地。前后两轮收据内容相同，故 SHA256 相同；收据本身不含运行时间或构建身份，需结合上段记录读取。

已归档：[中文 Alt 自由落轴与 Undo 回执](2026-10-12-node-timeline-toolbar/zh-CN-native-drag-global-timeline.png)、[英文暗色窄窗视频工具栏](2026-10-12-node-timeline-toolbar/en-dark-narrow-video.png)。两图都来自整合后的最终完整运行，并已经直接查看。

## 真实资源与方法

使用仓库登记的真实 AI 镜头 `tests/ux/fixtures/real-shot-640x360.mp4`，抽取 0.5 秒和 2 秒的不同 PNG 帧；要求文件大于 200KB 且 SHA256 不同。音频使用已有 `real-narration.mp3`。没有 testsrc、色块或绘制花纹，没有模型调用，没有使用用户项目或凭据。

播种 version 2 持久项目是明示前置条件。加入、键盘、设为主图、拖放、Undo、分类、清选和视口适配全部走生产 UI；未写私有 store、合成 DataTransfer、stub 成功结果或使用 force 点击。选中前点击经 elementFromPoint 证明的真实空白 pane，再证明仅一个节点被选中；落轴前证明 baseline 片段确实存在且可见。

复跑需先构建当前全树；本机 TMPDIR 规范为 realpath，避免 macOS /var 与 /private/var 别名影响门岗夹具。最终命令：

```sh
python3 -c 'import os; os.environ["TMPDIR"]=os.path.realpath(os.environ.get("TMPDIR","/tmp")); os.execvp("node",["node","tests/ux/node-timeline-toolbar.walk.mjs"])'
```

## 双语行为结果

以下每行都在 zh-CN、en 两个独立 app 中完整执行。

| 范围 | 实际断言与结果 |
| --- | --- |
| image、video、asset 图片、audio、legacy shot 图片、legacy output 图片 | 工具栏内恰好一个 add-to-timeline 真 BUTTON；aria-label 已本地化、draggable=true、图形为 Tabler IconTimeline；旧 direct-child 刘海不存在 |
| image、video、asset、audio 点击 | 对应结果加入正确媒体轨，成功回执可见；真实时间轴 UI 一步 Undo 删除新增片段，baseline 保留 |
| legacy shot / legacy output | 分别用真实 Enter / Space 激活，加入图片轨 frame 60，回执和一步 Undo 完成；未遗漏旧 kind 的有效图片结果 |
| 图片贴尾 | 已有 baseline 为 [0,60)，点击后新增 clip id 末尾为 60，证明接在已有片段后 |
| 切换主结果 | 通过现有版本宫格将 image-r2 设主图，预览切到第二个真实帧；点击只采纳 r2，旧 r1 不落轴；一步 Undo 移除 r2 |
| 默认原生拖入全局轴 | 实际 native dragstart 写入生产 MIME，真实 drop 收到同 MIME；把 icon 拖到 frame 75 空白位置，未按 Alt 时仍贴尾 frame 60；源节点 transform 不变；一步 Undo 恢复 baseline |
| Alt 原生拖入全局轴 | 根据真实 baseline 宽度 / 60 得出 pixels-per-frame；证明 frame 75 可见、命中轨道空白且超出 baseline；真实按住 Alt，新增片段落 frame 75，指定位置回执可见；源节点不移，一步 Undo 恢复 baseline |
| 原生拖入 ClipNode | 同样证明 native dragstart、drop 的生产 MIME 及源节点不移；剪辑节点出现一个真实片段，img src 为最新主结果 r2 |
| 明暗与窄窗 | image/video 在 light、dark 均留有新图标；1000×800 暗色窗口内 icon 全部在视口内且 elementFromPoint 命中；无 floating-toolbar error boundary fallback |

原生事件 probe 是只读监听：window capture 同步记录事件；在实际 React root 上晚于 React delegated handler 注册 bubble dragstart，读取生产 setData 后的 types。六次拖拽均记录 capture dragstart、after-react-root dragstart、capture drop；后两者含 `application/x-tapcanvas-generation-node`。默认与 ClipNode 的 altKey=false，自由落点的 altKey=true；六次源节点始终 `translate(80px, 120px)`。没有把整节点拖动当作 icon 原生拖放通过。

`board:NodeTimelineToolbar/toolbar.retained` 在两语言均正向检查原入口仍挂载：图片复制变体、派生/改图/宫格菜单、抠图、画板、全屏、下载、生成记录和版本；视频抽帧、剪辑、拆解、深度、复制变体、全屏、下载和生成记录；音频复制变体、下载和生成记录。此项证明入口及原图标保留，没有执行这些编辑工具或付费生成的各自完整闭环。

## 亲眼截图审查

已直接查看最终运行的以下截图；文件均位于本地 `tests/ux/shots/node-timeline-toolbar/`。

- `zh-CN-light-image.png`、`zh-CN-light-video.png`、`en-light-image.png`、`en-light-video.png`：新折线图标在原工具栏末尾，原图标和动作仍在，节点上方没有旧刘海。
- `en-click-video-applied.png`：英文成功回执、Undo 按钮及正确视频轨片段同时可见。
- `zh-CN-native-drag-global-timeline.png`、`en-native-drag-global-timeline-append.png`、`en-native-drag-global-timeline.png`：默认贴尾没有间隔，Alt 自由落点在 baseline 后保留 15 帧间隔，最新主图与回执可见。
- `zh-CN-native-drag-clip-node.png`、`en-native-drag-clip-node.png`：剪辑节点从空轴变为一个片段，图片为最新真实帧。
- zh-CN 和 en 的 `dark-image.png`、`dark-video.png`、`dark-narrow-image.png`、`dark-narrow-video.png`：暗色对比正常，1000px 窗口中新增图标可见；英文长文案没有把末尾动作裁掉。

截图里的生成输入卡、画布其他节点被视口裁切属于原画布布局；本轮检验的是工具栏动作可见可达，没有将其解释为整页所有区域均已适配。

## 不遗漏入口的只读普查与审查

旧刘海唯一生产挂载在 BaseGenerationNode，已删除旧组件、挂载和事件处理。共同 FloatingToolbarShell 在末尾装配单份 ToolbarTimelineButton，新图标为用户指定的 IconTimeline，原 children 图标与顺序保留。点击和 dragstart 重新读取当前节点主结果；查询复用现有 selectCanvasNodeById 索引。

| 原入口 / 同类节点 | 共同归属与本轮证明 |
| --- | --- |
| 普通图片、导入 asset、character/scene/keyframe/whiteboard 等图片结果 | 非 panorama 的 image 结果汇入 ImageQuickActionsToolbar，再进共同 shell；image/asset 真机，其他 kind 为源码路径审查 |
| legacy shot/output 的 image 结果 | 旧 kind 白名单会漏迁；已改按媒体结果装配，两种旧数据真机通过 |
| 普通视频、asset video、导演/剪辑输出视频 | video 结果汇入 NodeVideoFrameToolbar 和共同 shell；普通 video 真机，其他来源为共同路径审查 |
| audio 结果 | NodeResultDownloadButton 和共同 shell，真实加入/Undo 通过 |
| panorama 本体 / 全景截图 | 本体保持排除；截图生成 asset 后走图片路径，源码审查，未执行全景截图流程 |
| Director / ClipNode 本体 | 本体不是新增媒体动作宿主；输出 image/video 经上述路径。ClipNode 作为原生拖放接收方真机通过 |
| SVG/HTML/GLB 产物工具栏 | lockNodeId=null，不装媒体动作；固化为图片 asset 后走图片路径，源码审查 |
| 版本宫格 hover 工具栏 | 原有设主图/下载/删除；主节点工具栏消费当前主结果，真实切主图后 click/native 两路径通过 |

共同可用性门复用 buildClipFromGenerationNode，拒绝 queued/running/error、空结果、非媒体、只读和 panorama，保留 image/video/audio；这些拒绝状态的全量真实 UI 组合未由本走查验证。

相关代码：[共同工具栏](../../src/workbench/generationCanvas/nodes/NodeFloatingToolbar.tsx)、[节点结果分派](../../src/workbench/generationCanvas/nodes/BaseGenerationNode.tsx)、[媒体能力门](../../src/workbench/generationCanvas/model/timelineDragAffordance.ts)、[图片工具栏](../../src/workbench/generationCanvas/quickActions/ImageQuickActionsToolbar.tsx)、[视频工具栏](../../src/workbench/generationCanvas/nodes/NodeVideoFrameToolbar.tsx)、[通用结果工具栏](../../src/workbench/generationCanvas/nodes/NodeResultDownloadButton.tsx)。

## 保留失败与修正边界

最终通过之前发生过真实失败，未将前轮重试记为通过：

1. 验收 fixture 使用不存在的 assets 分类、项目结构不完整或 baseline 缺少 sourceNodeId，导致空画布或 baseline 被正常化移除。按已有持久项目 schema 修正，并增加画布、baseline 可见正向前提；没有改产品 loader。
2. 驱动点击侧边引用手柄，以及 audio→shots 切分类后保留隐藏选择，使截图出现「已选 2 个」、工具栏正常隐藏。改为真实空白 pane 清选和节点内部点击，并断言唯一选中；没有改产品选择语义。
3. **真实产品问题**：采纳成功后 TimelinePanel 自动 fit 改 scale，旧整轴 revision 令成功/Undo 回执立即失效。独立确认消费者需要内容 revision；实现线在共同 kernel 排除顶层 scale/playheadFrame，保留内容事实；回执以同投影 shallow 订阅，Agent 另外保留 Undo 栈依赖。最终 click 与拖放回执、Undo 通过，未删回执断言。
4. **真实产品问题**：工具栏 React pointerdown 的 stopPropagation 未阻止 XYDrag 原生 mousedown，初轮零 native dragstart/drop，整节点拖停误入 canvasDragWriteback，frame 12 与 baseline 重叠被正确拒绝。CDP 捕获实际 throw、base/placement 和 XYFlow 调用栈后定位；实现线在共同 FloatingToolbarFrame 复用现有 nodrag/no-pan 框架类。未放宽碰撞拒绝，未改采纳写后验证。
5. 上述生产修复后首轮 native 已真实落轴，但 capture 内 queueMicrotask 早于 React bubble setData，测试误读 types=[]。在 /tmp 诊断验证事件先后，再将正式只读 probe 改为 root 同层后注册读取；保留 native MIME 与源位置强断言。最后完整双语运行才计为本报告通过。

## 未验证范围与性能边界

未验证：打包应用、Windows、真实导入 UI、付费生成、panorama 截图闭环、只读/多选/排队/运行/失败全组合的 UI 回归、所有旧工具各自编辑闭环、极大 history 载荷起拖耗时、超长时间轴。本轮没有把静态共同路径和单元测试写成这些真机证据。

性能由实现线使用既有真实媒体规模 harness 串行采样，详见[性能报告](2026-10-12-node-timeline-performance.md)。最终生产代码下各 3 次中位数：整合 main 后 60 节点单拖 120.0FPS / P95 10.0ms；300 节点单拖 120.1 / 10.6；300 节点平移 119.8 / 9.9；全部 longtasks=0。300 项目实际视口挂载 180 个节点，素材重复，没有修改前后 A/B；独立验收未亲自执行该采样，不将其解释为证明零性能回归。
