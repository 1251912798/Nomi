# 方向检查：画布图片预览契约（2026-10-16）

> 触发：`node scripts/fix-churn.mjs` 命中 `electron/assets/`（14 天内第 5 个 fix）、`generationOutputMaterializer.ts`（第 3 个）、`generationCanvas/adapters/`（第 5 个）。
> 前 4 个 `electron/assets/` fix 是 Windows 文件身份、3D 参考种类、取回确定性失败（#975 两刀）；materializer 两个是同一组取回失败；adapters 四个是上传撤销 / 失败卡 / 分组批量。**没有一个是「预览」这一概念**——本刀不是同线第 3 轮修补，是新概念的第一次结构化收口。
> 根因合同：`docs/fixes/2026-10-16-canvas-image-preview-contract.root-cause.json`。证据：协调线 C-dense 只读调查（合成内存预算对照 + 真落盘探针）。

### 0. 一句话根因

本波共同类根因：选中、显示这些高频路径上，各功能各自往里挂东西（同步 IPC、全量扫描、挂载时回写、整表订阅、原图上画布），既没有结构约束，也没有按操作计数的预算。本概念的特化：**「交给画布的图片带有界预览」没有 owner**——落盘回执不带预览事实、`thumbnailUrl` 可选且可以等于原图、画图组件接受任意字符串，于是每个出图入口都得自己记得带小图，新入口一忘原图就悄悄上了画布，没有任何计数。

### 1. 归类表：bug → 直接原因 → 类

| 位置 | 直接原因 | 类 |
|---|---|---|
| 制作流程 / Agent / MCP 落图（`generationOutputMaterializer`） | 同步 `writeDeterministicAsset` 不派生预览，回执没有小图 | 回执不带预览事实 |
| 卡片上传、裁剪 / 切图 / 变换 / 抠图、联系表、全景截图（`persistNodeImageFile/Blob`） | 包装只回 url，回执里的小图在半路丢掉 | 包装丢字段 |
| `localizeTaskAsset`、`unlocalizedTaskAsset`、补救本地化 | 没有小图时把源地址写进 `thumbnailUrl` | 原图冒充预览 |
| 角色 / 道具 / 场景卡 | `DeferredNodeImage src={node.result.url}` | 画图处直接挂原图 |
| 补预览桥 | 只接受视频（14a5320a0：直接换 src 会闪） | 旧数据永不补 |

### 2. 为什么这一类会一直出现

预览是「落盘」和「显示」两头的约定，中间没有类型，也没有唯一投影：主进程写不写小图、渲染层读哪个字段、画图组件挂哪个地址，全靠每个入口各写一遍 `thumbnailUrl || url`。三条体验铁律都不直接适用（不是参数、选项或点击语义）；对应的是性能覆盖类（`performance-coverage`）——真实项目的图片规模没有被任何门岗按「原图张数 / 解码像素」计数。

### 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 下一个出图入口（例如新的编辑操作、Agent 新工具）照样只交 url，原图上画布 | `rg "url: stored.url|thumbnailUrl: .*\|\| .*url"`；本刀的 `canvasPreviewDoors.test.ts` 第 1、4 条 |
| 新卡片类型照抄 `src={node.result.url}` | `canvasPreviewDoors.test.ts` 第 2 条；品牌类型提交后 tsc 直接拦 |
| 老用户项目永远挂原图，换机器 / 集显用户更早遇到缺块 | 打开旧项目后读 `canvasOriginalImageStats()` |

### 4. 靶子独立性检查

- 尺子不是本线写的：缺块对照由 C-dense（另一条只读线）用合成内存预算实验给出；本刀的证据是确定性计数（原图张数、像素），不拿毫秒当证据。
- C-dense 已证明「补缩略图不能保证极端低预算下不缺块」：本刀不宣称修好群友的缺块，逃逸账本保持 candidate。

### 5. P0：这些是我们独有的吗？现成方案有哪些

- 缩略图派生是通用能力：沿用已打包的 ffmpeg（现有 owner `assetPreview.ts`）。看过 Electron `nativeImage.createThumbnailFromPath`（官方文档：只支持 macOS / Windows，Windows 忽略高度）——做不出「长边 ≤ 1024」、alpha 保留与视频首帧，不换。
- 换图不闪用浏览器内建 `HTMLImageElement.decode()`（HTML 标准），不自写解码等待。
- 自写的只有领域部分：画布结果上的预览事实（ready / source / missing）与「画布只吃预览」这条显示合同。

### 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 派生仍用 ffmpeg；换图用 `img.decode()` | 无新依赖 | 无 | 已采用（不是可替换整块的现成方案，只是底层用现成的） |
| 补 | 只给 materializer 和包装各补一个 attach | 小 | 下一个入口照样漏；`thumbnailUrl = url` 仍在 | 否 |
| 换（本刀） | 回执写预览事实 + 唯一投影 + 画布品牌类型 + 打开后补齐旧数据；删三处回落与 `hostedAssetThumbnailUrl` | 中：约 40 个文件；旧数据每张约 40KB 磁盘、一次缩放 | 打开旧项目后几秒内图片会从原图换成小图（先解码再换，无空白帧） | **推荐** |
| 删 | 画布不再显示图片 | — | — | 否 |

结构性岔路（交协调）：
1. `BaseGenerationNode` 一行 `src` 与 `DeferredNodeImage` 的品牌类型收口在单独提交里——该文件归草稿 #1189 / P-compose，需协调决定随本 PR 还是等 #1189 合入后再上。
2. 分级预览（按屏幕像素 × DPR 选小图 / 中图）不在这一刀。
3. 合成层削减归性能线第 2 步。

### 7. 用户要权衡的核心

打开老项目后，后台会花一点磁盘（每张约 40KB）和 CPU（每张一次缩放）把原图换成小图——换的那一下画面内容不变、不闪，换完画布读的像素少约 9 倍。

## 特征测试清单（动结构前先锁住）

- `electron/assets/canvasPreviewContract.test.ts`：主进程入口矩阵（普通生成、拖拽 / 原生导入、制作流程物化、派生失败、不落盘远端、旧数据补预览）。
- `src/workbench/generationCanvas/canvasPreviewDoors.test.ts`：入口普查（三种旧写法）。
- `src/workbench/generationCanvas/resultMediaBackfillBridge.test.ts`：补预览队列（并发、视口优先、decode 后写回、missing 不重试、竞态不覆盖）。
- `src/workbench/generationCanvas/adapters/persistNodeImage.test.ts`、`nodes/canvasImageSource.test.ts`、`runner/catalogTaskResultParse.test.ts`。
