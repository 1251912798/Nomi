# 方向检查：一行发给供应商的型号名——两份判据合成一份（2026-10-24）

> 触发：`node scripts/fix-churn.mjs` 命中——文件 `electron/catalog/modelNameSource.ts`（14 天第 3 个 fix）、`electron/catalog/newapiTransport.ts`（第 4 个）、`electron/runtime.ts`（第 17 个）、`electron/catalog/taskParams.ts`（第 3 个）、`channelModeReach.ts` / `archetypeMeta.ts`（各第 3 个）；目录 `electron/shared/modelArchetypes/`（第 5 个）、`src/workbench/generationCanvas/nodes/controls/`（第 4 个）；概念「一行发给供应商的型号名从哪来」「这一次请求发到线上的 model 串」（各第 3 个）。
> 用户 2026-10-24 拍板：救 #1207（分支并 main，不在 main 上重做）+ **判据合一**——目录层的判据换成发送层 owner 的同一个谓词。这改的是 2026-10-23 拍板的判据（「映射模板读 `request.params.model` = 这家接受档案型号名」），用户已同意。
> 取代 `docs/engineering/direction-check-2026-10-16-custom-relay-wire-model.md`（那份早于 #1297，只看到了发送层；留着是因为 #1207 的旧提交 trailer 指向它）。

## 0. 一句话根因

「这一行发出去的型号名由不由档案给」有两份判据：发送层（#1207，op 定义处的 `wireModel: "archetype-selection"` 声明）和目录层（#1297，扫模板文本里有没有 `request.params.model`）。两份对内置家碰巧同答、对自建中转相反，于是变体栏和 Agent 能力清单照档案摆出别家的名字，发送时却只发连接名：同一个问题有两个答案。

## 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 0.23.1 两条应用内反馈（自建中转出图报「没有可用通道」，存量连接） | 渲染层把档案里另一家的拆分名写进 `params.model`，盖掉连接名 | 发出的型号名有两个答案 |
| `b463b0b11`（09-03）中转变体轴接活 | 自建中转 op 改读 `{{request.params.model}}` | 把「模板读了这个参数」当成「这家认档案名」的证据 |
| `af998f85d` `3fa0516f9` `a2e601597`（10-16，#1207） | 发送层收口：op 声明 + `resolveWireModel` 最后写 `params.model` | 发送侧单一 owner；目录侧没跟上 |
| `4b290721c` `e3780dc75`（10-23，#1297） | 目录层按「模板文本读 `request.params.model`」判接受 | 第二份判据：每个自建中转 op 都读它，于是全部判成接受 |
| 10-24 真 App 实测（main，#1207 未合） | 自建中转配 `gpt-image-2`，文生图出站 `gpt-image-2-text-to-image`、改图 `…-image-to-image`、seedance-2 点「快速」出 `bytedance/seedance-2-fast` | 上面两条叠加 |
| `409eaaf96`（10-16，#1213，`newapiTransport.ts`）、`3a0972765`（10-22，参考键表搬家）、`runtime.ts` 上的参考素材 / 结果取回系列 | 中转视频查询合同、自写登记、参考素材交付阶段 | 不同类，只因文件或概念同而计数 |

## 2. 为什么这一类会一直出现

同一个问题在两个粒度上被问：目录行粒度（这一行摆不摆变体 / 方式型号名，渲染层和 Agent 能力清单读它）和请求粒度（这一次发哪个串，发送 owner 读它）。两处各自从不同的事实推答案，只要有数据让两份事实分岔，就出现两个答案。模板文本是实现细节：内置映射、AI 编译的映射、用户手改的映射、旧数据里的映射都可以读 `request.params.model`，文本扫描分不出「这家经过认证会收档案名」和「只是把 model 参数化了」。op 声明只写在内置目录契约的 op 定义处（普查测试锁住：内置目录里引用 `params.model`、服务带变体 / 方式型号名档案的 create op 都声明了；声明只出现在内置家的报文上），用户数据伪造不出来，所以它才是那份事实。

铁律落点：⑪ 能选到——变体栏、Agent 能力清单、宿主视频候选摆出来的选项，必须和发送时真能发出去的是同一份推导；⑩ 说的=摆的——用户在连接里配的型号名（说的）与出站 model（摆的）是同一份事实。证据见下面「特征测试清单」。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证（命令或步骤） |
|---|---|
| 下一个读 `request.params.model` 的映射形状（AI 编译、手改、新中转模板）又被判成接受档案名，界面摆出发不出去的变体 | `npx vitest run electron/parity/vendorScopedModelId.matrix.test.ts`：矩阵里放了一个走真注册 → 暂存 → 升级的自建中转；把判据换回文本扫描，6 格红（档案解析口 4 格：3 个图片行 + 1 个视频行；「不是内置家的连接一律不接受」1 格；Agent 能力清单 1 格）。出站 model 格不红：发送 owner 本来就只认声明，红的正是摆出来的那一侧 |
| Agent 能力清单 / 宿主视频候选再写一份自己的「接不接受」 | `pnpm run check:concept-owners`：合并后的概念登记把文本扫描（`operationReadsArchetypeModel`）和宿主自算型号名（`videoTransportModelIdForPlan`）列为禁用派生 |
| 新内置家忘了在 op 定义处盖章 | 普查测试 `electron/catalog/customRelayWireModel.test.ts`；后果只是少了变体选项（发连接名），不会发错名、不会花错钱 |

## 4. 靶子独立性检查

- #1297 的矩阵合入时 435 格全绿，补一条自建中转后 474 格仍全绿，而这些行实际在发档案名：格子里没有用户自建连接，「这家的作用域」又照被测判据把档案名算进去。尺子对这一类结构上是盲的。
- 这次改靶子：①矩阵里加真注册流程建出的自建中转；②作用域的「内置家」由内置供应商种子表判（`builtinVendorSeed`），不问被测判据；③宿主段、画布段都核真正出站的 model（引擎 B 的供应商请求体、`templateContext` 的 `request.params.model`），末尾一格防「全部跳过」的空转。
- 有没有「修对了反而掉分」：有。10-23 的判据让自建中转多出变体栏，界面上看「选项更多」；合一后这些选项消失，是修对了。

## 5. P0：这些是我们独有的吗？现成方案有哪些

「档案的模式 / 变体 + 连接契约 → 线上型号名」是 Nomi 的领域映射（档案、渠道目录、映射都是我们自己的数据），没有现成库能替代。这一刀只删代码（文本扫描、#1207 的变体栏特判字段），不新增自写；模板渲染、HTTP、OpenAI 兼容协议沿用现有实现。

## 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 无适用的现成方案（领域映射） | — | — | — |
| 补 | 变体栏、Agent 能力清单、宿主视频候选各加自建中转特判（#1207 原来的变体栏判据就是这条路） | 小 | 第三、第四份判据；每个新入口都要记得再加一次 | 否 |
| 换（判据合一） | 目录层判据换成发送 owner 的同一个谓词 `operationSelectsArchetypeWireModel`；#1207 的变体栏特判同提交删；两个概念登记合成一份 | 小，净删代码 | 旧数据里读 `params.model` 的 AI 编译 / 手改映射同样判为不接受（发送层 10-16 起已经这么发） | **是**（用户 10-24 拍板） |
| 删 | 删掉档案里的线上名 | 内置家的变体 / 方式全坏 | 高 | 否 |

## 7. 用户要权衡的核心

自建中转上不再摆出档案的变体和方式型号名（要用快速档，就在连接里再配一个 `…-fast` 型号），换来「摆出来的每个选项都发得出去」。用户 10-24 已选这一边。

## 特征测试清单（动结构前先锁住）

- `electron/parity/vendorScopedModelId.matrix.test.ts`：扩了自建中转行与 Agent 能力清单格；旧判据 6 红（531 条里）/ 新判据全绿。
- `electron/catalog/customRelayWireModel.test.ts`：发送侧按入口逐一比出站 model，#1207 修前 14 条里 12 红 2 绿（2 绿是内置 kie 的正向对照；搬到 main 上同样 12 红）。
- `src/config/modelIdentity.channelMerge.test.ts`、`channelModeReach.test.ts`：变体栏回到 main 的三态 fail-open 语义，自建中转不靠这里拦。
