# 方向检查：项目库「回库」慢（P-library，RW）

> 触发：`node scripts/fix-churn.mjs` 对 `electron/projects/projectsIpc.ts`、`electron/preload.ts`、`src/workbench/library/localProjectStore.ts` 命中（目录 / 概念 14 天内已有 3 个 fix，这一刀是第 3–4 个）。按规矩停手，本页交协调拍板，未改任何实现代码。

## 0. 一句话根因

「项目列表摘要」没有唯一主人：渲染层有同步通道（`nomi:projects:list`，sendSync）和异步通道（`list-async`）两条，主进程里两条读的都是同一个**同步**全库扫描 `listProjects()`；加异步只是换了个门，主进程照样被堵。

## 1. 归类表

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 61738de3f6 / aae1a31bbc（主进程写口、退出排空） | 同一份项目文件有多个写口 | 主人不唯一 |
| 9a24cecc24（暂存件回收） | 清理挂在「打开项目」上 | 生命周期没单一主人 |
| 71181df6f9（库报错直送主进程原文） | 列表读失败的错误态没有统一出口 | 读面没主人 |
| 本题：回库 sendSync 等全库 + 卡片出来后全库同步检查 | 读面有同步 / 异步两条、内部同步扫描、状态检查挂在 mount + focus | 读面没主人 |

## 2. 为什么会一直出现

- `electron/projects/projectsIpc.ts:56-60`：同一个 `listProjects` 同时挂 `registerSyncIpc("nomi:projects:list")` 和 `ipcMain.handle("...list-async")`。
- `electron/projects/repository.ts:137-185`：`listProjects()` 内部 `listWorkspaceProjects` 对每个项目做 manifest 快照读（同步 fs），再有 GC、`existsSync`。换成 handle 也是在主进程事件循环里一口气跑完。
- 渲染层：`src/workbench/project/projectRepository.ts:116-120` 的 `listLocalProjects()` 仍调同步 `desktop.projects.list()`；`localProjectStore.ts` 的 SWR fetcher、`publishLocalProjectRecord`、`unpublishLocalProject` 都落到它；`src/workbench/assets/useAllProjectAssets.ts:159` 已经走 `listAsync`，说明异步面早就有，只是没收口。
- 卡片后：`ProjectLibraryPage.tsx:186-210` 的 `inspectSyncProjects` 对所有带 rootPath 的项目 `Promise.all` 一把发 `workspace.syncInspect`，无并发上限，且挂在 mount + window focus 上。
- 门岗：`electron/preload/ipcCall.ts` 的 `invokeSync` 没有白名单，谁都能加一条 sendSync。

## 3. 不改结构的话会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 把渲染层换成 `listAsync` 但不改 `listProjects` 内部：渲染层不再干等，但主进程 340ms 级的阻塞原样在，别的 IPC（保存、生成事件）排队，perf 数字几乎不变 | 只改渲染层后跑 `project-library-list`，同时看 `main-process-while-generating` |
| 库规模翻倍（80+ 项目）线性变慢 | 场景加 `--library-projects 80` |
| 下一条新通道又写成 `invokeSync` | 没有门岗，grep 即见 |

## 4. 靶子独立性

场景 `project-library-list` 与 10-16 追踪是同一条线（C-trace）出的数；本次按任务书先在最新 main 重测（数字见交付报告）。预算 300ms 已批准，不动。

## 5. P0：是我们独有的吗

「读一个目录下 N 个小 JSON 摘要、带缓存与失效」不是领域特有，是通用的异步读 + 缓存。渲染层已用 SWR（现成）；主进程这边应当用 `fs.promises` 限并发读，或由 registry 持有摘要缓存（manifest mtime 失效）。没有需要自写的新基础设施。

## 6. 对比表

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成 | 渲染层 SWR 继续用；主进程用 `fs.promises` + 现成限并发（p-limit 一类，已在依赖里则复用）读摘要 | 改 `repository.ts` / `workspace` 列举为异步，波及所有调用 `listProjects` 的主进程内部入口 | 触碰「项目目录单写口」概念（热点） | 是 |
| 补 | 只把渲染层换 `listAsync`、删同步通道 | 小 | 主进程仍同步扫描，预算大概率达不到（预测 1） | 否 |
| 重写 | 摘要缓存表（registry 内存 + mtime 失效） | 中 | 失效策略错了会出现陈旧卡片 | 备选，作为接入方案的第二步 |
| 删 | 删 `nomi:projects:list` 同步通道与 `desktop.projects.list` | 要先把渲染层所有入口改异步（见下 door-map） | 测试脚本 `tests/ux/*` 若干处还在用 `projects.list()` | 随接入方案一起做 |

## 7. 要用户（协调）权衡的核心

要不要放行一次「碰热点」的结构改动：把项目列表摘要读面收成单一异步主人（主进程内部也异步 + 限并发状态检查），一次删掉同步通道，而不是再补一刀。我的推荐：放行，因为只补渲染层一定达不到 300ms。

## door-map（已数）

- `listLocalProjects`：读入口 1 扇（`projectRepository.ts:116`，经 `localProjectStore.ts` 转出）。
- `refreshProjects`：读 3 扇、写 2 扇，共 13 处（`localProjectStore.ts`、`ProjectLibraryPage.tsx`、`NomiStudioApp.tsx` 的首屏 / 回库 / 导入后 / 删除后 / 外部改动后，`openWorkspaceFlow.ts:79`）。
- 同步通道残留：`desktop.projects.list` 在 `projectRepository.ts:119`；测试脚本 `tests/ux/antigravity-cli.live.walk.mjs`、`shot-nodes-media.e2e.mjs`、`library-load-error.walk.mjs`（注入 `nomi:projects:list` 故障）。

## 特征测试清单

未写：本页是停手报告，特征测试在协调放行后、动结构之前补（覆盖摘要读面、坏项目、回库首屏不等状态检查）。
