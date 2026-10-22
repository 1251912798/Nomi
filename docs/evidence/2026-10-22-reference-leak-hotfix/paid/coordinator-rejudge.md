# #1279 真付费样本：协调手工复判（2026-10-22）

结论：**通过**——修复在真付费里生效：发给供应商的视频创建请求只带首帧、尾帧两张图，残留的 3 张参考一张没发，也没上传。脚本自动判定是误红（见下），按本机账本脱敏副本手工复判，不重花钱。

## 这一条花了什么
- 1 条 APIMart Seedance 2.0 fast · 480p · 4 秒 · 无音频（场景 2：全能参考放 3 张 → 切到首尾帧 → 放首帧、尾帧 → 生成）。
- 供应商任务 task_01M5HVTZTGY9JFR8ET9VMQE0K7，状态 ready，成片已落地（本机走查输出目录 result.mp4，未入库）。脚本记 paidCalls = 1。

## 真发出去的请求体（POST /v1/videos/generations，api.apimart.ai，1 次）
- model=seedance-2.0-fast，resolution=480p，duration=4，generate_audio=false
- image_urls：first.png（地址哈希 6327504d7c99）、last.png（地址哈希 cc3c83e74b1e）
- image_with_roles：first_frame = first.png（6327504d7c99）、last_frame = last.png（cc3c83e74b1e）
- 去重后的图片集合：first.png、last.png——恰好首帧、尾帧两张；残留参考（ref-1/2/3）未出现。

## 上传记录
- 只上传过 first.png、last.png（残留参考从未上传）。
- 但每张上传了 26 / 26 次：请求序列 BUUCUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPUUPD（B=余额、U=上传、C=创建、P=查任务、D=取成片）——**每次查任务前都把两张图重新上传一遍**。这是 main 上既有的问题（runtime.ts 在每个 HTTP 操作前都跑 localizeAssetsForVendor，轮询也不例外），不是本 PR 引入，另开线修。

## 为什么脚本判了红
- 记录口把请求体存成 body.text（JSON 字符串），脚本的判定按已解析对象取，结果「创建请求 0 次 / 图片集合为空」。属于脚本侧解析口径不一致，产品行为正确。
- 修脚本（解析 body.text、上传响应先按 JSON 解析、放宽创建请求的 APIMart 线路、成片落地后用最新账本再判、报告带「上传文件名 → 地址哈希」对照）作为本 PR 合入后的小跟进，免得验收 HEAD 之后再动测试文件。

## 探测模式为什么没用上
- probe-report.json：探测模式在启动时查余额（GET /v1/balance）被探测模式的测试网闸挡下，当场失败、零花费。按预案直接跑正常模式（确认框前同样整套核对）。已记跟进：探测模式放行供应商只读的健康 / 余额端点。
