---
status: active
owner: reference-chain
date: 2026-09-08
---

> ✅ 已交付 · 2026-09-08

# 参考图链路根因：「连了参考图却没用上 / 发不出去」

用户原话：「Agnes 2.1 链接了参考图结果没传入，这个太恶心了……群里太多人说 GPT Image 2 失败呀、
Agnes 什么也失败。」主线是**用户自己接入的中转/供应商**（New API / 各种 OpenAI 兼容自建端点），
APIMart 作对照；Agnes 是独立供应商，单独查。

## 先查别人

实施前先查「这套判断仓里/生态里是不是已经有了」——结论是**判据本体仓里已经有，缺的只是把它
架到 CI 上**，所以本轮**不新写任何可达性判断**，只新写一个调用既有判据的门岗。

- **仓库里已有（判据本体）**：`electron/catalog/referenceReachability.ts:62` `modeSlotReach`
  已经是「档案槽 × 渠道 body」的唯一判据（UI 收窄与生成时拒发共用）。本门岗**直接调它**，
  不另写一把尺子 —— 门岗一把尺子、UI 另一把，正是它本该拦住的病。
- **仓库里已有（运行时防线）**：`electron/catalog/taskParams.ts:398` `unreachableReferenceLabels`
  （第三闸）已在生成前拒发发不出的参考，零扣费。缺口是它只在**运行时**、且拿不到 body 时
  fail-open（`electron/runtime.ts:363` 对 custom call 传 `undefined`）——所以要补的是**构建期**那一层。
- **仓库里已有（相邻门岗，但管的不是同一件事）**：`scripts/check-orphan-mapping-cables.ts:58`
  查 modeId 拼写 / 路由错桶 = 「线缆选不选得中」；本轮要查的是选中之后「槽里的东西上不上得了车」。
  两者判据不重叠，实测前者全绿而后者断了一条。
- **仓库里已有（投影与渲染）**：`src/workbench/generationCanvas/nodes/controls/archetypeMeta.ts:692`
  `buildArchetypeInputParams` 与 `electron/catalog/taskParams.ts:149` `taskTemplateParams`
  就是生产的投影/渲染路径，门岗原样复用它们种槽、渲染 body，不重建一份模拟。
- **生态里已有？**：这是本仓自有的「供应商无关档案 × 各家 wire 模板」两层结构派生出的对账问题，
  没有现成开源件可直接用；能借的通用做法是「契约测试（consumer-driven contract testing）」的思路
  —— 即用**双方各自的真实产物**对账、而不是各写各的断言，本门岗正是照这个思路做的。
- **结论：用已有 + 只补一层。** 判据、投影、渲染全部复用既有生产函数；新增的只有
  `scripts/check-reference-outbound-contract.ts` 这层「在 CI 上把两侧对起来」的编排。

## 一、六段链路（以自建接入路为主线）

| 段 | 干什么 | owner / file:line | 自建接入路 | 今天有没有测试 |
|---|---|---|---|---|
| ① 画布边 → 参考槽 | 边/上传 → 分族列表 | `src/workbench/generationCanvas/runner/generationReferenceResolver.ts:116` | 同主线 | ✅ `catalogTaskActions.test.ts:103/131`（边序 → `reference_image_urls`） |
| ② 模式 × 能力矩阵 | 模式决定请求形状；提交前按活边自动纠正模式 | `generationRunController.ts:217` `reconcileNodeModeWithConnectedReferences`；`channelModeReach.ts:59` | ⚠️ **自建中转查不到 mapping → `bodyResult===undefined` → fail-open 不收窄**（`channelModeReach.ts:27`） | ✅ 收窄判据有单测；⚠️ **fail-open 分支本身没有「那用什么兜」的测试** |
| ③ 槽 → 请求字段（**the join**） | `slot.inputKey` → `request.params.X` | `archetypeMeta.ts:692` `buildArchetypeInputParams`；标准键 `archetypeInput.ts:25`；`taskParams.ts:149` | 同主线 | ✅ 单测充分；❌ **没有任何「档案键 vs 各渠道 body 键」的跨侧对账门岗** ← 本轮补 |
| ④ 供应商适配 / 出站 | 模板 body / multipart / chat 多模态 | `newapiTransport.ts:93/118/143`（三协议）；`builtinOpenAiCompatibleDraft.ts:126`；`agnesImages.ts` | **主线**：协议由 `smartDefaultImageEditProtocol(modelKey, modelAlias)` 选（`newapiTransport.ts:210`） | ✅ `newapiImageEdit.test.ts:32/53/93`、`multipartOperation.test.ts:47`、`relayConformance.integration.test.ts:403`（真字节）；❌ **alias 选协议没测** |
| ⑤ 图片本身 → URL/字节 | 本地文件 → 上传拿 URL / 直读字节 | `assetIngestionRegistry.ts:12` curated（kie/apimart/modelscope/fal/runninghub）；`assetLocalization.ts:733` 候选链 → 借道 → `ANON_UPLOAD_CHAIN`（需同意） | ⚠️ **自建 vendor 与 Agnes 都不在 curated 表**，靠借道/匿名链 | ✅ multipart 直读字节有测；⚠️ 借道/匿名链失败的用户可见性弱 |
| ⑥ 响应 → 产物 → 节点 | 回包解析、失败判定 | `artifactProjection` / `imageRouteFallback.ts:46` | 同主线 | ✅ 有测 |

**第三闸**（`taskParams.ts:398` `unreachableReferenceLabels` ← `runtime.ts:363` `imageEditGuardError`）
是今天唯一的运行时防线：判据完全 derive（body 引用的 `{{request.params.X}}` 渲染后含不含这条参考 URL），
不 hardcode 任何 vendor。它挡住了「静默扣费」，代价是把断掉的 join 变成**硬失败**。

## 二、假设 A–D 裁决

- **A（槽 → 字段没有机器可验合同）——证实。** `modeSlotReach` 只在运行时给 UI 收窄用；
  CI 侧只有 `check:orphan-cables`（查 modeId 拼写 / 错桶），**不查槽键 → body 键**。
  逐槽出站探针（64 个「UI 承诺发得出」的槽）实测违约 1 条，是真 bug：
  `fal/openai/gpt-image-2[i2i]` 档案声明 `input_urls`（KIE/APIMart 契约名，`gptImage2.ts:63`），
  fal 的 body 却读 `{{request.params.image_urls}}`（`falOfficial.ts:94`）→ **0/2 张送达**，
  第三闸拒发。= 群里「GPT Image 2 失败」。→ **本轮补门岗 + 修这条。**
- **B（没有「这次带了几张图」的用户可见证据）——证实但降级处理。** 今天只有否定信号
  （拒发文案、`channelSingleReferenceOnly` 徽标），没有从出站报文事实派生的肯定回执。
  属用户可见改动，按 P5/R8 需样张拍板，本轮**只落数据层**（门岗把事实算出来），UI 行留给拍板后。
- **C（模式与能力错配没有前置校验）——证伪。** `reconcileNodeModeWithConnectedReferences`
  已挂在唯一提交咽喉（`generationRunController.ts:217`），停在 t2i 的节点会被自动切到收得下的模式。
- **D（自建中转探测只探模型列表）——部分证伪。** 认证探针会**真注入一张参考图**
  （`relayConformance.integration.test.ts:363` 有真字节证据）。但探针用的 `modelKey` 丢了
  `modelAlias`（`builtinOpenAiCompatibleDraft.ts:151`）→ **协议选错**，见下。

## 三、根因（两条，都在最早共享边界）

1. **③↔④ 的 join 没有 CI 对账。** 档案（供应商无关）与 mapping body（各家自己的字段名）两侧各自
   自洽、各自的测试都绿，只有把两侧对起来才看得见断线。fal gpt-image-2 就这么发了出去。
2. **自建接入路的协议选择丢了 `modelAlias`。** `newapiImageEditProfileForModel` 明确按
   `[modelKey, modelAlias]` 两个身份选改图协议（`newapiTransport.ts:211`），但
   `builtinOpenAiCompatibleDraft.ts:151` 在造说明卡时只传了 `modelKey`。中转上把模型登记成不透明
   id（`custom-1`）而 alias 才是 `gpt-image-2` 的用户，会被判成 chat 协议 → 中转如实回 400
   「not supported on the Chat Completions endpoint」= 群里「自建中转参考图模式发不上去」。

## 四、修法（不动 `electron/agentLane/**`、`src/workbench/ai/lane/**`）

1. **新门岗 `check:reference-outbound-contract`**（`scripts/check-reference-outbound-contract.ts`）：
   对 seed 后的内置目录，逐 (vendor, model, mode, slot) 种一张合成 URL、渲染**真实** create body，
   断言「`modeSlotReach !== 'none'`（= UI 承诺发得出）的槽，其 URL 必须出现在出站报文里」。
   `reach === 'none'` 的槽 UI 已经收窄=诚实，不在合同内（否则会误伤 runway veo3.1 尾帧、
   grok 单图这类**真实能力上限**）。**一次只种一个槽**，隔离单图聚合位的抢占。
   判据全部复用生产函数（`buildArchetypeInputParams` / `taskTemplateParams` / `renderTemplateValue`
   / `modeSlotReach`），不另写一把尺子。**硬零**：实测存量违规 1 条，修完即 0。
2. **修 `falOfficial.ts:94`**：`image_urls: p("image_urls")` → `p("input_urls")`。
   wire 字段名仍是 fal 的 `image_urls`，读的 param 换成档案的契约键（与同文件 seedance omni
   `image_urls: p("reference_image_urls")` 同款写法）。
3. **修 `builtinOpenAiCompatibleDraft.ts`**：把 `modelAlias` 一路传到
   `newapiImageEditProfileForModel`，让自建中转的 alias-only 模型选对改图协议。

## 五、不动项 / 回滚

不动：第三闸语义、`modeSlotReach` 判据、UI 收窄口径、任何 agentLane。
回滚：三处改动互相独立，各自单 commit 可回退；门岗回退即删 package.json 一行 + 脚本。

## 六、验收门

- 门岗先验会红（R17）：把 fal 那一 token 改回去 → 门岗必须点名那一条。
- 单测：fal gpt-image-2 i2i 出站 body 含两张参考图；alias-only 模型选到 multipart 协议。
- `pnpm run gates`。
