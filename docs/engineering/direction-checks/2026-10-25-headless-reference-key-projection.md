# 2026-10-25 headless 参考键投影方向复盘

### 0. 一句话根因

headless 投影把「body 模板引用的键」当成了「参考槽」，只看键名正则，没有在已有的参数类型 / 参考槽声明边界上做类型判定，所以同一类误判会随供应商字段名继续出现。

### 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| `af998f85d`（10-16，线上型号名由连接契约决定） | 出站模型名归属分散在连接、档案和目录判断 | 供应商映射的类型 / 所有权边界漂移 |
| `3fa0516f9`（10-16，线上模型名 owner 挪进档案目录） | owner 与调用方各保留一份判据 | 同上 |
| `4b290721c`（10-23，型号名按供应商作用域解析） | 共享档案与供应商映射的职责没有在结构上收口 | 同上 |
| `e3780dc75`（10-23，型号名来源表挪进目录层） | 读面与目录层的事实来源分散 | 同上 |
| `95cb7c875`（10-24，判据合一） | 两条判据最终才共用 op 声明 | 同上 |
| `cf98f0976`（10-25，参考 URL 参数层序列化） | 参考出站边界继续在 `taskParams.ts` 增加规则 | 同一热点文件 / 参数投影类 |

本任务命中：`taskParams.ts` 近 14 天已有 3 个 fix，这一刀是第 4 个；概念「一行发给供应商的型号名从哪来」4 个文件近 14 天已有 6 个 fix，这一刀是第 7 个。

### 2. 为什么这一类会一直出现

`bodyReferencedParamKeys` 只负责从 `{{request.params.X}}` 模板取键（`electron/catalog/paramTranslate.ts:275-283`）；`classifyReferenceKeyDetailed` 再用 `/video|audio|voice|image|img|frame/` 猜族（`electron/catalog/referenceReachability.ts:123-153`）。`projectReferencesOntoBodyKeys` 直接消费这个猜测（`electron/catalog/taskParams.ts:637-665`），而已有的 `ModelParameterControl.type`（`electron/shared/videoCapabilities/types.ts:9-31`）和 `ArchetypeReferenceSlot.inputKey`（同文件 `:33-51`）没有进入这条边界。

| 铁律 | 结论 | 最小证据 |
|---|---|---|
| ⑩ 说的=摆的 | 违反：调用方表达的是图 / 视频 / 音频参考，投影却把 URL 放进开关、数量或音色参数 | `electron/catalog/referenceKeyProjectionCensus.test.ts` 的当前已知错断言；真实目录证据 `docs/evidence/2026-10-25-reference-key-census/census.json` |
| ⑪ 能选到 | 部分具备但未贯通：档案已有 typed slots / params，headless 投影没有消费它们 | `electron/shared/modelArchetypes/referenceKeys.ts:51-67`、`src/workbench/generationCanvas/nodes/controls/archetypeMeta.ts:689-755` |
| ⑫ 点了=以为的 | 不适用：本轮问题发生在无 UI 的 headless/MCP 请求投影，不是点击目标误导 | — |

### 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 新的驼峰或裸开关名（如 `generateAudio`、`audio`）会继续绕过下划线前缀排除 | 给真实 mapping body 加入同形键，跑 `pnpm exec vitest run electron/catalog/referenceKeyProjectionCensus.test.ts` |
| 任何带 `image` / `video` / `voice` 词的尺寸、数量、音色参数都会扩大误判集合 | 重跑 `pnpm exec tsx scripts/reference-key-census.ts --out docs/evidence/2026-10-25-reference-key-census/census.json`，比较 `falsePositiveKeyNames` |
| 同族没有声明槽的 mapping 会把 URL 投到 body 中第一个“像参考”的键 | 复现测试中的 Agnes body 变体，并检查投影 overlay 是否仍出现 `video_start_seconds` |

### 4. 靶子独立性检查

普查使用真实 `applyBuiltinSeeds` 目录、`bodyReferencedParamKeys` 和档案派生的 `GENERIC_REFERENCE_KEYS`；非参考结论再对照 `ModelParameterControl` 与 mapping wire 字段，未用被测投影结果当 oracle。特征测试只断言当前实现的错误输出，修复后应翻转为“未知类型不投影 / 只投声明槽”。本轮没有评测回滚证据，也没有独立 UI 验收线；用户拍板结构方向后，修复线需要另做独立验收。

### 5. P0：这些是我们独有的吗？现成方案有哪些

参考槽到请求键的语义绑定是 Nomi 的领域约束，已有声明：`ArchetypeReferenceSlot`、`ModelParameterControl`、`headlessReferenceKeys`，以及由它们推导的 `GENERIC_REFERENCE_KEYS`。参数类型本身是通用能力，应继续复用现有 typed controls；供应商 JSON Schema / OpenAPI 只能作为目录录入或校验的来源，不能替代 Nomi 对跨供应商 canonical 槽的声明，且当前 `HttpOperation` 只有模板、默认值和 `paramMap`，没有可直接消费的参数类型字段（`electron/catalog/types.ts:408-465`）。

### 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入声明 | 由 `ArchetypeReferenceSlot.inputKey`、`headlessReferenceKeys` 和 typed parameter controls 派生可投影键；无档案类型的目录行补显式 body 参数声明；未知类型拒绝投影 | 要补齐 mapping 与档案的桥接，处理 generic / 自定义目录行 | 存量无类型 mapping 会暂时失去便利投影，需迁移清单 | **推荐**：已有声明是现成真相源，能从结构上删掉正则猜测 |
| 补正则 | 增加驼峰、裸开关名、布尔 / 枚举 / 尺寸 / 数量黑名单 | 初始改动小，但每个供应商字段都要继续维护例外 | 新供应商的新写法、未命名字段和复合键仍会漏；类型信息永远不完整 | 不推荐 |
| 重写（限一个模块） | 在 `taskParams.ts` 内重写一套键名 + 值形状判定 | 仍需复制档案 / mapping 事实，迁移后有两份 owner | 规则看似集中，实际与档案继续漂移 | 不推荐 |
| 删 headless 投影 | headless 调用方必须显式给 mapping 的参考键，主进程不再猜 | 破坏现有 `referenceImages` / `referenceAudioUrls` 便捷契约，调用方负担显著增加 | 安全，但会把能力退回每个调用方自管，容易产生另一套键表 | 仅作为无法补齐声明时的保守退路 |

### 7. 用户要权衡的核心

要保留 headless 的“只给参考即可生成”，就必须把参考槽 / 参数类型声明接到投影边界；否则只能用更安全但更繁琐的显式键契约。

### 8. 拍板（2026-10-25）

本轮采用“只认声明过的参考位”：headless / MCP 仍可只给参考素材，但主进程只把素材投到 body 模板引用、共享声明表登记且媒体类别相符的键；没有同类声明位就拒发，并要求调用方显式写参数名。为此删除按键名猜测的正则分类，不保留兜底，也不为单个接入方式增加例外。已有档案槽、headless 键、翻译输入键、合并槽和别名组继续由一张带媒体类别的声明表派生。

### 特征测试清单（动结构前先锁住）

- `electron/catalog/referenceKeyProjectionCensus.test.ts`：真实 246 条 seeded mapping，锁住 135 条命中、26 条目录行、12 个误判键。
- 同文件：真实 KIE HappyHorse `audio_setting`、RunningHub `generateAudio`、APIMart Kling `audio` 的音频 URL 错投断言。
- 同文件：真实 fal GPT Image 2 文生图 `num_images` 的图像 URL 错投断言。
- 同文件：由真实 Agnes 2.5 body 派生的“无声明视频输入”变体，锁住 `video_start_seconds` 的视频 URL 错投；完整真实 body 仍有 `videos` 声明槽，普查中单列其余两个数值 / 开关键。

## 第 2 轮复盘（2026-10-25，验收 V-mo64）

验收发现：声明表已经能阻止控制键误投，但把跨模型同名键的 `multiImage` 合并结果直接当成目录承载力。于是火山 Seedance 2.0 / 2.5 的 `volcengine_image_contents` 被报成单图，RunningHub Seedream 4.5、Nano Banana、GPT Image 2 的 `imageUrls` 被报成多图；前者少报能力，后者可能多发参考并花错钱。

### 选项

| 选项 | 做法 | 代价 | 结论 |
|---|---|---|---|
| A | 每个模型先读自己的档案槽 `max` / `asArray`；模型没有对应声明时才回落到键名形态。发送前超过 `max` 直接拒发。 | 目录、headless 投影和拒发建议都要带模型身份；无声明的自定义键继续要求显式参数名。 | **用户 10-25 选 A** |
| B | 继续按全局键名合并，只修火山对象数组和 RunningHub 三行特例。 | 仍有第二份跨模型事实；下一个同名键或版本会再漂移，且无法统一拒发上限。 | 不选 |

本轮按 A 收口：`referenceKeyCapacityDeclarationFor` 以选中模型的档案槽为首要来源，目录 `bodyReferenceSupport`、headless 投影和模式建议共用它；没有模型声明才使用键形态推断。headless 参考数量超过模型槽 `max` 时在模板投影前抛出“这个模型最多收 N 张/个类别参考”，不截断、不发网。普查新增容量来源、容量值及模型声明/无声明统计；类测试遍历全部目录行，并保留一个把全局 `imageUrls` 多图声明改回来的红反例。
