# 文本任务迁 pi-ai 单次调用 · 证据

设计卡：`docs/plan/2026-10-21-text-tasks-to-pi-ai.md`；复盘：`docs/audit/2026-10-21-text-stream-first-token-gate.md`。

| 文件 | 是什么 | 什么时候量的 |
|---|---|---|
| `c0-ai4-matrix.txt` | 调用方矩阵（`electron/ai/textTaskCallers.integration.test.ts`）在 ai@4 栈上的结果：19 红 / 57 绿 | C0（迁移前） |
| `c0-ai4-think35s-realtime.txt` | 「先想 35 秒再出字」真墙钟，9 个调用方在 ai@4 上全部在 30 秒处被「首字 30s 未响应」掐掉 | C0（迁移前） |
| `c0-ai4-renderer-verdicts.txt` | ai@4 上每种错误到了渲染层：会不会被自动重提、被分成哪类（迁移前后「是否重提」必须一致） | C0（迁移前） |
| `c0-ai4-perf.txt` | perf 两个场景的 ai@4 基线 | C0（迁移前） |
| `c2-pi-think35s-realtime.txt` | 同一个真墙钟用例在新核心上：9 个调用方全过 | C2 |
| `c2-pi-perf.txt` | C2 + 预热的 perf（机器负载高时的一轮） | C2 |
| `c5-final-perf.txt` | C4 之后的 perf：热 2.4/4.1ms、冷（预热后）19.3/21.9ms、刚启动就点 670–700ms | C5 |
| `d7-before.txt` / `d7-after.txt` | D7：三处文本任务错误展示，先红后绿 | D7 |
| `walk/` | Electron 零花费演练截图（中 / 英）与每次调用的一行摘要 `calls.json` | C5 |
