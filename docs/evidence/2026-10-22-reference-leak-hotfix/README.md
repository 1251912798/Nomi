# 参考图错发热修：免费抓包 + 性质测试证据（2026-10-22）

设计卡：[docs/plan/2026-10-22-reference-leak-hotfix.md](../../plan/2026-10-22-reference-leak-hotfix.md) · 根因合同：[docs/fixes/2026-10-22-reference-leak-hotfix.root-cause.json](../../fixes/2026-10-22-reference-leak-hotfix.root-cause.json)

全部是本机跑的，不花钱、不出本机。修前 = origin/main `97eab7bec` 的 `catalogTaskActions.ts`，主进程不剥；修后 = 本分支。

## 怎么来的

```
# 修后
NOMI_REFLEAK_EVIDENCE_DIR=docs/evidence/2026-10-22-reference-leak-hotfix/loopback-after \
NOMI_REFLEAK_REPORT=<临时文件> npx vitest run src/workbench/generationCanvas/runner/referenceSentWithinInUse.property.test.ts
# 修前：catalogTaskActions.ts 换回 origin/main 那份、stripReferenceResidue 换成原样返回，同一条命令写到 loopback-before
```

`loopback-*/`：测试在 127.0.0.1 起一个只记账的假上游，把渲染层构造 → 主进程（和 `runtime.runTask` 同顺序：剥残留 → 补默认 → 渲染 mapping）出来的 HTTP 请求真发过去，这里是假上游**收到的**请求体（不含请求头）。每个文件里 `inUse` = 参考区显示在用的图，`sent` = 收到的请求体里出现的参考地址。

`property-counts.json`：全部档案 × 每个方式的漏格数，修前 / 修后，以及「没误伤」对账。

## 抓包结论（收到的请求体）

> **更正（独立验收 V-refleak 第 1 轮）**：这里的请求体由测试里的 `wire` 按 runtime 顺序渲染，**没经过 runTask 里的 `imageEditGuardError`**（「为免白扣费这次不发」）。真 App 上，下表「修前」里 S1b、S1c、S4（中转）和 S1a–S1c、S4（APIMart）其实是**被拒发**、文生生不出来，不是漏发；OK2 / OK3 / S2 的中转一栏在真 App 上修前修后都拒发（中转视频只有一个图位，带不了尾帧 / 多参考）。main 上真漏钱的是中转 S1a、APIMart S2 和 S3，验收线 389 行真 runTask 矩阵里共 37 行；修后 0，且原本被拒的文生格能正常出片。下表保留作为「请求组装层」的证据，修前数字以验收报告为准。

| 场景 | 传输 | 参考区在用 | 修前收到 | 修后收到 |
|---|---|---|---|---|
| S1a 首帧 1 张 → 切文生 | 中转 | — | `image` = f | 不带图 |
| S1b 首尾帧 → 切文生 | 中转 | — | `image` = f | 不带图 |
| S1c 参考 3 张 → 切文生 | 中转 | — | `image` = u1 | 不带图 |
| S1d APIMart Seedance 2.0 首尾帧 → 切文生 | 中转 / APIMart | — | 中转 f / APIMart 不带 | 都不带 |
| S2 参考 3 张 → 切首尾帧再放 f、l | APIMart | f、l | f、l + u1、u2、u3 | f、l |
| S3 连 3 张进 Seedance 2.0 首尾帧 | APIMart | e1 | e1、e2、e3 | e1 |
| S4 Seedance 5 张 → Veo 3.1 / Kling 3.0 / Wan 2.7（落到文生） | 中转 | — | `image` = u1 | 不带图 |
| OK1 首帧方式（Hailuo 2.3） | 中转 / APIMart | f | f | f（照常） |
| OK2 参考方式（Seedance 2.0 全能参考 3 张） | APIMart / 中转 | u1–u3 | APIMart u1–u3 / 中转 u1 | 同左（照常） |
| OK3 首尾帧方式（Seedance 2.0） | APIMart / 中转 | f、l | APIMart f、l / 中转 f | 同左（照常） |

中转视频 body 只有一个 `image` 位，所以参考 / 首尾帧方式下中转只收到第 1 张，修前修后一样，不是本次改的。

## 性质测试格数（发出去的 ⊆ 参考区在用）

| 层 | 起点 | 格数 | 修前漏 | 其中生成钮可点 | 修后漏 |
|---|---|---|---|---|---|
| 模板参数层 | 参考放满 | 148 | 85 | 57 | 0 |
| 模板参数层 | 首尾帧 | 71 | 48 | 43 | 0 |
| 模板参数层 | 视频 / 音频 | 69 | 47 | 24 | 0 |
| 模板参数层 | 别名键 | 197 | 197 | 101 | 0 |
| 中转真请求体 | 参考放满 | 148 | 53 | 26 | 0 |
| 中转真请求体 | 首尾帧（视频） | 71 | 39 | 34 | 0 |
| 中转真请求体 | 视频 / 音频 | 60 | 41 | 18 | 0 |
| 中转真请求体 | 别名键 | 172 | 133 | 49 | 0 |
| APIMart 真请求体 | 参考放满 | 54 | 9 | 0 | 0 |
| APIMart 真请求体 | 首尾帧 | 19 | 8 | 6 | 0 |
| APIMart 真请求体 | 视频 / 音频 | 19 | 10 | 3 | 0 |
| APIMart 真请求体 | 别名键 | 60 | 36 | 7 | 0 |
| 绕过渲染层（只靠主进程剥） | 四种起点 | 中转 451 / APIMart 152 | — | — | 0 |

和复盘的数对得上：复盘在 main 上量的是 141 格（模板参数层 80 漏、中转从参考起切 51 漏 / 可点 24、从首尾帧起切 47/84、APIMart 19/80 可点 7）；今天的 main 多了几个档案（148 格），首尾帧起点只取「同时有首、尾帧槽」的方式，所以格数略有出入，形状一致。视频 / 音频与别名两种起点是本次新探的：APIMart 上 Seedance 2.0 全能参考切图生照发 3 段视频 + 3 段音频，Wan 3.0 参考切文生照发音频。

**没误伤**：真实路径各层 1088 格逐格对账，修前「在用且发出」的地址修后一张不少，也没多出新的（`property-counts.json` 的 `noCollateral`）。

## 变异

| 变异 | 结果 |
|---|---|
| 渲染层去掉「置 undefined」（derived 里值为 undefined 的键一律不写，即退回只加不清） | 10 条红：模板参数层 4 层 + 场景 1 三条 + 场景 4 三条（真请求体层被主进程剥除兜住，正是第二道守的作用） |
| 渲染层只去掉「通用参考键全集先清」那一步 | 1 条红：模板参数层别名键 |
| 主进程 stripReferenceResidue 改成原样返回 | 红：绕过渲染层的用例（以及 relay/bypass、apimart/bypass 两层） |

每次变异前 `cp` 备份、跑完 `cp` 还原，`git diff` 核过只剩本次改动。

## 真付费样本（待协调跑）

脚本 `tests/ux/reference-leak-hotfix.paid.mjs`，只花一条：复盘场景 2，APIMart Seedance 2.0 fast · 480p · 4 秒 · 无音频。全能参考放 3 张 → 切首尾帧 → 放首、尾帧 → 生成。断言的是 App 真正发往 `api.apimart.ai` 的请求体：只有首帧、尾帧两张图，那 3 张参考没被托管上传、也没发出。请求体由走查网络闸在 fetch 层记账（`NOMI_WALK_NET_BODIES=1`，先脱敏）。

```
pnpm build
NOMI_SPEND_OK=1 NOMI_PAID_PROBE_DIALOG=1 APIMART_API_KEY=<key> node tests/ux/reference-leak-hotfix.paid.mjs   # 零花费探测：走到确认框、点取消
NOMI_SPEND_OK=1 APIMART_API_KEY=<key> node tests/ux/reference-leak-hotfix.paid.mjs                            # 真付费一条
```

证据摘要写 `paid/report.json`（探测模式写 `paid/probe-report.json`）：paidCalls、供应商任务号、请求体里的图片（只留文件名和地址哈希）、托管上传了哪些文件、成片时长 / 编码；成片拷在走查输出目录（`.tmp/` 下，不进仓库）。
