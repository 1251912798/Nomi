# 方向检查：模型目录「读失败时该保留什么」没有 owner（RW）· 2026-10-18

触发：`node scripts/fix-churn.mjs src/config/useModelOptions.ts` 命中——`src/config/` 近 14 天已有 3 个 fix，这一刀是第 4 个。上一次同一处的复盘：`docs/engineering/direction-check-2026-10-11-model-catalog-lifecycle.md`（三态：有 / 加载中 / 真没有）。

## 0. 一句话根因

模型选项缓存（`modelCatalogCache`）只有「命中 / 没命中」两种记忆：刷新一作废，上一份成功的清单就没了；而 hook 的失败分支又顺手清空。于是**「这一次没读到」与「你一个模型都没有」在界面上是同一个画面**——缺的是「读失败时保留什么」这一条，归缓存层，不归每个调用点。

## 1. 归类表：前 3 个 fix 各修了什么

| 提交 | 修了什么 | 与本次是否同一个 owner / 同一类 |
|---|---|---|
| `cdfdf78890`（10-11）模型清单同步首值 + 加载态骨架 | 缓存命中给同步首值、加载中画骨架（`peek`、`loading`） | **是**，同一个 owner（缓存 + hook），同一类：状态表示不全（加载中被当成没有） |
| `6fc05ea8d5`（10-08）供应商卡片文字只住词典 | `knownVendors.ts` 文案 / i18n | 否，供应商卡片文案，只是同目录 |
| `92f6995dd6`（10-08）合同措辞 | `knownVendors.ts` 措辞 | 否，同上 |

结论：4 次里真正落在「模型选项缓存 / 加载」这一个 owner 上的是 2 次（10-11 与本次），都是**同一类**——选项的「表示」缺一个状态：第一次缺「加载中」，这次缺「读失败但有旧的」。其余两次是 `knownVendors.ts` 文案，目录级计数把它们并进来，属于同目录不同概念。

## 2. 为什么这一类会一直出现

- **表示层**：清单只有 `ModelOption[]` 一个值，「新鲜 / 旧但有效 / 没有」靠调用点各自猜；缓存刷新作废把「旧但有效」一并扔了。
- **所有权层**：「失败时留什么」没人拥有，hook 的 catch 里直接 `setOptions([])`。同族的设置页（`useOnboardingDrawerCatalog`）早在 09-21 就改成「留住上一份 + 把错误交给界面」，并配了源码扫描棘轮 `catalogReadFailureIsVisible.test.ts`，但**棘轮只扫了 4 个文件，没把这个 hook 放进范围**——同一类病从没被扫到的文件里回来了。
- 体验铁律：⑪「能选到」——失败时选项消失就是「选不到」。⑩⑫ 不适用。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| P1 新增的读目录 hook / 调用点继续在 catch 里清空 | `catalogReadFailureIsVisible.test.ts` 的扫描范围里没有它 |
| P2 刷新事件（保存模型 / 切供应商）后碰上一次读失败，生成框整排选项消失 | 本 PR 的 `tests/ux/model-catalog-keep-on-failure.walk.mjs`（修前红、修后绿） |
| P3 `preloadModelOptions` 的 6 个调用点里，静默 `catch { return [] }` 的（`useAgentPanelSpendConfirm.ts:170`、`useBatchPlanCost.ts:31`）在读失败时仍当「没有模型」 | `node scripts/door-map.mjs preloadModelOptions` |

## 4. 靶子独立性检查

尺子（走查脚本 / 单测）由实现线写；它们断言的是「失败时屏上还有什么、说了什么原因」，不是内部实现。夹具桥原本缺 `availability` 字段（真机每行都带），走查里补上，否则 fail-closed 闸会把清单挡成空而掩盖要测的东西。无「修对了反而掉分」先例。

## 5. P0：我们独有的吗

不是独有。「失败保留旧值」就是 TanStack Query / SWR 的 stale-while-error 语义；接入它们要把整个目录读取链换栈，不在这次范围，且本仓这条链只有 1 个缓存 + 1 个 hook，自写量很小、已在同一个缓存层。不引入新依赖。

## 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 换成 TanStack Query | 整条目录读取链重写，多个调用点 | 大 | 否（不在这次范围） |
| 补（调用点） | hook 的 catch 里少清一行 | 小 | 缓存刷新作废仍会丢旧值，别的调用点各补各的 | 否 |
| **改 owner（本次）** | 缓存层只在读成功时记一份「上一份成功」，刷新作废不动它；失败分支由缓存层一个函数决定留什么；状态里多一档 `stale_kept` 说原因 | 小 | 低 | **是** |
| 删 | — | — | — | 不适用 |

## 7. 用户要权衡的核心

读失败时：是宁可显示一份可能已过期的选项并明说原因，还是显示空态——我们选前者（创作者不该因为一次读失败就选不了模型），代价是旧清单里可能有一个刚被停用的模型，生成时由主进程可用性闸兜底。

## 特征测试清单

- `src/config/modelCatalogCache.test.ts`：刷新后 `models:list` / `vendors:list` 抛错仍留上一份；成功后替换；从没成功过不凭空造；
- `src/config/modelCatalogStatus.test.ts`：有旧清单 + 错误 = `stale_kept` 带原因；无旧清单 = 空态带原因；
- `src/ui/onboarding/catalogReadFailureIsVisible.test.ts`：扫描范围加入 `useModelOptions.ts`（门岗自动拦同类写法）；
- `tests/ux/model-catalog-keep-on-failure.walk.mjs`：真组件走查，中英各两格，截图在 `docs/evidence/2026-10-18-model-catalog-keep/`。
