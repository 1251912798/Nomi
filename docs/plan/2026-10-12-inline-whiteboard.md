# Inline whiteboard — approved implementation card

Implementation line: inline-whiteboard-editor. Independent line: whiteboard-independent-review. Categories: new interface, interruptible local editing, canvas, data format. Approval: user said “去实现吧” and “弄好提交pr” on 2026-10-12 after the centered compact exploration.

| Card | Decision and evidence |
|---|---|
| 1 User task | Creator opens an existing image's whiteboard in place, moves the image independently, adds text or a regional change request, completes the edit, and inspects an older version. Standalone board supports the same editor. Three tasks: real local image edit/save/reopen; region annotation → prepare existing prompt; standalone import/draw/erase → screenshot-derived node. Baseline: full-screen navigation; target: zero page transitions, no duplicate preview, no unavailable placeholder actions. Quality gates: original-function census and real gesture/save/reopen. Record each step expected/actual in UX report. |
| 1b Related surfaces | Existing image quick actions restore after Done; NodeVersionCardsHost retains version actions; existing node composer is suppressed through nodeAttachedPanel while editing and receives prepared change-request text after closing. Errors stay inline and retryable; no automatic generation. |
| 2 Ownership | One active editor session owned at node level, independent of selection-only toolbar. WhiteboardState owns scene/text/transforms. Existing canvas node store owns frame position/size; NodeResizer owns gesture history/persistence. Version lifecycle owns numbering/main selection. Annotation owner is node metadata keyed by resultIdentity; annotations are not exported into pixels and do not follow new results. Door maps: WhiteboardModal (two entrances); serializeWhiteboardState (DrawingTool + old modal). |
| 3 Reuse | Move existing save/screenshot/project-context owner into inline host and delete WhiteboardModal. Reuse Leafer renderer/editor/export, old draw/erase/selection/group/import/background-removal hooks, WhiteboardLibraryPanel, FloatingToolbarShell, AnchoredPopover, Workbench controls, NodeResizer and version cards. Mantine useStateHistory provides document undo; no homegrown history framework. Existing Tabler icon family and Nomi tokens only; no global CSS additions. |
| 4 States | Empty board remains editable; loading has loading mark; saving/import/background removal expose actual busy state and prevent duplicate action; failure retains editor and draft with retryable action; project switch cancels late commits through existing execution context; read-only has no edit entrance. Text input/IME keeps native behavior. All tool parameters are inline; all expanded panels center on the entire frame. zh/en + light/dark are required. Missing model: prepare prompt only and use existing composer/model setup path. |
| 5 Interruption | Drawing/text/annotation: close Done commits, deselection retains session, project switch unmount saves synchronous draft only to its owner, restart restores persisted draft. Import/remove-background/screenshot: existing project signal rejects stale commits; repeated action blocked during busy; failure leaves editor open. App quit during an in-flight external operation leaves last persisted document; no new generation is initiated. |
| 6 External inputs | Local image import retains file type/size/read failure handling; existing background-removal service retains phase/error feedback; persisted legacy documents default missing text/transforms safely without altering assets. Leafer behavior checked against installed 2.1.7 source. No new provider requests. |
| 7 Budget | One active Leafer instance; inactive nodes retain ordinary cheap previews. Observe local image and 32-node scale only if available; full project performance unverified until measured. |
| 8 Conditions | Desktop only (explicit user requirement). Real Electron zh/en, light/dark and minimum desktop window screenshot/gesture runs planned. Windows and clean packaged install are unverified; no phone work. |
| 9 Acceptance/rollback | Independent review must compare all census groups to real task evidence. Focused document tests + whiteboard UX walk + repository risk-selected gates + build. Revert scoped PR commit restores former host/data readers; new additive fields are harmless to old readers. No merge authorized. |

## Functional classification
- [x] 新界面 / 改交互
- [x] 长跑 / 可打断
- [x] 大数据量 / 画布 / 长列表
- [x] 数据格式
- [ ] 花钱
- [ ] Agent 行为
- [ ] 生成效果

## System contract

No new tokens or global styles. Use existing WorkbenchButton/ToolIconButton, FloatingToolbarShell and AnchoredPopover. Extend the shared floating-toolbar container with below-node placement rather than cloning its zoom/clamp mechanism. Replace the full-screen whiteboard host in both entrances; no reachable second editor. All scene transformations pass through a serialized capture/restore boundary. Browser exploration is reference only; the board checklist and production-component walk are the implementation contract.

## Census

Independent census: image and standalone entrances; save/no-op close; screenshot export and derived-node transaction; brush pressure/smoothing/colors/size; true local eraser and cursor; selection/multiselect/group; image move/scale/snap/flip; delete/locked/background protection; background-removal phases; import busy/type/read/error; five ratios; board/result library counts/thumbnails/dimensions/select/visibility/delete/empty/scroll; asset/result drag/drop; keyboard move/delete/native input; all existing version operations; node geometry persistence. Each is mapped in InlineWhiteboard.board.json functionCensus and the UX acceptance report.
