# 方向检查：主进程错误的类名过 IPC 后进日志（N-nightly 第 2 轮 C1）

> 触发：`node scripts/fix-churn.mjs` 命中——目录 `src/desktop/`（第 11 个 fix）、`electron/logging/`（第 3 个）、`electron/shared/contracts/`（第 7 个）、`src/workbench/observability/`（第 3 个）、`src/workbench/creation/storyboard/exec/`（第 4 个）；概念「失败落盘的样子」「生成错误怎么说成人话」各第 3 个；自写登记 **`logging-and-crash`**（under-review，30 天第 5 个）。命中都在目录 / 概念 / 自写登记口径，改到的文件本身没有一个单独命中。
> 协调口径（任务书 N-nightly-r2 §3）：类名是代码里定义的标识符，不是用户数据，不脱敏；错误消息照旧指纹化。脱敏只放行「代码里定义的类名」这一种形状，判据写成结构上的，不列名单。
> 本次改法是**换**（Electron invoke 外壳的读法收成一处，删掉三处各写各的；日志脱敏的类名判据换成同一份形状）和**删**（渲染层不再把普通对象的 `name` 字段当类名），不新增分支。

## 0. 一句话根因

主进程 `ipcMain.handle` 抛的错，Electron 只把一句话送回渲染层（`Error invoking remote method '<通道>': <类名>: <信息>`，name 一律是 `Error`），而仓库里没有「这句话怎么读」的唯一读法：渲染层日志出口根本没读它，于是类名一直躺在消息正文里；10-22 起消息正文落盘只给指纹，类名就跟着被指纹化了。

## 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| C1：renderer-failure-diagnostics 夜跑红（10-22 后），日志只剩 `Error msg#d559bf39` | `summarizeRendererError` 取 `error.name`（invoke 回来的是 `Error`），类名在 message 里；`diskSafeErrorFacts` 把整句 message 指纹化（`8f684ebb9` / `170d2182a` 起） | 没有 invoke 外壳的唯一读法 |
| 2026-09-24 锁忙被说成「请检查磁盘权限」 | 渲染层按 `error.name` 认锁忙，invoke 回来的 name 是 `Error`；后补 `message.includes('WorkspaceManifestLockBusyError:')` | 同上（各处各写一个读法） |
| 错误卡首行是「Error invoking remote method …」 | `classifyError` 私有正则 `IPC_WRAPPER_PREFIX` 剥壳 | 同上 |
| 镜头表技术详情带 IPC 外壳 | `storyboardFailureCopy` 又写一个剥壳正则 | 同上 |
| 单测全绿而真路径红 | `electron/logging/rendererLog.test.ts` 喂的是 `name` 已经是真类名的错误，不是 invoke 真形状 | 测试没按真实形状造输入 |

## 2. 为什么这一类会一直出现

- Electron 官方写明：handle 里抛的错「不透明，只把 `message` 送回渲染层」（https://github.com/electron/electron/blob/main/docs/api/ipc-main.md ，#24427）；preload 里补结构也过不了 contextBridge——跨世界的 Error 只拷消息，自定义属性丢（https://github.com/electron/electron/blob/main/docs/api/context-bridge.md ，#25596）。所以渲染层能拿到的类名**只**在那句话里。
- 每个需要类名的地方（锁忙文案、错误卡首行、镜头表详情、日志）各写一个读法，日志出口这一处干脆没读。10-22 之前日志把整句原文（剥路径）写进去，类名「顺便」活着；10-22 把原文换成指纹，这条顺便的路断了，而测试喂的是理想形状，没看见。
- 类根因：缺「invoke 外壳怎么读」的唯一 owner，以及「类名长什么样」的唯一判据。
- 三条体验铁律：⑩ ⑪ ⑫ 均不适用（诊断 / 隐私类，不涉及参数一致、可选项或点击预期）。结账挂的类检查：`electron/logging/rendererLog.test.ts` 用主进程真错误类 + Electron 真外壳走到盘上那一行；`electron/shared/contracts/ipcInvokeFailure.test.ts` 普查全仓代码里定义的错误类名都过形状判据。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 任何经 invoke 回来的主进程失败，诊断包日志里都只有 `Error msg#…`，排障看不出是哪类错 | `node tests/ux/renderer-failure-diagnostics.walk.mjs`（修前红：那一行没有 `WorkspaceManifestLock`） |
| 下一个要认主进程类名的界面再写第五个剥壳正则，和现有四个各有出入（`\s*` / 单空格、`includes` / 锚定） | `rg "Error invoking remote method" src electron` |
| 普通对象的 `name` 字段（项目名、素材名）被当成类名送进日志，形状判据只要求是标识符 | 修前 `summarizeRendererError({ name: 'MyFilm', message: 'x' }).name === 'MyFilm'`；`diskSafeErrorFacts` 对 `sk_live_…` / `ghp_…` 这类小写开头的凭据形状照放（`electron/logging/redact.test.ts` 修前红） |

## 4. 靶子独立性检查

- 靶子是第 1 轮之前就有的走查 `tests/ux/renderer-failure-diagnostics.walk.mjs`（2026-09-24 立，真 Electron、真锁、真导出诊断包），不是本线写的；本线不改它。
- 没有「修对了反而掉分」的先例；不碰评测。
- 靶子本身无误：它要的正是「包里的那一行说得出为什么」，且不含项目名 / 用户名 / 文档内容——本次两条都守。

## 5. P0：这些是我们独有的吗？现成方案有哪些

- 自写登记 id：**`logging-and-crash`**（under-review，reviewBy 2026-11-30；结论方向「落盘交给 electron-log，只留脱敏规则」）。本次改的是登记里要保留的脱敏规则（类名判据），不新增落盘能力；日后换 electron-log，这条判据原样当它的错误序列化钩子。
- invoke 错误的结构化传递，现成方案查过：
  - Electron 自身：不提供（上面两条官方文档）。
  - electron-trpc（Context7 `/jsonnull/electron-trpc`，2026-10-24 查）：主进程把抛出的错转成 TRPCError + 错误形状发回，渲染层得到 TRPCClientError——要把 IPC 整体迁到 tRPC 路由（本仓 6 个 preload 文件里 218 处 `ipcRenderer.invoke`、对应全部 handle），是架构级迁移。
  - serialize-error / electron-better-ipc（sindresorhus，https://github.com/sindresorhus/serialize-error 、https://github.com/sindresorhus/electron-better-ipc ）：同样要求每个 handle 改成「返回序列化错误」或换通道 API，迁移面同上。
- 结论：现成方案能把错误对象完整送过来，但都要换掉整条 IPC；在那之前，Electron 送回的那句话是唯一来源，「怎么读」只能自己写一处。迁移 IPC 交协调另立项（见 §7）。

## 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | IPC 迁 electron-trpc 或 electron-better-ipc（错误整对象过来） | 218 处 invoke + 全部 handle 改写 | 本轮做不完；迁移期两套并存 | 否（本轮）；作为长期项交协调 |
| 补 | 在 `summarizeRendererError` 里再写一个正则把类名抠出来 | 一处 | 第五个读法，和另外四个继续各有出入；第 11 刀 | 否 |
| **换 + 删（推荐）** | 新建 `electron/shared/contracts/ipcInvokeFailure.ts`：invoke 外壳的唯一读法 + 「代码里定义的类名」的唯一形状（大写开头的标识符，≤64 字）。日志出口、锁忙判据、错误卡首行、镜头表详情都经它，删掉三处私有读法；`diskSafeErrorFacts` 的类名判据换成同一份形状；渲染层不再拿普通对象的 `name` 当类名 | 一个新文件、五处改用 | 剥壳行为要与旧正则逐字一致（特征测试钉住） | **是** |
| 删 | 不记类名 | 无 | 诊断包又说不出为什么（09-24 那个缺口回来） | 否 |

## 7. 用户要权衡的核心

日志里的错误类名从此照写（它是代码里的名字，不是用户的东西），消息照旧只给指纹；代价是多一处自己写的「Electron 那句话怎么读」——它在 IPC 整体换成能传结构化错误的方案之前一直要留着。

## 特征测试清单（动结构前先锁住）

- `electron/shared/contracts/workspaceBusy.test.ts`：锁忙错误直接拿到 / 经 IPC / 包在 cause 上都认，磁盘权限不算（4 条，改前改后都绿）。
- `src/workbench/generationCanvas/runner/classifyGenerationError.test.ts`：错误卡对 `Error invoking remote method 'nomi:tasks:run': Error: …` 的剥壳与分类（多条，改前改后都绿）。
- `src/workbench/creation/storyboard/exec/storyboardFailureCopy.test.ts`：技术详情不带 IPC 外壳（改前改后都绿）。
- `electron/shared/contracts/ipcInvokeFailure.test.ts`（新）：新读法的剥壳结果与旧两个正则逐条相等（同一组输入），全仓 `this.name = '…'` 普查都过类名形状。
- 修前红（在未改产品代码的树上跑，7 条红）：`electron/logging/rendererLog.test.ts` 新增的「主进程真错误类 + Electron 真外壳」一条、`src/desktop/rendererLog.test.ts` 的外壳 4 条与普通对象 1 条、`electron/logging/redact.test.ts` 的类名形状一条。
- 修前修后都绿、专钉新增的那一步：`electron/logging/rendererLog.test.ts`「主进程那句消息跨行、某一行长得像栈帧」——摊平后若不跟着换栈首部，主进程切不准首部，那一行就冒充帧落盘。

## 登记

- 自写登记 `ipc-invoke-failure-text`（under-review，reviewBy 2026-11-23；结论方向：IPC 迁到能传结构化错误的方案后删掉）。
- 概念 `diagnostics.ipc-invoke-failure`（owner `electron/shared/contracts/ipcInvokeFailure.ts#ipcInvokeFailure`）；根因合同 `docs/fixes/2026-10-24-ipc-error-class-name-fingerprinted.root-cause.json`。
