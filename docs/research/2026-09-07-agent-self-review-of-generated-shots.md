# Agent 看不见自己做出来的片子：镜级自评的可行形式（2026-09-07）

日期：2026-09-07 · 基线：`origin/main@6a7c81786`
性质：**只调研不改码**——一行产品代码未动。含要用户拍板的 2 条（§7）。
服务对象：[`docs/plan/2026-09-07-agent-runtime-rebuild.md`](../plan/2026-09-07-agent-runtime-rebuild.md)（Agent 运行时重做）与它的
[阶段 3–5 深化方案](../plan/2026-09-07-agent-rebuild-stage3-5-deep-plan.md) §4.2 验收矩阵。

---

## 0. 要回答的问题（先写死，防跑题）

生成完一镜之后：

1. Agent 凭什么判断**人脸/服装是否一致**、**动作对不对**、**与上一镜接不接得上**、**画面稳不稳**？
2. 判完之后凭什么决定**重跑 / 换模式 / 通过**？
3. 这套东西在别人那里长什么样（产品 / 开源 / 论文 / 创作者手工流程）？
4. 在 Nomi 里应该长什么样，落在重做的哪个阶段，跟策略解析器怎么接？

---

## 1. 结论先行

> 五条。每条给它建立在哪条证据上；没有证据的判断标 `[推测]`。

**C1 —— 这个问题问反了一半：Nomi 已经有眼睛，只是 Agent 那条腿没接上。**
主进程里有一整套跑在生产路径上的**审片环**：三轴 rubric（identity / composition / continuity）、1–5 档带锚点、
「无法判定」哨兵档、定向重滚 K≤2、60s 硬界、红标交付。纯核 `electron/capabilityCore/shotVerifyCore.ts:1-295`，
编排 `electron/capabilityCore/shotVerifyOrchestrate.ts:1-251`，真实接线 `electron/capabilityCore/shotVerifyDeps.ts:104-200`。
它**只挂在两个传输上**——`electron/capabilityCore/mcpStdioServer.ts:223` 和 `electron/capabilityCore/rpcServer.ts:378`
（都是「外部 MCP/CLI 宿主」那条路）。**应用内 Agent lane 的 33 个工具里没有一个能看见画面**（§5.1 有完整清单）。
所以真正的缺口不是「造一个看片工具」，是**把已有的眼睛接到 Agent 的手上**，并把判决塞进它下一步的输入。

**C2 —— 「Agent 看不见」不是疏忽，是契约里明写的一道墙，得先决定拆不拆。**
`asset.read` 的结果 schema 里两处写死 `semanticInspection: z.literal("not_performed")`
（`electron/shared/agentCapabilities/assetRead.ts:119` 与 `:142`），而 `assetRead.test.ts:59-67` 逐项断言：
结果里出现 `url` / `relativePath` / `absolutePath` / `providerUrl` / `bytes` / 任何非 `"not_performed"` 的
`semanticInspection` **都必须解析失败**。也就是说「不给 Agent 像素、不给路径、不给画面语义」是被测试钉死的
设计决定，不是漏掉。**看片能力不能长成 `asset.read` 的一个新字段**——那会撞穿这堵墙；它必须是**一个新契约**
（§5.3）。这一条决定了整个方案的形状，是最容易被实施阶段"顺手"违反的地方。

**C3 —— 国际主流产品全都只做「喂进去」，不做「量出来」；唯一在做闭环的是个中文产品。**
Runway / Kling / MiniMax(Hailuo) / Vidu 四家 API 响应体里**没有任何质量或一致性字段**，只有状态枚举 + 失败原因。
最硬的一条证据是 Runway 帮助中心：生成**成功完成**但产出"不符合提示词 / 没保住人物形象"时，**积分照扣不退**
（<https://help.runwayml.com/hc/en-us/articles/34266159290003-Can-I-have-credits-refunded>）——等于官方承认
质量判断不在厂商职责内。Higgsfield 的 Soul ID、LTX 的 Elements、Vidu 的 reference-to-video 全是
**更好的 CONDITIONING**（把脸喂得更准），没有一家宣称**测量**了产出与参考的相似度。详见 §2。

**C4 —— 创作者今天是纯人肉判断 + 抽卡，而且他们自己已经把这件事命名了。**
TikHub 本轮实查 240 条，最有价值的一条是小红书上一份**《AI素材返工率60%→5%的质检SOP》**
（雨欣爱剪辑，2026-06-24）——「质检」在这个圈子里已经是个成熟工种，只是全靠人眼。另一份
《AI 短剧漫剧上传平台之前做好这 18 项审片》（编导路飞杰，2026-08-05）把它做成了 18 项清单。
成本侧有硬数字：可灵**抽一次卡 3.5 元**（抖音·猩猩技术分享）、小影马一集 5 分镜 **18 元**（≈3.6 元/镜）。
**这个数字是整个方案的经济学基础**：一次 VLM 判分是分币级，一次重滚是元级——判分/重滚的成本比在 1:30 上下，
所以「先判再决定要不要重滚」在账上是无脑赚的（§5.5）。详见 §4。

**C5 —— 阶段 3–5 深化方案 §4.2 的验收矩阵里，没有一行是关于产出质量的。**
那张表 11 行，量的是工具一次写对率、回合成功率、五段归因、影子一致率、冷重启、花费准确度、429、看门狗、
62 张基线、真实短片闭环、框架债。**全是「Agent 的手稳不稳」，没有一行是「Agent 交出来的片子对不对」**。
`generation.*` 那几个能力的 `outputSchema` 还是 `z.unknown()`（`electron/shared/agentCapabilities/generation.ts:5, 42, 58, 98`），
判决就算流过去也没有契约承接。这是 §5.6 建议补的那一行。

---

## 2. 顶尖产品实查（≥5 家）

> 方法：读官方 API 参考与帮助中心页，不采信聚合博客。**区分两件事**：
> **CONDITIONING**（把脸喂进去）vs **EVALUATION**（量产出的脸对不对）。这是本节唯一想说清的事。

| 产品 | 自动质检 | 自动重跑 | 一致性是「喂进去」还是「量出来」 | 用户看到什么 | 出处 |
|---|---|---|---|---|---|
| **Runway** | ❌ 无质量分。只有 `INTERNAL.BAD_OUTPUT.*` 失败码（内部系统以「质量或系统错误」为由**拒绝**产出）——**兜底拒绝**不是评分 | ❌ 明确推给调用方："You may retry these generations" | **喂进去** | 状态 + `failureCode`；**生成完成但产出不符合提示词/没保住人物形象 → 积分照扣不退** | [task-failures](https://docs.dev.runwayml.com/errors/task-failures/) · [credits refund](https://help.runwayml.com/hc/en-us/articles/34266159290003-Can-I-have-credits-refunded) |
| **Kling AI** | ❌ 未说明任何评分字段 | ❌ 未说明 | **喂进去** | `task_status`: submitted/processing/succeed/failed + `task_status_msg`（人话失败原因） | [Kling API](https://kling.ai/document-api/apiReference/model/videoGeneration)（⚠️ 抓取时官网返回空壳，枚举来自第三方[镜像](https://github.com/199-mcp/mcp-kling/blob/main/kling-api-docs.md)，**未从官网原页逐字核实**） |
| **Hailuo / MiniMax** | ❌ `VideoGenerationResp` 只有 `task_id` + `base_resp`，无任何质量字段 | ❌ 未说明 | **喂进去** | processing/success/failed；`base_resp.status_code`（0 成功 / 1002 限流 / 1008 余额不足 / 1026 敏感内容…） | [t2v API](https://platform.minimax.io/docs/api-reference/video-generation-t2v) |
| **Vidu** | ❌ 无一致性/质量评分字段 | ❌ 未说明 | **喂进去**（reference-to-video 只是把参考图当条件输入） | state: created→processing→success/failed；响应仅 video_url + usage | [reference-to-video](https://platform.vidu.com/docs/reference-to-video) · [阿里云托管版](https://help.aliyun.com/en/model-studio/vidu-image-to-video-api-reference) |
| **Higgsfield** | ❌ 未说明（Soul ID 是身份**锁定**，不是身份**校验**） | ❌ 未说明 | **喂进去** | 无评分 ⚠️ 厂商营销页表述 | [Soul ID 对比页](https://geo.higgsfield.ai/task/blog/higgsfield-ai-vs-other-ai-video-tools-1) |
| **LTX Studio** | ❌ 未说明 | ❌ 未说明 | **喂进去**（Elements：角色存成持久资产复用） | 无评分 ⚠️ 厂商营销页表述 | [一致角色博客](https://ltx.io/blog/how-to-create-a-consistent-character) |
| **Pika** | ❌ 未说明 | ❌ 未说明 | **喂进去** | 无评分。⚠️ 流传的 "Character Consistency 7.9/10" 是**第三方测评**打分，不是产品功能 | [第三方测评](https://diyai.io/ai-tools/video-generation/reviews/pika-ai-review/) |
| **即梦 / Dreamina（Seedance）** | 未查成 | 未查成 | 未查成 | — | 本轮**没查成**，见 §8 诚实记分 |
| 🔴 **巨日禄 Agent**（中文） | ✅ **有**「智能审片」：宣称自动识别角色断层、崩脸、构图错误、掉帧、模糊、字幕不同步、音画不匹配 | ✅ **有**「自动重抽」：针对瑕疵画面自动重生成，**用户设定 1–5 次重试上限**，再「自动剪辑」替换 | **量出来** | 未说明分数是否暴露给用户；宣称可用率 30%→90%+、审片提速 80%+ ⚠️ **厂商 PR 稿，无独立验证** | [TopMarketing](https://www.itopmarketing.com/info22516) · [网易同稿](https://www.163.com/dy/article/KSQUUBV60556EH7C.html) |
| **Toonflow**（开源，15.2k★） | 🟡 架构上有：三层 Agent 的「监督层」负责"质量审阅与修订反馈" | 🟡 **未说明**是否自动触发重生成 | 未说明 | README 只描述架构 | [HBAI-Ltd/Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app) |

### 2.1 这张表真正说明的三件事

1. **EVALUATION 在国际主流产品里是空白。** 四家 API 的响应体里一个质量字段都没有。Runway 那条积分政策是最锋利的
   证据：厂商把「产出好不好」明确划到自己责任之外。**这不是「没人想到」，是「厂商没有动机」**——判分要花钱、
   会得罪用户（"你凭什么说我这条不合格"）、而且判错的代价全在厂商。这个动机缺口正好是应用层（我们）的机会。

2. **别把 Runway 的 `BAD_OUTPUT` 说成「有自动质检」，会被打脸。** 它的官方解释是"被内部系统以质量或系统错误为由
   拒绝的生成"——那是**黑屏/崩坏到不能交付**的兜底闸，不是「这张脸像不像参考图」的测量；而且文档明确把重试
   决策推给调用方，它自己不重跑。

3. **唯一在做完整闭环的是巨日禄，而且它的产品叙事和我们要做的东西几乎逐字重合**（审片 → 自动重抽 → 自动替换，
   重试次数用户可配 1–5）。**但那是 PR 稿，30%→90% 这个数字没有任何独立验证。**
   建议：真做之前先花一次钱实测它一遍，别拿别人的 PR 数字当我们的设计前提（这条进 §7 拍板项）。

---

## 3. 开源、论文，与「拿什么当眼睛」

> 每条都由子 agent `cat` 过文件确认行号（clone 在 `/private/tmp/`，非本仓）。**F 段 ComfyUI 没查成**，见 §8。

### 3.1 VBench —— 准，但每个维度一个专用深度模型，本地优先的 Electron 跑不起

repo `github.com/Vchitect/VBench`：

| 维度 | 底下是什么模型 | 打分机制 | 帧采样 |
|---|---|---|---|
| `subject_consistency` | **DINO ViT-B/16**（`vbench/utils.py:300,313`；`subject_consistency.py:73`） | `(与上一帧余弦 + 与第一帧余弦)/2` 逐帧累加（`subject_consistency.py:58-61`） | **全帧**逐帧前向 |
| `background_consistency` | **CLIP ViT-B/32**（`vbench/utils.py:252`；`background_consistency.py:70`） | 同构公式（`background_consistency.py:49-51`），但 batch 编码所以快很多 | 全帧 |
| `motion_smoothness` | **AMT-S** 帧插值（`vbench/utils.py:266-267`） | 偶数帧之间插一帧，与真实奇数帧逐像素 `absdiff`（`motion_smoothness.py:144,156-167`） | 全帧（一半插值一半当 GT） |
| `temporal_flickering` | **无模型，纯 numpy**（`vbench/utils.py:261-262`） | 相邻帧 `absdiff` 均值（`temporal_flickering.py:30-42,49`） | 全帧 |
| `imaging_quality` | **MUSIQ (SPAQ ckpt)**（`imaging_quality.py:4`；`utils.py:333`） | 逐帧打分求平均 /100（`imaging_quality.py:49-55`） | 全帧 |

**对我们的判断**：整条路**不适用**。跑一次完整 VBench 要下载并常驻 6+ 个专用模型（还有 UMT / RAFT / GRIT，
`utils.py:256,279,340`），多数全帧逐帧前向，且 `motion_smoothness.py:95-99` 直接读显存
`torch.cuda.get_device_properties(...).total_memory` 来缩放分辨率——**强 CUDA 依赖**。
在本地优先的 Electron 桌面应用里，这是让用户装一个深度学习环境，违反 D1。

**唯一例外值得抄**：`temporal_flickering` 纯 numpy、零模型，几十行能自己实现，正好补上 §5.3 说的
「画面稳不稳」那一轴里可确定性判定的部分。**但它自带前提**——代码注释写死
`"""please ensure the video is static"""`（`temporal_flickering.py:46`），镜头一动就会被判成闪烁。
所以只能在「本镜意图是静态镜」时启用，不能无条件跑。

### 3.2 VideoScore —— 回归头不是生成式，拿不到理由

`github.com/TIGER-AI-Lab/VideoScore`：Idefics2 + **序列分类头**（`examples/run_videoscore.py:7,64`），
`outputs.logits` 直接当分数读（`:95-100`），**不生成文字**。五维（`:29-33`）：visual quality /
temporal consistency / dynamic degree / text-to-video alignment / factual consistency。
量表 **1.0–4.0 浮点**（`:35-37`）。帧数 `MAX_NUM_FRAMES=48`（v1.1，`:56`）均匀采样（`:72`）。
⚠️ `:68` 的注释还写着 "sample uniformly 8 frames"，是**陈旧注释**，别信。

**对我们的判断**：五维选得好（尤其 `dynamic degree` 正好堵住"静态画面被判高分"的假绿），
但**它只吐分数不吐理由**——而 Nomi 的判决要原样显示给用户看（`reason` 字段），
还要拼成定向重滚 directive。**取它的维度，不取它的形态。**

### 3.3 T2V-CompBench —— 这就是「VLM 看帧 → 结构化 JSON」的现成生产实现

`github.com/KaiyueSun98/T2V-CompBench`，judge 在 `LLaVA/llava/eval/compbench_eval_*.py`。三处值得直接抄：

**① 16 抽 6，拼成 3×2 网格图，VLM 只看这一张**
`extract_frames(..., num_frames=16)` 均匀抽（`compbench_eval_consistent_attr.py:35-52`）→ 再从 16 帧
`np.linspace` 抽 6（`:131`，注释 "take 6 from 16 evenly, 1st & last included"）→ `merge_grid()` 拼 3 行 2 列
（`:67-74`）。**一次调用、一张图、成本恒定。**
这与我们审片环的「首尾拼一张」是同一个手法的更成熟版本——**而且它顺带回答了 §5.4 那个自相矛盾**：
拼图路线不依赖任何厂商的多图能力，天然更稳。

**② 先描述、再选项、再允许改主意的三键 schema**
第一步让 VLM 自由描述（`:244`）：
> "The provided image arranges key frames from an AI generated video in a grid layout. Describe the video,
> carefully examining objects rendering quality throughout the frames and their visual attributes."

第二步带 rubric 的选择题 + 强制 JSON（`:295-304`），要求
`option`（A–E）+ `explanation`（≤50 词）+ **`adjust`（解释完之后调整过的选项）**，
而代码**只取 `adjust`**（`:376-377`）。
**`adjust` 这个槽位是免费的自我修正**——先给直觉答案，写完理由允许推翻自己。我们的
`parseShotVerifyVerdict` 今天只有 `{reason, scores}`，没有这一槽。

**③ 同一张图跑 3 次取平均**（`for iteration in range(3)`，`:271`，每次换 seed `:272`；均值 `:425`；
任一次 `"bad reply"` 整条作废 `:421-427`）。这是判分器自身方差的处理办法，我们今天是**只跑一次**。

另一变体给的是更直接的四档量表（`compbench_eval_dynamic_attr.py:321-328`，A/B/C/D → `1.0/0.8/0.2/0.0`，`:373-379`），
形状与我们的 1–5 档 rubric 几乎同构——**说明这个形状是收敛的，不是我们拍的**。

⚠️ 一处更正：这个版本的 repo 里**没有 GPT-4o 路径**（`grep -rln "gpt-4o"` 零命中），judge 全是本地 LLaVA-1.6。

### 3.4 VisionReward / VideoAlign —— 两个可抄的 rubric 措辞

- **VisionReward**（`github.com/THUDM/VisionReward`，CogVLM2-Video 基座，`inference-video.py:10`）：
  **28 条 yes/no 问题清单**（`VisionReward_Video/VisionReward_video_qa_select.txt`），学出来的权重加权
  `np.mean(answers * weight)`（`inference-video.py:112-113`），24 帧（`:42`）。
  **成本上不能抄**：每条问题一次完整前向（`:109-110`）→ 一个视频 **28 次** VLM 调用。
  ⚠️ 顺带发现：questions 28 行、`weight.json` 29 个，长度不匹配（只核实了长度，未跑）。
  **可抄的是它唯一的 boolean 输出形态**：`compare_two_videos(...) -> bool`，
  `np.sum(diff * weight) > 0`（`:130`）——**成对比较，阈值是 0**。见 §3.5。
- **VideoAlign / VideoReward**（`github.com/KwaiVGI/VideoAlign`）：三维 VQ/MQ/TA（`prompt_template.py:13-16`），
  0–10 量表（`:25`）。**它的 rubric 措辞是本轮见过写得最细的**（`prompt_template.py:24-60`），
  三大项各带 5–6 个子维度。其中一条建议直接抄进我们的 rubric：
  **Motion Quality 的 Amplitude**（`:45`）——"If the video is largely static or has little movement,
  assign a low score"。**它堵的正是我们今天最可能出的那种假绿**：一个几乎静止的镜头，
  identity / composition / continuity 三轴全能拿高分（因为什么都没变），但它作为一个**视频镜**是失败的。

### 3.5 最重要的一条发现：**没人在代码里写「低于 X 就重跑」**

子 agent 在三个 repo 里 grep 了 `threshold|thres`，全部命中如下：

| repo | 命中 | 是什么 |
|---|---|---|
| VBench | `dynamic_degree.py:61` `thres = 6.0*(scale/256.0)` + `:85-91` | 判「**动没动**」，不是「好不好」。VBench 里唯一的二值裁决 |
| VBench | `spatial_relationship.py:25` `iou_threshold=0.1` | 判左右/上下关系 |
| VBench | 其余**所有质量维度零阈值** | subject/background consistency、motion_smoothness、temporal_flickering、imaging_quality **只 return 分数** |
| VideoScore | grep 零命中 | 只 print 5 个 float |
| T2V-CompBench | `compbench_eval_dynamic_attr.py:501` `> intermediate_frames*0.65` | VLM 路径上唯一的判定阈值 |
| T2V-CompBench | `compbench_motion_binding_seg.py:456-457` box=0.3 / text=0.25 | GroundingDINO **检测器内部**阈值，不是质量门 |
| VisionReward | `inference-video.py:130` `> 0` | **成对比较**的符号判定 |
| VideoAlign | `calc_accuracy.py:16` `epsilon` | 评测 metric 自己的 tie 校准，不是合格线 |

**这条对我们的意义（本节结论）**：整个开源生态输出的是**分数和排名**，
用途是**离线比较模型 A vs 模型 B**，不是**在线 per-shot 质检**。
所以「低于多少就重跑」**没有现成的业界数字可抄，只能在我们自己的真实数据上标定**。
我们仓里那个 `SHOT_VERIFY_PASS_THRESHOLD = 3`（`shotVerifyCore.ts:54`）在业界找不到同类——
它是自己拍的，而且到今天为止**没有被任何标注数据验证过**（§7 拍板项之二）。

**唯一半个先例是 VisionReward 的成对比较**（`> 0`）。它暗示的做法是
「**同一个 prompt 生两条，比哪条好**」，而不是「给一条打绝对分再卡线」。
`[推测]` 这对 re-roll 场景可能更贴切也更稳（人对"A 和 B 哪个像"的判断比"这个像不像"稳得多），
但它把成本翻倍（每镜生两条）——在 §4.2 的比价下这不是小钱。**不建议现在采纳，建议记进备选。**

### 3.6 论文侧：本轮雷达已经指到同一个地方

[`2026-09-07-radar.md`](2026-09-07-radar.md) 的 🔵 对标基准两条，与本调研是同一件事的两端：
- **KathaTrace / STG**（[2607.01312](https://arxiv.org/pdf/2607.01312)）量的是「**转场语义丢没丢**」，
  多个 SOTA 上 STG 高达 23.5 ± 1.3，人工验证 Fleiss' κ = 0.845。**这正是我们 `continuity` 轴要量的东西**，
  而它给出了一个比"1–5 档"更硬的构造法（同一段叙事分别只喂文本 / 只喂图去问"这一镜为什么接上一镜"，取差）。
- **PersonaShot**（[2608.16717](https://arxiv.org/html/2608.16717)）的关键发现直接打在我们 rubric 的空当上：
  **视觉上很好看的片子，照样频繁出现「物理状态重置、情绪突变、镜间关系断裂」**——
  画质与叙事连贯是两件事。它的**情绪动态**轴是我们三轴之外的一维。

**与本调研合起来的判断**：论文侧建议**先只接 KathaTrace 的 STG 构造法**去加固 `continuity` 轴
（零新依赖，用我们已有的 VLM 通道就能复现），**不要**整套搬基准（别把 eval 变成收件箱，
与雷达同一结论）。

### 3.7 多模态模型当眼睛：契约与价格（官方文档现读，2026-09-07）

| 平台 | 吃不吃视频 | 抽帧控制 | 结构化输出 | 关键数字 |
|---|---|---|---|---|
| **Gemini** | ✅ **唯一真吃视频**。inline bytes（<100MB，<1min，正好覆盖我们 3–10s）/ Files API / YouTube URL | **默认 1 FPS**，`processing.fps` 可调（示例 `fps: 0.5`）；另有 `start_offset` / `end_offset` | ✅ `response_format` + `mime_type: application/json`；⚠️ 文档现在是这个形状，**不是旧的 `responseMimeType`/`responseSchema` 顶层字段** | **≈100 token/秒**（默认 low res）；high res ≈300；**66 token/帧**（low）/ 258（非 low）；音轨 32 token/秒 |
| **Qwen3-VL** | ✅ 支持（`video_url` 传 URL 或 `video` 传帧数组） | **`fps` 默认 2.0**（范围 [0.1, 10]）；`max_frames` 仅 SDK 提供 | 未查 | 输入 **¥0.15/M**（`qwen3-vl-flash`, 0–32K）——全场最便宜 |
| **OpenAI GPT** | ❌ **只吃图**，文档全页无 video input | 自己抽帧当图送 | ✅ `json_schema` + `strict: true` | 32px patch，`ceil(w/32)×ceil(h/32)` × 模型倍率 1.2–2.46 |
| **Claude** | ❌ **只吃图**。连 GIF 都 "only the first frame is used" | 自己抽帧当图送 | — | `⌈w/28⌉×⌈h/28⌉` visual tokens；**200k 上下文模型每请求 100 张图上限**；>20 张时逐图尺寸限制更严 |

出处：<https://ai.google.dev/gemini-api/docs/video-understanding> · <https://ai.google.dev/gemini-api/docs/pricing> ·
<https://ai.google.dev/gemini-api/docs/image-understanding> · <https://www.alibabacloud.com/help/en/model-studio/vision> ·
<https://help.aliyun.com/zh/model-studio/model-pricing> · <https://developers.openai.com/api/docs/guides/images-vision> ·
<https://platform.claude.com/docs/en/build-with-claude/vision>（均 as read on 2026-09-07）。

**最反直觉的一条**：**把整段 5 秒视频塞给 Gemini（≈500 token）比给它 3 张 720p 静态图（≈4644 token）便宜约 9 倍。**
因为视频路径默认走 low media resolution（66 token/帧），而图片路径走 258 token/切片 × 6 切片
（1280×720 的 crop unit = floor(720/1.5)=480 → 3×2=6 切片）。
**这直接反驳了「抽帧是为了省钱」这个直觉**——在 Gemini 上抽帧反而更贵。抽帧的真正理由是
①**跨供应商可移植**（OpenAI/Claude 根本不吃视频）②**可控**（我们决定看哪几帧，而不是让厂商替我们采样）
③**能把锚图和产出帧放进同一张图对比**（这才是 identity 轴的关键，见 §5.4）。

**判官 : 重滚 的成本比**（重滚按 §4.2 实测的 ¥1–3.5 算）：

| 判官方案 | 单镜判分 | 判 100 镜 | 判/重滚（对 ¥1） |
|---|---|---|---|
| `gemini-2.5-flash-lite`，整段视频 | ¥0.00114 | **¥0.114** | **1 : 877** |
| `qwen3-vl-flash`，3 帧 *(每帧 token 为估算)* | ¥0.00089 | ¥0.089 | 1 : 1120 |
| `claude-haiku-4-5`，3 帧 | ¥0.0347 | ¥3.47 | 1 : 29 |
| `claude-opus-5`，3 帧 | ¥0.174 | ¥17.4 | 1 : 5.7 |

**结论（这条决定了整个方案的可行性）**：**判官成本在便宜档上完全不构成约束**——
用 flash 档判满 100 个镜头（¥0.11）还不到**一次**重滚（¥1）的 12%。
所以判官**不该按价格选，该按判得准不准选**；便宜到这个程度，甚至可以三模型投票取多数
（对应 §3.3 里 T2V-CompBench 的"同一张图跑 3 次"），成本仍远低于一次误判导致的重滚。
**这也意味着 §5.5 里"给判分设省钱上限"是在错的地方省钱**——该设的是**时间**界（已有 60s），不是花费界。

⚠️ 需要标出来的估算与缺口：Qwen 每帧 token 公式**未查到**（`/video-understanding` 页中英双域名均 404），
表中 ≈1200/帧是按 28px patch 行业惯例的**估算**，接入前必须用真实请求的 `usage` 回填校准。
汇率按 1 USD ≈ 7.1 CNY 换算（非文档数据）。

### 3.8 抽帧策略 vs 准确率：**没有可引用的公开曲线，别硬找**

任务里问的那张表（同模型同 benchmark，帧数 1/4/8/16/32/64/128 → 准确率）**本轮没查到**。两处已核查：

- **Video-MME 原论文**（<https://arxiv.org/html/2405.21075>）**没有**帧数消融表。它只在 §7 记录了各模型各自的
  默认采样帧数（GPT-4V 10 帧 / GPT-4o 384 帧 / Video-LLaVA 8 帧）——那是**配置记录，不是控制变量实验**。
- **Frame-Voyager**（<https://arxiv.org/pdf/2410.03226>）确有一张 Video-MME 随帧数变化的表
  （8 帧 47.5% / 16 帧 48.2% / 32 帧 48.6% / 64 帧 49.7% / 128 帧 50.5% / 256 帧 50.8%），
  **但必须注意这是"候选帧池"大小的消融，实际喂给模型的帧数被冻结在 8 帧**——它量的是帧选择算法的搜索空间，
  不是"多喂帧能不能提高准确率"。**直接引用是误读。**

可用的旁证只有趋势：候选池从 8 扩到 256（32 倍）只换 +3.3 个点，128→256 只有 +0.3，**强烈饱和**。
而且这些都是**长视频** benchmark——我们 3–10s 的短镜头 @1fps 只有 5 帧，**根本不在这些实验的取值范围里**，
外推不成立。

**处方：这个缺口不靠找论文补，靠自建评测补**（也是 §5.7 探针的方向）。
用我们自己的镜头库做一次 3 帧 vs 5 帧 vs 10 帧的对照，判官结论对齐人工标注——
按 §3.7 的价格，100 个镜头跑三档 ≈ **¥0.35 以内**，比继续查文献快得多也准得多。
**这条正好和我们仓里已有的实测互补**：`shotTimeline.ts:112-118` 那条 3 帧 vs 1 帧的实测量的是
**召回**（单帧漏掉只在第 3 帧出现的弹窗），没量**判分准确率**。

---

## 4. 自媒体来源（TikHub · 本轮实查）

抓取命令（原样，可重跑）：

```bash
source ~/.zshenv                 # key 只从环境变量 TIKHUB_API_KEY 读，不进命令行、不写文件
for slot in kw1 kw2 kw3 kw4; do
  node scripts/research/tikhub-search.mjs --q "<该组关键词>" --platform all --limit 15 \
    --out docs/research/2026-09-07-agent-self-review-of-generated-shots/tikhub/$slot
done
```

四组关键词：`kw1` =「AI视频 一致性 重跑」、`kw2` =「Seedance 人脸 变了」、`kw3` =「AI短剧 质检」、
`kw4` =「AI视频 抽卡」。四平台 × 15 条 × 4 组 = **240 条**，四组全部返回正常（本轮无失败查询）。
目录名用 ASCII 槽位而非关键词原文（git 会给非 ASCII 路径加引号，`pre-push-check.sh` 的 `^docs/` 判据会
把纯文档改动误判成代码改动——沿用 `2026-09-07-radar` 的做法）。
原始产物：[`2026-09-07-agent-self-review-of-generated-shots/tikhub/`](2026-09-07-agent-self-review-of-generated-shots/tikhub/)。

> **对原始产物做过的唯一一处改动**：`kw1` 里有一条 B站分享链接带着发帖人的 `vd_source=<32位hex>`
> 追踪参数，被 `check:secrets` 判成疑似明文 key。那是**误报**（不是我们的凭证），但它确实是第三方的
> 会话指纹，没必要留在我们仓库里——已就地替换成 `REDACTED-BILIBILI-VD-SOURCE`。
> **没有走行级豁免标记**：那条棘轮（`MAX_INLINE_ALLOWS = 3`）存在的意义就是让人别随手标绿，
> 为一条追踪参数把它抬高不划算。除此之外正文一字未改。

### 4.1 最有价值的两条：「质检」在这个圈子里已经是个工种

| 平台 | 出处 | 作者 · 时间 | 原文摘要 |
|---|---|---|---|
| 小红书 | [链接](https://www.xiaohongshu.com/explore/6a3ac3f1000000001101229c?xsec_token=YBhL13UpAZo0zaiH1eiQGCVK1Et9FeCZAecz6RbxwW9RQ%3D&xsec_source=pc_search) | 雨欣爱剪辑 · 2026-06-24 | 标题《**AI素材返工率60%→5%的质检SOP**》。正文：「每个用AI做视频的人，应该都踩这个坑：不是提示词写不好，**而是工期太紧，有时候交出去的图自己没来及认真检查**。」 |
| 小红书 | [链接](https://www.xiaohongshu.com/explore/6a730806000000002c005e7f?xsec_token=YBCxJPdPHs19O1yWxw_Tv6GgkLyyGkKZKywoIR4pCSOGI%3D&xsec_source=pc_search) | 编导路飞杰 · 2026-08-05 | 标题《**AI 短剧漫剧上传平台之前做好这 18 项审片**》。正文：「能避开 80% 返工问题。」 |

**这两条为什么是本节的头条**：它们证明「审片」**不是我们发明的需求**——从业者已经把它做成了 SOP 和 18 项清单，
还给它标了量化收益（返工率 60%→5%、避开 80% 返工）。而且第一条那句「**自己没来及认真检查**」精确地说出了
D1 意义上的真实摩擦：**不是不会判，是没时间逐条判**。这正是自动化该切进去的位置——不是替人做审美判断，
是替人做那件"每条都要看一眼、看 100 条就没人看得动"的体力活。

### 4.2 「抽卡」是他们自己给这件事起的名字，而且成本有硬数字

| 平台 | 出处 | 作者 · 时间 | 原文（节选） |
|---|---|---|---|
| 抖音 | [链接](https://www.douyin.com/video/7484930398896524585) | 猩猩技术分享 · 2025-03-23 | 「**可灵抽一次卡 3.5 元**成本高不高？」 |
| X | [链接](https://x.com/rey99eth/status/2095825676486250927) | Reynolds-小影马 · 2026-09-04 | 「花费时间：7 分钟 模型：seedance 2.0 720P mini **成本：464 积分×0.039＝18 元 一集 5 分镜并发生成视频**」（≈**3.6 元/镜**） |
| 小红书 | [链接](https://www.xiaohongshu.com/explore/6a9b99680000000025035e39?xsec_token=YBZZsyh3sHLGe8aPYzqkzlXmbcxcp9iDg9592F1YcMrhs%3D&xsec_source=pc_search) | 塑料大王 · 2026-09-05 | 标题《**花1.2万积分做的穿帮小短片**》：「第一次尝试做人物一致性、动作衔接、人物情绪、多人对话真的比想象中难很多，前前后后跑了不少版本。**我燃尽了积分**」 |
| B站 | [链接](https://www.bilibili.com/video/BV1SMtB6bENq) | 千代澪official · 2026-09-04 | 「本来想要全程用第一人称的结果第一人称视角刚开头给我干碎了。**疯狂出错，废稿一堆，又烧一堆积分**，还是妥协改回第三人称了。」 |
| B站 | [链接](https://www.bilibili.com/video/BV1pKN96iEso) | Xuan_酱 · 2026-07-14 | 「从"**抽卡式工作流**"进入高度可控的"**片场式工作流**"，让AI短剧告别抽卡难题，把巨额的成本打下来」 |

**读到的真实摩擦**（不是功能列表，是他们在骂什么）：

- **一次重滚 ≈ 1–3.5 元，判一次分 ≈ 分币级。** 这个 1:30 上下的比价是整套方案的经济学地基。
  「先花几分钱判一下，判不过才花几块钱重滚」在账上是无脑赚的——**而今天我们是无脑重滚，或者干脆不判**。
- **他们判什么**：跨镜「变脸」、服装/发色跑偏、场景穿帮与空间关系洗牌、动作衔接、多人站位、
  「明明单人镜头它多塞一个人」、背景乱冒字、方形视频。
  与我们审片环三轴（identity / composition / continuity）**高度重合**，缺的一轴是**画面稳定性/技术缺陷**
  （掉帧、糊、多手多指）——那一轴今天我们的 rubric 没有（§5.3 会讨论要不要加）。
- **「片场式 vs 抽卡式」是他们自己的话术**，而且是**褒贬分明**的：抽卡 = 失控 + 烧钱。
  这句话可以直接当我们的产品叙事，不用另造词（D6：别自造名词）。

### 4.3 最扎心的一条：我们要做的东西，已经有人用别的壳做出来并且在卖

> **X · 鸟哥 | 蓝鸟会 · 2026-08-31** ——「1️⃣ video-use 整个视频流程的总管。文案、分镜、素材、交付要求它统一盯着，
> **剪完还会自己回头查一遍字幕、音频、画面有没有翻车，过了才给你看。最狠的是它不真去看视频，而是把视频读成
> 文字加几张图**，靠转录的逐词时间戳来精确卡剪辑点，**成本压得极低**。」
> <https://x.com/NFTCPS/status/2094316049974034906>

**这条为什么必须进正文**：它把 §5 的设计**逐字说完了**——① 自动回头查；② 过了才给用户看；
③ **不喂整段视频，喂"转成文字 + 几张图"**；④ 理由是成本。这是一条**独立于我们的**外部佐证，
说明「抽帧 + VLM + 结构化判决」这条路不是我们拍脑袋，是已经有人跑通并且拿成本说话的做法。

另外两条同向：
- **X · Vincent · 2026-05-26**：「我跑了 Toonflow…**内置6个AI智能体——导演、编剧、分镜、质检、配音**，像真实剧组一样分工。」（<https://x.com/Vincent_AINotes/status/2059106178005639490>）——「质检」被当成剧组的一个固定工种。
- **小红书 · 橙以零AI · 2026-06-24**：《**AI短剧变革！废片质检员下岗！**》「#巨日禄Agent … **#自动审、自动抽、自动剪** #一键成片」（<https://www.xiaohongshu.com/explore/6a3b7dbb0000000021014c7b?xsec_token=YBjrC3JEBOdsfnNggP9wNsGDddRDSCfdiWb3KGO2ywrYc%3D&xsec_source=pc_search>）——与 §2 的巨日禄 PR 稿互为印证：**这是他们对外的主打卖点**，不是附带功能。

### 4.4 反方证据：也有人认为这条路根本不该走

> **X · 沐阳 · 2026-09-03**：「目前，**不管多么强大的AI、多么聪明的Agent、多么专业的编排和提示词，都无法实现场景的
> 绝对一致性**。所以未来，一定是要拥抱"世界模型"的…」<https://x.com/yyyole/status/2095492063991357608>

**这条对我们成立吗**：一半成立。他说的是**生成侧**天花板——对，判分救不了模型本身画不出来的东西
（我们自己的 `SHOT_VERIFY_NOT_ASSESSABLE` 哨兵就是为这类"重滚也救不回来"的情况设的，§5.2）。
但他的结论跳步了：**"达不到绝对一致"恰恰是需要判分的理由，不是不需要的理由**——正因为一定会崩，
才需要知道**这一条崩没崩**，而不是等用户看完 100 条自己发现。
---

## 5. 我们的形式

> 本节的底层逻辑（D6，一句话）：**这件事我们做过了，做在了错的那条腿上。**
> 「看片工具」不是新造一个能力，是把已经在跑的审片环**接到 Agent 手上**、再给它一条能改主意的通路。

### 5.1 现状盘点：三条路有眼睛，第四条（Agent lane）没有

| # | 路径 | 谁触发 | 判分 | 定向重试 | 接线点 |
|---|---|---|---|---|---|
| ① | 外部 MCP 宿主（Claude Code 等，stdio） | `core.generateOnProject` 单镜成功后 | ✅ | ✅ K≤2 | `electron/capabilityCore/mcpStdioServer.ts:223` |
| ② | 本地 RPC（CLI / GUI 开着时同一份） | 同上 | ✅ | ✅ K≤2 | `electron/capabilityCore/rpcServer.ts:378` |
| ③ | 渲染层画布（GUI 自己生成） | `shotVerifyStore` / `shotVerifyRunner` | ✅ | ❌ **只判不重试**，喂对账卡 | `src/workbench/generationCanvas/agent/shotVerifyRunner.ts` |
| ④ | production run 的 `qa` 阶段 | 批量、run 收尾 | ✅（走渲染层 `verifyShotsAndReport`） | ❌ | `electron/productionRun/productionQaVerdict.ts:1-150` |
| ⑤ | **应用内 Agent lane（pi harness）** | — | ❌ | ❌ | **不存在** |

**⑤ 的证据（可复核）**：harness 工具描述符文件里的工具一共 **33 个**（`grep -rh 'name: "' electron/harness/tools/*.ts | sort -u | wc -l`），全名单——
`append_to_end / arrange_storyboard_to_timeline / author_skill / control_production_run / create_camera_move /
create_staging_reference / decide_production_gate / get_production_run / insert_at_cursor /
materialize_production_storyboard / nomi_canvas_edit / nomi_canvas_maintenance / nomi_canvas_plan /
nomi_canvas_read / nomi_decide_generation_gate / nomi_document_edit / nomi_document_read / nomi_export_job /
nomi_generation_plan / nomi_generation_status / nomi_media_query / nomi_request_generation_gate /
nomi_start_generation / nomi_timeline_edit / nomi_timeline_read / propose_storyboard_plan /
read_production_artifact / read_production_artifact_content / replace_selection / review_production_artifact /
revise_production_artifact / start_production_run / subscribe_production_run`
（源：`electron/harness/tools/{canvasDescriptors,documentDescriptors,editingPiDescriptors,productionRunDescriptors,skillDescriptors}.ts`）。

**没有一个返回像素或画面判决。** 最接近的两个都不是：
- `nomi_media_query` = `asset.read`，结果里写死 `semanticInspection: "not_performed"`
  （`electron/shared/agentCapabilities/assetRead.ts:119,142`）——它给的是时长/分辨率/编码/波形，**不是画面**。
- `review_production_artifact` 是「批准/打回某个**文档产物版本**」（`productionRunDescriptors.ts:81-91`），
  跟看画面无关。

**结论**：Agent 今天判断「这一镜行不行」的唯一依据是 `nomi_generation_status` 的**任务状态**——
即「HTTP 200 且落了个文件」。它对画面的认知等于零。

### 5.2 已有审片环的完整契约（这就是「看片工具」的 v0，别重写）

**三轴 rubric**（`shotVerifyCore.ts:31-52`），每轴 1–5 档带锚点：

| 轴 | key | 判什么 | 5 档 / 3 档 / 1 档锚点 |
|---|---|---|---|
| 身份 | `identity` | 主体与该镜引用的角色/场景/道具**锚**是否一致（脸型/发色/服装/标志物） | 与锚完全一致 / 大体一致但细节偏 / 明显对不上（张冠李戴、换人换装） |
| 构图 | `composition` | 机位/景别/主体站位是否符合镜头描述 | 完全符合 / 主体对但机位景别偏 / 与描述明显不符 |
| 连贯 | `continuity` | 是否接得上前一镜（场景/时间/光线/风格不无故跳变）。**首镜不评** | 顺畅衔接 / 轻微跳变 / 明显断裂（白天跳夜里、换景） |

**四条已经踩过坑换来的设计**，任何重做都必须原样带走（否则就是把学费重交一遍）：

1. **`SHOT_VERIFY_NOT_ASSESSABLE = 0` 哨兵档**（`shotVerifyCore.ts:65`）。
   2026-08-20 真额度实测抓出：同一个锚喂 5 个不同景别，`identity` 打分变成了「**脸在画面里占多大**」的函数，
   而不是一致性的函数——中景 5 档、远景 3 档、**眼部微距 1 档并标红**（画面里根本没有可比对的脸部结构）。
   于是：① 误报红标；② 触发一轮**永远救不回来**的定向重试（重滚一张眼睛微距不会让眼睛变得更可辨认）。
   处方：给判分器一条正路——**看不到就报 0，我们据此跳过该轴**，不算偏差、不红标、不重试。
   均分统计里 0 **出分母、单独计数**（`assessableAverage`，`shotVerifyCore.ts:147-166`），
   因为按 0 计入会凭空拉低、按 5 计入会凭空拉高，两种都是在编造信息。
2. **视频镜喂「首帧+尾帧横向拼图」，不是单张首帧**（`extractVideoFrame.ts:165-189`，`shotVerifyDeps.ts:117-126`）。
   2026-08-20 L3-F1 实测：只看首帧 → **任何随时间展开的镜头都被误判**（「逐渐显出/由暗转亮/缓缓推近」
   这类最常见的短剧镜头语言，首帧本来就该是空的），重滚一次仍 1 档 → 红标 + 白烧额度。
   顺带补上另一个盲区：**只看一帧对「中途变脸」（视频生成的头号失败模式）完全失明**——首尾同图后判分器
   能直接比较两端是不是同一个人。rubric 里有对应的第 ④⑤ 条铁律（`shotVerifyCore.ts:194-197`）。
3. **判分要对着「我们真正发给模型的那份提示词」判**（`core.ts:686-689`）。
   L3-F1 第二层坑：`ffDesc` 被丢掉时，判分器拿到的是同一份被削过的提示词，于是「便利店挂钟」出成
   「书房座钟」它照样给构图 5 分——**判分环对上游丢失的信息是盲的**。
4. **判分绝不拖垮生成**（`shotVerifyOrchestrate.ts:195-215`）。60s 硬界与整段判分+重试竞速；
   超界/抛错 → `skipped(reason)`、生成结果照常交付。现场根因：判分模型端点连续 500，把整个 `tools/call`
   拖到 300s 客户端超时，**生成结果被丢给了超时错误**。另一条同族铁律：**判分失败 ≠ 低分，绝不触发 regenerate**。
   还有一条语义洁癖值得保留：`skipped ≠ passed`——没判过就不许自称通过（`skippedOutcome`，`:170-173`）。

**判决输出形**（`ShotVerifyOutcome`，`shotVerifyOrchestrate.ts:81-101`）：
`evaluated / skipped / reason / passed / retries / scores{三轴档位} / flagged[] / suggestion`。
**这已经是一份结构化判定 + 建议动作**了，缺的只有「置信度」（§5.3）。

### 5.3 输入输出契约草案（delta，不是从零画）

**输入**（今天 `ShotVerifyShot` 已有，`shotVerifyOrchestrate.ts:27-41`）：
镜头产物 `frameSourceUrl` + `isVideo` · 镜头意图 `shotPrompt`（必须是**实发**提示词）· 锚描述
`anchorDescriptions[]` · 上一镜意图 `previousShotPrompt?` · 标题。

需要补的三项：

| 补什么 | 为什么 | 代价 |
|---|---|---|
| **`expectedAction`**（期望动作描述，独立于构图） | 今天三轴里**没有"动作对不对"这一轴**——`composition` 判的是机位/景别/站位，是静态的。而任务里点名的「动作是否对」和 TikHub 里创作者反复提的「动作衔接」都落在这个空当里。首尾拼图恰好是判动作的天然输入（两端之差 = 动作演进） | rubric 加一轴 = 判分 prompt 变长、要重新校准分档准确度（**不能顺手加**，见 §7） |
| **`confidence`**（判官自评置信度） | `ShotVerifyOutcome` 今天没有置信度。有了它，编排层才能区分「明确不合格」（重滚）和「拿不准」（不重滚，交给人）——**这是省钱的开关，不是装饰** | 输出 schema 加一个字段 + prompt 加一句 |
| **`technical` 轴？** | TikHub 里创作者列的失败模式有一类我们完全没覆盖：掉帧、糊、多手多指、背景乱冒字、方形视频。**但其中一半（分辨率/画幅/时长）是确定性可查的，根本不该问 VLM** | 建议**拆开**：确定性的进 `asset.read` 的 `technical`（已有 width/height/fps/duration，`assetRead.ts:78-90`）由策略解析器兜；只有"糊/多手指"这种才值得进 rubric |

**输出**：沿用 `ShotVerifyOutcome` 加 `confidence`。**但给 Agent 的投影要另做一层**——
模型面只该看到「过了没 / 哪一轴不过 / 建议做什么 / 有多确定」，不该看到 `retries`、`skipped` 这类编排内部状态
（那些进 `details` 给面板）。

**⚠️ 这里有一堵墙必须先决定拆不拆（C2）**：看片能力**不能**长成 `asset.read` 的新字段。
`assetRead.test.ts:59-67` 逐项断言结果里出现 `url`/`bytes`/非 `"not_performed"` 的 `semanticInspection`
必须解析失败。正解是**新契约**，建议 `shot.review`，模型面别名 `nomi_review_shot`，
`effect: "read"`（不改画布、不花生成额度）、`effectClass: "reversible_local"`、审批档 `auto-granted`。
它自己会调一次判分模型（花的是 text 额度不是生成额度，见 `shotVerifyDeps.ts:154-171` 的注释：
`kind: 'image_to_prompt'` → `billingKindForTaskKind → 'text'`，在 runtime.ts 里**早于 grant 校验返回**）。

### 5.4 抽帧策略：我们自己已经有实测数据，不用去外面找

**仓里现成的结论**（`electron/video/shotTimeline.ts:112-130`，注释里带实测）：

> 为什么默认 3 帧而不是 1 帧：**单帧会漏掉「出现又消失」的字幕/角标/价格**——实测同一镜的 3 帧里，
> 下载弹窗只在第 3 帧。而 3 帧的代价极小：**image token 线性 ×3，但墙钟只慢 26%（8.8s → 11.1s，
> 瓶颈在模型思考不在传图）**。
> 取首/中/尾而不是均匀撒点：首帧定构图、尾帧看运动到哪、中帧兜住主体。
> **两端各内缩 8%**，避开转场帧（切点处常是叠化/黑场，抽到就是一张糊的）。

这条实测（源 `docs/plan/2026-08-13-video-deconstruction-storyboard-table.md`）**直接回答了任务里的第 3 问**：
首中尾 3 帧是当前已验证的性价比点，`sampleSecondsForShot(shot, frames = 3)` 就是那个函数，已在
`electron/video/deconstructVideo.ts:232` 生产使用。

**但审片环今天没用它** ——它走的是 `extractVideoEndpointsToAsset`（首+尾**两帧拼一张**）。
差异的根因写在 `extractVideoFrame.ts:184-186`：

> 为什么拼成一张而不是喂两张图：**runtime 的多模态通道只取 `referenceImages` 的第一张**
> （见 shotVerifyDeps 的 callJudge 注释），传两张会静默丢一张。拼图对任何单图判分模型都成立，
> 不依赖某家的多图能力。

⚠️ **这条注释与另一处代码打架，是本次调研挖到的一个真实不一致**：
`electron/textTaskRunner.ts:26-30` 明写 `image_to_prompt` **走多图**（视频拆解一次喂一镜 3 帧），
`deconstructVideo.ts:249` 也确实传了 3 张。而 `shotVerifyDeps.ts:165` 的 `callJudge` 只传 1 张
（`referenceImages: [toJudgeImageUrl(frameImageUrl)]`）并注释「firstReferenceImage 取它当多模态图」。
**两处对同一条通道的能力描述相反。** 二者必有一处是陈旧的——大概率是审片环那条注释写在多图支持落地之前。
**这是实施前必须先用一条探针钉死的事**（§5.7 探针 A，零额度）：若通道确实支持多图，审片环就该改喂
**首中尾 3 帧 + 锚图**（判 identity 时判官能直接看见定妆图，而不是只读一段文字描述），
那是判分准确度的一次结构性提升，而不是调参。

### 5.5 重试策略与预算：今天的 K≤2 是对的，缺的是「换模式」那一档

**今天有的**（`shotVerifyOrchestrate.ts:221-251`）：
- 硬封顶 `K = 2`（`Math.min(2, …)`），配 grant 的 `maxAttemptsPerNode = 3`（1 首发 + 2 重试）。
  **重试复用首发 grantId + 同 nodeId 直发**，不第二次 `confirmSpend`——吃同一颗 grant 的剩余次数，
  预算天然封顶，这个设计是对的，别动。
- **定向重滚指令**（`buildRetryDirective`，`:130-146`）：读判低的轴 → 拼
  「保持〈没判低的那些〉尽量不变，只修正〈判低的轴〉」。源出 ViMax「保背景换角色」。
  **不含角色名**（对齐污染词铁律：directive 只约束"保持什么/修正哪一轴"，不复述具体设定值）。

**缺的一档：换模式。** 今天不过就是原地重滚同一个模型同一个模式。而真实的失败模式里，
有一类**重滚多少次都救不回来**——TikHub 里那句「明明单人镜头，它能给你多塞一个人」、
「容易出方形视频」，以及沐阳那条「达不到绝对一致」说的都是这个。这时正确的动作不是第三次重滚，
是**换一条路**：t2v → i2v（先出一张图再驱动）、或换成带参考槽的模式、或换模型。

**这一档不该由判分器决定，该由策略解析器决定**——见 §5.6。判分器只负责说「哪一轴不过、有多确定」，
「换成什么」是模型档案的知识，那是 #573 的地盘。

**预算上限的建议形状**（三个数，都可配、都有默认）：
- 单镜重滚 K ≤ 2（不变，已有硬封顶）；
- **换模式最多 1 次**，且只在 `identity` 或 `composition` 连续两轮同轴不过、且 `confidence` 高时触发
  （拿不准就别换——换模式的代价是用户看到的画风变了）；
- **判分总花费不设独立上限**，因为它是分币级；但保留 60s **时间**硬界（已有）。
  理由见 §4.2 的比价：判分/重滚 ≈ 1:30，给判分设省钱上限是在错的地方省钱。

### 5.6 落在重做的哪个阶段 + 与策略解析器的接口

**落点：阶段 3。** 理由是依赖顺序，不是重要性——
- 阶段 2 才把 `canvas.write` 拆平、把契约收齐；`shot.review` 是**新契约**，跟着阶段 2 的契约批次走最省事；
- 它是**长工具**（判分 + 最多 2 次重滚，可到分钟级），依赖阶段 3 才做的「长工具进度 `onUpdate` +
  契约 `timeoutMs` + 任务卡」三件套——与 #572 深度视频处理节点是同一类接法
  （见阶段 3–5 深化方案 §4.5 对 #572 的处理）；
- 阶段 5 同源投影时它天然对外（MCP 宿主也该能审片），无需额外设计。

**与策略解析器（#573 `feat/generation-strategy-resolver-20260907`）的接口 —— 这是本节最重要的一条：**

深化方案 §4.5 把 #573 定位成「**Agent 写分镜时的决策工具**」，读类别名 `nomi_generation_resolve`，
`promptGuidelines` 一句「写分镜行之前先 resolve，把阻断当硬约束」。**它是生成之前的确定性引擎。**

`shot.review` 是它的**时间对偶**：生成之**后**的判据。两者应当接成一个环，而不是各干各的：

```
  写分镜 ──► nomi_generation_resolve ──► 生成 ──► shot.review ──► 判决
   ▲          （生成前·确定性·纯函数）              （生成后·VLM·带置信度）  │
   └──────────────────────────────────────────────────────────────────┘
              判决里的「建议换模式」回灌成 resolve 的一次新输入
```

具体三条接口约定（建议写死，否则实施阶段一定各造一份）：

1. **判决不直接指定模型/模式。** `shot.review` 输出的是`{轴, 档位, 置信度, 人话理由}`；
   「那该换成什么」必须回头问 `nomi_generation_resolve`——**模型能力面只有一个真相源**，就是模型档案
   （`electron/shared/videoCapabilities/`，42 个档案文件）。判分器擅自建议"换成 i2v"就是第二份档案知识（P1）。
2. **`resolve` 的阻断理由与 `review` 的偏差轴共用同一套词表。** 否则用户会看到两套说法描述同一件事
   （R14.1「同一语义有几份定义」正是要拦这个）。`SHOT_VERIFY_DIMENSIONS` 已经是词表 owner，
   建议 `resolve` 那侧对齐它，**并登记进 `check:vocabularies`**。
3. **定向重滚走 `resolve` 校验一次再发。** 今天 `buildRetryDirective` 拼完 directive 直接发
   （`shotVerifyDeps.ts:198+`），没过策略解析器——如果 directive 让参数越界（比如改了时长/画幅），
   会白烧一次。接上之后重滚也享受钳值。

### 5.7 最小探针（两条，一条零额度、一条 ≤¥3）

**探针 A（零额度，先跑，因为它决定 B 怎么写）—— 多模态通道到底吃几张图？**
起因是 §5.4 挖到的那处自相矛盾。做法：不启动 GUI，直接对 `executeTextTask` 打一发
`kind: 'image_to_prompt'` + `referenceImages: [A, B]`（A 是纯红色块、B 是纯蓝色块），
问「你看到几张图，分别是什么颜色」。
- 答「两张，红和蓝」→ 通道支持多图 → 审片环该改喂**首中尾 3 帧 + 锚图**，`extractVideoFrame.ts:184` 的注释是陈旧的，删掉；
- 答「一张，红色」→ 注释成立、`textTaskRunner.ts:26` 的注释才是陈旧的，拼图方案保留。
**必须带阳性对照**：同一发只传 1 张，确认它答"一张"——否则模型答"一张"也可能只是它没数清
（memory `race-repro-needs-positive-control`）。

**探针 B（≤¥3）—— 判官抓不抓得出「人脸变了」。**
**关键**：必须有阳性对照，否则测的是"判官会不会说通过"而不是"判官会不会抓"。用仓里现成的真实产物：
- **阴性对照**（应当 PASS）：锚 `outputs/anchor-static-ab-20260902/anchor.png`（红发双辫、雀斑、蓝眼、
  额头红色 X 疤、灰开衫、米色衬衫、墨绿裙、黑雨靴）+ 同项目产出 `shot3-A-imageOnly.png`。
  本轮已人眼核对：**身份保持得很好**，判官应给 identity ≥ 4。
- **阳性对照**（应当 FLAG）：同一个锚 + **另一个项目/另一个角色**的镜头产物，冒充成这个锚的镜。
  判官必须给 identity ≤ 2 才算通过探针。
- 跑法：`node evals/verify-shot-smoke.mjs` **已经存在**（`evals/verify-shot-smoke.mjs:1-98`），
  它已经做好了最难的部分——不开窗启动 Electron、走 `safeStorage` 解密真 key、发真请求、宽松解析 JSON。
  需要的 delta 只有两处：把 `icon.png` 换成上面两张真实产物，把断言从"能解析出 scores"改成
  "**阴性≥4 且 阳性≤2**"。一次判分是分币级，两次远在 ¥3 以内。

**本轮没跑成 B，原因诚实标注**：这台机器**磁盘满了**（`/System/Volumes/Data` 100%，最初只剩 593Mi），
`pnpm build` 死在 `ENOSPC: no space left on device`，而探针要走主进程 `safeStorage` 读 key 就必须有
`dist-electron` 产物。清掉本次自己的半成品后回到 7.8Gi，但**没有在别人的 worktree 上做清理**
（这台机器有 188 个 worktree，并行会话正在用）。这条挂在 §8。
---

## 6. 六角色评审（R7）

**CTO** —— 反对把这写成"新功能"。证据摆得很清楚：审片环已经在 main 上跑，接线点两处，纯核 295 行带
等价性测试双份守恒。真正的工作量是**接一条线 + 补一个契约 + 加一行验收**，不是造轮子（R20 第三问：
不在护城河上又碰钱的用标准实现——这里连"买"都不用，自家就有）。**唯一要盯死的是 P1**：
Agent lane 那条接线**必须复用 `shotVerifyOrchestrate`**，不许因为"lane 里不好注入 deps"另写一份判分。
今天已经是「一份纯核 + 四处接线」，第五处再走样就真成并行版了。

**设计** —— 三轴 rubric 的档位锚点写得比我见过的任何开源都具体（"白天跳夜里/换景"这种是能对着判的），
这部分别动。但有两件事从用户视角看是错的：① **`suggestion` 现在只会说"建议在 Nomi 里重滚这一镜"**
（`shotVerifyOrchestrate.ts:247-249`）——用户看到这句会问"那我改什么？"，它没给可执行的下一步；
② **红标出现在哪儿没定义**。判决在外部 MCP 路上是文本行，在渲染层是对账卡，在 production run 里是事件——
**三种不同的用户可见形态**。接 Agent lane 之前先把"用户在哪看到、看到什么"画成样张（R8），别先写码。

**PM** —— 从 §4 的证据看，这件事的用户价值命题是清楚的且**有人已经在拿它当主卖点卖**（巨日禄）。
但我要提醒一个取舍：**自动重滚会花用户的钱**。今天 K≤2 是复用同一颗 grant 的剩余次数，所以是"用户已经
批准的预算内"；一旦加了"换模式"那一档（§5.5），就可能跑到用户没预期的模型上。**换模式必须弹一次卡**，
不许 auto-granted。这条不是技术选择，是信任问题。

**前端** —— `ShotVerifyOutcome` 直接投给模型是错的：`retries`、`skipped` 这些是编排内部状态，
模型看到只会被带偏（"我重试了 2 次"会诱导它再重试）。要一层投影，`content` 只给
「过没过 / 哪一轴 / 建议问 resolve / 置信度」，其余进 `details` 给面板。这与深化方案 §3.1 对
`nomi_generation_resolve` 的处理是同一个模式，照抄即可。

**后端** —— 三条落到实现的意见：① §5.4 那个**多图通道自相矛盾必须先探针钉死**，
它决定审片环喂 1 张还是 4 张，是形状问题不是调参问题，事后改代价大；
② 判分走 `image_to_prompt` → 计费按 `text`、且**早于 grant 校验返回**（`shotVerifyDeps.ts:154, 159` 注释），
这条性质别在重做里丢掉，否则判分会去吃生成 grant；
③ 60s deadline 和"判分失败 ≠ 低分"这两条韧性铁律是 L3 真跑换来的，**在 lane 里重新接线时最容易丢**——
因为 lane 有自己的超时和错误语义，很容易让判分错误冒泡成工具失败。

**真实用户（做 AI 漫剧的那位）** —— 我不要它替我决定什么叫好看。我要的是：
**跑完 100 个镜头，告诉我哪 8 个要重看**，其余别烦我。
`§4.1` 那句"自己没来及认真检查"就是我。另外——**别偷偷重滚**。
我可以接受它自动重滚 2 次，但结果里必须写清楚"这一镜重滚过 2 次"，
不然我以后调提示词的时候完全不知道哪条是第一次出的、哪条是救回来的。
（→ 这条落成需求：`retries` 必须在**交付里对用户可见**，虽然不该投给模型。）

---

## 7. 要用户拍板的（2 条，都给了推荐项）

### 拍板 1：审片环接进 Agent lane 时，**要不要同时加「动作」和「稳定性」两轴**

- **背景（大白话）**：我们现在的判官看三件事——人对不对、机位对不对、跟上一镜接不接得上。
  它**不看动作对不对，也不看画面稳不稳**（掉帧、糊、多手指）。而 §4 里创作者骂得最多的恰恰有这两类。
- **核心取舍点**：加轴不是加代码，是**换一套判官行为**。三轴的档位锚点是 2026-08-20 用真额度校准过的
  （那次校准直接抓出了"眼部微距被误判"这个坑并催生了 0 哨兵）。**加轴 = 判分 prompt 变长 = 分档准确度要重新验一遍**，
  而在此之前我们没有任何标注数据能验（见拍板 2）。
- **推荐**：**先只加「动作」一轴，不加「稳定性」**。理由：① 动作是任务点名的四问之一，且首尾拼图是判它的
  天然输入（两端之差 = 动作演进），边际成本最低；② 稳定性里**一半是确定性可查的**（分辨率/画幅/时长/fps
  —— `asset.read` 的 `technical` 已经有 `width/height/fps/durationSeconds`，`assetRead.ts:78-90`），
  该由策略解析器兜，问 VLM 是浪费；剩下的"糊/多手指"建议等有了标注数据再加。

### 拍板 2：`SHOT_VERIFY_PASS_THRESHOLD = 3` 这条线，**要不要先花一次钱把它标定了**

- **背景**：`shotVerifyCore.ts:54` 那条"低于 3 档就算不合格"的线是**我们自己拍的**。
  §3.5 已经确认：整个开源生态**没有任何一个可抄的数字**——所有 benchmark 都只出分数不出裁决，
  因为它们是拿来离线比模型的，不是拿来在线卡片子的。
- **核心取舍点**：这条线定错了两边都要付账——**定高了**会误报红标 + 白烧重滚（2026-08-20 那次
  "眼部微距被判 1 档"就是活例）；**定低了**等于没判，用户还是得自己看。而现在**我们没有任何证据知道它偏哪边**。
- **推荐**：**先花一次小钱标定，别继续拍脑袋。** 做法：拿 30–50 个已有产物（`outputs/` 下现成的真实产出，
  以及用户手上的真实项目），人眼标"合格/不合格"，跑一次判官对齐，看 3 档这条线的准确率/召回率长什么样。
  按 §3.7 的价格，50 个镜头的判分成本 < ¥0.1，**真正的成本是人眼标那 50 条**（约 1 小时）。
  这也是"最终验收必须用真实用户 case"那条已拍板纪律的直接应用。

---

## 8. 诚实记分

**真跑了的**
- TikHub 四组关键词 × 四平台 = **240 条**实抓，四组全成功（无失败查询）。原始产物已随本 PR 入库。
- `origin/main@6a7c81786` 上**逐个 cat 过**审片环全链：`shotVerifyCore.ts`（295 行全读）、
  `shotVerifyOrchestrate.ts`（251 行全读）、`shotVerifyDeps.ts:100-200`、`core.ts:650-700`、
  `assetRead.ts` + `assetRead.test.ts`、`extractVideoFrame.ts`、`shotTimeline.ts`、`deconstructVideo.ts`、
  `textTaskRunner.ts:15-45`、`harness/tools/*Descriptors.ts`。文中所有 `file:line` 都出自这一遍实读。
- 人眼看过 `outputs/anchor-static-ab-20260902/anchor.png` 与 `shot3-A-imageOnly.png`（为 §5.7 探针 B 建立 ground truth）。
- 开源侧由子 agent clone 并 `cat` 核对了 VBench / VideoScore / T2V-CompBench / VisionReward / VideoAlign 的行号。

**只读没跑的**
- §2 的产品结论全部来自官方文档/帮助中心页，**没有一家是我们注册账号实测的**。巨日禄的
  30%→90% 是**厂商 PR 稿数字，无独立验证**——文中已逐处标注，别当设计前提。
- Toonflow 只读了 README，**没读源码**——它的"监督层"到底自不自动重跑，README 层面证据不足以下结论。

**没覆盖到的（明着标）**
- **§5.7 探针 B（≤¥3 真实判分）没跑成**。根因不是没额度，是**这台机器磁盘满了**：
  `/System/Volumes/Data` 100%（最初剩 593Mi），`pnpm build` 死在 `ENOSPC`，而探针要走主进程
  `safeStorage` 读 key 就必须有 `dist-electron`。清掉本次自己的半成品后回到 7.8Gi，
  **没有动别人的 worktree**（这台机器 188 个 worktree，并行会话在用）。
  探针脚本、两个对照的具体文件、以及判据都已写死在 §5.7，磁盘一腾出来即可跑。
- **探针 A（零额度，多图通道）也没跑**，同一根因（要起主进程）。**但它是本文最该先跑的一条**——
  §5.4 那处自相矛盾不钉死，审片环喂 1 张还是 4 张就定不下来。
- **即梦 / Dreamina（Seedance）没查成**——§2 表里那一行是空的。它是中文圈横评三巨头之一，
  该补一轮（火山方舟是一手出处，别用中转页，见 memory `model-limits-first-party-over-reseller`）。
- **ComfyUI 生态整段没查成**（自动重跑/质检节点、Impact-Pack 的 detection-based reroll、
  aesthetic score 节点、VLM 节点的阈值位置）——子 agent 的磁盘和预算同时到顶。
  这块缺得可惜：§4 里创作者最常用的正是 ComfyUI，**他们已有的质检节点就是最贴近的近邻（R6）**。
- **MJ-Video / LLaVA-Critic / AIGVE** 三个 VLM-judge 候选没 clone。
- Qwen 每帧 token 公式、`max_frames` 上限、是否支持 structured output —— 官方页 404，未说明。
- 帧数 → 判分准确率的公开曲线 —— 未查到（§3.8 已说明为什么不建议继续找）。

**本轮筛掉不进正文的**：一批"AI 变现/失业叙事"类高传播零技术信号的自媒体帖；
纯画质 SOTA 与 3D 建模类论文；以及若干把"一致性"当营销词但无任何机制描述的产品页。

---

## 附：本文引用的仓内 file:line 速查

| 主题 | 位置 |
|---|---|
| 审片环纯核（rubric / 0 哨兵 / 解析 / 偏差） | `electron/capabilityCore/shotVerifyCore.ts:31-52, 54, 65, 147-166, 164-201` |
| 审片环编排（K≤2 / deadline / 定向 directive） | `electron/capabilityCore/shotVerifyOrchestrate.ts:81-101, 122-146, 195-251` |
| 审片环真接线（判官候选排序 / 首尾拼图 / 计费性质） | `electron/capabilityCore/shotVerifyDeps.ts:104-200` |
| 两个注入点（外部 MCP / 本地 RPC） | `electron/capabilityCore/mcpStdioServer.ts:223` · `electron/capabilityCore/rpcServer.ts:378` |
| core 里的 hook（含"对着实发提示词判"那条坑） | `electron/capabilityCore/core.ts:657-700` |
| 渲染层孪生 + 等价性测试 | `src/workbench/generationCanvas/agent/shotVerify.ts` · `shotVerify.equivalence.test.ts` |
| production run 的 qa 阶段 | `electron/productionRun/productionQaVerdict.ts:1-150` |
| **「不给 Agent 看画面」那堵墙** | `electron/shared/agentCapabilities/assetRead.ts:119,142` + `assetRead.test.ts:59-67` |
| Agent 工具面（33 个，无一能看画面） | `electron/harness/tools/*Descriptors.ts` |
| 3 帧首中尾 + 8% 内缩（含实测理由） | `electron/video/shotTimeline.ts:112-130` |
| 首尾拼图（含"只取第一张"那条注释） | `electron/video/extractVideoFrame.ts:165-189` |
| 多图通道（与上一条打架的那处） | `electron/textTaskRunner.ts:26-30` · `electron/video/deconstructVideo.ts:249` |
| 现成的 VLM→JSON 编排（拆解） | `electron/video/deconstructVideo.ts:86-130, 228-300` |
| 现成的判分 smoke（探针 B 的底子） | `evals/verify-shot-smoke.mjs:1-98` |
| 生成能力契约（`outputSchema: z.unknown()`） | `electron/shared/agentCapabilities/generation.ts:5, 42, 58, 98` |
