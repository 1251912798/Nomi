# Inline whiteboard — independent review

Date: 2026-10-12. Independent line: `whiteboard-independent-review`. Implementation line: `inline-whiteboard-editor`.

**Status: REVIEW OPEN; no complete production acceptance is asserted.** The implementation is changing while review findings are being repaired. Baseline census was independently read from production owners before implementation. An exploration demonstration is not evidence that any production row passes.

Approval context: user requested inline editing with reused framework/components, compact desktop layout, all original functionality retained, board and image independently draggable, adjustable board size, and all expanded controls centered on the full board. They authorized implementation and PR on 2026-10-12. A PR does not imply merge or deployed verification.

## Functional census and acceptance ledger

Every row below must be exercised from the original production entry, with actual image/project data. `unverified` means no independent real-app result has yet been recorded. A source path, pure test or preview screenshot alone cannot change a row to passed. On final review append the actual new location, screenshot/walk evidence and outcome per row.

| ID | Baseline capability | Required inline destination / behavior | Existing owner | Independent production result |
|---|---|---|---|---|
| O01 | 连续画笔、平滑、压力采样 | 工具栏画笔 | useWhiteboardDrawing.ts、lib/stroke.ts | unverified |
| O02 | 白黑红蓝绿橙六色 | 同一行颜色按钮展开的色盘 | lib/canvas.ts COMMON_COLORS | unverified |
| O03 | 自定义画笔颜色 | 色盘内颜色输入 | WhiteboardDrawingTool.tsx | unverified |
| O04 | 画笔／橡皮大小 4–96 | 主工具栏同一行滑条与数值 | clampBrushSize | unverified |
| O05 | 局部橡皮，命中图层，包括图片 | 独立橡皮工具 | useWhiteboardDrawing.ts、whiteboardCanvasNodeOps.ts | unverified |
| O06 | 橡皮大小光标／即时擦除预览 | 图片内随指针显示 | WhiteboardLeaferCanvas.tsx | unverified |
| O07 | 选择图片／笔画／组合 | 选择工具 | WhiteboardLeaferCanvas、useWhiteboardBoxSelection | unverified |
| O08 | 空白框选／多选 | 选择工具，图片内直接框选 | useWhiteboardBoxSelection | unverified |
| O09 | 多对象整体移动 | 选中后直接拖动 | useWhiteboardBoxSelection | unverified |
| O10 | 图片等比缩放、最小尺寸限制 | 原有角点手柄 | whiteboardSceneRender、whiteboardCanvasGeometry | unverified |
| O11 | 移动吸附／对齐参考线 | 图片内拖动反馈 | WhiteboardLeaferCanvas、whiteboardCanvasGeometry | unverified |
| O12 | 多选组合，组合后整体操作 | 生产选择动作区域，按选中对象出现 | useWhiteboardSelectionActions、groupTargetsIntoLayer | unverified |
| O13 | 水平／垂直翻转 | 选中图片后的主工具栏 | useWhiteboardSelectionActions | unverified |
| O14 | 图片抠图、阶段、进度、失败反馈 | 生产选中图片后的主工具栏；进度贴当前对象 | WhiteboardDrawingTool、removeBackgroundBlob | unverified |
| O15 | 删除选中对象 | 选中对象后的主工具栏与 Delete／Backspace | deleteTargetFromState、assessDeleteTarget | unverified |
| O16 | 原图可选、可移、可缩、可显隐、可删 | 与导入图片是同一种资产 | addImageToCanvas | unverified |
| O17 | 五种比例 16:9／4:3／1:1／3:4／9:16 | 工具栏比例入口 | AspectRatioPopover、getCanvasDimensions | unverified |
| O18 | 导入图片、适配、居中、成为选中对象 | 工具栏导入 | WhiteboardDrawingTool、createImageAssetForCanvas | unverified |
| O19 | 导入类型检查／忙态／失败 | 原有导入流程内反馈 | WhiteboardDrawingTool | unverified |
| O20 | 画板／结果页签与数量 | 素材库锚点浮层 | WhiteboardLibraryPanel | unverified |
| O21 | 画板库仅列板上的图片资产 | 画板页签 | getAssetPanelItems | unverified |
| O22 | 资产缩略图、名字、像素尺寸、选中态 | 画板页签素材项 | WhiteboardLibraryPanel | unverified |
| O23 | 从库选中资产，切到选择工具 | 点击画板素材 | selectAssetPanelItem | unverified |
| O24 | 图层显隐、隐藏缩略图变淡 | 素材卡眼睛；图层列表 | toggleLayerVisibility | unverified |
| O25 | 从库删除素材、锁定时禁用 | 素材卡删除 | WhiteboardLibraryPanel | unverified |
| O26 | 拖板上资产到指定点复制 | 素材卡 → 图片 | handleCanvasAssetDrop | unverified |
| O27 | 结果 = 本板下游截图 + 其他画布图片，按节点去重 | 结果页签 | WhiteboardModal、mergeResultLibraryItems | unverified |
| O28 | 结果来源“来自画布” | 结果卡标识 | WhiteboardLibraryPanel | unverified |
| O29 | 拖结果到指定点加入 | 结果卡 → 图片 | parseLibraryDragPayload、clampCanvasPosition | unverified |
| O30 | 拖入时可落区域反馈 | 图片边界 | WhiteboardDrawingTool | unverified |
| O31 | 库空态和长列表滚动 | 相应页签 | WhiteboardLibraryPanel | unverified |
| O32 | 截图不含编辑手柄 | 生产主工具栏截图入口 | whiteboardCanvasExport | unverified |
| O33 | 图片节点截图保存新版、设主图 | 生产主工具栏截图入口／完成 | WhiteboardModal、appendNodeResultVersion | unverified |
| O34 | 独立画板截图派生图片＋来源边、原板追加结果 | 生产主工具栏截图入口，按节点类型分派 | WhiteboardModal | unverified |
| O35 | 独立画板截图后切结果库 | 截图成功后结果页签 | handleScreenshotClick | unverified |
| O36 | 保存／截图忙态防重复、失败保留编辑器 | 完成／截图原位置反馈 | WhiteboardModal | unverified |
| O37 | 方向键 1px；Shift 10px | 已选对象键盘微移 | getKeyboardMoveDelta | unverified |
| O38 | 输入框内不误删／微移；中文输入不拦截 | 原生输入优先 | isEditableKeyboardTarget | unverified |
| O39 | Esc／完成：图片内容变化则保存新版并设主图 | 完成一个主动作；Esc 同路 | WhiteboardModal requestClose | unverified |
| O40 | 独立画板完成只保存 state，不截图 | 同一完成，根据 owner 类型分派 | WhiteboardModal | unverified |
| O41 | 重新打开恢复节点可编辑 state | 原入口点击画板 | whiteboardState、node meta.whiteboardState | unverified |
| O42 | 版本数量／展开收起 | 原有版本入口，放在节点标签行 | NodeVersionCountBadge、NodeVersionCardsHost | unverified |
| O43 | 点击版本预览 | 小版本卡 | NodeVersionCardsHost | unverified |
| O44 | 设为主图，影响下游提示，可撤销 | 版本卡动作 | setNodeMainResultPatch、NodeVersionCardsHost | unverified |
| O45 | 下载某版 | 版本卡下载 | NodeVersionCardsHost | unverified |
| O46 | 删版本、删主图选最新剩余、可撤销 | 版本卡删除 | removeNodeResult、NodeVersionCardsHost | unverified |
| O47 | Alt 拖版本复制；普通拖动整组 | 现有版本卡手势 | NodeVersionCards | unverified |
| O48 | 版本多时更多／查看全部；生成中 pending 卡 | 现有版本卡组 | NodeVersionCards | unverified |
| O49 | 主图指针、固定版本编号、删后不复用编号 | 同一结果生命周期 | nodeResultLifecycle.ts | unverified |
| O50 | 原图片工具栏所有常驻／条件动作 | 编辑时让位；完成后恢复原工具栏，不另改 IA | ImageQuickActionsToolbar.tsx | unverified |
| O51 | 形状工具 | 旧本来禁用，不冒充可用功能 | TOOL_ITEMS | unverified |

## New capabilities (separate from retained baseline)

| ID | New acceptance requirement | Evidence required | Result |
|---|---|---|---|
| N01 | One node-owned editor; image and standalone launchers share it; no reachable old modal | Both entrances, deselect/reselect, node switching and editor instance count | unverified |
| N02 | Header drag moves board; asset drag moves only asset; frame resize does not scale content | Pointer gestures at zoom 100% and non-100%; document geometry and node position before/after | unverified |
| N03 | Adjustable exact board bounds and aspect controls persist | Resize corners, width/height, ratio lock, save/reopen/restart | unverified |
| N04 | Editable text appears in export and remains editable after reopen | Chinese/English content, color/size/edit/move/group/delete/undo/export | unverified |
| N05 | Point and regional change annotations belong to explicit result identity, excluded from image export | Add/edit/delete, switch main result, save/reopen, export pixel check | unverified |
| N06 | Prepare image change fills the existing composer without starting generation | Annotation → existing prompt/reference, no provider run started | unverified |
| N07 | One document undo/redo owner including drawing and transforms | Move/scale/flip/text/erase/import/group/delete; one session undo owner and persisted document after close | unverified |
| N08 | Old version resumes editable snapshot when present; absent snapshot is honestly handled | One edited version and one legacy generated version | unverified |
| N09 | Parameters remain in the tool row; no extra brush-width row; usable actions direct without More | Brush/eraser/text/selected asset/multi-select screenshots | unverified |
| N10 | Toolbar and all expanded surfaces centered on entire frame | Color/material/layer/ratio/annotation surfaces bounding-center measurements and inspected screenshots | unverified |
| N11 | Existing toolbar and composer restore after Done; editor does not overlap composer | Initial/editing/done states, failed save, deselected editor | unverified |
| N12 | Local shortcuts never also delete/move outer nodes; input and IME own keys | Delete/Backspace/arrows/Shift arrows/⌘Z/Esc/input selection/Chinese composition | unverified |
| N13 | Pointer/keyboard/toolbar transforms survive save/reopen | Asset, stroke, group and text populations; frame dimensions independent | unverified |

## Recorded source observations, not acceptance

- The former full-screen save owner was `WhiteboardModal.tsx`; both image quick toolbar and standalone card invoked it. The replacement must preserve its image-vs-whiteboard close/screenshot split and project lifetime checks.
- Baseline geometry lived only in `objectOffsetsRef`, `assetTransformsRef`, `objectFlipStatesRef`. Baseline serialization omitted them. A snapshot that looks right is insufficient: close/reopen must retain editable geometry.
- The former selection hook listened on `window.keydown`; the inline host must own nested input before outer canvas shortcuts. `isEditableKeyboardTarget` did not itself check `isComposing`.
- React Flow already owns node resize history, geometry events and persistence in `GenerationCanvasReactFlowNodes.tsx`; frame resizing should reuse that owner.
- Existing `NodeVersionCardsHost` owns main-result lifecycle, material cleanup, downloads, copying and undo. A new look-alike history list would duplicate authority.
- `nodeAttachedPanel.ts` is the existing composer exclusion boundary. Register inline editing there rather than merely covering the composer with z-index.
- Existing `nodeHasVersionCards` excludes card render kinds including standalone whiteboard. Keep result-library behavior; do not silently claim the old standalone had the image version badge.

## Real tasks and interruption checks

1. Existing local image → original whiteboard quick action → move image → draw and partially erase → add text → resize board bounds → Done → version count increases → reopen scene → download/export. Record expected/actual at each step.
2. Same image with at least two results → add point and region modifications on one explicit result → prepare change in existing composer → switch main result → verify annotations do not transfer → reopen edited version when snapshot exists.
3. Standalone board → import real local image → material drag duplication → select/group/flip/delete/undo → screenshot → derived image and source edge → original board result library → Done persists state without creating a screenshot.

For upload/background removal/save, separately inject or encounter failed operation and project replacement while pending; verify editor remains retryable on failure and late results do not publish into the new project. No paid generation is needed for these local acceptance tasks.

## Evidence state

| Boundary | State |
|---|---|
| Independent baseline source census | Read-only completed; owner paths recorded above |
| Schema-v3 contract | Preparation at `docs/fixes/2026-10-12-inline-whiteboard.root-cause.json`; regenerate scope/doors after final code |
| Changed production diff review | Independent source review completed for the current owners; final revision refresh pending |
| Pure document tests | Independently run; focused 145-case run has 143 passed and 2 relocated-feedback structural assertions failed; see below |
| Scoped keyboard/commit regressions | Target-specific outer admission tests passed in the focused run; native IME and real event routing remain unverified |
| Electron zh/en, light/dark, smallest desktop window | zh-CN/light 19-slice report and 3 screenshots independently inspected; other variants/final refresh unverified |
| Mouse board/asset gestures and frame geometry | Existing report proves asset drag keeps node position and typed frame height keeps asset/text geometry; actual frame-handle resize remains unverified |
| Restart and project-switch recovery | unverified |
| Actual background-removal download/worker | unverified |
| Windows / clean packaged install | unverified |
| Original-function final acceptance | unverified; no row may be assumed from the exploration |

The final independent report must distinguish code review, focused tests, real browser runs and real Electron runs. Findings use concrete reproduction steps, severity and owning code; any missing original capability blocks acceptance. This document currently authorizes no complete pass verdict.

## Contract preparation check

`pnpm run check:root-cause-contracts` initially rejected the draft because the skill template omits currently required `detected_by`, `recurrence_check_on` and `invariant_owner_layer`. These fields were filled from the actual checker contract. During implementation, newly created toolbar/locale files required a fresh generated door map. Final validation remains pending after implementation stabilizes; an interim schema success is not runtime acceptance.

## Independent implementation review — first pass

This pass reviewed the production diff and the new inline/save/document/toolbar/session owners. It did not launch a second Electron instance while the implementation line was running the real journey.

Independent command:

```sh
pnpm exec vitest run src/workbench/generationCanvas/nodes/whiteboard/whiteboardDocument.test.ts src/workbench/generationCanvas/nodes/whiteboard/whiteboardInlineState.test.ts src/workbench/generationCanvas/nodes/whiteboard/whiteboardProjectContext.test.ts src/workbench/generationCanvas/nodes/whiteboard/whiteboardStateOps.test.ts
```

Observed: 4 files, 23 tests passed; 762 ms. This proves only the named pure state/session/project-cancellation slices. It does not prove pointer interaction, visual parity, every retained original function, restart recovery, or keyboard event ownership.

### Findings returned to implementation line

| ID | Priority | Reproduction / mechanism | Owning source | State |
|---|---|---|---|---|
| R01 | P1 | Open an image, original asset imports, immediately edit within first 250 ms, then Done. The first debounced draft callback adopts the edited state as saved baseline, so the rendered edit can be skipped as unchanged. Baseline must be emitted at original import completion, independent of draft debounce. | InlineWhiteboard.persistWhiteboardState / WhiteboardDrawingTool initial-image import | Source corrected; named focused regressions and real-path limitations recorded below |
| R02 | P1 | Start import or background removal, press Escape or request another node's whiteboard. Disabled Done is bypassed by registered handleClose; operation may complete against an unmounted editor in the same project, losing the requested change. Busy close admission must belong to the close owner, not only the button. | InlineWhiteboard.handleClose / WhiteboardDrawingTool.onKeyDownCapture / whiteboardSession.openWhiteboard | Source corrected; named focused regressions and real-path limitations recorded below |
| R03 | P2 | Resize document to custom small bounds (e.g. 600×400), then import an image. createImageAssetForCanvas still fits/centers in getCanvasDimensions(ratio,1280), placing the new asset against an obsolete frame. Both initial/import paths must use actual document dimensions, matching material drag/drop. | WhiteboardDrawingTool.addImageToCanvas / whiteboardState.createImageAssetForCanvas | Source corrected; named focused regressions and real-path limitations recorded below |
| R04 | P2 | Multi-select two objects; toolbar shows horizontal/vertical flip, but flipSelectedTarget acts on only activeObjectTarget. Either single-selection visibility or actual multi-target semantics is required. Delete has the same visual-selection ambiguity and needs deliberate handling. | WhiteboardEditingToolbar selectedTargets branch / useWhiteboardSelectionActions | Source corrected; named focused regressions and real-path limitations recorded below |

### Retention assessment

Source review found reuse of the existing drawing/eraser, library, grouping, background-removal, export, version-card and project-lifetime owners rather than a second implementation. It found no intentional deletion of an enabled baseline capability. The old disabled shape tool is omitted rather than represented as a fake available action. This is a source-level assessment only: the 51 production interaction rows above remain independently unverified until real-task evidence is inspected and mapped row by row.

History ownership is one Mantine history of revision identifiers, with document snapshots kept separately and capped at 50. Immutable array/object updates structurally share unchanged assets/strokes. Scene maps are captured at pointer completion and selection actions rather than every pointer move; draft writes debounce at 250 ms. These design choices are visible in code, but scale/frame-time claims require the recorded 32-node run. Do not claim performance acceptance from this code review.

### Additional concrete findings

| ID | Priority | Reproduction / mechanism | Owner | State |
|---|---|---|---|---|
| R05 | P1 | A 16:9 image node with size 600×600 still resolves to 600×337.5 because resolveNodeVisualSize enforces mediaAspect. Disabling NodeResizer's keepAspectRatio alone does not allow independent frame bounds. ResizeObserver can subsequently overwrite the requested logical height with this old displayed geometry. Typed 64–4096 bounds also need coordination with the shared node display constraints. | nodeSizing.resolveNodeVisualSize / GenerationCanvasReactFlowNodes / InlineWhiteboard.resizeBoard | Shared owner corrected; custom frame/version identity pure tests passed and zh-light typed-height journey inspected |
| R06 | P1 | Begin image snapshot save; while capture/storage is deferred, delete/change a version through the still-available version owner; save appends to the pre-await latestSource and spreads its stale metadata. Deleted history entries can be resurrected after their files were cleaned up. Read current node facts after await before publishing, retaining current project admission. | InlineWhiteboard.saveImageWhiteboardSnapshot | Fresh post-await store read verified; deferred-storage concurrent-history deletion regression passed |

R05 actual command imported `resolveNodeVisualSize` with `pnpm exec tsx`; input `size={width:600,height:600}`, `meta={imageWidth:1920,imageHeight:1080,userResized:true,previewHeight:600}`, existing image result. Observed output: `{ width: 600, height: 337.5 }`. This is a deterministic failed condition in the owning production function, not a preview observation.


## Second independent pass — actual evidence and outstanding gaps

This pass read the current node host, session, save owner, shared sizing/shortcut owners, drawing tool, renderer, toolbar and existing version owner. Three source-level concept boundaries were registered for the serialized document, Leafer lease and active session; shared node visual geometry and outer shortcut admission were also registered because these existing owners are changed by the same root cause. The intrinsic-media and result-lifecycle consumers now point to InlineWhiteboard, replacing the deleted modal.

`captureSceneTransforms` and `restoreSceneTransforms` are actually defined in `whiteboardCanvasTypes.ts`; they are not defined in the extracted document hook. `useWhiteboardCanvasDocument` holds the imperative maps and capture/restore/commit interface inside the single Leafer lease. The root-cause contract was regenerated from actual production symbols: 32 changed production files, 87 baseline doors and 128 current doors with the identical symbol set. No scoped changed production file is missing from that map. Refresh after any additional edits or main integration.

Independent focused command (03:22 local):

```sh
pnpm exec vitest run src/workbench/generationCanvas/nodes/whiteboard/whiteboardDocument.test.ts src/workbench/generationCanvas/nodes/whiteboard/whiteboardInlineState.test.ts src/workbench/generationCanvas/nodes/whiteboard/whiteboardProjectContext.test.ts src/workbench/generationCanvas/nodes/whiteboard/whiteboardStateOps.test.ts src/workbench/generationCanvas/nodes/whiteboard/localEditorFeedback.test.ts src/workbench/generationCanvas/nodes/nodeSizing.visualSize.test.ts src/workbench/generationCanvas/nodes/floatingToolbarClamp.test.ts src/workbench/generationCanvas/components/useCanvasShortcuts.test.ts
```

Observed: **7 files passed, 1 file failed; 143 tests passed, 2 failed; 1.74 s.** Both failures are existing structural assertions in `localEditorFeedback.test.ts` demanding `role="status"` inside InlineWhiteboard and DrawingTool. Feedback now renders in the reused WhiteboardEditingToolbar, so the correct repair is to test the new actual feedback owner and its forwarding chain, not to add duplicate status UI. This is a genuine failed check pending repair, not a green result.

The successful slices include original-raster baseline before first edit, failed image decode producing neither baseline nor empty draft, Retry/Cancel admission, post-await fresh history publication, project cancellation across upload/capture/storage/background removal, serialized transform detach/restore, text/group geometry, pixel budgets, actual custom-bound image fit, version-bound frame sizing, session failure retention/release and target-specific outer shortcut exclusions. These are pure/component contract tests with mocked React/bridge boundaries where applicable; they do not establish real pointer/IME/provider/download behavior.

Scoped concept diagnostic passed for the first 5 inspected concepts (16 write APIs, no added duplicate write port). After extending the contract, the full concept checker failed with **52 existing findings**: 2 invalid enum values in clip-hit geometry registration, 1 preexisting pending zoom consumer and 49 unregistered older contract boundaries. None of the printed unregistered boundaries belonged to this inline-whiteboard contract. Parent is integrating current main; full checker must be rerun after that integration. `node scripts/check-root-cause-contracts.mjs` exited 0, reporting no high-risk production path trigger at this unstaged snapshot; this does not itself prove all runtime invariants or satisfy complete acceptance.

### Additional findings and correction state

| ID | Priority | Concrete mechanism / reproduction | Correction reviewed | Final actual result |
|---|---|---|---|---|
| R01b | P1 | Normal original-image `onerror` / 1800 ms timeout returned null dimensions; addImageToCanvas formerly treated null as successful empty asset, bypassing Retry/Cancel. | Null dimensions now throw before asset insertion; real null-decode branch test passed. | Retry/Cancel pure guard passed; real failed asset decode/retry unverified |
| R07 | P2 | Color/ratio panel used a separate toolbar local state; DrawingTool capture processed Escape before the popover bubble handler, closing board or swallowing input Escape. | All panel state now belongs to DrawingTool, Escape closes panel before native-input guard. | Source corrected; final real Esc journey pending |
| R08 | P1 | With no editable internal selection / brush active / locked target, inner Delete returned false and outer window canvas handler could delete the entire node; `.nokey` did not guard that custom handler. | shouldIgnoreCanvasShortcut excludes actual event targets within inline board or portal; no global canvas freeze. | Target-specific pure exclusions passed; real no-selection Delete/IME path pending |
| R09 | P1 | Selecting or deleting main version during active A document changed node result to B; frame identity guard reverted size to B aspect and observer could rewrite A geometry. | Existing version setPrimary/remove now await the shared finishWhiteboard transaction first. Session switch also uses project-generation admission. | Source corrected; real same-board version mutation/busy-save transaction pending |
| R10 | P1 | Inspected standalone screenshot clips right-hand toolbar actions beyond the stage, leaving screenshot/Done offscreen despite center alignment. | Parent is adding symmetric centered width budget to existing floating-toolbar placement owner. | Open until final near-edge screenshot plus actual reachable action proof |

### Inspected real Electron report

Read `tests/ux/shots/whiteboard-refactor/zh-CN-light/report.json` produced at 03:19 and opened all three PNGs with the image viewer: `editing.png`, `saved-history.png`, `standalone.png`. The report has 19 successful checks, no renderer exceptions, no paid calls and no performance sample. The scene uses a real 4K image extracted from available local media. This is parent-run real Electron evidence independently inspected; this line did not claim to run a duplicate app instance.

The screenshots confirm a compact tool row, centered normal-position toolbar/size panel, drawn path, visible edited text, region annotation, custom-height frame, restored original image toolbar and original version cards. The exported saved image visibly excludes the region marker and editor handles while retaining brush/text. Standalone screenshot shows a source edge to its derived image. It also exposes R10 clipping, which the report's visibility/count checks did not measure. An old FAIL.png remains from an earlier attempt and is not used as successful evidence.

Evidence directly supports retained O33/O34/O41/O42 and the tested parts of O01/O16/O18/O32/O39/O50; it does not prove every subcondition in those broad census rows. For new acceptance it supports the tested parts of N01/N02/N03/N04/N05/N07/N09/N10/N11/N13. N06 prepare and N08 old-snapshot editing were not exercised in the inspected 19-slice run. The complete 51-row ledger remains unverified at row level until expanded evidence is mapped; source reuse is not a substitute for all promised retained interactions.

Required final refresh: repair relocated-feedback tests; inspect zh/en light/dark/minimum-desktop and near-edge reachability; inspect real erase/asset-resize/material-drag/group-flip/version-action/prepare/error tasks; rerun focused changes after final code/main integration. Actual background-removal model download, Windows, clean packaged install and restart recovery remain explicitly unverified unless new evidence is supplied.


### Post-integration focused refresh

After integrating `origin/main` at `fdb0b154388b2a4ab839ffa95365aa61ccfa29cb`, the exact 8-file focused command above was independently rerun at 03:24. Observed **8 files passed / 145 tests passed, 2.18 s**. The prior two failures are preserved above; the repair points the feedback assertion to its actual shared toolbar surface. Full concept checker still reports the same 52 older-contract/registry findings; it is not green. `--source-ref HEAD` is not a clean-baseline comparison because that mode intentionally keeps the current worktree registry and adds expected missing-new-code findings when pointed at pre-feature code; its 69 findings must not be presented as regression counts.

| ID | Priority | Reproduction / mechanism | Owner | State |
|---|---|---|---|---|
| R11 | P1 | Save an edited version with original.png as an editable canvas asset, then delete the original raster result. `isProjectFileReferenced` checks only result URL/thumbnail and timeline, so it returns false for original.png even while current draft and historical raw whiteboardState reference it. Deferred cleanup can destroy the layers required to reopen the edited version. | assets/assetResultDeletion.isProjectFileReferenced | Actual pure production helper returned false with a valid createDefaultWhiteboardState plus canvas asset; reported, awaiting shared reference-boundary repair and deletion regression |
| R12 | P2 | The original brush/eraser range had a visible live numeric readout; the compact replacement keeps only the slider. | WhiteboardEditingToolbar | Reported; preserve a tiny same-row value without introducing an extra row |
| R13 | P3 | Materials outer wrapper is 320 px high while compact library is 280 px, reserving 40 px of unused blank space. | WhiteboardDrawingTool material content / WhiteboardLibraryPanel compact | Reported; remove redundant fixed wrapper height |

The R11 reproduction used the actual `isProjectFileReferenced` production function, valid shared default document, canvasAssets containing `nomi-local://asset/project-a/assets/imported/original.png`, and current edited.png result with the same document in `raw.whiteboardState`. Expected true; observed false. Preserve references in both the current draft and every retained result snapshot; deleting the final document reference should permit cleanup. There must be one shared asset-survival判据 used by immediate deletion, deferred deletion and restart cleanup, not a whiteboard-only deletion exception.
