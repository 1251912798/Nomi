# 让 Agent 懂「什么时候该用哪个模式」：模型档案怎么变成模型能读的知识（调研）

> 状态：📎 长期参考 —— **只调研 + 出方案，一行产品代码未动**。服务于 GSR §5 登记的 P4 那一刀。

日期：2026-09-07 · 基线：`origin/main@6a7c81786`
性质：只调研 + 出方案，不改生产码
服务对象：`docs/plan/2026-09-07-generation-strategy-resolver.md` §5 登记的 **P4 模式选择建议**（那一刀被明确挡在「先出判据方案再写码」后面）

> **用户的猜想**：「把模型档案和模式描述给模型就可以」。
> **本次实核后的回答**：这件事 **Nomi 今天已经在做了**，而且做了整整 3 078 token/轮。
> 它没起作用的原因不是「没给」，是**编译器丢掉了两类唯一有用的信息**——数值区间（104 个模式里 67 个的时长区间
> 在提示词里是空的）和选择判据（「文生会让脸乱变」一个字都没写）。
> 所以下一刀不是「把档案给模型」，是**修这台已经在跑的编译器 + 给它补一层判据**。详见 §0 与 §4。

---

## 0. 要回答的问题 + 一条必须先纠正的事实

### 0.1 问题（先写死，防跑题）

1. 顶尖 Agent 产品怎么给模型「环境知识」？常驻 vs 按需的边界画在哪、token 怎么控？
2. 顶尖视频产品怎么替用户选模式？有没有「保角色一致」的自动策略？
3. 开源里有没有把「能力档案编译成模型可读手册/路由规则」的实现？
4. 三种形式（按需资源手册 / 常驻系统提示词 / 只靠引擎报错教）怎么选？
5. 模式选择的判据长什么样、依赖哪些真相源、下一刀的输入输出契约草案？
6. 真做的人（自媒体）怎么选模式、踩什么坑？
7. 六角色短评、要拍板的、零额度最小探针。

### 0.2 必须先纠正的事实：这台编译器已经在跑了

`src/workbench/generationCanvas/agent/availableModels.ts:195-222` 的
`formatAvailableModelsForPrompt` 就是「模型档案 → 模型可读手册」的编译器，
在 `generationCanvasAgentClient.ts:181` 每轮重建、经
`buildGenerationCanvasUserMessage`（`:136-144`）注进**用户消息**里。
分镜规划师走同一条客户端（`runStoryboardPlanner.ts:52` 不传 `buildPrompt`），
所以**规划师也拿得到这份手册**。
（顺带一条小谎：`availableModels.ts:194` 的 JSDoc 写「注入 agent **系统提示词**」，
但调用方把它拼进了**用户消息**——注释与行为不一致，改 C1/C2 时顺手改掉。）

它今天真实产出的一行长这样（实跑渲染，见 §附录 A 的复跑脚本）：

```
- modelKey=seedance-2（Seedance 2.0，video）模式: t2v(文生视频)[纯文生,不接参考边] /
  first(首帧)[参考槽:首帧] / firstlast(首尾帧)[参考槽:首帧/尾帧] /
  omni(全能参考)[参考槽:角色参考×9/参考视频×3/参考音频×3]；
  参数: resolution[480p,720p,1080p,4k] aspect_ratio[1:1,4:3,3:4,16:9,9:16,21:9,adaptive]
  duration generate_audio
```

**三条从这一行里直接读出来的缺陷**（都不是推测，是代码行为）：

| # | 缺陷 | 代码根据 | 后果 |
|---|---|---|---|
| **C1** | **64% 的模式，时长区间对模型不可见**。渲染逻辑是 `opts ? \`${p.key}[${opts}]\` : p.key`（`availableModels.ts:210-211`）：`options` 非空才渲染数值。实测 104 个模式里 **67 个的 `duration` 是 `min/max` 型**（`seedance-2` 全模式 `4-15`、`seedance-2.5` 全模式 `4-30`），只有 32 个是枚举型、5 个无 duration → 那 67 个**只渲染出一个裸的 `duration` 词，没有任何数字** | `availableModels.ts:207-213` + `types.ts:17-29`（`ModelParameterControl` 的 `min/max` 与 `options` 是两个独立字段）；计数见 §附录 A 的 `c1.mts` | 「这镜要 40 秒，超了得拆」这个判断，模型在**六成模式上手里没有做它所需的数字**。GSR 方案里最强调的那句「上限是模型 × 模式 × 分辨率的函数」，在提示词层被抹平成零信息 |
| **C2** | **参数只取第一个模式的**：`entry.modes[0]?.params`（`availableModels.ts:208`）。实测 **38 个档案里 17 个（45%）的参数随模式变** | 同上 | 手册在这 17 个档案上**说的是假话**。最干净的例子：`minimax-h3` 的 `t2v` 有 `[resolution, aspect_ratio, duration]`，而 **`i2v` 只有 `[duration]`** —— 手册取 `t2v` 那份，于是告诉模型「i2v 也能调分辨率和画幅」。这与 §5 判据直接冲突：判据要按「模式 × 分辨率」查上限，手册却只给了默认模式那一份 |
| **C3** | **手册里有「能不能连」，没有「该不该选」**。末尾两条规则（`availableModels.ts:219-220`）通篇讲的是「连参考边只连目标模型支持的」「配错的边会被跳过」——全是**校验语言**。用户那句「直接文生视频，人脸和服装会乱变」对应的**选择判据，一个字都没有** | `availableModels.ts:219-220` 全文 | 模型知道 `t2v` 是「纯文生,不接参考边」，但不知道**为什么在有跨镜角色时不该选它**。这正是 GSR §5 P4 那条 ❌ 的机制原因 |

**还有一条实测事实，会直接否掉本文 §4 的 B 档**：
`generationCanvasAgentClient.ts:134-135` 的注释写着——

> 模型清单必须贴着请求(实测挪进 system 前部后 modelKey 服从性掉穿,smoke 0/5)

这是本仓自己量过的：**把这份手册搬进系统提示词，服从率从可用掉到 0/5**。
任何「塞进系统提示词常驻」的方案在 Nomi 上已经有阴性结论了，不能重来一遍。

### 0.3 结论先行

1. **不是「给不给」的问题，是「给的是什么」的问题**（§0.2 C1–C3）。修 C1/C2 是两行代码级的修正，
   而且**它俩本身就是 §5 判据的前置**——判据要读的数字今天根本没进提示词。
2. **顶尖产品的常驻层高度一致：常驻只放「够做出『要不要读』这个决策的索引」，不放内容本身**
   （Anthropic Skills 的 ~100 token metadata、Cursor 的 description、tool search 的可搜索字段；§1）。
3. **开源里这个形状有现成范式**：`Root-IO-Labs/open-agent-teams` 把结构化 `ModelProfile` 表编译成
   markdown 表格 + **人写的选择指南**注进 supervisor 提示词，并且**只对没测过的能力闭嘴**（§3）。
   两层分离（数据来自档案 / 判据是人写的散文）不是我们发明的，是别人已经跑通的。
4. **推荐 A′ 档**（§4）：**修好的紧凑手册常驻在用户消息里（它今天已经在那儿了）+ 判据作为一份
   自动生成的、按 description 触发的技能资源按需注入**。不是纯 A 也不是纯 B——因为 §0.2 那条
   阴性实测把「全搬进系统提示词」这条路封死了。
5. **判据的三个真相源全部已经存在，一个都不用发明**（§5）：跨镜锚点复现 = `PlanShot.anchorIds` ×
   `PlanAnchor.kind/carrier`；定妆图产物 = 视觉锚落画布后的图片节点产物；模式槽位可达性 =
   `electron/catalog/referenceReachability.ts:62` 的 `modeSlotReach`（UI 收窄与生成第三闸**共用的
   唯一尺子**）。GSR §5 P4 担心的「猜一处就会建议一个根本没有 image_ref 槽的模式」——那把尺子已经在。
6. **「多镜同角色 → 自动建议参考图」全行业没有先例**（§2.0 结论 3：Runway / Kling / Higgsfield / LTX /
   Freepik 全部是「角色对象化 + 用户手动 `@`」）。**这是机会也是警告**：可以做，但要抄 Seedance 那个
   「`auto` 推断 + 可显式覆盖 + 冲突报错」三件套（§2.1），不能做成静默切模式——因为参考模式换一致性
   要付**提示词遵循度下降**的代价（MiniMax 官方承认，§2.6）。

---

## 1. 顶尖 Agent 产品怎么给模型「环境知识」

> 全部于 2026-09-07 查阅。pi 那节是本机 `node_modules` 实读，给 file:line。

### 1.1 Claude Code：CLAUDE.md 常驻 + Skills 三级渐进式披露

**CLAUDE.md**（<https://code.claude.com/docs/en/memory>）：managed policy / user / project / local 四层，
**叠加不覆盖**——"All discovered files are concatenated into context rather than overriding each other."
祖先目录的在启动时全部加载；子目录的是按需——"they are included when Claude reads files in those subdirectories."
`@import` 最多四跳，但**不省 context**（被 import 的文件在启动时就展开）。
硬数字：单文件 "target under 200 lines per CLAUDE.md file"，>4 MiB 直接跳过。
一条容易被忽略的事实：CLAUDE.md 是 **user message**（"delivered as a user message after the system prompt"），
不在 system prompt 里——**这与 Nomi 今天把模型清单放在用户消息里的做法是同构的**（§0.2）。

**Agent Skills 三级**（<https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview>）——
官方给的量化表，是本文 §4 成本估算的锚：

| Level | 何时加载 | Token 成本 |
|---|---|---|
| L1 Metadata（`name`+`description`） | 永远（启动时进 system prompt） | **~100 tokens / skill** |
| L2 Instructions（SKILL.md 正文） | 技能被触发时 | **< 5k tokens** |
| L3+ Resources（`references/`、`scripts/`） | 按需 | **未访问就是 0** |

触发机制就是 description 的语义匹配："The description is what Claude matches your request against"。
L3 的关键属性："There's no context penalty for bundled content that isn't used."

**体积纪律**（<https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>）：
`name` ≤64 字符（小写+连字符）；`description` ≤1024 字符、**必须第三人称**（因为要进 system prompt）；
正文 "Keep SKILL.md body under 500 lines for optimal performance"；引用 "Keep references one level deep from SKILL.md"；
>100 行的 reference 要带目录。一句该背下来的定位："The context window is a public good."

**tool description 作为知识载体**（<https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools>）：
"This is by far the most important factor in tool performance."；长度 "Aim for at least 3–4 sentences for each tool description"。

**规模化的按需通路**（<https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool>）：
典型多 MCP server 组合光工具定义 ~55k tokens，tool search "typically reduces this by over 85 percent"；
准确率拐点 "degrades once you exceed 30–50 available tools"；启用门槛 ≥10 工具或 >10k tokens。
缓存友好：deferred 工具不进 system prompt prefix，发现后以 `tool_reference` 块内联追加。

### 1.2 Codex / AGENTS.md：全常驻，靠一个字节上限兜底

<https://agents.md>：仓库根一个，monorepo 每包一个；"Agents automatically read the nearest file in the
directory tree, so the closest one takes precedence."；"explicit user chat prompts override everything"。
**标准本身没有任何长度/体积建议**——这是它最薄的地方。

Codex 的实际实现（<https://learn.chatgpt.com/docs/agent-configuration/agents-md>）比标准精确：
先 `~/.codex` 的 `AGENTS.override.md`/`AGENTS.md`，再从项目根**逐级拼到 cwd**；
"Codex concatenates files from the root down, joining them with blank lines."——近的赢是因为排在后面，不是取代。
加载时机 "Codex builds an instruction chain when it starts (once per run"，每 session 一次。
**唯一给出机器级体积上限的一家**：`project_doc_max_bytes` 默认 **32 KiB**，到顶就停止追加后续文件
（含义：膨胀的根 AGENTS.md 会**静默吃掉**子目录规则的预算）。

### 1.3 pi（`@earendil-works/pi-coding-agent` 0.85.1，本机实读）

**技能索引 = 索引常驻 + 正文按需**：`dist/core/skills.js:275-298` 的 `formatSkillsForPrompt`
只把 `name` / `description` / `location` 三项包进 `<available_skills>`，并写死一句
`"Use the read tool to load a skill's file when the task matches its description."`（`:283`）。
正文永远不预载。规范约束在同文件：`MAX_NAME_LENGTH = 64`（`:9`）、`MAX_DESCRIPTION_LENGTH = 1024`（`:11`），
校验在 `:63-64` / `:85-86`（对齐 <https://agentskills.io>，与 §1.1 Anthropic 的两个数字**逐字相同**）。
`disable-model-invocation: true` 的技能被排除出索引（解析于 `:262`，过滤于 `:276`），只能 `/skill:name` 显式调。

**描述三通道**：① `description` 进工具 schema（每次请求都花 token）；② `promptSnippet` 进系统提示词的
`Available tools:` 菜单；③ `promptGuidelines` 进 `Guidelines:` 块、**去重且按实际工具集条件化**
（`dist/core/system-prompt.js:44-79`：只有 bash 在而 grep/find/ls 都不在时才加那条）。
详见 `docs/research/2026-09-07-pi-reference-implementation-conformance.md` §1.1 / §4.7（G-03）。

**⚠️ 对本方案有决定性影响的一条**：`dist/core/system-prompt.js:16-34` —— 走 `customPrompt` 分支时
（Nomi 就是这条），pi **仍然**会追加 `<project_context>`、**`<available_skills>`（`:31` 调
`formatSkillsForPrompt`）**、`Current working directory:` 然后 `return`；
被丢掉的是只在默认分支才拼的 `Available tools:`（`:83`）与 `Guidelines:`（`:88`）两段。
**含义：技能索引形态的注入在自定义提示词下活得下来，`promptSnippet`/`promptGuidelines` 活不下来。**
这是选 A′ 而不是「把判据写进 promptGuidelines」的机制原因。

Nomi 侧已自建同形索引：`electron/harness/skillIndex.ts:35-45` 的 `formatNomiSkillIndex`
（`DEFAULT_SKILL_INDEX_LIMIT = 24`、`SKILL_DESCRIPTION_LIMIT = 180`）+ `load_skill` 工具按需读正文。
`docs/plan/2026-09-07-agent-rebuild-stage3-5-deep-plan.md` §3.4 已拍板「留索引式 ①、删整段式 ②」。

### 1.4 Cursor Rules：把三种触发做成一张真值表

<https://cursor.com/docs/context/rules>。现行文档的四种类型（**注意官方已改名**，旧名
Always/Auto Attached/Agent Requested/Manual 已从文档移除）：

| Rule Type | Description（逐字） |
|---|---|
| `Always Apply` | Apply to every chat session |
| `Apply Intelligently` | When Agent decides it's relevant based on description |
| `Apply to Specific Files` | When file matches a specified pattern |
| `Apply Manually` | When @-mentioned in chat |

frontmatter 三字段的真值表（**最值得抄的形态**）：

| `alwaysApply` | `description` | `globs` | 行为 |
|---|---|---|---|
| `true` | — | — | 永远包含，globs/description 被忽略 |
| `false` | — | 有 | 匹配文件进 context 时自动附加 |
| `false` | 有 | 无 | Agent 读 description 自己判断相关时拉进来 |
| `false` | 无 | 无 | 仅 `@`-mention |

长度建议 "under 500 lines"，并要求 "Split large rules into multiple, composable rules."
——**与 Anthropic 的 500 行完全一致**。反模式点名：禁止 "Copying entire style guides"，
应当指向 canonical example 而不是拷贝。增长纪律："Add rules only when you notice Agent making the same mistake repeatedly."

### 1.5 Manus：约束是 KV-cache，不是行数

<https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus>。

- 文件系统当外部记忆："we treat the file system as the ultimate context in Manus: unlimited in size, persistent by nature"；
  "using the file system not just as storage, but as structured, externalized memory."
- KV-cache 前缀稳定："the KV-cache hit rate is the single most important metric for a production-stage AI agent."；
  "even a single-token difference can invalidate the cache from that token onward."；点名批评时间戳。
  成本差 10 倍（缓存 0.30 vs 未缓存 3 USD/MTok）。
- 不动态增删工具，改用 logits mask："Rather than removing tools, it masks the token logits during decoding"，
  理由是 "any change will invalidate the KV-cache for all subsequent actions and observations."

> **对我们的直接含义**：模型手册**每轮重建**（`generationCanvasAgentClient.ts:181` 就是每轮 `await`）
> 在 Manus 的框架下是可疑的——只要目录变一个字节，从那个 token 起缓存全失效。
> 但它今天在**用户消息**里（不在 system prefix 里），且用户消息本身每轮都在变，
> 所以影响面比 Manus 说的小。**真要搬进 system prompt 才会触发这条，而 §0.2 的阴性实测已经把那条路封了。**

### 1.6 横切对比

| | 常驻层 | 按需层 | 触发机制 | 体积纪律 | 出处 |
|---|---|---|---|---|---|
| Claude Code CLAUDE.md | 祖先目录全部 CLAUDE.md（作为 **user message**） | 子目录 CLAUDE.md、带 `paths:` 的 rules | glob / 读到该目录的文件 | **<200 行/文件**；>4 MiB 跳过 | [memory](https://code.claude.com/docs/en/memory) |
| Agent Skills | 全部技能的 name+description，**~100 tok/技能** | SKILL.md 正文（<5k tok）、references/ | **description 语义匹配** | name ≤64、desc ≤1024、正文 <500 行、引用一层深 | [overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) |
| Tool description | 非 deferred 工具的完整定义 | `defer_loading` 的工具 | regex/BM25 搜索 | ≥3–4 句；≥10 工具就该 defer；可省 >85% | [define-tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) |
| Codex AGENTS.md | 逐级拼接的全部内容，每 session 一次 | **无** | — | **32 KiB 硬上限**（到顶截断后续） | [agents.md](https://agents.md) |
| Cursor Rules | `alwaysApply:true` + User Rules + AGENTS.md | globs / description / @-mention 三种并存 | 一张 frontmatter 真值表统一调度 | **<500 行**，拆成可组合小规则 | [rules](https://cursor.com/docs/context/rules) |
| pi 0.85.1 | `<available_skills>` 索引（name/desc/location） | SKILL.md 正文经 `read` 工具 | description 语义匹配 | name ≤64、desc ≤1024 | `dist/core/skills.js:275-298` |
| Manus | 稳定 system prefix + **全量**工具定义 | 文件系统上的一切 | 模型自己读写；工具用 logits mask 约束 | 无行数建议，约束是 KV-cache | [blog](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) |

**三条横切结论**：

- **A. 常驻的是「索引」，不是「内容」。** ~100 token 的 metadata、Cursor 的 description、
  tool search 的可搜索字段，都是同一个东西：**一个足以做出「要不要读」这个决策的最小摘要**。
  CLAUDE.md / AGENTS.md 是唯一例外（把内容本身常驻了），代价就是必须靠 200 行 / 32 KiB 这种硬上限兜底。
- **B. 触发机制只有四种，可叠加**：① description 语义匹配 ② glob 路径匹配 ③ 显式引用 ④ 模型主动读文件。
  Cursor 是唯一把前三种做成一张真值表由同一份 frontmatter 调度的，形态最值得抄。
- **C. 「结构化数据编译成模型可读手册」是官方推荐做法，不是我们的发明。**
  Anthropic 的 BigQuery skill 就是范式：`reference/finance.md` 等按域切分 schema，SKILL.md 只做导航，
  甚至在正文里教模型用 `grep -i "revenue" reference/finance.md` 去查；官方原话
  "Bundle comprehensive resources: Include complete API docs, extensive examples, large datasets"，
  理由是不读就零成本。更纯粹的先例是 **llms.txt**（<https://llmstxt.org>）："Web pages are built for people."
  ——它的动机和我们的问题完全同构。

---

## 2. 顶尖视频产品怎么替用户选模式

> 全部一手官方页面（文档 / 帮助中心 / 产品 UI 实测），2026-09-07 查阅。二手与未核实的单独标注。

### 2.0 三句话结论

1. **「模式」这个概念正在消失，取而代之的是「素材角色」。** Seedance 2.5 与 Kling 3.0 **各自独立**
   收敛到同一形状：请求体是带 `role`/`type` 的 `contents[]` 数组
   （`first_frame` / `last_frame` / `reference_image` / `element`），**任务类型由「填了哪些角色 + 提示词意图」推出来**，
   而不是由用户选的 endpoint 决定。
2. **全行业只有一家在 API 层做「模型自己判断任务类型」**——字节 Seedance 2.5。其余都是「用户显式选，产品给决策表」。
3. **没有任何一家做「检测到多镜同一角色 → 自动建议参考图模式」。** 所有人的答案都是同一个：
   **把「角色」做成一等公民的持久对象**（Soul ID / Element / Custom Character / Cameo），**然后由用户 `@` 它**。
   绑定动作始终是人做的。→ **Nomi 的 P4 是市面上没有的一步**（§2.6 有它的两条真实边界）。

### 2.1 即梦 / Seedance（字节）—— 唯一的真·自动判定

**谁决定：模型自己判**。火山方舟 Seedance 2.5 教程原话
（<https://docs.volcengine.com/docs/82379/2607688>，2026-09-07）：

> 「Seedance 2.5 会根据输入素材和提示词意图判断任务类型。」

官方给出的触发条件表——**这是本轮调研最值钱的一张表，因为它就是 §5 判据表的外部对照**：

| 任务类型 | 触发条件 | 特殊限制 |
|---|---|---|
| 文生视频 | 仅传文本提示词 | 无 |
| 首帧 / 首尾帧生视频 | `content.role` = `first_frame` / `last_frame` | `ratio` 必须 `adaptive`，跟随首帧宽高比 |
| 参考生视频 | 至少一个 `role` = `reference_image` / `reference_video` / `reference_audio` | 无 |
| 视频编辑 | 含 `reference_video` **且提示词表达编辑意图** | `ratio=adaptive`、`duration=-1` |
| 视频延长 | 含 `reference_video` **且提示词表达延长意图** | `ratio=adaptive` |

**三条设计（对 Nomi 直接可抄）**：

- **素材角色显式、子任务类型推断**：图片必须标 `role`；「编辑还是延长」靠提示词关键词判。
- **有逃生口**：`omni_reference_task_type` ∈ `auto`（默认）/ `reference` / `edit` / `extend`。
- **推断与声明冲突就报错**：`InvalidParameter.TaskTypeMismatch`。
  **自动判定不是黑箱吞掉，是当契约违约抛出来。**

素材上限 50（30 图 + 10 视频 + 10 音频），提示词用 `@图像1`/`@视频1`/`@音频1` 指代，
文档要求「明确素材职责」——说清每份素材提供什么**以及不采用什么**（← 与 §6.2 第 3 条创作者手写的
「彻底忽略……」、与我们的 `PlanReferenceBinding.ignore` 三方同形）。

**消费端 UI 实测**（jimeng.jianying.com，2026-09-07）：首页创作类型下拉里 **「Agent 模式」是默认勾选项**；
其「生成偏好」面板的 **「自动」开关默认打开**、比例第一项是「智能」。切到「视频生成」才出现显式模式下拉：
**全能参考（默认）/ 首尾帧 / 智能多帧 / 智能编辑 Beta / 超长视频 Beta**。
→ **双轨**：Agent 自动（首页默认）+ 专业模式显式选，且专业模式的默认落点是**全能参考而不是文生视频**。

**首尾帧的适用场景文案（全行业最好的一份）**
（<https://docs.volcengine.com/docs/82379/1951250>，2026-09-07）：首尾帧有「出色的主体一致性」，
确保主体的「样貌、服饰、妆造等细节高度统一」；并给出明确的模式对比指导——

> 「对于各类风格化视频，『首尾帧生视频』相较于『图生视频』能够更好的控制画面的风格保持一致」

列了五个适用场景：生动运动 / 角色变装 / 影视级运镜 / 商品展示 / 风格化创意视频。

⚠️ 一条对 Nomi 有实际影响的限制：Seedance 2.5 **不支持直接上传含真人人脸的参考图/视频**。

### 2.2 Kling 可灵（快手）—— 显式选，但请求体已收敛成 typed slots

**谁决定：用户显式选**（consumer 选 tab，API 选 endpoint）。
首尾帧不是独立入口，是**图生视频里的一个开关**——点「Image to Video」右上角「Add End Frame」
（<https://kling.ai/quickstart/ai-video-start-end-frames>，2026-09-07）。

**首尾帧的 UI 指导文案是一条警告**（这条直接进我们的判据，见 §5.1）：官方写首尾两张图内容应尽量相似，
**差异过大会导致镜头切换而不是过渡**；建议选两张同主题的相似图、5 秒内。**不支持只给尾帧。**

API 1.6 是纯分裂 endpoint（`/text2video`、`/image2video`、`/multi-image2video` 最多 4 张、`/multi-elements`）；
**3.0 已换形状**：`contents[]` 的 `type` ∈ `prompt` | `first_frame` | `last_frame` | `element`，
最多 3 个 Element、提示词 `@名字` 指代、`settings.multi_shot` 支持 1–6 镜
（<https://kling.ai/document-api/api/video/3-0-omni/image-to-video>，2026-09-07）。
但 endpoint 仍分开 → **「调用方选大类，slot 决定细类」**，没有 Seedance 那层意图推断。

**角色一致性**：有独立的 **Element Management / Voice Management API**——元素做成了可管理的持久资源库。
**但没有自动建议。**

### 2.3 Runway —— 显式 toggle；一致性路线是「先做一致的图，再图生视频」

**谁决定：用户显式 toggle**。Gen-4 References 工作流第一步就是 "toggle on References"
（<https://help.runwayml.com/hc/en-us/articles/40042718905875-Creating-with-Gen-4-Image-References>，2026-09-07）。

**一个对 Nomi 很关键的架构事实：Gen-4 References 是图片能力，不是视频能力。**
同文结尾指明把生成好的图装载进视频模型 → **Runway 的角色一致性路径 = References 出一致的图 → 图生视频**，
视频侧没有独立的「角色参考模式」。**这与 Nomi 的「定妆图锚 → 镜头」链路是同一条路线**。

最接近「什么时候该用 reference 而不是 text-to-video」的原话，在长片指南里，而且更进一步
（<https://help.runwayml.com/hc/en-us/articles/26871350018835-How-to-create-longer-videos-and-films>，2026-09-07）：
建议做 **character plates**（角色的多角度 / 多服装 / 多景别中性基准图），以减少只用单张图时的 "subtle variations"；
并写 "Use references to place characters in the desired environments and scenes."
→ **character plates ≈ 我们的定妆卡 + `PlanAnchor.variants`**（`storyboardPlan.ts:70`）。**无自动选择。**

### 2.4 Higgsfield —— 没有自动路由，但有一张写给人看的「决策表」

**谁决定：用户选「模型家族」，版本自动**。帮助中心《Which AI model should I use?》整篇就是一张
「You want to → Use this model family」对照表，原话
"You don't need to pick a specific version: start with the family that matches your goal"
（<https://higgsfield.ai/creator-hub/help-center/ai-models/which-ai-model-should-i-use>，2026-09-07）：

| 你想做 | 用哪个家族 |
|---|---|
| 真实人体运动 | Seedance |
| 风格化 / 电影感 / 长片、多镜连续性 | Kling |
| VFX 与运镜控制 | Higgsfield DOP |
| **精确控制首帧和尾帧** | **Wan** |
| 同步音频 | Grok Imagine |

Wan 的首尾帧适用场景文案："useful when you need to continue a scene or match a specific start or end state"。

**全行业最直白的漂移承认**
（<https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-create-and-use-a-soul-id-character>，2026-09-07）：

> "A reference image anchors a single generation but drifts across many separate ones."

Soul ID = 用 20–80 张同一人照片训练一个身份层，生成时在 **Character tab** 选。官方同时诚实标上限：
期望是 "clearly the same person"、**不是**像素级相同；一个 Soul ID 只装一个人，**两个以上一致角色要用 Elements**。
**唯一一处「自动」**：训练好的 Soul 角色会自动出现在 Elements 里。

### 2.5 Pika —— 特性即产品名，用户按名字选

官方 FAQ（<https://pika.art/faq>，2026-09-07）：**Pikaframes**（Pika 2.2）= 上传第一帧和最后一帧两张静态图，
时长 1–10 秒；**Pikaffects**（1.5）= 爆炸/融化/挤压；**Pikadditions / Pikaswaps / Pikatwists** = 三个 video-to-video 特性。
**无自动选择、无角色库、无漂移承认文案。**

⚠️ **一条需要更正的前提**：Pika 的 **"ingredients" / Pikascenes 在 pika.art 官方页面上找不到**；
搜到的相关页面全是第三方 SEO 站（pikartai.com / pika-labs.org 等），`dev.pika.art/models/pika` 返回 404。
**不要把 ingredients 当 Pika 的现役官方能力来对标。**

### 2.6 加分组：两条改变判据的一手事实

**MiniMax / Hailuo（S2V-01）**——**参考模式是有代价的，而且官方自己写了**
（<https://www.minimax.io/news/s2v-01-release>，2026-09-07）：它解决
"maintaining consistent, realistic facial features and identity across dynamic video content"，
但 "may occasionally follow prompts less precisely than T2V or I2V"。
→ **任何「自动切参考模式」的策略都必须承认这个代价**。这条直接进 §5.1 的反向条件与 §7.2 的拍板项。

**Vidu**：四个并列的具名 endpoint（Text-to / Image-to / **Reference-to** / Start-End-to），
Reference-to-Video 支持上传**同一主体的多个视角**维持一致性（<https://platform.vidu.com/docs/introduction>，2026-09-07）。

**Sora**：⚠️ **未能一手核实**（help.openai.com / openai.com 本轮抓取全部 403 / Cloudflare 拦截）。
搜索摘要提到 cameos（可复用持久角色、带权限、可撤销），**当作未验证，别引用。**
**Luma**：本轮未覆盖。

### 2.7 聚合器：最该有自动路由的一层，实际一个都没有

| 聚合器 | 模式怎么选 | 有没有自动路由 | 出处 |
|---|---|---|---|
| **Freepik / Magnific** | Text tab / Image tab；**首尾帧是 Image tab 里的 End image toggle**；Multi-shot 是顶部 toggle（≤6 镜，仅部分模型）。**Custom Characters 的一致性是纯手工接线**：训练角色 → 生成角色图 → 切 Video → 把它当起始帧 | ❌ 仅 "1-click video for an automatic result" 与 "Enhance prompt with AI" | <https://magnific.com/ai/docs>（2026-09-07） |
| **Krea** | 左下角 model picker 手选。起止图设置项文案 "Define where the video begins / ends"；结束图建议用途 "great for loops or landing on a specific shot" | ❌ 文档中未发现任何自动选模型机制。角色一致性被当成**选模型的指标**（"Character retention"）给用户看 | <https://www.krea.ai/docs/user-guide/features/video>（2026-09-07） |
| **fal** | 一个模式一个 endpoint（如 `fal-ai/kling-video/o1/reference-to-video`），提示词 `@Image1`/`@Element1` 指代 | ❌ | <https://fal.ai/models/fal-ai/kling-video/o1/reference-to-video/api>（2026-09-07） |
| **LTX Studio**（结构上离 Nomi 最近） | Elements library + 在 shot 的 prompt 框里打 `@` 选 Character Element。可 Duplicate 出「同一张脸 + 不同服装」的变体（`@Sarah_casual`/`@Sarah_formal`） | ❌ **绑定全手动**，没有「同一角色出现在多镜就自动挂上」 | <https://ltx.io/blog/how-to-create-a-consistent-character>（2026-09-07，第一方博客；其 zendesk 帮助中心被 Cloudflare 挡） |

LTX 的漂移承认写得比谁都白：重新生成时眼睛颜色变了、头发长度变了、脸整个变了，根因
"Each AI generation starts from scratch"，并列了四条模型局限（无记忆机制、身份与风格纠缠、视角变化、注意力分散）。

### 2.8 对 Nomi 的三条判断

**① Nomi 的槽位设计已经站在行业终点上了，不需要再造模式 tab。**
Seedance 2.5 与 Kling 3.0 各自独立收敛到「素材贴角色标签 → 模式推断出来」，
与已拍板的「参考槽 = 声明式数据、archetype 六种 slot kind」是同一方向
（`docs/lessons` 的 `nomi-reference-slots-are-already-declarative`）。

**② 真做自动路由，必须抄 Seedance 那个「可覆盖 + 冲突报错」三件套，不能做成静默黑箱。**
`auto` 默认推断 → 允许显式指定 → 推断与声明不符时**抛 TaskTypeMismatch 而不是猜一个跑掉**。
→ 这正是 §7.2 拍板项 ② 推荐「只建议不自动改」的外部佐证：全行业没人敢静默切模式，
因为参考模式换一致性要付「提示词遵循度下降」的代价（§2.6 MiniMax 官方承认）。

**③ 「保角色一致」全行业没有自动策略，只有角色对象化 + 手动 `@`。**
Nomi 做「检测到多镜同一角色 → 建议挂参考」是**市面上没有的一步**。可行，但要守 Higgsfield 划出的两条边界：
一个身份对象只装一个人（多角色场景退回多对象模型）；期望值必须写成「明显是同一个人」而不是「像素一致」——
**这句话应该原样进 Nomi 的 UI 文案**，否则用户会拿像素级标准判定我们失败。

---

## 3. 开源：把能力档案编译成模型可读手册的实现

### 3.1 `Root-IO-Labs/open-agent-teams` —— 与我们同形，且已经踩过我们要踩的坑

仓库 `https://github.com/Root-IO-Labs/open-agent-teams` @ `8e4fd72eb7d9fddb90cb3c9e3b1a6ec72f8adead`
（2026-05-13，2026-09-07 clone 实读）。

**形状**：一份结构化的 `ModelProfile` 表（`internal/routing/profiles.go:46-76`：`ToolReliability`、
`ShellRecovery`、`MultiTurn`、`EffectiveContextClass`…）→ `GenerateModelRoster`
（`internal/routing/prompt.go:11`）编译成一段 markdown → 在 `internal/daemon/daemon.go:5555-5563`
**只对 supervisor / workspace 两种 agent 类型**注进提示词前缀。

编译出来的东西是两层：

1. **数据层**（`prompt.go:26-37`）：一张表 `| Model | Score | Coverage | Context | Latency | Strengths | Weaknesses |`，
   每行从 profile 派生。
2. **判据层**（`prompt.go:38-49`）：**人写的散文选择指南**，逐字如
   `"**You MUST distribute tasks across the available models.** Do not send all tasks to the highest-scoring model."`
   以及按复杂度路由的四条（Complex → 最高分带 reasoning 控制；Standard → 90-96 分档；Simple → 低分档省额度；
   Time-sensitive → 最低延迟）。

**三条我们该抄的**：

- **① 只说测过的**（`prompt.go:85-87, 96-99`）：`summarizeStrengths` 只在 `IsFullyProbed()` 为真时才敢写
  "strong error recovery" / "good at long tasks"；`profiles.go:61-73` 的 `UnprobedCapabilities` 专门区分
  「没测」与「测了得 0」，注释写明历史教训：pre-2026-04-23 未探测的能力被填 `1.0`，
  "silently promoted fast-gate models to parity with fully-probed ones"。
  → **Nomi 已经有同形字段**：`ArchetypeExpressionChannel.status ∈ documented | unsupported | unknown`
  （`electron/shared/videoCapabilities/types.ts:52-59`）。手册渲染必须把 `unknown` 渲染成「不知道」，
  不能渲染成「不支持」——这与 conformance §5.7 那条「三态，不可知绝不渲染 0」是同一条纪律。
- **② 弱点也写**（`prompt.go:107-137`）：`⚠ minimum probe set` 这种「这行数据本身可信度低」的限定符
  会被**追加在最后**当作对整行的 qualifier。→ 对我们就是「这个模式的时长上限档案里没写 → 明标不知道」。
- **③ 陈旧性写进提示词本身**（`prompt.go:52`）：
  `"this roster is a snapshot at supervisor-spawn time. Ask the operator to restart this supervisor after onboarding new models"`。
  → 这正是 §4 B 档「漂移风险」的具体形状，而他们的处理不是消除它，是**在带内承认它**。

### 3.2 `huggingface/smolagents` —— 全量运行期渲染，无索引层（反面参照）

@ `30bb1161095dbae2271e6bc3cc4c219cc3897a57`（2026-08-22，2026-09-07 clone 实读）。
`src/smolagents/tools.py:289-290`：

```python
def to_tool_calling_prompt(self) -> str:
    return f"{self.name}: {self.description}\n    Takes inputs: {self.inputs}\n    Returns an output of type: {self.output_type}"
```

在 `src/smolagents/prompts/toolcalling_agent.yaml:92-94` 被 jinja 全量展开
（`{%- for tool in tools.values() %} - {{ tool.to_tool_calling_prompt() }}`），
**没有任何索引/按需层，也没有条数上限**。这是「结构化 → 文本」最朴素的一版：
工具少时够用，到 §1.1 那条 30–50 个的准确率拐点就会失效。

### 3.3 `BerriAI/litellm` —— 结构化能力数据的规模上限（反例）

`model_prices_and_context_window.json`，2026-09-07 实测 **content-length = 2 311 609 字节（2.2 MB）**。
它是全生态最完整的「模型能力档案」，但**从不被渲染进任何 prompt**——只被 `get_model_info` 这类程序化
读取器消费。**这就是「不要把全部模型能力塞进 prompt」的实证反例**：数据一旦到这个量级，
路线必然是「机器目录 + 运行时检索」，而不是「编译成文本手册」。
（同一结论在 Anthropic 侧的对应物是 tool search：不编译成文本，保留机器目录、运行时检索。）

### 3.4 `Comfy-Org/workflow_templates` —— 索引 + 按需，但索引是给人看的

`templates/index.schema.json`（2026-09-07 实读）：每个 template 必填
`["name", "mediaType", "mediaSubtype", "description"]`，分类带 `type ∈ image|video|audio|3d`。
形状与 Skills 的 L1 完全一致（**必填 description = 触发判据的载体**），
但今天的消费方是 ComfyUI 前端的模板浏览器（给人挑），不是 LLM。
对我们的价值：它证明「一个能力条目的最小索引就是 name + type + description」这个三元组是收敛的。

### 3.5 对比表

| repo | 编译时机 | 粒度 | token 控制手法 | 数据/判据两层分离 | file:line |
|---|---|---|---|---|---|
| open-agent-teams | **运行期**，agent spawn 时一次 | 全量表（模型数量级 ~10） | 按 agent 角色过滤（只给 supervisor）+ `allowedModels` 白名单 | ✅ **有**：表格来自 profile，指南是人写的散文 | `internal/routing/prompt.go:11-56`；`internal/daemon/daemon.go:5555-5563` |
| smolagents | 运行期，每次构建提示词 | 全量，无上限 | ❌ 无 | ❌ 无（只有 description） | `src/smolagents/tools.py:289-290`；`prompts/toolcalling_agent.yaml:92-94` |
| litellm | **从不编译进 prompt** | 2.2 MB 机器目录 | 程序化查询取代注入 | — | `model_prices_and_context_window.json`（2 311 609 B） |
| workflow_templates | 构建期产出 `index.json` | 索引（name+type+description）+ 正文按需 | 索引/正文分层 | 部分（description 是人写的） | `templates/index.schema.json` |
| **Nomi 今天** | **运行期，每轮重建** | 全量（catalog 里所有有档案的模型） | ❌ 无上限、无过滤 | ❌ **无判据层**（末尾规则全是校验语言） | `availableModels.ts:195-222`；`generationCanvasAgentClient.ts:181` |

---

## 4. 三种形式对比（R3）

### 4.1 先把成本量出来（真实字节，不是估的）

测量方法：`sourceBackedVideoProfiles()` 实跑渲染（复跑脚本见 §附录 A）。
Token 估算沿用本仓约定「英文/JSON ~4 字符/token」（`scripts/lab-analyze.ts:15`），
**并对 CJK 单独按 1 token/字计**（中文提示词按 4 字符/token 估会低估约 3 倍）。

| 形态 | 字节 | 估算 token | 备注 |
|---|---|---|---|
| 档案全量 JSON（38 档案 / 104 模式 / 120 槽 / 401 参数） | 125 189 | ~34 000 | 上限参照，谁也不会真塞 |
| **今天在跑的手册**（`formatAvailableModelsForPrompt`，38 个视频模型） | 10 829 | **~3 078** | ~81 token/模型；**每轮**注进用户消息 |
| 同上，真实 8 模型子集（1–3 家供应商的常态） | 2 279 | **~650** | 这才是多数用户的真实开销 |
| **补齐 C1/C2 后的手册**（逐模式列参数 + 时长区间 + hint） | 21 650 | **~5 835** | ~154 token/模型；单档案 min/median/max = 188/518/1117 字节 |
| 纯索引（模型 id + label + 各模式 intent） | 2 235 | **~564** | ~15 token/模型 |

对照锚：production 工具档今天 30 个工具 / **12 641 token**
（`docs/plan/2026-09-07-agent-rebuild-stage3-5-deep-plan.md` §3.2）。
Anthropic Skills 的 L1 是 **~100 token/技能**（§1.1）——**与我们「一个模型 ~81–154 token」是同一量级**，
这说明「一个模型 = 一个技能」的类比在成本上成立。

### 4.2 三档对比

| | **A · 档案 → 自动生成「模型手册」资源，按需注入（像技能一样按 description 触发）** | **B · 塞系统提示词常驻** | **C · 只靠解析器引擎校验、在错误里教模型** |
|---|---|---|---|
| **用户看到** | Agent 在写分镜时主动说「这三镜是同一个人，我给你走参考图模式，别用文生」——判据在**方案期**就影响结构 | 同上（如果模型读得进去） | 用户先看到一版文生视频的方案，采纳后被红条拦下「这镜跨镜同角色但选了文生」，再来一轮 |
| **Token（38 模型）** | 索引 ~564 + 命中时正文 ~154/模型 + 判据资源 ~400–800（一次） ≈ **常驻 ~660，峰值 ~2 000** | **~5 835 常驻，每轮** | **0**（判据不进上下文） |
| **Token（真实 8 模型）** | 常驻 ~120 + 判据索引 ~100 + 峰值 ~1 100 | ~1 230 常驻 | 0 |
| **漂移风险** | **低**：手册与判据都从档案 derive；判据散文是唯一手写部分，进 `check:*` 棘轮 | **中**：同 open-agent-teams 的 snapshot 问题（`prompt.go:52`），且**加一个模型就动一次前缀 → Manus 的 KV-cache 那条** | **零**（判据只有引擎一份） |
| **命中率** | 未知，需探针（§7）。参照 Skills：description 语义匹配是官方主力机制 | **本仓已有阴性实测**：模型清单挪进 system prompt 前部后 `modelKey` 服从性 **0/5**（`generationCanvasAgentClient.ts:135`） | **100% 拦得住，0% 教得会**——模型每轮重犯，靠人工再来一轮 |
| **对 §1 拐点的姿态** | 顺着走（≥10 条就该索引化） | 逆着走 | 不适用 |
| **致命弱点** | 多一层间接：模型得先决定「要读手册」。且**判据是散文 → 会与引擎判据漂成两份**（正是 R14.1 要防的） | §0.2 的阴性实测 + 每轮 5 835 token | 「决策工具」退回「预检闸」——**这正是 GSR 方案 2026-09-07 已经明确否掉的定位** |

### 4.3 推荐：**A′ = 修好的紧凑手册留在原位（用户消息） + 判据走按需资源 + 引擎兜底**

**为什么不是纯 A**：把手册从用户消息挪走会撞上 §0.2 那条 0/5 的实测。
手册今天所在的位置（用户消息、贴着请求）是**用真实 smoke 换来的**，不能因为「按需更优雅」就推翻。

**为什么不是 B**：见上，且 5 835 token/轮 常驻是 production 工具档（12 641）的 46%，
在 S7「任一 profile ≤4 000 token」的预算下直接爆表。

**为什么不是 C**：GSR 方案 2026-09-07 已经把定位从「落画布前的合法性预检」改成
「Agent 写分镜那一刻的副驾」。C 档就是退回预检——**它是被用户原话否掉的那一版**。

**A′ 的三层**：

| 层 | 内容 | 位置 | 触发 | 成本 |
|---|---|---|---|---|
| **L1 手册（修好版）** | 每模型每模式：intent / vendorTerm / 槽（kind+min/max+characterIndexed）/ **时长区间与分辨率档位**（修 C1/C2） | **原位**：用户消息，贴着请求 | 常驻 | 8 模型 **~1 230 token**（154×8）。**诚实标：这比今天的 ~650 贵了近一倍**——修 C1/C2 是要花 token 买的。买的是「模型手里有做决定所需的数字」，不买就是 §0.2 那条「六成模式看不见时长」 |
| **L2 判据资源** | 一份**自动生成的技能**（`SKILL.md` frontmatter，name+description ≤1024 字符第三人称）：「什么时候该用参考图/首尾帧/文生/视频参考」。正文含 §5 的判据表 | 索引常驻（~100 token），正文按需 `load_skill` | description 语义匹配（pi `skills.js:283` / `skillIndex.ts`） | 常驻 ~100，命中时 ~400–800 |
| **L3 引擎兜底** | `resolveGenerationPlan` 增 `ModeProposal`，落画布前再校验一次 | 不进上下文 | — | 0 |

**为什么不是 hook**（题面点名要回答）：三条理由，按重要性排。

1. **hook 是 fail-closed 的拦截点，判据是 fail-open 的建议。** 本仓 hook 的语义已经写死在
   `docs/plan/2026-09-07-agent-rebuild-stage3-5-deep-plan.md` §1.2 / §4.3-P1：`before_tool` 抛异常 = block。
   「这三镜同角色，建议改参考图模式」**不该 block**——它可能是错的（用户就想要文生的自由构图），
   把建议做成 hook 等于把 D5「给真判断」做成了 D1 反面的「多一道关卡」。
2. **hook 拿不到叙事上下文。** 判据要读的是「跨镜锚点复现」——那是**整份方案**的性质，
   不是单次工具调用的参数。hook 在 `before_tool` 只看得见这一次调用的 args。
3. **hook 教不会模型。** 被 hook 拦一次，模型下一轮还是会先写错再被拦（= C 档的病）。
   而 L2 资源是在它**动笔之前**就摆在那儿的。

**A′ 的已知代价**（诚实标，D4）：L2 判据是散文，**与 L3 引擎判据天然是两份**。
处置：判据表的**每一条**必须与引擎的一个 `ModeProposal` 判据一一对应，
并进 `check:vocabularies`（单一语义 owner 门岗）——**散文可以更啰嗦，但不许多一条或少一条**。
这条不做，A′ 就会长成 R14.1 要横扫的那种「同一语义两份定义」。

### 4.4 R29 四列表（框架边界）

因为 L2 要用 pi 的技能通路，按 R29 出四列表：

| 它提供 | 我们用了 | 我们另写了 | 我们拆散了 |
|---|---|---|---|
| `<available_skills>` 索引注入（`dist/core/skills.js:275-298`）——**在 customPrompt 下仍生效**（`system-prompt.js:30-32`） | ❌ 未用（Nomi 走自己的 `formatNomiSkillIndex`） | `electron/harness/skillIndex.ts:35-45`（理由：Nomi 不给模型 `read` 工具，技能正文不一定在盘上——见 §3.4 D-06） | — |
| frontmatter 三字段解析（`pi-agent-core/dist/harness/skills.js:214-235`：只读 `name`/`description`/`disable-model-invocation`） | ✅ PR #580 已对齐 | `metadata.nomi.*` 扩展（走标准扩展点，合 R31） | — |
| `promptSnippet` / `promptGuidelines`（`system-prompt.js:44-79`） | ❌ 全仓 0 次使用，**且被 customPrompt 分支整个丢掉** | — | — |
| `ResourceLoader` / `systemPromptOverride`（`core/resource-loader.js`） | ❌ | Nomi 自己的 `agentContext.ts` 注入点 | — |

**结论：L2 用「自动生成的 SKILL.md + 已有的 `skillIndex` + `load_skill`」，不新建第四条注入通路。**
生成的 SKILL.md 必须过 `check:skills-format`（PR #580 建的门岗）与 R31 的 agentskills.io 对齐。

---

## 5. 模式选择的判据

### 5.1 四种模式各自的适用条件

`ArchetypeIntent` 只有五个值（`electron/shared/videoCapabilities/types.ts:62`）：
`text | single | firstlast | character | edit`。判据按 intent 组织，不按供应商叫法（P4 通用第一）。

| 模式 | 适用条件（**判据**，不是描述） | 依赖的真相源 | 反向条件（什么时候**不该**用） |
|---|---|---|---|
| **`character`（参考图 / 全能参考）** | 这一镜引用的 `anchorIds` 里，存在一个 `kind==='character'` 且 `carrier==='visual'` 的锚，**且该锚在 ≥2 个镜头出现**（跨镜复现），**且该锚已有或将有定妆图产物** | ① `PlanShot.anchorIds`（`storyboardPlan.ts:132`）② `PlanAnchor.kind/carrier`（`storyboardPlan.ts:22,25,46,62`）③ 定妆图产物 ④ `modeSlotReach` 判 `image_ref` 槽在这条渠道 ≠ `none` | 该模式的 `image_ref` 槽 reach = `none`（这家发不出去）→ **不建议，并说明原因**（GSR §5 P4 点名要防的那条） |
| **`firstlast`（首尾帧）** | 二选一：① **拆条承接**——一镜超单条上限被拆成连续 N 条，切点处用「上条尾帧 = 下条首帧」；② **同场状态延续**——相邻镜 `sceneId` 相同且存在显式状态变化（血/湿/衣破，写在 `PlanShot.lfDesc`）。**外部对照**：火山方舟明写「风格化视频，首尾帧比图生视频更能保持风格一致」（§2.1） | ① `SplitProposal.suggestFirstLast`（已实现，`planResolver.ts:99-108`）② `PlanShot.sceneId`（`storyboardPlan.ts:117`）③ `ffDesc`/`lfDesc`（`storyboardPlan.ts:163,186`）④ `modeSlotReach` 判 `first_frame`+`last_frame` 双槽 | ① 只有首帧没有尾帧 → 退 `single`（`recommendation.ts:172` 已有这条打分：first>0 且 last=0 时 `single` 105 > `firstlast` 80）② **首尾两帧内容差异过大 → 不该用**：Kling 官方警告「差异过大会导致镜头切换而不是过渡」（§2.2）。落到判据 = `variationType === 'large'`（`storyboardPlan.ts:171`：构图与焦点剧变）时**不建议 `firstlast`**——这条 Nomi 已经有字段承接 |
| **`single`（首帧 / 图生视频）** | 有且只有一张确定的起始画面（`keyframe.enabled === true` 的图片+视频分镜；或上一镜产物续接） | `PlanShot.keyframe`（`storyboardPlan.ts:191-199`）、`referenceBindings.first_frame` | — |
| **`text`（文生）** | **兜底**：没有任何跨镜复现的视觉锚、没有首帧、没有参考视频。**并且它有一个正面理由**：参考模式会**降低提示词遵循度**（MiniMax 官方原话 "may occasionally follow prompts less precisely than T2V or I2V"，§2.6）——所以「这一镜要的是自由构图/大幅运动」时文生是**对的选择**，不是次品 | 上面三条全否 | **有跨镜角色锚时不该用**——这就是用户那句「脸和服装会乱变」的机器化形式。外部对照：Higgsfield 官方 "A reference image anchors a single generation but drifts across many separate ones."（§2.4） |
| **`video_ref`（视频参考，槽而非 intent）** | 用户显式给了参考视频（动作/节奏复刻），或同 `camIdx` 的镜头要复用运动 | `PlanShot.camIdx`（`storyboardPlan.ts:176`）、`referenceBindings.video_ref` | 该模式无 `video_ref` 槽 |

**音频三态**（补 GSR 的 G4）：档案已能表达三种情况——① 有 `generate_audio` 开关（`seedance-2` 有）
② 原生有声无开关（`minimax-h3`：`minimaxH3.ts:20`，实测手册渲染里 `minimax-h3` 的参数确实没有 `generate_audio`）
③ 无声。判据：`shotKind==='video'` 且该镜有对白（`StoryboardProfile.dialogue === true`，
`storyboardProfiles.ts:17`）→ 按 `skills/director-sound/SKILL.md` 的硬约束走「侧脸/画外 + 后期配音」，
**不往 video prompt 塞音频词**，并把 `generate_audio` 设 false（有开关时）。

**分辨率与秒数**：**已经有引擎了**，不要重写。`recommendation.ts:123-141` 的 `chooseParamValue`：
`quality: draft|balanced|final` → 分辨率档位首/默认/末；`durationSeconds` → 最近合法值（枚举）或钳到 min/max。
`planResolver.ts` 的 `duration.*` / `param.*` 判据已覆盖钳值与回落。**下一刀不动这两块。**

### 5.2 三个真相源的实核（GSR §5 P4 担心的三样，全部已存在）

| 真相源 | 今天在哪 | 状态 |
|---|---|---|
| **跨镜锚点复现** | `PlanShot.anchorIds: string[]`（`src/workbench/generationCanvas/agent/storyboardPlan.ts:132`）+ `PlanAnchor{kind, carrier, scope}`（`:43,46,62,64`）。规划师技能已写死「一个角色在 ≥2 个镜头出现 → 建一个锚」（`skills/workbench-storyboard-planner/SKILL.md:77`） | ✅ 存在。**但 `planResolver` 的 `PlanShotInput` 只收 `anchorIds: string[]`，收不到 anchor 的 kind/carrier**（`planResolver.ts:35`）→ 下一刀要加 `anchors` 输入 |
| **定妆图产物** | 视觉锚（`carrier==='visual'`）落画布后是一张图片节点，产物即定妆图；`PlanAnchor.referenceSourceNodeId`（`:75`）记录「某镜结果已是画布节点时直接复用」 | ✅ 存在，但**在方案期还没生成**。判据必须区分「已有产物」与「将会生成」——后者也算数（`carrier==='visual'` 本身就是「系统会先生成一张参考图锁住长相」的承诺，见 SKILL.md:89） |
| **`archetype.slots` 可达性** | **两层**：① 档案声明层 `ArchetypeReferenceSlot{kind, min, max, characterIndexed}`（`types.ts:39-50`）② 渠道可达层 `modeSlotReach(slots, createBody, combineKey) → SlotReach[]`，`SlotReach ∈ full \| single \| none`（`electron/catalog/referenceReachability.ts:17-24, 62`）。**②是 UI 收窄与生成第三闸共用的唯一尺子**（文件头注释：「UI 说能发、闸门判发不出，正是本仓反复在修的那类病」） | ✅ **完整存在**。渲染层已在用（`src/workbench/generationCanvas/nodes/controls/channelModeReach.ts:114`）。`planResolver` 住在 `electron/shared/`，**可以直接 import `electron/catalog/referenceReachability`**，不必经渲染层那条转出 |

**第四个真相源（题面提到的片种模板）**：`STORYBOARD_PROFILES`
（`src/workbench/generationCanvas/agent/storyboardProfiles.ts:14-27`）今天只有 2 个 profile，
只声明 `aspect` / `dialogue` / `promptSkeleton`。**它对模式选择的贡献只有一条：`dialogue: true` ⇒ 口型硬约束**（见 §5.1 音频）。
`aspect` 贡献给参数不贡献给模式。**不要为了凑判据把它想大**——它今天就这么小。

### 5.3 下一刀的输入/输出契约草案

在现有 `planResolver.ts` 上**加一类 proposal**，不改 IPC 契约、不改面板骨架（GSR §5 P4 已确认这条通路留好了）。

```ts
// ── 输入：GenerationResolutionInput 增一个字段 ────────────────────────────
// 只收模式判据真读的三个字段。**刻意不带 `hasArtifact`**：判据对「已有定妆图」与
// 「将会生成定妆图」的结论完全相同（carrier==='visual' 本身就是生成承诺，SKILL.md:89），
// 一个从不被读的字段就是第二份真相源的入口。
export type PlanAnchorInput = {
  id: string;
  kind: 'character' | 'scene' | 'prop' | 'style';
  carrier: 'visual' | 'text';
};

export type GenerationResolutionInput = {
  shots: PlanShotInput[];
  /** 新增：镜头引用的锚。 */
  anchors?: readonly PlanAnchorInput[];
  candidates: readonly VideoModelCandidate[];
  defaultModelKey?: string;
  goals?: { allowAdvisoryMerge?: boolean };
  // **刻意没有 `allowModeProposals` 开关**：覆盖通道已经有了——镜上显式写 modeId 就不产建议
  // （见下方三件套 ②）。再加一个全局开关是第二条覆盖路径，而没人会去设它。
};

// ── 输出：新增一类 proposal（与 Merge/Split 平级，同一条「采纳 → 自动重查」通路）──
// 三个值，不是四个：「已有首帧图 → 图生视频」不在这里——`recommendation.ts:172` 的
// first>0/last=0 → single 105 打分已经是同一条判据，再写一遍就是两份。
export type ModeProposalReason =
  | 'anchor.character.recurring'   // 跨镜同角色 → 参考图
  | 'split.continuity'             // 拆条承接 → 首尾帧
  | 'scene.stateContinuity';       // 同场状态延续 → 首尾帧

export type ModeProposal = {
  shotId: string;
  fromModeId: string;
  toModeId: string;              // 显示名由边界从 modeId 查档案，引擎不产文案（附录 G.2）
  reason: ModeProposalReason;
  /** 触发这条建议的锚 id（reason=anchor.* 时非空）——面板据此渲染「因为林夏出现在镜 1/3/5」。 */
  anchorIds?: string[];
  /** 目标模式承接这些参考的槽与它在这条渠道上的真实承载力。 */
  slot: { kind: ArchetypeReferenceSlotKind; reach: 'full' | 'single' };
  // 没有 `advisory` 字段：`ModeProposal` 这个类型**本身**就是「建议」——它永不阻断
  // （与 `MergeProposal.advisory` 不同，那里 true/false 真的分两档）。恒真的布尔是零信息。
};

// ── 新增一条 issue code：想建议但接不住 ──────────────────────────────────
// PlanIssueCode 增： 'mode.proposalBlocked'
//   params: { shotId, wantedModeId, slotKind, reachOrMissing }
//   语义：判据成立（跨镜同角色）但目标模式在这条渠道上槽 reach = none 或档案无该槽
//        → **不产 proposal，产一条 issue 说明为什么建议不了**（D4 诚实标缺口）
```

**引擎不产文案**（GSR 附录 G.2 已定的纪律）：`ModeProposal` 只交代 code + 真实数值 + 锚 id，
中文由显示边界的 `strategyText` 模板拼。

**判据的执行顺序**（写死，防止 LLM 与引擎各排各的）：
`split.continuity` > `anchor.character.recurring` > `scene.stateContinuity` > `keyframe.present`。
理由：拆条承接是**结构性的**（拆完必须接上），角色一致是**质量性的**，两者冲突时结构优先。

**三件套（抄 Seedance，§2.8 ②）**：① 默认就是 `auto` 档——不给全局开关，因为覆盖通道在镜上；
② 镜上显式写了 `modeId` 就**不产建议**（= 显式指定压过推断，对应 `omni_reference_task_type` 的非 auto 值）；
③ 显式 `modeId` 与判据结论冲突时，**产一条 `mode.proposalBlocked` 说明冲突，不静默改也不静默沉默**
——对应 Seedance 的 `InvalidParameter.TaskTypeMismatch`：**自动判定不能是黑箱，得把冲突说出来**。

### 5.4 落哪个阶段

| 阶段 | 内容 | 前置 |
|---|---|---|
| **P4a（先做，独立可交付）** | 修 §0.2 的 **C1 + C2**：`formatAvailableModelsForPrompt` 逐模式列参数、`duration`/数值型控件渲染 `min-max`。**这是纯 bug 修**，与判据无关，但判据要用的数字全在这儿 | 无。可立刻做 |
| **P4b** | `planResolver` 增 `ModeProposal` + `mode.proposalBlocked`；面板复用现有「逐条采纳 → 自动重查」 | 只剩 P4a——**GSR 已于 2026-09-07 合入 `origin/main`**（`planResolver.ts` / `strategyGate.ts` / `StoryboardPlanStrategyPanel.tsx` 均在 main 上），本文所有 `planResolver.ts:*` 行号均按 main 核对 |
| **P4c** | L2 判据资源（自动生成 SKILL.md）+ `check:vocabularies` 登记「散文条数 = 引擎判据条数」 | P4b（判据先在引擎里定死，再 derive 成散文，**不能反过来**） |

---

## 6. 自媒体：真做的人怎么选模式、踩什么坑

### 6.1 自媒体来源（TikHub）

抓取命令（原样，2026-09-07 实跑）：

```bash
export TIKHUB_API_KEY="…"        # 只从环境变量读
for q in "AI视频 角色一致 参考图" "Seedance 首尾帧" "即梦 参考模式"; do
  node scripts/research/tikhub-search.mjs --q "$q" --platform all --limit 8 \
    --since 2026-03-01 --out "docs/research/2026-09-07-model-mode-knowledge/tikhub/<ascii-slug>/"
done
```

产物附件（四平台 × 8 条 × 3 组 = 96 条）：
`docs/research/2026-09-07-model-mode-knowledge/tikhub/character-consistency-reference/`、
`.../seedance-first-last-frame/`、`.../jimeng-reference-mode/`（各含 `tikhub-search.json` + `tikhub-search.md`）。

| 平台 | 出处 URL | 作者 | 发布 | 观点摘要（原文，未改写） |
|---|---|---|---|---|
| 抖音 | <https://www.douyin.com/video/7623742058423130875> | 鸿悟AI | 2026-04-02 | 「每次画出来的脸都不一样，这还怎么做AI漫剧博主？其实只要一张【标准四视图】，所有问题都解决了……不管换什么背景、换什么衣服，脸部都能1:1还原」 |
| 小红书 | <https://www.xiaohongshu.com/explore/6a0d50e2000000000803fde9> | 贪吃的小白熊 | 2026-05-20 | 「做AI人物图最崩溃的不是不会出图，而是：第一张很好看，第二张就像换了个人。人物一致性的核心，不是"反复抽卡"，而是先……」 |
| 小红书 | <https://www.xiaohongshu.com/explore/6a6cdc65000000003301900d> | Ryan_Roaming_Node | 2026-07-31 | 「明明提示词里写的是同一个角色，到了下一个镜头，却出现了变脸、换发型、换衣服」 |
| 小红书 | <https://www.xiaohongshu.com/explore/6a3a89c90000000008025763> | 栋栋幺AI | 2026-07-02 | 标题即问题：**「全能参考和首尾帧到底用哪一个？」** |
| 小红书 | <https://www.xiaohongshu.com/explore/6a8c179c0000000033018da2> | Jacky杰克彭老师 | 2026-08-24 | 「**别只会文生视频！4种玩法让画面不跑偏！**……提供参考图来生成图片和视频是非常实用和重要的一种ai生成方式」 |
| 小红书 | <https://www.xiaohongshu.com/explore/6a2a98b700000000160279cd> | 月知一Serene | 2026-06-11 | 「**别再用三视图去稳定人物了 这是我见过最笨的方法**」 |
| 小红书 | <https://www.xiaohongshu.com/explore/6a7c0a56000000002402fc6e> | 一只Panda | 2026-08-12 | 「角色参考图真的该换版了……**不再把同一张脸塞进正面、侧面、背面三处，而是只留一个清晰**（的脸）」 |
| 抖音 | <https://www.douyin.com/video/7644096469682687238> | AIGC大马 | 2026-05-26 | 「画面断层、跳转突兀？AI 长视频通病这样解！**生成AI片段前面视频的尾帧和后面视频的首帧衔接不上**」 |
| 抖音 | （见附件 `seedance-first-last-frame/tikhub-search.md:49`） | 豆包教学号 | — | 「在聊天框上传首帧图、尾帧图两张图片……**发送后自动跳转Seedance视频创作面板，两张图自动绑定首尾帧**」 |
| B站 | <https://www.bilibili.com/video/BV1njb66REGS> | 瞎大笨 | 2026-08-17 | 「MinimaxH3多参模式下首尾帧控图……由此实现无缝衔接的长视频，**且无上下文参考带来的画质异化**」 |
| B站 | <https://www.bilibili.com/video/BV1f5gr6gEJs> | 账号星球官方 | 2026-07-22 | 标题即问题：**「即梦各模型怎么选？」** |
| X | （见附件 `seedance-first-last-frame/tikhub-search.md:287`） | — | — | 「【参考锁定】参考图1只锁定成年老板娘#1的腿脚比例、薄袜质感……**彻底忽略参考图中的宾馆走廊、豪华沙发、暖色装潢和原始背景**」 |
| X | （见附件 `seedance-first-last-frame/tikhub-search.md:296`） | — | — | 「Image1＝后方持枪女人；Image2＝前景接饮料女人。**严格保持两人的脸、发型、服装和身份一致，不得互换**」 |

### 6.2 读到的真实摩擦（不是功能列表）

1. **「换脸/换衣」是被反复命名的痛点，且被命名为「AI 漫剧做不下去」的原因**，不是小瑕疵。
   多条标题直接写「崩脸」「跑偏」「像换了个人」。→ **验证了用户那句话是真摩擦**，不是他一个人的偏好。
2. **「用哪个模式」本身就是内容选题**——两个高赞标题直接是问句：「全能参考和首尾帧到底用哪一个？」
   「即梦各模型怎么选？」。→ **这个决策今天是靠看教程解决的**。Nomi 要做的正是把它内化掉，
   这是 D1（从用户那一刻的摩擦出发）最直接的落点。
3. **创作者已经在手写我们数据结构里那个字段**。X 上的长 prompt 逐字写「参考图1只锁定……
   **彻底忽略**参考图中的宾馆走廊、豪华沙发、暖色装潢和原始背景」——这正是
   `PlanReferenceBinding.ignore`（`storyboardPlan.ts:105`）那个字段的用户侧形态，
   而那段注释已经写明「参考图永远'多带了东西'」。**我们的抽象是对的，只是没人知道它在**。
4. **首尾帧的主用途是「片段之间接不上」，不是「特效玩法」**——抖音那条把它命名成
   「AI 长视频通病」。→ 与 `SplitProposal.suggestFirstLast` 的默认建议对齐（GSR「先查别人」已引 cinevva 的同形结论），
   但也说明**这条判据的用户语言是「接不上」，不是「承接」**（文案要用前者）。
5. **有一条与「多喂参考」相反的实践信号，且是当下的**：「别再用三视图去稳定人物了」（2026-06-11）、
   「只留一个清晰的脸，反而更稳定」（2026-08-12）。
   → **判据不能写死「参考图越多越稳」**。`ArchetypeReferenceSlot.max`（`seedance-2` 的 `image_ref` max=9）
   是**上限不是目标**。建议只连「这一镜真出现的角色锚」，不要把全片角色都连上。
6. **「上下文参考带来的画质异化」是一条我们档案里没有的知识**（B站，MiniMax H3）。
   → 登记为 `[推测/待验]`：多参模式下参考越多画质越可能劣化。这条**不进判据**（没有一手出处），
   但进 §7 的开放问题。

---

## 7. 六角色短评 · 拍板项 · 最小探针

### 7.1 六角色短评（R7）

| 角色 | 短评 |
|---|---|
| **CTO** | 「已经在跑的编译器有两个丢信息的 bug」比「要不要新建一层」重要一个数量级。**P4a 先做**——它是纯 bug 修、无需拍板、且是判据的前置。别把一个两行的修正压在一个要拍板的架构决定后面。 |
| **设计** | 判据的用户语言不能抄工程词。自媒体里这件事叫「崩脸」「接不上」「跑偏」，不叫「跨镜锚点复现」「首尾帧承接」。面板那条建议第一句必须是「镜 1/3/5 都是林夏，直接文生她的脸会变」，不是 code 名。 |
| **PM** | 这一刀的价值不是「少犯错」，是**把一个今天要看教程才会的决定内化掉**（§6.2 两个问句标题就是证据）。所以它必须出现在**方案期**（面板 + 行内），不能只在落画布前。C 档在产品上是负分。 |
| **前端** | 面板骨架不用动——`ModeProposal` 走现有「逐条采纳 → 自动重查」。**唯一新东西是「为什么」那行要能点开锚**（「因为林夏出现在镜 1/3/5」要能高亮那三行）。别为它新建组件。 |
| **后端** | `planResolver` 住 `electron/shared/`，直接 import `electron/catalog/referenceReachability` 拿 `modeSlotReach`——**不要在解析器里重写第四份可达性判断**（前三份的教训写在 `channelModeReach.ts:8-10`）。`PlanShotInput` 加 `anchors` 是 breaking 的，但 resolve 是 stateless advisory，加可选字段即可。 |
| **真实用户** | 两句话。①「你建议我用参考图模式，那我的参考图哪来？」——**判据必须同时回答产物从哪来**。视觉锚会被系统生成（SKILL.md:89），但用户不知道。文案要说完整：「我会先给林夏生成一张定妆图，再用它锁住这三镜」；只说前半句会被当成让用户去准备素材。②**期望值要先说清**：抄 Higgsfield 的 "clearly the same person"（§2.4），Nomi 的文案要写「明显是同一个人」而不是暗示像素一致——否则用户会拿像素级标准判定我们失败。 |

### 7.2 要拍板的（≤2 条）

**① L2 判据资源用「自动生成的技能」还是「手写的技能」？**

| 选项 | 用户看到 | 代价 |
|---|---|---|
| **A 自动生成（推荐）** | 判据永远与引擎同步；加一个模型自动进手册 | 生成器要写；SKILL.md 变成产物不是源码，`check:skills-format` 要放行生成物 |
| B 手写一份 | 立刻能写、能写得更好读 | **必然漂**——这正是 R14.1「同一语义有几份定义」要横扫的东西 |

推荐 A，理由：§4.3 已经把「散文条数 = 引擎判据条数」定成门岗，手写版守不住这条。

**② 模式建议要不要默认自动采纳？**

| 选项 | 用户看到 | 代价 |
|---|---|---|
| **A 只建议不自动改（推荐）** | 面板出现「建议改参考图模式 · 采纳 / 为什么」 | 多一次点击 |
| B 默认帮他改了、标注可撤销 | 少一步 | 违反「方案免费可改、执行才花钱」的审阅哲学；且判据可能错（用户就想要文生的自由构图） |

推荐 A，**且这次有外部证据不只是审美**：全行业没有一家静默替用户切模式（§2.0 结论 3），
唯一做自动推断的 Seedance 也给了 `omni_reference_task_type` 覆盖 + 冲突报错（§2.1）；
而参考模式的代价是**提示词遵循度下降**（MiniMax 官方，§2.6）——静默切等于替用户付了一个他不知道的价。
**但整批采纳要有一个按钮**——5 镜同角色会产 5 条建议，逐条点是 D1 的反面。

### 7.3 最小探针（零额度，半天内）

**目的**：验「把判据摆在模型面前，它能不能在 3 条指令里选对模式」——即 §4 A′ 的 L2 命中率假设。
**阳性对照是这个探针的命门**（`race-repro-needs-positive-control` 的教训）：
没有「不给判据」的对照臂，「给了判据就选对了」证明不了任何事。

**装置**：本仓已有的 loopback 通路 —— `tests/agent-runtime/lane-tool-accuracy.test.mts` 同款
（`AgentHarness` + loopback provider，零额度；见 `docs/research/2026-09-07-pi-0.85.1-probe-report.md` §4.2 三条 loopback 臂）。

**三条指令**（每条都有唯一正确答案，且答案来自 §5.1 的判据表）：

| # | 指令 | 正确答案 | 它验的是哪条判据 |
|---|---|---|---|
| 1 | 「林夏出现在镜 1、3、5；镜 2 是空镜天台。给这 5 镜选模式。」 | 镜 1/3/5 → `character`；镜 2 → `text` | `anchor.character.recurring` + 反向条件（只出现 1 次不建锚） |
| 2 | 「这一镜 40 秒，模型单条上限 15 秒。」 | 拆 3 条 + 切点用 `firstlast` | `split.continuity` 优先级高于 `anchor.*` |
| 3 | 「林夏出现在镜 1、3，但当前模型的参考图槽这家发不出去（reach=none）。」 | **不建议 `character`**，说明原因 | `mode.proposalBlocked`（GSR §5 P4 点名要防的那条） |

**四条臂**（一次一变量）：

| 臂 | 上下文 | 期望 |
|---|---|---|
| **A0 阴性对照** | 今天的手册（含 C1/C2 缺陷），无判据 | **应该答错**——尤其第 2 条（它看不见 15 秒这个数） |
| **A1** | 修好 C1/C2 的手册，无判据 | 第 2 条应转绿（数字可见了）；第 1、3 条应仍错 |
| **A2** | A1 + L2 判据正文**直接内联** | 三条全绿 = 判据本身够用 |
| **A3** | A1 + L2 只给索引（name+description），正文要模型自己 `load_skill` | **这条才是 A′ 的真实形态**。绿 = 按需触发成立；红 = 退回把判据常驻（成本 +400–800 token） |

**为什么保留 A0/A1 两臂**（Ponytail 评审建议砍掉，这里明确不砍）：§0.2 用代码行为证明的是
**「手册里没有这些数字」**，A0/A1 量的是**「模型的行为会不会因此改变」**——那是两个不同的命题。
没有 A0 这条阴性对照，A2 全绿也证明不了是判据起的作用（`race-repro-needs-positive-control` 那条教训的对偶）。

**判读**：A0→A1 转绿证明 C1/C2 真的影响模型行为（不只是代码难看）；A2 绿而 A3 红 = description 写得不够好，
改 description 重跑，**不是**改成常驻（那是 §1 所有人的反面）。A2 就红 = §5.1 判据表本身要重写。

**成本**：零额度（loopback）。若要一条真实模型对照，DeepSeek V4 Flash 一轮 ≈ ¥0.004
（`docs/research/2026-09-07-pi-0.85.1-probe-report.md` §1）。

---

## 8. 诚实记分

- **真跑了的**：`sourceBackedVideoProfiles()` 实跑渲染取全部字节/token 数字（§4.1，脚本见附录 A）；
  TikHub 四平台 × 3 组关键词 96 条实抓（§6，附件在库）；pi 0.85.1 `node_modules` 源码实读（§1.3）；
  `smolagents` / `open-agent-teams` 实 clone 读源码取 file:line（§3.1–3.2）；
  LiteLLM 能力 JSON 实测 content-length（§3.3）。
- **只读没跑的**：§1 的四家官方文档（读文档，没在各自产品里实测行为）；
  §2 除即梦消费端 UI 是实测外，其余均为读官方文档/帮助中心；§3.4 ComfyUI 模板索引（只读 schema）；
  §5.3 的契约是**草案**，一行代码都没写。
- **没覆盖到的**：
  - **Sora 与 Luma**（§2.6）：OpenAI 站点本轮抓取全部 403 / Cloudflare 拦截，Luma 未覆盖。
    Sora 的 cameos 只有搜索摘要，**当未验证处理**。
  - **Pika 的 "ingredients / Pikascenes"**：在 pika.art 官方站点上**不存在**，搜到的全是第三方 SEO 站。
    题面把它当作 Pika 现役能力的前提**已被证伪**（§2.5）。
  - **「多参模式参考越多画质越可能劣化」**（§6.2 第 6 条）只有一条 B 站二手信号，**没有一手出处**，
    因此**没进判据**。要用它得先做 A/B 实拍。
  - **A′ 的命中率完全没量过**——§7.3 的探针就是为这个建的。在探针跑绿之前，
    §4.3 的推荐是**有论证的推荐，不是有数据的结论**。
  - 本文只覆盖**视频**模式选择。图片模型的模式选择（`resolveStoryboardImageDefault`
    今天靠 `gpt-image → nano-banana → 第一个` 的名字匹配，`availableModels.ts:150-152`）是另一刀。

---

## 附录 A：§4.1 数字的复跑脚本

```ts
// 存成 probe.mts，在装好依赖的 worktree 里 `node_modules/.bin/tsx probe.mts`
import { sourceBackedVideoProfiles } from "./electron/shared/videoCapabilities/registry";
const list = sourceBackedVideoProfiles() as any[];
console.log("archetypes:", list.length);                      // 38
let modes = 0, slots = 0, params = 0;
for (const a of list) { modes += a.modes.length;
  for (const m of a.modes) { slots += (m.slots??[]).length; params += (m.params??[]).length; } }
console.log(modes, slots, params);                            // 104 120 401
console.log("full JSON bytes:", JSON.stringify(list).length); // 125189

// 手册体积：**调生产那个函数本身**，不要在这里抄一遍它的渲染逻辑——抄一份就会漂，
// 而这份数字的全部意义正是「生产码今天真的吐什么」。
// （`buildAgentModelEntries` 吃 catalog 的 ModelOption[]，探针里按档案造最小 option 即可。）
import {
  buildAgentModelEntries,
  formatAvailableModelsForPrompt,
} from "./src/workbench/generationCanvas/agent/availableModels";

const options = list.map((a: any) => ({ value: a.id, modelKey: a.id, label: a.label, kind: "video" }));
const manual = formatAvailableModelsForPrompt(buildAgentModelEntries(options as any));
console.log(est(manual));   // 10829 bytes / ~3078 token（CJK 1 tok/字 + 其余 4 字符/tok）
// C1 就在 availableModels.ts:210-211 的 `opts ? \`${p.key}[${opts}]\` : p.key`：
// min/max 型控件的 options 为空 → 渲染成裸键名。跑一次就能在输出里看到裸的 `duration`。
```

C1 / C2 的计数脚本（`c1.mts`）：

```ts
import { sourceBackedVideoProfiles } from "./electron/shared/videoCapabilities/registry";
const list = sourceBackedVideoProfiles() as any[];
let enumForm = 0, minmaxForm = 0, none = 0;
for (const a of list) for (const m of a.modes) {
  const d = (m.params ?? []).find((p: any) => p.key === "duration");
  if (!d) { none++; continue; }
  (d.options ?? []).length > 0 ? enumForm++ : minmaxForm++;
}
console.log(enumForm, minmaxForm, none);            // 32  67  5   （共 104 模式）

let varies = 0;
for (const a of list) {
  const sigs = new Set(a.modes.map((m: any) =>
    JSON.stringify((m.params ?? []).map((p: any) => [p.key, p.min, p.max, (p.options ?? []).map((o: any) => o.value)]))));
  if (sigs.size > 1) varies++;
}
console.log(varies, "/", list.length);              // 17 / 38
```

Token 估算函数（CJK 与其余分开数）：

```js
function est(s){ let cjk=0,other=0;
  for(const ch of s){ const c=ch.codePointAt(0);
    if((c>=0x3400&&c<=0x9fff)||(c>=0xf900&&c<=0xfaff)||(c>=0x3000&&c<=0x303f)||(c>=0xff00&&c<=0xffef)) cjk++; else other++; }
  return { bytes: Buffer.byteLength(s,'utf8'), tokens: Math.round(cjk + other/4) }; }
```
