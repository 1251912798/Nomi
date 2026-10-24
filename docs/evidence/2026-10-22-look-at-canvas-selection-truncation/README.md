# look_at_canvas 选区静默截断：修前修后与真模型量具

合同：`docs/fixes/2026-10-22-look-at-canvas-selection-truncation.root-cause.json`。
同类的上一刀：#1263（发送时的选区投影，`electron/shared/agentContextSnapshot.ts`）；那一刀留下的口子正是这里：模型被提示去 `look_at_canvas` 补读，读到的却还是同样的前 32 个。

## 零花费：修前修后（`census.mts`）

同一份 N 档（1 / 31 / 32 / 40 / 256 个选中节点，真实形状的节点 id，约 26 字），数「当前选中」那一行里有几个 id、有没有明说总数、顺着提示翻页能不能读全。

| 选中 | 修前：行内 id | 修前：明说总数 | 修前：静默少了 | 修前：翻页可达 | 修后：行内 id | 修后：明说总数 | 修后：静默少了 | 修后：翻页可达 |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 否 | 0 | 1 | 1 | 是 | 0 | 1（1 页） |
| 31 | 31 | 否 | 0 | 31 | 31 | 是 | 0 | 31（1 页） |
| 32 | 32 | 否 | 0 | 32 | 32 | 是 | 0 | 32（1 页） |
| 40 | 32 | 否 | **8** | 32 | 32 | 是 | 0 | 40（2 页） |
| 256 | 32 | 否 | **224** | 32 | 32 | 是 | 0 | 256（8 页） |

原始数据：`census-before.json`、`census-after.json`。修前那一列是把 `origin/main` 的 `canvasReadCompact.ts` 复制成同目录临时文件，用 `--module` 指过去跑的：

```
git show origin/main:electron/shared/agentCapabilities/canvasReadCompact.ts > electron/shared/agentCapabilities/canvasReadCompact.before.tmp.ts
pnpm exec tsx docs/evidence/2026-10-22-look-at-canvas-selection-truncation/census.mts --module electron/shared/agentCapabilities/canvasReadCompact.before.tmp.ts
rm electron/shared/agentCapabilities/canvasReadCompact.before.tmp.ts
pnpm exec tsx docs/evidence/2026-10-22-look-at-canvas-selection-truncation/census.mts
```

## 真模型（App 里配好的模型，`paid/`）

R13.3 的三个数（工具写对率、翻页率、回合成功率）改由真 App 走查量：`tests/ux/look-at-canvas-selection-real.paid.mjs`。
它用 `_paidRun.mjs` 的真实资料跑法（App 里配好的 BRAIN，不读 key），布 44 个节点、选中 40 个（20 首帧图 + 20 视频，另有 4 个不选的干扰），每轮新开对话问「我选中的这些里，哪几个是视频节点？把标题都列出来」，5 轮；场景与判分在 `tests/ux/_lookAtCanvasSelectionScore.mjs`。

```
pnpm build && node tests/ux/look-at-canvas-selection-real.rehearsal.walk.mjs      # 零花费演练，先过
pnpm build && NOMI_SPEND_OK=1 node tests/ux/look-at-canvas-selection-real.paid.mjs # 真跑，写 paid/report.json
```

`paid/rehearsal.json` 是演练（夹具里的脚本化大脑，**不是模型分数**），证管道与判分；每轮还记了 `view`：答话那一刻、宿主发给模型的那份消息里（`transform_context` 之后）还看得见几个选中 id。
