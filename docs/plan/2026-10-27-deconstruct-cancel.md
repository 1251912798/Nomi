# 设计卡：拆解取消真停（主进程一条取消边界）

```
改动名：点了取消，主进程停止拆解的全部后续调用   线/负责人：I-deconstruct-cancel   类别：[花钱][可打断]
```

- 状态：**前提已实测成立，停在设计卡**。方向检查命中的是要改的文件本身（`deconstructVideo.ts`、`extractVideoFrame.ts`、`runtime.ts`、`audioTaskRunner.ts`、`customCallDispatch.ts`），按流程本卡提交后停下，结构性结论交用户拍板；拍板前不动生产代码。
- 方向检查（类根因复盘 + 选项表 + 待拍板）：`docs/engineering/direction-checks/2026-10-27-deconstruct-cancel.md`。
- 前提实测（特征测试，2026-10-27 提交，全绿 = 现状）：`electron/video/deconstructCancellation.test.ts`、`electron/video/videoIpcSession.test.ts`、`src/workbench/generationCanvas/nodes/shotTable/deconstructionTerminalState.test.ts`。

### 功能分类
- [ ] 新界面 / 改交互
- [x] 花钱
- [x] 长跑 / 可打断
- [ ] Agent 行为
- [x] 大数据量 / 画布 / 长列表（路径推出：改 `src/workbench/generationCanvas/`；不改画布渲染与规模，证据写「不适用」+理由）
- [ ] 生成效果
- [ ] 数据格式
- [x] 新增功能 / 性能（路径推出：新增 `AbortSignal`、文件名含 cancel；不新增交互，见 ★7）

| 格 | 结论 | 证据 |
|---|---|---|
| ★0 先查别人 | ① Electron `ipcRenderer.invoke(channel, ...args)`：只有通道和结构化克隆的参数，没有取消机制（<https://www.electronjs.org/docs/latest/api/ipc-renderer#ipcrendererinvokechannel-args>）· **确认了**「取消必须是第二条按 requestId 寻址的通道」，AbortSignal 过不了 IPC；② Node `child_process.spawn` 的 `signal` 选项：abort 等同 `kill()`，子进程发 `error`（`AbortError`），默认 `SIGTERM`（<https://nodejs.org/api/child_process.html#child_processspawncommand-args-options>）· **改了**「三处 ffmpeg 叶子各自手写 kill」的打算：直接把 signal 交给 spawn；同时**确认了**要防 `error` 与 `close` 双触发（settle 一次）；③ 补预览的请求登记 `electron/assets/previewRequests.ts:23-67`：`senderId:requestId` 寻址（别的窗口撤不了）、发起窗口 `destroyed` 即撤、项目会话按周期复核、finally 清登记 · **确认了**登记形状，并引出待拍板第 5 题（复用这一份，不写第二份）；④ 两个取消口的好坏先例：`electron/ai/antigravityIpc.ts:54-58` 校验发起者（`ANTIGRAVITY_OWNER_MISMATCH`），`electron/ai/textStreamIpc.ts:118-124` 不校验、谁拿到 streamId 都能撤 · **改了**取消口的校验：发送方 + projectId + requestId 三项都对才撤；⑤ `electron/video/depthVideoIpc.ts:59-69`：同族视频长活的取消口 + `registerQuitDrain` 退出收摊 · **确认了**退出时走 `registerQuitDrain`，不在 `main.ts` 加行；⑥ `electron/outboundDispatchEvidence.ts:1-15`「已发 / 未知」口径 · **确认了**日志措辞：过了付费闸的记「已发或未知」，不说退款、不说没花钱；⑦ 本仓 09-22（`docs/plan/2026-09-22-deconstruction-node-terminal-state.md` §4）与 10-11（`docs/plan/2026-10-11-canvas-ux-8-issues.md` 中途表）两张卡把「取消 = 结果作废、已发出的照常结算」当成可接受 · **改了**：这是坏先例，本卡把「停止」收回主进程 | 链接 / 文件行 |
| ★1 用户怎么用 | 当我拆一条参考片、报价确认后发现选错了视频（或不想等了），我点「取消」，以便后面的读图、转写**不再花钱**、电脑也不再跑。步骤：选视频节点 → 拆解 → （长片）确认报价 → 进度走到读图 → 点取消 → 表显示「已取消」→ 重新选视频再拆。**不做**：不改取消按钮和任何文案；不给单镜重试加取消按钮；不撤回已被供应商受理的请求；不新增落盘字段 / Run 收据；不改报价范围与涨价比较。**已知坑**：报价卡是模态，卡开着时画布上的取消按钮点不到（卡上「取消」= 不确认，现状）；在途请求只能断开，供应商是否已计费未知。**真实任务**：① 40 秒、20 多镜的广告片（超过 30 次调用要弹报价卡），确认后读到第 4 镜点取消；② 拆到一半切去另一个项目；③ 单镜重试时关窗。**指标**（目标 → 信号 → 指标）：主指标「取消后新发出的付费调用 ÷ 取消那一刻还没发出的报价行」，基线 100%（四个时机取消后又新发 7 / 3 / 1 / 2 次，全部发满），目标 0%，量具 `electron/video/deconstructCancellation.test.ts`；真 App 量具「零花费走查 + 回环假供应商计到达数」未建 → **未验证：缺量具**（实现时建 `tests/ux/deconstruction-cancel.walk.mjs`）。质量指标：「取消那一刻在途的付费调用被断开的比例」目标 100%，量具同一单测（在途 `runTask` 收到的 signal 已 aborted）；「点取消到主进程停稳（两条腿回来、ffmpeg 退出）」目标 ≤1 s，**未验证：缺量具**（同一走查记时间戳）。护栏：「不取消的拆解结果不变」100%，量具 `electron/video/deconstructVideo.test.ts` 等现有拆解单测全绿；「其余 runTask 门行为不变」，量具 runtime / tasks 相关单测全绿 + `git grep` 只有拆解传 signal | 特征测试 / 待建走查 |
| ★1b 连带界面 | 不新增、不改任何文案。连带面逐个：分镜表顶上的「已取消」那句（现状，按当前语言渲染）不变；报价卡不变；Agent 读表看到的状态仍是 `cancelled`（概念 `agent.canvas-read-shot-table`，不改）；任务中心 / 通知：拆解不在任务表里，不露出；主进程日志新增一条 `deconstruct.cancelled`（不是界面） | 现有 `shotTableComposerStates.test.ts` / 日志断言 |
| ★2 谁说了算 | 「这次拆解停没停」唯一 owner 改到**主进程请求登记**（videoIpc，按 `发送方:requestId` 登记 AbortController）；渲染层 `deconstructionLifecycle` 只留「迟到结果作废」与表的终态，不再是停止的依据。付费令牌仍是 `spendConfirmGrant → mintSpendGrant → consumeTaskSpend` 那一条（不新造取消令牌）。碰到的已登记概念（只往下传 signal，不改语义）：`audio.transcript-shape`、`catalog.mode-serving`、`catalog.row-status`、`generation.model-name-source`、`network.response-release`、`network.credential-redirect-policy`、`production.paid-submission-exit`、`asset.reference-submit-stage`、`asset.reference-ingestion-route`、`canvas.shot-run`、`task.result-retrieval`、`text-task.execution-door`、`spend.pending-identity`；新增登记一个概念「拆解请求的停止」（合同门要求共享边界是登记概念的写接口）。同一份事实：停止 1 份（主进程登记）。意图全走显式事件：用户点取消、`project.signal` abort、发送方 `destroyed`、退出 drain，不靠「东西不见了」猜。门表：`deconstructVideo` 1 扇（`videoIpc.ts:60`）；`cancelDeconstruction` 1 扇（`ShotTableComposer.tsx:105`）；`deconstructToShotTable` 1 扇（`ShotTableComposer.tsx:51`）；`retryShot` 1 扇（`ShotTableNode.tsx:98`）；`runTask` 19 扇（拆解是其中 1 扇、两处调用 `deconstructVideo.ts:277,506`；其余 18 扇不传 signal）；`extractVideoFrameToAsset` 2 扇（`deconstructVideo.ts:499`、`videoIpc.ts:18`）；`extractAudioTrack` 2 处（`deconstructVideo.ts:243,245`）；`detectShotCuts` 3 扇（`deconstructVideo.ts:409`、`videoIpc.ts:52`、`NodeShotCutPanel.tsx:72`）；`probeMediaMetadata` 13 扇（拆解占 `deconstructVideo.ts:401`）。只改拆解那几处调用，独立的切点面板、抽帧面板不动（不传 signal = 行为不变） | `node scripts/door-map.mjs <符号>` |
| ★3 一致与复用 | 取消机制全用现成的：`AbortController` / `AbortSignal`；ffmpeg 用 spawn 自带 `signal`；`runTask` 下游的取消口都已存在（`executeProfileOperation.signal`、`executeTextTask.abortSignal`、`runCustomCallScript.signal`、`requestMultipart` 的 signal、`runLocalSpeechTranscription.signal`、`probeMediaMetadata.signal`、`hardenedFetch.signal`），只缺接线。登记形状复用 `previewRequests.ts` 那一份（待拍板第 5 题：挪成中立模块两处共用，不写第二份）；退出收摊复用 `registerQuitDrain`。signal 随 `TaskAdmission` 走（`{ spendGate, signal? }`），「停了不许再进付费出口」放在 admission 的付费闸外层（一处判，全部 runner 共用），不在 `runTask` 里逐条加判断。`runtime.ts` 正好在冻结上限（格式化后 665 行，门岗只许变短）：把 signal 交给 4 种 runner，最省的写法格式化后 +3 行、逐个显式加参 +14 行（内存里模拟过），**同提交必须有等量的真实迁出**（待拍板第 6 题）。`git grep` 结论：没有第二个拆解 IPC，也没有浏览器直连供应商的出口 | `git grep` / `check:self-written` / `node scripts/check-file-sizes.mjs` |
| ★4 全状态 | 空 / 加载（三段进度）/ 成功 / 失败 / 部分成功（几镜没读出）：都不变。**取消中**：不新增过渡态——点取消，表立即是「已取消」（现状）；修后目标是主进程 1 s 内停稳（在途请求断开、ffmpeg 收信号退出；未验证，量具待建），从点下那一刻起不再有新的调用。取消不落「失败」，不进 `failedShotIndexes`，不出「改用云端」那个按钮（只有 `failureKind = local-speech` 才出）。过期：令牌余额不撤，30 分钟后自然失效（`electron/spendGrant.ts:30`）。能力不可用：不适用（不新增能力）。文案：零改动，`check:i18n` 照旧 | `check:i18n` / 单测 |
| 5 中途表 | 见下文「中途表」：5 个阶段 × 停 / 关窗 / 断网 / 重启 / 连点 / 切项目，每格写看到什么 · 花费 · 回执 | 单测 + 待建走查 |
| 6 外部数据与失败 | ① Node spawn signal：规范见 ★0 ②；偏差：无；ffmpeg 收 `SIGTERM` 后退出，abort 之后即便抽帧恰好成功也不发布素材、不写缓存；② 供应商 HTTP：abort 只能断开连接，**已到达供应商的请求是否计费未知**，日志记「已发或未知」；fetch 的 `AbortError` 认成取消，不当「供应商失败」、不甩锅给用户的 key；③ 本机转写：`runLocalSpeechTranscription` 收 signal 后抛 `LocalSpeechError`（cancelled），转写腿的 catch 必须**先认取消**，否则会被记成「本地转写失败」；④ 自定义调用脚本：`runCustomCallScript` 收 signal 后中止；⑤ 远端视频源（https）：`resolveVideoLocalPath` 的下载（`hardenedFetch`）一并收 signal；⑥ 用户输入：渲染层发来的 requestId / projectId 不可信，主进程按发送方 + projectId 校验 | 官方文档链接 / 文件行 |
| ★7 性能 | 不适用：不新增用户操作（取消按钮照旧，点击后仍是一次同步的表状态写），只让主进程少做事；`perf-scenario：不适用：不新增交互，取消只减少主进程的抽帧 / 转写 / 读图`；`perf-real-scale：不适用：不改画布渲染、节点规模与列表` | — |
| 8 真实条件 | 单测在 macOS 跑；Windows `unverified`（ffmpeg 收信号的行为两平台不同，靠 spawn signal 抹平，未实测）；英文界面：不改文案，`unverified`；真规模（200 镜以上长片）`unverified`；干净安装：不涉及；**真付费** `unverified`：免费演练（零花费走查）先过，再由协调在专用工作树跑一次（见 ★9 D2）；键盘全程：取消按钮不变，`unverified` | 走查待建 / 协调 |
| 拍板图清单 | 不适用：pure-bugfix（不改布局、元素、文案，只修行为） | — |
| ★9 验收与回滚 | 见下文「验收清单与反例」（A 验收项、B 反例、C 复发面、D 真实条件、E 自验命令），全部在动手前写定；回滚：revert 实现提交即恢复修前行为（无数据迁移、无落盘形状变化）；硬门 ⑫「点了 = 以为的」逐项对账在 A1–A3；⑩ ⑪ 不适用（不涉及意图参数与可选项）；独立验收：待协调派验收线 | 本卡 / PR 正文 |

## 中途表

格内依次是：看到什么 · 花费 · 回执。「主进程撤」= 请求登记里那一个 AbortController abort，信号同时到编排、`runTask`、ffmpeg。表「已取消」= 表顶上现状那句「你取消了这次拆解。已拆出的都还在，点「重新拆解」可以重来。」；表「已中断」= 现状那句「这次拆解被中断了（应用关闭或切换了项目）……」。两句都不改。

| 阶段 | 停（点取消） | 关窗 | 断网 | 重启 | 连点 | 切项目 |
|---|---|---|---|---|---|---|
| 探测 / 切点（报价前，本地） | 表「已取消」；主进程撤，ffmpeg 退出，报价卡不出 · 0 · 日志 `deconstruct.cancelled`（报价 0 行） | 发送方 `destroyed` → 主进程撤 · 0 · 日志 | 本地源不受影响；https 源下载失败 → 表「失败」+原话（现状） · 0 · 表上原话 | 进程没了；重开后表从 running 收敛成「已中断」（现状） · 0 · 无 | 取消后按钮换成「重新拆解」（现状）；手快连点两下 → 取消口幂等，无副作用；运行中不能再起第二条（现状） · 0 · — | `project.signal` abort → 同一个取消口 · 0 · 日志 |
| 报价卡待确认（超过 30 次调用才有卡） | 卡是模态，点不到画布上的取消；卡上「取消」= 不确认 → 表「失败」+「这次拆解没有确认，因此没有发出请求。」（现状） · 0，不铸令牌 · — | 待决卡按不确认收（现状）+ 主进程撤 · 0 · 日志 | 不影响（还没发） · 0 · — | 进程没了，卡也没了 · 0 · 无 | 同一时间只有一张卡（现状） · 0 · — | 待决卡按项目释放成不确认（`spendConfirm.ts:340`）+ 主进程撤；确认与切项目同时到达时，编排在令牌回来后先看 signal，不发 · 0；令牌没用，30 分钟失效 · 日志 |
| 读图并发 + 取音轨 / 转写在途 | 表「已取消」；主进程不再起新的抽帧 / 读图 / 取音轨 / 转写，在途请求断开、ffmpeg 退出、本机转写停 · 没发出的行不花；已过付费闸的行「已发或未知」（供应商可能已受理，撤不回）；令牌余额 30 分钟后失效 · 日志：报价行数 / 已过付费闸（已发或未知）/ 从未发出 | 同「停」 · 同「停」 · 日志 | 在途请求失败 → 该镜「没读出」+原话（现状，不重试）；转写失败 → 对白列顶上一句原因（现状）；不是取消 · 失败的请求是否计费由供应商定（已发或未知） · 表上原话 | 进程没了，在途请求随之断开；重开后表收敛成「已中断」 · 在途的「已发或未知」，没发出的不花 · 无持久回执（不改落盘，见残余风险） | 取消幂等；取消后立刻再拆 = 新 requestId、新报价、新令牌；旧那次的迟到结果不回写（现状保护保留） · 新的一次另算 · 日志两条 | 同「停」 · 同「停」 · 日志 |
| 收尾组表（两条腿都已回来） | 表「已取消」，结果作废不写（现状保护） · 已全部发出，花费已发生 · 日志（已过闸 = 报价行数） | 结果不写回（现状） · 同左 · 日志 | 不涉及 · — · — | 收敛「已中断」 · 同左 · 无 | 幂等 · — · — | 结果不写回（现状） · 同左 · 日志 |
| 单镜重试在途（1 次读图） | 没有取消按钮（不改界面） · — · — | 主进程撤那 1 次 · 没发出不花；在途「已发或未知」 · 日志 | 那一镜「没读出」+原话（现状） · 已发或未知 · 表上原话 | 进程没了 · 同左 · 无 | 每次重试一个新 requestId、各自一次读图（现状） · 各算各的 · 日志 | 主进程撤那 1 次（修前照发） · 同「关窗」 · 日志 |

## 验收清单与反例（动手前写定，实现线按它自验，验收线只核它）

**A 验收项**

- A1 四个取消时机（切点刚出报价待定 / 取音轨中 / 第一镜读完 / 下一镜即将起跑）：取消之后 `runTask` 总次数**不再增长**（等于取消那一刻的次数：0 / 4 / 6 / 5），抽帧、取音轨不再新起；`deconstructCancellation.test.ts` 由「现状特征」翻转后全绿。
- A2 取消那一刻在途的每一次 `runTask` 收到的是**同一个** signal 且已 aborted；在途的取音轨 / 抽帧 / 切点 / 探测收到同一个 signal（spawn 的 `signal` 选项）。
- A3 取消走专用错误（name 可判，如 `DeconstructCancelledError`）：不进 `failedShotIndexes`、不写 `failureReason`、不触发 `gateFailure`、不被转写腿认成 `local-speech`、不被读图 catch 摊成「某镜读图失败」；IPC 对取消回结构化的「已取消」（`null`），不靠错误文案；表终态 `cancelled`，不是 `failed`。
- A4 IPC：开始 → 取消 → 再取消（第二次 `ok:false`、无副作用）；陌生发送方撤不了（`ok:false`）；陌生 requestId `ok:false`；projectId 不符被拒；调用结束后 finally 清登记（在途数归 0）；发起窗口销毁 → abort；退出时 quit drain 全撤；缺 requestId 的拆解请求被拒。
- A5 渲染层：`cancelDeconstruction` 标记之后**立即**调 `video.cancelDeconstruct({ requestId, projectId })`；`project.signal` abort 走同一个口；迟到结果保护保留（取消后迟到的 ready 不回写）。
- A6 `retryShot` 带 requestId、走同一条边界：项目被换走 / 关窗 → 主进程那 1 次读图不发（或在途被断开）。
- A7 结构回归：给一个已 abort 的 signal → 0 次探测、0 次切点、0 次抽帧、0 次取音轨、0 次 `runTask`；`deconstructVideo.ts` 里每一处 `runTask(` 都带着这次的 signal，且都在 signal 闸之后（行为测试 + 源码断言各一条）。
- A8 其余 `runTask` 门不传 signal、行为不变：runtime / tasks 相关单测全绿；`git grep` 只有拆解构造带 signal 的 admission。
- A9 日志：取消时主进程记一条 `deconstruct.cancelled`（requestId、nodeId、报价行数、已过付费闸行数记作「已发或未知」、从未发出行数）；全文不出现「退款」「没花钱」「未扣费」。

**B 反例（必须红）**

- B1 拿掉取消口（取消 handler 不 abort / 登记不存）→ A1「取消后付费调用不再增长」红。
- B2 `deconstructVideo` 不把 signal 交给 `runTask` → A2 红。
- B3 读图 catch 不先认取消 → A3 红（取消被摊进 `failedShotIndexes`）。
- B4 取消 handler 不校验发送方 → A4「陌生发送方」红。
- B5 `retryShot` 不带 requestId → A6 红。

**C 这一类会从哪回来（复发面，各有拦法）**

- C1 新调用方复用 `deconstructVideo`：options 里的 `signal` **必填**，typecheck 拦。
- C2 编排里新加一个子步骤（比如再抽一张缩略图）：A7 的「已 abort → 每一步都是 0 次」按 mock 全集断言，新步骤不接 signal 就红。
- C3 新的付费执行路径（`runTask` 下游第 5 种 runner）：「停了不许进付费出口」在 admission 的付费闸外层判，所有 runner 都先过这道闸，新路径自动被拦；在途断开要它自己接 signal（残余风险，见报告）。
- C4 多窗口：登记按 `发送方:requestId` 寻址，一个窗口撤不了另一个窗口的拆解（A4）。
- C5 旧数据 / 重启：表上残留的 running 由现有收敛规则变「已中断」（`canvas.interrupted-node-convergence`），主进程登记随进程消失，不留僵尸。
- C6 版本：渲染层与主进程同一个包发版，主进程对缺 requestId 的请求直接拒（A4），不存在「旧渲染层发来的停不了的拆解」。

**D 真实条件（花钱走查）**

- D1 免费演练：零花费走查 `tests/ux/deconstruction-cancel.walk.mjs`（实现时建，建在 `tests/ux/agent-runtime-fixture.mjs` 同款回环假供应商上：只有远端是假的，IPC、渲染层、存储都是真的）：真 Electron 拆一条多镜视频，读到第 N 镜时点取消 → 假供应商在取消之后收到的新请求数 = 0；表显示「已取消」；中英两轨截图亲眼看过。
- D2 真付费一次（协调跑）：专用工作树；D1 先过；产物标记字面量 = 主进程日志事件名 `deconstruct.cancelled`（修前不存在）；拆一条短片，第一镜读完点取消 → 供应商账单的调用数 = 日志里「已过付费闸」的行数，且不大于取消那一刻的在途数 + 已完成数。

**E 自验命令（实现线，每条记退出码）**

改到的 vitest（`electron/video/deconstructCancellation.test.ts`、`electron/video/videoIpcSession.test.ts` 或新的 videoIpc 取消测试、`src/workbench/generationCanvas/nodes/shotTable/deconstructionTerminalState.test.ts`、`electron/video/deconstructVideo.test.ts`、runtime / tasks 相关）；ESLint；`node scripts/typecheck.mjs`；`node scripts/check-concept-owners.mjs`；`node scripts/check-root-cause-contracts.mjs`；`test:quit-lifecycle-guard`；`node scripts/check-file-sizes.mjs`（`runtime.ts` 净增 0）；`git diff --check`；推送前快检。

## 实现要点（拍板后照做）

- `electron/video/videoIpc.ts`：拆解进请求登记（复用 `previewRequests` 那一份）；新增 `nomi:video:deconstruct-cancel`（可信发送方 + projectId + requestId）；发送方 `destroyed` 与退出 drain 走同一个 abort；缺 requestId 拒。
- `electron/video/deconstructVideo.ts`：options 加必填 `signal`；探测 / 切点 / 报价前后 / 每次抽帧前 / 每次 `runTask` 前判 signal；`mapWithConcurrency` abort 后不再取下一镜；读图与转写的 catch 先认取消；收尾等两条腿停稳再抛取消；计数「已过付费闸」写日志。
- `electron/tasks/taskSpend.ts`：带 signal 的 admission（付费闸外层先判 signal）。
- `electron/runtime.ts`：把 `admission.signal` 交给 4 种 runner；**不碰 311–324 行开头 referenceSelection 那几行**，`runCustomCallTask` 那一行只在行尾加参；同提交等量迁出抵扣行数（待拍板第 6 题）。
- `electron/audioTaskRunner.ts`、`electron/catalog/customCallDispatch.ts`：输入加 `signal`，交给已有的 `requestMultipart` / `runLocalSpeechTranscription` / `runCustomCallScript`。
- `electron/video/extractVideoFrame.ts`、`extractAudioTrack.ts`、`detectShotCuts.ts`：spawn 带 signal；abort 后不发布素材、不写缓存；`resolveVideoLocalPath` 的下载带 signal。
- `electron/preload/mediaBridge.ts`、`src/desktop/bridgeMedia.ts`：`video.cancelDeconstruct({ requestId, projectId })`。
- `src/workbench/generationCanvas/nodes/shotTable/deconstructionLifecycle.ts`、`factBridge.ts`：标记取消时交出 requestId / projectId 并立即调取消口；`project.signal` abort 调同一个口；`retryShot` 生成 requestId；`null` 结果认成已取消。
- 根因合同 `docs/fixes/2026-10-27-deconstruct-cancel.root-cause.json`（v3）+ 新概念登记；提交带 `Direction-Check:` trailer。
