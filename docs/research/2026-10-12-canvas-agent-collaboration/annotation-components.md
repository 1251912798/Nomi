# 批注与局部修改：开源组件核验

核验日期：2026-10-12（Asia/Taipei）。本文为正式方案的组件证据补充，不是实现或安装记录。仅检查官方文档、公开源码、npm 元数据和 Nomi 当前依赖；没有安装、运行组件，没有收费调用，没有修改 Nomi。

后续新增核验更新：主方案已优先评估摘取 OpenDesign 的 HTML 锚点纯函数、局部编辑 patch 与选择桥小闭包，避免重复实现通用机制；本文推荐的 ProseMirror/Tiptap 与图片组件仍适用。具体来源与不足见 [OpenDesign 源码笔记](opendesign.md)。

## 建议先用哪一套

第一阶段：**保留 Nomi 已有 Tiptap/ProseMirror，增加同版本的开源 UniqueID 扩展；评论范围用 ProseMirror 自带映射和 Decoration 表达；网页先做稳定元素身份上的评论；图片区域批注到需要时直接接 Annotorious。**

通用数据约定借用 W3C Web Annotation 的 target / selector / body 分工，外包一层项目资产身份和版本。不要发明另一种文本引用、区域描述标准，也不要求引入完整 JSON-LD 运行时。

对网页中任意文本的跨版本重新定位，以 Hypothesis 的成熟锚定模块为备选源，不自己设计模糊匹配算法。第一阶段对于无法确认的目标显示“需要重新定位”；不要为了看起来聪明，自动把批注挂到另一个相似文本上。

这套推荐是“复用成熟基础机制 + 薄集成”，并不意味着已经有一个免费 npm 包同时解决所有格式、精准评论、Agent 修改和版本恢复。评论 UI 轻，不代表后台没有版本和数据结构成本。

## 证据与取用矩阵

| 组件 | 已核验能力 | 版本、维护证据 | 许可证与取用方式 | 推荐结论 |
|---|---|---|---|---|
| Tiptap + ProseMirror | 结构化文档；事务 Step/Mapping；DecorationSet 映射；删除目标的检测接口 | Nomi `package.json` 核心包 3.23.5；lock 中 `prosemirror-view` 1.41.8、`prosemirror-transform` 1.12.0。上游 npm view 最新 1.42.6，2026-09-25 发布；当前源码已迁到作者托管站，GitHub archive 不等于停止维护 | MIT。直接复用现有 `@tiptap/pm` 导出，不再并装另一套 ProseMirror 实例 | **立即复用**。评论存储及呈现需集成，但不要重写位置映射算法 |
| `@tiptap/extension-unique-id` | 给指定节点添加身份；处理缺失身份、复制粘贴、重复 ID；输出 `data-id` 等属性 | npm 确认 3.23.5 存在且 peer 精确对应 Nomi core/pm 3.23.5；npm latest 3.31.4。另核验上游源码 commit `5e4c112…` 的包版本 3.30.3，源码与 npm 发布快照不能混为一谈 | MIT。可直接 npm 安装 **3.23.5**，实现时仍须验证其实际能力；不要只升级这一个包到 latest | **推荐新增**。文档段落等身份交给它；它不是全文任意重写后的语义身份恢复器，也不是网页通用 DOM 标识库 |
| Tiptap Comments | 成套评论线程、状态及编辑器接入；依赖 `TiptapCollabProvider` | 官方 install 文档明确 Start plan、激活试用/订阅、启动 Document server、私有 registry | `@tiptap-pro/extension-comments` 为付费 Pro 组件，**不能把 Tiptap 核心 MIT 延伸到它**；精确商业条款另查合同 | **暂不选**。会引入订阅和协作服务形态。若未来多人评论成为核心，再比较付费集成总成本 |
| Hypothesis client 锚定模块 | 同时生成 Range / TextPosition / TextQuote；先结构范围，再位置并核验原文，最后按引用上下文寻找；当前实现包含渲染文本归一化与近似匹配 | commit `b4d085a…`，主分支提交时间 2026-07-31；repo pushed 时间 2026-10-04。源码是内部 TS 模块，package version 是 dummy，**不是独立稳定锚定 SDK** | client package 标 BSD-2-Clause；LICENSE 同时载子组件 MIT 说明。可以按许可证保留声明、固定来源摘取相关模块与测试；要审计依赖闭包 | **备选源码复用**。主要用于导入 HTML 的文本范围重定位；不要整体嵌入带账号/服务/UI 的 client |
| `dom-anchor-text-quote` / `dom-anchor-text-position` | DOM Range 与 exact/prefix/suffix、start/end 互转；quote 包支持近似搜索 | quote npm 4.0.2 最后发布 2017-02-10、repo 主分支提交 2022-07-22；position 5.0.0 最后发布/主分支提交 2020-04-01 | MIT；真实可装 npm 包。quote 依赖旧 `diff-match-patch` 和 position | **不作默认生产依赖**。接口小、机制经过使用，但发布与维护年代久；可作隔离实验对照，不能描述成 Hypothesis 当前官方 SDK |
| `@annotorious/react` + `@annotorious/annotorious` | 图片矩形/多边形、选中与事件、自定义弹层；W3C 图片格式适配器 | 3.9.4，2026-10-06 npm 发布；源码 commit `3fbefb2…`；React peer 明确支持 18；core 有 vitest，React package 脚本本身跳过测试 | BSD-3-Clause；直接 npm 包。纯前端库，持久化接应用现有层，非现成团队评论服务器 | **需要图像区域批注时接入**。用它处理几何和选择，不自写绘制引擎；项目版本/评论线程由宿主绑定 |
| W3C Web Annotation Data Model | target、body；TextQuoteSelector、TextPositionSelector、FragmentSelector、SvgSelector | W3C Recommendation 23 February 2017，稳定规范，不以“最近提交”衡量成熟度 | 标准，不是编辑器库；按数据模型使用 | **统一交换语义**。不承诺标准会自动维护版本、消歧或执行 Agent 修改 |

## 源码告诉我们的交互约束

### 文档：让编辑步骤带着评论走

ProseMirror 的 `DecorationSet.map(tr.mapping, tr.doc)` 已承担范围随事务前移/后移的基础工作，`onRemove` 可以通知范围消失；`Mapping.mapResult` 能给出边界删除信息。我们把这些结果转成产品语言即可。

但 Decoration 只是视图表达，不是评论数据库。重启恢复需要保存评论记录、对应版本和结构位置，重新构建 DecorationSet。不能把内存映射“演示成功”写成持久化完成。

Agent 也要经相同文档 transaction/command 入口修改，保留未修改节点 ID。若每次都 `setContent` 整篇覆盖，旧 ID、事务连续性和精准批注都会被削弱。整篇重生成应明确生成新 revision 并重新核验旧批注，不能声称映射算法可以理解语义继承。

### 网页：稳定元素身份与文本引用互补

自生成 HTML，先要求待反馈元素有稳定 ID。ID 由宿主的创建/复制/删除规则维护，不能让 Agent 随意把所有 ID 重新生成。选中元素与局部替换可以利用浏览器 DOM API，不必为此重写浏览器或 Onlook 的源码编译链。

细粒度文字选区可以使用 W3C TextQuote / TextPosition 描述。Hypothesis 当前源码体现的是“多证据定位”：Range/offset 也必须与 quote 核验。**这只是重新找到一个可能位置；它没有替我们决定能否对该位置自动执行修改。** 对候选不唯一、文本被删除、版本冲突的情况，宿主需要阻止误改并让用户重新指认。

不要复制旧 quote 库的“返回最好匹配就直接写”用法。现有 Hypothesis `matchQuote` 为候选打分并取最高分，本次未运行验证其歧义处理；正式接入应把不确定性留给产品验证，不能据此宣称绝不错位。

### 图片：显示坐标和资产身份分开

Annotorious 的几何选择由库完成。宿主绑定不可变图片版本及原始尺寸；缩放、拖动画布后依然以图片坐标解释，不存屏幕像素。图像重新生成、裁切、换图后，不自动把区域附着到新图片；相同构图的语义对应另立需求。

W3C adapter 可交换 FragmentSelector/SvgSelector，但我们的自定义版本字段须测试 round-trip 保留。库的“支持 W3C”不能代替资产版本约束验证。

## 我们最少需要集成什么

以下是 Nomi 与通用库之间的集成边界；**通用评论、锚点算法、版本比较、CAS 并非 Nomi 独有，不应以“领域”名义重造。**

1. **资产身份与视图连接**：把画布 node、项目 artifact、immutable revision、编辑器内对象 ID 连接起来。资产身份属于现有 Nomi；格式适配尽量调用库的 API。
2. **创作上下文交给 Agent**：从选中目标、原文/局部截图、评论意图中构造最小工作上下文，关联当前 Nomi Run / capability gate；只开放本任务允许修改的目标。
3. **把已有修改能力接到统一入口**：文档调用 Tiptap transactions；HTML 局部更新必须保留目标身份并检查预期 revision/原值；图片批注先作为反馈输入，重新生成走现有 Run。并发控制和原子保存复用现有设施，不能新建第二条生成/写盘生命周期。
4. **把技术结果翻译为用户判断**：显示“已修改，待确认”“目标已移除，需要重新定位”“内容更新了，请重新检查”；结果可对照、撤回、重开恢复。Agent 回复不等于任务完成，更不等于用户满意。

一份通用目标记录可在标准 selector 外保存 `artifactId`、`revisionId`；一个修改请求引用现有 Run 和评论 ID。这是数据连接协议，不是新编辑器框架，也不是新 CRDT 系统。

通用的线程存储/权限/多人消息基础设施不应在第一阶段造全。先由已有项目持久化层保存单人反馈和 Agent 回复，需求进入多人协作时再比较现成线程服务/开源协作框架。

## 不纳入首期的组件

- **不为批注先上 Yjs/Hocuspocus**：CRDT 解决多人并发编辑问题；本轮首先是单人指认、Agent 异步修改与版本冲突。实际出现多人同时编辑再选择。引入 CRDT 不能自动解决 Agent 整篇重写后的语义身份。
- **不为网页先上完整 Onlook 编译链**：Nomi 首期对象是生成的 HTML 成果，而不是任意 React 工程的可视化源码 IDE。DOM 身份和局部更新够用时，先保持这条边界。
- **不把 morphdom 当定位/一致性答案**：DOM diff 库可维护屏幕状态，但不证明两个不同版本中的某元素是同一个业务对象；稳定身份和版本校验仍在宿主。
- **不为 HTML 重造 parser/sanitizer**：Nomi lock 已有 parse5 7.3.0（传递依赖），需要正式调用时显式声明对应依赖并做安全边界验证；不能因为它在 lock 就直接用隐式依赖。HTML 解析器也不自动给出语义 ID 或安全脚本沙箱。

## 首轮验证应证明什么

不能用“包已安装”“点击能高亮”验收完整链路。至少用真实中英文内容验证：

- 目标前插入文字/同类元素，评论仍指对；相同句子出现多次时不误认。
- 段落复制粘贴生成新身份；原评论不跳到副本；段落移动后身份保持。
- 删除目标不静默挂到邻居，跨页文本/`<br>`/中文标点定位一致。
- Agent 等待时人工编辑，旧 revision 的修改被拒绝或重算，不能覆盖新内容。
- 三轮连续局部修改，未选区域不被重生成；撤回能够恢复内容与评论可用状态。
- 关闭重开后恢复评论及对应版本；两套文字方向/主题、画布缩放后定位正确。
- 图片换版本或裁切时，旧区域明确绑定旧版本，不自动迁移。

这些目前均未实际执行，本文只建议验证门槛。

## 精准来源

### Nomi 当前依赖

- 本地 `package.json:334-342`：`package.json`。
- 本地 `pnpm-lock.yaml:5861-5864`（transform/view）、`:5618`（parse5）。仅依赖观察，未验证 UI 实际接入。

### ProseMirror

- [DecorationSet.map 官方 API](https://prosemirror.net/docs/ref/#view.DecorationSet.map)
- [Mapping.mapResult 官方 API](https://prosemirror.net/docs/ref/#transform.Mapping.mapResult)
- [现维护仓库 commit](https://code.haverbeke.berlin/prosemirror/prosemirror-view/commit/3c28f8e797e8fd7e45b72616ba1ce51b6eb8582e)
- [已核验 Decoration 源码](https://code.haverbeke.berlin/prosemirror/prosemirror-view/src/commit/3c28f8e797e8fd7e45b72616ba1ce51b6eb8582e/src/decoration.ts)
- [GitHub 原仓库迁移声明与 MIT 说明](https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/README.md)
- [npm 元数据](https://registry.npmjs.org/prosemirror-view)

### Tiptap

- [UniqueID 官方文档](https://tiptap.dev/docs/editor/extensions/functionality/uniqueid)
- [UniqueID 固定版本源码](https://github.com/ueberdosis/tiptap/blob/5e4c112378218cafbb0bde8b0beeece5f8fcf602/packages/extension-unique-id/src/unique-id.ts)
- [UniqueID package.json / MIT](https://github.com/ueberdosis/tiptap/blob/5e4c112378218cafbb0bde8b0beeece5f8fcf602/packages/extension-unique-id/package.json)
- [npm 3.23.5 精确版本元数据](https://registry.npmjs.org/@tiptap%2fextension-unique-id/3.23.5)
- [Comments 安装、订阅及 provider 要求](https://tiptap.dev/docs/comments/getting-started/install)
- [Pro 私有 registry 与订阅说明](https://tiptap.dev/docs/guides/pro-extensions)

### Hypothesis 与旧独立包

- [当前 client 锚定选择顺序](https://github.com/hypothesis/client/blob/b4d085a2f893aa6de3b61d8b8bc3ae4d0f24fc1a/src/annotator/anchoring/html.ts)
- [当前 Range/Position/Quote 实现](https://github.com/hypothesis/client/blob/b4d085a2f893aa6de3b61d8b8bc3ae4d0f24fc1a/src/annotator/anchoring/types.ts)
- [当前引用匹配算法及依赖](https://github.com/hypothesis/client/blob/b4d085a2f893aa6de3b61d8b8bc3ae4d0f24fc1a/src/annotator/anchoring/match-quote.ts)
- [client LICENSE：BSD-2-Clause 正文与子组件 MIT](https://github.com/hypothesis/client/blob/b4d085a2f893aa6de3b61d8b8bc3ae4d0f24fc1a/LICENSE)
- [client package 元数据](https://github.com/hypothesis/client/blob/b4d085a2f893aa6de3b61d8b8bc3ae4d0f24fc1a/package.json)
- [旧 quote 包固定源码](https://github.com/tilgovi/dom-anchor-text-quote/tree/b7fa38af4a27c7d3a6e6587bb0ce0ecf0430237f)
- [旧 position 包固定源码](https://github.com/tilgovi/dom-anchor-text-position/tree/6502c48aff7f3f0ce3bb225d1c04ca8624c3b88f)
- [quote npm 发布与许可元数据](https://registry.npmjs.org/dom-anchor-text-quote)
- [position npm 发布与许可元数据](https://registry.npmjs.org/dom-anchor-text-position)

### Annotorious 与标准

- [Annotorious React package / 版本 / peer / 许可](https://github.com/annotorious/annotorious/blob/3fbefb2cb4646c11e2d0d0b9fb4977fe028186a4/packages/annotorious-react/package.json)
- [Annotorious core package](https://github.com/annotorious/annotorious/blob/3fbefb2cb4646c11e2d0d0b9fb4977fe028186a4/packages/annotorious/package.json)
- [图片 W3C 适配器](https://github.com/annotorious/annotorious/blob/3fbefb2cb4646c11e2d0d0b9fb4977fe028186a4/packages/annotorious/src/model/w3c/W3CImageFormatAdapter.ts)
- [图片 React 组件](https://github.com/annotorious/annotorious/blob/3fbefb2cb4646c11e2d0d0b9fb4977fe028186a4/packages/annotorious-react/src/ImageAnnotator.tsx)
- [React npm 元数据](https://registry.npmjs.org/@annotorious%2freact)
- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/)

Context7 本轮按要求分别 resolve 并查询了 ProseMirror、Tiptap、Annotorious；版本、许可、维护日期以以上一手源码和注册表为准。
