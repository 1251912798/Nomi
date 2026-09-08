# 走查运行时减重：先量再砍

> 日期：2026-09-08 · 状态：调查中，尚未验收

## 范围与验收

只改 tests/ux、允许的 walkthrough/validation-policy 脚本与文档；不改生产代码、不新增依赖、不读真实资料库、不删场景、不放宽断言、不用 reload。每项以相同文件三遍全绿及五张前后截图目视对账验收。最后 contracts 指定门岗及 gates，分阶段提交，通过 hook 推分支并建 PR，不合并。回滚按 A/B/C 独立提交恢复，不变更产品持久化格式。

## 已核实的执行边界

- 基线 HEAD / origin/main：82c671203be4f71ecd4d5512b12864aa76a2a907；delivery:preflight 为 same-commit、clean。
- tests/ux 下确有 253 个 .walk.mjs / .e2e.mjs。
- package.json 的 gates = fresh-base → contracts → test → build → stamp。check-walkthroughs.mjs 是静态扫描，不是运行登记表；Vitest include 只收 .test.ts/.test.mjs，未收 .walk/.e2e。因此该命令直接执行的走查为 0，启动次数为 0，走查前十占比无定义。不得把静态扫描绿说成运行通过。
- 实际 canvas 登记在 tests/ux/canvas-real-suite.mjs：critical 4、full 13、performance 1；分类器决定独立 CI lanes，而不由本地 gates 调用。以 full 13 文件为实测提速分母，另报 gates 墙钟。
- 统一启动边界 tests/ux/_launchApp.mjs 默认每次空白四目录，DOMContentLoaded 后默认固定等 1500ms。部分调用已设 settleMs:0，但还另等首启和项目切换。
- evals/lib/isoApp.mjs prepareIsolation 即使 requireCatalog:false，仍在真实 catalog 存在时复制它，且文件不在可改范围。本任务不调用这条路径；沿用 _launchApp 的空白四目录隔离。

## P2 调查

症状：大量窗口与场景固定等待拖长走查。直接原因与类根因须由实测排序确认；目前可重复入口为 _launchApp 默认 settle 与 canvas-shortcuts / canvas-node-context-menu 的六次 dismissFirstRun 循环。归类 recurring（每个新隔离 profile 均可复现），修复 owner 为测试启动/场景准备层。生产路径不改，产品缺陷仅记账。

## 实验顺序

1. 基线 full 全套，保留原输出、每文件墙钟和截图；另测启动到真实可点击控件的里程碑。
2. A：仅使用产品已有持久状态预置首启，不能凭空添加关闭主题/更新字段，不能影响专测 onboarding 的场景。
3. B：按量表确认重复启动；只有相同隔离形状、相同入口才共用实例；保留单场景执行。持久化重启验证不合并掉。
4. C：固定等待替换为实际控件/状态；保留 expectAbsent 的完整观察窗口及截图安定检查。GPU 参数先 A/B，不能损失 WebGL 覆盖。
5. D：在现有 gates 锁内量串行与两个 Electron 并发；不改锁，不假定 10 核就安全。

## 数据表（测量后回填）

| 改动 | 改前 ms | 改后 ms（三遍） | 节省 | 结论 |
|---|---:|---:|---:|---|
| baseline full 13 | 305231 / 300439 | — | — | 两遍 13/13 PASS |

目标 full 总墙钟下降至少 40%；不足须按实测解释，不降低门槛。C1 已三遍验证，A/D 与最终 gates 尚待完成。

## 首启状态事实（代码证据，非实测时间）

| 环节 | 现有字段/行为 | 成本与处理 |
|---|---|---|
| 宣传片 | onboardingState.ts 的 nomi:splash:v1=seen；SplashIntro.tsx SCENE_MS=2600、SCENE_COUNT=5、退场 460ms | 自然播放约 13460ms；点击跳过仍需退场。实测另列 |
| 引导旅途 | nomi:journey-tour:v1=seen，只用于 CTA 文案；主动点击才启动 | 冷启不自动播放，不虚报节省 |
| 上手清单 | nomi:checklist-dismissed:v1=1；默认 collapsed | 默认不挡首个控件；不能随便删掉截图中的清单入口 |
| 更新 | electron/update/autoUpdater.ts + src/ui/app-shell/useUpdater.ts，只在 check() 里调用 | 无自动检查关闭字段；不添加 Chromium 假开关 |
| 主题 | src/theme/colorScheme.ts primeNomiColorScheme，nomi-color-scheme 为 light/dark | 已在首帧预置；无持久的关闭过渡字段，截图继续等安定 |

## 先查别人

- Playwright Electron 官方启动 API：https://github.com/microsoft/playwright/blob/main/docs/src/electron-api/class-electron.md；已通过 Context7 核对。安装版本 1.60.0 的 Electron.launch 类型没有 storageState，不能照搬浏览器 newContext 的选项；launch 后 addInitScript 无法保证赶在首屏脚本之前，不采用竞态预置或 goto/reload 补救。
- Electron session 官方 API：https://github.com/electron/electron/blob/main/docs/api/session.md#sesregisterpreloadscriptscript；registerPreloadScript(frame) 在 WebContents 的原 preload 之前运行，只实验写现有 localStorage 字段，不替换产品 preload、不改变 React 状态、不注入生产逃生口。安装 Electron 43.4.1 类型确认支持该 API；是否采用取决于启动实测，不改依赖。
- 近邻优先采用本仓既有 _launchApp、_assert、canvas-real-suite 与四目录隔离；不引入额外 runner 框架。

## 产品/边界缺陷记录

1. prepareIsolation 的 requireCatalog:false 不阻止读取/复制真实 catalog，和“全新空隔离”目的冲突；该文件在本任务白名单外，仅记录，不执行这条路径。

## 改前实测第一轮

锁排队约 3 分钟另计。实际 13/13 PASS，文件墙钟合计 305231ms；前十占 94.21%。首次构建已在计时前完成；第二轮增加只读启动计时探针，以区分启动完成/DOM ready/首次成功点击（后者包含脚本主动等待，不能冒称最早可交互）。

| 文件 | 墙钟 ms | 结果 |
|---|---:|---|
| tests/ux/group-baseline.walk.mjs | 79104 | PASS |
| tests/ux/canvas-batch-production.walk.mjs | 44296 | PASS |
| tests/ux/group-ports.walk.mjs | 34695 | PASS |
| tests/ux/canvas-drag-pan-gestures.walk.mjs | 28958 | PASS |
| tests/ux/canvas-shortcuts.walk.mjs | 25340 | PASS |
| tests/ux/canvas-card-stack.walk.mjs | 20706 | PASS |
| tests/ux/group-reference-direction.walk.mjs | 14739 | PASS |
| tests/ux/selection-toolbar-vendor.walk.mjs | 14637 | PASS |
| tests/ux/canvas-node-context-menu.walk.mjs | 13402 | PASS |
| tests/ux/canvas-context-menu-click.walk.mjs | 11688 | PASS |
| tests/ux/react-flow-read-only.walk.mjs | 10958 | PASS |
| tests/ux/p4-s5-canvas-landing.e2e.mjs | 4527 | PASS |
| tests/ux/p4-s5-canvas-reconcile.e2e.mjs | 2181 | PASS |

最慢 group-baseline 的 composer 选择器 `.generation-canvas-v2 [class*=min-h-150px]` 已失效；当前真源为 NodeGenerationComposer.tsx 的 `.generation-canvas-v2-node__composer-card`。boundingBox 默认长超时后 catch(null) 吞错，需修探针而非缩超时。

## 改前第二轮（带启动观测）

13/13 PASS；文件墙钟合计 300439ms。计时从 Playwright electron.launch 调用开始。首次点击耗时是实跑脚本成功点控件的时点（含脚本 sleep），DOM ready 不等于交互 ready。

| 文件 | 启动次数 | Electron launch ms | DOM ready ms | 首次成功控件点击 ms | 文件墙钟 ms |
|---|---:|---:|---:|---:|---:|
| tests/ux/group-baseline.walk.mjs | 1 | 688 | 713 | 3112 | 79534 |
| tests/ux/canvas-batch-production.walk.mjs | 1 | 592 | 613 | 4197 | 43430 |
| tests/ux/group-ports.walk.mjs | 1 | 572 | 592 | 2978 | 34478 |
| tests/ux/canvas-drag-pan-gestures.walk.mjs | 1 | 493 | 516 | 8127 | 27826 |
| tests/ux/canvas-shortcuts.walk.mjs | 1 | 919 | 956 | 2594 | 25406 |
| tests/ux/canvas-card-stack.walk.mjs | 1 | 552 | 574 | 2656 | 20629 |
| tests/ux/group-reference-direction.walk.mjs | 1 | 688 | 1208 | 4628 | 15186 |
| tests/ux/selection-toolbar-vendor.walk.mjs | 1 | 617 | 638 | 3626 | 13624 |
| tests/ux/canvas-node-context-menu.walk.mjs | 1 | 673 | 714 | 2249 | 13395 |
| tests/ux/canvas-context-menu-click.walk.mjs | 1 | 572 | 592 | 2134 | 11200 |
| tests/ux/react-flow-read-only.walk.mjs | 1 | 647 | 1293 | 4867 | 9296 |
| tests/ux/p4-s5-canvas-landing.e2e.mjs | 1 | 555 | 576 | 851 | 4206 |
| tests/ux/p4-s5-canvas-reconcile.e2e.mjs | 1 | 465 | 484 | 790 | 2229 |

## 启动与实例数量裁决

独立空白四目录冷启探针实测：DOMContentLoaded 1041.1ms；skip trial-click 成功 1296.5ms；点击 skip 后遮罩 detached 2121.2ms；新建空白项目 trial-click 成功 2138.0ms。以上属于真实可操作检查，和表内实跑首次点击口径分开。

13 个文件均为一次启动；Electron launch 合计约 8 秒，不足总时长 3%。B 暂不改：当前选择集没有同文件反复 launch 的场景可删；跨文件复用最多省启动的一小部分，却会共享 OS 剪贴板、选择态与项目状态。原有持久化/多机器测试的重启有测试意义，不能拿掉。保留 13 个独立入口，不用一大坨组绑定成败；合并组数目前 0。

C 首刀按排序处理 group-baseline 与 group-ports。前者单选探针不证明已单选、composer 仍查退役的 min-h class，boundingBox 超时被吞；改用真实 clear-selection、单选数量断言、当前 composer 控件、截图定位缺失直接失败。后者仅删除开项目后、尚未触发生成时那一次无意义“开始生成”弹层等待；用户点批量生成之后的确认卡等待和断言原样保留。

## C1 验收

同组连续三遍均绿（6/6），不重跑修到绿、不放宽断言。

| 每刀 | 改前 ms | 改后三遍 ms | 中位节省 ms |
|---|---:|---|---:|
| C1 group-baseline | 79534 | 48246 / 48357 / 48288 | 31246 |
| C1 group-ports | 34478 | 20373 / 19761 / 20016 | 14462 |

五张前后截图已 Read 目视并排核对：group-baseline 的 01–05，布局、节点数量、工具条与配色一致；项目名称内的时分随真实运行变化。新增 07-composer-real.png 已目视确认包含真正 composer；原探针吞错时未产这张图，不把缺失证据称为正确基线。证据留 /tmp/nomi-walk-speed-evidence/c1-five-pairs.jpg 与 baseline-shots。

截图另观察到 composer 左侧与 rail 重叠（第一节点位于左边界）；属于产品视觉问题线索，仅记录，不在本任务改 src。group-label 的旧截图裁剪落在视口外，只截到 AppBar，是原走查取证缺口，后续收敛截图边界时处理。

## C2 候选：不额外打开 DevTools

启动观测里 read-only 和 group-reference 各有第二个页面。electron/main.ts:149 的 isDev 由 VITE_DEV_SERVER_URL / NOMI_DESKTOP_DEV 判定；同文件 :365 在 isDev 时 openDevTools(detach)。getRendererUrl 同时已支持 NOMI_RENDERER_URL（:232），可指同一 Vite 页面而不启用开发模式。准备实测这两个 fixture 改用既有 URL 入口；不改 Electron 生产源码，不设置新的产品后门，也不改变被测页面。结论以相同两文件三遍与截图对账为准，尚未实施/计收益。


C2 实测拒绝：react-flow-read-only 在 17067ms 失败，真实节点未出现，HTML 只有空 root。已撤回两文件的 NOMI_RENDERER_URL 切换，不为少窗口修改生产渲染策略、不降低节点断言。开发模式必须保留，因此两个 DevTools 不纳入已节省窗口数。

A 原型：Electron default_app.asar/main.js:39 的解析只认分开的 -r/--require，且遇应用路径就停止解析；所以放在 `.` 后面或写 --require=… 不会生效。前置 `-r <module>` 实测首帧前 localStorage 已为 seen、splash=0，真实项目入口 trial-click 2145.0ms。相对独立手动 skip 的 2138.0ms 尚无冷启提升证据；A 的目标改为消掉现有调用方“写状态→reload→额外 sleep”的重复准备，采用之前必须由这几份文件三遍实测证明收益。

## B 裁决（不合并）

以实际运行的 full 13 文件为边界，均只有一次 Electron launch；没有同文件可复用的第二次启动。
跨文件合并收益上限约 8s（2.7%），还会把剪贴板/窗口焦点/项目生命周期耦合。维持独立文件、独立隔离目录与独立结果，合并 0 组，启动次数不虚报减少。持久化重启语义保留。本刀不改代码、节省 0ms。

## 自然首启补测

未预置、未点跳过的独立冷启：DOM 1199ms；跳过按钮出现 1440ms；宣传层消失 15321ms；新建项目可点击 15349ms。与手动跳过 2138ms 分开报告，不把自然播放成本冒算成已有走查收益。
