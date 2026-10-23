# 「Execution context was destroyed」不一定是导航：Playwright 把一切认不出的协议错误都改写成这一句

> 📎 教训 · 首次记录 2026-10-22 · 状态：✅ 已固化（`patches/playwright-core@1.60.0.patch` + `tests/ux/playwright-main-evaluate.e2e.mjs`）
> **触发场景**：走查 / 冒烟 / 评测里 `electronApplication.evaluate`、`browserWindow`、`jsHandle.evaluate` 偶发报这一句，尤其是主进程那一侧、尤其在启动后一两秒

**结论**：先拿原始协议消息再下结论（`DEBUG=pw:protocol` 里 grep `"error":{`；打了补丁后报错尾巴会带 `[protocol: …]`）。主进程那一侧的这句报错，原文常是 `Promise was collected`——和导航无关，是主进程正忙时 Playwright 的求值结果被 GC 收掉。不要加 sleep、不要重试吞错、不要「等某个时机」：那只是挪时间。

**为什么会踩**：
- `playwright-core` 的 `crExecutionContext.rewriteError`：凡不是「页面 JS 抛错」也不是「会话已关」的协议错误，一律 `throw new Error("Execution context was destroyed, most likely because of a navigation.")`——原文丢了，报错把人往「导航 / 页面重载」上带。
- Playwright 每次 evaluate 都带 `awaitPromise: true`；V8 调试器把返回值（哪怕是个数字）包成 promise、只弱引用它，等微任务回调再回包。Electron 主进程的 Node 调试器在 JS 正忙时用中断插队执行调试消息，回包要等那段同步代码跑完；期间一次 GC 就收掉 → `Promise was collected`。渲染进程（Chromium 在任务之间派发）不受影响。
- 本仓吃过两次：09-12 冷重启那次被认成「启动路由改写让句柄失效」，加了一段 `waitForURL`（只是挪了时机，2026-10-22 删）；10-18 起 Mac 打包冒烟间歇红 6 次，一度被怀疑是 #1264。
- 确定性复现：开发版 Electron 起一个主进程忙循环的 main，`app.evaluate(() => process.pid)` 30/30 挂；返回值强引用到落定后再放，120/120 过。

**怎么用**：
- 看到这句先抓原文：`DEBUG=pw:protocol node <脚本> 2>&1 | grep '"error":{'`。原文是 `Cannot find context with specified id` 才像导航 / 重载；是 `Promise was collected` 就是本条。
- 升级 Playwright 时：pnpm 打不上补丁会直接装依赖失败——先去掉补丁跑 `node tests/ux/playwright-main-evaluate.e2e.mjs`，绿就删补丁，红就把补丁移植过去。
- 自己发 CDP 的代码（如 `requireBeforePackagedMain`）带 `awaitPromise` 时同样要让结果强可达，或者别用 `awaitPromise`。

**出处**：根因合同 `docs/fixes/2026-10-22-playwright-main-evaluate-promise-collected.root-cause.json`；设计卡 `docs/plan/2026-10-22-packaged-smoke-promise-collected.md`；上游 microsoft/playwright#41826（维护者不修）、#27867。
