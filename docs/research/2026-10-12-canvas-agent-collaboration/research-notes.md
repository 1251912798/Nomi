# 多成果画布：轻编辑、精准反馈、Agent 执行

📎 早期研究记录：保留原始证据边界；新增 OpenDesign 后的选型以 [正式方案](../../plan/2026-10-12-canvas-agent-collaboration.md) 为准。
调研日期：2026-10-12（Asia/Taipei）。对象：Doop、Onlook、AFFiNE、ashark-ai-05/OpenCanvas、HugAgentOS，以及当前 Nomi 工作树。

这是产品与架构建议，未实施。证据为官方文档和固定 commit 的源码检查；没有安装运行这五个应用、没有体验登录后的真实生成，也没有用真实 Office 文件验证导入/导出保真。文中“源码观察”“推断”“建议”分开陈述。

## 判断

这个方向值得验证。它可以把人的工作集中在看成果、指问题、简单直接修改与验收，把批量编辑与复杂生成交给 Agent。可行性的关键不是支持多少文件后缀，而是人指到的对象、Agent 修改的对象、修改后的对象始终对应。

五个项目各自实现了部分机制；本次没有找到一个能据此确认已经完整解决“多种成果、精准批注、跨版本定位、Agent 局部修改、用户确认、可靠撤回”的现成底座。建议复用 Nomi 的外层画布、已有渲染器、资产文件、能力入口和撤回边界，补上这条协作链路。不要为接入某个项目更换整个编辑器/画布/Agent 框架。

## 五个项目的实质

### Doop：最接近反馈驱动 Agent

核验 SHA：`1e9136dc0a837452821c837c0ea6cd7c9d140fb8`。

源码观察：每个 Frame 保存 HTML，sandbox iframe 承载预览。内置 runtime 通过 postMessage 接收 HTML、对 DOM 更新、查询鼠标命中的元素、返回元素片段和位置。宿主按 iframe window 和请求 ID 验证回复来源。评论保存 frameId、CSS selector、HTML snippet、正文、回复和处理状态；普通评论是人的讨论，@角色才成为内置 Agent 任务。MCP 可以读取/回复/resolve 评论，局部修改使用 exact find/replace，并要求旧文本恰好出现一次。

可以借：评论就是带对象上下文的反馈；无需引导用户把视觉对象重新描述一遍；普通讨论和执行请求分开；Agent 工作状态就地呈现；局部修改后用截图检查结果。

需要补强：无 id 的元素使用 nth-of-type 路径。依据算法推断，插入同类兄弟节点可能使旧 selector 指到别的元素；本轮没有运行复现。评论字段也不是完整的目标版本合同。客户端 history 是最多 100 条的本地编辑逆操作，不能据此确认 Agent 的服务端写入都能作为用户一键撤回。MCP resolve 表示线程关闭，也不能替代人的验收。

源码：[runtime](https://github.com/kgoedecke/doop/blob/1e9136dc0a837452821c837c0ea6cd7c9d140fb8/src/lib/frameRuntime.ts)、[bridge](https://github.com/kgoedecke/doop/blob/1e9136dc0a837452821c837c0ea6cd7c9d140fb8/src/lib/frameBridge.ts)、[评论与执行](https://github.com/kgoedecke/doop/blob/1e9136dc0a837452821c837c0ea6cd7c9d140fb8/server/actions.ts)、[MCP](https://github.com/kgoedecke/doop/blob/1e9136dc0a837452821c837c0ea6cd7c9d140fb8/server/mcp.ts)、[history](https://github.com/kgoedecke/doop/blob/1e9136dc0a837452821c837c0ea6cd7c9d140fb8/src/lib/history.ts)。

### Onlook：把看见的元素变成可修改的源码目标

核验 SHA：`423e2e924366419e418ee049093872d535eea41a`。

源码观察：开发时给 JSX 元素注入 data-oid，把运行中的 DOM 与源文件 AST、组件实例关联；选择元素后，Agent 上下文包含文件位置、代码、oid、branchId 等。这是可见对象到可执行修改的桥。它公开仓库是视觉代码编辑器；README 明确另外的新 hosted 产品在 early access，不能混同其完成度。评论在 README 未完成清单中，本轮不能认定已有精准评论闭环。

可以借：对象身份来自内容/源码，渲染器负责把它显露给选择工具；Agent 不靠截图猜文件位置。对任意网页/React 应用的编辑，应单独接这类受控开发运行环境。

不宜照搬：我们自己的 HTML/Markdown 成果不需要完整 Next.js 项目、容器、分支和 AST 工程栈。自由网页编程与普通文档反馈应按需求选择能力，不必让每个成果都变成一个软件项目。

详细源码路径与限制见同目录 [Onlook 源码笔记](onlook.md)。

### AFFiNE：同一内容多视图、分类型锚定、审阅后采纳

核验分支 canary，SHA：`0b69a6da21e8fd35beb85667bb8496d9b3852238`。

源码观察：文档与白板共享 block model 和稳定 block id。文本评论通过 Y.Text delta 格式属性标记选区；块/图片评论在 block props；白板对象评论在 element model。评论服务与具体展示解耦。AI diff 可逐项接受/拒绝。Agent 读取画布可以先 overview，再按 frame、元素或区域精读，分页绑定 revision。

重要边界：有一条 replaceFromMarkdown 路径先删块再重建，并恢复首个新块的旧 id；该路径没有显式迁移旧 comments 和原 Y.Text 格式，因此“块 id 保留”不足以证明文本批注连续。Yjs 处理并发操作，并不自动解决 Agent 按旧内容覆盖人的新编辑。服务端 Agent delta 是否进入用户本地撤回单元也需明确设计。

可以借：同一成果在画布缩略视图与专注视图共享身份；评论协议统一，锚定由各内容类型负责；Agent 采用概览→局部读取；视觉 diff 与采纳分开。

不宜照搬：BlockSuite/Lit/Yjs/DI 的完整编辑器底座与 Nomi React/Zustand/React Flow 重叠。单人第一版不需为了评论引入完整多人协作系统。

详细源码与协议边界见同目录 [AFFiNE 源码笔记](affine.md)。

### OpenCanvas：带类型的组件协议，而非一种万能 HTML

核验 SHA：`8e50f7fc3d0de047c531ac9be5e37255aa9615ec`。

源码观察：tldraw 无限画布承载 typed widget；schema 定义数据，组件负责呈现，Agent 有读取、创建、更新组件的工具。现有更新更偏整 payload 更新，未发现元素级评论协议。可动态注册 iframe 插件，但插件描述符是进程内状态，重启恢复需要额外设计。画布历史是 localStorage 粗快照，不等同每个成果持久化版本链。

可以借：每类成果声明自己的数据、渲染、可选择对象和可执行动作，Agent 只用受约束工具。表格和图表应尽量保留结构数据，避免都生成一张不可计算的 HTML 图片。

不宜照搬：不应再引入第二套 tldraw 外层画布；动态生成并注册任意插件不作为第一版能力。仓库 MIT 与依赖许可证是两回事，生产引入 tldraw 需独立核验对应版本许可。

### HugAgentOS：生成文件与文件预览分层

核验 SHA：`a07b9f74919f518ea907112bb78c50dc37e99349`。

源码观察：其 canvas 是聊天右侧文件预览面板，并非无限空间画布。Word 用 docx-preview，PPT 经转换预览，Excel 用 Univer；Agent 在 sandbox 中生成 Office 文件，再通过 artifact 存储流交付。这个分层能避免自己做每种文件的完整编辑器。

重要边界：没有证据表明这些预览已具备通用的元素级评论→Agent 修改映射。Excel 保存路径重建数据，需要用真实文件验证公式、样式等是否完整保留；文档的“公式可编辑”不足以证明回存保真。当前 LICENSE 有竞争性 SaaS 与品牌要求，不能按纯 Apache 宽松项目理解。文档中关于 advanced 依赖的描述与本轮 HEAD package.json 不一致，应以实际代码为准。

可以借：生成、保存、预览、导出分别负责；每种格式诚实声明能看、能改、能回存到什么程度。Office 文件作为导入/导出能力，不强迫所有日常交互直接围绕二进制文件进行。

两个项目的详细源码证据见同目录 [OpenCanvas / HugAgentOS 源码笔记](opencanvas-hugagentos.md)。

## Nomi 的现有入口与缺口

本轮核验本地 SHA：`6d28f3863244edbdf6e013bea33d26baff0f9615`。没有刷新远端或修改代码，不宣称代表最新 origin/main。

已有：

- `agent-artifact` 是同一节点壳里的成果预览；类型包括 svg/html/markdown/table/text/glb，Agent 文本交付通道不包含 glb。
- `make_artifact` 接受完整文件内容，创建成果；不是现有成果的通用 patch 工具。
- 创作文本已有选区读取和替换，底层已有 Tiptap/ProseMirror。
- 画布已有统一文档提交口、changeId/撤回事件链，生产 Run 已有 artifactId/version/contentHash/来源关系。

缺口：

- 产物节点自身 meta 主要只有 fileType/url/可选 agentRunId，没有通用的元素锚点、持久化评论和针对版本的局部修改合同。
- `ProductionArtifact` 是 run 所属的生产制品，kind 是影视工作流闭集；不能直接假定它已经是任意文档/网页的通用成果仓库。
- 静态 HTML table 不等同 Excel；HTML srcdoc 继承宿主 CSP，当前界面明标内联脚本交互限制。受控选择桥也要解决此运行边界，不能仅加 allow-scripts 或放宽全局 CSP。

主要入口：`src/workbench/generationCanvas/model/artifactMeta.ts`、`nodes/artifact/ArtifactBody.tsx`、`electron/shared/agentCapabilities/verbs/writeVerbs.ts`、`src/workbench/generationCanvas/store/canvasDocumentCommit.ts`、`events/canvasUndoJournal.ts`、`electron/productionRun/productionRunTypes.ts`。

## 建议的产品体验

用户提一个工作目标，Agent 在画布上交付文档、网页和演示稿。用户双击进入专注预览；选中文字/元素/一页/区域，直接说问题。反馈旁边能看见待处理、执行中、待确认或失败；Agent 修改完呈现改动位置与前后结果，用户可继续评论或撤回。短文字修改、替换图片、调顺序等低成本动作允许直接操作。

评论是反馈载体，是否要求执行是独立意图。在“让 AI 修改”入口里直接提交就是执行；普通讨论评论保留为讨论，不额外逼用户学习任务系统。Agent 完成执行后，先标为待确认；人的满意由人决定。

画布负责多成果并排、关系、比较。精细阅读/批注/简单修改使用同一成果的专注视图，避免在很小的节点里嵌满工具栏。专注视图不是副本。

## 建议的技术分工

1. **成果身份与版本。** 画布节点引用 artifact identity/current revision；文件是内容，节点是视图。来源与派生成果记录关系。先审计现有项目资产与 Run 制品的所有权，抽取最小共享身份/版本能力，避免再造第二套制品账本，也避免要求一份便签必须启动影视 ProductionRun。
2. **每类成果薄适配器。** 共用预览/选择/读取局部/应用补丁/导出协议，具体由 Markdown、HTML、演示稿、结构化表格各自适配。内容自身保留原生结构，不造一个能描述全世界的统一 JSON。
3. **分类型锚点。** HTML 用稳定元素 ID；文档用 block id 加选区；演示稿用 slideId/shapeId；表格用 sheetId/行列身份或明确绑定版本的单元格范围；图片/PDF 用版本绑定的区域，视频用版本加时间区间。坐标是呈现信息，不作为所有格式唯一身份。锚点附创建版本与选中内容证据；无法确认对应关系时显示待重定位，禁止偷偷猜到另一个对象。
4. **受控预览与选择桥。** HTML 需要宿主拥有的选择 runtime，通过受约束消息协议上报对象和位置。它不获得文件、命令、网络或 Electron IPC 权限。独立预览执行上下文和现有 COOP/COEP/CSP 要先做技术探针验证；精确选中不等于必须开放所有产物脚本。
5. **Agent 修改合同。** 先读取当前成果和所选局部，再提交带 baseRevision、目标身份、预期旧内容的 patch。版本不符就重新读取；补丁局部应用、结构校验、渲染验证后才能生效。JSON 对象的原子 patch 可参考 RFC 6902；文字锚定可参考 W3C Web Annotation，不自造通用标准。
6. **结果检查与撤回。** 一次修改绑定一个 changeId/可撤回事务。新内容先作为新版本保存，引用切换成功才算生效；不能覆盖唯一原文件。Agent 验证结果和用户确认分开。画布撤回、文件版本与评论状态需一并验证，不应另起一个 UI 层私有撤回栈。
7. **上下文按需读取。** 全局概览只提供成果标题、类型、关系、状态；针对选中对象再取局部内容与截图。不要每次把所有节点全文塞进 Agent。

标准来源：[W3C Web Annotation](https://www.w3.org/TR/annotation-model/#selectors)、[JSON Patch RFC 6902](https://www.rfc-editor.org/rfc/rfc6902.html)。标准提供表达/操作语义，不自动保证跨版本锚定、渲染保真或应用事务正确性。

## 先做哪一段

第一段验证：HTML + Markdown，两种现有能力，完成精准反馈→局部修改→对照→撤回→重开恢复。使用真实的一份产品说明文档与一个落地页；批量提出三轮修改，其中包含重复文字、插入相邻元素、删除被评论对象、用户与 Agent 同时修改、Agent 执行中取消。

第二段扩展：分页演示稿和简单结构化表格。演示稿可共用 HTML 渲染技术，但保留页和元素身份；表格保留数据与必要公式。两者都接同一反馈链路。HTML 演示稿不等于已支持可编辑 PPTX；展示表格也不等于 XLSX 保真。

第三段按需求接入：Office/PDF 导入导出、任意网页工程运行、多人协作、跨成果依赖更新。每项都有真实用户工作量再做；不在第一段引入完整 React 工程 IDE、多人 CRDT 或任意动态插件。

这是一套分阶段建议，不给未经实现探针和真实任务验证的工期承诺。

## 验收建议（尚未测量）

- 构建至少 12 个真实编辑任务、每个三轮反馈；记录锚定正确率、首次修改接受率、局部修改对其他内容的影响、完成时间、用户重复解释次数、token/工具成本。
- 同时用“聊天描述位置”和“指着成果反馈”完成可比任务，证明精准反馈实际减少解释与返工。
- 错目标修改、旧版本静默覆盖、撤回失败、重开丢评论为阻断项；首批验收样本中不得发生。样本零失败不外推为生产绝对可靠。
- 格式正确性单独验证：真实 PPT 分页/字体/布局，真实表格公式/样式/合并单元格/多工作表。先声明明确支持范围，再验收导出。
- Agent 的“工具成功”不等于人满意，也不等于视觉正确。需要渲染后检查，并保留用户确认环节。

## 复用判断

优先借 Doop 的反馈工作方式、Onlook 的对象映射、AFFiNE 的身份/评论解耦与局部读取、OpenCanvas 的带类型能力声明、HugAgentOS 的文件生成和预览分层。生产代码复用前逐文件与逐依赖核验许可证：Doop AGPL、Onlook Apache-2.0、AFFiNE 混合范围、OpenCanvas 项目 MIT 但 tldraw 依赖另有条款、HugAgentOS 附额外商业限制。这是源码披露范围的观察，不构成法律意见。

最先验证的核心承诺：用户可以直接指着成果说问题，Agent 连续多轮准确地改到那里，其他已满意的内容保持稳定，并且改错可退。
