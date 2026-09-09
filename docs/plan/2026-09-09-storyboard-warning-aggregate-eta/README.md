# C04 / C06 laboratory samples

These static 1440px samples isolate the read-only projection changes. The before/after pairs preserve the same plan, models, and scheduler inputs.

- `c04-before.svg` / `c04-after.svg`: eight repeated corrections become one row with `8 镜：#1–#8`.
- `c06-before.svg` / `c06-after.svg`: eight sequential estimates become two concurrency-six rounds.

## 先查别人

- 依赖里已有：React/i18n only provide rendering primitives; no aggregation or scheduler ETA helper in installed d.ts/README.
- 仓库里已有：`electron/capabilityCore/mcpGenerationTools.ts:63` owns cold-start ETA and `StoryboardPlanStrategyPanel.tsx:138` owns blocker rows; both are the shared boundaries changed here. `rg` found no existing issue-group projection.
- 仓库里的并发依据：`src/workbench/generationCanvas/runner/generationRunController.ts:434-487` already runs bounded workers, so the confirmation projection must use rounds rather than serial addition.
- 生态里已有：Promise pools conventionally estimate batches by `ceil(count / concurrency)` rounds; see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all.
- TikHub 自媒体里怎么说：本次没有使用 TikHub，因为这是本地投影数学与 UI 聚合，不涉及外部用户教程或市场方案。
- 结论：复用仓库既有 resolver、i18n 和 scheduler 边界，自研两个纯函数以保持现有契约，不引入新依赖。
