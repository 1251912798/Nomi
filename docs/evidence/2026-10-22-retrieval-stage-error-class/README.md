# ⑬ 取回阶段的错误口径：证据

## 失败路径实测（零花费）

`electron/tasks/retrievalStagePhase.realGuard.test.ts`：生产代码整条走，链路是 `fetchTaskResult` → `executeProfileOperation` → `vendorHttp.requestJson` → 出站守卫 → `retrievalStageError`。只注入一样 DNS 事实：`api.apimart.ai` 解析到 198.18.0.7，且没有本地代理证据。守卫在请求离开本机之前就把查询拦下，所以零网络、零花费。

- 修前（把 `taskResultQuery.ts` 换回 origin/main 那份跑同一条测试）：抛出的码是 `outbound-blocked-submit`，正文是「这次生成**没有发出去**……然后重新生成」，`structured.upstreamMsg` 也是这句。
- 修后：抛出的码是 `retrieval-query`，正文里没有「没发出去 / 重新生成」。原码 `outbound-blocked-submit` 和诊断前缀（含 `api.apimart.ai`）留在正文里，并标明「Nomi 在本机拦下、不是服务商返回」；正文里没有冒充的服务商原话。

## 成功路径

本单不改成功路径。真付费样本引用 #1285 的协调复判：`docs/evidence/2026-10-22-poll-reupload/paid/coordinator-rejudge.md`（分支 fix/poll-reupload，提交 5ba226f18）。请求序列是 `B U U C P×22 D`。

## 中英两轨截图（生产组件，本机渲染）

截图用 `.tmp/retrieval-evidence/capture.mjs` 拍：Vite 加载生产组件，headless Chromium 截图，技术详情已展开；拍完临时入口就删。

| 图 | 内容 |
|---|---|
| `panel-before-zh.png` / `panel-before-en.png` | 可找回面板，修前主进程交出的报错：技术详情里是「这次生成没有发出去……重新生成」/「was never sent … generate again」 |
| `panel-after-zh.png` / `panel-after-en.png` | 可找回面板，修后主进程交出的报错：「取回卡在『查询任务』这一步：这次请求是 Nomi 在本机做的检查拦下的，不是服务商返回的（原始码 outbound-blocked-submit）……」；主按钮仍是「重新取回」 |
| `card-after-zh.png` / `card-after-en.png` | 新一类「任务已提交，这次没能取回结果」的错误卡，**画布任务**（有 taskId、不是制作 Run）：主按钮「去重新取回 / Retrieve again」，点了回到可找回面板；没有重试 / 换模型 |
| `card-after-production-zh.png` / `card-after-production-en.png` | 同一类错误卡，**制作 Run 的镜**：主按钮保留「查看制作任务 / View production task」（去任务中心里那一笔） |

`capture-receipt.json` 是每张图的可见文字。
