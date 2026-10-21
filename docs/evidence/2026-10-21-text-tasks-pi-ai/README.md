# 文本任务迁 pi-ai 单次调用 · 证据

设计卡：`docs/plan/2026-10-21-text-tasks-to-pi-ai.md`；复盘：`docs/audit/2026-10-21-text-stream-first-token-gate.md`。

| 文件 | 是什么 | 什么时候量的 |
|---|---|---|
| `c0-ai4-matrix.txt` | 调用方矩阵（`electron/ai/textTaskCallers.integration.test.ts`）在 ai@4 栈上的结果：19 红 / 57 绿 | C0（迁移前） |
| `c0-ai4-think35s-realtime.txt` | 「先想 35 秒再出字」真墙钟，9 个调用方在 ai@4 上全部在 30 秒处被「首字 30s 未响应」掐掉 | C0（迁移前） |
| `c0-ai4-renderer-verdicts.txt` | ai@4 上每种错误到了渲染层：会不会被自动重提、被分成哪类（迁移前后「是否重提」必须一致） | C0（迁移前） |
| `c0-ai4-perf.txt` | perf 两个场景的 ai@4 基线 | C0（迁移前） |
