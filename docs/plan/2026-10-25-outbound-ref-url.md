# 出站参考媒体链接统一序列化设计卡

改动名：出站参考媒体链接统一按 WHATWG URL 序列化  线/负责人：fix/outbound-ref-url  类别：[其他]

### 功能分类
- [ ] 新界面 / 改交互
- [ ] 花钱
- [ ] 长跑 / 可打断
- [ ] Agent 行为
- [ ] 大数据量 / 画布 / 长列表
- [ ] 生成效果
- [x] 数据格式
- [ ] 新增功能 / 性能

| 格 | 结论 | 证据 |
|---|---|---|
| ★1 用户怎么用 | 当创作者在图生视频、图生图、Agent 自定义调用或制作流水线里带入远端参考媒体时，我想让请求里的每个参考链接先经过统一 URL 解析和序列化，以便文件名空格、中文和已编码路径不会被服务商按非法 URL 拒绝。流程：选参考→生成框投影到映射字段→提交前序列化→不合法则本机失败并提示替换/重新导入→合法才发请求。已知坑：查询/取结果不能重新上传；ComfyUI 本地文件名、`data:` 和 `nomi-local://` 继续走既有规则。真实任务：APIMart MiniMax-H3 图生视频带一张 Windows 空格文件名参考图；Agent 自定义调用带 `image_with_roles`；制作流水线带 `video_urls`/`audio_urls`。主指标：带空格或中文的远端参考在序列化后进入请求的比例→信号为请求体结构测试→指标目标 100%，量具为 `electron/catalog/outboundReferenceUrl.test.ts` 与 `electron/catalog/profileHttpRequest.test.ts`；质量指标：已编码 `%20` 与签名 query 序列化保持幂等→同一表驱动测试；护栏指标：无法解析的参考在请求写出前失败→请求 spy 调用次数 0。 | `electron/catalog/outboundReferenceUrl.test.ts`；`electron/catalog/profileHttpRequest.test.ts` |
| ★1b 连带界面 | 生成失败卡继续显示主进程错误；新增错误走 `desktopStrings` 的中英文 `outbound.referenceUrlInvalid`，说明哪一张参考无法解析，并指向“替换或重新导入后重试”。Agent 回执和任务列表沿用现有失败回执，不新增界面。 | `electron/desktopStrings.ts`；`pnpm run check:i18n` |
| ★2 谁说了算 | 概念“出站参考媒体链接”唯一 owner 是 `electron/catalog/outboundReferenceUrl.ts` 的 `normalizeOutboundReferenceMediaUrls`；允许消费者是 JSON 请求、profile 构造、multipart 参考取字节和自定义调用脚本。请求状态仍由主进程执行器拥有；原始参考值只保留在任务溯源/缓存，出站副本由边界生成。没有靠状态消失猜意图。 | `node scripts/door-map.mjs localizeAssetsForVendor`；`node scripts/door-map.mjs buildProfileHttpRequest`；`node scripts/door-map.mjs requestJson` |
| ★3 一致与复用 | 复用 WHATWG `URL`（Node 内置）作为唯一解析器；新增 helper 只按参考媒体字段形状递归替换，profile JSON、fallback/custom-call JSON 和 multipart source 都调用它。删除各调用方可能出现的手写编码方案；不加 npm 包。 | WHATWG URL Standard；`check:self-written`；`git grep -n 'image_urls\|image_with_roles\|reference_image_urls\|video_urls\|audio_urls' electron/catalog electron/runtime.ts` |
| ★4 全状态 | 空/无参考：请求原样通过；加载：不新增状态；成功：请求体中的参考值均为序列化后的 URL；失败：提交前抛 `outbound.referenceUrlInvalid`，点明参考槽和“替换或重新导入后重试”；部分成功：任一参考无法解析即整次请求失败，不发半套；取消中：沿用现有 AbortSignal；过期：由既有上传/资产策略处理；能力不可用：不适用，本修复不新增能力。中英文案来自 `desktopStrings`。 | `electron/catalog/outboundReferenceUrl.test.ts`；`electron/desktopStrings.ts` |
| ★9 验收与回滚 | 实现线执行：报告用例改前红、改后绿；表驱动覆盖数组/字符串/对象 `url` × 空格/中文/#/`%20`/签名 query/`data:`；结构测试遍历带媒体槽的内置 mapping，断言渲染 body 经边界后不含原始空白；变异在 `git archive` 副本删除统一边界调用，记录红格数。另一条线待协调派验收，复核本卡、合同、逃逸账本、请求未写出证据。反例→结果→证据：`https://cdn.test/a b.png`→`a%20b.png`→helper 测试；`https://cdn.test/图#1.png`→WHATWG 结果保留 fragment，生产者不得把文件名直接拼成 URL→编码生产函数审查/测试；`https://cdn.test/a.png?X-Amz-Signature=...`→`href` 逐字保持→签名测试；`data:image/png;base64,...`→原样保留→helper 测试；`https://[bad`→本机失败且 request spy 为 0→失败测试。回滚：revert 本次提交。 | `pnpm run test -- electron/catalog/outboundReferenceUrl.test.ts electron/catalog/profileHttpRequest.test.ts`；`docs/fixes/2026-10-25-outbound-ref-url.root-cause.json` |
