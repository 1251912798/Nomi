# 条件 2 修前会红：键表手写、值判断只认字符串时，哪些格漏、哪些键没拦

> #1269 合并前条件 2（验收报告 V-b1a-r3 第 4 节）。测试：`src/workbench/generationCanvas/runner/referenceSentWithinInUse.property.test.ts`。
> 命令：`NOMI_REFLEAK_REPORT=<文件> pnpm exec vitest run src/workbench/generationCanvas/runner/referenceSentWithinInUse.property.test.ts`。
> 修前代码：`feat/composer-b3` 在 `7f977acfe`（键表还是手写的 29 个键，`findReferenceResidue` 只认字符串 / 字符串数组）。本机 Apple M5，零网络，零额度。

## 结果：71 条里 7 条红

| 用例 | 修前 | 说明 |
|---|---|---|
| params/aliases | 197 格里 197 格漏 | 节点 meta 里夹带的 `image_urls`、`first_frame_image`、`image_with_roles`、`video_list`、`mask_url` 等键，渲染层不清，`...meta` 原样进 extras；连上传白名单 `activeAssetUrls` 也带上了它们 |
| apimart/aliases | 60 格里 18 格漏 | APIMart 真请求体发出夹带的图 |
| seeded/aliases | 260 格里 53 格漏 | 内置全部供应商的真请求体（kie / agnes / volcengine / runninghub / fal / runway …） |
| apimart/bypass-per-key | 1370 格里 113 格漏 | 干净请求只漏清**一个**键，主进程拒发放行，真请求体发出 |
| seeded/bypass-per-key | 6085 格里 305 格漏 | 同上，内置全部供应商 |
| 键表完整性 | 30 个请求体实际读的参考键不在键表里 | 见下 |
| 主进程拒发逐键 × 形状 | 30 个键 × 2 种形状全没认出 | 见下 |

relay/bypass-per-key（3627 格）修前就是 0 漏：通用中转请求体只读 `image_url` 一类手写表里本来就有的键。

## 修前不在键表里的请求体参考键（30 个）

`image_urls` `reference_image` `input_urls` `end_image_url` `audio_ids` `video_list` `character_ids` `uploadUrl`
`first_frame_image` `last_frame_image` `video_urls` `audio_urls` `image_with_roles` `keyframe_images` `first_frame` `last_frame`
`images` `audios` `videos` `volcengine_first_image_content` `volcengine_first_role_image_content` `volcengine_last_role_image_content`
`volcengine_image_contents` `volcengine_video_contents` `volcengine_audio_contents` `lastImageUrl` `firstImageUrl` `imageUrls`
`mask_url` `voice_reference_audio_url`

（读它们的请求体：kie、apimart、agnes、volcengine、runninghub、fal、runway。验收报告 r3 探针里那两个 `image_urls`、`first_frame_image` 在其中。）

## 原始输出

本机临时目录 `/Users/aoqimin/Nomi-coord/tmp/I-b1a/`：`c2-red3.log`（vitest 全文）、`c2-red3-refleak.json`（每层漏格与「在用且发出」）。
