# B3 验收证据

📎 交接/日志

- 红→绿：`red-overrides-policy.log` / `green-overrides-policy.log`；`red-orphan-variant.log` / `green-orphan-variant.log`。
- 全档案默认解析：`defaults-before.json` 与 `defaults-after.json` 字节一致，默认模型/模式零变化。
- 确定性 loopback：`final-generation-loopback.log` 4 条通过，真实 set_node_prompt → generateShotRow 将「夜景」交付 runner；`policy-lifecycle.log` 9 条通过，包含视觉锚 + t2v 返回可执行纠正。模型花费 0，不代表真实模型选工具率。
- 真实 Electron：`walk.log` 通过；截图为 `screenshots/00-anchor-warning.png`、`01-inline-night.png`、`02-discard-dusk.png`、`03-canvas-badge.png`。内联采纳/丢弃，无确认框。
- 第一次完整 gates：76 项 contracts 全部执行，3 项失败（实验室夹具消费数量、结构测试注释过滤、测试新增必填字段）。三处已修，未改视觉基线或抬高棘轮。
- 第二轮完整 gates：76 contracts / 0 阻断失败；全量单测 12123 通过、6 失败。5 条来自旧的全模块 mock 缺导出，已改为只替换 IPC 读取；1 条抓到提示词专用事件丢失，已恢复事件/编辑撤销并保留共享覆写标记。`red-full-suite-mocks.log` → `green-full-suite-mocks.log` 证明 3 文件 53 条转绿。
- 生命周期补充：`red-ownership-lifecycle.log` 两条失败 → `green-ownership-lifecycle.log` 5 文件 41 条通过。Agent 补偿恢复字段归属；专用提示词事件与元数据事件同 gesture 重放一致；内部收据旧格式继续可读。
- 最终完整 gates 收据待本轮执行结束补充。
