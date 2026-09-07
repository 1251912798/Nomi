# 剪辑决定表调研 · 补充笔记：对话式 / AI 剪辑产品各自把"决定"做成了什么（2026-09-07）

> 状态：📎 交接/日志 —— **只调研不改码；本篇是给在途分支 `docs/edit-decision-table-research-20260907` 的补充材料，不动那条分支的任何文件。**
> 日期：2026-09-07 · 基线：`origin/main@6a7c81786`
> 要回答的一个问题：**ChatCut、Eddie AI、Kapwing、Riverside、Wondercraft 这几家「对话式/AI 剪辑」，各自怎么让 AI 做剪辑决定？决定以什么形式呈现给用户？用户能改什么？**
> 读法提示（D6）：这五家看起来在做五件事，其实只有**两种**决定物——**文本**（转录/脚本）和**时间线**（NLE 里的序列）。真正的分歧只在一个地方：**AI 的决定是直接落时间线，还是先落成一份人能读能改的文本，再由文本生成时间线。**

---

## 1. 结论先行

1. **ChatCut 是这五家里做得最彻底的一家：它把剪辑决定做成了一个 markdown 文件 `timeline.md`。** 流程写死为 `read_script` → **编辑 `timeline.md`** → `apply_script`。AI 不直接操作时间线，它编辑一份文本；应用之后时间线**重新物化**，脚本也重新生成。（本机一手：`~/.claude/skills/chatcut-talking-head-guide/SKILL.md:244-261`）
2. **它把"机械清理"和"语义判断"做成两把不同的刀，而且明令不许混用。** `clean_script` 只干固定口癖（`um/uh/er/ah/呃/额`）与批量停顿压缩；一切依赖语境的东西（重复片、失败 take、上下文相关的语气词）只能走 Script。原话：「Do not use it for context-dependent fillers, retakes, repeated sentences, or semantic decisions.」
3. **它有一条对我们最有借鉴价值的界面纪律：对用户永远说内容，绝不说索引。** 原话：「**Explain content, never indices.** You MUST NOT explain edits to the user with internal addresses such as `[sN]`, `[cN]`, `[gap]`, word indices, clip ids, or segment ids.」——内部有稳定地址（`[sN]` 是 ASR 段、`[cN]` 是片段、`[gap]` 是无源、`[silence=…]` 是保留静音），但那是**给机器用的**，给人看的一律是原话引用或大白话。
4. **Eddie AI 走的是另一端：AI 直接出一条时间线，用户回自己的 NLE 里改。** LLM 定 story framework → 逐 beat 组装 → 自动铺 B-roll → 导 XML 回 Premiere/Resolve/FCP（引用原素材、不复制）。它的产品叙事是「first draft in minutes instead of hours」，人是最终决定者。
5. **Riverside / Wondercraft 是"文本即时间线"的轻量版**：Riverside 删转录文字 = 删画面；Wondercraft 的决定物是脚本，导入后拆成 voices / text / music 三个可独立编辑的组件。**Kapwing 本轮没查成**（官方页无实质内容）。
6. **对 Nomi 剪辑决定表的意义**：我们的分镜表是**生成前**的决定表（还没有素材），ChatCut 的 `timeline.md` 是**素材已有**时的决定表。**它们是同一根轴的两端，可以共用同一条纪律**——决定物是人能读能改的文本；机械与语义两把刀分开；对用户说内容不说索引。

---

## 2. 逐家：AI 怎么做决定 / 决定长什么样 / 用户改什么

### 2.1 ChatCut（一手来源最全的一家）

**来源**：ChatCut Agent Plugin 的技能包，本机实读（`~/.claude/skills/chatcut-talking-head-guide/SKILL.md`、`~/.claude/skills/chatcut-transcription/SKILL.md`）。这不是营销页，是**产品发给 agent 的作业指导书**——它写的是这个产品真正的机制。

| 维度 | 事实 | 出处 |
|---|---|---|
| **决定物** | 一份 markdown：`timeline.md` | `talking-head-guide/SKILL.md:261`「All spoken-content selection, placement, and reuse happens in Script (`read_script` → edit `timeline.md` → `apply_script`)」 |
| **地址体系** | `[sN]` = ASR 段（**不是**语义单元）；`[cN]` = 片段；`[gap]` = 无源在播（主视频轨上渲染成**黑帧**）；`[silence=…]` = 保留/恢复源静音 | `:252`、`:230-232` |
| **两把刀** | `clean_script`（机械：固定口癖 + 批量停顿）vs Script（语义：选 take、删假开头、重排、复用） | `:257-259` |
| **顺序纪律** | 先 `clean_script`，**然后必须重读刷新后的 `timeline.md`**（clean 会改变正典时间线并重新物化脚本，旧文本已失效，"Do not edit from memory based on the pre-clean script"） | `:246` |
| **应用后必须复核** | `apply_script` 之后读回重新生成的 `timeline.md`，检查「观众实际会听到什么」：逻辑断、缺上下文、删过头、漏清理、顺序错、停顿太紧或太长 | `:248` |
| **失败路径** | apply 失败就修 markdown 语法错误或 stale 状态，重读再 apply | `:247` |
| **对用户的语言纪律** | 只说内容不说索引；面板叫「Transcript panel / 文字稿面板」，**禁止**用方位词（左/右）指它，因为布局可重排 | `:87`、`:88` |
| **编辑原则（AI 的判断准绳）** | 「按完整语义单元编辑」；「任务指明保留什么时，就精确修到那个边界」；「不要跨 take 拼接未完成的碎片」；「保住连接组织（列表标号、转折词、主语、动词）」；「边界不确定时保守，宁可少剪」 | `:78-86` |
| **长任务形状（顺带）** | `track_progress{action:"wait", target:"transcription", assetIds}`；判"卡住"的公式 `max(5min, min(60min, 2×素材时长))` | `transcription/SKILL.md`（另见长任务那篇 §2.2） |

**一句话读法**：ChatCut 把「AI 做剪辑决定」降维成了**「AI 编辑一份文档」**。这样做换来三件事：决定可读、决定可 diff、决定可被人接手改。代价是所有决定必须能被文本表达——所以它才需要 `[gap]`/`[silence=…]` 这些**为文本发明的原语**，并且要专门警告「别在主视频轨上造出 `[gap]`，那会渲染成黑帧」。

### 2.2 Eddie AI

| 维度 | 事实 | 出处 |
|---|---|---|
| **决定怎么做** | 导入素材 → 转写 → **LLM 定 story framework**（或用户给一个）→ 把 soundbite 编织进这个框架 → 逐 beat 组装 → 自动登记并铺 B-roll 到 A-roll 主干上（**只用真实素材，不生成**） | <https://www.heyeddie.ai/features/roughcuts>、<https://www.redsharknews.com/eddie-ai-nab-2026-ai-video-editing-rough-cut> |
| **决定长什么样** | 一条**可编辑的 rough cut**；用户用自然语言指挥改（"多用一点这个受访者"、调节奏） | 同上 |
| **用户改什么** | 导出 XML/序列回 Premiere / DaVinci Resolve / Final Cut，**引用原多机位素材而非复制**，在 NLE 里做调色、音乐、精修 | <https://www.heyeddie.ai/workflows/adobe-premiere-pro> |
| **产品立场** | "get you a first draft in minutes instead of hours…Then you, the actual creative person, show up and do what you're good at"（用户证言，官方页引用） | <https://www.heyeddie.ai/features/roughcuts> |

**没查成**：官方页**没有**明说决定是以转录（paper edit）还是时间线呈现给用户；XML 导出的具体形状（FCPXML / AAF / 各家 preset）官方页无技术细节。

### 2.3 Riverside

| 维度 | 事实 | 出处 |
|---|---|---|
| **决定物** | AI 生成的**转录文本本身**：删文字 = 删对应的音视频 | <https://riverside.com/tools/ai-video-editor> |
| **AI 主动的那部分** | Magic Clips：自动识别录制里的关键时刻，切成短片 | <https://riverside.com/magic-clips> · <https://riverside.com/video-editor/video-editing-glossary/magic-clips> |
| **用户改什么** | 在文本编辑器里找到并高亮一句话，一键变成一条 clip | 同上 |

**注意**：本节内容来自搜索结果对官方页的引述，**官方页未逐页直读**——标为**部分二手**。

### 2.4 Wondercraft

| 维度 | 事实 | 出处 |
|---|---|---|
| **决定物** | **脚本**。生成最终音频**之前**可以直接改写脚本（澄清观点、补信息、调语气） | <https://www.wondercraft.ai/podcast> |
| **导入后的结构** | 内容被「intelligently separated into editable components」：voices / text / music 三层可独立编辑 | <https://www.wondercraft.ai/tools/notebooklm-podcast-editor> |

**同样标为部分二手**（来自搜索结果引述，未逐页直读官方页）。

### 2.5 Kapwing

**没查成。** `https://www.kapwing.com/tools/ai-video-editor` 返回的页面只有标题、无实质内容。本篇对 Kapwing **不下任何结论**——不是「查了没有」，是「没查到」。

---

## 3. 横向：两种决定物，一条真正的分歧

| | 文本派（ChatCut · Riverside · Wondercraft） | 时间线派（Eddie AI） |
|---|---|---|
| AI 输出的东西 | 一份人能读的文本（脚本 / 转录 / `timeline.md`） | 一条 rough cut 序列 |
| 时间线怎么来 | 由文本**物化**出来（`apply_script`） | AI 直接排 |
| 用户在哪改 | 在文本里改，然后重新应用 | 在自己的 NLE 里改（XML 回程） |
| 好处 | 决定可读、可 diff、可被接手；错了能看出**为什么**错 | 直接可播，专业工具接得上 |
| 代价 | 所有决定必须能被文本表达（于是要发明 `[gap]` / `[silence=…]` 这类原语） | 决定不透明——你只能看结果，看不到理由 |

**真正的分歧不是"用不用 AI"，是"AI 的决定要不要先变成一份人能读的东西"。** 五家里有四家选了"要"。

---

## 4. 对 Nomi 剪辑决定表的三条建议（给在途那条分支）

| # | 建议 | 依据 |
|---|---|---|
| **E1** | **决定表就是决定物本身，不是决定的可视化。** 用户改表 = 改决定；应用之后表**重新生成**（不是保留用户的旧文本） | ChatCut `:246`「clean_script 改变正典时间线并重新物化脚本，之前读到的文本可能已经过期」——这条防的是「用户看着旧表改，改出一个不存在的决定」 |
| **E2** | **机械操作与语义判断分成两条路，且在产品语言里也分开。** 「去口癖/压停顿/统一时长」是一把刀；「选哪条 take / 删哪段 / 怎么排」是另一把 | ChatCut `:257-259`。混成一个"智能剪辑"按钮的后果是：用户不知道这次它会不会动他在意的东西 |
| **E3** | **内部地址稳定，对外一律说内容。** 表里可以有 `[sN]`/镜号/节点 id，但任何给用户的解释都用原话引用或大白话 | ChatCut `:87`（MUST NOT 级别的纪律）。我们的分镜表已经有镜号与节点 id 两套地址（见 `docs/lessons/shot-table-is-a-projection-of-canvas-nodes.md`），这条直接适用 |

**一条边界提醒**：ChatCut 解决的是「素材已有、决定留哪段」；Nomi 的分镜表解决的是「素材还没有、决定生成什么」。**E1–E3 是纪律可抄，机制不可直搬**——比如 `[gap]` 那类原语在我们这边没有对应物（我们没有"无源在播"这个状态）。

---

## 5. 自媒体来源（TikHub）

本篇的 TikHub 面与上网那篇共用一组抓取（创作者拿到一条链接之后真正在做的事，就是"拆解 + 重新组装"，与"剪辑决定"是同一个动作的两端）：

```bash
source ~/.zshenv
node scripts/research/tikhub-search.mjs --q "AI视频 找参考 爆款拆解" \
  --platform all --limit 8 --out docs/research/2026-09-07-agent-web-memory-longtask/tikhub/AI视频_找参考_爆款拆解/
```

产物附件：`docs/research/2026-09-07-agent-web-memory-longtask/tikhub/AI视频_找参考_爆款拆解/tikhub-search.{json,md}`（32 条）

| 平台 | 出处 URL | 摘要（原文，未改写） |
|---|---|---|
| 抖音 | <https://www.douyin.com/video/7646721488590450299> | 「想用豆包反推出爆款视频的**所有分镜**，一条指令就能搞定！」 |
| 抖音 | <https://www.douyin.com/video/7669435129030364442> | 「别再只会说"帮我生成同款"了！ 这句"反推指令"直接扒光它的底层逻辑，无门槛复刻**镜头语言**！」 |
| 小红书 | <https://www.xiaohongshu.com/explore/6a9c1c20000000002802dfaa> | 「3分钟带你拆解一条20w浏览的爆款视频」 |
| B站 | <https://www.bilibili.com/video/BV1zoT16jEiU> | 「全自动拆解爆款视频的Skill (我做的)」 |

**读到的真实摩擦**：他们要的"决定"从来不是一条时间线，而是**一份能读、能改、能拿去重投的分镜/提示词清单**。这与 §3 的"文本派占四比一"在两个完全不同的信息面上得出同一个结论——这是本篇最值得带走的一条。

---

## 6. 诚实记分

- **真读了的**：ChatCut Agent Plugin 技能包（本机 `~/.claude/skills/chatcut-*`，逐行）；Eddie AI 官方 features/roughcuts 页；TikHub 一组 ×4 平台（附件在仓）。
- **部分二手（明着标）**：Riverside、Wondercraft —— 来自搜索结果对官方页的引述，未逐页直读。
- **没查成（明着标）**：**Kapwing**（官方页无实质内容，本篇不下结论）；Eddie AI 的**决定呈现形态**（转录 vs 时间线）与 XML 具体格式，官方页未写。
- **本篇没做的**：没有碰在途分支 `docs/edit-decision-table-research-20260907` 的任何文件；没有花任何付费额度。
