# #1330 付费抽样（协调，2026-10-25）

- 构建：PR head `d72221531`（paid-director 工作树，构建戳校验通过，产物里有本轮标记 `director.agent.spendBlockedNotAttached`）。
- 命令：`NOMI_SPEND_OK=1 node tests/ux/director-reference-attach.paid.mjs`（凭据走 `_paidRun` 的 real-profile，跑完删副本；真实资料 `model-catalog.json` 指纹前后一致）。
- 花费：1 条视频，APIMart · Seedance 2.0 · fast · 480p · 4 秒 · 无音频；供应商任务号 `task_01M5QXVJ7YQF5JHV7KBFCKDKMM`；没有被网络闸挡下的请求。
- 结果（`report.json`）：花钱前核对全过（预演就绪、挂在这个镜头、提示词带引用、时长 4 秒）；节点恰好提交 1 次；成片落地 4.04 秒 · 864×496 · 24fps。
- 肉眼比对（`preview-vs-result.jpg`，上行预演、下行成片，每 0.5 秒一帧）：运镜照预演走——前 2 秒全景静止、构图一致，2 秒处切到读书的人并推近。
- 范围：这次只证「导演台出成片挂回后，带参考出片」这一路。「删掉预演参考后按文生出」以中英文免费走查的请求体为证（没有参考视频、没有 @、没有运镜句），没有花钱复验。
- 另发现（main 上已有，不是本 PR 带进来的，已另记待办）：预演画面里人偶头顶的名字标签被成片照抄成了画面文字（「朋友」「作家」）。
