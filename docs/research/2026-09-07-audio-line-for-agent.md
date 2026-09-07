# 声音线：Nomi 到底薄在哪，以及 Agent 该怎么决定「要不要配、配什么」

- 日期：2026-09-07
- 范围：配音（TTS / 角色声线）、音乐 / 音效、唇形同步，以及 Agent 端的「配音决策」形态
- 依据：主仓 `origin/main` @ `6a7c8178`（本文所有 `file:line` 均指该 tree）；供应商官方文档实抓（R5）；开源仓实读（R6）；TikHub 四平台实查
- 结论一句话：**「声音线薄」不薄在模型接入，薄在"谁来决定这一镜该有什么声音"——生成能力早就在了，决策层是空的；而唇形同步这个我们标了半年的缺口，供应商侧已经不缺了。**

---

## 0. 先纠三条我们自己说了很久的话

写这份东西之前，我按 D3（追到底层）把三条我们内部当作前提的说法逐条对了一遍，三条都不完全成立。它们是后面所有判断的地基，所以放最前面。

### 谎言 1：「Nomi 声音能力薄 / 只有个 TTS」

**实情：Nomi 现在有 14 个 audio 档案在册，覆盖配音、音乐、音效、转写四类。**

`src/config/modelArchetypes/index.ts:75` 一行里就登记了：

| 桶 | 已在册档案 | 出处 |
|---|---|---|
| 配音 TTS | `nomi-audio`(gpt-4o-mini-tts)、`eleven-v3`、`eleven-multilingual-v2`、`minimax-speech-2.8`、`volcengine-doubao-tts`（带情感/语气自然语言参）、`seed-tts`（中转） | `src/config/modelArchetypes/audioArchetype.ts:37`、`elevenAudio.ts:12`、`:153`、`minimaxSpeech28.ts:6`、`doubaoTtsArchetype.ts:24`、`seedTtsArchetype.ts:21` |
| 音乐 | `suno-v5.5`、`lyria-3.5`、`minimax-music-3`、`eleven-music-v2` | `sunoAudio.ts:12`、`lyria35.ts:3`、`minimaxMusic3.ts:12`、`elevenAudio.ts:54` |
| 音效 | `suno-sfx-v5.5`、`eleven-sfx-v2`、`runway-seed-audio`（音效+配音双模态） | `sunoAudio.ts:85`、`elevenAudio.ts:77`、`runwaySeedAudio.ts:29` |
| 转写 | `whisper-1`（nomi-audio 的 transcribe 模式）、`eleven-scribe-v2` | `audioArchetype.ts:58`、`elevenAudio.ts:115` |

时间轴那头也不空：固定 3 轨含 audio 轨，clip 级 `gainDb`(-60..0)、`muted`、帧级 fade-in/out（`src/workbench/timeline/clipAudio.ts:3`），导出走真实 ffmpeg 音频链 `atrim→asetpts→volume/afade→adelay→amix`（`electron/export/ffmpegFiltergraph.ts:343`、`:400`），任一素材有音轨就出 `aac/mixdown`。转写还能一键生成 SRT（`src/workbench/generationCanvas/nodes/render/AudioStripNode.tsx:47`）。

**所以「薄」不是能力薄。**

### 谎言 2：「唇形同步 Nomi 暂无，只能诚实标注」（`CLAUDE.md:124` D4 的例句）

这句在**产品**层面仍然成立（Nomi 确实没有），但它背后那个隐含前提——「因为供应商也没有 / 论文还不成熟」——已经不成立了。论文雷达连续四轮报「本方向无合格新料」（`docs/research/2026-08-17-radar.md:67`），于是这个缺口在我们心里被归档成了「等技术成熟」。

**实情：我们自己每天跑的模型雷达里，kie 已经上了三个可直接调的唇形同步端点，只是它们被归在 `video` 桶里，所以扫 audio 桶的时候永远看不见。**

`docs/research/model-radar/kie.json` 里（category 全是 `video`）：

- `volcengine/video-to-video-lip-sync` — **视频 + 音频 → 对好嘴的视频**，正是 Nomi 需要的后处理形状
- `kling/ai-avatar-pro` / `ai-avatar-standard` — 图 + 音频 → 说话视频
- `omnihuman-1-5`（+ `human-identification` / `subject-detection` 两个辅助端点）

论文雷达的结论没错（可自研的 training-free 方案确实没出现），但我们从"论文没进展"推出了"这事做不了"——**推错了一层**：我们是黑盒接入方，供应商上了就等于我们能做。这条教训值得进 `docs/lessons/`：**雷达按 category 桶分诊时，跨模态能力（音频驱动视频）会掉进桶缝里。**

### 谎言 3：「apimart/kie 有 50 个未接音频模型」

**实情：那 50 条是 50 个 endpoint，不是 50 个模型。** 按真实模型身份去重后只有 **3 个新东西**：

- apimart 45 条 = Suno 一家 30 条（extend / stems / crop / fade / bpm / midi / concat…全是同一个模型的编辑动作）+ flow-music 13 条（Lyria 的同类编辑动作）+ 1 条 `tts`（我们已接）+ 1 条 overview
- kie 5 条 = ElevenLabs 4 个（`text-to-dialogue-v3`、`multilingual-v2`、`turbo-2.5`、`audio-isolation`）+ `google/gemini-3-1-flash-tts` 1 个

其中 `eleven-multilingual-v2` 我们**已经有档案**。所以真正的"未接"是：**ElevenLabs 对话 v3 / turbo 2.5 / 人声分离，Gemini 3.1 Flash TTS，以及 Suno·Lyria 的三十多个编辑动作。**

按 D4 诚实交付：把「45 个未接音频模型」写进任何计划都是自己骗自己——那是同一个 Suno 的三十种用法。

---

## 1. 顶尖产品怎么把声音接进创作流（9 家实查）

我按同一把尺子问四个问题：**(a) 声音在哪一步出现 (b) 默认有没有 (c) 谁做决定 (d) 工作单元是什么。**

### 1.1 逐家

**① Kling 可灵（对口型 / Lip Sync）**
- (a) **成片之后**——对已生成的视频追加一步；官方教程页把它放在 "quickstart" 的独立一节（<https://kling.ai/quickstart/ai-lip-sync-guide>）。
- (b) 默认没有，opt-in。
- (c) 用户决定：上传本地配音/歌声，**或**用内置 "Text to Speech" 现生成一条。
- (d) 单条视频。约束：角色人脸要完整，动物不支持（<https://x.com/Kling_ai/status/1841104747832754507>；<https://replicate.com/kwaivgi/kling-lip-sync>）。
- 另一条线：Kling 2.6 起视频模型**自带**对白/旁白/音乐/SFX 原生音频（见 §1.2）。

**② 即梦 Jimeng（数字人 / 对口型 / 配音）**
- (a) 独立的「数字人」工具：**人物图 + 音频 → 说话视频**；配音是同一流程里的前置步骤。
- (b) 默认没有。
- (c) 用户输入台词/旁白文本 → 选系统音色和语速 → 生成配音 → 再喂给对口型。支持声音克隆。
- (d) 单条。底层是字节自研 LOOPY，能按语境自动匹配表情与情绪，高精度段约 9 秒（<https://www.letsclouds.com/news/digital-human-loopy-lip-sync-emotion-matching>；<https://ai-bot.cn/jimeng-ai-digital-human/>）。
- **值得注意**：LOOPY 会「自动加语气、情绪、表情」——这是产品替用户做的**表演层**决定，但仍不是"要不要有声音"的决定。

**③ Hedra（最像 Nomi 的那家，已经全面 Agent 化）**
Hedra 现在是「Agent + Space（画布）+ 手动工具」三件套，文档第一条就是 *Meet Hedra Agent*（<https://www.hedra.com/docs/llms.txt>）。这家值得单独看：
- **Speech 是四个一等手动工具之一**（Image / Video / **Speech** / Edit Video）——配音不是视频的附属，是并列公民（`hedra.com/docs/pages/app/getting-started/manual-tools.md`）。
- **Avatar 流程 = 角色图 + 语音 → 被导演的表演**：「Attach the character image and audio. Explain who should speak, the framing, the tone」（<https://www.hedra.com/docs/pages/app/content-creation/create-avatar-video.md>）。**声音是输入，不是产出。**
- **音乐视频流程是 audio-first 的**：Step 1「Add the song — 上传成片音频」，Step 2「Ask the agent for sections, visual motifs, **a beat-aware shot list**, or a storyboard」，最后 Step 5 在 Composer 里「align cuts to the song」（<https://www.hedra.com/docs/pages/app/content-creation/creating-music-videos.md>）。
- (c) **Agent 会替你排 beat-aware 分镜表**——但要你先给歌。它决定"画面怎么跟着声音走"，不决定"这镜要不要有声音"。

**④ HeyGen**
- (a) 声音是 avatar 视频的**必需输入**，不是可选后处理；产品定位就是 avatar + voice cloning + lip-sync translation（<https://docs.heygen.com/llms.txt>）。
- (b) 必须有——没有音频就没有视频。
- (c) 用户选 avatar + 选/克隆声音 + 给脚本。
- (d) 单条视频；有 CLI 和 MCP，明确为 agent 场景做了 onboarding（`developers.heygen.com/docs/for-ai-agents.md`）。

**⑤ Runway**
- (a) 两条并行的路：**Lipsync**（脸 + 音频 → 对口型）和 **Act-Two**（用一段真人表演视频驱动角色，表情/手势/声音一起迁移）。都是后处理。
- (b) 默认没有。
- (c) 用户上传或生成音频；官方强调"干净音频"是质量前提（<https://runway.com/resources/ai-lip-sync>；<https://help.runwayml.com/hc/en-us/articles/42311337895827-Performance-Capture-with-Act-Two>）。
- (d) 单条。另外 Runway 自家 `/v1/text_to_speech` 和 `/v1/sound_effect` 是并列端点，`seed_audio` 同时出现在两者的 `oneOf` 里（我们已经逐字抄进 `electron/shared/audioCapabilities/runwayAudioWireFacts.ts`）。

**⑥ CapCut / 剪映**
- (a) **在时间轴上**，不在生成阶段。
- (b) 默认没有，但入口极近（底栏【音频】一级按钮）。
- (c) **产品只负责"标出节拍"，用户负责对齐**：导入音乐 → 选「自动踩点」→ 时间轴上出现黄色小点 → 用户把切换点拖到点上。智能配音是选个 AI 音色朗读文案。
- (d) 整条时间轴。（<https://mingnify.com/zh/blog/p/capcut-guide/>；<https://aistacknav.com/capcut-ai-review/>）
- **这是全行业最成熟的"音乐对拍"交互，而它刻意没有全自动。** 值得学的是那个中间态：机器给锚点，人做取舍。

**⑦ ElevenLabs**
- (a) 上游工具，不在视频流程里；但它的 API 形状对我们最有用（见 §2）。
- (b) N/A。
- (c) 用户全控：`stability` / `similarity_boost` / `style` / `speed`，v3 还有情绪标签。
- (d) 单段音频。**关键能力：Music 的 `composition_plan` 可以按"段"指定 `duration_ms`（3000–120000ms）**——也就是说音乐可以**按你给的时长结构订做**，不是先生成再剪。这条后面 §4 会用到。

**⑧ Suno / Udio**
- (a) 音乐先行——先有歌，再有视频。
- (b) N/A。
- (c) 用户给 prompt/歌词/风格。
- (d) 一首歌 + 三十多个编辑动作（extend / cover / stems / add-vocals / crop / fade / concat / **aligned-lyrics（歌词时间线）** / **bpm 分析** / midi）。全异步任务制（<https://docs.apimart.ai/en/api-reference/audios/suno/overview.md>）。
- **`aligned-lyrics` 和 `bpm` 这两个端点是"音乐对拍"的原料**：不用自己做节拍检测，Suno 直接给时间线。

**⑨ MiniMax**
- (a) 上游 TTS/克隆能力，同时 Hailuo/H3 视频线也在做数字人对口型。
- (c) 用户选音色。speech-2.6-turbo $60/M 字符、speech-2.6-hd $100/M 字符、快速声音克隆 $1.5/次；40 语种（<https://minimax-ai.chat/models/minimax-speech-26/>；<https://minimax-ai.chat/audio/>）。
- **B 站创作者对它的评价是本轮最强正向信号**（见 §5）。

### 1.2 还有一条正在吃掉上面所有人的路：视频模型自带音频

Nomi 自己的档案就是证据——这些模型已经在我们目录里声明了原生音频参数：

| 模型 | 参数 | 出处 |
|---|---|---|
| Seedance 全系（1.0/2.5，四个转售源） | `generate_audio` 默认 **true** | `electron/shared/videoCapabilities/seedance.ts:27`、`seedance25.ts:56`、`seedanceApimart.ts:10`、`seedanceVolcengine.ts:14` |
| Wan 3.0（原生 + apimart） | `audio` 默认 **true**，"最长 30 秒，自带音轨" | `wan30.ts:59`、`wan30Apimart.ts:58`、`wan30.ts:127` |
| Kling | `audio`（"声效"）默认 false | `kling.ts:25` |
| Runway | `generate_audio` | `runwayWireFacts.ts:158` |

行业共识已经很清楚：**四秒到十秒的单镜，声音正在变成视频模型的内置产物；跨镜的旁白、配乐、口型对齐，仍然是编排层的事。**

### 1.3 综合：共识长什么样，缝在哪

**共识（9 家全部如此）**：
1. 声音是**用户带进来的输入**或**成片后追加的一步**，从来不是"系统替你判断这镜要不要说话"。
2. 唇形同步一律是**后处理**：脸/视频 + 音频 → 新视频。没有一家在生成前就把口型算进去。
3. 音乐一律是 **audio-first**：先有歌，再让画面跟着歌走（Hedra 的 beat-aware shot list、CapCut 的自动踩点，都是"音乐已经在手上"之后的动作）。
4. 没有任何一家的 Agent 会**逐镜决定「这镜要不要对白 / 旁白 / 音乐 / 音效」**。Hedra 的 agent 最接近，但它的输入前提仍是"你已经给了歌"。

**缝在哪（D2 结构位）**：
> Nomi 手上有一样别人没有的东西——**在音乐存在之前，就已经知道每一镜的时长、情绪和台词**（分镜表是画布节点的表格表示，`docs/lessons/shot-table-is-a-projection-of-canvas-nodes.md`）。
>
> 别人只能"先有歌，再对拍"；Nomi 可以**按分镜结构去订做音乐**——ElevenLabs Music 的 `composition_plan.sections[].duration_ms` 正好是这个形状。这不是我们跑得比谁快，是**信息顺序不一样**：他们的音乐先于结构，我们的结构先于音乐。

同一个道理适用于唇形：sync.so 官方 FAQ 明写「AI 生成的角色如果完全静止，模型可能不给它生成嘴部动作；**解决办法是在生成视频时就在 prompt 里加 "person is speaking naturally"**」（<https://sync.so/docs/models/lipsync.md>）。**也就是说，"这镜要不要说话"这个决定必须发生在视频生成之前，否则后处理救不回来。** 这一条直接决定了 §4 的答案。

---

## 2. 一手契约（R5）与目录分桶

### 2.1 唇形同步（3 家，全部可直接调）

**A. `volcengine/video-to-video-lip-sync`（经 kie，Nomi 已有 kie 凭据）** — <https://docs.kie.ai/market/volcengine/video-to-video-lip-sync.md>

| 项 | 值 |
|---|---|
| 端点 | `POST /api/v1/jobs/createTask`，`model: "volcengine/video-to-video-lip-sync"` |
| 输入 | `video_url`（必填）+ `audio_url`（必填）+ `templ_start_seconds`（默认 0） |
| 视频约束 | 360p–1080p（低于 360p 不支持）；MOV / MP4 / HDR；建议 H.264；**≤500 MB**；码率 1–30 Mbps；帧率 24–60 fps |
| 音频约束 | wav / aac / mp4 / ogg；**≤10 MB** |
| 输出 | MP4 @ **25 fps**；**成片时长跟随音频时长** |
| 异步 | kie 统一 job 制：`createTask` → `callBackUrl` 回调 或 record-info 轮询；`taskId` + `creditsConsumed` |
| 价格 | 文档未直给数字，按 kie credits 计（`/common-api/get-account-credits`） |

> **这个形状和 Nomi 完全同构**：镜头成片进、TTS 音轨进、对好嘴的片段出，不动 decompose-stitch 链路。`2026-08-01` 那轮雷达描述的理想形态（`docs/research/2026-08-01-radar.md:25`），现在有现成端点了。

**B. `kling/ai-avatar-pro`（经 kie）** — <https://docs.kie.ai/market/kling/ai-avatar-pro.md>
- 输入：`image_url`（jpeg/png，≤10 MB）+ `audio_url`（**时长 ≤5 分钟**）+ `prompt`（maxLength 5000）
- 形状是**图 + 音频 → 视频**（不是改已有视频）；同款还有 `ai-avatar-standard`

**C. `omnihuman-1-5`（经 kie）** — <https://docs.kie.ai/market/omnihuman-1-5.md>
- 输入：`image_url`（jpeg/png/webp ≤10 MB，**支持最多 5 张**）+ `audio_url`（**必须 <60 秒，建议 ≤15 秒**，≤10 MB）+ `prompt`（maxLength 300 建议 / 1000 上限）+ `output_resolution` enum
- 配套 `human-identification` / `subject-detection` 两个辅助端点

**D. sync.so（一手，最完整的契约，也是 Wav2Lip 作者们现在做的商业版）** — <https://sync.so/docs/api-reference/api/generate-api/create.md>

| 项 | 值 |
|---|---|
| 端点 | `POST https://api.sync.so/v2/generate`，`x-api-key` header |
| 模型 | `sync-3` / `lipsync-2` / `lipsync-2-pro` / `lipsync-1.9.0-beta` / `react-1` |
| 输入 | `input[]`：恰好一个视觉输入（`video` 或 `image`，**image 仅 sync-3 支持**）+ 一个音频输入（`audio` 或 `text`）。每项用 `url` 或 `assetId` |
| 内置 TTS | `type:"text"` + `provider:{name:"elevenlabs", voiceId, script, stability, similarityBoost}` — **不用自己先做 TTS** |
| 分段 | `segments[]`：`startTime`/`endTime` + `audioInput.refId`，**一次调用给一条视频的不同段配不同音频**，还能 per-segment 覆盖参数 |
| 配音（换语言） | `dubParams`：`targetLang` 90+ 语种，从视频里抽原声、ElevenLabs 转译、再对口型 |
| 时长错配 | `options.sync_mode`：`bounce` / `loop` / `cut_off` / `silence` / `remap`（默认 bounce） |
| 异步 | `201` 返 `id`；`webhookUrl` 回调带 `Sync-Signature`；或轮询 `GET /v2/generate/{id}`；另有 `POST /v2/estimate` 预估费用 |
| **价格（官方公布）** | lipsync-2 **$0.04–0.05/秒**；lipsync-2-pro **$0.067–0.083/秒**；sync-3 **$0.107–0.133/秒**（均 @25fps）；legacy 1.9.0-beta $0.02–0.025/秒 — <https://sync.so/docs/models/lipsync.md> |
| 格式 | 视频 MP4/MOV/WebM/AVI；音频 WAV/MP3/OGG/FLAC/ALAC 全支持。输出统一 H.264 `-crf 17 -preset slow` 重编码，**HDR 归一为 SDR，alpha 通道被丢弃** — <https://sync.so/docs/compatibility-and-tips/media-formats-support.md> |
| **决策级坑** | lipsync-2/2-pro 用 2 秒独立分块推理，**输入视频里"人没在说话"的静止段落，对口型不生效**；官方建议在生成视频时 prompt 里就写 "person is speaking naturally"。sync-3 能让静止的嘴张开，但结果是通用口型而非本人风格 |
| 人脸分辨率 | lipsync-2/2-pro 生成 512×512 人脸区；sync-3 4K 原生 |

**分档结论**：`volcengine/video-to-video-lip-sync` 是**成本最低的第一刀**（复用 kie 凭据、复用现有 job 轮询、形状完全同构）；sync.so 是**质量与可控性的上限**（分段、内置 TTS、成本预估、90 语种配音），但要新加供应商。**先接前者，把形状跑通；后者作为 P4 的第二个 vendor 填同一组槽。**

### 2.2 TTS（2 家 + 我们已在跑的 1 家）

**A. ElevenLabs 一手** — <https://elevenlabs.io/docs/api-reference/text-to-speech/convert>
- `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`，body 只有 `text` 必填；`model_id` 默认 `eleven_multilingual_v2`
- 另有 `stability` / `similarity_boost` / `style` / `speed` / `seed` / `previous_text` / `next_text`（**上下文连读**，做多镜连贯旁白时有用）
- **同步返回二进制音频**，16 种 `output_format`，默认 `mp3_44100_128`；高码率要订阅等级

**B. 经 kie 的 ElevenLabs / Gemini（未接的四个）** — <https://docs.kie.ai/market/elevenlabs/*.md>
- 统一走 `POST /api/v1/jobs/createTask` + `callBackUrl`，**异步**（和 ElevenLabs 直连的同步二进制形状**不一样**，这是接入时的真实差异点）
- `elevenlabs/text-to-speech-multilingual-v2`：`input.text` **maxLength 5000**；`voice`（如 "Rachel"）、`stability` 0.5、`similarity_boost` 0.75、`style` 0、`speed` 1、`timestamps`、`previous_text`/`next_text`、`language_code`
- `elevenlabs/text-to-dialogue-v3`：`inputs[]` 每项 `{text, voice}`，**多角色对话一次生成**，全部文本合计 ≤5000 字符 — **这是"AI 短剧多人对白"的正解**
- `google/gemini-3-1-flash-tts`：`maxLength 10000`，多 speaker 结构
- `elevenlabs/audio-isolation`：人声分离（唇形同步前把 BGM 剥掉，sync.so FAQ 明确建议对歌曲要"隔离人声轨"）

**C. MiniMax（我们已有档案）** — `POST /v1/t2a_v2` 同步，`data.audio` 是 hex 编码音频（`src/config/modelArchetypes/minimaxSpeech28.ts:16`）。价格 speech-2.6-turbo $60/M 字符、hd $100/M 字符、克隆 $1.5/次。

**D. 我们在跑的 apimart TTS** — <https://docs.apimart.ai/en/api-reference/audios/tts.md>
`POST /v1/audio/speech`，`model` 默认 `gpt-4o-mini-tts`，`input` **≤4096 字符**，`voice` 六选一，`response_format` wav(默认)/opus/aac/flac/pcm，`speed` **0.25–4.0**。同步返二进制。

### 2.3 音乐（2 家）

**A. ElevenLabs Music 一手** — <https://elevenlabs.io/docs/api-reference/music/compose>
- `POST https://api.elevenlabs.io/v1/music`，`model_id` `music_v1` / `music_v2`
- 两种互斥入口：`prompt` + `music_length_ms`（**3000–600000 ms**，即 3 秒到 10 分钟），或 **`composition_plan`**
- **`composition_plan.sections[]` 每段带 `duration_ms`（3000–120000ms）+ `positive/negative_local_styles` + `lines`（歌词，每段 ≤30 行、每行 ≤200 字符）**；`respect_sections_durations` 默认 true，music_v2 恒强制
- 还有 `source_from` 做段内重绘（inpainting）、`conditioning_ref` 做跨段风格延续、`force_instrumental`、`sign_with_c2pa`
- 同步返回音频文件
- 配套 SFX：`POST /v1/sound-generation`，`text` 必填、`duration_seconds` **0.5–30**、`loop`、`prompt_influence`（<https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert>）

**B. Suno / flow-music（经 apimart，已接主端点）** — <https://docs.apimart.ai/en/api-reference/audios/suno/overview.md>
- 全异步：`POST /v1/music/generations/<op>` → `task_id` → `GET /v1/music/tasks/:task_id` 轮询（progress 10→50→100，通常 30–120 秒）；**失败自动退还预扣额度**
- 引用源曲只靠 `task_id + audio_index`，不需要额外 id
- flow-music/Lyria：`sound_prompt` + `title` + `bpm` + `length`（**1–240 秒**）
- 未接但有用的：`suno/aligned-lyrics`（**歌词时间线**）、`suno/bpm`（**BPM 分析**）、`suno/stems`（分轨）、`suno/extend`

### 2.4 那 50 条按用途分桶 + 该先接哪几个（P4 档案声明槽的方式）

| 桶 | 数量（去重后的真实模型） | 该不该接 | 理由 |
|---|---|---|---|
| **唇形（radar 归在 video 桶，实为音频驱动）** | 3（volcengine lip-sync / kling avatar ×2 / omnihuman） | 🟢 **第一优先** | 唯一真缺口；`volcengine/video-to-video-lip-sync` 形状与 Nomi 同构、复用 kie 凭据 |
| **多角色对话 TTS** | 1（`elevenlabs/text-to-dialogue-v3`） | 🟢 **第二优先** | 短剧/漫剧的核心痛点是"多人声线"，现有档案全是单角色单次调用；`inputs[]{text,voice}` 一次出整段对白 |
| **人声分离** | 1（`elevenlabs/audio-isolation`） | 🟡 跟着唇形接 | 唇形同步对歌曲要求隔离人声；也解拆解视频后"BGM 混在对白里"的问题 |
| **音乐编辑动作** | Suno 30 + Lyria 13 = 43 条 endpoint / 2 个模型 | 🟡 只接 3 个 | `aligned-lyrics`（歌词时间线）、`bpm`（节拍）、`extend`（补时长）——**这三个是"音乐对拍"的原料**，其余 40 条是音乐工作站功能，不在 Nomi 护城河上（D2：广度是敌人） |
| **通用 TTS** | 2（gemini-3-1-flash-tts / eleven turbo-2.5） | ⚪ 忽略 | 我们已有 6 个配音档案，再加同类是并行版（P1） |

**P4 的接法**：不为唇形写专属 UI。`ArchetypeReferenceSlotKind` 已有 `audio_ref` 和 `source_video` 两种槽（`electron/shared/videoCapabilities/types.ts:31`）——唇形模型就是**声明 `source_video` + `audio_ref` 两个槽的一个普通视频档案**，通用渲染器自动出参考块。volcengine 那条是 `source_video`+`audio_ref`，kling avatar / omnihuman 那两条是 `image_ref`+`audio_ref`。**一行专属 UI 都不用写。**

---

## 3. 开源路线（R6，实读仓库）

### 3.1 唇形同步

| 项目 | 入口 file:line | 输入 | LICENSE | VRAM | ComfyUI |
|---|---|---|---|---|---|
| **Wav2Lip** | `inference.py:16` `--face`、`:18` `--audio`、`:13` `--checkpoint_path`、`:33` `--wav2lip_batch_size` 默认 128 | 视频或静图 + 音频 | ❌ **非商用**：README.md:230「any form of commercial use is **strictly prohibited**」、README.md:310「can only be used for personal/research/non-commercial purposes」，商用请联系 **rudrabha@synclabs.so** | 低 | 有（老） |
| **LatentSync** | `scripts/inference.py:108` `--video_path`、`:109` `--audio_path`、`:110` `--video_out_path`、`:107` `--inference_ckpt_path`、`:111` `--inference_steps` 默认 20 | 视频 + 音频 → 视频 | ✅ **Apache 2.0**（LICENSE:1） | 推理 **8 GB**（1.5）/ **18 GB**（1.6）（README.md:108-111） | ✅ ShmuelRonen/ComfyUI-LatentSyncWrapper（1.6，2025-04 更新）、iVideoGameBoss/ComfyUI-LatentSync-Node、hay86 版 |
| **MuseTalk** | `inference.sh v1.5 realtime`（README.md:299） | 视频 + 音频，实时 | ✅ **MIT**（LICENSE:2） | README.md:21「**30fps+ on NVIDIA Tesla V100**」 | ✅ AIFSH/ComfyUI-MuseTalk_FSH、xuhongming251/ComfyUI-MuseTalkUtils |

**⚠️ 决策级发现**：**Wav2Lip 商用禁止，且它的作者就是 sync.so（synclabs.so）的人。** 任何"用 Wav2Lip 省钱"的方案在 Nomi 这种要卖的产品里是不能走的——而 B 站最热的那些教程（`AI视频翻译5大神器…Wav2Lip…`，2.3 万赞）正是在教用户用它。**LatentSync（Apache 2.0）和 MuseTalk（MIT）才是可商用的两条。**

### 3.2 本地 TTS

| 项目 | 入口 file:line | LICENSE | 规模 | 中文 |
|---|---|---|---|---|
| **CosyVoice / Fun-CosyVoice 3.0** | README.md:5（模型卡）、:13（zero-shot 多语种） | ✅ **Apache 2.0**（LICENSE:1） | **0.5B**（README.md:80） | 🟢 最强：README.md:15「9 种语言 + **18+ 中文方言/口音**（广东、闽南、四川、东北…），支持跨语种 zero-shot 声音克隆」；README.md:17 还支持拼音发音修补 |
| **F5-TTS** | `src/f5_tts/infer/infer_cli.py:40+` `--model` / `--ckpt_file` / `--ref_audio` / `--ref_text` / `--gen_text` | ✅ **MIT**（LICENSE:1） | F5TTS_v1_Base | 🟢 好（Emilia-ZH-EN 训练集） | 
| — | — | — | — | **F5-TTS README.md:89 有独立的「Apple Silicon」安装节**（`pip install torch torchaudio` 即可） |

### 3.3 macOS 单人开发者的真实代价（≤20 行）

- **唇形本地化 = 不可行。** LatentSync README 全文**没有一处** mps / Apple Silicon / macOS 字样；MuseTalk 的性能数字是 V100。这两条都是 CUDA 生态。用户机器是 Apple Silicon，`torch.mps` 上跑扩散式唇形 = 没人验证过的路，我们没有验证预算。
- **ComfyUI 那条路便宜但不是我们的。** Nomi 已有 opt-in 的 ComfyUI 工作流导入（`electron/catalog/comfyuiWorkflowTaskContract.ts`），三个 LatentSync 节点包也确实存在——**但用户得自己有一台 N 卡机器**。这只对已经在跑 ComfyUI 的重度用户成立，不是产品能力。
- **本地 TTS 反而是可行的那一半**：CosyVoice3 只有 0.5B、Apache 2.0、18 种中文方言；F5-TTS 是 MIT 且官方给了 Apple Silicon 安装路径。这是唯一一个"能在用户自己机器上白跑、且中文比云端更懂方言"的能力。
- **但是 D2 要问：在护城河上吗？** 不在。TTS 是所有人都有的通用能力，云端 $60/M 字符已经很便宜；自己塞 Python 运行时 + 权重下载进 Electron 包，换来的只是省钱，代价是安装体积和一整条新的失败模式。

**逐项裁决**：
- 唇形 → **API-only**（`volcengine/video-to-video-lip-sync` 先行，sync.so 备选）
- 本地 TTS → **ComfyUI-optional-only**（不主动做；若将来做，走已有的 ComfyUI 工作流导入，不新建本地运行时）
- ship-local → **一个都不做**

---

## 4. Agent 端：「配音决策」到底落在哪一层

### 4.1 现状：决策层不是空的，是**只有一个布尔值，而且失败时静默**

Nomi 今天唯一的"声音决策"在 `src/workbench/generationCanvas/agent/storyboardDialogue.ts`（全文 21 行）：

```ts
const SPEAKING_PARAMETER_KEYS = new Set(['audio', 'generate_audio'])   // :3
export function modeGeneratesDialogue(mode, params): boolean {          // :6
  const control = mode?.params.find(c => c.type === 'boolean' && SPEAKING_PARAMETER_KEYS.has(c.key))
  ...
}
export function buildDialoguePromptSuffix(mode, params, dialogue) {     // :14
  const text = typeof dialogue === 'string' ? dialogue.trim() : ''
  return text && modeGeneratesDialogue(mode, params) ? `对白：${text}` : undefined   // :20
}
```

读法：**「这个模型档案声明了自己会生成音频吗？会 → 把台词拼进 prompt；不会 → 返回 undefined。」**

三个问题，一个比一个重：

1. **不会的时候什么都不发生。** 用户在分镜表里写了台词，选了个不自带音频的模型（比如 Kling 默认 `audio: false`，`kling.ts:25`），台词就**静默消失**了——不降级去 TTS，不提示，不标注。这**直接违反 D4「缺口明着标」**，而且它长得和"功能坏了"一模一样（对照 `docs/lessons/group-says-broken-usually-means-undiscoverable.md`）。
2. **只有对白，没有旁白/音乐/音效。** 片种模板只声明了 `dialogue: true/false` 一个维度（`storyboardProfiles.ts:17`、`:25`）。
3. **决定发生的时机是对的，但内容不够。** 它确实发生在**生成提交层**（生成之前）——这正好符合 §1.3 那条硬约束（口型必须在生成前决定）。这个位置是对的，不该挪。

### 4.2 提案：把「一个布尔」升级成分镜表的**一列**，而不是新工具、也不是剪辑执行表

三个候选，逐个过一遍：

| 方案 | 优点 | 致命伤 |
|---|---|---|
| **A. 独立"配音工具"** | 职责清晰 | ❌ 违反 §1.3 硬约束：等 Agent 想起来调工具时，视频早生成完了，静止的嘴救不回来。而且这是**第二套心智**（P1 并行版） |
| **B. 剪辑执行表的一部分** | 和时间轴天然贴合 | ❌ 太晚。到剪辑阶段画面已定，只能贴音轨、不能改画面里有没有人在说话 |
| **C. 分镜表的一列（策略解析器）** | 时机正确、和已有 `dialogue` 列同源、Agent 已经在这里出决定 | 需要扩 schema |

**选 C。** 底层逻辑用大白话说（D6）：

> 一个镜头有没有声音，**不是拍完才决定的，是写分镜的时候就定了的**。就像剧本上写「小明（哽咽）：你还是走吧」——写下这句的那一刻，导演就知道这镜要拍到脸、演员要真的在说话。你不能等片子剪完了才说"哎我们给他配个音吧"，那时候画面里那个人根本没张嘴。
>
> 我们现在的做法恰恰是后者：分镜表里有台词列，但它只在"模型碰巧自己会说话"的时候才起作用，其余时候悄悄丢掉。

**用户要权衡的那一件事**（D6 的第二半）：

> **要不要让 Agent 替你决定"这镜配什么声音"，还是只让它填你已经决定的东西。**
> 前者省事但会出现"它给我加了段我不想要的 BGM"；后者可控但每镜都要你点一次。
> 我的判断（D5）：**分镜级别 Agent 决定 + 项目级别用户定调**——用户在片种模板里一次性说"这是短剧，有对白、有配乐、无旁白"，Agent 按这个基调逐镜填，逐镜可覆盖。这和分镜画幅"项目级 + 行覆盖"的已有拍板完全同构（`docs/lessons/design-decisions-20260905-agent-ui-storyboard-mcp.md`）。

### 4.3 输入输出草案

**分镜表新增一组「声音」列**（右半列区，和参考槽同侧；左半列仍是提示词维度）：

```ts
// 分镜表每行新增（storyboardPlan.ts 的 shot schema）
type ShotSound = {
  /** 这一镜画面里有人在说话吗——决定 prompt 里要不要写 "person is speaking naturally"，
   *  以及这镜能不能进唇形同步。false 时旁白仍可有（画外音）。 */
  onScreenSpeech: boolean
  /** 台词（已有 dialogue 字段，升为此结构的一员） */
  dialogue?: string
  /** 角色声线绑定：指向项目级 voice cast，不在行里存音色 id */
  speakerId?: string
  /** 画外旁白 */
  narration?: string
  /** 音效意图，大白话，喂给 SFX 模型的 text */
  sfx?: string[]
}

// 项目级（片种模板 + 用户一次性定调）
type SoundDirection = {
  dialogue: 'none' | 'onscreen' | 'voiceover'
  music: 'none' | 'bed' | 'scored'      // scored = 按分镜段落时长订做
  sfx: 'none' | 'ambient' | 'accent'
  /** 角色 → 音色 的项目级 cast，逐镜只引用 speakerId */
  voiceCast: Record<string, { archetypeId: string; voiceParams: Record<string, unknown> }>
}
```

**策略解析器的输入 → 输出**：

```
输入：分镜表（每行时长/情绪/景别/台词）+ SoundDirection + 选中的视频模型档案
输出：每镜一条 SoundPlan
  {
    shotIndex,
    // ① 生成前就要生效的：写进 prompt
    promptSuffix?: "对白：…" | "person is speaking naturally"
    // ② 视频模型自己能出的：不重复做
    nativeAudio: boolean            // = 现有 modeGeneratesDialogue()
    // ③ 视频模型出不了、要另外生成的：
    todo: Array<
      | { kind:'tts',    text, speakerId }
      | { kind:'lipsync', needs:['shotVideo','ttsAudio'] }   // ②为 false 且 onScreenSpeech 时
      | { kind:'sfx',    text, durationSeconds }
    >
    // ④ 做不到的：明着标（D4）
    gaps: Array<{ reason:'no_lipsync_vendor'|'model_cannot_speak', humanMessage }>
  }
项目级一次：{ kind:'music', compositionPlan: { sections: 按分镜段落聚合出的 duration_ms[] } }
```

**这里有两处是别人做不到的**（回到 §1.3 的结构位）：
- `todo.lipsync` 能在**生成之前**就知道要不要，于是能提前往 prompt 里塞 "person is speaking naturally"——sync.so 官方自己都只能"建议用户手动加"。
- `music.compositionPlan` 的段落时长**来自分镜表**，不是来自节拍检测。别人是"先有歌再对拍"，我们是"先有结构再订做"。

**落在哪个阶段**：跟着现有的 `buildDialoguePromptSuffix` 调用点走——`src/workbench/generationCanvas/runner/generationRunController.ts:306-315`（生成提交层）。**不新建阶段**：策略解析器就是这个函数长大之后的样子，`storyboardDialogue.ts` 整体被它替换（P1 加新必删旧）。

---

## 5. 自媒体实查（TikHub，四平台）

方法：`api.tikhub.io` 四组关键词 ×4 平台，抖音 `fetch_video_search_v3`、小红书 `app_v2/search_notes`、B 站 `web/fetch_general_search`、快手 `app/search_video_v2`；再对 4 条高互动 B 站视频抓评论区。原始数据 `/tmp/tikhub-audio/`。

### 5.1 痛点原话（按信号强度排）

**① 「AI 味」是第一痛点，压倒一切**
- 小红书「**一招让你的AI配音摆脱AI味儿，太有用了**」——**22302 赞**，全轮最高
- 小红书「AI配音，打造活人感音色｜附教程」946 赞 / 「教你做出活人感的配音」524 赞 / 「一个公式搞定漫剧角色音色，还能重复用」510 赞
- B 站评论「**终于不用再用剪映的那些营销号音色了**」**49 赞**（`BV1evKmzxExz`）
- 小红书「**AI漫剧的配音真的搞的我一头包**」

**② 声线一致性 / 多角色，是短剧的结构性难题**
- 小红书「做AI短剧必备的**8个角色声线**❗️收好」/「AI短片，人物音色一致性」299 赞
- B 站「**AI人物声音一致性** AI 漫剧制作」/「**TTS 2.5 + MiniMax H3 声音一致 完美对口型，批量短剧制作**保姆级教程」1850 赞
- 抖音（13806 粉的教程号，两条连着发）「AI 短剧配音配乐系列课 **人物对白**专项教学，解决**角色声线同质化、台词节奏违和**问题，轻松搭建**多人对话配音方案**」
- **对应 §2.4 的第二优先级**：`elevenlabs/text-to-dialogue-v3` 的 `inputs[]{text, voice}` 就是这个东西的解。

**③ 「画面做好却毁在音频上」——他们自己的原话**
- B 站 571 赞：「做 AI 短剧漫剧视频，**画面做好却毁在音频上**！声音生硬、配乐违和、人声和剧情不匹配，这套 AI 全流程视频教程，完整讲解 AI 音频制作，包含配音、对白、背景音…」
- 这句话几乎是本文标题的用户版本。

**④ 唇形同步：又贵又不够好，且大家在满世界找本地方案**
- B 站评论「**音色确实牛，就是这口型对的还得再练练**」27 赞
- B 站评论（详细，最有信息量）：「**数字人对口型太贵了，一段15-30元，漫剧那么多台词下来成本真受不了**😂 我后来换 **API 直连**方案了，配音出视频一起搞，不用一个个平台买会员」
- B 站评论「**对口型 大师版才能看，普通的真的不行**」
- `BV1vr98BLEzi`（comfyui+即梦 对口型，181 评）评论区**几乎整屏是同一句**：「已三连+关注，**求本地部署语音对口型整合包**，求部署详细教程」——重复十余条
- 小红书「**AI漫剧对白口型不同步？先锁3个语音节拍**」/「字节 **LatentSync** 开源模型，唇形同步效果拉满」164 赞
- **读法**：一段 15–30 元的定价下，漫剧作者算得过来账才怪；而"求整合包"的密度说明**他们宁愿折腾本地也不想按段付费**。这既验证了唇形是刚需，也说明**定价透明比能力更重要**。

**⑤ 音乐对拍：CapCut 的"自动踩点"就是行业答案，且用户满意**
- 小红书「手残党1️⃣秒卡准BGM✨**剪映AI踩点封神教程**」/「今天教你用一些邪修小妙招来剪辑"氛围感卡点"视频」770 赞
- B 站「**让AI视频瞬间拥有灵魂的AI配乐生成技巧**」5722 赞 / 「【AI漫剧BGM合集】虐恋｜爽剧｜疯批｜甜宠｜古风田园」2588 赞 / 「AI漫剧看多后 满脑子都是这些BGM」
- 快手多条 "Set 1xx｜卡点视频教学" 系列
- **读法**：「AI漫剧看多后满脑子都是这些BGM」意味着这个人群**大量复用同一批 BGM**——他们要的不是"生成一首歌"，是"这段该配哪种情绪的垫乐"。这更接近 §2.3 的 `composition_plan` 而不是 Suno 出整曲。

**⑥ ⚠️ 合规红灯：AI 声音已经进法院了**
- 抖音，**1358 万粉**的账号发：「**配音演员"三石"AI声音维权立案**，其声音在未授权情况下，被擅自 AI 化用于某漫剧男主配音，目前已收到**法院案件受理通知书** #AI短剧 #配音维权」
- 反面，B 站评论 10 赞：「试了几次音色都自带情绪，牛，**不用再担心音色商用问题视频被下架了**」
- **读法**：**声音克隆（上传一段真人音频克隆声线）在中国短剧场景已经有实际法律风险。** 这条直接影响 §6 的拍板项。

### 5.2 平台差异（对我们有用的一条）

抖音/快手的结果几乎全是**成品短剧和引流教程**，小红书/B 站才是**工具讨论和痛点**所在。以后声音相关的用户调研，主查小红书 + B 站评论区。

---

## 6. 六角色短评 · 拍板项 · 最小探针

### 6.1 六角色（R7）

**CTO**：形状上零新抽象——唇形模型 = 声明 `source_video` + `audio_ref` 两个已有槽的普通视频档案（`types.ts:31`），kie 的 job 轮询链路现成。真正的工程量在**策略解析器**，而它是 `storyboardDialogue.ts` 那 21 行长大，不是新子系统。⚠️ 一个技术债要一起还：时间轴 audio 轨**禁止 overlap 且没有 acrossfade**（`docs/ARCHITECTURE-NOW.md:57`），一旦有了旁白 + BGM 两条音源，"音乐压不下去、对白被盖住"会立刻变成用户可见 bug。**做声音线必须同时上侧链/ducking 或至少允许 audio overlap。**

**设计**：分镜表右半列已经是"该行模型 derive 出来的槽"（`shot-table-is-a-projection-of-canvas-nodes.md`）。声音列进右半列，和参考槽同侧、同逻辑，认知负荷增量接近零。⚠️ 但 `SoundPlan.gaps` 必须有**可见的位置**——现在台词静默消失，是最糟的那种"没有位置"。

**PM**：五条痛点里，我们能一次覆盖三条（AI 味 → 已有 6 个 TTS 档案 + 豆包情感参；多角色声线 → dialogue-v3；口型 → volcengine lip-sync）。剩下两条（音乐对拍、成本焦虑）里，成本焦虑我们**天然赢**——用户抱怨的"一个个平台买会员"正是 Nomi 自带 key 直连的模式。

**前端**：不新增 UI 组件。声音列走现有 `ShotParamControls` / 参考块渲染；`SoundDirection` 走片种模板已有的项目级声明位。唯一新东西是"缺口标注"的一个 inline 提示位。

**后端**：`volcengine/video-to-video-lip-sync` 的 500MB / 10MB 上限意味着**要先把成片和 TTS 音频托管成可访问 URL**——Nomi 是本地优先，这里有一条真实的资产上行链路要走（已有 `assetTransportPolicy.ts` / `assetLocalization.ts`，但要验它对 audio 也成立）。25fps 固定输出也要和时间轴 fps 对账。

**真实用户（漫剧作者）**：「我要的是——写完分镜，点一下，每个角色用固定的声线把自己那句说出来，嘴对上，底下有段不抢戏的垫乐。**我不想为这四件事开四个网站、买四个会员。**」（综合 §5 原话）

### 6.2 要用户拍板的（2 条，都不是我能替他定的）

**拍板 1｜声音克隆做不做？**
- **背景（为什么现在必须问）**：§5.1⑥ 抖音 1358 万粉账号发的配音演员维权立案已进法院。而"角色声线一致"（§5.1②）这个第一梯队需求，最彻底的解法恰好就是克隆。
- **两条路**：(A) **只做预设音色**——ElevenLabs/豆包/MiniMax 官方音色库，商用清晰，代价是"每部剧的角色声音都撞车"；(B) **支持用户上传音频克隆**（MiniMax $1.5/次、sync.so Voices API 都现成），体验最好，但把版权风险转嫁给了用户，而用户多半意识不到。
- **我的判断（D5）**：先做 A，把 B 留在 gaps 里明着标「⚠️ 声音克隆涉及被克隆人授权，Nomi 暂不提供」。理由是 D2——克隆不在我们的护城河上（谁都能接），但它带来的是**不可逆的法律面**，风险收益不对称。**但这条是产品方向 + 不可逆取舍，必须您拍。**

**拍板 2｜音乐走"订做"还是"选配"？**
- **背景**：§1.3 说的结构位——Nomi 在音乐存在之前就知道每镜时长，所以能用 ElevenLabs `composition_plan.sections[].duration_ms` **按分镜结构订做音乐**，这是 Hedra/CapCut 都做不到的。
- **但 §5.1⑤ 的用户原话指向另一边**：「AI漫剧看多后满脑子都是这些BGM」——他们在**复用同一批垫乐**，要的是"这段配哪种情绪"，不是"给我生成一首独一无二的歌"。
- **权衡的那一件事**：**订做**是我们的差异化但每次都要等 30–120 秒且花钱；**选配**（一个按情绪/时长索引的垫乐库 + `suno/extend` 补时长）快、便宜、贴合用户当下习惯，但不构成壁垒。
- **我的判断（D5）**：**先做选配、把订做留作"一键升级"**。理由是 D1——用户此刻的摩擦是"找不到合适的垫乐"，不是"垫乐不够独特"；effect-first 先给效果。但订做那条路要在 schema 里留位（`SoundDirection.music: 'bed' | 'scored'`），别关死。

### 6.3 最小探针（零额度，已执行）

**做法**：拿目录里已在跑的 TTS 档案 `AUDIO_ARCHETYPE`（`src/config/modelArchetypes/audioArchetype.ts`）逐字段对 apimart 官方文档 <https://docs.apimart.ai/en/api-reference/audios/tts.md>（`.md` 原文，2026-09-07 抓）。

| 字段 | 档案声明 | 官方文档 | 结论 |
|---|---|---|---|
| `input` 长度 | hint「最多 4096 字」(`:50`) | 「Maximum length: **4096** characters」 | ✅ |
| `voice` 枚举 | alloy/echo/fable/onyx/nova/shimmer 六个，中文括注（`:11-18`） | 同六个，且语义逐条对上（echo=Male calm / fable=British narrative / nova=Female energetic…） | ✅ 含**语义**都没漂 |
| `speed` 范围 | min 0.25 / max 4 / default 1（`:30`） | 「Range: **0.25 to 4.0**」default 1.0 | ✅ |
| `response_format` | 不暴露给用户，传输层硬编 `wav`（`electron/catalog/apimartAudios.ts` TTS_CREATE） | default **wav**，另有 opus/aac/flac/pcm | ✅ 有意为之（注释写明"未压缩、Chromium `<audio>` 必能播"），不是漂移 |
| `model` | per-mode `modelEnum: "gpt-4o-mini-tts"`（`:53`） | 「Available models: `gpt-4o-mini-tts`」（唯一一个） | ✅ |

**探针结论：零漂移。** 这条探针的价值不在"发现了 bug"，在于**排除了一个假设**——档案/传输/参数那套机器是健康的，所以「声音线薄」这个体感**不可能**是接入层的问题。这反过来加固了本文的主结论：问题在决策层，不在管道层。

**下一个该跑的探针（同样零额度）**：拿 `volcengine/video-to-video-lip-sync` 的契约，写一条 catalog contract 测试（仿 `electron/catalog/apimartVideoSharedContracts.test.ts`），验证「`source_video` + `audio_ref` 两个已有槽能不能把这个模型完整表达出来」。**如果能，就证明接唇形不需要任何新抽象；如果不能，那个缺的抽象就是真正的工作量。** 这条不花一分钱就能把 §2.4 的第一优先级从"我觉得可以"变成"结构上证明可以"。

---

## 附：本文用到的一手出处

**Nomi 仓库**（`origin/main` @ `6a7c8178`）
`src/config/modelArchetypes/index.ts:75` · `audioArchetype.ts:37,58` · `elevenAudio.ts:12,54,77,115,153` · `sunoAudio.ts:12,85` · `lyria35.ts:3` · `minimaxSpeech28.ts:6,16` · `minimaxMusic3.ts:12` · `doubaoTtsArchetype.ts:24` · `seedTtsArchetype.ts:21` · `runwaySeedAudio.ts:29` · `electron/catalog/apimartAudios.ts` · `electron/shared/videoCapabilities/types.ts:31` · `kling.ts:25` · `seedance.ts:27` · `seedance25.ts:56` · `wan30.ts:59,127` · `runwayWireFacts.ts:158` · `electron/shared/audioCapabilities/runwayAudioWireFacts.ts` · `src/workbench/generationCanvas/agent/storyboardDialogue.ts:3,6,14,20` · `storyboardProfiles.ts:17,25` · `src/workbench/generationCanvas/runner/generationRunController.ts:306-315` · `src/workbench/timeline/clipAudio.ts:3,24` · `electron/export/ffmpegFiltergraph.ts:343,400` · `src/workbench/generationCanvas/nodes/render/AudioStripNode.tsx:47` · `docs/ARCHITECTURE-NOW.md:53,57,59` · `docs/research/model-radar/{kie,apimart,latest}.json`

**供应商官方文档**（全部 2026-09-07 实抓）
<https://docs.kie.ai/market/volcengine/video-to-video-lip-sync.md> · <https://docs.kie.ai/market/kling/ai-avatar-pro.md> · <https://docs.kie.ai/market/omnihuman-1-5.md> · <https://docs.kie.ai/market/elevenlabs/text-to-speech-multilingual-v2.md> · <https://docs.kie.ai/market/elevenlabs/text-to-dialogue-v3.md> · <https://docs.kie.ai/market/elevenlabs/audio-isolation.md> · <https://docs.kie.ai/market/google/gemini-3-1-flash-tts.md> · <https://docs.apimart.ai/en/api-reference/audios/tts.md> · <https://docs.apimart.ai/en/api-reference/audios/suno/overview.md> · <https://docs.apimart.ai/en/api-reference/audios/flow-music/music.md> · <https://sync.so/docs/api-reference/api/generate-api/create.md> · <https://sync.so/docs/models/lipsync.md> · <https://sync.so/docs/compatibility-and-tips/media-formats-support.md> · <https://elevenlabs.io/docs/api-reference/text-to-speech/convert> · <https://elevenlabs.io/docs/api-reference/music/compose> · <https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert> · <https://www.hedra.com/docs/llms.txt>（及 create-avatar-video / create-audio / creating-music-videos 三页 `.md`） · <https://docs.heygen.com/llms.txt>

**⚠️ 未取到一手的**：Kling 开放平台的 lip-sync API 参考页（`kling.ai/document-api/apiReference/model/videoTolip`）是 JS 渲染，curl 与 WebFetch 均只拿到外壳 HTML，**本文未引用其字段**。Kling 唇形的产品面信息来自其 quickstart 与官方 X 公告；要接 Kling 唇形直连时必须补抓这一页（或改走已验证的 kie `kling/ai-avatar-*`）。

**开源仓**（raw 实读）
`bytedance/LatentSync` `scripts/inference.py`、`LICENSE`、`README.md` · `Rudrabha/Wav2Lip` `inference.py`、`README.md` · `TMElyralab/MuseTalk` `LICENSE`、`README.md` · `FunAudioLLM/CosyVoice` `LICENSE`、`README.md` · `SWivid/F5-TTS` `LICENSE`、`README.md`、`src/f5_tts/infer/infer_cli.py`
ComfyUI 包：<https://github.com/ShmuelRonen/ComfyUI-LatentSyncWrapper> · <https://github.com/iVideoGameBoss/ComfyUI-LatentSync-Node> · <https://github.com/AIFSH/ComfyUI-MuseTalk_FSH>

**自媒体**：TikHub `api.tikhub.io`，四组词 ×4 平台 + 4 条 B 站评论区，原始数据 `/tmp/tikhub-audio/{raw,bili,comments}.json`
