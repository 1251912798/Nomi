# 体感回归机制（2026-09-09）

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
