# 剪辑执行表：Agent 怎么把「剪辑判断」交出来，引擎怎么照着执行

日期：2026-09-07 · 基线：`origin/main@6a7c81786`
性质：只调研不改码（本分支零生产代码）
服务对象：Agent 运行时重做（`docs/plan/2026-09-07-agent-runtime-rebuild.md`）与分镜表节点（`docs/plan/2026-09-07-storyboard-table-node.md` §4.4「节拍/情绪」列）的下一跳——**从「AI 决定拍什么」延伸到「AI 决定怎么剪」**。

> 用户猜想（本文要验证或推翻的那句）：「**输出一张剪辑执行表，按规则执行。**」

---

## 0. 要回答的问题（先写死，防止跑题）

1. 顶尖产品的 AI 替用户做了哪些剪辑决定、决定以什么形式呈现（直接落轴 / 可审阅的表 / 文本描述）？**有没有人真的把表给用户看？**
2. 行业已有的剪辑表标准（OTIO / EDL）长什么样，我们的表该对齐到哪、偏在哪（R31）？
3. 「剪辑执行表」的字段草案，与拆解表「节拍/情绪」列、分镜 v6 是同一行还是派生表？
4. 现役时间轴引擎按表执行的可行性：覆盖哪些字段、缺哪些、幂等与回退、改表后重执行？
5. 让 Agent 写这张表要给它什么知识？落哪个阶段？
6. 真做的人怎么剪、卡在哪（TikHub 四平台）？

---

## 1. 结论先行

1. **「输出一张表、按规则执行」这条路，我们已经走了 80%，而且走的姿势是对的——只是没人叫它「表」。** `timelineEditPlanSchema`（[`electron/shared/agentCapabilities/timelineRead.ts:134-141`](../../electron/shared/agentCapabilities/timelineRead.ts)）已经是一张**行式剪辑执行表**：`{planId, baseRevision, summary, operations[1..128]}`，9 种行类型（move / remove / split / trim / source-window / ripple / **transition** / **text** / **clip-audio**），有 validate-only 预览（`:161-163`）、有 diff（`:194-201`）、有 CAS 乐观锁（`baseRevision`）、有 undo token（[`timelineWrite.ts:5-21`](../../electron/shared/agentCapabilities/timelineWrite.ts)）、有真人审批闸（[`mcpTimelineConfirmation.ts:66-104`](../../electron/capabilityCore/mcpTimelineConfirmation.ts)），甚至已经有**逐条人话渲染器**（[`timelinePlanSummary.ts:15-21`](../../src/workbench/timeline/agent/timelinePlanSummary.ts) 的 `TimelinePlanLine {text, technical}`）。**所以本文的产物不是「新造一张表」，而是「补齐这张表缺的三列，并把它从一串句子变成一张能横着扫的表」。**（P1：加新必删旧——不许再起第二份 plan schema。）

2. **缺的三列是同一族：全是「跨镜的时间关系」。** ① **音乐与对拍点**——全仓 grep 不到任何 beat / BPM / 卡点检测（实搜 `beat|bpm|tempo|卡点|踩点|节拍`，命中全是 `heartbeat`/`temporary`/供应商音频模型参数）；② **字幕位置**——`TimelineTextClip` 数据层有 `position/scale/rotation/fontFamily`（[`timelineTypes.ts:62-76`](../../src/workbench/timeline/timelineTypes.ts)），但 `text` 操作的 schema 只认 `add/edit/style/time`，**Agent 写不了位置**（`timelineRead.ts:87-98`）；③ **节奏意图**——`transition` 行只说「这两镜之间放什么」，没有任何字段说「为什么」，于是表读起来是一串动作，不是一份剪辑判断。

3. **行业标准（OTIO）能给我们的比想象中少，而它「没给」的那部分正是领域约束的证据。** OTIO 的 `Transition::Type` **只有两个常量**：`SMPTE_Dissolve` 与 `Custom_Transition`（[`otio/src/opentimelineio/transition.h:17-21`](https://github.com/AcademySoftwareFoundation/OpenTimelineIO/blob/main/src/opentimelineio/transition.h)）；核心 schema 里**没有任何音量/增益/包络**（全仓 grep `volume|gain|audio_level|fader` 于 `src/opentimelineio/*.h` 与 `schema/*.py` 零命中）。auto-editor 导出 OTIO 时把音量塞进一个自定义 `Effect`——`effectNode("AudioFader", "Track", …)` 带 `Volume`/`Mute` 关键帧（[`auto-editor/src/exports/otio.nim:264-268`](https://github.com/WyattBlue/auto-editor/blob/main/src/exports/otio.nim)）。**结论：时间与结构对齐 OTIO，音量/字幕样式/节拍必然是扩展点，这不是我们偷懒，是标准本身就把它留给 metadata。**

4. **没有一家顶尖产品把「剪辑决定」做成用户可编辑的表——他们要么直接落轴，要么给一句话。** 全行业现役范式一致是「AI 先做完 → 落时间轴 → 你事后改」，七家逐条实核见 §2.1。**空位是真的，但有两条反证据必须一起读**：① **Descript 的填充词面板已经把这个形态做得很成熟**——侧栏列出全部实例、带时间码、可试听、每条四选一、审完才动手（<https://help.descript.com/hc/en-us/articles/10164806394509-Remove-filler-words>），**说明难点不在形态、在「扩展到全部决策类型」**；② **Premiere 的 AI Assistant 选了「逐步拦截」而不是「整体计划表」**（*"review each step before it happens"*）——一线 NLE 厂商的这个取舍，我们得先想明白为什么，再决定要不要反着做。

5. **别把它做成新表：它是分镜表的第三块列集。** 分镜表节点已拍板「一个节点、一个渲染器、两套列集」（`docs/plan/2026-09-07-storyboard-table-node.md` §0）。剪辑执行表是**第三套列集**，owner 是时间轴（`TimelineState`），不是 `PlanShot`——理由与 §3.4 同构：`进出点/转场时长/音量` 在 `PlanShot` 上没有家，而 `prompt/参考槽` 在时间轴上没有家。**两块数据、一个表格外壳、零份复制。**

---

## 2. 一手来源

### 2.1 顶尖产品：AI 替用户做了什么剪辑决定、以什么形式给出

> **信源纪律**：只采信官方域（capcut.com/help、helpx.adobe.com、help.descript.com、help.opus.pro、captions.ai/help、runway.com/news+changelog、fotor.com）。搜索里大量 SEO 内容农场给的具体数字全部**未采信**。查不到的一律写「未证实」，不拿推测充数。

| 产品 | (a) AI 替你做的剪辑决定 | (b) 你能改什么 · 粒度 | (c) **决定以什么形式给出** |
|---|---|---|---|
| **CapCut / 剪映** | **Auto Cut**（≈「智能剪辑」）分析 *"speech, music beats, or on-screen text to detect optimal cut points"* 并 *"applies dynamic transitions accordingly"*——**切点与转场类型都由 AI 定**，三种模式 Beat Sync / Speech Pause Detection / AI Script（<https://www.capcut.com/help/auto-cut-in-capcut>、<https://www.capcut.com/help/how-to-use-auto-cut>）。自动字幕只决定转写文本与时间对齐，样式/位置不属 AI 决策。2026 的 Agent 官方名是 **EditPilot**（不是「CapCut AI Agent」），官方只列三件事：裁长录像、删停顿/重复段、**重排镜头顺序**（<https://www.capcut.com/resource/how-to-use-editpilot-in-capcut-pc>）。ducking / B-roll / pacing：官方页完全没描述，**未证实** | 落轴后 **per-clip**：拖动重排、删不要的 cut、点任一片段手改。**事前只能调全局参数**：sensitivity（每拍 vs 只强拍）、片段时长区间、转场风格 | **无审批，直接落时间轴**（*"auto-create a cut sequence on the timeline"*）。EditPilot 明写 *"AI handles the first pass and you make the final judgment"*、*"Review the suggested changes"*——**先应用、后审查**。唯一事前闸门是 **Video Studio**：先出 video brief + storyboard，满意了再点 Generate（<https://www.capcut.com/tools/video-studio>）——**但只能靠继续聊天改，不是结构化可编辑表格** |
| **Descript · Underlord** | 单条 prompt 可跑粗剪、视觉风格、B-roll、Eye contact、Studio Sound；能力面含字幕样式/强调、切片与改比例、pan/zoom/fade/callout、音效与音乐（<https://www.descript.com/underlord>、<https://help.descript.com/hc/en-us/articles/36803785502221-Underlord-beta-Your-AI-co-editor-in-Descript>） | **Underlord 侧粒度 = 一次对话轮**（每条 response 独立回滚）。但确定性工具那侧粒度是**逐实例**，见右栏 | **必须分成两套模型讲**：① **Underlord = 直接改 + 事后回滚**——*"Underlord creates checkpoints before making changes… Click the Revert button"*（<https://help.descript.com/hc/en-us/articles/36958274409357-Revert-or-rollback-changes-made-by-Underlord-beta>），**无 diff、无逐条 accept/reject、无可编辑 EDL**。开局的 Project brief *"outlines the plan before any editing begins… wait for your approval"*（<https://descript.canny.io/changelog/release-roundupdecember-4th-2025>）**只批方向不批操作**；v2 的 *"presenting its initial plan"* 是**播报不是闸门**。② **确定性工具反而做出了真 diff**：Edit for Clarity 把删掉的内容以**划线保留在稿子里**、改写显蓝色（<https://help.descript.com/hc/en-us/articles/36841959272717-Edit-for-Clarity>） |
| **Runway** | **Runway Agent**（2026-05-13）*"develops story beats and lays out a full visual direction"*（<https://runway.com/news/introducing-runway-agent>）。**Aleph 2.0 + Edit Studio** 是**画面内容编辑**不是剪辑装配（<https://runway.com/news/introducing-aleph-2-and-edit-studio>）。**全线不做卡点/自动选曲/字幕排版这类剪辑决策** | 时间轴级 trim / split / reorder（Final Cut tab，2026-07-09 changelog），或继续聊天让 Agent 改。⚠️ help.runwayml.com 对抓取返回 403，**逐镜头粒度未能从官方页直读，部分未证实** | **两个真实事前闸门，但都不是表**：Agent *"proposes a concept and story structure. Refine it through conversation until the direction is right."*——**对话文本，官方未描述任何结构化 shot 列表**；Edit Studio *"preview your change as an image so you can shape the look before you commit"*——**图像级预览** |
| **Adobe Premiere Pro** | 切点（Scene Edit Detection / 删转写文字 / AI Assistant 粗剪 stringout）、停顿与口癖删除、reframe 的运动关键帧、语音降噪量、object mask 追踪、素材整理。**转场、配乐/卡点、字幕样式、ducking 不由 AI 决定**（Essential Sound 的 ducking 是规则式、用户配置） | 完整 NLE 粒度：每个切点是真实剪辑、每个 reframe 关键帧可单独改、全进 Undo/History | **逐项核实，无一是「先出表后批准」**：Text-Based Editing 删词后留**灰色删除线**——**事后留痕不是事前清单**；Scene Edit Detection 是**事前对话框选模式**（Apply cuts / Create clip markers / Create subclips）然后直接执行，**没有任何「检出切点列表供勾选」**（<https://helpx.adobe.com/premiere/desktop/edit-projects/change-clip-sequence/detect-edit-points-using-scene-edit-detection.html>）；**AI Assistant（2026 公测）的 "Always ask permission" 是 *"review each step before it happens"*——逐步拦截，不是一份可整体审批的计划文档**（<https://helpx.adobe.com/premiere/desktop/premiere-ai-assistant/overview.html>） |
| **Opus Clip** | 选哪些片段成片、in/out 点、片长、片内装配顺序、口癖/停顿删除、布局与主讲人跟随裁切、字幕文本/位置/样式/emoji、B-roll 选择与插入点、标题描述话题标签、**virality score (0–99)** 本身。配乐选曲/卡点/ducking 官方无描述，**未证实** | per-clip 编辑器带真时间轴（Trim/Extend、拖拽重排 scene、Change Layout、Manual Reframe、Change Captions、Add Transition Effects）。字幕**词级**多选可改；B-roll **逐条**可点选/拖动/裁剪/改 prompt 重生成。弱点：裁切随时间变化**无关键帧控制，未证实** | **结果页可切 Grid / List View，默认按 virality score 从高到低排序**，可按分数或原片时序重排、筛选、点赞踩（<https://help.opus.pro/docs/article/virality-score>）。**但这是「从已渲染完成的候选里挑」，不是「审批将要发生的编辑」**——字幕、reframe、B-roll 在你看到列表前就已经烘进去了。有 **Export to XML**（Pro），但*"Auto captions… will be exported as overlays and **cannot be edited in Premiere Pro**"*（<https://help.opus.pro/docs/article/import-to-adobe-premiere>）——**事后交接产物，不是事前计划** |
| **Captions（captions.ai，现已并入 Mirage）** | AI Edit *"Pick a style and get auto captions, transitions, B-roll, music, and motion graphics"*，并自动检测停顿与填充音删减（<https://captions.ai/help/docs/project/ai-edit>）；prompt-to-video 路径由模型 *"apply choice transitions, sound effects, music, zooms, cuts, and other edits"* | **逐词字幕计时**（点任一词拖动改起止）、**逐效果**（时间轴选中改颜色/位置/图片或删）、**逐剪点**（生成前 Recommended cuts 单条恢复）、逐 shot 时长可调 | **本轮唯一的「生成前设置面板 + 可逐条驳回的剪点清单」**：点 Create my video 后**先进设置面板**，含 Prompt / Voiceover only / **Recommended cuts（检出的停顿与口癖，可逐条恢复原音）** / Style + edit intensity / Color / Custom media。**但它只覆盖「删哪些音频段」**，zoom / B-roll / 转场 / 选曲都只能靠 style + intensity 间接调。Chat to edit **无闸门**：*"starts planning the edits and shares updates as it updates the project"*——边规划边改。⚠️ **未证实现役是否存在名为 "Mixer" / "Studio" 的产品**，官方 help 索引与站点均无这两个名称的文档页 |
| **Fotor Video Agent** | *"auto-orchestrates scenes, timing, visual FX, and kinetic typography—while keeping text, numbers, logos, and charts editable on a multi-track timeline before you render"*（<https://www.fotor.com/ai-video-editor/>），另自动生成配乐/配音/字幕。切点/镜头选择/转场时长/卡点/ducking/reframe 官方**均无具体描述，未证实**——Fotor 重心是 motion graphics 合成，不是长素材粗剪 | **元素级，本轮最细的产物粒度**：*"every clip and AI-generated element sits on its own track"*、*"delete scenes, mute, hide, or drag anything, anytime"*；支持**局部重生成**：*"select any segment… revise it alone, with the rest staying locked and untouched"*；文字/数字/logo/图表在渲染前保持可编辑对象、不烧进像素 | **直接落多轨时间轴。** 存在一个局部审批闸但**仅限 B-roll**：*"identifies key timestamps, generates storyboard image previews for your approval, and then renders the approved frames"*——**图像预览审批，不是结构化计划对象**。<br>⚠️ **重要更正**：`Motion Package Plan` 这个词在 **Fotor 任何自有页面、帮助中心、博客或报道中均未出现**（直搜词组 + 抓 fotor.com/video + fotor.com/ai-video-editor + Product Hunt 四条路径全核过）。搜索会撞到**同名无关产品 [motion.so](https://motion.so/)**（"Motion, the Frontier Agent for Motion Design"）——**§2.3 那条创作者原话极可能是把两者混淆了。判定：未证实/疑似不存在，不得当设计先例引用。** |

**crux 的答案（直说）：没有一家给出「覆盖全部剪辑决策（切点+顺序+转场+配乐+字幕+B-roll）、用户可见、可逐项编辑、批准后才执行」的表。** 全行业现役范式一致是：**AI 先做完 → 落时间轴 → 你事后改**。

**但有四个真实存在的局部前置闸门**（这四个是实核的，可引用）：

| 接近度 | 产品 | 是什么 | 覆盖面 | 出处 |
|---|---|---|---|---|
| **最接近「表」** | **Descript 填充词面板** | 侧栏列出**全部检出实例 + 时间码 + 试听**，每条四选一（Delete / 换空隙 / Ignore / 仅删文字），**审完才动手**；另有 "Avoid harsh cuts" 开关 | 只覆盖「删哪些词」 | <https://help.descript.com/hc/en-us/articles/10164806394509-Remove-filler-words> |
| 次接近 | **Captions AI Edit 设置面板** | 生成**前**的 Recommended cuts 清单，逐条可恢复原音 | 只覆盖音频剪点 | <https://captions.ai/help/docs/project/ai-edit> |
| 逐步拦截型 | **Premiere AI Assistant** | "Always ask permission"：*"review each step before it happens"*；Reasoning 可展开看 *"the steps it planned"* | 全流程但**逐步**，非整体计划文档 | <https://helpx.adobe.com/premiere/desktop/premiere-ai-assistant/overview.html> |
| 挑选型（非审批） | **Opus Clip 结果页** | 按 virality score 排序的 Grid/List，可排序筛选点赞踩 | **候选已渲染完毕**，挑的不是决策而是成品 | <https://help.opus.pro/docs/article/virality-score> |

**方向性前置闸门（只批风格/概念，不批操作）**：Descript Project brief、CapCut Video Studio 的 brief + storyboard、Runway Agent 的 concept and story structure——**三者都只能靠继续对话改，都不是结构化可编辑表格**。
**图像级预览闸门**：Runway Edit Studio、Fotor B-roll storyboard 预览——**是图不是表**。

**对本文的含义（两条，第二条是反证据，必须一起读）**：

1. **空位是真的。** 「用户可见、可逐项编辑、批准后才执行的完整剪辑决策表」目前确实无人占据，作为设计假设成立。
2. **但有两个反证据必须先答**：① **Descript 已经证明这个形态在单一决策类型（删词）上非常成熟好用**——说明难点不在形态、而在**扩展到全部决策类型**；② **Premiere（一线 NLE 厂商）选择了「逐步拦截」而不是「整体计划表」**——这个取舍值得先想明白为什么，再决定我们是不是要反着做。**这两条直接决定 §6.3 探针的价值：探针要量的正是「扩展到全部决策类型时，引擎接得住几格」。**

**未证实项汇总（诚实清单）**：Fotor "Motion Package Plan"（疑似与 motion.so 混淆）；剪映「图文成片/一键成片/智能卡点」当前产品状态（capcut.cn 首页现主打智能剪口播与智能解说粗剪，前三者已不在首页 AI 列表）；CapCut EditPilot 的 undo / 选择性回滚机制；Descript 回滚早期轮次是否连带撤销后续轮；Captions 是否存在现役 "Mixer"/"Studio" 产品；Opus Clip 的裁切关键帧控制与是否支持 EDL 导出；Runway Final Cut 逐镜头粒度（help.runwayml.com 返回 403）。

### 2.2 行业标准与开源近邻（R6 / R31）

#### 2.2.1 OpenTimelineIO —— 该对齐的那份（实读源码）

克隆 `AcademySoftwareFoundation/OpenTimelineIO@main` 实读，全部 `file:line` 指该仓库。

| 概念 | 出处 | 字段 | 对我们的意义 |
|---|---|---|---|
| 时间 | `src/opentime/rationalTime.h:29-30,52-55` | `RationalTime{ _value, _rate }`，`rescaled_to()` `:58-66` | **有理数不是浮点**：29.97 与 24 混轨时浮点秒会漂。我们已经是 `frames + fps` 整数（`timelineTypes.ts:78-90`），**语义等价**，无需改。 |
| 素材条目 | `src/opentimelineio/item.h:53-56,59-67,71-76,80-85` | `enabled` / `source_range` / `effects[]` / `markers[]` | `source_range` = 我们的 `offsetStartFrame/offsetEndFrame`；`markers[]` **我们完全没有**（见 §3.5）。 |
| 片段 | `src/opentimelineio/clip.h:22-25,43-49` | `Clip.2`；`media_references` 是一张 **map** + `active_media_reference_key` | 一个片段可以挂多份素材（代理/成片）并切换。我们是单 `sourceNodeId`。**有意不同**：我们的素材身份是画布节点，代理切换不是本地优先桌面的问题。 |
| 轨 | `src/opentimelineio/track.h:18-22` | `Kind::video = "Video"` / `Kind::audio = "Audio"` | 只有两种。我们有三种（image/video/audio，`timelineTypes.ts:4`），image 是我们对「静帧当镜头」的领域扩展。 |
| **转场** | `src/opentimelineio/transition.h:17-21,39-45` | `Type::SMPTE_Dissolve` / `Type::Custom_Transition`；`(name, transition_type, in_offset, out_offset, metadata, enabled)` | **只有两个标准常量**，其余全靠 `transition_type` 字符串 + metadata。`in_offset/out_offset` 分别是切点前/后各占多久——**比我们的单个 `durationFrames` 表达力强**（能表达非对称转场），见 §3.6 偏差登记。 |
| **标记** | `src/opentimelineio/marker.h:22-26,37-41` | `Marker.3`：`name / marked_range / color / metadata / comment` | **这是「节拍」「情绪」「音乐对拍点」在标准里的家。**（`marked_range` 允许零时长 → 单点 beat mark。） |
| 音量 | 全仓 grep `volume\|gain\|audio_level\|fader` 于 `src/opentimelineio/*.h` + `src/py-opentimelineio/opentimelineio/schema/*.py` = **零命中** | — | **标准里没有。** 通行做法见下条。 |
| 时间轴 | `src/opentimelineio/timeline.h:20-23,31-59` | `Timeline.1`：`global_start_time` + `Stack tracks` | 我们无 `global_start_time`（永远从 0 起），**有意不同**：本地优先的项目没有节目时码起点。 |
| 序列化 | `builtin_adapters.plugin_manifest.json` | 内置只有 `otio_json` / `otioz` / `otiod` | **CMX3600 / FCP7 XML / FCPXML / AAF 全部已拆成独立仓**（`OpenTimelineIO/otio-cmx3600-adapter` 等，见 <https://opentimelineio.readthedocs.io/en/latest/tutorials/adapters.html>）。想导出 EDL 要额外装包。 |

**音量在生态里怎么办（实证）**：auto-editor 的 OTIO 导出把音量写成**自定义 Effect**——`effectNode("AudioFader", "Track", "", false, [keyframeParam("Volume",0), keyframeParam("Mute",1)])`（`auto-editor/src/exports/otio.nim:264-268`），片段级还有 `clipPanner` 走 `PanProcessor`（`:259-262`）。**这就是标准的扩展点被正常使用的样子**，不是谁在乱来。

#### 2.2.2 CMX3600 EDL —— 该知道它为什么不能用

`otio-cmx3600-adapter` README（<https://github.com/OpenTimelineIO/otio-cmx3600-adapter/blob/main/README.md>）自己的能力矩阵：**支持**单条视频轨、音频轨与片段、Gap、Markers、转场、线性变速、CDL、图片序列；**不支持**多条视频轨、嵌套、**音视频特效**、复杂变速。`write_to_string()` 的 `reelname_len` 默认 **8**（可设 `None` 解除）。

**判定：EDL 是 `non-aligned` 都算不上，它是「查过了，确实装不下」。** 一张剪辑执行表里我们最在乎的三件事——**字幕文本、音量包络、音乐对拍点**——EDL 一件都表达不了（无特效 = 无字幕层、无音频电平）。**所以对齐目标是 OTIO 而不是 EDL**，EDL 只在「用户要把片子拿去 Avid/达芬奇接着剪」时才作为**导出**目标存在（那时丢掉的东西必须明标，D4）。

#### 2.2.3 自动/LLM 剪辑计划器（实读三个）

| 项目 | 计划数据结构（file:line） | 有转场吗 | 有音乐/对拍吗 | 有字幕吗 | 有音量吗 |
|---|---|---|---|---|---|
| **auto-editor**（Nim 重写版） | `src/timeline.nim:24-30` `Clip{src,start,dur,offset,stream,effects}`；`:32-43` `Transition{kind,at,dur,alignment}`，`TransitionKind` **只有 `tkDissolve`**，`TransitionAlignment` = `taStart/taCenter/taEnd`；`:46-60` `v3{res,tb,bg,sr,v,a,s,langs,effects,…,vt}` | ✅ 但只有溶解，且**只有对齐方式没有语义** | ❌ 切点判据是音量阈值/运动，与音乐无关 | 🟡 有独立字幕轨 `s*: seq[seq[Clip]]`（`:53`），但那是**搬运源字幕**不是生成 | ✅ 走 OTIO 自定义 Effect（见上） |
| **clipsai** | `clipsai/clip/clip.py:6-41` `Clip{start_time, end_time, start_char, end_char}` | ❌ | ❌ | ❌（`start_char/end_char` 只是转写文本上的区间） | ❌ |
| **MoneyPrinterTurbo** | `app/models/schema.py:18-32` `VideoConcatMode{random,sequential}` / `VideoTransitionMode{none,Shuffle,FadeIn,FadeOut,SlideIn,SlideOut,ZoomIn,ZoomOut}`；`:91-160` `VideoParams` 含 `bgm_volume=0.2`、`subtitle_position="bottom"`、`font_size=60`、`voice_volume=1.0` | 🟡 有词表，但**是一个全局参数不是一行一格** | 🟡 有 BGM 与音量，但**全片一个值** | 🟡 有位置/字号/动画，同样**全片一个值** | 🟡 同上 |
| **LAVE**（IUI'24，<https://arxiv.org/abs/2402.10294>） | 论文级：LLM 先为素材生成语言描述，再由 agent「plan and execute relevant actions」，用户可用 UI 手动修正 agent 的动作 | 论文未给可执行 schema（**未核实是否开源了数据结构**） | ❌ | ❌ | ❌ |

**三条读出来的判断**：

- **没有一个开源计划器把「转场为什么这么接」写进数据。** auto-editor 有 `alignment` 却没有 `why`；MPT 有转场词表却把它降成全局设置。**「一行一格」和「全片一个值」的差别，就是剪辑判断和批处理参数的差别**——MPT 那份不是剪辑执行表，是渲染配置。
- **音乐永远是「另一件事」。** 三个里没有一个把 beat 位置和切点放进同一份数据。这与 §2.3 自媒体的原话完全吻合（卡点是他们最在意也最手工的一环）。
- **auto-editor 的 `TransitionAlignment{taStart,taCenter,taEnd}` 值得抄。** 它回答的是「这 12 帧溶解是吃前一镜、吃后一镜、还是各吃一半」——正是 OTIO 用 `in_offset/out_offset` 表达的东西。我们现在只有一个 `durationFrames`，**语义上默认了「各吃一半」但从没写下来**（`ffmpegFiltergraph.ts:268` 的 `Math.floor(minimumDuration / 2)` 是默认时长不是对齐方式）。

#### 2.2.4 按表渲染的引擎（我们最终要落到哪一层）

| 引擎 | 表怎么驱动它 | 出处 |
|---|---|---|
| **FFmpeg `xfade`** | `transition` 枚举 **58 个**（`-1 custom` + `0 fade` … `57 revealdown`，含 `wipeleft/slideup/circlecrop/dissolve/pixelize/zoomin/hlwind/…`），参数 `duration` / `offset` / `expr` | 本机 `ffmpeg -h filter=xfade` 实跑（FFmpeg via homebrew）。音频侧 `acrossfade` 有 `duration/overlap/curve1/curve2`，曲线含 `tri/qsin/esin/hsin/…` |
| **我们自己的导出** | **不用 `xfade`，用 `blend` 表达式** —— 注释写死理由：随包的 Windows FFmpeg 4.x 没有 `xfade`（[`electron/export/ffmpegFiltergraph.ts:185-193`](../../electron/export/ffmpegFiltergraph.ts)）。音量走 `volume=` + `afade`（`:75-86`），多源走 `atrim → asetpts → adelay → amix`（`:393-401`） | 同左 |
| **Remotion** | `<TransitionSeries.Sequence durationInFrames>` + `<TransitionSeries.Transition presentation={…} timing={linearTiming({durationInFrames})}>`；字幕类型 `Caption{text, startMs, endMs, timestampMs, confidence}`，`parseSrt`/`serializeSrt`/`createTikTokStyleCaptions` | Context7 拉的官方文档（`packages/docs/docs/transitions/…`、`packages/docs/docs/captions/parse-srt.mdx`） |
| **MoviePy** | `concatenate_videoclips` / `CompositeVideoClip` / `crossfadein` / `audio_fadeout` / `volumex` / `SubtitlesClip` | 未逐行核实源码，仅 API 面（**只读没跑**） |

**Remotion 的 `Caption` 形状值得直接抄**：`startMs/endMs/timestampMs` 三个字段里，`timestampMs` 是「这条字幕的代表时刻」——用于把一串词按时间聚成一页。我们现在只有 `startFrame/endFrame`（`timelineTypes.ts:70-71`），做不了「逐词高亮」这类今天短视频的标配。

#### 2.2.5 音乐对拍：数据是什么形状

- **librosa `beat.beat_track`** → 返回 `(tempo, beats)`；`beats` 的单位由 `units` 选 `'frames' | 'samples' | 'time'`，`sparse=False` 时退化成稠密布尔数组（<https://librosa.org/doc/latest/generated/librosa.beat.beat_track.html>）。**本机没装 librosa，未实跑**。
- **标准里存哪**：OTIO 的 `Marker`（`marker.h:22-26,37-41`）——`marked_range` 可以是零时长，`color` 可以做强弱拍分色，`metadata` 放 BPM/downbeat 标志。**这是「beat 该存哪」的现成答案，我们不需要发明。**

### 2.3 自媒体来源（TikHub · 2026-09-07 实抓）

抓取命令（原样，可重跑）：

```bash
export TIKHUB_API_KEY="…"        # 只从环境变量读
node scripts/research/tikhub-search.mjs --q "AI 短剧 剪辑 节奏"  --platform all --limit 15 \
  --out docs/research/2026-09-07-edit-decision-table-for-agent/tikhub/a-ai-drama-rhythm/
node scripts/research/tikhub-search.mjs --q "剪映 智能剪辑 AI"   --platform all --limit 15 \
  --out docs/research/2026-09-07-edit-decision-table-for-agent/tikhub/b-capcut-smart-edit/
node scripts/research/tikhub-search.mjs --q "AI 视频 卡点 音乐"  --platform all --limit 15 \
  --out docs/research/2026-09-07-edit-decision-table-for-agent/tikhub/c-beat-sync-music/
```

产物附件：`docs/research/2026-09-07-edit-decision-table-for-agent/tikhub/{a-ai-drama-rhythm,b-capcut-smart-edit,c-beat-sync-music}/tikhub-search.{json,md}`。三组各 60 条（抖音/小红书/B站/X 各 15），零失败。

| 平台 | 出处 | 作者 · 日期 | 原文摘要（未改写） |
|---|---|---|---|
| 小红书 | [链接](https://www.xiaohongshu.com/explore/6a217719000000003503ab71) | 雨欣爱剪辑 · 2026-06-06 | 「一句话结论：传统短剧靠"人剪"，AI 短剧靠"指令控"。前者依赖剪辑师的经验肌肉记忆，**后者依赖 Prompt 对节奏参数的定义**」 |
| 小红书 | [链接](https://www.xiaohongshu.com/explore/69875a5b000000000c0342f4) | 阿星 · 2026-02-07 | 「剪辑从来不仅仅是拼接画面，它是**对时间、信息和情绪的二次重塑**。很多同学的视频之所以看着"平"、"流水账"，是因为所有场景……」 |
| X | [链接](https://x.com/ponyodong/status/2096811315490930707) | 波妞 PONYO · 2026-09-07 | 「做 AI 短片，最磨我的经常不是生成画面，是画面终于满意以后，还有几十份素材等着我拼……我把剪好的正片和旁白导进了 Fotor Video Agent……它返回了一份 Motion Package Plan，随后把 22 个 MG 元素放进独立叠加轨。视频、声音、图形都留在多轨时间轴上，**后续还可以继续改**。」<br>⚠️ **`Motion Package Plan` 已实核为查无实据**（Fotor 自有页面/帮助中心/博客/Product Hunt 四路全核，该词零出现；疑似与同名无关产品 [motion.so](https://motion.so/) 混淆，见 §2.1）。**这条只能用来证明「拼素材很磨人」与「留在多轨上还能改」，不能用来证明存在一份计划对象。** |
| X | [链接](https://x.com/huoshan007/status/2096801631387935187) | 火山哥 · 2026-09-07 | 「给它一条点赞百万的视频，**它能把人家的镜头怎么切、文案怎么断句、情绪爆发点在哪，全给你拆成数据**，然后照这个骨架给你生成好几版不一样的。」 |
| X | [链接](https://x.com/ai_muzi/status/2095104458275369112) | 木子不写代码 · 2026-09-02 | 全自动流水线原话是七步：「参考资产 → 故事板 → 逐镜生成 → 动态质检 → **音乐卡点 → 时间线剪辑** → 导出 MP4」 |
| B站 | [链接](https://www.bilibili.com/video/BV1nRNH6CEby) | 李一帆 AIGC · 2026-07-10 | 「**如何判断剧情需要什么音乐？如何让 AI 生成符合情绪变化的 BGM？如何让多个片段自然衔接？**」 |
| B站 | [链接](https://www.bilibili.com/video/BV1Ly4y1q7ZZ) | 南门录像厅 · 2020-11-20 | 「**卡点剪辑的核心是分析音乐，然后以多变化的运动画面与音乐进行匹配**」（十万播放量级的老教程，方法论至今是共识） |
| 抖音 | [链接](https://www.douyin.com/video/7681992664065782693) | AI 短片制作教程 · 2026-09-06 | 「**为什么 AI 生成了 20 个分镜成片还是很僵硬？** 这个 skill 帮你设计镜头」 |
| 抖音 | [链接](https://www.douyin.com/video/7671670230296366362) | 艺谋学长 · 2026-08-08 | 「为什么你做的画面会缺乏紧张感、节奏感？因为你的画面太"静"……让你的画面动起来」 |
| 小红书 | [链接](https://www.xiaohongshu.com/explore/6a65d135000000001c00dc42) | 导演小单 · 2026-07-27 | 「AI 视频，现在虽然是可以一下子生成 15 秒的镜头组，有一些镜头的组接在 AI 生成的时候就已经剪辑好了，**但是依然还是要用剪辑来**……」 |
| 小红书 | [链接](https://www.xiaohongshu.com/explore/6a9d6ce3000000001103b1d0) | 硬核科技雷达 · 2026-09-06 | 「很多人以为做 AI 短剧就是：写一句提示词，点击生成，然后直接发布。真正进入制作流程后才会发现，**AI 更像一个速度很快的"素**……」 |
| 小红书 | [链接](https://www.xiaohongshu.com/explore/6a73edb5000000002c0012b3) | 万里挑一个镜头 · 2026-08-20 | 「剪映这两年疯狂加 AI 功能，广告吹得挺猛，但到底好不好用？今天我实测了 5 个常用功能……✅ AI 字幕：清晰普通话……」 |

**读到的真实摩擦（不是功能列表）**：

1. **"平"和"流水账"是同一个病，而且他们已经能说清病因。** 阿星那句「对时间、信息和情绪的二次重塑」和 2026-07-21 那条已被 [`radar:104-111`](2026-09-07-radar.md) 收录的「AI 最常犯的错误就是把每句话平均切成一个镜头」是同一个诊断的两面。**这条已经有三个独立来源了**（论文 KathaTrace/PersonaShot + 自媒体 + 本轮），不再是推测。
2. **卡点是「手工重镇」，而且他们知道正确做法。** 南门录像厅的「先分析音乐，再让运动画面去匹配」，与 §2.2.3 的发现互为反证：**方法论是清楚的，缺的是把 beat 位置变成机器可读的数据**。
3. **创作者会自发地用「它返回了一份计划」来描述发生了什么——哪怕产品并没有给。** 波妞那条初读像是「产品级已经在做先给计划再落轨」，实核后 `Motion Package Plan` 在 Fotor 那边**根本不存在**（§2.1）。**但这个误记本身就是证据**：一个熟练创作者用完 Agent 之后，脑子里自动生成了「计划」这个对象——**说明它是他心里已有的心智模型，产品不给他也会自己造一个**。真正被验证的是那句「留在多轨时间轴上，后续还可以继续改」——**用户要的是可改的中间产物，这一点是真的**。
4. **「拆成数据」这个动词已经进了创作者词汇。** 火山哥的「镜头怎么切、文案怎么断句、情绪爆发点在哪，全给你拆成数据」——**这句就是本文标题的用户版本**。它同时印证：拆解表（读）和执行表（写）是同一张表的两个方向。
5. **他们要的不是全自动。** 导演小单「AI 已经把一些镜头组接好了，但依然还是要用剪辑来……」，波妞「后续还可以继续改」。**没有人在要一键成片，都在要一个能改的中间产物。**

---

## 3. 「剪辑执行表」字段草案

### 3.0 先说清它是什么（D6）

**大白话**：用户现在让 Agent 改时间轴，Agent 会返回一串操作，界面把它渲染成**一句一句的话**（「把『镜3』移到 00:12.400」）。这没错，但一串句子**扫不出节奏**——你没法一眼看出「我这 20 镜是不是每镜都 3 秒」「转场是不是全是硬切」「字幕是不是全挤在最后半秒」。

**这张表要解决的摩擦**就是这一件事：**把「一串动作」变成「一张能横着扫的判断」**，和分镜表节点解决的摩擦是同一个（`storyboard-table-node.md` §1.3 第 1 条：「表不是表，是一摞卡」）。

**核心取舍一句话**：表里的每一行，是**一个操作**（今天 `operations[]` 的形状，机器好执行、人难扫）还是**一个镜头**（人好扫、但一镜可能对应多个操作）？——见 §3.3。

### 3.1 字段草案（按镜一行）

| 列 | 类型 | 从哪来 | 引擎今天能执行吗 |
|---|---|---|---|
| **镜序** `shotIndex` | `int` 1-based | 时间轴上按 `startFrame` 排序派生 | ✅ 派生，非存储 |
| **片段** `clipId` | `string` | `projectedClip.id`（`timelineRead.ts:213-228`） | ✅ |
| **进点** `startFrame` | `int` | `clip.startFrame` | ✅ `move` / `ripple` |
| **出点** `endFrame` | `int` | `clip.endFrame` | ✅ `trim` |
| **时长** `durationFrames` | `int` | 派生 = `end - start` | ✅ 派生，**不存**（双真相源会被 `check:heavy-path` 抓） |
| **源窗** `sourceWindow` | `{startFrame,endFrame} \| null` | `clip.sourceWindow` | ✅ `source-window` |
| **转场类型** `transition.type` | `cut\|dissolve\|fade\|match_cut\|whip_pan` | `projectedTransition`（`timelineRead.ts:247-254`） | 🟡 **只有 `dissolve`/`fade` 真能渲染**，`match_cut`/`whip_pan` 被导出器降级成硬切并只发一条 warning（[`ffmpegFiltergraph.ts:277-279`](../../electron/export/ffmpegFiltergraph.ts)） |
| **转场时长** `transition.durationFrames` | `int?` | 同上 | ✅ 缺省 = `min(默认, 两镜较短者/2)`（`ffmpegFiltergraph.ts:268`，`DEFAULT_TRANSITION_FRAMES = 15` 在 `:169`） |
| **转场对齐** `transition.alignment` | `start\|center\|end` | **新增**（抄 auto-editor `timeline.nim:34-36` / OTIO `in_offset+out_offset`） | ❌ 引擎今天硬编码「各吃一半」 |
| **字幕文本** `text` | `string` | `projectedTextClip.text` | ✅ `text add/edit` |
| **字幕进出** `text.startFrame/endFrame` | `int` | 同上 | ✅ `text time` |
| **字幕样式** `text.style` | `caption\|title` | 同上 | ✅ `text style` |
| **字幕位置** `text.position` | `{x,y}` 归一化 | `TimelineTextClip.position`（`timelineTypes.ts:72`），预设 caption `y=0.86` / title `y=0.5`（[`textLayout.ts:26-29`](../../src/workbench/timeline/textLayout.ts)） | ❌ **数据层有、Agent 写不了**（`text` 操作 schema 无 position，`timelineRead.ts:87-98`） |
| **音量** `audio.gainDb` | `number` dB | `projectedClipAudio`（`timelineRead.ts:207-212`） | ✅ `clip-audio`（正增益故意不支持，`timelineTypes.ts:26`） |
| **淡入/淡出** `audio.fadeIn/OutFrames` | `int` | 同上 | ✅ `clip-audio` |
| **静音** `audio.muted` | `bool` | 同上 | ✅ `clip-audio` |
| **音乐起止** `music.startFrame/endFrame` | `int` | 音频轨上的 clip（`TIMELINE_TRACK_DEFINITIONS` 有 `audioTrack`，`timelineTypes.ts:93-97`） | 🟡 能放能移，但**没有「这是配乐」的语义**——它和任何音频 clip 长得一样 |
| **对拍点** `beats[]` | `int[]` 帧 | **没有任何来源** | ❌ 全仓无 beat/BPM 检测（实搜确认） |
| **节拍角色** `beat.role` | `铺垫\|推进\|转折\|爆点\|留白` | `storyboard-table-node.md` §4.4 档② 的 `PlanShot.beat` ⚠️ **但它和片种档案里已有的 `emotion` 枚举是两个词表，见 §5.2.1** | ❌ 未落地（那条本身待拍板） |

### 3.2 与 OTIO / EDL 的对齐与偏差（R31 三格）

| 我们的东西 | 规范链接 | 我们的偏差 | 偏差理由（必须是领域约束） |
|---|---|---|---|
| `frames + fps` 整数 | OTIO `RationalTime{value, rate}`（`rationalTime.h:29-30`） | **无实质偏差**（同构：`value≈frame`、`rate=fps`） | — |
| `transition.type` 五枚举 | OTIO `Transition::Type` 只有 `SMPTE_Dissolve`/`Custom_Transition`（`transition.h:17-21`） | 我们多了 `cut`/`match_cut`/`whip_pan` | **`cut` 是有意的**：`timelineTypes.ts:8-12` 已写死理由——「必须区分作者写下的硬切与忘了写转场，否则 Agent 可以宣称任意片段边界都是设计过的」。`match_cut`/`whip_pan` 映射到 OTIO 时应写成 `Custom_Transition` + metadata。 |
| 单个 `durationFrames` | OTIO `in_offset` + `out_offset`（`transition.h:39-45`） | 表达力更弱，只能表达对称转场 | ❌ **这不是领域约束，是偏好。判 `non-aligned`，须绑到期日收敛**（见 §6 拍板 2）。 |
| `clipAudio{gainDb,muted,fadeIn/Out}` | OTIO 核心**无音量** | 我们放在 clip 上 | ✅ 领域约束：标准里没有，生态通行做法就是自定义 Effect（auto-editor `otio.nim:264-268`）。导出 OTIO 时映射成同名 `AudioFader` Effect 即可互通。 |
| `TimelineTextClip`（独立文字层） | OTIO 无字幕层；EDL 无特效 | 完全自定义 | ✅ 领域约束：**产物是竖屏短片，字幕是一等公民不是附件**。且 Remotion 的 `Caption{text,startMs,endMs,timestampMs}` 可作导出目标。 |
| 三种轨（含 `image`） | OTIO `Track::Kind` 只有 Video/Audio | 多一种 | ✅ 领域约束：静帧当镜头是 AI 漫剧的主力形态，导出 OTIO 时并入 Video 轨。 |
| **无 markers** | OTIO `Marker.3`（`marker.h:22-26`） | 我们完全没有这个概念 | ❌ **这不是有意不同，是没想到。** 节拍/情绪/对拍点在标准里本来就有家，我们却在考虑给 clip 加字段。判 `没想到`（R29 §第二份必交物的那一格）。 |

### 3.3 一行是一个操作还是一个镜头？（本文最重要的一处判断）

| | ① 一行 = 一个操作（今天的 `operations[]`） | ② 一行 = 一个镜头（新投影） |
|---|---|---|
| 用户看到 | 「把镜3移到 00:12.400」「在镜3和镜4之间加 12 帧溶解」两行 | 一行：`镜3 \| 00:09.4→00:12.4 \| 3.0s \| 溶解 12f \| 字幕"…" \| −6dB` |
| 能横着扫吗 | ❌ 同一镜的信息散在 N 行 | ✅ 一列就是一个维度 |
| 能执行吗 | ✅ 直接就是 `timelineEditPlanSchema` | 🟡 要翻译回操作 |
| 差异怎么表达 | 每行天然是一次改动 | 要额外标「这一格变了」 |

**判断：两个都要，但只有一个是 owner。**
- **owner 仍是 `operations[]`**（P1：不许起第二份可执行 schema）；
- **镜头行是它的投影**——由 `applyTimelineOperations(validateOnly)` 算出的 `preview` 时间轴（`timelineRead.ts:294`）与当前时间轴逐镜对照生成，**和 `timelinePlanPreview.ts:13-19` 的 `removed/added/changed` 三色带用同一份 derive**，不另算一遍。

**理由**：`timelinePlanPreview.ts:4-11` 的文件头已经把这条教训写死了——「从原始工具参数读 `startFrame` 只对两种操作成立；`trim`/`transition`/`text edit`/`audio` 根本不带几何，JSON 派生的覆盖层会静默地在第 0 帧画框，告诉用户一件不真的事」。**镜头行只能从 kernel 的执行结果派生，不能从操作 JSON 拼。**

### 3.4 与拆解表「节拍/情绪」列、分镜 v6 的关系

**三块数据、三套列集、一个表格外壳、零份复制。**

| 表 | owner | 一行是什么 | 时间语义 |
|---|---|---|---|
| 拆解表（事实列集） | `node.meta.shotTable.rows`（`storyboard-table-node.md` §3.1） | **那条参考片**的第 N 镜 | 源片内的绝对秒（`DeconstructShot.startSeconds/endSeconds`，[`deconstructVideo.ts:39-41`](../../electron/video/deconstructVideo.ts)） |
| 分镜表 v6（生产列集） | `storyboardDesignsByDocumentId[…].plan` | **我要拍**的第 N 镜 | 只有 `durationSec`（[`storyboardPlan.ts:130`](../../src/workbench/generationCanvas/agent/storyboardPlan.ts)），**没有位置** |
| **剪辑执行表**（本文） | `TimelineState`（`timelineTypes.ts:78-90`） | **成片里**的第 N 镜 | 成片内的绝对帧 |

**「节拍/情绪」是唯一横跨三者的列，也正因如此它必须是同一套词表。** 拆解表里它是**读出来的事实**（`DeconstructShot.mood`，`deconstructVideo.ts:45`）；分镜表里它是**计划**（`PlanShot.beat?`，待拍板）；剪辑执行表里它是**判断的依据**——「这一镜是爆点，所以前面留 8 帧静默、后面接硬切」。

**派生方向是单向的**：分镜 → 时间轴已经有实现（[`adoptStoryboardBatch.ts:78-91`](../../src/workbench/adoption/adoptStoryboardBatch.ts) 把 `subtitle`/`dialogue` 落成 `textClips`，`:216-226` 把 `node.meta.transition` 落成 `transitions`）。**剪辑执行表不新造这条路，它接在这条路的下游**：落轴之后，Agent 在时间轴上做的是**剪**，不是**排**。

**明确不做的**：不把执行表的字段回写 `PlanShot`。进出点/音量/转场时长在计划对象上没有家，硬塞进去就是 R14.1 要横扫的「两种语义混住一个类型」（与 `storyboard-table-node.md` §3.2 同一条判断）。

### 3.5 markers：本文挖出来的那个「没想到」

OTIO 的 `Marker`（`marker.h:22-26,37-41`：`name / marked_range / color / metadata / comment`，`marked_range` 可零时长）是**「时间轴上的标注」在标准里的家**。我们没有这个概念，于是本能地想给 clip 加字段。

**为什么 marker 才对**：
- 对拍点**不属于任何一个 clip**——它属于音乐，落在时间轴上；给 clip 加 `beats[]` 会让「镜头跨了三个拍」这件事无处安放。
- 情绪/节拍标注要能**跨镜**（「这三镜是一个爆点段」），零时长 marker 与带时长 marker 是同一个类型。
- `color` 正好是 `storyboard-table-node.md` 六角色评审里设计师那条要求（「情绪列必须上色阶，否则它和其它文本列长得一样，扫不出走向」）的数据依据——**标准早就把这一格准备好了**。

### 3.6 表的行式草案（示意，非最终 schema）

```jsonc
// 这不是新 schema——它是 timelineEditPlanSchema 的一层投影 + 三个待补字段。
{
  "planId": "edit-2026-09-07-01",
  "baseRevision": "…",                    // 已有：CAS 乐观锁
  "summary": "按 4/4 拍把 20 镜收成 14 镜，爆点镜前留白",
  "rows": [                                // ← 投影，不是 owner
    {
      "shotIndex": 3, "clipId": "clip_c",
      "startFrame": 282, "endFrame": 372, "durationFrames": 90,
      "beat": { "role": "爆点", "atFrame": 288 },   // ← 待补（→ OTIO Marker）
      "transitionIn":  { "type": "cut" },
      "transitionOut": { "type": "dissolve", "durationFrames": 12, "alignment": "center" }, // alignment 待补
      "text": { "text": "他终于回头", "style": "caption", "startFrame": 290, "endFrame": 360,
                "position": { "x": 0.5, "y": 0.86 } },                                      // position 待补
      "audio": { "gainDb": -6, "fadeInFrames": 0, "fadeOutFrames": 6 }
    }
  ],
  "operations": [ /* ← 真正被执行的那份，owner，形状不变 */ ]
}
```

---

## 4. 确定性执行：引擎按表执行的可行性

### 4.1 覆盖矩阵（现役，实核）

| 表里的东西 | 有 schema | kernel 能应用 | 导出能渲染 | 缺口 |
|---|---|---|---|---|
| 进出点 / 移动 / 涟漪 | ✅ `timelineRead.ts:10-66` | ✅ `timelineKernel.ts:353-560` | ✅ | — |
| 分割 / 源窗 | ✅ | ✅ `:442-528` | ✅ | — |
| 转场 `cut`/`dissolve`/`fade` | ✅ `:68-85` | ✅ `:561-581` | ✅ `blend` 表达式 | — |
| 转场 `match_cut`/`whip_pan` | ✅ | ✅ 存得下 | ❌ **静默降级为硬切**，只发一条 warning（`ffmpegFiltergraph.ts:277-279`） | **词表比引擎宽**：Agent 能写、能预览、导出后没了 |
| 转场对齐 | ❌ | ❌ | 🟡 硬编码各吃一半 | 见 §3.2 `non-aligned` |
| 字幕文本/时间/样式 | ✅ `:87-98` | ✅ `:586-610` | ✅ | — |
| 字幕位置 | ❌ | 🟡 数据层有 | ✅ 渲染认它 | **Agent 写不了**（见 §3.1） |
| 片段音量/淡入淡出/静音 | ✅ `:100-120` | ✅ `:611-642` | ✅ `volume=`/`afade`（`:75-86`） | 正增益故意不支持 |
| 音乐起止 | 🟡 当普通音频 clip | ✅ | ✅ `adelay`+`amix`（`:393-401`） | 无「配乐」语义、无 ducking |
| 对拍点 | ❌ | ❌ | ❌ | **完全没有** |

**一句话覆盖率**：**九类操作里七类端到端可执行**；缺的三样（对拍点、转场对齐、字幕位置）里，**两样是 schema 缺口而非引擎缺口**——数据层和渲染层都已经认，只是 Agent 的输入 schema 不开这个口。

### 4.2 幂等与回退（现役已经有的，不用重造）

| 性质 | 现役机制 | 出处 |
|---|---|---|
| **乐观锁** | `baseRevision` 与当前 `timelineRevision()` 不符即拒 | `timelineRead.ts:137`；`timelineKernel.ts:691` `timelineRevision` = 稳定 JSON 的哈希 |
| **原子** | `applyTimelineOperations` 一次事务，任一操作诊断为 error 全体不落 | `timelineKernel.ts:706-784` |
| **干跑** | `propose_edit_plan` = `validateOnly: true`，返回 `diagnostics` + `diff` + `preview` | `timelineRead.ts:161-163, 282-296` |
| **差异** | `diffTimelines` 结构化 `added/removed/changed` 路径，上限 4096 条并带 `truncated` | `timelineKernel.ts:665-685`；`timelineRead.ts:185-201` |
| **回退** | `undo_timeline_edit{undoToken, expectedRevision}` | `timelineWrite.ts:8-20` |
| **重放识别** | 结果带 `replayed` 布尔 | `timelineWrite.ts:44` |
| **人在环** | apply/undo 必须先过 elicitation 确认；客户端不支持确认就拒绝并说人话 | `mcpTimelineConfirmation.ts:66-104` |
| **计划评审** | `requiresPlanReview: true` + `effect: reversible_write` | `timelineWrite.ts:120-121` |

**判断：确定性执行这一层是本仓最完备的子系统之一，本文不建议动它一行。** 用户猜想里的「按规则执行」——规则引擎已经在了。

### 4.3 用户改表后重执行

**这是唯一一处现役机制答不上来的问题。** 今天的流程是单向的：Agent 提计划 → 用户批准 → 落轴。**没有「用户改了计划的第 7 行，再让 Agent 按新表执行」这一步。**

三条可选路（不在本文拍板，登记为下一份方案的输入）：

| 路 | 怎么走 | 代价 |
|---|---|---|
| **A. 改表 = 改时间轴** | 用户在表里改一格 → 直接生成一条单操作 plan 走同一条 apply 路 | ✅ 零新概念、复用全部闸门；❌ 每格一次审批弹窗（要按「批量」聚合） |
| **B. 改表 = 改草稿，再整体 apply** | 表进入「草稿态」，改够了一次性 apply | ✅ 一次审批；❌ 引入第二个时间轴状态（**P1 风险：并行版**） |
| **C. 改表 = 反馈给 Agent 重规划** | 用户改的行作为约束回喂，Agent 重出整份 plan | ✅ 最省心；❌ Agent 可能覆盖用户手改的行（信任崩塌） |

**倾向 A**，理由是 D1：用户在表里改一格，期望的是「它就变了」，不是「进入草稿模式」。审批聚合是工程问题，草稿态是心智问题。

---

## 5. 模型侧：让 Agent 写这张表要给它什么

### 5.1 它今天已经知道什么

`propose_edit_plan` 的工具描述逐字是：*"Validate and preview an atomic timeline edit plan without changing the project. Valid operation kinds: move, remove, split, trim, source-window, ripple, transition, text, audio."*（`timelineRead.ts:344`）

**这句话里有一个已经在生产的 bug 级不一致**：末尾写 `audio`，但 schema 里那个 kind 叫 `clip-audio`（`timelineRead.ts:102`）。`timelineWrite.ts:98` 的描述同样写 `audio`。**模型照着描述填 `kind:"audio"` 会被 zod 拒。** 这正是 R30「工具写对率」要抓的东西（#547 的 `canvas.write` 0/18 是同一族）。

### 5.2 缺的知识分三层

| 层 | 缺什么 | 怎么给 | 为什么不能靠提示词硬塞 |
|---|---|---|---|
| **能力面** | 哪些转场真的能渲染 | 从 `ffmpegFiltergraph.ts` 的支持集**派生**工具描述，不是手写 | 手写会漂：今天 `match_cut` 在词表里、在渲染里没有，模型学到的是假的 |
| **片种节奏模板** | 「30 秒漫剧该有几镜、爆点在第几秒」 | 走**已有的片种档案**：[`storyboardProfiles.ts:14-28`](../../src/workbench/generationCanvas/agent/storyboardProfiles.ts) 的 `STORYBOARD_PROFILES` 已经是「唯一真相源」的声明式表（`genre.short-drama` 声明 `aspect: '9:16'`、`dialogue: true`、`promptSkeleton` 含 `shotSize` 与 `emotion` 两个枚举段）。**节奏参数加在这张表里，不新起一份** | P4 通用第一：不为每个片种写一段提示词 |
| **时长约束** | 「这条片子总长 30 秒，你不能剪出 47 秒」 | `read_timeline` 已经返回 `durationFrames`（`timelineRead.ts:259`）；约束要进**校验器**不是提示词 | R28：能让门岗拦的别留给模型自觉 |

### 5.2.1 ⚠️ 顺手挖到一处词表冲突（本文之外，但必须记下来）

`STORYBOARD_PROFILES['genre.short-drama'].promptSkeleton` 里已经有一个 `emotion` 枚举，取值是 **`紧张 / 温柔 / 压抑 / 轻松 / 孤独`**（`storyboardProfiles.ts:19`）。

而 `docs/plan/2026-09-07-storyboard-table-node.md` §4.4 档② 推荐的 `beat` 枚举是 **`铺垫 / 推进 / 转折 / 爆点 / 留白`**。

**这是两个词表，不是一个。** 它们回答的是两个不同的问题——`emotion` 说「这一镜是什么情绪」，`beat` 说「这一镜在叙事里承担什么职能」——所以**它们不该合并**，但也**绝不能一个叫 `mood`（拆解引擎，`deconstructVideo.ts:45`）、一个叫 `emotion`（片种档案）、第三个叫 `beat`（待拍板）而没人登记它们的关系**。这正是 `check:vocabularies` 与 R14.1「同一语义有几份定义」要抓的形状。

**登记为本文的溢出发现**：分镜表节点方案 §4.4 落地前，必须先答「`mood` / `emotion` / `beat` 三个词表各自的 owner 是谁、是不是同一个维度」。本文不替它拍板。

### 5.3 与「模型决定 → 引擎执行」模式的接口

> **诚实标注**：任务书点名的 `docs/plan/2026-09-07-generation-strategy-resolver.md` 在 `origin/main@6a7c81786` 上**不存在**（`ls docs/plan | grep -i strategy` 只有 `2026-09-05-timeline-placement-strategy.md`）。本节按仓库里真正在跑的那个同名模式写。

现役形态是**档案声明槽、通用系统填**（P4）：`ArchetypeReferenceSlotKind` 六种槽（[`videoCapabilities/types.ts:31-37`](../../electron/shared/videoCapabilities/types.ts)），每个模型档案声明自己要哪些槽，`AssetReference` 通用渲染器负责填。

**剪辑侧的同构映射**：

| 生成侧 | 剪辑侧 |
|---|---|
| 模型档案声明**参考槽** | **片种档案**声明**节奏槽**（每镜时长区间、爆点密度、允许的转场集） |
| 通用系统按槽渲染 UI 并组装请求 | 通用系统按槽**校验** Agent 产出的执行表 |
| 模型不知道 UI 长什么样 | Agent 不知道 FFmpeg 长什么样 |

**这条映射成立的判据**：两边都满足「**能力面来自声明式数据，执行来自单一引擎**」。不成立的地方要明说——生成侧的槽是**输入**约束（喂什么给模型），剪辑侧的槽是**输出**约束（模型能吐什么），二者不是同一个校验时机。

### 5.4 落哪个阶段

| 阶段 | 做什么 | 前置 |
|---|---|---|
| **S0（可现在做，零产品决策）** | 修 §5.1 的 `audio` vs `clip-audio` 描述不一致；给 `match_cut`/`whip_pan` 一条**显式诊断**而不是静默 warning | 无 |
| **S1** | `text` 操作开 `position`（数据层与渲染层已经认，只是 schema 不开口） | 无 |
| **S2** | 引入 markers（对齐 OTIO `Marker.3`），把节拍/情绪/对拍点落在这里 | 拍板 1 |
| **S3** | 转场 `alignment`（收敛 §3.2 的 `non-aligned`） | 拍板 2 |
| **S4** | 表格视图（复用分镜表节点的表格外壳，第三套列集） | S1–S3 中至少两项 |
| **S5** | beat 检测 → 对拍点 | S2；且需一份本地音频分析能力（新依赖，走 R20 build-vs-buy 闸） |

---

## 6. 六角色短评 · 拍板 · 最小探针

### 6.1 六角色（R7）

**CTO** — 我最在意的一句话是 §1.1：**这张表已经存在，只是没有表格视图。** 任何把它写成「新建剪辑执行表 schema」的实施方案我直接打回——那是 P1 违规。真正的工作量在三个 schema 缺口和一个投影层，加起来不到 400 行。另外 §5.1 那个 `audio`/`clip-audio` 不一致必须**这一周**修掉，它是在生产里的、模型每次都会踩的坑。

**设计** — 表格外壳绝对不许再造第二个。分镜表节点方案里已经写死「必须共用 token 与表格视觉」（`storyboard-table-node.md` §2.2），剪辑执行表是**第三套列集**不是第三张表。另外 §3.5 挖出的 marker + `color` 正好解决我在分镜表那份里提的要求——情绪列必须上色阶，现在它有数据依据了。**我反对 §3.6 示意里那个 `transitionIn`/`transitionOut` 双字段**：转场在两镜之间，一镜写两遍就会漂，只在 `transitionOut` 一处存、`transitionIn` 由前一行派生。

**PM** — §2.3 波妞那条是本文最贵的一条证据：**「先给计划、再落多轨、后续还可以继续改」已经被市场验证**。我们不需要说服用户接受中间产物。但我要泼一盆冷水：§4.3「用户改表后重执行」今天**完全没有**，而这恰恰是用户真正会做的第一件事。选路 A 之前先做 §6.3 那个探针——如果连三行的手写表都跑不通，讨论交互形态是空的。

**前端** — 表格投影必须走 `applyTimelineOperations(validateOnly)` 的 `preview`，不许从 operations JSON 拼（`timelinePlanPreview.ts:4-11` 已经把这条教训写死了，那段注释是有人踩过才写的）。缩放/虚拟化照抄分镜表节点的结论（第一版不引入虚拟化）。

**后端** — 我只有一条：**词表比引擎宽是最难查的一类 bug**。`match_cut`/`whip_pan` 今天能写进 schema、能通过 kernel 校验、能在预览里显示，导出时才悄悄没了（`ffmpegFiltergraph.ts:277-279` 只发 warning）。**修法不是补渲染，是让 schema 从渲染能力派生**——R28：能让编译器拦的别留给门岗。

**真实用户（做 AI 漫剧那位）** — 我拆完 20 镜，我想干的事就一件：**看出我这片子哪里平。** 现在 Agent 给我一串「把镜3移到 00:12.400」我根本看不出来。给我一张表，让我横着扫一眼时长那列——全是 3.0、3.0、3.0，我立刻知道问题在哪。**但你们那个转场列如果显示 `whip_pan` 而导出后是硬切，我会觉得整个工具都在骗我。** 这条比加新功能重要。

### 6.2 要拍板（≤2 条）

**T1 · markers 引不引进来（对齐 OTIO `Marker.3`）**

| 方案 | 用户看到什么 | 代价 |
|---|---|---|
| **① 引进（推荐）** | 时间轴上能标「爆点」「对拍点」「这三镜是一段」；情绪能上色；未来导出 OTIO 时这些标注不丢 | `TimelineState` 加一个 `markers[]`、kernel 加一类操作、导出忽略它。约 200 行。**它是新的一等概念**——加了就得一直维护 |
| ② 不引，把节拍挂在 clip 上 | 每镜能标节拍 | 跨镜的段落、不属于任何镜的对拍点无处安放；且与 OTIO 分叉（判 `non-aligned`，要绑到期日） |

**为什么这是产品决策不是实现细节**：marker 是**用户会看见、会自己加、会期待它跟着片子走**的东西，一旦引入就是永久的心智负担。不引入则节拍/对拍这条线到此为止。

**T2 · 转场 `alignment` 现在收敛还是登记为债**

§3.2 已判定单个 `durationFrames` 相对 OTIO `in_offset/out_offset` 是 **`non-aligned`（有标准、没对齐，理由是偏好不是约束）**。按 R31 规矩它只能是在途状态、必须绑到期日。

| 方案 | 代价 |
|---|---|
| **① 现在补 `alignment`**（推荐，跟 S1 一起） | 三处改动：schema、kernel、导出 offset 计算。约 80 行 |
| ② 登记为债 + 到期日 | 零成本，但到期不清门岗会红；且**每多一个消费者，改起来越贵** |

### 6.3 最小探针（零额度，回答「按一张手写表执行三镜，缺什么」）

**目的**：不写任何生产代码，用现役 API 按一张手写的三镜执行表跑一遍，把「表里写得出但引擎做不到」的每一格逼出来。

**做法**（全部在 `tests/` 下，零额度、零网络）：

1. 用 `applyTimelineOperations`（`timelineKernel.ts:706`）造一条三镜时间轴：镜A 0–90f、镜B 90–180f、镜C 180–270f。
2. 手写一份执行表，**故意每一格都填满**：
   - 镜B 起点后移 6 帧（`move`）
   - A→B 转场 `dissolve` 12 帧、`alignment: "center"` ← **schema 会拒，这是第一个红**
   - B→C 转场 `whip_pan` 8 帧 ← **schema 收下、kernel 收下、导出降级成硬切，这是第二个红（而且是静默的）**
   - 镜B 字幕「他终于回头」，`position:{x:0.5,y:0.4}` ← **schema 会拒，第三个红**
   - 镜C 音量 −6dB、淡出 6 帧 ← 应该绿
   - 全片对拍点 `[30, 90, 150, 210]` ← **无处可写，第四个红**
3. 走 `propose_edit_plan` 拿 `diagnostics + diff + preview`，断言：**哪些格进得去、哪些格被拒、哪些格进去了但导出后消失**。
4. 第 3 条的「导出后消失」要真跑 `buildFfmpegFiltergraph` 并断言它发出了那条 warning——**这是唯一能证明「词表比引擎宽」的方式**。

**验收判据**：探针跑完能产出一张「表里 18 格 → 引擎接住 N 格」的计分表。**N 必须由探针数出来，不能由本文声称。** 本文 §4.1 的覆盖矩阵是读代码读出来的，探针是拿来推翻它的。

**预算**：零额度、零网络、单文件、约 150 行测试代码。

---

## 7. 诚实记分

**真跑了的**：
- TikHub 三组关键词 × 四平台 = 180 条，零失败（附件在 `docs/research/2026-09-07-edit-decision-table-for-agent/tikhub/`）。
- 克隆并实读 OpenTimelineIO@main、auto-editor@main、clipsai@main、MoneyPrinterTurbo@main 源码。
- 本机 `ffmpeg -h filter=xfade` / `-h filter=acrossfade` 实跑，58 个转场名逐个抄下。
- 全仓 grep 确认 beat/BPM/卡点检测**零命中**。
- Context7 拉 Remotion 官方文档（Caption 形状、TransitionSeries）。

**只读没跑的**：
- MoviePy 只看 API 面，没读源码、没跑。
- librosa 本机未安装，`beat_track` 的返回形状取自官方文档页，**未实跑验证**。
- LAVE 只读论文摘要与项目页，**未确认它是否开源了可执行的 plan 数据结构**。
- OTIO 的 CMX3600/FCPXML/AAF adapter 未克隆，能力矩阵取自 adapter README。

**没覆盖到的**：
- **没有跑任何真实 Agent**：本文断言的「模型会踩 `audio` vs `clip-audio`」是**读描述与 schema 对照读出来的**，没有 R30 意义上的工具写对率数字。
- **没有跑 §6.3 的探针**（本文只给设计）。§4.1 覆盖矩阵是静态阅读结论，未被执行证据检验。
- 顶尖产品那一节只采信官方域，但**没有一条是本人实操验证的**——都是官方文档/帮助中心/changelog 的转述。产品行为随版本变，读的时候按日期打折。该节末尾另有一份逐条「未证实项汇总」。
- **本文初稿曾把 Fotor 的 `Motion Package Plan` 当成产品先例写进结论，实核后推翻**（更正标记见 §2.1 与 §2.3）。留在这里作为记分：**创作者转述不是产品文档**，哪怕转述得很具体。
- 任务书点名的 `docs/plan/2026-09-07-generation-strategy-resolver.md` 在 main 上不存在，§5.3 按仓库里真正在跑的档案声明模式写（已在正文标注）。
