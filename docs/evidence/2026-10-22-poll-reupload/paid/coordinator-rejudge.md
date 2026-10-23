# #1285 真付费样本：协调手工复判（2026-10-22）

结论：**通过**——本地参考只在提交那一步各上传一次，查任务、取成片不再上传。脚本自动判定是误红（和 #1279 那次同一个已知毛病，见下），按本机落盘的网络账本脱敏副本手工复判。

## 这一条花了什么
- 1 条 APIMart Seedance 2.0 fast · 480p · 4 秒 · 无音频（`tests/ux/reference-leak-hotfix.paid.mjs` 场景：全能参考放 3 张 → 切到首尾帧 → 放首帧、尾帧 → 生成）。跑在 PR 头 7c66c1f0b7e278bb11cc5d12f4bdf6011fa407c3 的新构建上。
- 供应商任务 task_01M5JDHPCDQJHBT0MQMT9974C2，状态 ready；成片 4.04 秒、h264、864×496、无音轨、1013290 字节（ffprobe 量过，留在本机走查输出目录，未入库）。脚本记 paidCalls = 1。

## 真发出去的请求（网络闸记账，27 条放行请求）
请求序列：`B U U C P×22 D`
- B：GET /v1/balance（1 次）
- U：POST /v1/uploads/images —— first.png 1 次、last.png 1 次（共 2 次）
- C：POST /v1/videos/generations（1 次），请求体里的图只有 first.png、last.png
- P：GET /v1/tasks/task_01M5JDHPCDQJHBT0MQMT9974C2（22 次轮询，**每次都不带上传**）
- D：取成片（1 次）

对照 #1279 真付费样本（修前，同一场景）：`B U U C U U P U U P … D`，每张图上传 26 次（1 次创建 + 25 次轮询）。本次每张 1 次。

残留参考 ref-1/2/3.png 在账本里出现 0 次（没上传、没发出）。账本里没有 key 形状的串。

## 为什么脚本判了红
- 脚本报「发往 api.apimart.ai 的视频创建请求有 0 次」「hostedUploads 只有 first.png」——和 #1279 那次一模一样（见 `docs/evidence/2026-10-22-reference-leak-hotfix/paid/coordinator-rejudge.md`）：脚本以镜头上的提交记录为信号去读账本，那时账本还没写完。落盘副本里创建请求确有 1 次。
- 不影响产品结论。修脚本（终片落地后再读账本、按文件哈希对图）已记跟进。
