# 方向检查：主进程同步等外部进程（生成产物解码校验）

> 触发：`node scripts/fix-churn.mjs electron/assets/generatedMediaDecode.ts electron/assets/projectAssetStore.ts` 命中——目录 `electron/assets/` 近 14 天已有 4 个 fix，这一刀是第 5 个。
> 这 4 个 fix（文件身份比较、3D-BOX 参考种类、取回停止重下、取回只信精确 origin）与本刀不是同一个概念；本刀不是第 N 轮补丁，而是把一处同步等待**换**成异步等待。用户 10-16 已拍板：链路上一眼能定、框架明确反对的写法直接修。

### 0. 一句话根因

主进程里「等外部进程」没有结构约束：`spawnSync` 写起来和 `spawn` 一样顺手，小文件上几十毫秒就回来，写的人当场看不出它会把整个应用冻住；门岗只管出网记账（`offLedgerEgress.structure.test.ts` 把它登记成「本机媒体处理、不在付费派发里」就放行了），没有一道门问「它会不会冻住主进程」。

本波共同类根因（`_perf-method` 第 0 节）：高频路径上各功能各自往里挂东西，没有结构约束、没有按操作计数的预算，每加一个功能就再慢一点，只在用户手里才被发现。本概念的特化：**主进程的事件循环被同步子进程等待占住**。

### 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 0.23.1 用户反馈「卡的时候点什么都没反应，点设置也不立即响应」 | `generatedMediaDecode.ts` 用 `spawnSync` 在主进程跑 ffmpeg 校验每个生成产物，等待上限 12–120 秒（v0.22.5 没有，v0.23.0 起有） | 主进程同步等外部进程 |
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
