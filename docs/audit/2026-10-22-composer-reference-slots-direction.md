# 方向检查：生成框参考图「在不在用」没有唯一主人（#1269，D-b1a-refslots）

> 触发：PR #1269（feat/composer-b3）独立验收 V-b1a 第 2 次不过（= 同线第 3 轮修补，RW）。本线只做复盘和特征测试，不修 bug。
> 验收报告：`D:/Nomi-coord-state/reports/V-b1a-r2.md`。特征测试：原 `referenceInUseIsSent.characterization.test.ts`，重写合 main 后全部转绿并并入 `src/workbench/generationCanvas/runner/referenceSentWithinInUse.property.test.ts`。
> `node scripts/fix-churn.mjs` 对 catalogTaskActions / reassignUploadedImages / archetypeInput / taskParams：未命中热点（触发来自轮次，不来自 14 天计数）。

## 0. 一句话根因

「这张参考图现在在不在用」没有唯一主人：图住在哪个存储键（`firstFrameUrl` / `lastFrameUrl` / `referenceImageUrls`）本身就代表它落哪个槽，于是界面、节点数据、请求组装、主进程四处各算一遍——换模型 / 换方式时只能去**搬数据迁就槽位**（搬家、暂存、放不下就删），而发送路径又把所有存储键整包带走（`...meta` 只加不清，主进程首帧优先挑单图），界面标的和发出去的必然分家。

假设核实结果：成立，而且比假设更宽——
- 改 `modeId` 的写入口有 **20 处**（door-map `applyArchetypeModeSwitch`），只有 2 处（手动切方式、换模型）走了搬图；其余 18 处切了方式、图留在旧键里。
- 搬图本身还会**反过来决定方式**：30 张换到 Veo 3.1 再切回，被暂存进首 / 尾帧键的第 4、5 张被当成「首尾帧需求」，节点落成首尾帧方式，原来的第 4、5 张成了首帧、尾帧。
- 同一模型内切方式也会删图（HappyHorse 切「编辑」少 2 张，Wan 2.7 切「图生视频」少 1 张）。

## 1. 归类表

类 A = 槽位语义写在存储键上（换模型 / 换方式只能搬数据）；类 B = 同一事实多处各算（界面 / 发送 / 主进程各一份）。

| bug | 直接原因 | 类 |
|---|---|---|
| R1-1 切方式丢参考 | 图留在旧方式的存储键，新方式不读 | A |
| R1-2 换模型丢首尾帧、被改成文生视频 | 按新档案挑方式时没看上传图，图留在旧键 | A |
| R1-3 方式名标错 | 方式名按槽种另算一份，和档案声明分家 | B |
| R1-4 首尾帧满额「+」不灰 | 容量判断读的数和槽里显示的不是同一份 | B |
| R1-5 分镜行最窄档截字 | 布局 | 不归本类（纯布局） |
| R2-N1 「未用到」的图进请求，花错钱 | 组装 extras 先 `...meta` 整包展开、只加不清；主进程 `referenceInputParams` 把残留键翻成 snake 键，`firstReferenceImage` 首帧优先；契约只写在注释里 | B（由 A 的暂存放大成常见路径） |
| R2 换模型删 25 张、切回找不回 | 只有 3 个存储位置能表达「未用到」，装不下就删 | A |
| 本线测出：141 个「档案 × 方式」格里 79 格漏（50/59 个档案），含**文生方式**发参考图 | 同 N1 | B |
| 本线测出：连 3 张图进首尾帧，界面 1 张在用，3 张作为 `reference_images` 发出 | 连线图进标准参考面不按方式门控 | B |

## 2. 为什么这一类会一直出现（落到铁律）

- 表示层：「有序参考列表」和「槽位分配」被压成了同一件东西（存储键）。只要换模型 / 换方式，就得改数据；改数据的入口有 20 个，每个都得记得搬，记不住就丢或漏。
- 方向层：界面是「从数据推导在用」，发送是「把数据全带上再按键过滤」——一个白名单、一个黑名单，黑名单每多一个读口（APIMart 投影直接认 `referenceImageUrls` / `firstFrameUrl`、上传白名单 `activeAssetUrls`、托管同意卡）就多一个漏点。

| 铁律 | 本例 |
|---|---|
| ⑩ 说的=摆的（主线） | 推广为「界面标的 = 发出去的」：界面标「未用到」，请求里却有它。证据 = 特征测试的性质条（141 格 79 格不一致）。 |
| ⑫ 点了=以为的 | 点「换模型」以为是比一比，实际删图且切回找不回；点「同能力替换」「派生」更是静默删。 |
| ⑪ 能选到 | 次要：20 个换方式入口各写一遍规则，是同一形状的「入口没覆盖」。 |

来源是独立验收不是用户，不进逃逸账本。

## 3. 不改结构，接下来会冒出什么

| 预测 | 怎么验证 | 状态 |
|---|---|---|
| 连线进来的图：首尾帧方式下多出的连线图照样发出 | 特征测试「连 3 张图进首尾帧」 | 已验证（钉住） |
| MCP `canvas.write` 的 `metadata` 原样进 meta、旧工程残留首帧键、18 个不搬图的换方式入口，都会落成「文生方式 + 残留首帧」，主进程把它当 `image_url` 发 | 特征测试「文生视频方式下残留一张首帧」；入口见 `applyCanvasToolCall.ts`（`node.metadata` 透传）| 形状已验证；MCP 真链路 unverified |
| 分镜多选「统一模型」之后落画布、「同能力替换」、「派生」换模型时静默删图（不提示）；`useSameCapabilityAlternative` 还把 `changeset` / `uploadsDropped` 当节点字段写进去 | 对 `useSameCapabilityAlternative.ts:40`、`deriveFromNode.ts:203` 各写一条：5 张 → Kling 3.0 后数参考、看节点多出的字段 | 读码得出，unverified |
| 「未用到」的本地图进上传白名单 `activeAssetUrls`，会被上传 / 托管，托管同意卡也按它算 | 特征测试里泄漏键已含 `activeAssetUrls`；同意卡走 `generationRunController.buildConsentNode` | 白名单已验证，同意卡 unverified |

## 4. 靶子独立性

- 前两轮的测试（`modeSwitchRequestBody.test.ts`、`reassignUploadedImages.test.ts`）是实现线自己写的，只量 `archetypeInput`——而它本来就按当前方式过滤，所以永远绿；漏的是它旁边那层标准参考键。量错了层，不是量错了数。
- 本线的「在用」尺子取 `resolveReferenceSlots`（参考行真用的函数），独立于发送路径。已知偏差：渠道只收单图时界面把槽上限收成 1（`NodeParameterControls` 的 `slotReachByKey`），`resolveReferenceSlots` 不知道——这类渠道上尺子偏宽。重写时渠道上限要进同一个推导函数。
- 没有「修对反而掉分」的先例。

## 5. P0：是我们独有的吗

- 独有：参考按模型 / 方式落哪个槽、连线在前上传在后、①②③ 和 `character{N}` 对齐、只发在用的图（按镜头花钱）。`runner/`、`nodes/` 在 `self-written.json` 的领域目录里，没有命中自写登记。
- 通用部分只是「有序列表按类型和容量贪心分进槽」几行纯函数，没有值得接的库（没找到专做这件事的包）；「存原始、派生显示」是 Zustand 本来的用法，不新增依赖。
- 能接现成的：性质测试的随机输入用已在依赖里的 `fast-check`（^4.8.0）。

## 6. 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 无现成的槽位分配库；派生状态、fast-check 并入「重写」 | — | — | — |
| 补 | `buildReferenceExtras` 对有档案的模型，把当前方式没声明的参考键显式置 `undefined`，让主进程注释变真；连线图的标准参考面按方式门控；性质测试转正。搬家 / 暂存 / 删图照旧 | 2–3 个文件 + 测试，约半天 | 只堵发送侧。换模型照样删 25 张、切回变首尾帧；18 个不搬图的入口照旧；`activeAssetUrls`、APIMart 投影、托管同意卡要各补；下一个新读口还会漏。和协调定的「一张不丢」方向冲突 | ✗ |
| **重写（限一个模块）** | 节点上一份有序参考列表 + 一个纯函数（参考列表、连线、档案、方式、渠道上限 → 各槽位 + 未用到）。界面（槽、未用到、「+」满额、方式名、@ 编号）和请求（档案输入、标准参考面、上传白名单、托管同意）只从它来；`buildReferenceExtras` 不再 `...meta` 带参考键；换模型 / 换方式不改参考列表，删掉 `reassignUploadedImages` 的搬家、暂存和「N 张没带过来」；旧数据（三个存储键、`referenceImages`、MCP metadata）读入时归一成这份列表，只有一个读口；主进程不再从 camel 首帧兜 `image_url`，未声明的参考键 fail-closed；性质测试常驻 CI | 约 12–15 个文件：reassignUploadedImages（删）、referenceSlots、referenceRowModel、archetypeMeta、catalogTaskActions、generationReferenceResolver、buildNodeModelChangePatch、NodeParameterControls、referenceWrites、parameterReferenceSlots、slotFileUploads、迁移读口、electron archetypeInput / taskParams。入口：写约 9 类、读约 14 处 → 1 个写口 + 1 个推导函数。1–2 天 | 存量工程迁移（首尾帧旧节点按「首帧、尾帧、其余」排成列表）；首尾帧「换位」变成列表换序；「连线在前」规则要保住；#1269 再晚 1–2 天，实验室格和走查要重跑 | ✅ |
| 删 | 去掉「未用到」：放不下的直接删并提示 | 最小 | 违背协调方向（不可逆丢工作），发送侧泄漏照样要修 | ✗ |

推荐「重写」，在 #1269 上做：暂存和删图是本 PR 引入的，新结构同一提交删掉 `reassignUploadedImages`（P1 加新必删旧）。特征测试的 `it.fails` 全部改回 `it`、删掉「现状钉」，就是这次重写的验收线。

## 7. 用户要权衡的核心

#1269 再晚 1–2 天，换一个「图永远不丢、标在用的才发」的结构；还是今天补一刀堵住花错钱，接受换模型照样丢图、下一个入口照样漏。

## 为什么前两轮没想到

- 验收清单和测试只看渲染层投影（`archetypeInput`），没有一条跨层性质；界面标的和发出去的从没被放在同一个断言里比过。
- 主进程对渲染层的契约（「残留键已置 undefined」）只写在注释里，没人核。
- 怎么补：①门岗——本文件的性质测试转正后常驻 CI（全部档案 × 每个方式，加档案自动覆盖）；②结构——主进程遇到当前方式没声明的参考键直接拒（fail-closed），注释契约变成断言；③清单——花钱类设计卡和独立验收清单加一条必填：「发出去的图片地址 ⊆ 界面在用」，证据必须是跨渲染层和主进程的串联测试，不收单层构造函数测试。

## CI 三项红（只记录、不修）

- Unit (3)：`tests/ux/asset-tile-badges-visible.test.mjs`「平时 × 看不见」，测试在注入样式后立刻读透明度，撞上 `transition-opacity` 半路（0.055 > 0.01）。本 PR 引入的时序问题。
- Canvas Acceptance (1)：`group-baseline.walk.mjs:127` 点「文生图」超时 30s，`group-reference-direction` 断言「改图」——两条旧走查还按 B3 之前的界面找东西（job 日志：`canvas-full 1/2: FAIL (6/8)`）。
- E2E (2)：`real-user-test-gates FAILED: 8 passed, 1 failed`，日志不写是哪条；具体在制品 `tests/system/runs/2026-10-22T07-28-39.529Z-real-user-journeys/report.md`，本线没下载制品，**未定位**。

## 特征测试清单

`src/workbench/generationCanvas/runner/referenceInUseIsSent.characterization.test.ts`（22 条：12 过、10 条 `it.fails`）：
- 报告 (b) 三场景：5 张 → Veo 3.1、5 张 → Kling 3.0 / Wan 2.7、3 张切首尾帧。
- 性质：全部档案 × 每个方式（141 格）发出去的 ⊆ 在用；在用 ∪ 未用到 = 原来那一份。
- 预测：连线进首尾帧、文生方式残留首帧。
- 往返：30 张 → Veo 3.1 → 切回。

## 附录：门（door-map + grep，2026-10-22，HEAD 4e8659fbf）

写（改参考存储键或改方式）：
- 搬图 `reassignUploadedImages`：NodeParameterControls（手动切方式）、buildNodeModelChangePatch。
- 换模型 `buildNodeModelChangePatch`：NodeParameterControls（有提示）、useSameCapabilityAlternative（静默）、deriveFromNode（静默）。
- 改 `modeId` `applyArchetypeModeSwitch`：20 处——spendCardReferences、canvasReferenceConnection、referenceInputSlots、buildNodeModelChangePatch×2、archetypeMeta（ensureArchetypeNodeMeta）×2、generationModePresentation、attachCameraMoveToTarget、NodeGenerationComposer、NodeParameterControls×2、useNodeMentionSource、useNodeModelAutoSelect、nodeTryRecipes、generationRunController、referenceSlots、runProjectDelivery、canvasAutoReference、canvasGraphActions。
- 写槽 `parameterReferenceMetaPatch`：parameterReferenceSlots、referenceInputSlots、referenceWrites、reassignUploadedImages；上传 slotFileUploads。
- 旧数据：referenceImageUrlsToEdges、projectV51ToV60Migration。
- MCP / Agent：applyCanvasToolCall 的 `node.metadata` 原样进 meta。

读（决定「在用」或「发什么」）：
- 界面：resolveReferenceSlots（16 处读）、computeReferenceRowModel、uploadedImageUrls、NodeParameterControls 的 assetValuesByKey。
- 渲染层发送：resolveGenerationReferences（10 个文件读，meta 首帧兜底不分方式）、buildReferenceExtras（`...meta` + 标准面）、buildArchetypeInputParams、orderedSent*（@ 编号）、resolveTaskKind（首帧 → 图生视频）、collectLocalAssetUrls → activeAssetUrls、buildConsentNode / hasLocalAssetReference（托管同意）。
- 主进程：referenceInputParams、firstReferenceImage / allReferenceImages、taskTemplateParams（`...extras` 整包）、projectReferencesOntoBodyKeys、apimartGenerationProjection（`PROJECTION_KEYS` 直接认 camel 键）、newapiTransport 视频 body `image_url`。

## main 上是否已存在（协调追问，2026-10-22）

**结论：存在，线上就在漏，不依赖 #1269。** #1269 没有制造这个漏洞，只是用「暂存」把它变成了常走的路。删图是 #1269 才有的，main 不删图（30 张换到 Veo 再切回，30 张都还在）。

怎么核的：
- 只读审查树 `D:/Nomi-v-b1a`，detach 到 origin/main `97eab7bec`。它是 3d7f7bb96 的后代，之间只改了画布拖选，和本题无关。
- 临时探针按 main 真实入口串起来：切方式 = `applyArchetypeModeSwitch`；换模型 = `buildNodeModelChangePatch` + `ensureArchetypeNodeMeta`（界面 effect 紧接着做的那一步）；连线 = `resolveGenerationReferences`。
- 之后按 `runtime.ts` 的顺序渲染**真请求体**：`applyHeadlessParamDefaults` → `templateContext` → `buildHttpRequest`。通用中转用 `NEWAPI_VIDEO_CREATE_OP` 和图片 op，APIMart 用 `APIMART_VIDEO_MODELS` / `APIMART_IMAGE_MODELS` 的 mapping。
- 「界面在用」取 `resolveReferenceSlots`。main 没有「未用到」：当前方式没有的槽，参考区**根本不显示**。
- 探针未提交，跑完已删，审查树 `git status` 为空。
- 已发布的 v0.23.2 读码确认是同样三处：`...meta`、首帧优先、中转视频 body 写 `image: image_url`。

| 场景（main） | 界面显示 | 真请求体发出 | 用户看不到却发出、生成照扣？ |
|---|---|---|---|
| 1a 首帧放 1 张 → 切文生视频 | 参考区不显示 | 中转：`image` = 那张首帧（文生被当成图生发）；APIMart：不发 | **是**（中转用户） |
| 1b 首尾帧 2 张 → 切文生视频 | 不显示 | 中转：`image` = 首帧；APIMart：不发 | **是**（中转） |
| 1c 参考 3 张 → 切文生视频 | 不显示 | 中转：`image` = 第 1 张；APIMart：不发 | **是**（中转） |
| 2a 参考 3 张 → 切首尾帧，再放首、尾帧 | 首帧、尾帧 2 张 | APIMart：`image_urls` = 首、尾 + 那 3 张里留下的参考；中转：不发 | **是**（APIMart 官方渠道） |
| 2b 参考 3 张 → 切首尾帧，不放帧 | 首尾帧空着 | 中转 `image` = 第 1 张；APIMart 3 张都发 | 否（首帧必填，生成钮灰）；Agent / 批量绕不绕得过：unverified |
| 3 连 3 张进 Seedance 2.0 首尾帧（APIMart） | 参考区只显示第 1 张（首帧），连线看得见 | APIMart：`image_urls` 带上第 2、3 张；中转：不发 | **是，半可见**（线看得见，参考区说只用 1 张） |
| 4 Seedance 5 张 → Veo 3.1 / Kling 3.0 / Wan 2.7（30 张 → Veo 同） | 落到新模型默认的文生方式，参考区不显示 | 中转：`image` = 第 1 张；APIMart：不发 | **是**（中转） |

规模（同 141 格口径：放满参考起切，按钮灰不灰按「必填槽是否空」近似）：

| 口径 | 漏的格 | 其中生成钮可点 |
|---|---|---|
| 模板参数层（和 PR 上 79 格同一把尺子） | 141 格里 80 格 | — |
| 通用中转真请求体，从参考起切 | 141 格里 51 格 | 24 格（主要是各家文生方式） |
| 通用中转真请求体，从首尾帧起切（视频） | 84 格里 47 格 | 39 格 |
| APIMart 真请求体，从参考 / 首尾帧起切 | 80 格里 19 格 | 7 格：Seedance 2.0 / 2.5 切「全能参考」、MiniMax-H3 / Wan 3.0 切「参考」时首尾帧原样发出；Seedance 2.5 / Wan 3.0 / HappyHorse 1.1 首帧方式发出残留尾帧 |

是否多扣钱：
- 每一格都是真发、真生成，结果被用户看不到的图左右，这一笔照常扣。中转文生被带上图，等于按图生视频发出。
- 单价会不会因此变高：不知道（中转价格未知是常态），记 unverified。

**最小止血改法**（可单独热修，不依赖 #1269）：
- 位置：`src/workbench/generationCanvas/runner/catalogTaskActions.ts` 的 `buildReferenceExtras` 有档案分支（main 约 249–265 行）。
- 标准参考面改成 `orderedSentImageReferenceUrls`，只有当前方式有参考数组时才带，而且截到槽上限；原来是不分方式的 `referenceImages ∪ meta.referenceImageUrls`，还不截上限。
- 当前方式没声明的参考键在 `derived` 里**显式置 undefined**，覆盖 `...meta` 带进来的残留。要清的键：`firstFrameUrl`、`lastFrameUrl`、`referenceImageUrls`、`referenceImages`，以及别名 `referenceImageUrl`、`imageUrl`、`image_url`、`first_frame_url`、`last_frame_url`、`reference_image_urls`、`reference_images`、`firstFrameRef`、`lastFrameRef`。
- 只改发出去的东西，不动 meta，用户的图一张不丢。
- 我在审查树上原型验证过（约 10 行，验完用备份还原）：上面四种口径全部降到 0 格，四个场景全部 0 漏；`runner/`、`nodes/`、`model/` 下 272 个测试文件、3010 条全过。
- 热修还要补三样：
  - 视频 / 音频同类键（`referenceVideoUrls`、`sourceVideoUrl`、`referenceAudioUrls`）照此清，本次没探；
  - 把本文件的性质测试改到 main 能跑的形状，常驻 CI；
  - `electron/catalog/archetypeInput.ts` 文件头那句注释由此变真，或者改成主进程断言。
- 这一刀等于第 6 节的「补」，只是先止血；结构仍按「重写」走。
