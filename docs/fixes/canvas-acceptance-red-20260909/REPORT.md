> 2026-09-09 收尾更新：22:30 补充裁决已授权，以下分诊为历史。产品层已迁为连续串最小平移/有界 fit；通知断言已迁至真实节点生命周期。两尺寸 group-baseline 和 batch-production 本地通过，完整gates exit 0，PR交付中。详见文末。

# Canvas Acceptance 两片红分诊证据

状态：main 双红已确认；未改生产代码、走查断言、超时或视觉基线。批量通知契约与任务禁令冲突，等待任务发起者裁决。

## 基线和复现

- main：77b8d4c07812d446160fe3a8abd3a51bfacd59f8；tree 5d0d83ea43eadaefddf270f5d4f128db1d77bc3f。
- #682 merge：f708568df；#685 head：205a0f5957cab50d07cd18046f843f4f2a5a7705。
- #685 与 main 的真实 Git 合并 tree：e7ae8ed449e19138b79d5810eef51d42020bdaed。使用 git merge --no-commit --no-ff 构建验证后已 abort，恢复任务分支/main。
- 所有 Electron 运行均采用 launchNomiApp 隔离 profile 和临时项目，批量供应商仅 loopback；未改用户资料库。

| 树/入口 | 视口 | 结果/证据 |
|---|---|---|
| main 原始 group-baseline | 原始默认窗口 1440×960（内容略小） | PASS；main-group-baseline.log |
| main group-baseline | 内容 1680×1050 | PASS；main-group-1680.log |
| main group-baseline | 内容 1100×720 | PASS；main-group-1100.log |
| main group-baseline | CI 实测内容 1280×933 | FAIL，同第73行 rail 拦截；main-group-ci1280.log |
| #682 group-baseline | 内容 1280×933 | PASS；base682-group-ci1280.log |
| #685 merge group-baseline | 内容 1680×1050 | PASS；merge685-group-1680.log |
| #685 merge group-baseline | 内容 1280×933 | FAIL，同第73行 rail 拦截；merge685-group-ci1280.log |
| main 原始 canvas-batch-production | 脚本设置窗口1680×1020/内容1680×993 | FAIL，第432行；main-batch-production.log |
| #685 merge 原始 canvas-batch-production | 同上 | FAIL，第432行；merge685-batch-production.log |

尺寸对照通过 window-observer.mjs 的 Node loader 在 launch 返回前设置窗口和内容尺寸，不改变任何走查操作、断言或超时；它仅用于取证，不是交付的走查，也不是生产修复。1280×933 来自 CI group-baseline 截图实际 PNG 尺寸。

## 片1：局部可见首卡的默认点击点落在祖先裁剪区外

症状：第73行 article 存在、可见且稳定，但其落点落在资源导轨，真实命中流程库/技能按钮。

直接机制：新增节点采用环形避让，视口层随后仅平移保证新卡可见。连续新增四卡后旧首卡可被推出左边但仍部分可见；走查全选、编组和清除选择都不改变视口，随后无条件点击首卡。#683 的右栏外边距增加32px，是改变该尺寸下落点/平移的触发候选；#682→main 对照证明发生回归，但尚未单独隔离32px改动证明充分因果，但不能把“所有旧节点必须同时可见”当作既有产品契约。

相关边界：
- src/workbench/assistantWidthBounds.ts:33-34：assistantPaneWidth 增加两侧 p-4 gutter（32px）。
- src/workbench/generation/GenerationWorkspace.tsx:54：新宽度用于右栏，画布可用宽度相应减小。
- src/workbench/generationCanvas/components/useCreatedNodeVisibilityPan.ts:125-132：按新节点和真实舞台尺寸计算最小露出平移，未承诺保留所有旧节点。
- src/workbench/generationCanvas/reactFlow/GenerationCanvasReactFlow.tsx:334-343：显式 fit 使用真实宿主尺寸和节点∪组框；本走查并未调用 fit。
- tests/ux/_launchApp.mjs:297-306：取得窗口后不建立尺寸前置条件；electron/main.ts:297-298 默认1440×960，CI又被显示环境缩窄。
- evals/lib/journeyRunner.mjs:81-92 的1680×1050只属于另一入口，且吞掉 resize 错误；Canvas Acceptance 不走它。
- .github/workflows/quality-gate.yml:233 仅 xvfb-run -a，没有显式屏幕尺寸。

已排除：NodeLabelRow.tsx:9 为 absolute，nodeSizing.ts 在 #682→main 无 diff；Sidebar 在 WorkbenchShell flex 中占位，本身不是覆盖层；不应再从 stage 扣一次 rail 宽。

类根因/不变量 owner：走查的窗口几何前置条件没有由共享 Electron fixture/CI display 边界建立、验证，导致同一断言随宿主屏幕和右栏宽度漂移。建议在这一边界显式声明、验证画布验收尺寸；如产品要保证新建/编组后所有成员同时可见，需先明确新的产品契约。仅给编组补 fit 会改变既有用户视口行为，不能当作已证明的根因修。

## 片2：通知策略迁移后走查仍验旧生命周期

真实 CI 证据：[run 34356010506 shard2](https://github.com/aqm857886159/Nomi/actions/runs/34356010506/job/102480870298)。完整日志第1207行起明确报 canvas-batch-production.walk.mjs:432，末尾有 canvas-full 2/2: FAIL (6/7)。summary.json 的 batch-production：exitCode=1、signal=null、timedOut=false、durationMs=45238。不是进程被杀。付费确认按钮命中正确，两波生成和参考依赖断言均已通过。

根因：fa9151168 经 #679 合入的通知政策删除普通进度/成功 toast（状态已有节点/任务中心承载），旧走查仍等待“开始生成”toast、要求其原位变成失败toast，并在重试成功后等待“已完成”toast。

- src/workbench/generationCanvas/components/batchPlanPreview.ts:183-185：进度由节点与任务中心投影，通知identity改为每批每项目独立。
- src/workbench/generationCanvas/components/batchPlanPreview.ts:198-207：无阻塞普通成功不发toast。
- src/workbench/generationCanvas/components/batchPlanPreview.test.ts:93：明确要求 ordinary progress and success 不重复toast。
- tests/ux/canvas-batch-production.walk.mjs:432、442、454-456：仍要求已退役的通知生命周期。

类根因/不变量 owner：通知策略迁移必须同步使用该策略的真实验收契约；现有策略单测与走查互相矛盾。正确方向是迁移既有通知相关断言到节点状态与独立失败恢复动作，保留付费、vendor零调用、依赖波次、重试、持久化和通知布局检查；恢复旧toast会违反现行策略，不是修复。

## 根因流程与交付限制

两项均 recurring，完成了症状复现、直接机制、类根因、同类入口扫描、共享owner辨别和历史对照。尚未实施修复，因此没有伪造包含“已改变结构防线/回归测试”的schema-v3合同。实施前应按根因技能补合同，含 invariant_owner_layer。

任务书禁止改变走查断言。片2的正确修复与此直接冲突，已通过澄清请求询问是否仅授权迁移已退役的通知契约；未获答复前不修改该项，也不为换绿恢复旧生产行为。片1亦不得把尺寸设置冒充解决所有窄窗产品布局问题。

验证记录：gates.log 为指定排锁命令的完整输出；invariant-tests.log 为新卡露出、批量通知策略及面板宽度既有单测。gates 不包含这两条完整Canvas走查，不能把 gates 绿等同于双红已修。

既有不变量单测：3 files / 24 tests PASS（invariant-tests.log）。此结果也验证了现行产品政策与旧通知走查确有冲突。

## 片1追加反证：32px回退不足以修复，默认点击点忽略祖先裁剪

在纯main产物、1280×933中仅通过测试页面CSS将右列减32px（830px画布/390px右列），仍同样失败，见main-group-ci1280-minus-gutter-geometry.log。该实验是取证，不是修复，也未写生产代码。

真实几何：stage左60、宽830；首卡x=-226.600006、width=340.000031，所以右边约113.4，真正可见水平区间是[60,113.4]，宽约53.4px。首卡不是完全消失。

Playwright 1.60.0官方安装源码 `node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core/lib/coreBundle.js:16145-16182` 的 `_clickablePoint` 取得content quad后只截到窗口[0,innerWidth]，最后取quadMiddlePoint；未与画布祖先的裁剪区域求交。该卡按窗口截取后的中心约x=56.7，正落在[0,60]导轨内，解释了“可见稳定但rail拦截”。

这项证据否定“扣回32px即能修复”以及“导轨本身错误overlay”的断言；#683可能改变触发几何，但不是完整类根因。类根因更精确地归属于验收交互几何：窗口前置条件未声明，默认点击点又未遵循真实舞台裁剪。最早修复边界应是共享验收窗口/可见命中几何；不应修改产品fit来迎合工具默认点，也不能把所有窄窗组合都说成已证明无产品缺陷。

## 交付基线刷新

排锁期间 main 合入 #681，第二轮 gates 的 check:fresh-base 在 a645aaa089a53af35f65c961511b7f7400dcf184 拦住旧head。任务分支随后以git merge --ff-only origin/main快进到该SHA；无任务提交。此前复现表仍明确属于77b8d4c07/#682/#685合并树，不将旧产物运行冒充新head验证。第三轮gates针对新head运行。首轮失败仅是诊断loader缺少显式node:process导入，已修正且独立eslint通过。

## 最终验证与阻塞状态

- 最新验证head：a645aaa089a53af35f65c961511b7f7400dcf184。指定命令 `python3 scripts/with-gates-lock.py -- pnpm run gates` 已取得锁并 exit 0。Vitest为1328文件通过/1跳过，12244测试通过/2跳过；后续agent-runtime及构建也完成，盖戳成功。
- 新head原始batch走查仍在第432行失败：latest-main-batch-production.log。
- 新head在CI尺寸的group仍同一click失败：latest-main-group-ci1280.log；诊断插入6行只做测量，日志行79对应原脚本73，断言/操作未变。实测stage=[60,858]，首卡水平范围[-278.76,61.24]，仅约1.24px处于stage内；Playwright按窗口裁剪后的中心x≈30.62，落在导轨。
- 故当前最新main仍双红，gates绿并不能覆盖这两项。没有生产修复、任务提交、push或PR；未改视觉基线。
- CANVASRED-LAST.md已写入根目录并复制到用户指定scratchpad。
- 继续交付需要任务发起者解除“旧通知契约相关走查断言不可改”的冲突；不能据elapsed time视为授权，亦不能恢复已退役toast换绿。


## 22:30 裁决后的实施与验证

- 最新基线 8a3136955736b734d21f526e5d17b510629c25d1，已含 #686。原有未跟踪证据临时保管后运行 delivery:preflight exit 0，随即原位恢复；无新增 worktree。
- 最早共享边界 `components/useCreatedNodeVisibilityPan.ts`：观察所有创建入口的 nodes ID 差异，连续串只存 ID、计算时取最新尺寸；可容纳时最小平移，不可容纳时复用 React Flow getViewportForBounds，最低沿用共享 CANVAS_MIN_ZOOM。删除/批量替换清理 pending，主动视口变化结束串。fit/滚轮下限从已有 0.2 抽到 canvasFitBounds.ts，不改变数值。
- `_launchApp.mjs`：共享 ACCEPTANCE_VIEWPORT={1280,933}，setContentSize + Playwright 内容 viewport 并核验；group-baseline --wide 复用共享 {1680,1050}。批量脚本原有自设 1680×1020/native 内容1680×993保持原样，本次没修改它。
- `_canvasHit.mjs`：expectNodeInsideCanvas 输出真实 stage/card 矩形并断言四边，不移动画布、不换点击点。两尺寸首卡见 group-1280-green.log/group-1680-green.log，截图 green-1280/green-1680。
- batch-production：queued/running → error → success 同一节点 DOM、mock fail once 原地失败可读；失败汇总仍提供独立一键重试及344px/top布局断言；同容器真实失败 alert 作为 proveProbe，expectAbsent 检查进度和成功静默，重试运行期再持续观察。无超时修改。batch-green.log 为全旅程收据，vendor 状态500→200。
- sequence-unit-red.log 保留新用例5红/旧11绿；invariant-tests-green.log 是共享几何/批量策略/启动器验证。原 latest-main-group-ci1280.log 和 latest-main-batch-production.log 为未修复红证据。ci-group-1280.png 从原CI shard1 artifact原样复制，PNG 1280×933，用于更正旧Linux尺寸教训。
- 人工查看两尺寸四卡全图与失败重试截图：首卡未被舞台裁剪，普通成功无toast，失败原因与重试按钮可见。无版本化视觉基线变更（tests/ux/shots为运行产物）。
- 无真实供应商费用；旅程仅隔离 profile + loopback。未改用户资料库。每日模型雷达另有7项新增、apimart-llm无法解密所以今天没查成；不纳入本修复/不更新baseline。论文雷达技能未安装，未生成论文结论。

实施 file:line：`src/workbench/generationCanvas/components/useCreatedNodeVisibilityPan.ts:65` (export function revealCreatedSequenceViewport)；`src/workbench/generationCanvas/components/useCreatedNodeVisibilityPan.ts:115` (export function useCreatedNodeVisibilityPan)；`src/workbench/generationCanvas/components/useCreatedNodeVisibilityPan.ts:154` (const added = nodes.filter)。自动新增差异层在节点创建调用者之后、视口动画之前，是具有舞台尺寸且能覆盖所有建卡入口的最早共享边界。


## 最终 gates 收据

规定命令已取得锁并 exit 0。1329 Vitest 文件通过/1跳过，12268用例通过/2跳过；Agent janitor/runtime 与最终构建通过，五门戳已盖。`verification-summary.log` 可随PR复核，完整大日志留在本目录 `gates-final.log`。第一轮只阻断 test-waits 与 walkthroughs：前者通过保留原5s/15s/5s等待调用、改为节点状态目标并让新增断言用共享预算解决；后者由按首卡ID是否已记录替代首次循环的裸数值判定解决。未修改任何门岗/基线/超时值。修正后batch全旅程再次PASS。


## 提交与推送评审

实现提交 `7f9436c23` 已正常推送到任务分支。完整提交最初因 Ponytail 的80行上下文 diff 超150KB被拒；遵照hook说明拆为实现与证据两次提交/推送。实现提交与pre-push均返回 completed with findings、exit 0；版本化适配器的当前语义是合法评审完成后放行（findings不等于PASS，未把它报告成无发现）。报告由适配器自动清理，无绕过hook。证据提交与最终PR身份见CANVASRED-LAST。
