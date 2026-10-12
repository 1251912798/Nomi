# OpenDesign 源码审计：精准反馈驱动 Agent 修改

调研日期：2026-10-12。对象：nexu-io/open-design，固定 SHA `17e255959703a3fad7c8eb7f7b70dcafccc5629a`，提交时间 2026-10-10T02:47:36Z。此仓库与 undefined83 的同名项目分开处理。

证据范围：公开仓库源码、依赖与许可、随仓库官方产品截图；未安装或运行第三方代码，未完成真实应用交互和导出验证。以下“已观察”指源码路径可见，不代表产品无缺陷或测试在我们的环境通过。

## 1. 对方案最有价值的判断

**OpenDesign 比前五个项目更直接覆盖“在成果上指出问题 → 持久评论 → 排队交给 Agent → 修改后待审阅”的交互。建议将它作为 HTML/Deck 精准反馈闭环的主要源码参考，并摘取其可分离模块。** 它的现有界面是聊天、文件工作区、单成果预览与批注，不足以证明一个可放置任意多成果节点的无限画布；它为 Nomi 提供的是画布节点进入聚焦态后的交互，外层成果组织仍复用 Nomi React Flow。

更关键的变化是：**PPT 可以先以 HTML slides 为真源，浏览器负责版式和预览，成熟库导出 PowerPoint。** 不必为了第一版先自研 SlideModel、幻灯片布局引擎或完整 Office 编辑器。这是一条需要验证保真度的候选路线，不能据此承诺任意 PPTX 导入、无损往返、原生图表编辑。

## 2. 实际交互如何衔接

### 2.1 选择、批注、轻修改共用选择基底

预览注入 `injectSelectionBridge`，同一元素选择结果交给批注模式或 Inspect 模式。目标包含文件路径、元素 ID、selector、文本摘要、HTML 摘要、位置、样式和 slideIndex；支持单元素与多个元素成组的 pod，画笔/圈选还可携带截图。Inspect 只开放少量样式字段并经主端重新构造 selector、校验属性值，避免直接保存预览发来的任意 CSS。

- 源码：[apps/web/src/runtime/srcdoc.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/src/runtime/srcdoc.ts#L1861)、[packages/contracts/src/api/comments.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/packages/contracts/src/api/comments.ts#L63)、[apps/web/src/components/FileViewer.tsx](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/src/components/FileViewer.tsx#L5398)。
- 交互启示：不必建立“评论目标”和“编辑目标”两套选中逻辑；一次选中可以用于留言、要求 Agent 修改、直接改短文本或少量样式。
- 限制：缺少作者标记的 HTML 会按 DOM sourcePath 注入 `path-*` ID；结构插入后路径可变。已有 ID 比路径强，但源码未提供通用跨版本语义身份保证。不要把任意 selector 命中等同“仍然指向同一个业务对象”。

### 2.2 评论是持久记录；提交任务不是消费后删除

daemon 的 SQLite `preview_comments` 表保存评论；创建、修改、状态更新和删除是独立 API。一个元素上允许多个评论，永久 pinSeq 与侧栏 sortKey 分开，避免排序改变评论编号。保存评论只保存，加入 composer 的 attachedComments 是另一层状态，明确提交才进入 Agent 队列。

批量发送板上批注时，当前实现把每条批注变成一个排队任务；上传的公共参考图只放到第一个任务，评论自己的图片仍跟随自身任务。**这不等于 Agent 一次把多个互相关联修改作为原子事务完成。** Nomi 可以复用目标上下文与持久记录，但需要自行决定同一成果上的多个改动是否合并成一个受限任务，以降低多次上下文和互相覆盖。

- 源码：[apps/daemon/src/db.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/daemon/src/db.ts#L290)、[apps/web/src/components/ProjectView.tsx](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/src/components/ProjectView.tsx#L6287)、[apps/web/src/components/ProjectView.tsx](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/src/components/ProjectView.tsx#L11316)。
- Agent 上下文组装把 selector、位置、当前文本、HTML 摘要、样式和 pod 成员发给 Agent，并在提示词中要求只改目标区域。
- 这条修改范围限制是**提示词约束**，未据此证明文件工具在宿主层强制阻止越界编辑。应将范围校验接入 Nomi 现有写入边界，而不是只抄提示词。源码：[apps/web/src/comments.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/src/comments.ts#L611)。

### 2.3 “执行完成”和“人类认可”分开，但完整认可控件仍待核实

评论处理状态有 `open / attached / applying / needs_review / resolved / failed`；源码中任务开始写 applying，Agent 完成写 needs_review，失败写 failed。它没有直接把 Agent 成功等同 resolved，这是可取的。当前审计未找到完整的用户“认可并 resolved”的 UI 触发链，因此不能宣称“人工确认闭环已完整实现”。另已观察 FileViewer.tsx:15730 的评论侧栏/画布 pin 只筛选 open；代码注释明确其它状态保留数据库编号但不画 marker。因此 needs_review 目前更像执行后记录状态，不能当作已经完成的可见逐条审阅工作台。Nomi 需要把待审阅评论保留在可见位置，并关联前后成果。

`runCommentAttachments` 保存本轮关联评论，回调按 attachment.id 更新状态；这段实现嵌在巨大的 ProjectView 应用组件中，不是能直接安装的执行回执 SDK。Nomi 应把 commentId/commandId/Agent runId/result version 的关联接入现有 pi Run 与写入收据，复用状态契约，避免复制整个任务运行系统。

- 源码：[packages/contracts/src/api/comments.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/packages/contracts/src/api/comments.ts#L3)、[apps/web/src/components/ProjectView.tsx](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/src/components/ProjectView.tsx#L9136)、[apps/web/src/components/ProjectView.tsx](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/src/components/ProjectView.tsx#L9740)。

### 2.4 锚点漂移与任务处理是两条状态轴

`resolveCommentAnchor` 先按 elementId + filePath 找实时 snapshot；版本不同时标 reanchored。精确目标缺失后，以 selector、htmlHint、text 评分，位置只作较弱加分，候选标 stale；无候选标 lost，在最后位置画幽灵 pin。只把首次 lost 的最后位置持久化，其余定位状态按当前查看者实时计算，避免一人的视图覆盖另一人的定位。

这是可以直接移植并扩展的成熟交互。**仍有缺口**：精确 ID 命中没有比较语义指纹；fuzzy 选最高分，没有同分歧义拒绝；path ID 可能重新命中另一个结构位置。Nomi 应将 stale/lost 用于“提示并重新定位”，禁止自动授权写入；新生成 HTML 使用稳定元素 ID、冻结 revision/hash 的既有 TargetRef/PreconditionSet 仍是写入保障。

- 源码：[apps/web/src/comments.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/src/comments.ts#L257)。
- 测试案例：[apps/web/tests/comments.test.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/tests/comments.test.ts#L511)、[apps/web/tests/comment-anchor-writeback.test.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/tests/comment-anchor-writeback.test.ts#L30)。

## 3. 具体可拿来用的模块与依赖闭包

“可摘取”指保留上游许可与来源后移植小模块、裁剪应用耦合，再经 Nomi 既有边界使用；不表示上游正式提供独立 SDK。

| 候选 | 实际依赖闭包 | 推荐动作 | 需要 Nomi 补的边界 |
|---|---|---|---|
| 评论契约：`packages/contracts/src/api/comments.ts` | 纯 TypeScript 类型，只有 type-only `OkResponse`；应用 types.ts 主要重新导出 contracts | 直接摘取目标字段、双状态轴、pod 和附件结构，适配到既有 TargetRef；保留 provenance | 不另建平行 TargetRef；补 comment→command→run→version 关联 |
| 锚点纯函数：`comments.ts` 的 `resolveCommentAnchor`、`planLostAnchorWriteBacks`、normalize/trim helpers | 没有运行时 import；type-only contracts + PreviewCommentSnapshot。包含少量内部归一化、评分函数 | 提取最小函数闭包和上游测试，作为 HTML fallback 定位器 | stable ID/身份摘要、同分歧义拒绝、stale/lost 不能自动写 |
| 轻编辑：`edit-mode/{types.ts,bridge.ts,source-patches.ts}` | bridge 无 import；source-patches 仅 import 同目录 types，运行依赖浏览器 DOMParser/CSS/DOM；包含品牌特例及 runtime override | 提取 text/link/image/style 与受限目标patch；对品牌特例裁剪。保留拒绝混合文本歧义的行为 | 接 Nomi 写入前置条件与统一版本/undo；不要复制 UI 全文保存栈 |
| 选择/批注桥：`runtime/srcdoc.ts` 内 `injectSelectionBridge` | 函数生成注入脚本，依赖注入位置helpers；全 srcdoc 文件还依赖 deck/preview contracts、manual-edit bridge、font parser，整文件约193KB | 只摘 selection/pod/inspect 协议闭包及相关测试；不要复制整 preview runtime | 使用 Nomi frame 身份、请求ID、窄通道与 session；原桥未校验 ev.origin，不能照搬信任模型 |
| PPT 导出：`dom-to-pptx` browser bundle + `deck-capture.ts` 适配 | npm/browser 库 MIT；OD固定2.0.1；Electron BrowserWindow + pdf-export等待字体 + static-capture + html注入helper + sidecar类型，适配文件约153KB | **先直接试成熟库**，再摘必要的CJK字体/层叠背景修正；不复制整 daemon/sidecar | 结果逐项可编辑性/视觉审计、导出模式明确、资源等待/失败回执、平台实测 |

纯函数测试可复用的具体案例：

1. [apps/web/tests/comments.test.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/tests/comments.test.ts#L511)：精确命中；旧版本命中标 reanchored；ID变更后内容匹配标 stale；位置相同内容无关仍判 lost。
2. [apps/web/tests/comment-anchor-writeback.test.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/tests/comment-anchor-writeback.test.ts#L30)：首次 lost 写一次 lastGoodPosition；重复渲染不再次写；anchored/reanchored/stale 不回写。
3. [apps/web/tests/edit-mode/source-patches.test.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/tests/edit-mode/source-patches.test.ts#L44)：只改选中的文字；链接href变化保留嵌套markup；含装饰图标的唯一文本可改；真正混合文本歧义拒绝；替换outerHTML保留目标ID。

上述测试源码已阅读，未在 Nomi 或 OpenDesign 环境执行，不能报通过。

## 4. revision、局部修改、undo 与截图的实际边界

轻编辑通过 `applyManualEditPatch` 定位并修改目标，输出完整 source。保存前 GET 当前内容比对 baseSource，发现外部变更则刷新并清空本地 undo 栈；随后再调用 writeProjectTextFileDetailed 全文保存。**这是客户端前检，GET 与写入之间有时序窗口，未形成已证实的宿主 CAS。** 同模块读取失败得到 null 时前检放行，不能作为严格 stale-write 守门。

文件版本在 `.file-versions` 存不可变内容、manifest、SHA256 digest、parentVersionId 与 origin，并串行化进程内同文件版本操作。`parentVersionId` 匹配当前时用于继承 provenance；不匹配时未看到以冲突拒绝创建版本，因此它不是 expectedRevision 替代品。Agent 产物另有 run HTML snapshot 路径。

手动 undo 保存 beforeSource 为一个新 manual 版本，先确认当前全文等于预期；这是手动编辑历史，不足以证明所有 Agent 服务端写入进入同一用户undo journal。Nomi 继续使用已有统一 canvasDocumentCommit/canvasUndoJournal 及 TargetRef preconditions，避免再加一个只在组件内有效的 undo。

- 源码：[apps/web/src/components/FileViewer.tsx](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/src/components/FileViewer.tsx#L13276)、[apps/web/src/components/FileViewer.tsx](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/src/components/FileViewer.tsx#L13415)、[apps/daemon/src/project-file-versions.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/daemon/src/project-file-versions.ts#L475)、[apps/daemon/src/run-html-version-snapshots.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/daemon/src/run-html-version-snapshots.ts#L1)。

视觉批注允许截图缺失时发送结构化位置/markKind，因此截图不是强制证据门；上下文提示 Agent“有图时看图”也不证明实际看过。要实现可靠修改，Nomi 应由宿主在已提交版本上生成预览和结果证据，而不是依赖模型自觉截图。OD 的 offscreen export 使用现有 Electron Chromium，限制导航，等待可打印内容，处理透明空帧，区分首屏thumbnail与整页export预算，是值得摘取的资源治理经验。源码：[apps/desktop/src/main/artifact-export.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/desktop/src/main/artifact-export.ts#L68)。

## 5. PPT：HTML-first 可用，但“可编辑”必须分层

### 5.1 真源与两种导出

`deck-open-slide-canvas` 模板以1920×1080的HTML section slide为真源，通过scale适应预览。编辑和Agent修改同一HTML，预览使用同一浏览器布局。应用UI的PPTX弹窗默认、推荐 editable；HTTP API未传 editable=true 时默认 screenshot。两条路的行为不同：

| 路线 | 实现 | 用户得到什么 |
|---|---|---|
| editable | 渲染全部slide → dom-to-pptx browser bundle → PPTX | 可原生表示的文字、形状等输出为PPT对象；图像仍是图像，部分复杂视觉降为栅格层 |
| screenshot | 每页Chromium截图 → PptxGenJS4.0.1 addImage | 每页只有整张图，不能局部改文字，优先保存视觉 |

源码：[skills/deck-open-slide-canvas/SKILL.md](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/skills/deck-open-slide-canvas/SKILL.md#L40)、[apps/web/src/components/FileViewer.tsx](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/src/components/FileViewer.tsx#L9209)、[apps/web/src/components/FileViewer.tsx](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/web/src/components/FileViewer.tsx#L18060)、[apps/daemon/src/import-export-routes.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/daemon/src/import-export-routes.ts#L1077)、[apps/daemon/src/deck-export.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/daemon/src/deck-export.ts#L169)。

editable导出在源码中失败会返回错误；当前路径未看到悄悄将整个deck改走 screenshot 导出。因此可以学习“用户主动选模式”，不要把两种模式混称同一能力。

### 5.2 为什么不能说所有对象完全可编辑

OD固定 `dom-to-pptx` 2.0.1 的browser UMD，向库传 `autoEmbedFonts: true`、`svgAsVector: true`。同时其适配层对渐变叠层、mask、伪元素背景等做 Chromium 栅格化，尽量让文字/边框仍是native。代码中的某些被图片层覆盖的图形不再具有原生参数编辑能力。

库当前上游HEAD是2.1.2，SHA `939ef79f00db8f9f5f4f75b590e83e380abce197`；不能把新版文档功能直接算到OD固定2.0.1。上游对SVG vector的说明是保留SVG对象后在PowerPoint中“转为形状”，不是生成可修改数据源的PowerPoint原生图表。未验证原生table、chart、group、notes、animations在OD路径的覆盖，不能承诺任意Office往返。导出前应清楚显示模式；后续可提出逐对象编辑性摘要，但当前未看到OD已有这样的回执。

- 具体代码：[apps/desktop/src/main/deck-capture.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/desktop/src/main/deck-capture.ts#L510)、[apps/desktop/src/main/deck-capture.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/desktop/src/main/deck-capture.ts#L2917)。
- 上游：[dom-to-pptx](https://github.com/atharva9167j/dom-to-pptx/tree/939ef79f00db8f9f5f4f75b590e83e380abce197)。
- OD验证用例：[apps/desktop/tests/main/pptx-editable-fidelity.test.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/desktop/tests/main/pptx-editable-fidelity.test.ts#L125)、[apps/desktop/tests/main/pptx-layered-background.test.ts](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/desktop/tests/main/pptx-layered-background.test.ts#L1)。

### 5.3 对 Nomi 的建议

把 HTML-first slides 作为第二阶段默认候选：同一 HTML 节点扩展slideIndex/slideId，复用预览与批注，以 dom-to-pptx 导出，直接 PptxGenJS 只承担截图deck或明确需要原生数据对象的受限生成。先用中文中英混排、缺字体、SVG图表、表格、复杂背景、长文字、图片6类真实样本探针验证，再决定支持声明；不先写自己的完整slide数据模型和布局系统。

需要完整PPTX导入或用户持续在PowerPoint改完再导回时，才引入专门Office解析/修改引擎。这是另一个任务，HTML导出不能承担无损roundtrip。

## 6. 许可与能否直接安装

根LICENSE及package标 Apache-2.0，可在保留许可、版权、适用NOTICE并记录修改的前提下移植相关源码；这里没有发现额外竞争性限制。各技能/模板/资源和vendor拥有不同来源，仍须逐项确认；不能由根Apache推导所有第三方资产相同许可。

- `@open-design/web` private且依赖多个workspace包，不能当独立npm评论SDK安装。
- `@open-design/contracts` 是内部workspace包，可摘类型/小模块，不建议把整产品monorepo搬进Nomi。
- `dom-to-pptx`是可直接复用的独立库，MIT；OD只vendor browser bundle，理由是npm包Node/CLI依赖puppeteer可能引入第二Chromium下载。Nomi应复用自身Electron渲染器，不为导出再装一套浏览器。
- `skills/pptx-generator/SKILL.md`仅是MiniMax skill目录介绍，完整上游资产/脚本不在此文件内；不能算开箱即用的完整生成器。
- `deck-open-slide-canvas`包含模板规范和example，可作为自有模板契约的参考；若直接分发其示例设计、字体与图片仍检查来源权利。已有 `DESIGN.md + skill + canonical files` 组织方式可学，Nomi不需要再迁移它的Agent runtime。

源码：[LICENSE](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/LICENSE#L1)、[apps/desktop/vendor/dom-to-pptx/README.md](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/apps/desktop/vendor/dom-to-pptx/README.md#L1)、[skills/pptx-generator/SKILL.md](https://github.com/nexu-io/open-design/blob/17e255959703a3fad7c8eb7f7b70dcafccc5629a/skills/pptx-generator/SKILL.md#L1)。

## 7. 应合入主方案的决策

1. 外层React Flow保持；聚焦成果态采用OpenDesign“共享选中基底 + 持久批注 + 明确送Agent”的交互。
2. 默认摘取评论类型、锚点纯函数/测试、轻编辑patch；Preview桥做小闭包摘取与信任边界改造，不重写通用选择算法，也不整产品复制。
3. “任务完成→待审阅”与“锚点精确/漂移/丢失”分开，增加Nomi现有revision准入与变更回执；普通留言不会自动花钱执行。
4. HTML-first deck显著降低第一版PPT成本，列为阶段二探针；明确区分原生可编辑对象、图片层与整页截图。
5. 不引入OpenDesign全部daemon、Agent adapter、协作云或独立历史系统；与Nomi已有pi、TargetRef/PreconditionSet、统一提交/undo和Electron预览协作。
