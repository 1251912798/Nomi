# 空节点上下文引导：独立实现审查

- 独立线：`V-node-guidance`。
- 审查日期：2026-10-12（Asia/Taipei）。
- 对象：`codex/contextual-empty-node-guidance` 当前未提交工作树的生产差异；不是 merge SHA 验收。
- 边界：源码审查、独立定向测试及实现线真实 Electron 收据/截图复核；未在此独立线操作真 Electron、文件选择器或 Windows。
- 现有功能合同：[independent-census.md](./independent-census.md)。

## 结论

复查最新工作树，未发现尚存的确定任务代码阻断缺陷。完整 gates 仍有失败；本结论不等于全量门岗绿色或可跳过交付门。共享上下文覆盖生产全量节点、轻量节点与懒加载 fallback；教学引导与业务状态分开；浏览态按用户追加反馈使用 24px glyph / 48px disc，单选原引导不变。

上一版独立源码审查未发现 label 转发事件被清空后的准入拦住，真实 Electron 走查随后复现了这个缺陷。最新实现保留同一手势的准入至下次 pointerdown/cancel，使 label 及其 hidden input 转发的两个 click 使用同一结论；每次 click 仍要求当前 engaged 且非 readOnly。已读取最新 en-dark 全流程通过收据，确认 5 种上传首击只选择、二击打开文件框并导入真实媒体，以及白板二步打开。

独立线实际执行的 5 文件 / 82 测试通过。已读取 en-dark 与 zh-light 两份 26 项完整流程通过收据，以及最终 zh-dark 与 en-light 各 23 项视觉/LOD/状态通过收据；亲眼读取四种语言/主题组合的关键截图。中文浅色旧浏览图缺真实分组框，已由修正 fixture 后重跑的新收据/图片取代。不据此宣称全平台全部功能验收通过。

## 重点逐项检查

路径以 `src/workbench/generationCanvas/` 为前缀，行号对应审查时工作树。

| 项目 | 判断 | 代码证据与理由 |
|---|---|---|
| Provider 覆盖 | 源码通过 | `reactFlow/GenerationCanvasReactFlowNodes.tsx:298-333` 包住 NodeComponent、Suspense fallback、Lightweight；独立 Clip/Director/shot_table 和插件均由同一 NodeComponent 路径到达 |
| 单选与框选 | 源码通过 | 同文件 `:193-195` 的 primarySelection 同时读取 data.primarySelection 与 React Flow multiSelectionActive；provider 不仅使用 selected |
| 多选 | 源码通过 | adapter 的单选真相仍为 `generationCanvasReactFlowAdapter.ts:110`；NodeEmptyState 消费上下文，无各类型第二份查选区逻辑 |
| 安全默认 | 源码通过 | `nodes/render/NodeEmptyStateContext.ts:4` 默认 engaged=false/readOnly=true；未包 provider 的宿主仅图标，写动作不可激活 |
| 教学/状态 | 源码通过 | `nodes/render/NodeEmptyState.tsx:26-35` 只简化 purpose=guidance；`nodes/render/CardCommon.tsx:191` 将 waitingUpstream/derivedReady 设为 status |
| 类型图标 | 源码/测试/已读截图通过 | NodeEmptyState 图标档为 size-12 / SVG size-6，即 48/24；CardCommon/全景/Director/Clip/LOD 复用 renderRegistry；prop 保留道具 renderKind 的 Box 图标 |
| 上传首次点击与 label 转发 | 最新源码与 en-dark 实现线真 App 收据通过 | `NodeEmptyStateContext.ts:22-29` 在 pointerdown 捕获准入，同一手势的两个 click 保留结论；所有 click 同时要求当前 canActivate；preventDefault 拦未准入 label 默认行为，隐藏 input 同时 disabled |
| 选区/只读中途改变 | 源码通过 | click 重新要求当前 canActivate，旧 admitted=true 不能在已失选或只读时放行 |
| 无 pointerdown 的键盘 click | 源码通过，真键盘待验 | detail=0 按当前 canActivate 判断；不依赖前一指针的 admitted；launcher 活跃时 tabIndex=0，非活跃 -1 |
| 白板 | 源码与 en-dark 实现线真 App 收据通过 | `CardCommon.tsx:92-106` 使用同一捕获门，onClick 先检查 defaultPrevented；未选中 pointerdown 冒泡到宿主；WhiteboardCardBody 原 readOnly 检查保留 |
| 旧指针准入/cancel | 源码通过 | 每次 pointerdown 覆盖，pointercancel=false；click 不提前清空，允许 label 转发；当前失选/只读仍拒绝旧 admitted=true；无 pointerdown 的 detail=0 不依赖旧 ref |
| 文本 | 源码与原入口编辑收据通过，拖动/快捷键未点验 | 仅空态且未 engaged/未 focused 时隐藏内部 header，EditorContent/写入/格式工具未删除；纯图标在 pointer-events-none 层；原工具栏创建→编辑→失选保留文字已通过 |
| 剪辑 | 源码与已读截图几何通过，drop 未点验 | 图标在真实 overlay 内大小/位置可见，ClipEmptyTry 单选显示原两动作且 hostReadOnly 会隐藏写操作；原 drop/clip/scrub/添加流程未改 |
| 导演 | 源码通过 | 空态换共享 NodeEmptyState；无内容时按钮需 engaged；已有内容按钮/统计、incoming 摘要、渲染失败重试维持原路径 |
| LOD | 源码及实现线视觉/LOD 收据通过 | LightweightGenerationNode 仅在原没有预览的分支添加图标，已有图片/视频预览分支保留；内层明确 engaged=false/readOnly=true；zh-dark/en-light 81 节点在 51% 缩放均按原虚拟化渲染屏内轻量节点，并验证前 14 种类型图标及每个 48px disc 的上下边界；`:37,83,104` 复用实际 bodyHeight 并按既有紧凑阈值居中短 body，非类型特判 |
| 异常与业务层 | 源码通过 | artifact 缺元数据/缺失插件/shot_table 诊断未改；BaseGenerationNode 错误、recoverable、本地处理和 NodeGeneratingOverlay 未受教学门控制 |
| 外部名称/业务状态 | 最新源码及最终 en-light 状态收据通过 | `nodes/BaseGenerationNode.tsx:151,287` 仅给无结果且归一化 idle 的卡片/文本增加外部名；queued/running/error 等不再多一行，原非卡片/非文本规则保留；可选 status 缺省仍按 idle 处理 |
| Context 分拆 | 源码通过，无语义变化 | `nodes/render/NodeEmptyStateContext.ts:4-32` 保留 context/hooks；`nodes/render/NodeEmptyStateProvider.tsx:4-10` 保留组件及原 memo 依赖，宿主和实验室 import 均转新组件文件；解决 Fast Refresh 混合导出警告，未改变准入规则；concept owner 登记同一共享边界 |
| 实验室 | 源码通过 | emptyNodeRatiosLabKit 与 uiShellLab 显式 provider，既有完整生产组件样张不会因安全默认变空 |

## 验证记录

执行命令：

```sh
pnpm exec vitest run src/workbench/generationCanvas/nodes/render/NodeEmptyState.test.tsx src/workbench/generationCanvas/nodes/render/CardCommon.test.ts src/workbench/generationCanvas/nodes/render/nodeEmptyStateLayout.test.ts src/workbench/generationCanvas/nodes/renderRegistry.test.tsx src/workbench/generationCanvas/reactFlow/generationCanvasReactFlowAdapter.test.ts --maxWorkers=1
git diff --check
```

本轮结果：5 文件、82 测试通过；diff whitespace 检查通过。覆盖 registry/图标档、引导/状态、安全默认、上传 disabled、白板 tabIndex、单选投影与排版纯函数。SSR 单测不模拟浏览器 label 转发；该行为另由真实 Electron 收据证明。

首条尝试包含 `--minWorkers=1`，仓库 Vitest 4.1.8 不支持该参数，在 CLI 解析阶段失败，没有执行测试；已改用以上命令。

此前 2 文件 / 34 测试通过；本轮因图标规格与 admission 行为更新，扩大到以上受影响文件。实现线另外报告 12 文件 / 117 测试通过，本独立报告不把该数量记为自身运行。

## 真实 Electron 收据复核

- 已读 [walk-en-dark.json](./walk-en-dark.json)：`status=passed`，26 项通过，包含真实分组框、整组选中、15 种空态（含 prop renderKind）、原工具栏创建、文本编辑、5 种上传、白板。
- 已读最新 [walk-zh-light.json](./walk-zh-light.json)：`status=passed`，26 项通过，包含 `guidance.group.selection`。fixture 改为 `nodeGroupSchema.parse` 并提供 createdAt/updatedAt 后重跑，真实分组框与组头选中证据已补齐；取代缺分组框的旧 25 项收据。
- 已读 [walk-zh-dark.json](./walk-zh-dark.json) 与 [walk-en-light.json](./walk-en-light.json)：均 `mode=visual-matrix,status=passed`；最新两轨均为 23 项。覆盖真实分组/单选/整组选中、15 类矩阵和 81 节点 51% 缩放 LOD；两轨另有 queued/running/error 音频状态与 omitted-status 白板 4 项，均通过。这两轨没有重复运行工具栏/文本编辑/本地上传/白板原入口流程。
- 已亲眼读取：`01-group-browsing-en-dark.png`、`02-single-selected-en-dark.png`、`matrix-director-en-dark.png`、最新 `01-group-browsing-zh-light.png`、最新 `02-single-selected-zh-light.png`、`matrix-clip-zh-light.png`。两轨真实分组均明确存在；浏览态没有重复指导，单选只有当前节点展开，原生成框实际加载完整。Clip/Director 图标有可见尺寸和合理中心。
- 补充亲眼读取：`01-group-browsing-zh-dark.png`、`02-single-selected-en-light.png`、`03-dense-zoomed-out-zh-dark.png`、`03-dense-zoomed-out-en-light.png`。另两种语言/主题组合的分组与单选层级一致；51% 时标记按画布比例缩放，轻量节点没有教学文字堆叠。
- 读过 `tests/ux/contextual-node-guidance.walk.mjs`：上传使用真实鼠标首击/二击和 filechooser 事件计数，再导入仓库真实媒体；类型矩阵以 store 注入准备状态。前者是原入口交互证据，后者不能声称 Agent 或供应商执行已验收。
- LOD 初次脚本要求 DOM 有 81 张卡，原虚拟化只挂屏内约 20 张，因此失败。已复核新判据：store 总数 81，屏内至少 14 张且全为 lightweight，逐一验证前 14 类类型图标；没有修改生产虚拟化。这是 LOD 功能证据，不是最大规模性能基准。
- 最终构建后重新读取 zh-light 的 26 项及 en-light 的 23 项收据；再次亲眼读取两轨分组浏览/单选截图，以及 en-light Clip/Director 多选截图，层级与 48/24 图标尺寸无新异常。新增 4 项业务状态由运行断言证明，未另有状态截图，不能写作这 4 项均亲眼截图验收。
- 最终脚本 `tests/ux/contextual-node-guidance.walk.mjs:108-109` 仅对 Clip 单选后原空态替换断言消失；Director 仍保留 NodeEmptyState compact guidance，按非 icon 档检查；与 `NodeTryList.tsx:69-76`、`DirectorNode.tsx:207` 实现一致。新增负断言采用共享 proveProbe/expectAbsent，先证明现场存在再验证消失，不添加基线。
- 未修改生产文件；已修正 ContextualEmptyNodes.board.json 中功能普查 F 编号的错误映射。

## LOD 裁切逃逸与最终复核

此前本独立线亲眼读取了远景图，但漏判音频轻量短条的 disc 下沿被裁切；旧 LOD 断言只证明 SVG 宽度 24px，无法证明 48px 底盘完整落在 body 内。此前“已读截图通过”不应被理解为这项几何已验，旧远景截图及相关结论由本节纠正。

协调线最终逐图检查发现：LOD 音频实际 body 高 80px，而默认 regular 的顶部最少 44px，48px disc 会越界。已只读审查 `components/LightweightGenerationNode.tsx:37,83,104`：从原 style 同公式提取 bodyHeight，用于渲染与空态高度；低于既有 `EMPTY_STATE_COMPACT_MIN_HEIGHT` 时使用 NodeEmptyState 既有 compact 居中，不按节点类型加特例，不改变媒体预览或虚拟化。

已读 `.tmp/node-guidance-lod-red.log`：新断言在旧 build 对音频报红，badge 下沿 384.248 超过允许 body 下沿 378.604，证明确实抓到此前遗漏。新脚本对前 14 种类型逐一检查 disc 上下边界，容差为屏幕坐标 0.5px。已读 `.tmp/node-guidance-lod-green-en-light.log` 与 `...-zh-dark.log` 及最终两份 23 项 JSON，几何检查和后续 4 项状态检查均通过。

再次亲眼读取替换后的 `03-dense-zoomed-out-en-light.png`、`03-dense-zoomed-out-zh-dark.png`：音频圆盘完整位于短条中，原有高节点标记保持原位置，两主题远景均没有重复教学。确认的是节点 body 内上下容纳；截到视口之外的节点和合成 fixture 节点间重叠不在此断言范围，不能推广为所有画布尺寸/缩放的完整视觉基准。

## 完整门岗与音频回归边界

已读取 [baseline-comparison.json](./baseline-comparison.json) 的完整 179 条对照，而非仅依赖早期 26 条抽查。干净 origin/main `6d28f3863244edbdf6e013bea33d26baff0f9615` 为 73 失败 / 106 通过；任务初轮为 78 失败 / 101 通过。共同失败名称为 73 项，无主线独有失败；共同失败实际 PNG 71 张字节一致，另 2 张不一致，不能宣称这 2 张已由像素对照排除任务影响。该对照由实现线执行，本独立线读取其收据，未另行跑整套视觉测试。

任务独有的 5 项是音频 queued/submitting/generating/finalizing/failed，确认为本次新增外部名称条件过宽的回归。最新 `BaseGenerationNode.tsx:287` 收紧到 `!hasResult && status === 'idle'`；使用该组件既有的 `node.status || 'idle'`，避免旧数据缺省 status 时漏名称。已读取实现线记录：原 5 项 golden 重跑全部通过，没有更新任何基线。该窄修复不应被写成“全部视觉用例通过”。

完整 105 contracts 初轮 8 门失败。已读取实现线最终重查日志：walkthroughs 64 测试通过、absence-without-baseline 回到 61；waits 10 测试通过、new/stale=0；lint 为 0 errors / 78 warnings，在 79 上限内；vocabularies 在显式 `VOCAB_BASE_REF=origin/main` 下 68 测试通过、238 owner 已登记。walkthroughs 初轮是本次新增 7 处无 probe 的负断言使全局从 61 达到 68，不能归为旧债；已改共享 probe 并真实重跑通过，不修改基线。root-cause 最终无警告通过由实现线报告，本独立线未另行执行。

clean main 可重复 claude-hooks 21 项、git-path-quoting 1 项、main-guard 1 项失败；实现线另记录 main-guard 指向临时目录真实路径 TMPDIR 后通过。已读取全量 unit 日志：1910 文件通过，18502 测试通过，2 expected fail、38 skipped；1 个未改的 `electron/assets/generatedMediaDecode.test.ts` 套件在 beforeAll 创建 WebP fixture 时因 ffmpeg 缺编码器失败。显式 Homebrew ffmpeg 重查仍在同一 fixture 编码处失败，27 项因此未执行；没有把套件准备失败当成产品解码通过，也没有干净 main 的该套件对照可支持完整旧债归因。已读 node-suites 完整日志的 5 组摘要，总计 558 项通过、0 失败。上述全量执行由实现线完成，本独立线读取日志，不记作独立线运行。当前完整 gates 明确未全绿。

已读取最终 LOD 修正后的构建日志 `.tmp/node-guidance-build-lod.log`，实现线报告完整 exit 0；官方 typecheck 的 app/electron/electron-pi/test-types 四部分及 board-parity 重查通过，LOD 相关 4 文件 / 71 测试通过（实现线执行，本线已读日志）。随后真实 Electron 的 en-light/zh-dark 各 23 项均通过；zh-light/en-dark 原入口各 26 项为此前真实完整流程收据。en-light 包含 `guidance.operational.audio.queued/running/error` 与 `guidance.legacy.status-omitted`，确认业务状态可见且没有额外空卡名称，旧数据缺省 status 白板仍保留外部名。构建身份戳曾因构建期间文档更新拒绝，后由重新构建完成；本报告追加发生在该次构建后，最终提交身份及交付戳仍由实现线核对，不能拿旧身份戳冒充新提交。

## 验收尚需补齐的证据（非已确认代码缺陷）

1. 文本空白区域拖动、键盘全程、读屏激活，以及 pointercancel/多选/readOnly 中途切换的真实事件走查未在此线执行。
2. Clip 两动作/拖放及 Director 已有内容/失败重试未在本次新脚本点验；源码未改原行为，不能把“未改”写成“真实验收通过”。
3. F01–F42 普查中未修改的状态/内容/诊断路径仅源码及针对性测试保留；真实最大规模性能、最小窗口不能由 15 类型及 81 节点 LOD 功能矩阵代替。
4. Windows、安装包：`unverified`。付费生成、本次无修改的模型执行与供应商路径：本独立线 `unverified`。

当前可声明源码/定向检查通过、中文浅色与英文暗色 macOS 原入口闭环通过、中文暗色与英文浅色视觉/LOD 通过，以及已读截图通过；状态词须遵守仓库交付阶段，未经 merge SHA 收据不能声明「已解决」。最终 LOD 裁切红绿与两轨 4 项状态收据已补齐；本独立线停止文件写入，供实现线核对最终身份与交付收据。
