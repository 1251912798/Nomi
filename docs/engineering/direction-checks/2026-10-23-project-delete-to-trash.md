# 方向检查：删项目改成进回收站（⑭，P-library-2，RW 短版）

> 触发：`node scripts/fix-churn.mjs` 报以下文件是近 14 天里的第 N 刀：
> - `electron/workspace/workspaceRepository.ts`：第 6 刀
> - `electron/projects/repository.ts`：第 5 刀
> - `src/workbench/NomiStudioApp.tsx`：第 6 刀
> - 概念 `project.directory-lifecycle`：第 6 刀
>
> 改法是「**换**」：把删项目目录的永久删除（`fs.rmSync`）换成进系统回收站（Electron `shell.trashItem`），旧写法在同一提交删掉，不新增分支。
> 产品方向已由用户 10-22 拍板（⑭）。
>
> **用户 2026-10-23 拍板：按推荐**：
> - 改法「换」获批：先进回收站，成功并核过原路径不在了，才从库里摘掉；
> - 确认框文案按平台叫法（回收站 / 废纸篓，Recycle Bin / Trash）；
> - 还原后下次启动回到项目库；
> - 不加「仍要永久删除」二次选项；
> - 失败分三类说（权限 / 该位置没有回收站 / 文件被占用），其余写「详细原因已记进日志」。
>
> `workspaceFileDelete.ts:42`（删单个素材时，旁边的说明文件进不了回收站会退回永久删除）记进设计卡「后续」，⑭ 合入后作为下一单做，同一原则。

## 0. 一句话

项目文件夹今天只有一种删法：用户确认「删除文件」后立刻 `rmSync`，永久删除、找不回。

⑭ 要求改成：
- 进系统回收站，可以恢复；
- 进不了回收站，就明确告诉用户、什么都不删；
- 绝不悄悄退回永久删除。

## 1. 删除入口（door-map 已数，origin/main 1c7e10d2c）

| 入口 | 位置 | 今天 | 换完 |
|---|---|---|---|
| 项目库卡片的删除按钮（普通卡、灰卡同一个按钮） | `ProjectLibraryPage.tsx:541` → `NomiStudioApp.deleteProject`（`NomiStudioApp.tsx:502` 起）→ `projectDeleteChoice` 选意图 → `deleteLocalProject`（`NomiStudioApp.tsx:526`） | 同步 IPC | 异步 IPC |
| 渲染层到主进程 | `projectRepository.deleteLocalProject` → preload `invokeSync("nomi:projects:delete")`（`preload.ts:161`）→ `projectsIpc.ts:100` `registerSyncIpc` | **sendSync**，等删完才返回 | `ipcRenderer.invoke` / `ipcMain.handle`；同步通道从 `renderer-sync-ipc-baseline.json` 删掉（只减不增） |
| 主进程删除口 | `repository.ts` `deleteProject`：按意图分支 | unbind 只解绑；delete-files 走下面两条 | 不变 |
| 删 workspace 项目目录 | `workspaceRepository.ts:436` `deleteWorkspaceProject`：`fs.rmSync` 整个目录，并且**先解绑再删** | 永久删除；删失败时登记已经没了 | **先进回收站，成功后才解绑**；失败就什么都不动，原样报错 |
| 删老格式项目目录 | `repository.ts:315` legacy 分支：`fs.rmSync` | 永久删除 | 同上，换成进回收站 |
| MCP / Agent | 没有删项目的工具（`capabilityCore` 只有 `deleteProjectNodes`，删的是画布节点） | — | 不变；清单里列一条「确认仍然没有」 |
| 右键菜单 | 项目库没有右键菜单 | — | 不变 |
| 浏览器预览（没有桌面桥） | `projectRepository.deleteLocalProject` 删 localStorage | 没有回收站这个概念 | 不变 |
| 同类先例 | `workspaceFileDelete.ts:39` 删单个文件已经走 `shell.trashItem`；**但 `:42` 处理旁边的 meta 文件时，进不了回收站会退回 `rmSync`** | — | 不在本刀范围，记跟进（它和「绝不静默退回永久删除」的拍板不一致，要用户定 meta 文件算不算） |

## 2. 平台差异（已查 Electron 源码）

- **Windows**：`shell/common/platform_util_win.cc` 的 `MoveItemToTrashWithError` 用的是 `IFileOperation`，带 `FOFX_RECYCLEONDELETE`，还挂了一个进度回调 `DeleteFileProgressSink`。
  - 遇到进不了回收站的项（网络盘、可移动盘、回收站关掉、超过回收站容量），这个回调里的 `PreDeleteItem` 直接返回 `E_ABORT`，整个操作报 `Operation was aborted`。
  - **Electron 自己不会退回永久删除**。
  - 有 `FOFX_SHOWELEVATIONPROMPT`：需要管理员权限时可能弹出系统提权框。
- **macOS**：`NSFileManager trashItemAtURL`。没有废纸篓的卷（多数网络共享）会直接失败、返回错误，不会删。
- **Linux**：走桌面环境的回收站（freedesktop trash）。没装桌面环境或文件系统不支持时会失败。
- **我们自己再加一道保险**（换完的写法）：
  - `trashItem` 报错，就当失败：不解绑、不删，原样告诉用户；
  - `trashItem` 成功后再核一次原路径确实不在了，才解绑登记；
  - **全仓删项目目录的地方不再有任何 `fs.rmSync`**。门岗 `check:read-path-writes` 的销毁门名单不变，换完仍然只有 `deleteWorkspaceProject` 一扇门。

## 3. 恢复与撤销

- **Nomi 里没有撤销按钮**：要找回，就从系统回收站「还原」。
- 还原后文件夹回到默认根里原来的位置。因为删除时已经解绑了登记，它会被**启动发现**（`discoverLegacyProjects`）当成没登记的项目重新收回。
  - 默认：**下次启动 Nomi 时回到项目库**，删除成功的提示里写清这一点。
  - 备选：项目库每次获得焦点都重新跑一次发现，还原后切回 Nomi 就能看到。代价是每次聚焦多一遍扫描默认根（只扫没登记的目录，成本正比于新目录数）。推荐默认那版。
- 外部文件夹（打开文件夹绑定的）始终只解绑，不进回收站，行为不变。

## 4. 推荐

做「换」。理由：
- 删除只有一扇门（workspace）加一个 legacy 分支，两处都换，没有新分支；
- Electron 自带的回收站在 Windows 上已经保证不会退回永久删除；
- 同步通道顺手删掉（门岗基线只减）；
- 先进回收站、成功了才解绑，比今天「先解绑后删」的顺序更安全。

「确认后永久删除」做不做成二次选项：**建议不做**，只写进设计卡。回收站进不去的地方（网络盘、可移动盘）多半也是用户自己的目录，让用户自己去资源管理器或访达里处理更稳。真有需要，用户再拍板加。
