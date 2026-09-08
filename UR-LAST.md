# UR — 体验量表第二层
分支：test/ux-experience-rubric-20260909
实现：10 维数据量表、每步采集、离线判官、显式 VLM 接口、共享夜跑、只收紧基线。
复用：PR #662 的 _feel.mjs 与 catalog / feel-nightly 路径；旧非执行登记明确 not-selected。
三任务：Agent 工具写文稿、画布图片、设置模型接入；25 阶段、50 张前后截图。
费用：0；仅隔离目录与 loopback；未改生产代码，体验发现只列不修。
证据：docs/audit/2026-09-09-ux-experience-rubric.md（含完整证据 ZIP）。
验证：experience:test 7/7；三旅程与基线复算、synthetic 判官示例通过。
gates：完整通过（Vitest 12058 passed / 2 skipped，附加测试与构建通过）；正常 Ponytail 钩子。
交付：PR 不合并，最终 URL 与 commit 见交付回复。
