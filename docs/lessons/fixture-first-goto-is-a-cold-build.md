# 夹具页的第一次 goto 是一次冷编译，不是一次界面操作

> 📎 教训 · 首次记录 2026-10-24 · 状态：✅ 已固化（`tests/ux/_browserFixture.mjs` 的 `useBrowserFixture` + ESLint 规则 `browser-fixture/no-restricted-imports` + 夹具合同测试 `tests/ux/_browserFixture.test.mjs`）
> **触发场景**：vitest 浏览器夹具测试 `page.goto: Timeout … exceeded` 或 `Hook timed out`，单跑能过、gates / CI 忙时红；想把 goto 调到 90 秒、用例调到 240 秒的时候。

**结论**：夹具页要一千多个模块，第一次 `page.goto` 就是在等 vite 开发服务冷编译（依赖扫描 + 预打包 + 逐个转译），时长 = 模块图大小 × 机器负载 × 同时冷编译的夹具数。把它算进「一次本地操作 15 秒」，等于按机器忙闲判红绿。起服只走 `useBrowserFixture`：依赖扫描只认入口页，准备阶段把入口页编完（load / ready 是确定信号），冷编译只受一份构建余量约束，用例里的 goto 只执行页面。

**为什么会踩**：
- `createServer({ configFile: false })` 不给 `optimizeDeps.entries` 时，vite 把根目录下全部 `*.html` 当依赖扫描入口——本仓 596 个（官网、设计稿、整个应用），只为一张夹具页（`DEBUG=vite:deps` 实测扫描 3.1 秒、预打包 2.4 秒）。
- 实测 `text-document-generation-ownership`（10 核 macOS）：空闲冷 goto 3–4 秒；16 个满载进程 + 4 份并行 17–20 秒（15 秒预算 12 跑红 5）；准备阶段编完后用例里的 goto 1.5–5 秒。
- 10 个夹具测试一起跑（整机负载 30–50）时单文件冷编译 3–31 秒，最慢的是 4 个各自冷编译同一张分镜编辑器页面的测试——共享一份编好的服务是下一步。
- 在此之前每个测试各抄一份起服代码，各自把超时调大：goto 90 / 120 秒、钩子 120 秒、用例 240 秒，`storyboard-reliability-cases` 干脆整个不用 vite 了——同一个根因被当成五个文件的「慢」各修一遍。

**怎么用**：
- 新写浏览器夹具测试：测试文件自己 `import { chromium } from 'playwright'`，`const fixture = useBrowserFixture({ entries: ['tests/ux/fixtures/x.html'], browserType: chromium })`，用例里 `fixture.browser.newPage()` + `page.goto(fixture.url(entry, '?query'))`；挂载还要按需加载模块的页面给 `ready` 选择器。
- 在 `tests/**/*.test.*` 里直接 `createServer`（具名 / 改名 / 命名空间 / 动态 import）会被 ESLint `browser-fixture/*` 拦；用应用 vite.config 的两份存量在调用处带 `eslint-disable-next-line … -- 理由`，迁走后那行注释会被 ESLint 报成没用的豁免。
- 共享 helper 不替测试起浏览器，浏览器由调用方传入：推送前的相关单测（`scripts/pre-push-related-tests.mjs` 的 `startsBrowser`）靠「测试文件自己 import playwright」认出起浏览器的测试、只交给 CI。夹具第一版自己 import playwright，信号被它带走，10 个夹具测试被当快测试划进推送前（本机 gates 的 `check:claude-hooks` 两条必红）。现在 `browserType` 必填、缺了当场抛错，夹具源码里没有 playwright 的运行时 import；`tests/ux/_browserFixture.test.mjs` 普查每个调用者。再写起浏览器的 helper 也照这个办，别去改识别器迁就它。
- 再看到「goto 超时」先分清是冷编译还是页面自己崩了（`gate-blames-environment-for-a-page-error.md`），别先调超时。

**出处**：分支 `fix/text-ownership-flaky`；根因合同 `docs/fixes/2026-10-24-browser-fixture-ready-signals.root-cause.json`；同族 `fixed-wall-clock-caps-break-when-work-grows.md`。
