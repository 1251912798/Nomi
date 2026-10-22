# 方向检查：查任务前把本地参考素材重新上传（F-poll-reupload）

> 触发：`node scripts/fix-churn.mjs electron/runtime.ts` 命中（文件 14 天第 11 个 fix）；`electron/tasks/taskResultQuery.ts` 第 4 个 fix、`electron/tasks/` 目录第 16 个；`electron/catalog/customCallDispatch.ts` 第 3 个。来源：#1279 真付费样本（APIMart Seedance 2.0 fast 首尾帧，两张图各上传 26 次 = 1 次创建 + 25 次轮询）。

## 0. 一句话根因

「把本地参考换成供应商能拿到的地址」挂在**每一次** HTTP 操作上（`executeProfileOperation` 开头无条件 `localizeAssetsForVendor`），而不是挂在「把参考交给供应商」的那一步（提交）上；查任务 / 取结果用的是缓存里原样的请求，里面还是 `nomi-local://` / `data:`，于是每轮询一次就重传一遍。

## 1. 归类表

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| runtime.ts 近 14 天 10 个 fix（#1213 结果读法、预览契约、资产写入原子化等） | 各自不同：结果怎么读、产物怎么落、预览怎么带 | runtime.ts 是引擎 A 的巨壳，多个概念共住一个文件，热度来自「住得挤」，不是同一个 bug 反复冒 |
| 本次（#1279 样本） | 查任务 / 取结果那两步也走了参考本地化 | **「谁消费参考」没有归属**：本地化是 HTTP 执行器的副作用，不是「提交」这一步的职责 |

本次与前 10 个不是同一类：前面没有一个碰过参考本地化（`git log -S localizeAssetsForVendor -- electron/runtime.ts` 只有 2026-06-06 引入那一次）。

## 2. 为什么这一类会一直出现

`executeProfileOperation` 是引擎 A 唯一的「渲染 + 发 HTTP」边界，create / query / result 三步都从这里过（另有 catalogCommit 的「测试映射」入口）。它对 `request.extras` 做本地化时不问「这一步是不是要把参考交给供应商」。缓存里的任务请求刻意保留原始 `nomi-local://`（指纹、溯源要用），于是每次查任务都重新本地化一遍。

本 PR 要修的两个症状（同一个根因）：
1. **轮询重传**：每查一次任务就把参考重传一遍（实测 2×26 次）。
2. **提交后参考被删 / 项目搬走 → 已付费任务查不回来**：特征测试实测轮询抛 `NOMI_ERR::asset-upload-failed`，人话说「所以还没请求这次选的服务商」——钱已经花了，这句是假的；而这一族错误在界面上的主动作是「重试」（`narrate.ts` 的 `'asset-upload-failed': RETRY_FIRST`），重试 = 再生成、再扣一次。

其它后果：
- 上传通道限流 / 余额问题会让轮询失败，任务状态不明。
- 目标通道失败时会退到 Nomi 自己的 relay，白付我们自己的流量。

铁律对照：⑫「点了 = 以为的」——用户点生成以为「图交一次」，实际每轮询一次交一次；删参考以为不影响已提交的任务，实际取不回成片。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 任何新供应商的轮询都会重传参考（与供应商无关） | `electron/tasks/pollDoesNotReuploadReferences.test.ts`：APIMart 形状实测序列 `UUC(UUP)×6D` |
| 用户提交后整理素材（删参考），已付费任务取不回 | 同文件第 3 例：轮询抛 `asset-upload-failed` |
| MCP / headless 直接给 `data:` 字节的调用，同样每轮询重传 | 同文件第 2 例：14 次上传 |

### 2b. 单独列出：文案 / 错误码层面的同类漏洞（不在本 PR 修，交协调定）

`electron/tasks/taskResultQuery.ts` 的 `retrievalStageError` 对「已带码」的错误原样放行（注释：「出站被拦 / 产物读不出……是更具体的事实」）。它不区分码的**语义阶段**：`asset-*`、`submission-not-sent`、`outbound-blocked-submit` 这几族的意思都是「请求还没发出去、可以放心重试」，一旦从查询阶段冒出来，界面就会对一个已付费的任务说「还没请求服务商」并把「重试」当主动作。

- 本 PR 落地 A 之后，查询阶段唯一会产出 `asset-*` 的来源（参考本地化）就没了，症状 2 自然消失（特征测试第 3 例钉住）。
- 但「查询阶段放行提交前语义的码」这个口子还在：今天没有别的生产者，将来谁在查询链上加一步会抛这些码，同样的假话会回来。建议另开一刀（碰 `taskResultQuery.ts`，同样是热点）：`retrievalStageError` 只放行取回阶段语义的码（`retrieval-*`、`outbound-blocked`、`output-*`），提交前语义的码一律改包成 `retrieval-query`。
- 现有文案本身（`generationCommon.ts` 的 `assetUploadFailed` / `assetInvalid` 说「还没被请求到 / 请求还没发出去」）对提交阶段是对的，不用改；错的是它被用在了查询阶段。

## 4. 靶子独立性检查

- 尺子是真付费账本（协调跑、协调复判），与本线无关；本线的特征测试用本机回环假上游复现出同一个序列形状。
- 无「修对了反而掉分」先例。

## 5. P0：这些是我们独有的吗

「参考素材什么时候交给哪家供应商」属于按镜头的花钱语义与素材传输，是我们自己的执行器边界；没有现成库管这个（AI SDK 不管异步任务轮询，也不知道我们的 `nomi-local://`）。不涉及自写登记。

## 6. 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 无对应库 | — | — | — |
| 补 A（runtime.ts，推荐） | `executeProfileOperation` 只在 `stage === "create"` 时本地化；`stage` 改成必填（类型上新入口忘不了）；query / result 渲染出的请求里若还有本地素材值就当场报错（用户自配映射把参考写进轮询时 fail-closed，不把 `nomi-local://` 发出去）；外加门岗测试：全部内置映射的 query / result 步渲染时不读参考 | runtime.ts 改 ~4 行，逻辑放在 `catalog/referenceStage.ts`（新文件，不热） | 低：内置轮询步全靠 task_id 寻址（门岗测试钉死） | ✅ |
| 补 B（taskResultQuery.ts） | 轮询前把请求里的参考剥掉再交给执行器 | 同样碰热点（tasks/ 第 16 个） | 只盖住 1 个查询入口，catalogCommit「测试映射」查询步照旧重传；执行器还是「谁调都传」 | ❌ |
| 补 C（上传结果缓存） | 按文件内容缓存上传地址，重复本地化命中缓存 | 新状态 + 过期管理 | 轮询仍依赖参考文件存在（删了照样取不回）；治标 | ❌ |
| 重写 | 把本地化从执行器里搬出去，只在 runTask 提交处做一次，缓存存「实际发出去的请求」 | runtime.ts 改动更大；溯源 / 指纹要区分「原始参考」与「已上传地址」 | 中：溯源记成会过期的公网地址，复跑会坏 | 以后 runtime 拆壳时再做 |
| 删 | — | — | — | 不适用 |

## 拍板

用户 2026-10-22 拍板：按 A 改 runtime.ts；同类口子（`retrievalStageError` 放行提交前语义的码）另开 PR 修。

## 7. 用户要权衡的核心

热点文件 runtime.ts 里改 4 行（加「只有提交这一步交参考」的判断），换来轮询不再重传、提交后删参考也能取回成片；不改 runtime.ts 的替代方案都要么只盖一个入口、要么仍依赖参考文件存在。

## 拟改 diff（runtime.ts）——用户 10-22 拍板按 A 落地

落地形状（与拍板时的拟改相同，只是为过文件体积门岗把 owner 挪进新文件 `electron/catalog/referenceStage.ts`、runtime.ts 净减 2 行）：

```diff
+import { assertNoReferencesOutsideSubmit, stageSubmitsReferences } from "./catalog/referenceStage";
-  …; stage?: ProfileOperationStage; …
+  …; stage: ProfileOperationStage; …
-  const localized = await localizeAssetsForVendor(
+  const localized = stageSubmitsReferences(input.stage) ? await localizeAssetsForVendor(
     …
-  );
+  ) : { value: input.request.extras, uploaded: 0 };
-  const built = buildProfileHttpRequest(effectiveInput);
+  const built = assertNoReferencesOutsideSubmit(input.stage, buildProfileHttpRequest(effectiveInput));
```

- `stage` 改必填：生产调用方三处（runTask 的 create、taskResultQuery 的 query / result、catalogCommit 测试映射）都已传；新入口忘了传，typecheck 就红（类型上做不出「不说是哪一步」）。
- 连带的机械改动（测试文件，不在 runtime.ts）：直接调 `executeProfileOperation` 而没写 `stage` 的测试补上 `stage: "create"`（或 `"query"`）：`falLoopback` / `runwayLoopback` / `comfyuiLocal` / `comfyuiLocalVideo` / `comfyuiWorkflowMatrix` / `onboardingRoundtrip` / `relayConformance` / `relayConformanceVideoAudio` / `relayVideoQueryContract` / `runtime.provider-adapter`。
- 批后验证顺序：特征测试 3 条转绿 → 变异（把 `stageSubmitsReferences` 改成恒 true，特征测试要红）→ 相关目录 vitest → 本机假上游走查。

## 特征测试清单

- `electron/tasks/pollDoesNotReuploadReferences.test.ts`（修前 3 红）：
  - 首尾帧两张本地图：期望 `UUCPPPPPPD`，实测 `UUCUUPUUPUUPUUPUUPUUPD`；
  - `data:` 内联参考：期望 2 次上传，实测 14 次；
  - 症状 2，提交后删参考：期望第一次查询不报错、成片取回，实测轮询抛 `NOMI_ERR::asset-upload-failed`（「还没请求这次选的服务商」）。
- `electron/catalog/referenceFreeQueryOps.class.test.ts`（门岗，已绿）：种子目录 + 中转通用通道 + 原生通道全部查询 / 取结果步，渲染时不读参考、不走 multipart；门岗自身有牙（把参考模板进查询体会被抓到）。
