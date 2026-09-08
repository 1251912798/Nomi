# Canvas undo barrier sweep

📎 实施与验证记录（分支交付；不代表已合入 main）。 Scope: task 6; store-only corrective change, no visual layout or React Flow kernel changes.

User friction: changing an edge mode, disconnecting an edge, or locking a node currently makes Cmd+Z undo an earlier operation. Each independent gesture must own one history boundary before its first event; dependent writes must share that boundary.

Plan: inventory all graph/node/frame/group-move action writers and trace callers; add failing store tests; repair confirmed standalone boundaries; run contracts and related unit tests plus an existing Electron canvas walkthrough; commit/push/PR.

Internal prior art: canvasGraphActions.ts connectToNode/connectToGroup already place barriers before events and autoPromoteTargetModeForEdge suppresses its nested edit barrier. canvasUndoJournal.ts pushUndoSnapshot respects proposal suppression. No dependency/API or framework layer changes; the invariant is internal application history policy.

Non-goals: no React Flow interaction changes, dependency changes, or cross-store category history redesign. Composite connectNodes and reassignNodeCategory require caller-level classification, not blanket barriers. Findings outside this bounded change must be reported explicitly.

Rollback: revert the scoped commit. Acceptance: red tests on unmodified production; one undo restores exact preceding graph and second undo reaches preceding gesture; redo and no-op behavior; proposal grouping preserved; gates plus existing UX screenshot review. Scan and schema-v3 evidence live in docs/fixes.

## 先查别人

- `src/workbench/generationCanvas/events/canvasUndoJournal.ts:41`: existing pushUndoSnapshot owns journal positions and proposal barrier suppression; reuse it instead of adding a second history mechanism.
- `src/workbench/generationCanvas/store/canvasGraphActions.ts:251`: PR #602 already established barrier-before-event and history:false for dependent automatic mode promotion; follow the same internal contract.
- `src/workbench/generationCanvas/components/useCanvasSelectionDrag.ts:148`: existing gesture start owns continuous movement history; per-frame barriers would be incorrect.
- `src/workbench/generationCanvas/agent/proposalTxn.ts:242`: outer proposal transaction owns the composite undo step. Tests explicitly retain this grouping.

This is repair of existing application semantics, with no dependency or external format change. External SDKs and social-media patterns cannot decide which Nomi action is a standalone user gesture; repository callers and observed undo behavior are the relevant evidence.
