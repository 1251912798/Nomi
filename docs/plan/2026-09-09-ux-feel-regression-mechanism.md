# 体感回归机制（2026-09-09）

> 状态：已实现并通过本地完整 gates，PR #662 交付；未合并。

## 先查别人

- Playwright Page 截图与等待：https://playwright.dev/docs/api/class-page
- Playwright Locator 根节点求值：https://playwright.dev/docs/api/class-locator#locator-evaluate
- MDN 文本范围几何：https://developer.mozilla.org/en-US/docs/Web/API/Range/getClientRects

|能力|别人怎么做|我们直接用|不做的理由|
|---|---|---|---|
|视觉/交互稳定性|Playwright locator/actionability 与截图|Playwright 页面根节点扫描|不接云服务|
|可达性/对比度|axe-core/@axe-core/playwright|保留 axe 接口位，当前离线规则|不装包（仓库未提供）|
|视觉基线|Chromatic、Percy、Argos diff|状态截图命名与 JSON 接触表|零付费、不接服务|
|交互测试|Storybook interaction/play tests|声明式旅程目录|不引入 Storybook runtime|
|布局缺陷|DOM Range / CSSOM View 几何原语|DOM rect overlap/clipping/viewport/hit|通用 DOM 规则|
|判官|OpenAI/Anthropic rubric|四问 0–3 可插拔量表|今晚离线规则跑一遍|

## 机制
`tests/ux/_feel.mjs` 接受任意 Playwright Page/Locator 根节点与数据规则，输出 findings JSON；不引用产品选择器。规则覆盖文字重叠、裁切、出视口、点击被拦、字号下限，；对比度规则尚未实现。旅程目录是声明式 JSON，夜跑只消费目录。

## 验收
首轮夜跑必须包含 Agent 面板、HTML 产物、3D 产物三条已知症状；每张截图回答舒服吗/能点吗/看得全吗/读得清吗，0–3 分并登记 owner。每个共享启动器走查通过 helper 自动扫描；豁免需登记理由。

## 接手返工范围与根因（2026-09-09）
- 症状：扫描只靠作者显式调用；跨容器漏检、正常滚动误报；夜跑未执行浏览器。
- 直接原因：扫描器把发现直接抛出、同父过滤、整页边界未经滚动裁剪；目录脚本只生成占位路径。
- 类根因：观测、策略与证据没有在共享边界闭合。分类 recurring；同类入口实扫 `_launchApp.mjs`（tests/ux 与 evals 共用）、`_assert.mjs`（显式断言）、三个 feel walk（旧目录检查）。
- 只改测试/脚本/文档；不改生产代码、不加依赖。扫描器只负责发现，共享观察器负责截图/状态等待后的整页扫描、证据与基线裁决。已有 Playwright 保留，不引入其私有 API。
- 网格分桶比较跨容器叶子文字；可见几何先与滚动祖先相交；规则逐函数展开。
- 先跑新夹具留红证据，再实现；每条规则一红一绿，加根节点隔离、滚动与共享接线测试。
- 夜跑使用声明式 HTML 复现夹具，真实截图与扫描；这些是机制证据，不能冒充当前产品旅程完成或生产缺陷已修复。
- 回滚：整体回退本任务测试机制提交；生产构建不受影响。验收：夹具、nightly、完整 gates、正常 hooks、PR #662。

## 六条通用性对账
|约束|落点与证据|
|---|---|
|断言库无产品选择器|`tests/ux/_feel.mjs` 仅 DOM tag、Text Range、几何；`check:feel` 拦产品引用|
|共享入口默认扫描、豁免棘轮|`_launchApp.mjs` 自动安装 `_feel-observer.mjs`，Page/Locator screenshot / waitForFunction / waitForSelector / waitForLoadState 完成后整页扫描；新窗口同样接入。`feel-exemptions.json` 初始空、只减不增|
|旅程声明式|`journeys/catalog.json` 声明状态 HTML、owner、已知症状；三个 walk 仅选择 journeyId；nightly 无产品分支|
|通用判官量表|目录统一四问 0–3；没有视觉判官时 score=null，明确 needs-human-or-visual-judge，不用几何规则冒充审美分数|
|不 import 产品代码|扫描器零 import；观察器只 import node 标准库与扫描器；夜跑只用已有 Playwright 与通用测试模块|
|根节点+规则→发现 JSON|Page/Locator 两类根节点均支持；规则覆盖可配置；发现不抛错，基线策略在外层|

实际搜索：`tests/ux` 没有 `waitForProduction` 调用；同名函数位于 `electron/productionRun/productionRunTestHelpers.ts`，是无页面的服务单测等待器。本次不改该文件；接入实际页面等待边界（上表），不宣称观测了服务层等待。

## 首轮实际执行证据
- 新规则测试在旧实现：7 tests / 0 pass / 7 fail；跨容器 missing text-overlap，Locator 参数契约也失败。原始记录 `/tmp/ux-feel-red.log`。
- 修正后：11 tests / 11 pass（六规则红绿、根节点隔离、基线增减、截图和等待自动接线）。记录 `/tmp/ux-feel-green.log`。
- 空基线夜跑先红：20 张真实浏览器夹具截图，12 条发现，8 个状态/主题发生 drift；修正文字自身裁剪后再跑：20 张、10 条、drift=0。
- 三条已知症状：Agent 跨容器文字层叠（每主题 1）；HTML 裁切与不可交互（每主题 2）；3D canvas pointer-events 禁用（每主题 1）。owner 随基线登记。
- 新发现：工具回执 9px 字号（每主题 1）；这是新增机制夹具检出，不是对当前产品的新缺陷断言。
- `artifacts/feel/nightly.json` 与 `nightly.html` 为实际发现和可打开接触表；20 张 png 路径均真实存在。
- 本任务书 `brief-ux-feel-mechanism-codex.md` 未在当前工作区找到；六项要求以本轮用户原文为准。

## 官方 API 边界核对
使用现有 Playwright 1.60.0 的公开 Page/Locator evaluate、screenshot、waitForFunction API，已读本地 `playwright-core/types/types.d.ts` 对应签名；无私有 instrumentation、无新框架层。
- https://playwright.dev/docs/api/class-page#page-screenshot
- https://playwright.dev/docs/api/class-page#page-wait-for-function
- https://playwright.dev/docs/api/class-locator#locator-evaluate
- https://developer.mozilla.org/en-US/docs/Web/API/Range/getClientRects

补充边界回归：文字 Range 必须被自身 overflow 裁剪，否则已经隐藏的字会误报与下一个按钮重叠；新增用例钉住该边界，移除基线两条误报（12→10）。

截图观察覆盖 Page 与 locator/getBy*/派生 Locator（含 all）；Locator 截图后仍扫描整页。夹具证明按钮截图也能检出按钮外的字号缺陷。整页正常滚动也有独立不误报用例。

全量测试发现旧 `_feel.test.mjs` 使用 node:test 却被 Vitest 收集，导致 No test suite found；两份 .test.mjs 统一使用 Vitest 注册，保留 Playwright expect 断言。最终窄测命令：`pnpm exec vitest run tests/ux/_feel.test.mjs tests/ux/_feel-observer.test.mjs`。

## 最终交付验证
- 验证代码 SHA：`d8a770cd5e0c26c54506ef14f4fd8105bcf09569`，已整合当时最新 origin/main，behind=0。
- `pnpm run gates` exit 0：76 contracts，73 pass / 0 blocking / 3 advisory；1292 个 Vitest 文件、12069 tests pass（1 文件、2 tests skipped）；agent runtime / janitor / stats 与 Vite、Electron 构建均通过。
- 最终窄测 11/11；夜跑 20 张截图 / 10 条发现 / drift=0。人工查看 Agent 重叠、HTML 裁切、3D 禁用交互夹具截图，与记录一致。
- 收据日志：`/tmp/ux-feel-gates-delivery.log`；后续文档收据不改变上述被验证代码。

## PR #662 CI 根因修复（2026-09-09）
- 分类 recurring：测试运行环境的能力没有在收集边界声明；同类入口实扫 `_feel.test.mjs`、`_feel-observer.test.mjs` 与 design-lab `*.visual.spec.mjs`。前两份为唯一启动 Chromium 的 `tests/**/*.test.mjs`，后者已有独立 Playwright 车道。
- 为什么本地绿 CI 红：本机有缓存的浏览器；Unit CI 不安装浏览器。沿用专用后缀分道：两份迁为 `*.browser.mjs`、node:test runner，`test:feel:browser` 显式执行；Linux desktop 安装 Chromium 并执行，Unit 不加安装步骤。
- smoke 待核实：run 34275108604 的 linux-walkthrough-evidence 已下载，但旧上传清单漏掉 artifacts/feel，无法取到 13 条 DOM 发现。补上传证据；本地 smoke 正排队复现，不能把 macOS 参数模拟当成 Linux 执行。
- 先查同类：`docs/lessons/canvas-perf-budget-calibrated-on-macos-fails-on-linux.md` 只允许延迟预算按平台校准，计数/正确性不能据此放宽；design-lab 视觉道明确校准平台。需看实测元素再决定 A/B。
- 范围仅测试、CI 接线与本计划；不改生产代码、依赖、.gitignore。回滚本次提交恢复旧机制；验收 browser 11/11、Unit 不收浏览器测试、本地 smoke、完整 gates、正常 hooks 推送原 PR。
- **选择 B，排除 A**：macOS `pnpm run test:e2e` 同样在 `smoke:waitForFunction` 检出 font-size 13/0，故不是平台差异。13 个元素依次为 span「1/4」「素材库」「分组」「提示词」「技能」「流程」「镜头 1」「生成方式」、div「用即梦会员积分，纯文字生成图像」、span「D」「变体」「N」、summary「—」。CI 没上传 DOM JSON，不能声称逐元素验证了 Linux；本地同计数同阶段、CI 截图与日志是目前证据。
- B 的登记边界：扫描器补 `fontSizes` 证据；豁免只匹配指定 checkpoint 下的 rule + tag/text/fontSizes，逐条消费（重复增加仍红）。记录全部原始发现，只有已登记发现免计；删除原有“整个 checkpoint 有豁免就不判红”的宽豁免。owner/reason 必填，merge-base 已有登记只减不增；首次登记允许本次用户明确授权的 B 校准。不改 baseline allowed，不关观察器。
- 设计依据：`docs/design/nomi-design-system.md` §字号允许 micro=11px，`tailwind.config.ts` fontSize.micro=11px；此为既有小字号被新机制检出，产品整改/设计判定留给对应 owner，本 PR 只建立精确机制登记。

- 第二次实测补录：上述 13 个元素 `fontSizes` **全部为 [11]**；精确登记在 `feel-exemptions.json`，owner=design-system，baseline 仍为原值。纯策略回归证明同文案额外节点、变成 10px、换文本/标签/规则/状态都会继续红。
- 修复后本地 `pnpm run test:e2e`：**SMOKE PASS: 17 assertions**。`artifacts/feel/smoke/contact-sheet.json` 保留 findings=13 / exempted=13 / drift=[]；截图人工核对侧栏、镜头标签和生成方式区域，扫描没有停用。原始红记录 `/tmp/ux-feel-smoke-details.log`；绿记录 `/tmp/ux-feel-smoke-green.log`。
- `vitest list --filesOnly` 实际收集清单不含两份 browser 文件，仅收纯策略 `feel-policy.test.mjs`。浏览器原 11 个用例与纯策略 2 个用例均通过；CI 接线检查 13/13。
- 本轮完整 `python3 scripts/with-gates-lock.py -- pnpm run gates` **exit 0**：76 contracts / 73 pass / 0 blocking / 3 advisory；Vitest 1291 files pass + 1 skipped，12060 tests pass + 2 skipped；agent runtime / janitor / stats 及 Vite/Electron build 通过。日志 `/tmp/ux-feel-ci-fix-gates.log`。未提交其他运行报告，UF-LAST.md 仅取消跟踪（.gitignore 不变）。
