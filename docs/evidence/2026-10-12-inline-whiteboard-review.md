# Inline whiteboard — independent review

Date: 2026-10-12. Independent line: `whiteboard-independent-review`; implementation line: `inline-whiteboard-editor`. Baseline: `fdb0b154388b2a4ab839ffa95365aa61ccfa29cb`; committed prevention includes `9291455b57` and `095417d392`; latest main was integrated at `54acf622f3`. Unified performance script was sampled at `696bf56ae5`; final documentation-HEAD build/delivery remains the implementation line’s responsibility.

**Verdict: partial acceptance, REVIEW OPEN.** The requested core inline journey is demonstrated in real Electron; no enabled baseline capability was intentionally removed in the inspected source. Full 51-row retention, all failure paths and platform acceptance are not established. Draft PR review is appropriate; this report does not authorize merging or claim resolved delivery.

User approved a compact desktop-only inline editor using existing design components/frameworks, independently movable frame/image, adjustable frame bounds, direct controls and centered expanded surfaces. Text and version-bound point/region modification notes must remain editable; Prepare fills the existing composer. The original disabled shape tool is not an enabled capability.

## Functional census and actual evidence

This is the complete pre-change source census, preserved row by row. `verified` covers the stated row; `partial` names only exercised subconditions; `unverified` is an actual coverage gap. Shared source reuse and unit tests cannot turn an unexercised production interaction green. Real evidence E1/E2 below applies to every tested subcondition in these two tables.

| ID | Baseline capability | Required inline destination / behavior | Baseline owner | Independent production result |
|---|---|---|---|---|
| O01 | 连续画笔、平滑、压力采样 | 工具栏画笔 | useWhiteboardDrawing.ts、lib/stroke.ts | partial — 真实连续笔画、持久化、undo/redo；压力/平滑效果未测 |
| O02 | 白黑红蓝绿橙六色 | 同一行颜色按钮展开的色盘 | lib/canvas.ts COMMON_COLORS | partial — 六色按钮与选红实际笔画；其余五色逐一输出未测 |
| O03 | 自定义画笔颜色 | 色盘内颜色输入 | WhiteboardDrawingTool.tsx | unverified — 无对应真实交互收据 |
| O04 | 画笔／橡皮大小 4–96 | 主工具栏同一行滑条与数值 | clampBrushSize | partial — 画笔 4–96 与同排数值；橡皮范围未测 |
| O05 | 局部橡皮，命中图层，包括图片 | 独立橡皮工具 | useWhiteboardDrawing.ts、whiteboardCanvasNodeOps.ts | partial — 擦除 stroke 持久化/undo；命中图片像素未验证 |
| O06 | 橡皮大小光标／即时擦除预览 | 图片内随指针显示 | WhiteboardLeaferCanvas.tsx | unverified — 无对应真实交互收据 |
| O07 | 选择图片／笔画／组合 | 选择工具 | WhiteboardLeaferCanvas、useWhiteboardBoxSelection | partial — 原图选择/拖动；笔画与组合选择未测 |
| O08 | 空白框选／多选 | 选择工具，图片内直接框选 | useWhiteboardBoxSelection | unverified — 无对应真实交互收据 |
| O09 | 多对象整体移动 | 选中后直接拖动 | useWhiteboardBoxSelection | unverified — 无对应真实交互收据 |
| O10 | 图片等比缩放、最小尺寸限制 | 原有角点手柄 | whiteboardSceneRender、whiteboardCanvasGeometry | unverified — 无对应真实交互收据 |
| O11 | 移动吸附／对齐参考线 | 图片内拖动反馈 | WhiteboardLeaferCanvas、whiteboardCanvasGeometry | unverified — 无对应真实交互收据 |
| O12 | 多选组合，组合后整体操作 | 生产选择动作区域，按选中对象出现 | useWhiteboardSelectionActions、groupTargetsIntoLayer | unverified — 无对应真实交互收据 |
| O13 | 水平／垂直翻转 | 选中图片后的主工具栏 | useWhiteboardSelectionActions | unverified — 无对应真实交互收据 |
| O14 | 图片抠图、阶段、进度、失败反馈 | 生产选中图片后的主工具栏；进度贴当前对象 | WhiteboardDrawingTool、removeBackgroundBlob | unverified — 无对应真实交互收据 |
| O15 | 删除选中对象 | 选中对象后的主工具栏与 Delete／Backspace | deleteTargetFromState、assessDeleteTarget | unverified — 无对应真实交互收据 |
| O16 | 原图可选、可移、可缩、可显隐、可删 | 与导入图片是同一种资产 | addImageToCanvas | partial — 原图导入/选择/移动；缩放/显隐/删除未测 |
| O17 | 五种比例 16:9／4:3／1:1／3:4／9:16 | 工具栏比例入口 | AspectRatioPopover、getCanvasDimensions | partial — 五比例入口实图；逐一切换未测 |
| O18 | 导入图片、适配、居中、成为选中对象 | 工具栏导入 | WhiteboardDrawingTool、createImageAssetForCanvas | partial — 独立板真实文件导入/显示；错误类型与其他图形尺寸未测 |
| O19 | 导入类型检查／忙态／失败 | 原有导入流程内反馈 | WhiteboardDrawingTool | unverified — 无对应真实交互收据 |
| O20 | 画板／结果页签与数量 | 素材库锚点浮层 | WhiteboardLibraryPanel | partial — 素材浮层实际打开居中；页签计数未逐项断言 |
| O21 | 画板库仅列板上的图片资产 | 画板页签 | getAssetPanelItems | unverified — 无对应真实交互收据 |
| O22 | 资产缩略图、名字、像素尺寸、选中态 | 画板页签素材项 | WhiteboardLibraryPanel | unverified — 无对应真实交互收据 |
| O23 | 从库选中资产，切到选择工具 | 点击画板素材 | selectAssetPanelItem | unverified — 无对应真实交互收据 |
| O24 | 图层显隐、隐藏缩略图变淡 | 素材卡眼睛；图层列表 | toggleLayerVisibility | unverified — 无对应真实交互收据 |
| O25 | 从库删除素材、锁定时禁用 | 素材卡删除 | WhiteboardLibraryPanel | unverified — 无对应真实交互收据 |
| O26 | 拖板上资产到指定点复制 | 素材卡 → 图片 | handleCanvasAssetDrop | unverified — 无对应真实交互收据 |
| O27 | 结果 = 本板下游截图 + 其他画布图片，按节点去重 | 结果页签 | WhiteboardModal、mergeResultLibraryItems | unverified — 无对应真实交互收据 |
| O28 | 结果来源“来自画布” | 结果卡标识 | WhiteboardLibraryPanel | unverified — 无对应真实交互收据 |
| O29 | 拖结果到指定点加入 | 结果卡 → 图片 | parseLibraryDragPayload、clampCanvasPosition | unverified — 无对应真实交互收据 |
| O30 | 拖入时可落区域反馈 | 图片边界 | WhiteboardDrawingTool | unverified — 无对应真实交互收据 |
| O31 | 库空态和长列表滚动 | 相应页签 | WhiteboardLibraryPanel | unverified — 无对应真实交互收据 |
| O32 | 截图不含编辑手柄 | 生产主工具栏截图入口 | whiteboardCanvasExport | partial — 保存图片实图无编辑手柄/区域标注；非像素差分证明 |
| O33 | 图片节点截图保存新版、设主图 | 生产主工具栏截图入口／完成 | WhiteboardModal、appendNodeResultVersion | partial — 图片 Done 新版/主图已测；图片 Capture 独立点击未测 |
| O34 | 独立画板截图派生图片＋来源边、原板追加结果 | 生产主工具栏截图入口，按节点类型分派 | WhiteboardModal | verified — 独立板 Capture 追加历史、派生图片及来源边；动作真实点击 |
| O35 | 独立画板截图后切结果库 | 截图成功后结果页签 | handleScreenshotClick | unverified — 无对应真实交互收据 |
| O36 | 保存／截图忙态防重复、失败保留编辑器 | 完成／截图原位置反馈 | WhiteboardModal | unverified — 无对应真实交互收据 |
| O37 | 方向键 1px；Shift 10px | 已选对象键盘微移 | getKeyboardMoveDelta | unverified — 无对应真实交互收据 |
| O38 | 输入框内不误删／微移；中文输入不拦截 | 原生输入优先 | isEditableKeyboardTarget | partial — 英文文字及 ArrowLeft 保持输入；caret、中文 IME 未测 |
| O39 | Esc／完成：图片内容变化则保存新版并设主图 | 完成一个主动作；Esc 同路 | WhiteboardModal requestClose | partial — Done 改动一版/no-op 不增版；改动后 Esc 保存未测 |
| O40 | 独立画板完成只保存 state，不截图 | 同一完成，根据 owner 类型分派 | WhiteboardModal | partial — 独立 Done 持久化并关闭；未另断言 Done 不新增历史数 |
| O41 | 重新打开恢复节点可编辑 state | 原入口点击画板 | whiteboardState、node meta.whiteboardState | partial — 实际项目文档持久化与 reopen 文字/图片位移恢复；重启未测 |
| O42 | 版本数量／展开收起 | 原有版本入口，放在节点标签行 | NodeVersionCountBadge、NodeVersionCardsHost | partial — 原版本 badge 与展开实际可用；收起未测 |
| O43 | 点击版本预览 | 小版本卡 | NodeVersionCardsHost | unverified — 无对应真实交互收据 |
| O44 | 设为主图，影响下游提示，可撤销 | 版本卡动作 | setNodeMainResultPatch、NodeVersionCardsHost | partial — 历史设主图先完成 active 保存实测；下游提示/undo 未测 |
| O45 | 下载某版 | 版本卡下载 | NodeVersionCardsHost | unverified — 无对应真实交互收据 |
| O46 | 删版本、删主图选最新剩余、可撤销 | 版本卡删除 | removeNodeResult、NodeVersionCardsHost | unverified — 无对应真实交互收据 |
| O47 | Alt 拖版本复制；普通拖动整组 | 现有版本卡手势 | NodeVersionCards | unverified — 无对应真实交互收据 |
| O48 | 版本多时更多／查看全部；生成中 pending 卡 | 现有版本卡组 | NodeVersionCards | unverified — 无对应真实交互收据 |
| O49 | 主图指针、固定版本编号、删后不复用编号 | 同一结果生命周期 | nodeResultLifecycle.ts | partial — 主图标识/编号/no-op 计数实际可见；删后编号不复用未测 |
| O50 | 原图片工具栏所有常驻／条件动作 | 编辑时让位；完成后恢复原工具栏，不另改 IA | ImageQuickActionsToolbar.tsx | partial — Done 后原工具栏恢复实图；其余全部动作未逐一点击 |
| O51 | 形状工具 | 旧本来禁用，不冒充可用功能 | TOOL_ITEMS | not-applicable — 基线本来禁用，不作为已启用功能遗漏 |
| Original-function final acceptance | unverified — 无对应真实交互收据 |

## New requirements

| ID | New acceptance requirement | Required scope | Actual result |
|---|---|---|---|
| N01 | One node-owned editor; image and standalone launchers share it; no reachable old modal | Both entrances, deselect/reselect, node switching and editor instance count | partial — 两入口共用一实例实测；失选/切节点 busy 真实路径未测 |
| N02 | Header drag moves board; asset drag moves only asset; frame resize does not scale content | Pointer gestures at zoom 100% and non-100%; document geometry and node position before/after | partial — 图片拖动不动 node、typed frame 不缩对象；header/角点真实手势未测 |
| N03 | Adjustable exact board bounds and aspect controls persist | Resize corners, width/height, ratio lock, save/reopen/restart | partial — 宽高保存/reopen、七组动态 resize/wheel、真实逐键输入 900；重启待测 |
| N04 | Editable text appears in export and remains editable after reopen | Chinese/English content, color/size/edit/move/group/delete/undo/export | partial — 英文编辑/导出可见/reopen、逐键字体 36；中文及完整对象动作未测 |
| N05 | ~~Point and regional change annotations~~ removed 2026-10-17 (user: "1189 的标注工具先拿掉") | n/a | removed — see plan card section "region annotation tool removed"; legacy stored data is inert |
| N06 | ~~Prepare image change from annotations~~ removed 2026-10-17 with N05 | n/a | removed |
| N07 | One document undo/redo owner including drawing and transforms | Move/scale/flip/text/erase/import/group/delete; one session undo owner and persisted document after close | partial — 画笔 undo/redo、橡皮 undo；全部变换/import/group/delete undo 未测 |
| N08 | Old version resumes editable snapshot when present; absent snapshot is honestly handled | One edited version and one legacy generated version | partial — 旧原始 raster 无快照诚实恢复、新快照 reopen；旧编辑版完整恢复未测 |
| N09 | Parameters remain in the tool row; no extra brush-width row; usable actions direct without More | Brush/eraser/text/selected asset/multi-select screenshots | partial — 紧凑直接操作/同排宽度值/靠右两行实图；全部选择状态未测 |
| N10 | Toolbar and all expanded surfaces centered on entire frame | Color/material/layer/ratio/annotation surfaces bounding-center measurements and inspected screenshots | partial — 素材/比例居中，七组动态 panel/bar/dock 命中检查；极端边缘优先动作可达，所有面板未逐个测量 |
| N11 | Existing toolbar and composer restore after Done; editor does not overlap composer | Initial/editing/done states, failed save, deselected editor | partial — Done 后原工具条恢复、Prepare composer 可见；失败保存/失选未测 |
| N12 | Local shortcuts never also delete/move outer nodes; input and IME own keys | Delete/Backspace/arrows/Shift arrows/⌘Z/Esc/input selection/Chinese composition | partial — brush Delete 不删外 node、尺寸输入 Esc 只关 panel；真实中文 IME/所有快捷键未测 |
| N13 | Pointer/keyboard/toolbar transforms survive save/reopen | Asset, stroke, group and text populations; frame dimensions independent | partial — 图片位移/文字 save/reopen；笔画/group/flip 完整真实变换未测 |

## Independently inspected real Electron evidence

- E1: `tests/ux/shots/whiteboard-refactor/zh-CN-light/report.json`; E2: corresponding `en-dark/report.json`. Each latest report has **46 checks**, `rendererErrors=[]`, `generationInvokedByWalk=false`, and `performance=null`. Parent ran both; independent line read the JSON and personally opened editing/size-panel-after-resize/saved-history/standalone PNGs (including the latest zh size/standalone refresh). These are real Electron tasks with a local 4K photograph, 2 nodes / 0 offscreen, at the 1280×933 desktop viewport.
- Width/height/wheel matrix: width1536, height640, width1280, height1100, height900, wheel120, wheel-120. Each checks centered moving popup, no toolbar/dock intersection and actual hit reach. Size popup flips above the toolbar when below-room is insufficient; inspected image shows a clear gap. At 85% near the right edge, standalone toolbar wraps into two compact centered rows; Capture and Done were actually clicked.
- Brush path/undo/redo, eraser stroke/undo, English text/native input, asset drag with stable node position, independent document dimensions, changed/no-op Done, durable project/reopen state, old-result region notes and Prepare into the existing composer, historical main switch through finish transaction, standalone import/capture/derived source edge all have explicit report assertions.
- `generationInvokedByWalk=false` describes script behavior, not instrumented provider billing. No claim of provider coverage or paid-cost telemetry is made. Saved-raster screenshots visually exclude handles/annotation; eraser image-pixel correctness is unverified.
- Earlier 19-check zh run exposed actual standalone clipping (R10) despite passing visibility assertions; it is preserved as a failed acceptance attempt. An intermediate 36-check run and 44-check run and latest 46-check numeric-input run are distinct. Old FAIL images are not used as successful evidence.
- Latest DesignNumberInput/ToolbarActionPanel production build and both numeric cases are exercised: normal sequential keyboard input reaches font36 and height900; input Escape closes only the panel. Core reports remain 46 checks each after this batch. The post-edge normal-track refresh also remains 46 checks each; latest en-dark JSON and four PNGs were independently read again.
- E3: `tests/ux/shots/whiteboard-refactor/zh-CN-light-perf/report.json` completes **48 checks** on 32 nodes (30 offscreen), one active editor and one unique 3840×2160 source image. Independent line read JSON and personally opened editing, size-panel-after-resize, saved-history and standalone PNGs. Pointer drag collected 368 frames: p50 8.3 ms, p95 10 ms, maximum 10.4 ms; longTasks=[]; initial image persisted after 1725.96 ms. This is one local workload sample, without a matched baseline or all-visible 32-node workload, not universal performance acceptance.
- E4: existing `perf:scenarios` registry/runner now adapts the same walk through DRIVERS and `--runs`/`--label`, one fresh project per repetition. Smoke succeeds with 50 checks, p95 frame gap9.9ms and no long task. Five complete journeys at `696bf56ae5` each pass **50 checks**, including explicit frame-gap≤33ms and zero >50ms long-task checks; all rendererErrors=[]. Unified report `.tmp/whiteboard-scenario-baseline.json` and committed registry `tests/perf/scenarios/inline-whiteboard-drag.json` record median9.6ms / p959.6ms / budget33ms, five runs, `darwin arm64 Apple M5 x10 / 24GB`, UTC date2026-10-11, noisy=true. That p95 is the across-run quantile of five per-run frame-gap p95 values, not a pooled-frame percentile. Each run records one active editor / 32 nodes / 30 offscreen / one shared 4K image. Independent line read all five JSON reports and personally opened run5 size/standalone PNGs.

| Unified repetition | Sampled frames | Within-run frame p95 (ms) | Maximum frame (ms) | >50ms long tasks | Complete checks |
|---|---:|---:|---:|---:|---:|
| 1 | 371 | 9.6 | 10.3 | 0 | 50 |
| 2 | 372 | 9.6 | 16.7 | 0 | 50 |
| 3 | 372 | 9.6 | 10.2 | 0 | 50 |
| 4 | 373 | 9.6 | 16.8 | 0 | 50 |
| 5 | 373 | 9.6 | 10.2 | 0 | 50 |

- Reproduce after build: `pnpm run perf:scenarios -- --id inline-whiteboard-drag --runs 5 --out .tmp/whiteboard-scenario-repeat.json`; one-run smoke adds `--smoke`. Baseline writing is coordinator/acceptance-only via `--update-baseline`; noisy=true honestly reflects other active host apps and downgrades future >20% baseline regression to advisory, while the hard33ms budget and real zero-long-task checks still reject failures. The adapter accepts only complete successful journeys, empty renderer errors and ≥30 finite frame samples; failed/incomplete sampled runs cannot become accepted performance evidence.
- ★7 coverage is drag-only timing. Opening, input, popup resize and save/reopen execute in each journey but have no individual response-latency measurements; ≤100ms / p95≤150ms response and ≤1s openToInteractive remain unverified. Many visible distinct decoded images, long strokes/history, 4096² export and the user’s full project are not represented by 30 offscreen nodes.
- First performance attempt sampled 373 frames (p50 8.3/p95 9.4/max16.7 ms, no long tasks) but the **whole journey failed** when the extreme-right standalone toolbar was clipped. Failure JSON/PNG are preserved at `.tmp/whiteboard-perf-first-failure-report.json` / `.tmp/whiteboard-perf-first-failure.png`. R21 repairs the shared minimum-width/centering conflict; the subsequent same-fixture complete journey succeeds. Exact centering is retained where the minimum action width fits; at an extreme edge, the existing shared shift keeps the full action bar reachable. The inspected successful extreme-edge screenshot wraps into four rows, whereas the normal near-edge sample uses two.
- Automated feel records have findings: ordinary track snapshots accumulated 14, and the final performance standalone accumulated 17. These include shell 11px text, stage/header clipping, engine multi-canvas reachability markers and repeated-row heuristics. They are not a zero-finding visual pass; real gesture/hit/closed-loop checks are separate evidence. Full visual findings triage remains open.
- zh-dark/en-light, arbitrary desktop sizes, Windows, packaged clean install, restart and actual background-removal download remain unverified.

## Findings returned to implementation and repair state

All findings below were returned before signoff. Source-corrected means the mechanism is repaired in inspected code, not every corresponding real failure has been exercised.

| ID | Failure mechanism / reproduction | Shared correction and evidence |
|---|---|---|
| R01/R01b | First 250 ms draft adopted edited state as saved baseline; null image decode admitted an empty ready document. | Explicit successful-import baseline, failed Retry/Cancel/loading admission; focused regressions green. Real failed decode/retry remains unverified. |
| R02 | Escape/session switch bypassed disabled Done during import/background removal. | Close owner checks busy plus project lifetime; cancellation tests green, real operation failure unverified. |
| R03 | Custom frame import still used old 1280 ratio geometry. | Actual canvasDimensions owns import fit/center; focused and real custom-height evidence. |
| R04 | Multiselection toolbar offered single-object flip/delete. | Single-only actions shown for one selected target; group only for multiple. Full actual grouping remains unverified. |
| R05 | Shared media sizing forced 600×600 whiteboard to 600×337.5. | Actual shared helper repro red; version-bound frameScale/node resize bounds repaired; geometry tests and real typed bounds green. |
| R06 | Save appended to pre-await source, resurrecting concurrently deleted history. | Read fresh store after capture/storage; deferred deletion regression green. |
| R07 | Two panel states made input Escape finish/swallow instead of closing panel. | DrawingTool owns all panels; Escape panel-first; actual size-input Escape passed. |
| R08 | Unhandled inner Delete fell through and deleted whole outer node. | Target-specific outer shortcut admission; red5→green6 tests and actual brush Delete guard. |
| R09 | Main/delete version actions mutated active document before same save transaction completed. | Both await finishWhiteboard and retain origin project; actual historical main switch passed. |
| R10 | Standalone centered toolbar clipped right actions outside stage. | Shared symmetric centered width budget and wrapping; latest 85% near-right image and actual Capture/Done passed. |
| R11 | Source file cleanup ignored current draft/historical editable asset URLs. | Actual shared isProjectFileReferenced repro red; reads all retained document refs, no clone; 2 regression tests green. |
| R12/R13 | Live brush number missing; materials reserved redundant 40 px blank shell. | Same-row small number restored; redundant fixed wrapper height removed. Source/real screenshots inspected. |
| R14 | User resize moved anchor while popup remained at old location over toolbar. | Existing AnchoredPopover watcher replaced by installed Floating UI autoUpdate; old listener/observer removed, opt-in frame watch while mounted. Two real moving-anchor matrices inspected. |
| R15 | Old global opening flag survived project release and blocked new-project editor. | Actual production helper repro red→green; lease/generation release prevents old finally unlocking/blocking newer session. |
| R16 | Height1100 hit bottom dock; near-left wide popup ideal span missed dock after real horizontal clamp. | Existing workspace dock owner + generic popup boundary; placement computes actual clamped span first, no second clamp. 14 independent geometry tests and real seven-case matrix green. |
| R17 | Historical/legacy reopening rebound identity while retaining previous frame height. | initialDimensions initializes host frame before result binding; parent 2 red→green tests, source inspected. |
| R18 | Version actions issued project authority after awaiting editor finish, adopting later current project. | Capture context at entry, await finish, assert context current before live read/publication. Full-suite scan caught both actions; focused guard tests green. |
| R19 | Controlled number min rejected intermediate keystrokes: typing 900 retained 720. | Parent real red log; reused DesignNumberInput with local draft/clamp-on-blur for board/font; font36 and height900 sequential typing passed in both real 46-check tracks. |
| R20 | Whiteboard mounted AnchoredPopover outside existing toolbar rich-panel owner. | Shared ToolbarActionPanel in existing ToolbarActionMenu now used by both menus and whiteboard; no new local placement. Structural guard green; both real 46-check tracks exercise the shared surface. |
| R21 | First performance journey failed at the extreme right: forced zero shift conflicts with 240px minimum width when symmetric room is only 88px. | Shared clamp retains exact centering only when its minimum screen width fits; otherwise reuses existing floatingToolbarShift. One regression covers 75 scale/center/prior-shift combinations and return-to-center; exact clamp file 69 tests green. Same-fixture real 48-check journey and subsequent five 50-check unified journeys, actual Capture/Done and independently inspected extreme-edge PNG passed. |

## Source ownership and contract audit

Both entrances converge on node-owned InlineWhiteboard and one Leafer App; old WhiteboardModal and obsolete controls are deleted. Existing drawing/eraser, library, grouping, remove-background, export, version cards and project operations are reused. DrawingTool has one Mantine history of revision IDs (the ID array is not hard-capped); the snapshot Map retains at most 50 entries and canUndo/canRedo also requires Map.has at the restorable boundary. Document snapshots structurally share unchanged objects, transform commit occurs on pointer completion/actions and draft persist debounces 250 ms. These are inspected mechanisms, not performance measurements.

`captureSceneTransforms`/`restoreSceneTransforms` belong to whiteboardCanvasTypes.ts. `readWhiteboardEditingState` now belongs to whiteboardState.ts and reads current draft versus historical raw by explicit result identity. The only Leafer↔Nomi document adapter is precisely registered in self-written.json; domainRoots were not expanded. Generic numeric controls use DesignNumberInput; toolbar rich content uses ToolbarActionPanel; geometry remains resolveAnchoredPopoverPlacement + existing workspaceBottomDocks, one dock census and one placement decision.

Current inline schema-v3 contract: **42 scope paths; identical symbol population yields 114 baseline / 165 current doors**, with ToolbarActionPanel/readWhiteboardEditingState and actual helper locations included. Read projections necessarily outnumber before; both launchers still share one writer/session. Scoped concepts register document, scene, session, sizing, shortcuts, asset survival and dock/anchored geometry APIs. Full concept audit has older registry/contract debt; no full-green claim.

## Checks and limits

| Check | Actual observation |
|---|---|
| Independent first focused slice | 4 files / 23 passed / 762 ms. |
| Independent expanded focused slice | Initially 143 passed / 2 relocated-status assertions failed; after asserting real shared feedback owner: exact 8 files / 145 passed / 2.18 s. Original failures retained here. |
| Independent asset/popover slice | 2 files / 15 passed / 151 ms; later near-left composite geometry 1 file / 14 passed / 343 ms. |
| Parent production focused | 12 files / 335 green before latest input/toolbar batch; newest guard 5 files / 28 and whiteboard/geometry 9 files / 100 green (parent-run). |
| Parent full tests first run | 1911 files passed, 6 failed, 1 skipped; 18537 tests passed, 7 failed, 2 expected fail, 38 skipped. Five failing files were this change (issuance, nowheel, deleted modal shell assertions, toolbar owner, Vite prebundle); focused repairs green. Full suite has not been rerun green. |
| Parent full contracts first run | 105 gates: 101 passed / 3 blocking failures / 1 advisory, 871.9 s. Blocking: design-lab, packaged-deps @floating-ui/dom, stale remove-background private wait fingerprint. Latter two repaired/targeted green; full all-green not established. |
| Final unified-registry / delivery tests | Parent ran TMPDIR=/private/tmp node --test scripts/check-perf-scenarios.node-test.mjs scripts/pr-body-criteria.node-test.mjs scripts/pr-judgement-lib.node-test.mjs: 39 passed / 0 failed, including real registry baseline integrity. This is a distinct final slice, not added to the earlier49-test slice as a coverage total. |
| Latest build/type/lint/package | Parent latest production build after the numeric/shared-panel and R21 repair batches exit0; four-config typecheck exit0, lint 79 warnings/0 errors; newest packaged-deps/frozen-install exit0. Final committed-HEAD build/stamp after documentation/commit remains pending. |
| Final real numeric typing / performance | Two 46-check core tracks: font36/height900 passed. Earlier performance track48 checks; unified registered scenario smoke + five50-check journeys pass, median/p95 of per-run frame p95=9.6/9.6ms vs33ms; no long tasks. Other operation timing and first failed journey remain explicit. |

Independent baseline controls: original `fdb0b15438` archived under ignored `.tmp/whiteboard-main-baseline-fdb0b15438`, reused node_modules, no baseline updates. One settings assisted-04-failed specimen independently reproduced the same 75-pixel screenshot mismatch; original/current actual PNG SHA256 both `0ecec5d8e8f18089f0480a556366efee2146abd79f066a0d0ebece5f56138437`. This proves only that specimen, not all 73 design-lab failures. Parent additionally ran original-HEAD generatedMediaDecode and reproduced the same fixture error: missing WebP encoder before tests. Its actual failure is environment/baseline, not decoder acceptance. No unrelated baselines were weakened.

## Delivery gate root cause discovered during PR preparation

The first push cannot honestly set escape `fixed`: unchanged escape-ledger validator requires a real fixedInPr, while shared PR-body checker previously demanded fixed before any push of a new user contract. The minimal repair is in existing pr-body-criteria/evaluatePrBody: **explicit local push only** may warn for new user contracts matched to a changed committed reviewed entry with manual review, evidence, resolvable ancestor commit, structural contract and class-level test. CI/default/merge retains strict fixed settlement; missing/malformed/mismatched entries stay blocking. No escape-ledger validator or other gate is relaxed.

A real temporary git + subprocess check-pr-judgement test failed before (0 pass / 1 fail), then passed after the shared repair. Related 3 node-test files: **49 passed**, including CI/merge strictness, every-new-contract matching, bad identity/review/evidence/missing-or-unreachable-commit/class-test/root binding and unchanged settled/fixed branches. Contract: `docs/fixes/2026-10-12-reviewed-escape-push.root-cause.json`. PR must explicitly disclose this delivery-policy change. Popup escape ledger remains reviewed with actual commit/screenshots; no fictitious fixed or PR number was written.

Scoped final documentation checks: root-cause/self-written/escape-ledger exited 0; four scoped concepts / 14 APIs / no new second writer passed (diagnostic code-side scope; parity_test 2/4). Root-cause retains three truthful nonblocking warnings for reused unchanged dock owners and the side-effect-only prebundle import; no fake symbol door or pointless production edit was added.
