# OpenCanvas 与 HugAgentOS 源码核对（2026-10-12）

证据边界：GitHub API 核验 HEAD，定点读取官方仓库源码/文档；没有启动两个产品、没有真实生成、没有验证 Office 格式保真或实际鼠标流程。源码摘取保存在 `本轮临时源码缓存（未纳入仓库）`。文档与代码不一致处以下以当前源码为准。

## OpenCanvas：成果作为画布对象，值得借鉴协议，不宜搬整个底座

- 仓库： https://github.com/ashark-ai-05/opencanvas
- 核验 SHA：`8e50f7fc3d0de047c531ac9be5e37255aa9615ec`。
- 真无限画布：tldraw 自定义 shape；Agent 的输出优先是 `place_widget` typed payload，再由 zod 校验、前端 dispatcher 映射 shape。15 kinds 的 README 描述可由 payload/schema 和 renderer 代码印证，不是仅把 Markdown 塞入一个侧栏。
- 工具协议包含 `place_widget`、`read_canvas`、`read_widget`、`update_widget`、`link_widgets`、`focus_widget`、`register_widget_kind` 等。`update_widget` 当前支持整 payload 替换，或 composite 追加 sections。没有发现基于具体元素/段落的 patch 或 expected-version 参数；工具里提到 ticket comments 是内容例子，不能算精准评论能力。
- canvas snapshot 向 Agent 提供 id/kind/role/title/payload/selectedIds；这是“AI 能知道用户选了哪些成果”的低成本基础，但 selection 只到 widget。
- runtime 插件：注册 kind/label/description/iframe srcdoc/defaultSize；props 初次注入 `window.opencanvas.props`，后续经 `postMessage` 更新。现有 renderer 仅 iframe，vega-lite/web-component 是代码注释中的未来计划，不能写已实现。
- 插件注册表是 backend 进程级内存，跨会话共享、进程重启即忘记。前端缓存经 SSE 镜像；持久化的 plugin shape 在缺少 renderer 时显示 Plugin not registered。对 Nomi 的启发是“显示协议＋typed data”，但 Nomi 若采用须将 renderer 版本/资产依赖和产物一起保存。
- 当前 canvas 用 localStorage snapshot 保存；history 每会话最多 50 份粗快照，quota 失败静默丢持久化。这不够承担正式成果的 revision、批注迁移、版本恢复。
- export 支持 canvas PNG 和尽力 Markdown 序列化；这里不是 Office 通用导出引擎。
- 安全：plugin iframe 默认 `allow-scripts` 不带 `allow-same-origin`；descriptor 可显式加 flags。插件可载 CDN 脚本，另有 plugin-fetch proxy。README/SECURITY 与 proxy 源码存在漂移：SECURITY 称可达私网，当前 proxy 源码有 private/loopback/DNS 检查。只能说有隔离意图与代码，不保证安全。Nomi 应保持产物 iframe 与宿主资产/Agent 工具隔离，用窄消息协议、能力授权和网络策略。
- 项目代码 MIT；tldraw 是独立依赖。当前官方 SDK 许可页明确商业生产需商业许可，不能因上层项目 MIT 推导整套可免费商用；当前 package 依赖 `tldraw ^3.0.0`，若实际复用还须核对锁定版本条款。Nomi 已有 React Flow，不建议为这个方向迁移 tldraw。

关键源码：
- typed payload: https://github.com/ashark-ai-05/opencanvas/blob/8e50f7fc3d0de047c531ac9be5e37255aa9615ec/src/agent/payloads.ts
- place/update: https://github.com/ashark-ai-05/opencanvas/blob/8e50f7fc3d0de047c531ac9be5e37255aa9615ec/src/agent/tools/update-widget.ts
- snapshot: https://github.com/ashark-ai-05/opencanvas/blob/8e50f7fc3d0de047c531ac9be5e37255aa9615ec/src/agent/canvas-snapshot.ts
- runtime registration: https://github.com/ashark-ai-05/opencanvas/blob/8e50f7fc3d0de047c531ac9be5e37255aa9615ec/src/agent/tools/register-widget-kind.ts
- registry lifetime: https://github.com/ashark-ai-05/opencanvas/blob/8e50f7fc3d0de047c531ac9be5e37255aa9615ec/src/backend/widget-registry.ts
- iframe/props: https://github.com/ashark-ai-05/opencanvas/blob/8e50f7fc3d0de047c531ac9be5e37255aa9615ec/app/src/canvas/shapes/plugin.tsx
- history: https://github.com/ashark-ai-05/opencanvas/blob/8e50f7fc3d0de047c531ac9be5e37255aa9615ec/app/src/state/canvas-history-store.ts
- export: https://github.com/ashark-ai-05/opencanvas/blob/8e50f7fc3d0de047c531ac9be5e37255aa9615ec/app/src/canvas/export.ts
- proxy: https://github.com/ashark-ai-05/opencanvas/blob/8e50f7fc3d0de047c531ac9be5e37255aa9615ec/src/backend/routes/plugin-fetch.ts
- SDK 商用许可（当前官方）：https://tldraw.dev/community/license

## HugAgentOS：证明生成、预览、少量手改可拆开，但不是空间画布底座

- 仓库： https://github.com/ZJU-REAL/HugAgentOS
- 核验 SHA：`a07b9f74919f518ea907112bb78c50dc37e99349`。
- canvas 是聊天右侧可开多 tab 的文件面板（源码 `CanvasPanel.tsx` / `canvasStore.ts`），不是节点无限画布。
- Word：`.docx` 前端 docx-preview；PPT：后端 LibreOffice headless 转 PDF，再前端 PDF 预览。PDF/images/text/Markdown/HTML 分类型显示。扩展名识别接受老 `.doc` 不能证明 docx-preview 实际支持旧二进制 doc，尚未运行验证。
- Excel：worker 用 SheetJS 读取，转 sparse Univer workbook；动态加载免费 core preset，提供单元格/公式编辑、dirty/save 与覆盖同 file_id 的链路。文档声称仍有 advanced 商业依赖，但当前 package 已无 advanced，只有 core/drawing/presets，不能照抄过时文档。
- **重要限制**：当前 `exportXlsx` 是 getValues 或 snapshot 的 cell.v 组二维值数组，再 SheetJS 重新建 workbook。没有看见把 formula/style/merge/chart 元数据回写的逻辑；因此“支持公式编辑”不等于“编辑后 xlsx 保真”。至少样式/合并等无法从此 values-only 分支保留；公式须实测，不能直接承诺。
- Agent Office 生成/修改走 sandbox 里的 officecli skills。技能明确先读 outline/get，再 add/set，再 save；支持 shape name/id 等 selector、按 slide 或 sheet 读取。这个路径说明可把重编辑能力放在 Agent 工具，而前端主要展示与确认。但 UI 点选位置到 officecli selector 的映射在本次检查中没发现，不能说已有精准评论。
- artifacts 和 sandbox 是分离的存储域：`sandbox_put_artifact` 复制输入进入执行环境，`sandbox_get_artifact` 从执行环境取回；workspace 只把明确 pinned 的成果持久化入表，临时中间文件不会自动成为最终附件。这比“工具产生一个路径就当成果”更扎实。
- artifact record 包括 id/user/chat/storage_key/mime/size/metadata/parsed_text 等，支持权限下载和软删除。本次检查没有确认元素级评论、不可变版本链、冲突检查；`CanvasPanel` 的 version 仅是刷新 key（openSeq/size），不是成果 revision。
- 资源保护值得借鉴：文本/HTML 2MB，xlsx 8MB，Office 20MB，PDF 30MB 的在线预览限制；worker 解析、只走 populated cells、限制 100k cells/100k rows/512 columns，切换时 abort。对多节点画布还须再加可见区域/激活时挂载，避免同时实例化大量文档引擎。
- 隔离：HTML iframe `allow-scripts` opaque origin；Agent 代码执行有 script_runner/OpenSandbox/Cube provider 协议，CE 默认轻量执行，持久容器/MicroVM 属 EE。不能把 provider 协议等同每次执行已具有 VM 级隔离。
- **许可证不是纯 Apache 2.0**：主 LICENSE 有额外 SaaS 竞争限制、不能隐藏 UI Powered by（除非商用白标许可）、商业版组件排除。建议只借鉴思路与公开机制，复用源码必须审许可证。OfficeCLI 随包许可证为 Apache 2.0；LibreOffice/Univer/SheetJS 等仍有各自依赖边界。确切成本未报价、未运行测量。

关键源码：
- 官方模块说明: https://github.com/ZJU-REAL/HugAgentOS/blob/a07b9f74919f518ea907112bb78c50dc37e99349/document/en/modules/canvas-artifacts.md
- file panel: https://github.com/ZJU-REAL/HugAgentOS/blob/a07b9f74919f518ea907112bb78c50dc37e99349/src/frontend/src/components/canvas/CanvasPanel.tsx
- Excel roundtrip: https://github.com/ZJU-REAL/HugAgentOS/blob/a07b9f74919f518ea907112bb78c50dc37e99349/src/frontend/src/components/canvas/UniverSpreadsheet.tsx#L39-L108
- PPT->PDF: https://github.com/ZJU-REAL/HugAgentOS/blob/a07b9f74919f518ea907112bb78c50dc37e99349/src/backend/api/routes/files.py#L228-L282
- Agent read artifact by sheet/slide: https://github.com/ZJU-REAL/HugAgentOS/blob/a07b9f74919f518ea907112bb78c50dc37e99349/src/backend/core/llm/tools/read_artifact_tool.py
- Office Agent commands/stable selectors: https://github.com/ZJU-REAL/HugAgentOS/blob/a07b9f74919f518ea907112bb78c50dc37e99349/src/backend/skill_bundles/default/officecli-pptx/SKILL.md#L226-L300
- Workspace pin gate: https://github.com/ZJU-REAL/HugAgentOS/blob/a07b9f74919f518ea907112bb78c50dc37e99349/src/backend/core/services/artifact_service.py
- Sandbox provider boundary: https://github.com/ZJU-REAL/HugAgentOS/blob/a07b9f74919f518ea907112bb78c50dc37e99349/document/en/modules/sandbox.md
- LICENSE restrictions: https://github.com/ZJU-REAL/HugAgentOS/blob/a07b9f74919f518ea907112bb78c50dc37e99349/LICENSE#L189-L214

## 产品/技术建议（推论，非两个项目已有能力）

1. 多成果用同一外壳，不用同一内部编辑模型。Artifact=(source,revisions,preview,anchor-map,capabilities)。节点只是 Artifact 的一个视图。
2. 预览先轻：缩略图/摘要常驻、选择时挂载大预览、专注模式处理精准评论；canvas/node 位置与成果内容版本分离。
3. 批注要携带 artifactId + revisionId + kind-specific target + quote/screenshot/context，纯 bbox 只能做视觉兜底。HTML 用 data-artifact-id/DOM selector，Markdown 用 blockId + quote，PPT 用 slideId + shapeName/id，Excel 用 sheetId + A1/named range。编辑改变布局后需 re-anchor 或明确标记 stale，不静默漂移。
4. Agent 使用 inspect(target), propose_patch(baseRevision), validate, preview_diff, commit_revision；结果是新 revision，用户可接受/拒绝/恢复，失败不覆盖最后可用成果。
5. Office 容器的展示轻不代表执行成本轻；可先以原生 HTML/Markdown 验证评论闭环，再增 PPT/表格 adapter。HTML slides 不应直接宣称可保真导入/导出任何 PPTX，Excel 尤其不能压成纯 HTML，否则公式/计算模型丢失。
6. 最小任务：生成一份资料的落地页＋演示稿；对标题和一页图表各连续修三轮；中途人工改字、移动目标、插入段落/页；检验指认稳定、局部修改不误伤、过期评论可见、取消不破坏、可复原。源码正确和 mocks 不能替代真实流程。
