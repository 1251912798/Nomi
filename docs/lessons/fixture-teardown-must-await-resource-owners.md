# 测试目录必须等资源真正关闭后再删

> 📎 教训 · 首次记录 2026-09-08 · 状态：现行
> **触发场景**：node:test 红后 runner 不退出，临时目录清理 ENOTEMPTY，或加了 child.kill 仍然挂。

**结论**：创建目录的夹具要持有全部依赖资源。先 await lane.close／子进程 close，再关 HTTP，最后 rm；不要把这几步散落为按创建顺序注册的多个 t.after。

本次在 16 份并发的 G3b③ 中复现：测试主体完成后，最早注册的 rm 钩子与恢复/收尾写盘竞争，报 `hookFailed: ENOTEMPTY .../.nomi/agent-sessions`。node:test 的后续钩子没有执行，HTTP 留着，runner 不退出。进程记录证实崩溃子进程已经退出，因此只补 kill 不能治根。

两条共用 crash child 的入口也不等价：G3b③ 只在 after 发 SIGKILL，没有等完成；P1③ 连兜底都没有。两条现在共用 laneCrashFixture，启动时登记 owner，读取完整 PARKED 行，正常路径与异常清理都等待 close 事件。

- laneFixture.openLane 自动登记 lane.close，覆盖提前断言失败和显式 close 前失败。
- workspace／裸探针用 fixture.after，接入同一个生命周期；同一测试多个夹具的清理也会全部等待。
- 一个 owner 失败仍关闭其他 owner 和 HTTP；保留目录并抛出原始错误，不能吞错或靠 rm 重试掩盖活跃写入。
- 回归用可控 Promise 阻塞 close，验证完成前目录存在、完成后目录删除；另外启动真实 node:test 进程，故意让断言和清理同时失败，验证失败报告和进程退出。
- 嵌套启动独立 node:test runner 时移除 NODE_TEST_CONTEXT，否则可能被当成父 runner 的 worker；必须断言子 runner 真正执行了预期失败测试。

证据见 [修复计划](../plan/2026-09-08-agent-runtime-flakes.md) 和 [根因合同](../fixes/2026-09-08-agent-runtime-flakes.root-cause.json)。
