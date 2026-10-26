# 2026-10-27 走查后台安静设计卡

## ★1 用户怎么用 / 怎么量

走查脚本经 `tests/ux/_launchApp.mjs` 启动隔离 Nomi 时，默认窗口屏外、不可聚焦，且所有会把控制权交给 macOS 的出口只留记录。用户可以继续在前台使用 Claude 或其它应用。真实前台行为走查必须写 `launchNomiApp({ foreground: '<原因>' })`，并由 `NOMI_WALK_FOREGROUND_OK=1` 明确放行。

量具：Mac 上启动后、运行中每秒、关闭前各执行一次 `lsappinfo front`，再用 `lsappinfo info -only pid <ASN>` 取最前应用 PID，用 `lsappinfo info -only ApplicationType <ASN>` 取 Dock/前台类型。成功标准是普通走查全程没有走查 PID 在最前；应用类型不是 `Foreground`；走查记录数组中没有被执行的外部打开。指标是「抽样中走查 PID 占全部抽样的比例 = 0%」。真实任务：模型接入 J04、技能库/提示词库排版走查各跑一次；中英文结果分别留原始日志。

出处与决定：Electron 官方 `showInactive()`、`focusable`、`app.focus({ steal })`、`app.setActivationPolicy('accessory')`；Playwright Electron 官方文档。Playwright 没有不激活启动选项，所以在主进程入口前注入同一仪表。

## ★2 谁说了算

走查控制权的 owner 是 `tests/ux/_launchApp.mjs` 的 `launchNomiApp`：它决定是否注入仪表、是否接受 `foreground` 声明、是否启动 Mac 前台门岗。仪表记录的事实唯一存于主进程 `globalThis.__nomiQuietWalk`，走查通过 `electronApp.evaluate()` 读取；不在渲染层复制状态。外部打开、通知、对话框替身和窗口调用都经过同一份注入模块。

## ★3 一致与复用

复用现有 `mainRequireArgs`、打包形态的 `requireBeforePackagedMain`、`closeElectronWithin` 和 `_launchApp.test.mjs`，只把可选 `_offscreenWindows.cjs` 收敛成默认注入的 `_quietWalk.cjs`。不改 `electron/` 或 `src/` 产品代码，不新增 npm 包，不保留 `NOMI_WALK_OFFSCREEN` 旧开关。

前台门岗、外部出口记录、原生对话框 fail-closed 和窗口包装都只在 `_quietWalk.cjs` / `_launchApp.mjs` 定义，不在每条走查里复制。

## ★4 全状态

- 默认走查：窗口显示在屏外且不可聚焦；`show()` 转为 `showInactive()`，`focus()` / `moveTop()` 无动作；`app.focus()`、Dock bounce、外部打开、系统通知只记录；未替身的原生对话框抛出「走查要先替身这个对话框」；`showErrorBox` 写主进程日志。
- 前台声明缺失放行变量：不启动 Electron，打印「未跑：这条走查需要前台，会打扰正在用电脑的人」，退出码 125。
- 前台声明并显式放行：窗口/应用前台动作恢复真实行为，仍保留外部打开、通知和未替身对话框的安静边界；门岗不把这条走查判成抢前台。
- 门岗发现普通走查抢前台：记录时间、PID、应用类型，设置失败退出码 1；不杀用户进程。
- Windows/Linux：不启用 `lsappinfo` 门岗，窗口/出口仪表仍工作；残余风险写在报告。

## ★9 验收与回滚

验收清单（实现线先跑，验收线逐项复核）：

1. 反例：去掉 `show()` → `showInactive()` 替换，单测必须红；保留替换时单测绿。
2. 反例：去掉前台 PID 相等判定，门岗单测必须红；PID 不相等时单测绿。
3. 主进程假 Electron：构造选项含 `show:false`、屏外坐标、`focusable:false`；调用 `show()` 只触发 `showInactive()`。
4. `app.focus`、Dock `bounce`、`shell.openExternal/openPath/showItemInFolder`、`Notification.show` 只进记录数组且不调用原方法。
5. 原生对话框未替身抛出固定中文错误；`electronApp.evaluate()` 替身后调用走替身；`showErrorBox` 不开窗口而写日志。
6. `foreground` 没有 `NOMI_WALK_FOREGROUND_OK=1` 时不调用 Electron 启动；有放行变量时允许启动。
7. Mac 真机不设任何屏外变量，排门岗锁跑 `node tests/ux/model-access-journeys/run-journeys.mjs J04` 和 `node tests/ux/library-layout.walk.mjs`：全程最前应用不是走查 PID，`ApplicationType` 不是 `Foreground`，外部打开记录为空。
8. 反例边界：所有经 `_launchApp.mjs` 的开发版 / 打包版入口都装同一模块；显式 `mainRequire` 不重复注入；`_offscreenWindows.cjs` 和 `NOMI_WALK_OFFSCREEN` 全仓不存在。

自验命令与回滚：单测、改动文件 ESLint、`check-e2e-launch`、`check-walkthroughs`、`check-file-sizes`、`git diff --check`、`check-root-cause-contracts`、`check-concept-owners`、推送前快检及两条真机走查。回滚为在任务分支上 `git revert <实现提交>`；不改用户资料、不推送、不合并。

### 功能分类

- [ ] 新界面 / 改交互
- [ ] 花钱
- [ ] 长跑 / 可打断
- [ ] Agent 行为
- [ ] 大数据量 / 画布 / 长列表
- [ ] 生成效果
- [ ] 数据格式
- [ ] 新增功能 / 性能

### 外部出处

- Electron BrowserWindow API：<https://www.electronjs.org/docs/latest/api/browser-window>（`showInactive`、`focusable`、`show`/`focus` 语义）。
- Electron app API：<https://www.electronjs.org/docs/latest/api/app>（`app.focus({ steal })`、`setActivationPolicy('accessory')`、Dock 语义）。
- Electron shell / Notification / dialog API：<https://www.electronjs.org/docs/latest/api/shell>、<https://www.electronjs.org/docs/latest/api/notification>、<https://www.electronjs.org/docs/latest/api/dialog>。
- Playwright Electron API：<https://playwright.dev/docs/api/class-electron>（无不激活启动选项；原生 dialog 需 `electronApplication.evaluate()` 替身）。
- Electron 43.4.1 macOS 源码：<https://github.com/electron/electron/blob/v43.4.1/shell/browser/native_window_mac.mm>（`Show()` / `ShowInactive()` / `Focus()` 的激活路径）。
