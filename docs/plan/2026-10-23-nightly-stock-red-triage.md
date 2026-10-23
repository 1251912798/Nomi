# 夜跑存量红分诊清单（2026-10-23，只出清单、不改代码）

> 来源：协调线 F-nightly-build-gate PR-3。只读 `gh run download`（nightly-walks-* artifact），未写 GitHub、未改任何代码和 `tests/ux/nightly-ci-exclusions.json`。排期归协调。

## 0. 先答三问

1. 这处近 14 天修过几次：本 PR 只加一份文档，不改热点文件。
2. 是不是我们独有的：分诊是一次性盘点，没有新机制，不适用。
3. 补、换、删：都不是，只出清单；各组的处理建议见第 3 节。

## 1. 数据与缺口

- 看了 4 次夜跑：10-18（39110201487）、10-19（39226781160）、10-20（39394827628）、10-21（39570934046）。10-21 是门岗提交 b414e0862 之前的最后一次，是「稳定红」的基线。10-08 / 10-09 之后到 10-17 的 artifact 本次没取（保留期 14 天，10-08 的已过期），**缺口：10-08 首次运行的逐条日志只能用 docs/research/2026-10-08-nightly-walk-triage.md 对账**。
- 4 次里每条走查的结果型态（P 过 / F 红）：
  - `PPPP` 173 条
  - `FFFF` 149 条
  - `FFF-` 2 条
  - `PPFP` 2 条
  - `FFFP` 1 条
  - `PPP-` 1 条
  - `PPPF` 1 条
  - `FPPP` 1 条
  - `PFFP` 1 条
- **稳定红 = 4 次（或可见的 3 次）全红 = 151 条**（FFFF 149 + FFF- 2，「-」是那天还没有这条走查）。另有 6 条时红时绿（flaky）和 1 条只有 3 次记录且全绿，不在本清单，先观察。
- 10-22 那次的 335 条里，292 条是构建门拦截（PR #1293 / #1294 处理），其余 15 条是原有的异构红，不新增存量。
- 分类依据：10-21 的逐条日志里第一条带错误的行，按规则初筛（第 2 节），**这是日志证据，不是本机复现**。凡标「候选」「待本机复现」的，在本机跑出来之前不许下「真产品 bug」的结论。

## 2. 分组总表（合计 151 条 = 稳定红 151）

| 组 | 归类 | 说明 | 条数 | 处理建议 |
|---|---|---|---:|---|
| director-topbar | 走查自身坏 | 导演台走查共用入口「顶栏·添加/＋/视图」点不到（同一个共享 helper） | 15 | 修一处：tests/ux/_directorLab.mjs:204 的前置（导演节点选中后才出顶栏——10-04 e8ca3acf4d 改成「选中才出」）。先本机跑一条确认再改 helper，一处修好整簇应回绿 |
| hardcoded-path | 走查自身坏 | 写死本机项目路径（/Users/…/Nomi Projects/…） | 3 | 修：改用走查自建的临时项目；不隔离（隔离会让它永远没人看） |
| module-load | 走查自身坏 | 走查自己加载不了模块（路径移了 / 缺 tsx 加载器） | 2 | 修：改 import 路径 / 用仓库约定的 tsx 入口跑；不属于环境（与汇总环境特征表把 ERR_MODULE_NOT_FOUND 归环境有出入，见「对账」） |
| walk-bug | 走查自身坏 | 走查代码自己的错（TypeError / strict mode 命中两个元素 / localStorage 在错误页读） | 3 | 修：逐个小修，每个一行定位器或页面时机 |
| design-lab | 走查自身坏 | 设计实验室走查（失败 N 条汇总） | 5 | 待本机复现；设计实验室是内部页，优先级低，可先隔离并写到期日 |
| real-data | 环境依赖 | 需要真实资料 / 真实模型配置 / 真 key / 付费演练 / 本机探针文件 | 6 | 隔离：进 tests/ux/nightly-ci-exclusions.json（B 类）并补 owner + 到期日；付费演练类改名 .paid.mjs 让选择器自然排除 |
| video-codec | 环境依赖 | CI 的 Chromium 解不了视频 / 取不到封面（疑似缺 H.264 编解码） | 6 | 待验证假设：在 CI 上跑一条只开视频的探针确认；确认后隔离并写到期日，不要靠修走查 |
| i18n-ui | 真产品问题候选 | 英文界面残留中文 / 英文相对时间（疑似真产品缺陷） | 2 | 真产品问题候选：本机复现后按产品 bug 修（i18n 词典），优先级高于走查修补 |
| agent-resident | 真产品问题候选 | Agent 常驻面板 / feel 记录类走查：data-agent-resident 面板断言失败 | 20 | 待本机复现：这一簇共享 Agent 面板，若本机同样红则是真回归（先 gate 在 D 类名单）；若本机绿则是 CI 渲染差异，加一次失败页截图诊断 |
| layout | 真产品问题候选 | 布局 / 几何断言（窄档、时间轴溢出、浮框定位） | 5 | 待本机复现：CI 窗口 / 字体与本机不同时可能是走查脆；本机红则按产品修 |
| generic-ui | 暂不可判 | UI 断言 / 点击超时，从日志看不出归属 | 84 | 待本机复现：先抽 5 条代表（含 notification-policy、comfy-workflow-multiref、prompt-picker）本机跑，分出走查脆 vs 产品；每条结论回写本表 |

按三大类合计：
- 走查自身坏：28 条
- 环境依赖：12 条
- 真产品问题候选：27 条
- 暂不可判：84 条

## 3. 建议与优先级（交协调排期）

1. **先修一处，回绿一簇：导演台走查（director-topbar）**。15 条日志都是「点不到顶栏·添加 / ＋ / 视图」，共享 `tests/ux/_directorLab.mjs:204` 的 `clickOrFail(page.getByTestId('director-add-menu'), '顶栏·添加')`。`director-add-menu` 在产品里仍存在（`src/workbench/generationCanvas/nodes/director/panels/topbar/AddObjectMenu.tsx`），而 10-04 提交 e8ca3acf4d 把精修顶栏改成「选中才出」，嫌疑是走查没先选中导演节点。**这是假设，要先在本机跑一条（如 director-j2-walk-to-b）确认**，确认后改 helper 一处，预期整簇回绿；这是性价比最高的一刀。
2. **可以立刻隔离的（环境依赖，补 owner 与到期日）**：real-data 与 video-codec 两组。现有 `nightly-ci-exclusions.json` 的 29 条 B 类**没有 owner 和到期日字段**，隔离前先扩字段（owner、expires、reason），到期没人认领自动转回红。video-codec 先在 CI 上做一次只开视频的探针确认「缺 H.264 解码」这个假设。
3. **走查自身坏的小修**（hardcoded-path 3、module-load 2、walk-bug 3）：每个都是一行定位器 / 路径 / 加载方式，可打包成一个「走查小修」PR；hardcoded-path 修好后要同时让走查不再依赖本机的 `/Users/…/Nomi Projects`。
4. **候选真产品问题要先本机复现再定性**：i18n-ui 2 条（英文界面残留中文、英文相对时间）优先级最高——如果本机也红，这是用户可见的真缺陷，应按产品 bug 修词典，不是修走查。agent-resident 20 条（常驻 Agent 面板断言）和 layout 5 条，先各抽 2–3 条本机跑。
5. **84 条「UI 断言/点击超时」（generic-ui）日志看不出归属**。建议：先抽 5 条代表本机跑（notification-policy、comfy-workflow-multiref、prompt-picker、storyboard-strategy-resolve、telemetry-consent），分出「走查脆」和「产品」；同时在夜跑里**加失败页截图诊断**（失败时存一张页面截图 + DOM 概要进 artifact），否则 CI 上永远只有一行 Timeout，无法分诊。这是本清单最大的缺口，也可能是红了两周没人认领的原因之一：日志没有给出可行动的信息（推测）。
6. **删**：本次不建议删任何走查。要删必须先核 `nightly-ci-exclusions.json` 与 full-walk 目录有无其它入口引用（door-map / git grep）并写进该 PR；在没有复现结论前删等于把红藏起来。

## 4. 与 2026-10-08 分诊（docs/research/2026-10-08-nightly-walk-triage.md）对账

- 10-08 的口径是 A 走查漂移 56 / B 真实资源 30 / C 环境 13 / D 疑似真回归 25 / E 无法判 51（共 324 里的 169 失败 + 6 超时）。本清单按「走查自身坏 / 环境依赖 / 真产品」三类重排，目的是对应处理动作，不替换它的 A–E。
- 10-08 的 B 类 29 条已在 exclusions 里，本清单的 151 条里有 **0 条在 exclusions 中**（应为 0，非 0 说明排除未生效）。
- 稳定红中，10-08 标 A（漂移）的有 46 条、D（疑似真回归）17 条、E 43 条、C 12 条、10-08 之后新增的走查 33 条。这些在 10-08 就已标出，两周后仍稳定红；10-08 的清单没有 owner 与到期日，推测是它没被消化的原因之一（推测，未核对期间的修复记录）。
- 差异：模块解析失败（ERR_MODULE_NOT_FOUND）本清单归「走查自身坏」，而 PR #1294 的汇总环境特征表把它归「环境」。两者不矛盾（汇总只做粗筛、给出"不是产品回归"的信号），但建议下次调特征表时把 `module-not-found` 改成"走查自身"栏或拆出一栏，避免人以为是机器问题而不修。

## 5. 逐条清单（稳定红 151 条，按组）


### director-topbar（走查自身坏，15 条）

| 走查 | 10-08 分类 | 在 exclusions | 首个错误行（10-21 日志，已截断） |
|---|:---:|:---:|---|
| director-assets | E | 否 | ✗ 资产走查中断：Error: 点不到「顶栏·＋」：等满 Nms 它都没可见。 |
| director-electron | A | 否 | ExpectError: 点不到「顶栏·添加」：等满 Nms 它都没可见。 |
| director-j1-three-person-scene | - | 否 | ✗ j1-three-person-scene：3 项失败 —— 空工程·视口空态提示 / 空工程·时间轴空态 / 旅程中断：点不到「顶栏·添加」：等满 Nms 它都没可见。 |
| director-j2-walk-to-b | - | 否 | ✗ j2-walk-to-b：1 项失败 —— 旅程中断：点不到「顶栏·添加」：等满 Nms 它都没可见。 |
| director-j3-three-cameras | - | 否 | ExpectError: 点不到「顶栏·添加」：等满 Nms 它都没可见。 |
| director-j4-kneel-stand-look | - | 否 | ✗ j4-kneel-stand-look：1 项失败 —— 旅程中断：点不到「顶栏·添加」：等满 Nms 它都没可见。 |
| director-j5-splat-valley | E | 否 | ✗ j5-splat-valley：1 项失败 —— 旅程中断：点不到「顶栏·＋」：等满 Nms 它都没可见。 |
| director-j6-outputs | E | 否 | ✗ j6-outputs：1 项失败 —— 旅程中断：点不到「顶栏·添加」：等满 Nms 它都没可见。 |
| director-j7-skeleton | - | 否 | ✗ j7-skeleton：1 项失败 —— 旅程中断：点不到「顶栏·添加」：等满 Nms 它都没可见。 |
| director-j8-project-interactions | - | 否 | ExpectError: 点不到「顶栏·添加」：等满 Nms 它都没可见。 |
| director-mobile | - | 否 | ExpectError: 点不到「顶栏·添加」：等满 Nms 它都没可见。 |
| director-refine-tasks | E | 否 | ✗ refine-tasks：1 项失败 —— 旅程中断：精修顶栏没出来 |
| director-ual-crowd | A | 否 | ✗ ual-crowd：1 项失败 —— 旅程中断：点不到「顶栏·添加」：等满 Nms 它都没可见。 |
| director-ual-mannequin | C | 否 | ✗ ual-mannequin-zh：1 项失败 —— 旅程中断：点不到「顶栏·添加」：等满 Nms 它都没可见。 |
| director-windowbar | - | 否 | ExpectError: 点不到「顶栏·视图 ▾」：等满 Nms 它都没可见。 |

### hardcoded-path（走查自身坏，3 条）

| 走查 | 10-08 分类 | 在 exclusions | 首个错误行（10-21 日志，已截断） |
|---|:---:|:---:|---|
| new-models-20260729 | C | 否 | Error: ENOENT: no such file or directory, open '<path> Projects/未命名项目 N_N N_N-mqiyx4om-5eN/.nomi/project.json' |
| param-bar-geometry | C | 否 | Error: ENOENT: no such file or directory, open '<path> Projects/未命名项目 N_N N_N-mqiyx4om-5eN/.nomi/project.json' |
| param-bar-models | C | 否 | Error: ENOENT: no such file or directory, open '<path> Projects/未命名项目 N_N N_N-mqiyx4om-5eN/.nomi/project.json' |

### module-load（走查自身坏，2 条）

| 走查 | 10-08 分类 | 在 exclusions | 首个错误行（10-21 日志，已截断） |
|---|:---:|:---:|---|
| director-3dbox-shell | E | 否 | Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<path>' imported from <path> |
| director-clip-states | C | 否 | TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".tsx" for <path> |

### walk-bug（走查自身坏，3 条）

| 走查 | 10-08 分类 | 在 exclusions | 首个错误行（10-21 日志，已截断） |
|---|:---:|:---:|---|
| agent-panel-form | C | 否 | page.evaluate: SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied for t |
| feedback-batch-hardening | A | 否 | locator.click: Error: strict mode violation: locator('[aria-label="添加图片节点"]') resolved to 2 elements: |
| vendor-connection-identity | E | 否 | page.evaluate: TypeError: rows.map is not a function |

### design-lab（走查自身坏，5 条）

| 走查 | 10-08 分类 | 在 exclusions | 首个错误行（10-21 日志，已截断） |
|---|:---:|:---:|---|
| design-lab-ask-card-in-panel | C | 否 | failures: zh/light/question：卡在待答态却没有那层同色描边光 | zh/dark/question：卡在待答态却没有那层同色描边光 | zh/light/spend：卡在待答态却没有那层同色描边 |
| design-lab-catalog-liveness | E | 否 | ❌ 设计实验室走查失败 6 条 |
| design-lab-node-composer-bar | E | 否 | ❌ 设计实验室走查失败 5 条 |
| design-lab-question-card-generality | C | 否 | failures: none |
| design-lab-settings | E | 否 | ❌ 设计实验室走查失败 6 条 |

### real-data（环境依赖，6 条）

| 走查 | 10-08 分类 | 在 exclusions | 首个错误行（10-21 日志，已截断） |
|---|:---:|:---:|---|
| agent-video-landing-paid.rehearsal | - | 否 | catch (error) { throw new Error('付费走查拒跑（一分钱没花）：${String(error?.message ?? error)}——构建产物过期或缺失（构建失败，或构建后源码又被改过）， |
| audio-timeline | E | 否 | 缺 .tmp/probe-tone-3s.mp3 |
| credential-connect-honesty | E | 否 | ✖ page.evaluate: Error: 密钥验证失败，请检查密钥和权限后重试。 |
| credential-redirect | E | 否 | if (!fs.existsSync(file)) throw new Error('真实资料目录缺 ${path.basename(file)}（${file}）——${why}') |
| narrowed-mode-guidance | E | 否 | throw new Error('真实 model-catalog.json 不存在(${profile.catalogPath})——被测 agent 需要已配置的模型与 key'); |
| paid-env-key-connect.rehearsal | - | 否 | catch (error) { throw new Error('付费走查拒跑（一分钱没花）：${String(error?.message ?? error)}——构建产物过期或缺失（构建失败，或构建后源码又被改过）， |

### video-codec（环境依赖，6 条）

| 走查 | 10-08 分类 | 在 exclusions | 首个错误行（10-21 日志，已截断） |
|---|:---:|:---:|---|
| asset-video-preview | A | 否 | 走查失败: locator.evaluate: Error: N 秒内未生成视频封面 |
| video-clip-direct | - | 否 | feel record: video-clip-direct/FAIL-N-real-Np-performance-and-keyboard-zh.png; findings=N; new-surfaces=2; evi |
| video-clip-reopen | - | 否 | feel record: video-clip-reopen/FAIL-N-close-the-app-in-the-middle-of-a-trim.png; findings=N; new-surfaces=2; e |
| video-depth-real-task | A | 否 | ExpectError: 派生节点上没有进度遮罩 |
| video-playback-heal | A | 否 | locator.waitFor: Timeout Nms exceeded. |
| windows-freeze-sweep | A | 否 | ✖ 新建图片节点 → 生成（等待动效在跑） — 帧间隔 Nms · 主进程 Nms · 报错 locator.waitFor: Timeout Nms exceeded.  [N.png] |

### i18n-ui（真产品问题候选，2 条）

| 走查 | 10-08 分类 | 在 exclusions | 首个错误行（10-21 日志，已截断） |
|---|:---:|:---:|---|
| first-launch-system-locale | - | 否 | 失败项： [en] 项目库相对时间英文（无中文时间串） |
| i18n-sweep | E | 否 | ✗ [en] 侧栏·Prompt library · 无残留中文 — Error: [en] 侧栏·Prompt library：英文界面不该有未翻译中文（EN-DOM 断言网）：找到 4 处 CJK 文本。 /   · |

### agent-resident（真产品问题候选，20 条）

| 走查 | 10-08 分类 | 在 exclusions | 首个错误行（10-21 日志，已截断） |
|---|:---:|:---:|---|
| agent-artifact | A | 否 | Timeout:  Nms |
| agent-domain-owners | - | 否 | feel record: core-smoke-fw-agent-domain-owners-empty/N-default-image-FAIL.png; findings=N; new-surfaces=4; evi |
| agent-inflight-shots-reload | A | 否 | feel record: pi-inflight-shots-reload/FAIL.png; findings=N; new-surfaces=4; evidence: <path> |
| agent-lane-deletion | D | 否 | feel record: pi-lane-deletion/FAIL.png; findings=N; new-surfaces=2; evidence: <path> |
| agent-panel-mechanics | E | 否 | name: 'Error' |
| agent-panel-system-prompt | D | 否 | feel record: pi-panel-system-prompt/FAIL.png; findings=N; new-surfaces=3; evidence: <path> |
| agent-process-tone | A | 否 | feel record: pi-agent-process-tone/FAIL.png; findings=N; new-surfaces=2; evidence: <path> |
| agent-queued-shot-not-regenerable | D | 否 | feel record: pi-queued-shot-not-regenerable/FAIL.png; findings=N; new-surfaces=3; evidence: <path> |
| agent-runtime-editing | D | 否 | feel record: pi-editing/FAIL.png; findings=N; new-surfaces=2; evidence: <path> |
| agent-runtime-production | A | 否 | feel record: pi-production/FAIL.png; findings=N; new-surfaces=2; evidence: <path> |
| agent-single-shot-skill-boundary | D | 否 | feel record: pi-single-shot-skill-boundary/FAIL.png; findings=7; new-surfaces=1; evidence: <path> |
| agent-thinking-overlap | D | 否 | feel record: pi-thinking-overlap/FAIL.png; findings=N; new-surfaces=2; evidence: <path> |
| agent-thinking-rows | A | 否 | feel record: pi-thinking-rows/FAIL.png; findings=N; new-surfaces=3; evidence: <path> |
| agent-timeline-ops | A | 否 | feel record: agent-timeline-ops/FAIL.png; findings=N; new-surfaces=3; evidence: <path> |
| agent-trace-log | C | 否 | "error": "Error: Timed out waiting for the actual Electron process to close\n    at Timeout.<anonymous> (file: |
| agent-ui-exception-states-runtime | A | 否 | feel record: pi-agent-exception-states-runtime/FAIL.png; findings=N; new-surfaces=3; evidence: <path> |
| agent-v4-retry-storm | D | 否 | feel record: pi-v4-retry-storm/FAIL.png; findings=N; new-surfaces=3; evidence: <path> |
| agent-v4-short-film | A | 否 | feel record: pi-v4-short-film/FAIL.png; findings=N; new-surfaces=3; evidence: <path> |
| focus-indication | A | 否 | feel record: pi-focus-indication/FAIL.png; findings=0; new-surfaces=0; evidence: <path> |
| stage4-switch | A | 否 | feel record: pi-stage4-switch/FAIL.png; findings=N; new-surfaces=2; evidence: <path> |

### layout（真产品问题候选，5 条）

| 走查 | 10-08 分类 | 在 exclusions | 首个错误行（10-21 日志，已截断） |
|---|:---:|:---:|---|
| arrange-draft-cta | E | 否 | ✗ 空时间轴没出现「拼成初稿」提示行（看 preview-empty-with-cta 截图） |
| layout-timeline-panel-span | D | 否 | ExpectError: ③ 两个都开：底部带没「在右面通过去」——右缘没到窗口右边（timeline.right=N viewport=N） |
| node-composer-placement | A | 否 | VERIFY ERROR: Error: 拉宽 Agent 面板后浮框位置必须落定（连续两次采样相同） |
| storyboard-narrow-row | E | 否 | failures: zh：左栏展开时行没有进窄档（density=wide，行宽 N） | zh：窄档视觉列只省下 0px（宽 N / 窄 N） | zh：窄档内容列 Npx，视觉列不缩时只有 Npx——缩视觉列没换来写 |
| timeline-toolbar-row | D | 否 | ExpectError: 压到 Npx 后没有产生横向滚动（说明被裁掉或换行了） |

### generic-ui（暂不可判，84 条）

| 走查 | 10-08 分类 | 在 exclusions | 首个错误行（10-21 日志，已截断） |
|---|:---:|:---:|---|
| anchor-real | A | 否 | ExpectError: 旧行为锚未消费 |
| asset-library-interactions | E | 否 | FAIL ⑤ 删两张：a-spare.png 没了 · 确认删除后 a-spare.png 不该还在（基线已证：删除前项目素材里有 a-spare.png） |
| asset-library-native-import | E | 否 | if (dropped.length !== 2) throw new Error('拖入后未落盘第二张图片，发现 ${dropped.length} 张') |
| asset-transport-settings | E | 否 | 资产上传设置走查失败: Error: 明确说明上传免费: 素材上传通道 |
| assisted-onboarding-entry | D | 否 | ExpectError: ② 技能正文里缺 nomi_integration |
| at-mention-edge | E | 否 | editor click err locator.click: Timeout Nms exceeded. |
| audio-reference-connect | A | 否 | Timeout: Nms |
| browser-overlay-interaction | E | 否 | 素材盒浮层走查异常: Error: overlay window never appeared |
| canvas-control-clarity | E | 否 | locator.click: Timeout Nms exceeded. |
| canvas-frame | E | 否 | ExpectError: 全选后浮条上出现「统一模型」 |
| canvas-handle-menus | - | 否 | feel record: canvas-handle-menus/FAIL-N-left-ring-on-video-adds-image-upstream-zh.png; findings=N; new-surface |
| claim-unsent-retry | - | 否 | [claim-unsent-retry] zh-CN: FAILED first-attempt-fails, face-says-why-not-generic, face-offers-retry, walk-err |
| clip-drop-zoom | - | 否 | FAIL P5 @N% 没悬停时，拖放把手那一点最顶层是把手本身；真鼠标拖它能发出画布节点载荷 {"box":{"w":N,"h":N},"top":{"isNotch":false,"tag":"SPAN"},"mim |
| clip-gesture-ownership | - | 否 | FAIL P7 @N% 画布片段拖动被 pointercancel 打断后干净结束并回到拖之前 {"draggingBefore":"false","draggingAfter":"false","draggingAft |
| comfy-workflow-feedback | D | 否 | ExpectError: expect(received).toBe(expected) // Object.is equality |
| comfy-workflow-multiref | A | 否 | ExpectError: expect(locator).toBeVisible() failed |
| composer-long-prompt | E | 否 | ✗ 4/N 项未过 |
| contextual-node-guidance | - | 否 | ExpectError: expect(locator).toBeVisible() failed |
| creation-flow-fixes | A | 否 | ❌ A 一次改全部镜头 — 只有 0 张镜卡变成视频镜，期望 N：Error: 期望 N 张镜卡都出现时长选择器（=全变视频镜） |
| creation-plan-delete-undo | - | 否 | Timeout:  Nms |
| dark-audit | - | 否 | locator.click: Timeout Nms exceeded. |
| dark-journey | A | 否 | ExpectError: 点不到「导出 MP4」：等满 Nms 它都没可见。 |
| deconstruction-panel | A | 否 | 走查异常： ExpectError: 基线不成立：「拆解面板占槽时这个定位器找得到它」应当能被探针找到，但一个都没找到。 |
| default-generation-model | A | 否 | if (!condition) throw new Error('WALK FAIL: ${label}${detail ? ' — ${detail}' : ''}') |
| director-ai | D | 否 | ✗ AI走查中断：Error: 点不到「AI 搭场景」：等满 Nms 它都没可见。 |
| director-fields | E | 否 | name: 'Error' |
| director-timeline-pointer | E | 否 | name: 'Error' |
| director-ual-migration | - | 否 | ✗ 旅程中断：locator.getAttribute: Timeout Nms exceeded. |
| director-waypoint-aim | E | 否 | name: 'Error' |
| editing-panel-system | E | 否 | if (failed.length > 0) throw new Error('剪辑面板系统走查有 ${failed.length} 条不达合同：${failed.map(([name]) => name).join(' |
| editing-real-user-pass | C | 否 | 剪辑面真实用户走查通过 |
| f3-f16b | A | 否 | ExpectError: 创作助手输入框可见 |
| feedback-loop-consent-and-report | E | 否 | FEEDBACK LOOP WALK FAIL: Error: 点不到「切到生成面」：等满 Nms 它都没可见。 |
| feedback-share-center | A | 否 | ExpectError: 点不到「关于页「反馈与分享」入口」：等满 Nms 它都没可见。 |
| grouping-optimization | - | 否 | ExpectError: 再次点击空白组框后工具条出现 |
| library-category-collapse | - | 否 | feel record: library-category-collapse/FAIL.png; findings=N; new-surfaces=5; evidence: <path> |
| library-cover-imported-video | - | 否 | locator.click: Timeout Nms exceeded. |
| library-load-error | - | 否 | ExpectError: 基线不成立：「首启空库引导屏「还没有项目」」应当能被探针找到，但一个都没找到。 |
| local-gateway-onboarding | E | 否 | WALK FAIL: 本地网关接入或失败后继续验证回归 |
| mcp-key-window | A | 否 | Error: propose regressed to credential state: {"schemaVersion":1,"id":"integration-NcN-e3e9-4de9-b9cf-7e0cbNaN |
| mcp-workbuddy-client-profile | - | 否 | ExpectError: expect(locator).toBeVisible() failed |
| mention-scope | E | 否 | ✗ 找得到 composer 里那个可见的提示词框 — -1 |
| model-availability-agreement | E | 否 | if (!condition) throw new Error('WALK FAIL: ${label}${detail ? ' — ${detail}' : ''}') |
| model-contract-limits | A | 否 | ExpectError: expect(locator).toBeVisible() failed |
| model-kind-misguess | A | 否 | 走查异常： locator.click: Timeout Nms exceeded. |
| model-pick-confirm | A | 否 | locator.click: Timeout Nms exceeded. |
| node-prompt-presets | D | 否 | feel record: node-prompt-presets/after-FAIL.png; findings=N; new-surfaces=5; evidence: <path> |
| node-toolbar-one-row | D | 否 | if (!cond) throw new Error('WALK FAIL: ${label}') |
| notification-policy | A | 否 | locator.click: Timeout Nms exceeded. |
| omni-video-reference-gate | A | 否 | Timeout: Nms |
| onboarding-auto-fetch | E | 否 | ✗ 走查异常 — locator.click: Timeout Nms exceeded. |
| onboarding-checkmark-honesty | A | 否 | ExpectError: 点不到「拆成镜头·落画布」：等满 Nms 它都没可见。 |
| plan-gate | E | 否 | ✗ FAIL: stdio MCP 服务起来了（探到运行中的 GUI） |
| preview-export-busy | C | 否 | busyNow={"busy":"true","disabled":true,"title":"正在导出（转码封装 · N%），这次导出完成后才能再点","label":"正在导出（转码封装 · N%），这次导出完成后才 |
| production-stalled-draft | E | 否 | ✅ ① 未实现的 playbook 当场被拒，且错误说清了「传的是什么」「可用的是什么」 —— Error invoking remote method 'nomi:production-runs:create-draf |
| project-asset-healthcheck | A | 否 | locator.waitFor: Timeout Nms exceeded. |
| project-location-settings | E | 否 | 项目位置走查失败: Error: 设置页显示当前自定义目录: <path> |
| prompt-picker | D | 否 | ExpectError: composer 里应当有且只有 1 个提示词选择器（一功能一个家） |
| provider-model-discovery | D | 否 | ExpectError: expect(received).toContain(expected) // indexOf |
| provider-proxy-field | A | 否 | PROVIDER PROXY WALK FAIL: Error: 点不到「添加请求头按钮」：等满 Nms 它都没可见。 |
| reference-capture | E | 否 | 预期失败原因写入控制台:       FAIL |
| reference-companion-required | - | 否 | ❌ 走查失败： locator.setInputFiles: Timeout Nms exceeded. |
| remove-background | - | 否 | ✗ 走查异常 — Error: expect(locator).toBeVisible() failed |
| runway-vendor-honest-modes | E | 否 | feel record: runway-vendor-honest-modes/N-FAIL.png; findings=8; new-surfaces=1; evidence: <path> |
| shell-redesign | - | 否 | ExpectError: Ctrl+J 打开后焦点不在 Agent 输入框 |
| shot-cut-empty-states | A | 否 | ExpectError: 点不到「node-strong 的「按镜头拆」」：等满 Nms 它都没可见。 |
| shot-cuts | A | 否 | locator.click: Timeout Nms exceeded. |
| skill-cover-wall | C | 否 | feel record: skill-cover-wall/wall-FAIL.png; findings=N; new-surfaces=5; evidence: <path> |
| skill-library-cards | D | 否 | ExpectError: expect(locator).toBeVisible() failed |
| skill-library-specimen | A | 否 | ExpectError: 真实 Electron 宿主已就绪 |
| storyboard-anchor-policy | A | 否 | ExpectError: 锚卡消费橙字 |
| storyboard-model-same-name | A | 否 | Timeout: Nms |
| storyboard-reference-slots | A | 否 | Timeout: Nms |
| storyboard-strategy-resolve | - | 否 | 走查失败： ExpectError: 拆条采纳后 shot-1 的超限警示应当消失，只剩 shot-4 的低于下限 |
| storyboard-table-exec | A | 否 | ✖ storyboard-table-exec 走查失败 2 项： |
| storyboard-table-phasec | A | 否 | Timeout: Nms |
| telemetry-consent | A | 否 | TELEMETRY WALK FAIL: locator.check: Clicking the checkbox did not change its state |
| telemetry-scope-reconfirm | - | 否 | ❌ page.waitForSelector: Timeout Nms exceeded. |
| timeline-context-menu | E | 否 | ❌ WALK FAIL: 第 2 项对账一致 — 创建副本/CtrlD/常规 |
| toolbar-order | A | 否 | locator.click: Timeout Nms exceeded. |
| vendor-connection-health | E | 否 | ✗ 面板没打开 |
| vendor-honest-variant-axis | E | 否 | feel record: vendor-honest-variant-axis/N-FAIL.png; findings=0; new-surfaces=0; evidence: <path> |
| volcengine-speech-credential | E | 否 | ✗ 没找到火山豆包语音卡 |
| whiteboard-refactor | - | 否 | throw new Error( |

## 6. 没做完的 / 不确定的

- 所有"候选 / 待本机复现"都没有本机复现；本机是 Windows，走查在 Linux CI（xvfb）上红，复现可能需要 CI 上的诊断 job，由协调决定是否值得。
- 规则初筛按日志第一条错误行归组，个别走查可能被误分到相邻组（例如名字含 agent- 的走查被并入 agent-resident）；各组处理动作前请先看该组逐条表。
- 6 条 flaky 与 10-22 的 15 条非构建门红未逐条分诊。
- 逐条数据来源在本机 D:/Nomi-tmp/nightly-gate/runs（不入库）；需要复核可按 4 个 run id 重新 `gh run download`。
