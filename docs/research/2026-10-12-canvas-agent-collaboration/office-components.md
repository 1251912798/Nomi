# 文件与展示组件核验

核验日期：2026-10-12。范围：官方文档、官方仓库源码、GitHub 官方 API；只读调研，未安装、运行或测量这些组件。文中的“建议”是选型判断，“支持”限于核验到的公开接口与源码，不代表 Nomi 已接入或任意 Office 文件保真。

后续新增核验更新：OpenDesign 提供了 HTML slides + dom-to-pptx 路线，主方案已将它作为 M2 默认候选，以减少自研幻灯片模型。本文的 PptxGenJS/docx 原生生成路径保留为满足特定交付要求的条件选项，不是要求首轮先建另一套编辑模型。最终阶段建议以 [主方案](../../plan/2026-10-12-canvas-agent-collaboration.md) 和 [OpenDesign 源码笔记](opendesign.md) 为准。

## 建议先做什么

第一版反馈闭环使用 Nomi 已有 HTML / Markdown 产物能力。Office 组件不应成为精准评论实验的前置条件。文档的内部对象、评论目标、版本关系属于同一条协作链路；文件只是可以导出的结果。

后续扩展优先顺序：

1. 结构化表格需要公式、选区、少量直接编辑时，优先接 Univer OSS Sheets。保持其原生 snapshot 为内部真源。SheetJS CE 只承担受限数据交换，不能承担 Excel 计算或任意文件保真回存。
2. 原生生成演示稿/文档时，按真实交付需求选 PptxGenJS / docx JS 导出。保留带稳定对象 ID 的内部模型及预览映射，局部修改内部模型后重新导出。不要将导出的 PPTX/DOCX 再解析为同一模型作为默认编辑循环。
3. 对用户导入的已有 Office 文件，优先做 iOfficeAI/OfficeCLI 能力试验：它已有跨格式结构读写和 PPT 预览到元素路径的映射。若实测符合样本要求，可作为 Office 文件适配器，替代我们自写 OOXML 修改器。试验通过前，不承诺通用保真编辑。
4. PDF.js 是通用 PDF 展示候选；docx-preview 是 DOCX 阅读候选。它们不是 Office 回存引擎。LibreOffice headless 是需要 Office→PDF 预览时的独立可选依赖，不进入第一版必装清单。

这是分阶段采用的建议，不是同时安装所有库。尤其不要并行建立 OfficeCLI、PptxGenJS、docx JS 三套相互竞争的“同一种成果”修改真源；每类成果选定一个真源和执行路径。

## 组件结论表

| 组件 | 已核验能力 | 不应承诺 | 运行/接入成本 | 决策 |
|---|---|---|---|---|
| PptxGenJS，MIT | JS/TS 添加 slide、text、shape、image、table、chart，输出 PPTX；对象支持 `objectName` | 官方 Wiki 明列不导入已有 PPT/模板；不是 PPT 预览器；不保证 HTML 预览与 PowerPoint 排版完全一致 | Node/浏览器；Nomi Electron 可在本机执行。仍需内容布局、字体、溢出检查、实际打开验证；已核验 package 有 JSZip 等依赖，不能写成零依赖 | 原生演示稿导出候选；已有文件编辑不要用它 |
| docx JS，MIT | Node/浏览器生成 DOCX；Packer 输出 OOXML ZIP；patcher 按模板 placeholder 替换内容 | placeholder patch 不等于任意 Word 文件选择、修改、保真回存；不提供 Word 级分页渲染 | JS/TS 接入较直接；内部文档到 DOCX 的映射、样式、分页仍需验证 | 需要 Word 交付时才加 |
| Univer OSS，Apache-2.0 | 工作簿、选区、公式、编辑、命令/Facade API、snapshot；插件式组合，可减轻 UI | Office 文件 import/export 不是 OSS core 自带免费能力；通用 Office 保真不是默认成立 | 浏览器/Node；需统一包版本、样式/语言包、销毁与懒加载、模型保存。Pro 文件交换引入授权与服务端转换 | 表格达到真实需求时的首选完整引擎 |
| SheetJS CE，Apache-2.0 | 读写 XLSX/CSV 等、提取数据、保存公式表达式 | 不自动计算公式；不是表格 UI/计算引擎；不能凭一个 read→write 就宣称任意 Excel 保真 | 浏览器/Node；官方安装渠道与 npm 老包需分清；映射越多承担的格式维护越多 | 受限导入/导出适配器；可仅先做 CSV |
| PDF.js，Apache-2.0 | PDF 页渲染、viewport、文本、批注读取 | 不能从 PDF 选择自动得到原 PPTX shape ID；不是 Office 源文件编辑器 | Web worker 与本地资源加载需处理；当前源码 Node 要求与浏览器集成要求需分开核对 | 有 PDF 阅读需求时加 |
| docx-preview，Apache-2.0 | DOCX→HTML；支持分页、页眉页脚等展示选项 | 官方明确受 HTML 能力限制；parse/render 内部 API 是实验性；不是编辑和 DOCX 序列化器 | 浏览器、JSZip；字体与布局差异、长文档性能需样本验证 | 已有 DOCX 阅读候选 |
| iOfficeAI/OfficeCLI，Apache-2.0 | Office DOM 结构读写、选择器、JSON、HTML 预览；PPT HTML 携带 `data-path` | README 的高保真声明尚未本轮运行证实；任意样本、不支持对象、外部改写后锚点不能默认可靠 | 自包含 native binary，构建用 .NET 10；Mac/Linux/Windows 多架构分发。截图还用 headless browser；需要固定版本、打包/签名/进程生命周期验证 | Office 文件执行适配器优先实验 |
| LibreOffice，MPL-2.0 主许可及其他依赖许可 | headless、`--convert-to`，Office→PDF 等格式转换 | PDF 预览不能当作可逆 Office 模型；Microsoft Office 排版等价不能默认承诺 | 独立应用运行时、字体、可写 profile、转换隔离、平台打包 | 延后可选，不作为精确评论核心 |

来源：PptxGenJS [README](https://github.com/gitbrent/PptxGenJS/blob/3c9ec1b687c174952166f6a34b5e87ebf69fa469/README.md)、[package](https://github.com/gitbrent/PptxGenJS/blob/3c9ec1b687c174952166f6a34b5e87ebf69fa469/package.json#L40-L45)、[未实现功能](https://github.com/gitbrent/PptxGenJS/wiki/Unimplemented-Features)；docx [README](https://github.com/dolanmiu/docx/blob/c9be7acae6146b3176443522fd5b87bcf6b48c53/README.md)、[patcher](https://github.com/dolanmiu/docx/blob/master/docs/usage/patcher.md)、[Packer](https://docx.js.org/api/classes/index.Packer.html)；Univer [OSS/Pro 边界](https://github.com/dream-num/univer/blob/7166c69a645c999aae3fe94a82cc7ce256156dcc/README.md)、[文件交换](https://docs.univer.ai/server/import-export)；SheetJS [公式](https://docs.sheetjs.com/docs/csf/features/formulae)、[安装](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)、[许可](https://github.com/SheetJS/sheetjs/blob/github/LICENSE)；PDF.js [README](https://github.com/mozilla/pdf.js/blob/da955579242453e4441fb3a9365aba1715551320/README.md)、[API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html)；docx-preview [README](https://github.com/VolodymyrBaydalka/docxjs/blob/c533f383069008d4a1e05c6171ef8777fd078385/README.md)；OfficeCLI [README](https://github.com/iOfficeAI/OfficeCLI/blob/699cafbc8f0b8a7841c6cca53dafd0c24e982f56/README.md)、[csproj](https://github.com/iOfficeAI/OfficeCLI/blob/699cafbc8f0b8a7841c6cca53dafd0c24e982f56/src/officecli/officecli.csproj)；LibreOffice [CLI](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html)、[许可](https://www.libreoffice.org/licenses/)。

## 精准评论真正需要的格式映射

下面是我们的建议，不是所有组件已提供的统一接口。

| 载体 | 可获得的锚点 | 我们需要补的连接 | 避免的错误 |
|---|---|---|---|
| 原生 HTML | 系统赋予的稳定元素 ID + 文本引用 | 受控 preview→host 选择桥、版本检查、删除后的失效提示 | `nth-child`、坐标、显示文本单独作为永久 ID |
| 原生文档 | 文档模型 block ID + 文本范围 | 修改事务中的范围映射、引用快照、重新定位 | 每次整段替换后继续使用旧 offset |
| 原生演示稿 | 内部 slide ID / object ID；导出可用 `objectName` | 内部对象→预览元素→导出对象的对应表 | 把 slide 数组下标或 PowerPoint 对象名当成全球唯一身份 |
| Univer 表格 | workbook unit / sheet ID / range | 范围与行列结构操作之间的映射；必要时业务行 ID | 插入行后仍把旧 A1 地址解释为同一业务记录 |
| OfficeCLI PPT | HTML 元素 `data-path` 与 CLI 元素选择器 | 将点击路径包装为绑定文件版本的目标，重新读取/校验后才修改 | 不绑定版本的 `/slide[2]/shape[3]` |
| PDF | 文件版本 + page + viewport 变换后的区域/文本引用 | 只读反馈上下文；有原始源和映射时才升级为可执行目标 | 声称一个 PDF 矩形能可靠反推出 PPTX shape |
| docx-preview | HTML 中的阅读位置/选中文字 | 若需要可执行修改，还需原始 DOCX 结构映射或仅标记为版本内引用 | 将其内部 DOM 永久视为 Word 对象树 |

PptxGenJS 的 `objectName` 定义见 [types/index.d.ts#L1279](https://github.com/gitbrent/PptxGenJS/blob/3c9ec1b687c174952166f6a34b5e87ebf69fa469/types/index.d.ts#L1279-L1289)。它提供对象命名能力，但名字唯一性、跨版本身份、预览映射仍需我们管理。

### OfficeCLI 的新发现：可以减少自写的预览映射

已核验的当前源码会为 PPT 顶层元素生成路径，优先使用对象 ID，缺失时退回位置；HTML shape 将路径写入 `data-path`。这是“画面上点中对象→Agent 用结构工具改对象”非常直接的复用点。见 [路径生成](https://github.com/iOfficeAI/OfficeCLI/blob/699cafbc8f0b8a7841c6cca53dafd0c24e982f56/src/officecli/Handlers/Pptx/PowerPointHandler.HtmlPreview.cs#L664-L678)、[HTML 属性](https://github.com/iOfficeAI/OfficeCLI/blob/699cafbc8f0b8a7841c6cca53dafd0c24e982f56/src/officecli/Handlers/Pptx/PowerPointHandler.HtmlPreview.Shapes.cs#L41)。

但组内对象目前不拥有独立 `data-path`，点击会选中整个组；源码明确写出嵌套 ID 路径解析限制。见 [group 处理](https://github.com/iOfficeAI/OfficeCLI/blob/699cafbc8f0b8a7841c6cca53dafd0c24e982f56/src/officecli/Handlers/Pptx/PowerPointHandler.HtmlPreview.Shapes.cs#L2293-L2297)。所以应先实验“顶层对象评论”，不直接承诺任意嵌套对象可选。

此机制的存在不能推导出 HugAgentOS 已有完整精准评论。它只说明我们不必从零编写所有 Office 预览选择桥。

## HugAgentOS 值得学习与不该照搬的地方

它把 Agent 操作文件与前端展示分开，这是好的路线。Office skills 已指导先读结构、按对象名/ID 定位、修改、flush，再用目标展示程序验证；这比让 Agent 无约束重建整个文件更适合反馈闭环。[PPT skill 固定版本](https://github.com/ZJU-REAL/HugAgentOS/blob/a07b9f74919f518ea907112bb78c50dc37e99349/src/backend/skill_bundles/default/officecli-pptx/SKILL.md#L226-L332)

但它当前的 Excel 保存不是通用保真链路。主路径从 Univer 读 `getValues()`，再用 SheetJS `aoa_to_sheet` 创建新工作簿；备用路径只取 cell 的 `v`。这能交付数据表，却没有在该保存路径保留完整公式、样式、图表等原始结构。[导出源码](https://github.com/ZJU-REAL/HugAgentOS/blob/a07b9f74919f518ea907112bb78c50dc37e99349/src/frontend/src/components/canvas/UniverSpreadsheet.tsx#L40-L107)

导入映射也是有意受限：映射部分 cell、宽高、合并字段，工作簿 `styles: {}`。不能把这个例子描述成“Univer OSS + SheetJS 免费实现任意 Excel 保真回存”。[导入源码](https://github.com/ZJU-REAL/HugAgentOS/blob/a07b9f74919f518ea907112bb78c50dc37e99349/src/frontend/src/utils/xlsxPreview.ts)

它的 DOC/PPT PDF 预览要找本机 LibreOffice 并调用转换，缺失时直接报无法预览。这也说明“前端很轻”不意味着没有后端/本机运行依赖。[转换源码](https://github.com/ZJU-REAL/HugAgentOS/blob/a07b9f74919f518ea907112bb78c50dc37e99349/src/backend/api/routes/files.py#L228-L282)

## 原生生成与已有文件修改必须分开

原生生成：我们控制对象模型和身份，Agent 修改模型，预览和导出从同一版本派生；这是最容易保证评论连续性的路径。导出库负责通用格式编写，我们仅承担业务内容、目标映射和版本语义。

已有 Office 文件：先保存不可变原件，再解析支持的结构和生成预览；精准评论只对已映射对象开放。修改在副本上执行，验证后生成新版本。遇到不支持结构、无法定位、外部程序重写身份时，要明确报告当前能力边界。保留原文件作为附件供下载与对照，不静默降级成一份外观类似但结构损失的新文件。

PDF：可始终作为阅读和反馈对象；只有原始源文件及经过验证的来源映射存在时，才应作为 Agent 可执行修改目标。PDF page/rect/text 与 PPT/DOC 源对象之间通常不是天然一一对应。

## 本机依赖、维护与许可证检查结果

| 项目 | 此次固定源码 SHA | 默认分支最新提交时间（UTC） | 说明 |
|---|---|---|---|
| PptxGenJS | `3c9ec1b687c174952166f6a34b5e87ebf69fa469` | 2025-06-26 | API 查到未归档；默认分支较久未提交，不凭 stars 断言活跃维护，也不凭时间直接判定不成熟 |
| docx | `c9be7acae6146b3176443522fd5b87bcf6b48c53` | 2026-10-10 | 未归档 |
| docx-preview/docxjs | `c533f383069008d4a1e05c6171ef8777fd078385` | 2026-09-21 | 未归档 |
| PDF.js | `da955579242453e4441fb3a9365aba1715551320` | 2026-10-11 | 未归档；源码 package 的 Node engines 是 `>=22.22.3 || >=24.15.0 || >=26.0`，不能据浏览器可用推导当前 Node runtime 可直接跑 |
| Univer | `7166c69a645c999aae3fe94a82cc7ce256156dcc` | 2026-10-10 | 未归档；OSS 与 Pro 独立边界需保留 |
| OfficeCLI | `699cafbc8f0b8a7841c6cca53dafd0c24e982f56` | 2026-10-09 | 未归档；源码可获取，使用 DocumentFormat.OpenXml，构建目标 net10.0 |

维护元数据来自各仓库 `https://api.github.com/repos/{owner}/{repo}` 与 `/commits/{default_branch}`；原始响应摘要保存于 `本轮临时源码缓存（未纳入仓库）`。它只是此次维护状态快照，不代替兼容性和安全检查。

Univer 官方当前文档明确：Office 文件转换模块是 `@univerjs-pro/exchange-node`，snapshot import/export 也需要 server-side conversion。可以部署在自己的后端/本机服务不等于已经确认 Electron 随包可用；具体授权、平台、版本应在选型试验核对。[官方交换架构](https://docs.univer.ai/server/import-export)

SheetJS 官方指出 npm `xlsx` registry 的最新包仍是 0.18.5，CDN 才是官方当前模块来源；当前文档示例为 0.20.3。不要直接复制 HugAgentOS 的 `xlsx: ^0.18.5` 作为新集成方案。[安装来源说明](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)

另有两个同名项目，必须区分：本报告推荐试验的是 [iOfficeAI/OfficeCLI](https://github.com/iOfficeAI/OfficeCLI)，npm 对应 `@officecli/officecli`；[officecli/officecli](https://github.com/officecli/officecli) 是另一套 AI 生成发行与技能包装项目，其 README 说明并不包含完整实现，还带 hosted/external generation 模式。不能因为名字相同就当作同一开源引擎。

本轮未报价、未测量包体/速度，也未确认 Windows 与签名后的 Electron 运行行为；这些应成为接入试验检查项。

## 最少需要自己做的东西

组件应承担渲染、Office 编码、表格计算、基础选择、文本编辑事务；我们只做以下跨成果的产品语义：

- 成果、版本、源文件/派生预览的关系。
- 从可视选择得到带版本的目标，保留引用与截图等上下文。
- 评论如何成为 Agent 修改请求，如何显示待确认、失败、取消和目标失效。
- 基于当前版本的修改事务、冲突拒绝、结果对照和恢复。
- 多成果依赖变化的影响提示，且没有用户/任务授权时不擅自更新其他成果。

初始接口不应该要求每个适配器都提供同样深度。能力可明确为 `preview`、`select`、`patch`、`export`。PDF 可能只有 preview/select；原生 HTML 有全链路；Office 文件只对实际支持的对象提供 patch。这样可复用成熟组件，同时不把未知格式能力伪装成已经解决。
