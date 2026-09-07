# 「先查别人」调研报告：AI 手艺产物节点（agent-artifact）（2026-09-07）

> R27 §16 的必交物。对应方案：[`docs/plan/2026-09-06-agent-artifact-node.md`](../../plan/2026-09-06-agent-artifact-node.md)。
> 交付分支 `feat/agent-artifact-node-takeover-20260907`（PR #588，接手 #564 返工）。
>
> 补交说明（诚实记分优先）：方案在门岗上线日（2026-09-07）**之前**就已拍板并实施到走查通过，
> 这份报告是**回溯补的**。所以它的义务不是给已做的事背书，而是**如实回答"当时该查而没系统查的四问"**——
> 下面 ④ 里就有一条查完才发现的、指向下一刀的信号（生态里已经有人把这件事做成 skill 了）。

## 要回答的问题

「让 Agent **不调模型**、直接手写出 SVG / HTML / 表格 / Markdown，并把它摆到创作画布上、还能固化成
下游能吃的参考图」——这件事，**依赖里 / 仓库里 / 生态里 / 真实用户那边**，已经有正解了吗？

---

## ① 依赖里已有？

- **Markdown 渲染：已有，直接用**。`react-markdown@10.1.0` + `remark-gfm` 已是依赖，且已被包装成全仓唯一渲染器
  `NomiMarkdown`（[`src/workbench/common/NomiMarkdown.tsx:3`](../../../src/workbench/common/NomiMarkdown.tsx:3)、
  [`:91`](../../../src/workbench/common/NomiMarkdown.tsx:91)）。本轮 Markdown 子视图**零新增渲染代码**，
  只是把它挂进产物壳（`ArtifactBody.tsx` 的 `MarkdownPreview`）。
- **3D 预览：已有，直接用**。`three@0.184.0` / `@react-three/fiber@8.18.0` / `@react-three/drei@9.122.0`
  在册，且已包成 `Model3DViewer`（[`src/workbench/generationCanvas/nodes/model3d/Model3DViewer.tsx:69`](../../../src/workbench/generationCanvas/nodes/model3d/Model3DViewer.tsx:69)）。
  glb 产物**零新渲染器**。
- **实测不在册、也刻意不装的四类**（`ls node_modules` 逐个确认为空）：`dompurify` / `sanitize-html`
  （HTML 消毒）、`canvg` / `html2canvas`（SVG/DOM 栅格化）、`@tldraw/tldraw` / `@excalidraw/excalidraw`
  （白板内核）、`shiki` / `react-syntax-highlighter`（代码高亮）。
  - **消毒库不装**，因为我们**根本不消毒**：HTML 产物一律按不受信隔离（sandbox + 自带 CSP），
    走的是"关起来"而不是"洗干净"。装消毒库反而会诱导"洗过就能内联进宿主 DOM"的错误路线。
    表格产物同理——不走 `dangerouslySetInnerHTML`，而是 `DOMParser` 取文本后用 React 结构化重绘。
  - **栅格化库不装**，因为浏览器原生就够：`<img src=blob:svg>` → `canvas.drawImage` → `toBlob`
    十来行（`rasterizeArtifactToReferenceAsset.ts`）。canvg 是给"没有原生 SVG 渲染"的环境用的，
    我们有；html2canvas 解决的是 DOM 截图，那是 P1 的另一件事。
  - **白板内核不装**：见 ③——那是"造一个编辑器"，不是"摆一件产物"。

## ② 仓库里已有？

本轮的设计原则是**只写分发内核，其余全接现成的**。逐条给出处：

- **画布节点壳**：`BaseGenerationNode` 的 kind 专属分支（`scene3d` / `panorama` 同级），不新造节点壳。
- **浮条与按钮原子**：[`nodes/NodeFloatingToolbar.tsx:17`](../../../src/workbench/generationCanvas/nodes/NodeFloatingToolbar.tsx:17)（`FloatingToolbarShell`）、
  [`:63`](../../../src/workbench/generationCanvas/nodes/NodeFloatingToolbar.tsx:63)（`ToolbarButton`）——**一行新样式都没写**。
- **落盘与素材化**：[`src/workbench/api/assetUploadApi.ts:68`](../../../src/workbench/api/assetUploadApi.ts:68)
  （`importWorkbenchLocalAssetFile`）；URL 的建与解是配对函数，取文件名必须用解的那个
  （[`src/media/nomiLocalAssetUrl.ts:16`](../../../src/media/nomiLocalAssetUrl.ts:16) / [`:32`](../../../src/media/nomiLocalAssetUrl.ts:32)）——
  #564 就是在这里自己写了第三种解法，中文标题变成 `%E5%BC%80…`。
- **参考图语义**：`asset`/`image` 节点可被连线当参考的链路已通，所以产物**不新增参考源**，
  而是栅格化成一个 asset 节点（参考语义只有一份 owner，不双源）。
- **⚠️ 3D 视口截图 → 参考图：仓库里已经有一整条，本轮没接**。`scene3d` 的站位参考出图就是它：
  离屏渲染 → `persistScene3DScreenshot`（[`nodes/scene3d/scene3dScreenshot.ts:15`](../../../src/workbench/generationCanvas/nodes/scene3d/scene3dScreenshot.ts:15)）
  → 建 image 节点 + 连参考边（[`nodes/scene3d/StagingCaptureHost.tsx:29-70`](../../../src/workbench/generationCanvas/nodes/scene3d/StagingCaptureHost.tsx:29)）。
  ⇒ **下一刀（方案 §11 阶段 1）的正解是把 glb 产物接进这条现成通道，不是照着 SVG 那条再写一个 3D 版栅格化器。**
  这条是本报告对未来最有价值的一条——查之前的默认写法就会是后者（并行版，违反 P1）。
- **派生建卡的落点约定也已有一份**：切图瓦片、视频抽帧、联系表、3D 站位出图、文本派生
  **全都**按"源卡位置 + 源卡分类"建卡（`useNodeImageEditing.ts` / `extractVideoFrameToNode.ts` /
  `buildContactSheetNode.ts` / `StagingCaptureHost.tsx` / `buildTextEditNode.ts`）。
  本轮走查抓到的落点 bug，正是**没查这条既有约定**的结果——不是缺一层防线，是漏读了现成答案。

## ③ 生态里已有？（一手规范 + 同类产品）

- **"产物自己带一份更严的 CSP"是规范明确支持的做法，不是我们发明的绕法**。CSP 规范写明：
  srcdoc 文档**继承**嵌入方的策略（"user agent MUST enforce those policies on the iframe srcdoc
  document as well"），而 local scheme 的响应"is allowed to enforce arbitrary policy"
  （[CSP Level 3](https://www.w3.org/TR/CSP3/)、[Embedded Enforcement](https://w3c.github.io/webappsec-cspee/)）。
  ⇒ 两件事同时成立：我们注入的 meta **能**把策略收得更严（这是产物断网的依据）；
  但**收不松**——宿主 `script-src` 没有 `'unsafe-inline'` 时产物的内联 JS 一定被拦。
  方案 §6.5 那条"已知缺口"因此是**规范决定的**，不是实现没写好。
- **`allow-scripts` 不给 `allow-same-origin` 是 MDN 明写的强制建议**：两者同给会让被嵌文档
  "remove the sandbox attribute — making it no more secure than not using the sandbox attribute at all"
  （[MDN `<iframe>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)）。
  本轮的 `sandbox="allow-scripts"`（无 same-origin）就是照这条来的。
- **同类产品的形状是"聊天里的一块预览"，不是"画布上的一件产物"**。Claude 的 Artifacts、
  各家 chat 里的 HTML 预览，解决的是"把模型写的页面渲染出来给你看"；本轮解决的是它的下一步——
  **摆到创作现场、并回流成下游能吃的参考图**。这一步生态里没有现成件可直接拿。
- **白板内核（tldraw / Excalidraw）不是同一件事**：它们是"给人画图的编辑器"。本轮产物**只读**
  （HTML 沙箱内可交互但不进编辑态）。装一个编辑器内核来显示一件只读产物，是 R20 第 ③ 问的反面教材。

## ④ 自媒体来源（TikHub）：真做的人在做什么、卡在哪

完整附件：[`tikhub/tikhub-search.md`](tikhub/tikhub-search.md) / [`tikhub/tikhub-search.json`](tikhub/tikhub-search.json)
（关键词「AI 生成 SVG HTML 白板 画布 参考图」，四平台各 12 条共 48 条，2026-09-07 实抓）。

对本轮判断真正有信号的四条：

- **"AI 画图 ≠ 生图"是用户自己已经建立的心智，不用我们教**：「AI画图不是生图！8种"画图语言"一次讲清」
  （[小红书 · 老纪AI实验室](https://www.xiaohongshu.com/explore/6a83a171000000002c002718?xsec_token=YBD8dQyz3FSIVKTl3hcUOtkVneu-JQGJO_2zUkWPaqKec%3D&xsec_source=pc_search)，2026-08-18）。
  ⇒ 方案 §2 那张"手艺 vs 调模型"的选路表不是我们的抽象，是用户已经在用的分法。
- **痛点被反复讲的是"生成完改不了"**：「AI画的机制图好看却改不了？3步搞定可编辑SVG！……改个箭头、
  换个名字就得重来？太痛苦了！」（[抖音 · 小魏博士讲Ai](https://www.douyin.com/video/7638162085399161747)，2026-05）、
  「Ai生成矢量图SVG格式图，可直接编辑图」（[抖音 · 吧啦不吧啦呀](https://www.douyin.com/video/7640331477771101161)）。
  ⇒ 这正是"SVG 当骨架而不是成片"的用户侧依据：**可改**才是它相对生图的价值，
  也说明"改产物源码"（方案列为 P1）不是可有可无的长尾，而是这条价值的下半场。
- **⚠️ 生态里已经有人把"AI 选图种 + 出 SVG/HTML"做成了 skill**：「Diagram Design 是一套面向
  Claude Code、Codex 等 AI 工具的开源制图 Skill。它能根据内容选择图表结构，生成 HTML 和 SVG」
  （[抖音 · 硅基研究员](https://www.douyin.com/video/7678032781678611748)）；
  「让 AI 一句话画出手绘白板风图表 · tldraw-skill……让大模型直接画图，schema 错乱、形状重叠、
  箭头乱连，反复调还不如自己画」（[B站 · 探索未至之境](https://www.bilibili.com/video/BV1ahoSBeEN9)，2026-04-26）。
  ⇒ **这条直接影响方案 §11 阶段 2**：「什么时候用哪种手艺」这件事，别人已经做成了 skill 形态，
  且踩过"让模型裸画会 schema 错乱"的坑（他们的解法是给模型一个受约束的骨架格式）。
  写决策树之前先读这两家，别从零编。**同时这是一条"我们不做也有人做"的提醒**：
  Nomi 的差异不在"能画 SVG"，在**产物能回流进生成链路**——那一段他们没有。
- **"无限画布 + AI 产出"是已被验证的形态**：「Codex必装作图神器！指哪改哪，无限画布～」
  （[小红书 · 栗子的百宝箱](https://www.xiaohongshu.com/explore/6a3bb1a2000000000f01730c?xsec_token=YB5J9i0SoqyZ6QSMknR07U4FiwXqWO0XyKABADSeqb948%3D&xsec_source=pc_search)，2026-06-24）、
  「基于我之前的白板手绘引擎……做个分镜图故事版直接集成升级」（[X · 知识猫AI实验室](https://x.com/GeekCatX/status/2095209263572603205)，2026-09-02）。
  ⇒ 把产物摆上画布不是我们的臆想，是这一波工具的共同走向；**"指哪改哪"**这个词反复出现，
  与用户 09-06 点名的 Frame/mask 诉求是同一件事，可作后续排期的旁证。

## 结论：用已有 / 自研

| 面 | 判断 | 理由（一句话） |
|---|---|---|
| Markdown 渲染 | **用已有**（`NomiMarkdown` / react-markdown） | 全仓唯一渲染器已在册，零新增 |
| 3D 预览 | **用已有**（`Model3DViewer` / R3F） | 零新渲染器 |
| 浮条与按钮 | **用已有**（`FloatingToolbarShell` / `ToolbarButton`） | 一行新样式都没写 |
| 落盘与素材化 | **用已有**（`importWorkbenchLocalAssetFile` / `nomiLocalAssetUrl`） | 建与解是配对函数，不许写第三种 |
| HTML 消毒库 | **不装** | 我们不消毒，我们隔离；装了反而诱导错误路线 |
| SVG 栅格化库 | **不装，自研十来行** | 浏览器原生 `drawImage`+`toBlob` 够用；canvg 解决的是我们没有的问题 |
| 白板内核（tldraw/Excalidraw） | **不装** | 产物只读；装编辑器内核来显示只读内容是过剩能力（R20） |
| 沙箱策略 | **跟随规范**（srcdoc + 自带 CSP + `allow-scripts` 无 same-origin） | CSP3 / CSPEE / MDN 明写，不是绕法 |
| 3D 截图固化（下一刀） | **用已有**（接 `StagingCaptureHost` 那条通道） | 仓库里已有一整条，不许再写一个 3D 版栅格化器 |
| 手艺选择决策树（下一刀） | **先读别人再写** | Diagram Design / tldraw-skill 已做过且踩过坑 |
| 产物回流下游 | **自研** | 生态里没有；这正是 Nomi 的差异点 |

## 诚实记分

- **真跑了的**：TikHub 四平台实抓 48 条（附件在，未经 AI 改写）；依赖在册与否逐个 `ls node_modules` 确认；
  仓库现成件逐条 `grep` 取到 file:line；CSP 与 sandbox 两条判据实读一手规范/MDN。
- **没查成、也不假装查过的**：Diagram Design 与 tldraw-skill 两个开源项目**只读到了自媒体的转述，
  没有去读它们的源码**——所以上面只把它们当"下一刀的必读清单"，没有拿它们的实现细节下任何结论。
- **这份报告是回溯补的**（见开头）。它没有改变本 PR 已实施的任何决定；它改变的是**下一刀的写法**
  （3D 截图接现成通道 / 决策树先读别人），这两条已写回方案 §11。
