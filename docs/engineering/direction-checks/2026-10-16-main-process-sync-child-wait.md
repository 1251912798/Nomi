# 方向检查：主进程同步等外部进程（生成产物解码校验）

> 触发：`node scripts/fix-churn.mjs electron/assets/generatedMediaDecode.ts electron/assets/projectAssetStore.ts` 命中——目录 `electron/assets/` 近 14 天已有 4 个 fix，这一刀是第 5 个。
> 这 4 个 fix（文件身份比较、3D-BOX 参考种类、取回停止重下、取回只信精确 origin）与本刀不是同一个概念；本刀不是第 N 轮补丁，而是把一处同步等待**换**成异步等待。用户 10-16 已拍板：链路上一眼能定、框架明确反对的写法直接修。

### 0. 一句话根因

主进程里「等外部进程」没有结构约束：`spawnSync` 写起来和 `spawn` 一样顺手，小文件上几十毫秒就回来，写的人当场看不出它会把整个应用冻住；门岗只管出网记账（`offLedgerEgress.structure.test.ts` 把它登记成「本机媒体处理、不在付费派发里」就放行了），没有一道门问「它会不会冻住主进程」。

本波共同类根因（`_perf-method` 第 0 节）：高频路径上各功能各自往里挂东西，没有结构约束、没有按操作计数的预算，每加一个功能就再慢一点，只在用户手里才被发现。本概念的特化：**主进程的事件循环被同步子进程等待占住**。

### 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 0.23.1 用户反馈「卡的时候点什么都没反应，点设置也不立即响应」 | `generatedMediaDecode.ts` 用 `spawnSync` 在主进程跑 ffmpeg 校验每个生成产物，等待上限 12–120 秒（同步校验在 v0.22.5 就有（当时在 projectAssetStore 里）；v0.23.0（#938）改成 framehash 解码并把按大小的超时上限扩到 120 秒，变得更重，v0.23.1 继承） | 主进程同步等外部进程 |
| 同一校验也被截图、抽帧、剪辑、深度视频、运镜成片、本地任务导入调用 | 这些入口都写 `kind: "generated"`，全部经过同一个同步校验 | 同上（同一扇门的不同调用者） |

### 2. 为什么这一类会一直出现

- 写法本身没有成本信号：`spawnSync` 的返回值比 `spawn` 好用，测试里也全绿；只有「大视频 + 忙机器」才冻。
- 现有门岗问错了问题：出网登记表关心「这个子进程会不会花钱」，把同步校验登记成 `outside-paid-dispatch` 就过了；`check:heavy-path` 有渲染层同步编码一条，但主进程同步子进程没有对应条目。
- 体验铁律：⑫「点了=以为的」——用户点设置，以为马上打开，实际要等 ffmpeg。这条没有按操作计数的证据（主进程往返延迟），所以没被量到。

### 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 新的本地媒体处理（转码、抽音轨、探测）再写一处 `execFileSync` / `spawnSync`，同样冻主进程 | `node scripts/check-heavy-path.mjs`（本刀加的 `main-sync-child-process` 规则，基线 0）|
| 异步化以后同一资产并发写交错出半成品 | `electron/assets/projectAssetStore.test.ts` 并发写用例；`electron/tasks/localTaskJobs.test.ts` 单飞导入用例 |

### 4. 靶子独立性检查

- 尺子：「校验期间排一个 `setImmediate`，它要在校验结束**之前**执行」——这是事件循环语义本身，不依赖实现者写的 oracle。
- 原判决测试（`generatedMediaDecode.test.ts` 的真实编码器矩阵）全部保留，只把同步调用改成 await。

### 5. P0：这些是我们独有的吗？现成方案有哪些

不是独有的。异步子进程是 Node 平台自带能力（`child_process.execFile`：自带 `timeout` 击杀、`maxBuffer` 上限），Electron 官方性能指南明确要求主进程不做阻塞 I/O / 长等待（[Electron v43.4.1 docs/tutorial/performance.md](https://raw.githubusercontent.com/electron/electron/v43.4.1/docs/tutorial/performance.md)）。本刀直接接平台能力，不自写进程管理。

### 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案（**换**） | `spawnSync` → `execFile` + Promise；落盘函数 await 校验后进同步临界区 | 写入函数签名变 async，十来个调用方加 await | 异步化后的并发交错——由「校验后不再让出」的临界区 + 本地任务单飞导入兜住 | ✅ |
| 放进 utility process | 校验整个挪到独立进程 | 多一层进程管理与 IPC；收益与 execFile 相同（等待本来就在 ffmpeg 子进程里） | 更大的改动面，不利于回补 0.23.2 | |
| 补 | 只把超时调小 | 治标：仍冻主进程，且会把大文件误判成「没验证成」 | 用户付了钱的产物被拒 | ✗ |
| 删 | 去掉校验 | 坏文件重新进项目 | 违反「先校验、通过才发布」 | ✗（任务书明令禁止） |

结构性岔路（不在这一刀做，交协调）：主进程里其余同步 fs（大文件 `readFileSync` / 哈希）属于性能指南附录 M02，词法上分不清大小，需要测量后另开一刀，见交付报告。

### 7. 用户要权衡的核心

没有需要用户权衡的取舍：校验一个字节都没少，只是等待从「冻住整个应用」变成「后台等」。

## 特征测试清单（动结构前先锁住）

- `electron/assets/generatedMediaDecode.test.ts`：真实编码器判决矩阵（修前修后都绿）＋「校验期间事件循环照转」（修前红）。
- `electron/assets/projectAssetStore.test.ts`：三个落盘入口校验期间事件循环照转（修前红）、同一确定性资产并发写不出半成品。
- `electron/tasks/localTaskJobs.test.ts`：导入单飞、取消与导入不交错。
- `scripts/check-heavy-path.mjs`：`main-sync-child-process`（修前红：命中 `generatedMediaDecode.ts` 两行）。

---

## 第二次复盘（2026-10-16，P1 熔断：同线第 3 轮修补前停下）

触发：这条线首轮实现后，独立验收 V-1208 首轮报两项（V-1208-1 校验字节≠发布字节、V-1208-2 等待期间项目被换绑），修了一轮；复验确认这两项过了，但又冒出 3 个同类回归（V-1208-3 浏览器导入提前删源文件、V-1208-4 路径型写入失去整文件原子发布、V-1208-5 新增整文件同步写盘占住主循环）。按 P1 停止派修补，先复盘、交用户拍板。本节不改代码。

### 0. 一句话根因

为了把**一个等待**（解码校验）挪出主进程，我把**共享的同步写入边界**（`writeAsset` / `writeDeterministicAsset` / `moveAssetFile`）整体改成了异步；这个边界有 16 + 3 + 2 扇门，每个调用方原来都靠「调用返回时文件已经落好」这件事安排时序、原子性和清理，契约一变，所有调用方的这些假设同时失效，只能一个个碰到一个个补，补不完。

更上一层：任务书推荐的是「异步的只有校验，同步写入只吃已校验的产物」，首轮我以「改动面大」为由没做，只讲了它的代价，没讲它防的是什么——它防的正是这一族。

### 1. 归类表

| 编号 | 直接原因 | 类 |
|---|---|---|
| V-1208-1 | 等待期间调用方改写自己的 Buffer，await 回来后发布的是改写后的字节 | 写入边界变异步 → 「输入在调用时刻就是定稿」的假设失效 |
| V-1208-2 | 等待期间项目被换绑，await 回来后按新绑定解析根目录 | 写入边界变异步 → 「调用时刻的项目就是写入的项目」的假设失效 |
| V-1208-3 | `importBrowserMedia` 在 try 里 `return moveAssetFile(...)`（没 await），finally 先删了临时目录 | 写入边界变异步 → 调用方「返回时源文件已被移走、可以清理」的假设失效 |
| V-1208-4 | 为修 V-1208-1，move / GLB upload 改成往正式路径直接写 Buffer，失去 rename / 暂存 + link 的整文件原子发布 | 在异步边界上补一致性时，把原有的原子发布换掉了 |
| V-1208-5 | 同上的整文件 `writeFileSync`（200MiB ≈ 145–190ms）重新占住主循环 | 同上：补丁把重活又放回了同步临界区 |

五条同一个类：**写入边界的时序契约从同步改成了异步**。1–3 是契约变化直接打穿调用方的假设；4–5 是在异步边界上打补丁时，为了让「等待后再发布」成立而换掉了原来原子、廉价的发布方式。

### 2. 为什么这一类会一直冒

- 门数多、形状杂：19 扇门里有字节入口、路径入口、内容寻址上传、确定性物化、本地任务同步提交，每类对「返回即落盘」的依赖方式不同（finally 清理、sync 单飞、rename 原子性、AssetWriteContext 复验）。
- 类型系统只能看见「返回了 Promise」，看不见「调用方以为返回时已经落盘」：tsc 和测试类型门岗都绿，V-1208-3 照样漏（ESLint 没开类型感知的 `return-await` / `no-floating-promises`）。
- 每补一处都在异步边界里加东西（钉字节、捕获身份、改发布方式），每加一样又改了一条原有不变量（原子发布、同步写量），于是越补面越大。

### 3. 两个方向对比

**A：保持异步写入边界，继续逐个补**

- 要做：
  - V-1208-3：browserViewMedia 两处改 `return await`，并普查所有 `return writer()` 落在 try/finally 里的调用方。
  - V-1208-4：move / copy 的已校验分支改成「异步写私有暂存 → 同步 rename / link 发布」；`uploadContentStore.publish` 的 catch 补删残缺媒体。
  - V-1208-5：V-1208-4 修完自然消失。
  - 还要开类型感知 lint（`@typescript-eslint/return-await: in-try-catch`、`no-floating-promises`）拦同类：这要给全仓 lint 挂 type-aware parser，CI 成本明显上升，存量告警未知。
- 改动面：在现分支上再加约 150–250 行；调用方保持全部 async（已改的 14 个文件不回退）。
- 风险：高。19 扇门全部带着新时序契约；验收已经三轮出新回归，下一类假设（例如别的调用方依赖返回即落盘做后续 sync 读、退出流程里没等写完）只能靠下一轮验收碰。lint 规则只能拦「没 await」，拦不住「await 了但中间状态被别人看见」。
- 动多少调用方：现有 14 个文件维持 async，再普查 try/finally 型调用方（至少 browserViewMedia 2 处）。

**B：写入边界恢复同步原子写（与 main 相同），异步的只有「暂存 + 校验」那一步**

- 形状：
  1. 新增异步准备函数 `prepareVerifiedGeneratedAsset`（名字待定）。它在调用方已经是异步的那一层先跑：
     - 进门捕获 `AssetWriteContext`；
     - 把字节或源文件**异步**写 / 拷进本项目根下的私有暂存（与正式路径同卷）；
     - 在**暂存文件上**跑异步解码校验。暂存只有边界自己持有，所以「校验的就是要发布的那份」。
     - 产出品牌类型「已校验暂存件」，里面带 context、meta、contentType、哈希。
  2. 同步发布函数只吃这个品牌类型，依次 `assertCurrent` 复验 → 选路径 → `renameSync` 原子发布 → 写 sidecar → 广播。整段同步，O(1) 发布。
  3. `writeAsset` / `writeDeterministicAsset` / `moveAssetFile` / `copyAssetFile` 回到 main 的同步签名和行为（move 走 rename，GLB upload 走 persistUploadFile 暂存 + link）。遇到 `kind: "generated"` 且没有已校验暂存件时**拒写**，fail closed：生成产物只能经「准备 → 发布」两步。拒写防线是运行时断言加测试；如需门岗，再加一条「生成产物不得绕过发布函数」的静态扫描。
  4. 写生成产物的调用方改成 `await prepare… → publish…`，或用一个 async 便利函数包起来。它们本来就在异步上下文里，共 10 个文件 13 处：importRemoteAssetToStore 两处、materializer 两处、antigravity、codexCli、processOperation、screenshotHotkey、depthVideoJob、extractVideoFrame 两处、framesToVideo、trimVideo。
  5. 写非生成产物的调用方回到 main 的同步调用：localFileImport、demoAssetSeed、browserViewMedia、customCallDispatch（它写的是 `kind: wantedKind`，本来就不过解码校验）。
  6. copyAssetFile 的生成产物分支：`copyNativeFileToBucket` 本来就是「拷进暂存 → link 发布」，只需在 link 前校验暂存快照，路径型入口天然满足「校验的就是发布的那份」。
- 保留：异步 `runDecoder` / `verifyGeneratedMediaDecodes`（改为只校验边界自己的暂存文件路径），门岗 `main-sync-child-process`，LocalTaskJobs 与 Codex 的单飞导入（V-1208 已验过）。暂存清理复用现有 `.nomi-upload-*` 前缀与 `reapAbandonedUploadStaging`。
- 改动面：projectAssetStore / verifiedAssetBytes 重写约 150 行；非生成调用方回退到 main 写法（多数是删 await）；生成调用方 13 处改调用名。相对 main 的净改动会比现在小。
- 风险：中低。对 19 扇门里的非生成调用方，契约回到 main，不再有新时序；生成调用方本来就在异步上下文里，只多一步显式的「准备」。剩余风险集中在新的「准备 → 发布」两步之间：暂存件要跟着取消、退出被清理，这部分复用现有暂存清理，要补测试。
- 动多少调用方：13 处改调用（生成）+ 约 6 处回退（非生成）+ 测试回退或调整。

**推荐：B。**

理由：B 把「异步」限制在唯一真正需要等的一步上，写入边界对所有调用方保持 main 的同步原子契约。这样同类问题不是逐个补掉，而是没有发生的余地。A 的每一处补丁都在扩大异步边界，三轮验收已经证明这条路收敛不了。B 也正是任务书原本推荐的形状。

代价：再改一轮（约等于首轮的工作量），已经通过的部分（V-1208-1、V-1208-2 的对抗用例、单飞导入、门岗）都要在 B 上重跑。

### 4. 用 B 的话，V-1208-3 / 4 / 5 是否自然消失

| 编号 | B 下 | 为什么 |
|---|---|---|
| V-1208-3 | 消失 | browserViewMedia 只写 capture / reference，走回到同步的 `moveAssetFile`：返回时文件已经移走，finally 清理安全（与 main 相同）。对抗用例保留为回归。 |
| V-1208-4 | 消失 | 非生成路径回到 main（move = rename，GLB upload = 暂存 + link）。生成路径是「异步写暂存 → 同卷 `renameSync`」，整文件原子发布；校验或写暂存失败只清暂存，正式路径从不出现残片。V-1208 的磁盘满注入用例保留为回归。 |
| V-1208-5 | 本次新增的那部分消失；main 原有的不变 | 大文件写入都在异步准备阶段（`fs.promises` 写或拷暂存），同步临界区只剩 rename + 小 sidecar。main 上原本就有的同步写盘（`writeAsset` 往正式路径 `writeFileSync` 调用方的 Buffer）B 不会加重，也不处理，仍归性能报告 M02。若顺手让生成产物的字节入口也走暂存，这部分对生成产物也一并消失。 |
| V-1208-1 / 2 | 继续成立 | 暂存件只有边界持有，校验和发布是同一个文件；context 在准备阶段捕获、发布前复验。 |

### 5. 用户要权衡的核心

再花一轮把写入边界改回同步、只把校验做成异步（B，根上收住这一族），还是在现在的异步边界上继续补（A，改得少，但每轮都可能冒新的同类问题）。

### 6. 拍板与落地（2026-10-16）

用户拍板走 B（原话「1208 按推荐走」）。落地形状：

- 新模块 `electron/assets/generatedAssetStaging.ts` 的 `prepareVerifiedGeneratedAsset` 负责异步那一半，产出品牌类型 `VerifiedStagedAsset`：
  - 进门（任何 await 之前）钉住字节；
  - 捕获 `AssetWriteContext`；
  - 把字节或源文件异步写进本项目根下的 `.nomi-upload-*` 暂存；
  - 在暂存文件上做内容校验和异步解码。
- `projectAssetStore.publishVerifiedGeneratedAsset` 负责同步那一半，只收 `VerifiedStagedAsset`：
  - 复验项目身份 → `renameSync` 原子发布 → 写 sidecar → 广播；
  - 无论成败，都收掉暂存。
- `writeAsset` / `moveAssetFile` / `copyAssetFile` 的非生成分支恢复 main 的同步契约，遇到 `kind: "generated"` 拒写。
- 解码器只校验暂存件路径。
- 回归：V-1208-1/2/4/5 进 `electron/assets/projectAssetStore.publishIdentity.test.ts`；V-1208-3 进 `electron/browser/media/browserImportCommit.test.ts`。
- 变异校验：
  - 把发布改回「往正式路径直接写字节」，V-1208-4/5 的 6 条全红；
  - 把 `moveAssetFile` 改成异步，浏览器导入闭环报 ENOENT 变红。
