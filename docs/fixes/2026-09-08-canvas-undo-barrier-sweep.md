# Canvas standalone gesture undo barriers

Status: implemented; verification recorded below. Classification: **recurring**.

Symptom: change an edge's mode, disconnect it, or lock a node; Cmd+Z removes the preceding unrelated edit. Direct cause: events were journaled without a new undo position. Class root: standalone store actions must own a history boundary before their first event; emitting a gesture is not itself an undo boundary.

## Same-family inventory

Read all four action files; searched both writers (`nodes`/`edges`/`groups`, `emitCanvasGesture`, `pushUndoSnapshot`) and callers (`captureHistory`, action names). Line numbers below refer to the original baseline 73c5072; names remain stable after insertion. **打了** means the boundary exists, not a blanket claim that every replay/compound workflow is proven correct.

| File / action | 修前档位 | Owner / reason |
|---|---|---|
| canvasGraphActions: connectToNode | 打了 | :251 before edge event; automatic target mode update uses history:false, one gesture |
| connectToGroup | 打了 | :295 before materialized edges and group declaration; promoted modes share the boundary |
| connectNodes | 故意不打（组合写口；有待处理入口，见下） | :323 used after addNode by StagingCaptureHost:84, Scene3DEditor:289, WhiteboardModal:284, useNodePanoramaHandlers:93, ClipNode:390, startVideoDepthDerivation:85; proposal paths have outer proposalTxn:242 boundary. Blanket insertion would split node+edge creation |
| updateEdgeMode | **没打 → 本次补齐** | :352 edge menu GenerationCanvasReactFlowNodes:367 calls directly; guard then barrier then mutation/event |
| disconnectEdge default/group scope | **没打 → 本次补齐** | :363 direct edge-menu :387 / keyboard GenerationCanvasReactFlow:509; group fanout belongs to one disconnection |
| disconnectEdge parameter scope | 打了 | :379 was the only history-enabled branch; remove conditional, share one boundary with default/group scope |
| createGroup | 打了 | :447; creation and member reassignment share action |
| groupSelectedNodes | 打了 | :494; all selected members share action |
| renameGroup / setGroupColor / setGroupCollapsed | 打了 | :521 / :539 / :555 after no-op guards |
| ungroup / ungroupGroups / deleteGroup | 打了 | :576 / :595 / :616; batch ungroup owns one boundary |
| moveNodeToGroup / removeNodeFromGroup | 打了 | :674 / :710; membership and inherited edges share action |
| reorderGroup / restoreGraph | 打了 | :735 / :760 |
| canvasNodeActions: addNode | 打了 | :92 |
| updateNode prompt/meta/title | 打了（编辑突发） | :115 via pushEditBurstBarrier; adjacent typing shares 3s burst |
| updateNode pluginState | 打了 | :117; plugin edit boundary |
| updateNode remaining patch / history:false | 故意不打 | :110 runtime/default metadata and drag size writes inherit caller history; e.g. MEDIA_DIMENSION_UPDATE_OPTIONS and useNodeDragResize:378. User-origin callers require their own composition boundary |
| updateNodes / updateNodePrompt | 打了 | :136 batch boundary / :157 typing burst |
| setNodeLocked | **没打 → 本次补齐** | :166 NodeLockBadge:36 calls directly; both lock/unlock share guarded action |
| moveNode / moveSelectedNodes | 故意不打 | :179 / :193 continuous movement; useNodeDragResize:185 and GenerationCanvasReactFlow:520 capture once, per-frame writes cannot create steps |
| tidyCategory / deleteSelectedNodes | 打了 | :232 / :251 |
| duplicateNodeForRegeneration / copyNodeToCategory / deleteNode | 打了 | :373 / :457 / :470 |
| reassignNodeCategory | 故意不打（组合写口；外层待处理，见下） | :397 only production caller is workbenchStore.deleteCategory:300 node loop; per-node barriers would split one deletion and cannot restore deleted category |
| instantiateWorkflowTemplateSnapshot | 打了 | :518; wrapper instantiateWorkflowTemplate delegates, one boundary for nodes/edges/groups |
| canvasFrameStoreActions: createFrame | 故意不打（委托） | :21 delegates createGroup, no second barrier |
| setGroupDescription | 打了 | :32 guarded update |
| canvasGroupMoveActions: moveGroupNodes | 故意不打 | :16 continuous member+frame write; useCanvasSelectionDrag:148/:164 captures gesture once |

Excluded from graph-mutation inventory: start/cancel connection and selection actions only change ephemeral selection/pending state; commitPersistedChange only bumps revision; saveSelectedAsWorkflowTemplate edits templates, not graph; wrappers delegate their graph write to the listed owner.

## Repair and evidence

Repair stays at the existing store boundaries: updateEdgeMode, disconnectEdge, setNodeLocked. Publish getHistoryFlags with those writes so a loaded graph's first edit enables Undo and clears Redo. No new abstraction, fallback, dependency, or React Flow change. Existing pushUndoSnapshot proposal suppression remains authoritative.

Red command (before any production edit): `pnpm exec vitest run src/workbench/generationCanvas/store/generationCanvasStore.test.ts -t 'standalone canvas gesture'`. Exit 1: **5 failed / 5 passed / 48 skipped**. Failures: mode, disconnect, lock undo removed preceding node; group default disconnection lost preceding node; lock/unlock failed canUndo assertion. Original output: `/tmp/nomi-undo-red.log`.

Green targeted command: `pnpm exec vitest run src/workbench/generationCanvas/store/generationCanvasStore.test.ts src/workbench/generationCanvas/store/parameterReferenceGroupEditing.test.ts src/workbench/generationCanvas/agent/proposalUndo.test.ts src/workbench/generationCanvas/agent/agentTurnMutations.test.ts`. **4 files / 80 tests passed**. New tests cover exact preceding graph restoration, redo, second undo, missing/unchanged no-ops, group default and parameter scopes, both lock directions, outer transaction suppression. No new gate rule (R17 evidence is the red regression slice).

## Explicit residual scope

These are not declared fixed by the three store barriers:

- `useNodeMentionSource:102` calls connectNodes before the prompt editor commits its text, without a surrounding composite history context. Unlike derived-node callers, a prior addNode barrier is not guaranteed. This needs a prompt+reference insertion transaction, not a blanket connectNodes barrier.
- `workbenchStore.deleteCategory:294` loops category reassignment and group deletion, then deletes a category in a different store. The canvas journal cannot restore that category. A per-node barrier would revive orphan category IDs; this needs cross-store category lifecycle ownership.
- `GenerationCanvasReactFlow.handleEdgesDelete:501` loops disconnectEdge; several selected edges are several action calls. Fixing selection-wide gesture grouping requires changing the interaction boundary, explicitly excluded by task R23 scope. Single edge and aggregate group-edge deletion are covered here.
- Existing unconditional barriers in removeNodeFromGroup/reorderGroup and the edit-burst timer's lack of an intervening-gesture marker warrant separate no-op/typing-boundary review. They are not evidence of absent barriers, and not covered by this repair.

These findings must remain visible in the PR and CHIP-LAST.md; this bounded PR is not a declaration that all canvas undo workflows are complete.

## R13 Electron walkthrough

`node tests/ux/canvas-drag-pan-gestures.walk.mjs` exited **0**, on a fresh isolated profile and this branch's successful `pnpm run build`. Reused the existing user journey; added menu mode-change/undo, disconnect/undo, lock/undo checks to that same script. Existing 51 numbered checks plus new awaited Playwright assertions passed; no page errors; generation/model cost **0**.

Human screenshot comparison: both nodes remain in the same positions; mode-change to generic reference hides the label as designed, one Cmd+Z restores the 首帧 label; disconnect removes the curve, one Cmd+Z restores the same curve; lock undo restores the unlocked badge. No new layout or control was introduced, so the reference is the existing pre-action screen, not a new mockup.

- [Mode changed](assets/2026-09-08-canvas-undo-barrier/04a-edge-mode-changed.png) → [one Cmd+Z](assets/2026-09-08-canvas-undo-barrier/04b-edge-mode-undone.png)
- [Disconnected](assets/2026-09-08-canvas-undo-barrier/04c-edge-disconnected.png) → [one Cmd+Z](assets/2026-09-08-canvas-undo-barrier/04d-edge-disconnect-undone.png)
- [Lock undone](assets/2026-09-08-canvas-undo-barrier/04e-node-lock-undone.png)

Contracts: **73 gates, 72 passed, zero blocking failures**. One pre-existing advisory remains in `docs/research/2026-09-07-skill-ecosystem-catalog/research-showcase-design.md` (missing social-media source section); unrelated research is untouched. Typecheck/test-types passed; lint has zero errors and 81 baseline warnings. Full Vitest: **1281 files / 11942 tests passed**, one file / two tests skipped. The full `pnpm run gates` receipt (including agent-runtime and build completion) is reported in the PR.
