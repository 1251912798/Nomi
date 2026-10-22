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

## 为什么脚本判了红（原因未定，下面是更正）
- 初判写的是「脚本没解析记录口的 body.text」——**这个归因不对**：实现线指出 fad60c03f 的判定 _referenceLeakWire.mjs 本来就解析 body.text，零花费测试也是按这个形状喂的；这次跑的正是含它的 f44aa88f5。
- 已核的事实：落盘账本副本里确有 1 条 POST https://api.apimart.ai/v1/videos/generations，主机、路径都和判定口径一致。所以「创建 0 次」的真正原因还没查清，候选：判定读的是运行中的账本快照（记账时序）、按 via / kind 过滤掉了这一条、或成片落地前就判了。
- V-refleak 第 3 轮读证据给出的最可能原因（未实测）：report.json 里 hostedUploads 只有 first.png、createRequests 为 0——脚本以镜头上的提交记录为信号去读账本，而提交记录在上传和创建之前就落盘了，读早了（第 2 轮提过的时序风险 C）。修法：成片落地后用最新账本再判一次。
- 这不影响产品结论：请求体内容按落盘副本逐项核过（见上），修复生效。脚本侧的原因留到 #1279 合入后修脚本时，用这次的落盘副本先复现、再改。

## 探测模式为什么没用上
- probe-report.json：探测模式在启动时查余额（GET /v1/balance）被探测模式的测试网闸挡下，当场失败、零花费。按预案直接跑正常模式（确认框前同样整套核对）。已记跟进：探测模式放行供应商只读的健康 / 余额端点。
