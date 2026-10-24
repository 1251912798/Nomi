# 方向检查：导出前的素材探测失败 = 导出失败（fix-churn 命中桌面文案词典）

> 触发：`node scripts/fix-churn.mjs` 命中——`electron/desktopStrings.ts`（文件 14 天第 10 个 fix）、概念「面向用户的文案不断言「零成本」或「会花钱」」（`delivery.money-copy-truth`，含 3 个文件，第 19 个）。导出这条线自己的文件（`electron/export/exportJobs.ts`、`mediaProbe.ts`、`exportAssetProbe.ts`、`electron/export/` 目录）都**没有**命中。设计卡：`docs/plan/2026-10-24-export-probe-failure.md`；根因合同：`docs/fixes/2026-10-24-export-probe-failure-silent-audio.root-cause.json`。

## 0. 一句话根因

命中的不是「同一类 bug 被反复修」：`desktopStrings.ts` 是主进程的文案词典，任何功能出一句新的失败文案都要改它；fix-churn 给渲染层词典（`src/i18n/locales/*.ts`）按功能键计数的例外（2026-10-05）没有覆盖桌面词典，`delivery.money-copy-truth` 又把这个词典登记成写口，于是每个加文案的 fix 都被算成同一处的又一刀。

## 1. 归类表

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 9de82f660 fix(prompt-library) | 提示词库的 i18n 改走 desktopT | 各自功能加 / 改桌面文案 |
| ddf304f0d fix(tasks) | 取回阶段的错误码分阶段 | 同上 |
| 7c66c1f0b fix(catalog) | 「哪一步交参考」换 owner，文案走 desktopT | 同上 |
| df728c339 fix(capability)、42736b307 fix(assets)、a1c712be9 fix(tasks) | #1213 一批：取产物上下文、落盘核字节、取回阶段码 | 同上 |
| 199ff9d26 fix(deconstruct) | 读图腿失败原话 | 同上 |
| 本次 | 导出前探测失败被吞成「没声音」 | 新增两条键 `export.probeUnavailable` / `export.assetUnreadable`；14 天内没有任何提交碰过 `export.*` 键 |

（fix-churn 数出 9 个，`git log --no-merges` 能看到上面 7 个，差的两个是它按自己的窗口和口径数的；结论不变：没有两条是同一个功能。）

## 2. 为什么这一类会一直出现

词典文件的「修改次数」量的是「多少功能在加文案」，不是「同一处在反复补」。渲染层词典 2026-10-05 已经因为同一个原因改成「文件#顶层功能键」计数；桌面词典是平铺的点号键（`export.*`、`review.*`、`tasks.*`），没被这条例外覆盖，概念单位 `delivery.money-copy-truth` 又把整个词典算进来，所以它会一直响。

导出这次的 bug 本身对应铁律 ⑫「点了 = 以为的」：用户点「导出」以为得到一份完整、有声音的成片，实际得到的是一份被静默去声的 MP4，还报了成功。修法在设计卡与根因合同里：导出侧调 ffprobe 收成唯一入口，失败只许抛、不许兜成「没声音」。这不是在词典上补刀，词典只是多了两句失败文案。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 下一个加桌面文案的 fix（任何功能）照样命中，第 11、12 个 | 下一个碰 `electron/desktopStrings.ts` 的 fix 提交跑 `node scripts/fix-churn.mjs --staged` |
| 桌面词典里真有一类键被反复补（比如 `export.*` 连改三次）时，信号被淹在噪音里，分不出来 | 同上：命中理由只给「文件第 N 个」，不给键族 |

## 4. 靶子独立性检查

- 计数器 `scripts/fix-churn.mjs` 不是本线写的；本线没有改它。
- 没有「修对了反而掉分」的先例；本次不涉及评测。

## 5. P0：这些是我们独有的吗

fix 计数是本仓库自己的流程工具，没有现成库可接；导出侧的修法用的是现成的 ffprobe（@ffprobe-installer），没有自写通用能力。

## 6. 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 无对应库 | — | — | — |
| 补（推荐，另开小 PR） | fix-churn 的词典例外扩到 `electron/desktopStrings.ts`：按键的第一段（`export` / `review` / `tasks`…）计数；`delivery.money-copy-truth` 的概念单位同样不按整个词典文件计数 | 工具 1 个文件 + 它的单测 | 低：阈值、窗口不变，只是计数单位从「文件」细到「键族」 | ✅ |
| 不改 | 每个加桌面文案的 fix 都写一份方向检查 | 每次一页文档 | 噪音淹掉真信号 | ❌ |
| 拆文件 | 把桌面词典按功能拆成多个文件 | 几千行搬家，牵动所有 desktopT 调用与 i18n 门岗 | 中 | ❌ |

本次导出修复本身：按设计卡做，不因为词典命中改方案。

## 7. 用户要权衡的核心

这次是计数口径把「加了两句文案」算成「同一处第 10 刀」；要不要让桌面词典也按键族计数（推荐要，另开一个工具小 PR），而这次导出修复照常走评审。

## 补记：同一 PR 里的第二个修复提交命中目录 `electron/export/`

本 PR 的修复提交（57cc560f9）之后，推送前 typecheck 发现渲染层的类型检查（`tsconfig.app.json`，lib ES2020）也编到 `exportAssetProbe.ts`，那里的 `Error` 构造不接受第二个参数（ErrorOptions 是 ES2022）。改成主进程现有的 `Object.assign(error, { cause })` 写法要再提交一次，fix-churn 报「目录 `electron/export/` 14 天第 3 个 fix」。

| 提交 | 直接原因 | 类 |
|---|---|---|
| 15d7a2f5d（10-10）fix(test) | 超时被放弃的用例在后台泄漏导出任务 | 测试收尾，与探测无关 |
| 57cc560f9（本 PR） | 探测失败被吞成「没声音」 | 本复盘的主题 |
| 本提交（本 PR） | 同一 PR 未合入前的类型兼容（ErrorOptions → Object.assign） | 同一处修复的自修，不是又一类 bug；文件本身未命中，只换写法、不加分支 |

结论不变：不是导出这条线在反复补。按 P1 的例外（只因目录口径命中、文件本身没命中、改法是换）交协调代批。

## 特征测试清单

- `electron/export/exportJobs.probeFailure.test.ts`：先红（改前 startExportJob 照常建任务、编码器拿到 audioCodec none / audioMode mute），改后绿，留作回归。
- `electron/export/exportAssetProbe.test.ts`：失败分类、文案（zh / en 都带下一步）、取消、单入口静态门。
- `electron/export/mediaProbe.test.ts`：ffprobe 进程失败的分类表（真进程：缺可执行文件 → probe_unavailable；坏文件 → probe_failed）。
