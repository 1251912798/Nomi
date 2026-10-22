# 方向检查：上游原话的落盘出口（G-redact-owner 第 1 步）

> 触发：`node scripts/fix-churn.mjs` 命中——`electron/tasks/`（第 17 个 fix）、`electron/agentLane/`（第 7 个）、自写登记 `logging-and-crash`（30 天第 3 个），以及独立验收 V-textmigrate 观察 O4（`modelCallFetch.ts`、`runtimeVendorError.ts` 各已 2 个 fix）。
> 方向已由用户 2026-10-22 拍板（「按推荐」）：① 用户配置的头和 key 默认都算秘密；② 先做标准解码归一，再检测；③ 一旦检出，整段上游原话都不显示，只给状态 / 类别。落盘这一侧的要点是协调转述的「删 > 脱敏：事件 / 日志 / 存档里不存 upstreamMsg 和原始 error message，只存 category、httpStatus、upstreamCode 这类结构字段」。
> 本步改法是**删**（落盘那份原话不再写）和**换**（错误进日志的格式整份换成结构事实），不新增分支；热点文件 `modelCallFetch.ts`、`runtimeVendorError.ts`、`taskIpcGuard.ts` 一行不动。

## 0. 一句话根因

落盘出口收的是「自由文本」（错误对象的 message、结构化错误里的 upstreamMsg、pi 的 errorMessage），而自由文本的来源不可知：任何一层都可能把上游原话（连同回显的凭据）拼进去，于是只能靠「按头名猜秘密 + 枚举编码变体」去事后擦——这一套在 F2-A / F2-B 上已证明擦不干净。

## 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| V-textmigrate N3（T4） | `taskIpcGuard` 把 `error.structured`（含 `upstreamMsg`）原样交 `traceVendorCompleted`，写进 `<项目>/.nomi/events` | 落盘出口收自由文本 |
| V-textmigrate F2-A | `x-stainless-*` / `user-agent` 按头名被当成公开头，不进秘密清单 | 按头名猜秘密 |
| V-textmigrate F2-B | 小写 `%xx`、大写 `é` 不在枚举出来的编码变体里 | 枚举编码变体 |
| 清单 T6 / M3 / M4 / M5 / A4 | `logError(…, error)` → `redactError` 把 `error.message` 写进日志文件，日志又随诊断包 / 反馈包出机 | 落盘出口收自由文本 |
| 清单 A3 | `laneTrace` 把 `errorMessage`、`run.error`（`JSON.stringify(event.error)`）和失败工具的原文写进派生轨迹 | 落盘出口收自由文本 |
| 本次新查（转写失败） | `transcribe.httpError` 把 `structured.upstreamMsg` 拼进一个**不带 cause** 的新 Error，再被 `logError` 记下 | 「认出上游错误再擦」认不出 |

## 2. 为什么这一类会一直出现

- 上游原话进入系统的入口不止一个：`vendorHttp`、`modelCallFailure`（含 SSE 兜底 `new Error(raw)`）、自定义调用、音频 / 转写包装、pi 的 `errorMessage`。原话随后被**任意**一层拼进新 Error 的 message（有的带 cause，有的不带）。落盘出口在末端只拿到一段字符串，**已经不知道它从哪儿来**。
- 末端只能「认出秘密再擦」，而认秘密靠头名白名单和编码枚举，两张表永远追不上真实输入（F2-A / F2-B）。
- 所以类根因不在某个出口漏了 redact，而在**落盘出口的输入类型是自由文本**。只要输入类型不变，新的出口、新的包装层、新的编码就会把同一类泄漏带回来。
- 三条体验铁律：⑩ ⑪ ⑫ 均不适用（这是安全 / 隐私类，不涉及参数一致、可选项或点击预期）。结账挂的类检查是本 PR 新增的 `electron/logging/diskSafeFailure.test.ts`（落盘出口 × F2-A/B 夹具矩阵）。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 文本一次性门的令牌闸修好（登记 M9，到期 2026-11-15）后，F2-A / F2-B 的凭据原样进 `<项目>/.nomi/events/log-*.jsonl` | 在 HEAD `97eab7bec` 跑本 PR 的 `diskSafeFailure.test.ts`（未改产品代码时，项目事件断言红） |
| 转写 / 配音失败把回显凭据写进日志，再被「导出诊断包」带出机 | 同上测试的日志断言（`transcribe.httpError` 包装不带 cause，按类型认不出） |
| 任何新加的 `logError(…, error)` 调用点，只要 error 里含原话，都会落盘 | 任一新调用点；本 PR 后由日志层格式本身挡住 |

## 4. 靶子独立性检查

- 尺子来自另一条线：泄漏事实由独立验收 V-textmigrate（r2 / r3）用本机假上游测得；本线复用同一组夹具形状（`SDK_PREFIX`、`LOWER_PERCENT`、`UPPER_UNICODE`），不自己改靶。
- 没有「修对了反而掉分」的先例：本改动不碰任何评测分数。
- 靶子本身无误：夹具都是合成值、经真实 HTTP 回显。

## 5. P0：这些是我们独有的吗？现成方案有哪些

- 自写登记 id：**`logging-and-crash`**（under-review，reviewBy 2026-11-30）。登记里已写结论方向：「落盘交给 electron-log，只留脱敏规则」——脱敏规则是隐私承诺的一部分，属领域。
- 现成方案查过：
  - pino `redact`（https://github.com/pinojs/pino/blob/main/docs/redaction.md ，2026-10-22 经 Context7 查）：按**路径**擦结构字段，不处理错误 message 这种自由文本；pino 默认的 err 序列化照样输出 message 与 stack。
  - electron-log（https://www.npmjs.com/package/electron-log ）：只管落盘与轮转，错误照样整段写。
- 结论：「哪段文本允许落盘」是 Nomi 自己的隐私口径（领域约束），任何日志库都只给一个序列化钩子；本步改的正是登记里要保留的那部分（脱敏 / 序列化规则），不新增自写的落盘能力。日后按登记换 electron-log 时，本步的 `diskSafeError` 原样当它的错误序列化钩子，不需返工。
- 事件日志（`.nomi/events`）与 Agent 派生轨迹是领域数据（`self-written.json` 的领域目录），写者本就自有。

## 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 换 pino / electron-log | 落盘换库；错误怎么序列化仍得我们定 | 不解决问题本身 | 否（理由见 §5） |
| 补 | 把 F2-A / F2-B 的头名、编码变体再补进 `requestPipeline` / `events/redact` / `logging/redact` | 每处再加一张表 | 第 3 刀；下一种编码 / 头名照样漏；与用户拍板「删 > 脱敏」相反 | 否 |
| 重写（限一个模块） | 只重写 `logging/redact` | 事件、轨迹仍收原话 | 只覆盖一半出口 | 否 |
| **删 + 换（推荐）** | 落盘出口只收结构事实：事件里的供应商失败只留 category / httpStatus / upstreamCode 等；日志里的错误只留类名、错误码、码形 message 或指纹、结构事实、栈帧；派生轨迹只留错误类别；原话只进开发态终端 | 用户日志与崩溃日志不再有错误原文，排障要靠事件名 + 栈帧 + 指纹 + 结构事实 | 排障信息变少（见 §7）；第 2 步要另定界面回显 | **是** |

## 7. 用户要权衡的核心

用户机器上的日志 / 事件 / 轨迹不再记任何错误原文：换来的是「上游原话和它回显的凭据，从结构上就落不了盘、也随诊断包出不了机」，代价是排障时只能看到「哪一步、什么类别、哪个码、哪一行代码」，看不到那句原话。

## 本步不做、交协调定的

- **A2 会话存档**（`.nomi/agent-sessions/*.jsonl` 里 pi 的 `AssistantMessage.errorMessage`）：pi 回放时会跳过 error 消息（`pi-ai/dist/api/transform-messages.js` 第 153–159 行），所以模型回放不依赖原文；但 ① pi 的重试判据在运行中读 `errorMessage`（花钱：误判会多重试或少重试），② Agent 面板重开历史时显示的错误就是它。去掉它等于改重试判据和界面，超出本步，按任务书「拿不准报协调」处理，选项写在 PR 正文与交货报告。
- **新发现、清单外的落盘面**：画布节点 `error` / `runs[].error` / `runs[].raw`（`src/workbench/generationCanvas/model/generationCanvasSchema.ts` 第 74、115 行）、镜头表 `failureReason`（`electron/shared/canvas/shotTable.ts` 第 60 行）随项目文件落盘，渲染层的画布事件也经 `nomi:events:append` 进 `.nomi/events`。这些是界面回显的那份文本被一起存下来，归第 2 步「唯一出口」一起定。

## 特征测试清单（动结构前先锁住）

- `electron/logging/diskSafeFailure.test.ts`：先在未改产品代码的树上跑，项目事件、日志两类断言红（泄漏现状钉住），改后转绿；变异（把 `upstreamMsg` 加回 trace 投影）转红。
- 既有测试照跑：`electron/logging/logger.test.ts`、`electron/logging/redact.test.ts`、`electron/events/eventLogRepository.test.ts`、`electron/agentLane/` 轨迹相关测试、`electron/telemetry/trajectoryProjection` 相关测试。
