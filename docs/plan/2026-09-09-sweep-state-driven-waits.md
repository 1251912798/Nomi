# Sweep 状态等待与传输证据

状态：🚧 进行中。

范围：仅 scripts、tests、docs；以 origin/main 的混合模式、凭据预检、视频等待为基底合入指定补丁。不改生产代码，不改模型 API 或依赖。

根因判定 recurring：视频站 180s、分镜审批 15s、点击 30s 将固定墙钟当成业务完成边界；共享缺失不变量是站点等待必须观察状态，安全上限由预算或终态等待 owner 提供。实扫 tests/ux 与 scripts 的 waitForFunction、locator 等待和 expect.poll；在既有 check-test-waits AST 门岗统一拦截，存量明确登记并只减不增。

实施：先应用补丁测试并保存红日志，再叠加 main 兼容实现；阶段 02 等回合终态或审批，保留 300s 安全上限与 15s 状态记录。预算出站前拒绝；每次出站保存传输证据。门岗先用三处旧写法验红，再验现状绿。

验收：适配单测红绿、门岗三反例红与现状绿、默认 loopback sweep 零功能 deviation、完整 pnpm gates exit 0 后 commit/push/PR。回滚：revert 本任务提交。依赖生命周期 not-applicable；使用仓库既有 Playwright 和 TypeScript AST，不引入框架或协议。

存量扫描：877 处站点固定等待，按路径+完整调用文本登记（不含本次已迁移调用）。预算适配在 main #670 已实现，因此预算回归测试在补丁前已绿；传输证据和终态观察测试补丁前红、补丁后绿。没有为伪造红日志退改已修实现。

## 先查别人

- 仓库已有：`scripts/check-test-waits.mjs:51` 已用 TypeScript AST 判断 async waitForFunction；沿用同一解析器和门岗，不新增第二套脚本。
- 依赖已有：`node_modules/typescript/lib/typescript.d.ts:9192` 提供 createSourceFile；用语法树排除注释和字符串，解析等待调用、timeout 属性、常量与算式。
- 仓库已有：`tests/ux/g1/c0-video-wait.mjs:6` 用任务数量、时长与并发推导安全上限，`tests/ux/g1/c0-video-wait.mjs:29` 用 Playwright poll 观察终态；阶段 02 复用同一状态判据原则。
- 官方机制：Playwright 原生 poll 与自动重试断言继续承担调度（https://playwright.dev/docs/test-assertions#expectpoll）；本次未另写计时/重试运行时。本地已核对安装的 Playwright 类型与已有调用，不宣称做过新的线上检索。
- 自媒体检索：本次是用户指定的测试机制修补，无产品选型；未进行 TikHub 搜索，不把未检索写成“没有”。结论：用已有 AST + Playwright，新增的只有站点预算规则与三反例回归。

复走发现同族导出竞态：`sweep-timeline.mjs` 与 `c0-short-film.walk.mjs` 都把可解析的 partial MP4 当完成，生产 `electron/export/exportPaths.ts:69` 明确以 `.partial.mp4` 表示未发布。测试侧共享筛选最终成品的边界，并用原子 rename 夹具验证；不改生产导出代码。

## 本地验收记录

- G1 相关单测 60/60 通过；三处固定等待反例与导出 partial 竞态均保留红/绿日志于 `docs/plan/sweep-evidence/`。
- 最终默认 loopback：`artifacts/sweep/2026-09-09T05-45-39.203Z/report.md`，33 个输入、221 个站点、0 功能 deviation、费用 ¥0；5937 条体感扫描命中保持原样，不宣称产品体验全绿。
- 白名单 877 处；以路径和完整 SHA-256 调用指纹登记，不复制整个回调正文、不放宽敏感扫描。Ponytail 按 80 行上下文计量，因此测试适配、门岗、文档分别提交，完整 gates 绿后再分批推到同一分支。
