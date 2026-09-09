# Stage 4 cutover: execution and ownership review

Status: PARTIAL_PROOF — step 2 integration under review; no PR ready or merge authorization.

This review covers `electron/agentLane`, prompted by the correction contracts found during the production cutover. The shadow runner proved isolated transcript and domain ports; it had not assembled the actual desktop owner, native sandbox, queued input, receipt IPC, and project replacement together. That distinction explains the concentration of failures. Passing the earlier shadow fixtures never proved those missing connections.

## Ownership after the cutover

| Concern | Owner and actual integration | Competing implementation disposition |
|---|---|---|
| Model loop, accepted operation, queue, retries, transcript and session files | pi 0.85.1 public `AgentLane.accept/drive`, `watch`, `steer/followUp/cancelQueued`; `laneHost.mts` supplies policies and domain callbacks | Old harness/runtime and projectAgentHost deletion is step 4. Preload exposes only the lane route in this worktree. No old runtime fallback is registered. |
| Window/project lifetime | `laneIpc.ts` owns renderer identity, workspaceId, subscription replacement; `laneWorkspace.mts` serializes only structural operations | The workspace marks closed before waiting for an opener. A late opener closes its result. Ordinary execution never waits behind a long model turn. |
| Unsent input | workbenchStore; `useAgentPanelV4Actions.ts` captures selectors and immutable attachment claims in one command | No renderer transcript reducer. `nomi.input` persists each accepted instruction's context; main domain ports use consumed input, not the latest draft. |
| Approval | `capabilityApprovalPolicy.ts`, capability facts, and the lane gate | Native shell risks use the existing command classifier. Storyboard propose/patch always require explicit operation review; existing grants and automatic mode cannot bypass that gate. |
| Receipt persistence and compensation | Existing capabilityCore G5 service, verified Surface adapters, CAS/revision journal | `laneReceiptAuthority.mts` reads the same SDK transcript plus durable queued custom entries. UI parts and in-memory approval maps are not receipt authority. |
| Tasks and candidates | ProductionRun remains durable owner; lane records task identity and joins domain facts | Task notification cache is a derived view. Token events do not reread task files. Only signed actual media projections become candidates; adoption is revalidated by the existing domain command. Cold task facts remain derived. |
| Single-shot planning | `laneSingleShot.mts` calls pi Models.streamSimple exactly once | Deleted renderer runner. Production planning returns JSON; inline storyboard stays in its existing resident conversation and review flow. |
| Native tools and skills | Upstream pi coding tool factories; Nomi injects existing sandbox operations and trusted roots | No replacement shell runner. Skill metadata is discovery, not approval authority. |

The two desktop layers have distinct authority: IPC admits a renderer/workspace command, while desktop domain dependencies verify the committed project Surface and resolve credentials. Neither layer manufactures a pi transcript. The remaining `current` domain handle is checked against the exact IPC workspace object; it must not become an independently navigable workspace index.

## Evidence and six review perspectives

These are six review perspectives over observed code and fixtures, not a claim that six human reviewers approved the change. Independent agent receipts are captured in the stage 4 plan and local handoffs.

- CTO: Native review reproduced a configure/close orphan and receipt authority invisible during tool execution. The structural queue and SDK snapshot query now have genuine red/green fixtures. No second run loop or persistence repository was introduced.
- Backend: Real verified adapters plus a temporary renderer domain port pass document and canvas G5 success, missing-receipt rejection, authority mismatch, and unapproved write rejection. IPC sender and workspace checks also cover stale completion and project replacement.
- Frontend: One complete lane projection feeds the existing v4 component tree. Input cleanup occurs only after SDK durable admission and only for the captured workspace and attachment ids. UI projection redaction is kept while the old tool-body cache is retired.
- Design: Real v4 lab renders and Electron screenshots preserve the approved layout. The blank task candidates found in the live walk are a data/interaction defect, not permission to redraw the card. Baseline PNGs remain unchanged.
- PM: No transport feature is counted as delivered from a button or successful compile. Inline storyboard must retain selected text, parent conversation, approval and the existing storyboardDesign owner. Twenty-five deferred domain tools are required to preserve the old reachable capabilities.
- User: A pending approval can be answered while a prompt is running; changing projects cannot send a delayed prompt into the new project; stopping restores unsent steer/follow-up text and attachments. Actual production and stage 4 Electron walks remain mandatory, including the migration notice after step 3.

## Verification limits and remaining gates

19 recorded-contract L1 scenarios cover five domains plus queue/approval/reopen behavior, with 76/76 comparisons and 19/19 session reopen checks. These are real pi + local HTTP execution, not nineteen old/new dual executions or nineteen process crashes. The existing shadow comparison remains four comparisons plus task identity. Deterministic R30 tool-write, turn and approval metrics remain 8/8; no paid model was called.

The full tool menu is 11,915 estimated schema/description tokens (current canonical effect descriptions), above the inherited 10,000 ceiling. Safe metadata compression did not close the gap. Standard schema reference experiments saved at most 166 tokens and changed three optional-null outcomes in 497 SDK validation comparisons; Anthropic non-strict and Google legacy also drop definition containers. Those experiments were rejected, not shipped. A user decision is pending between explicit domain-group switching and changing the permanent-menu ceiling. No budget gate may claim the full menu passes yet.

Production now passes the full local HTTP journey through storyboard review, generation, image judge, deviation card and direction/script results. The editing and conversation walks found missing receipt undo, misleading effect summaries and cold lane selection/deletion; those remain under final Electron verification. The corrected budget gate now measures 12 initial tools, 19 after coding, and all 44 accumulated tools; its 10,000 token bound remains red. Step 2 stays local until its milestone commit and push. Before final readiness: lossless three-source migration with archive/restart proof; complete old-directory and renderer-state deletion; zero retired pi debt; complete gates; rollback drill. Merge remains prohibited until L2 seven-day evidence and packaged C0 both pass.
