# 设计卡：拆解转写腿——「哪些模型能转写」只有一个答案

```
改动名：拆解转写腿按模式解析 + 转写出口统一句段 + 评测量具补盲    线/负责人：fix/deconstruct-transcribe-leg（子线）    类别：[花钱][其他]
```

起因（2026-10-18 真付费评测）：`talk-mixed`（40 s 中英混口播）每一镜对白为空，`failureReason` = 「对白没取到：这台机器上还没有可用的转写模型」，转写调用 0 次；自动与显式 `elevenlabs/scribe_v2` 两种都一样。

查实的原因（不是猜）：

| # | 现象 | 查实 |
|---|---|---|
| 1 | 评测里「没有转写模型」 | 量具盲区：`run.mjs` 只把**读图模型**交给 `openPaidWalk` 授权，`lockSpendToModels` 把隔离副本里其余所有非文本模型（含全部转写模型、本机转写）停用。产品没机会转写。 |
| 2 | 显式 scribe_v2 也是「没有转写模型」 | 用户真实目录里 **elevenlabs 没有 API Key**（`apiKeysByVendor` 无此家），scribe_v2 不可用；且显式解析失败被压成「这台机器上没有转写模型」这句**假话**。 |
| 3 | 自动挑模型不看模式 | `findExecutableModelAnyVendor("audio")` 按 kind 挑：audio 里 Suno / TTS 排在前面时，转写请求就发给它（无转写 mapping → 落默认 Whisper 路径 → 4xx）。chip 用 `useModelOptionsState('audio','transcribe')` 按模式列——两个答案。 |
| 4 | Scribe 就算有 key 也拆不出对白 | 种子 mapping 的 `fileSource` 是 `reference_audio_urls`，拆解传 `file` → 「缺少待上传媒体」；Scribe 只回逐词 `words`，拆解只读 `segments` → 整列静默空白。 |
| 5 | 本机转写「启用但没装」 | 按设计首次使用时下载引擎与权重，拆解阶段有下载进度（`localSpeech.progressDownload`）——能跑，不是坏的；开跑前不报下载体积是体验缺口（记后续，见下）。 |
| 6 | 评测把空对白判成达标 | 没参考稿时 CER = null，`judgeCase` 不看对白覆盖。 |

| 格 | 结论 | 证据 |
|---|---|---|
| ★1 用户怎么用 | 当我在分镜表底栏点「拆解」，我想对白列按镜头填上台词，以便对照原片改稿。步骤：选视频 → 转写 chip 自动 / 点名 → 拆解 → 看对白列。不做：不新增界面、不改 chip 外观、不做本机转写下载体积预告。真实任务：`talk-mixed` 中英混口播（作者逐字稿作参考）；`screenrec-zh` 中文录屏口播。主指标 dialogueShotRate > 0；质量 dialogueCer ≤ 0.3；护栏 读图调用 = 镜数、转写调用 = 1 | `evals/deconstruct/run.mjs` |
| ★1b 连带界面 | 拆解结果顶部那一行原因：新增两句（点名模型不可用 / 转写无时间戳），中英各一；报价卡转写行仍来自同一解析 | `electron/desktopStrings.ts` |
| ★2 谁说了算 | 「这一行能不能跑某模式」= `electron/shared/modelPublication.ts#rowServesMode`（可用 × 已发布模式），唯一判据；候选清单 = `listModelCatalogModels` 同一份投影。主进程 `modeCandidates` 与渲染层 `optionsFromRows` 同调；转写结果形状 = `segments`，由 `audioTaskRunner.runTranscribe` 出口统一 | `node scripts/door-map.mjs findExecutableModelAnyVendor`（1 扇，已删）|
| ★3 一致与复用 | 复用 `findExecutableModel`（三态原话）、`derivePublishedExecution`、`orderByVendorPreference`、读图腿 `resolveVisionLeg` 的三态结果形；逐词 → 句段是供应商适配（`electron/catalog/` 领域内） | `git grep rowServesMode` |
| ★4 全状态 | 有音轨 + 自动挑到 → 对白按镜头填；自动挑不到 → 「没有可用的转写模型」；点名不可用 → 「你选的转写模型『X』现在用不了（原因）」，不悄悄换别家、不为它发请求；转写有字无时间戳 → 「回了文字但没带时间戳」；本地挂 → 原有「改用云端重试」，云端重试现在排除本机引擎；无音轨 → 不转写 | 单测 + 付费评测 |
| 5 中途表 | 不改打断语义：转写与读图并行，取消 / 关窗沿用拆解既有路径；点名不可用时转写那一行不进报价卡、不扣 | `deconstructSpend` 既有测试 |
| 6 外部数据 | ElevenLabs STT：`words[]{text,start,end,type∈word/spacing/audio_event,speaker_id}`（https://elevenlabs.io/docs/api-reference/speech-to-text/convert ，2026-10-19 查）；OpenAI 逐词 `word/start/end`。声音事件不进台词；无时间戳如实报 | 官方文档 |
| ★7 性能 | 不适用：没有新增用户操作；解析多一次目录投影（每次拆解一次，毫秒级） | — |
| 8 真实条件 | 真付费：macOS、zh 界面、真实素材、真 APIMart key；ElevenLabs 未验证（用户没有该家 key）；Windows unverified | `evals/runs/deconstruct-paid-2026-10-19T00-39-34-953Z.json` |
| 拍板图清单 | 不适用：不改界面元素，只多两句结果原因文案 | — |
| ★9 验收与回滚 | 验收清单（动手前列）：①偏好把 Suno 排第一，自动不拿它转写；②任何供应商顺序下自动结果 ∈ 转写候选，候选每行都发布 transcribe 且可用；③chip 列出的 == 主进程候选（同一份投影）；④点名非转写模型 / 没 key 模型 → requested-unavailable 带原因；⑤「改用云端」不落回本机引擎；⑥Scribe 真实种子 mapping 用 `file` 与 `reference_audio_urls` 两种调用方都传得上、逐词响应出口有 segments；⑦有人说话却无对白 → 评测判不达标；⑧付费评测 dialogueShotRate > 0、CER ≤ 0.3。反例：TTS / 音乐模型、无 key、本机引擎、只回逐词、只回文字。回滚：revert 本 PR 合并提交 | `electron/video/deconstructLegResolution.test.ts` `electron/audioTaskRunner.test.ts` `electron/catalog/transcriptSegments.test.ts` `src/config/modelCatalogCache.test.ts` `evals/deconstruct/metrics.test.mjs` |

### 功能分类
- [x] 花钱
- [x] 生成效果
- [ ] 新界面 / 改交互
- [ ] 长跑 / 可打断
- [ ] Agent 行为
- [ ] 大数据量 / 画布 / 长列表
- [ ] 数据格式
- [ ] 新增功能 / 性能

### 后续（不在本 PR）
- 本机转写在 chip 里预告「首次使用需下载 ≈ N MB」（`pendingLocalSpeechBytes` 已有，缺 IPC + 文案；属改界面，走设计管线）。
- ElevenLabs Scribe 真付费封印：需要用户在 Nomi 里填 ElevenLabs Key 后跑 `--transcribe-model elevenlabs/scribe_v2`。
