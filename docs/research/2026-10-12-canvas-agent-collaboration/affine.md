# AFFiNE 源码调研（2026-10-12）

核验分支 canary，commit `0b69a6da21e8fd35beb85667bb8496d9b3852238`。只读官方 README 与 30 余个源码文件；未运行应用、登录、付费生成。源码摘取位于 `本轮临时源码缓存（未纳入仓库）`；其中 tree.json 为未截断仓库树。

## 核心结论

AFFiNE 最值得借的是 **稳定对象身份 + 同一内容的多视图 + 评论协议与显示层解耦 + 先展示 diff 再采纳**。它自身是重型文档/白板编辑器，并不能直接证明“轻预览 + 精准评论 + Agent”已经完成通用闭环。尤其不能把“用了 Yjs”说成“AI 改完所有评论还能跟随”。

## 已核实机制

1. **同一个内容模型承载文档和白板。** NoteBlockModel extends GfxCompatible(BlockModel)，同一 note 同时有 children、xywh、displayMode（DocOnly/EdgelessOnly/DocAndEdgeless）、comments；这不是文档副本与白板副本。DocModeProvider 的 page/edgeless 是呈现模式，block id 是内容身份。文档是 Y.Doc / yBlocks:Y.Map<YBlock>。
来源：[note-model.ts](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/blocksuite/affine/model/src/blocks/note/note-model.ts)、[doc.ts](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/blocksuite/framework/store/src/extension/workspace/doc.ts)、[doc-mode-service.ts](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/blocksuite/affine/shared/src/services/doc-mode-service.ts)。

2. **精准评论有三种锚定，而不是统一记录屏幕坐标。** 文本选区把 `comment-<id>:true` 写成富文本/Y.Text delta 的格式属性；块/图片把 `comments[id]` 写入 block props；白板 surface 对象把 comments 写入 element model。resolve 保留 id 将值设 false，delete 才移除。文字在原 Y.Text 上增删时有随协作文本移动的基础；删除重建则要另解。跨块选区拆到各块。
来源：[inline-comment-manager.ts](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/blocksuite/affine/inlines/comment/src/inline-comment-manager.ts)、[block-element-comment-manager.ts](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/blocksuite/affine/shared/src/services/comment-service/block-element-comment-manager.ts)。

3. **评论系统与编辑器分开。** CommentProvider 统一 add/resolve/highlight/getComments 和事件回调；AFFiNE 的 provider 连接评论实体/侧栏。所有选区都能共用评论服务，但各模型自己处理锚点。comment 正文是 BlockSuite snapshot，支持附件/reply/mentions，并有从目标选区抽取的文本 preview。不能误把 comment 的 snapshot 解释成被批注目标的完整快照。
来源：[CommentProvider](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/blocksuite/affine/shared/src/services/comment-service/comment-provider.ts)、[应用桥接](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/packages/frontend/core/src/blocksuite/view-extensions/comment/comment-provider.ts)、[types](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/packages/frontend/core/src/modules/comment/types.ts)。

4. **AI 修改有两个值得区分的路径。** 前端 BlockDiffService 对原 markdown/changed markdown 生成 deletes/inserts/updates，可 accept/reject 单条或全部，监听用户改动刷新 original。这是审阅界面机制。applyPatchToDoc 只操作第一个 note 的直接 children。replaceFromMarkdown 删除旧块，Markdown 转换后把首个新块 id 设置为旧 id 再建；块 id 保留，但该路径没有显式迁移旧 comments 或原 Y.Text 格式，不能据此保证评论连续性。
来源：[block-diff.ts](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/packages/frontend/core/src/blocksuite/ai/services/block-diff.ts)、[apply-patch-to-doc.ts](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/packages/frontend/core/src/blocksuite/ai/utils/apply-model/apply-patch-to-doc.ts)、[markdown-utils.ts](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/packages/frontend/core/src/blocksuite/utils/markdown-utils.ts#L200)。

5. **服务端 Agent 有真实工具边界。** doc_update 输入完整 markdown、在权限检查后调用 DocWriter；DocWriter 基于既有 CRDT binary 做 structural diff，提交 delta update，并广播事件。文档标题另设 tool。tool 明确声明不支持插入/更新 database block 和 image。section_edit 则只接 section/instructions/document 返回修改文本，本身不落盘。
来源：[doc-write.ts](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/packages/backend/server/src/plugins/copilot/tools/doc-write.ts)、[writer.ts](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/packages/backend/server/src/core/doc/writer.ts#L137)、[section-edit.ts](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/packages/backend/server/src/plugins/copilot/tools/section-edit.ts)。

6. **Agent 读画布不是总塞一张截图/整个文档。** doc_canvas_read 接 overview、frame、element ids、region；返回有界文本/结构/关系/bounds，最多 100 条，preview 截断提示；分页 cursor 绑定 revision，读到变化会返回 REVISION_CHANGED；校验用户所选 document scope、读权限、云端同步状态。源码要求 unsynced editor state 走 frontend tools。这个“全局概览→局部精读”的读取模型非常适合 Nomi，尤其未来大量成果节点。
来源：[doc-canvas-read.ts](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/packages/backend/server/src/plugins/copilot/tools/doc-canvas-read.ts)。

7. **撤回/协作不是免费业务正确性。** HistoryExtension 使用 Y.UndoManager，trackedOrigins 只有当前 clientID；Store.transact 用 clientID 作为 origin，withoutTransact 不记本地历史，captureSync 切分撤回单元。因此我们应显式定义一次 Agent 修改的 transaction/历史边界；不能假定服务端 Agent delta 自动成为用户一键可撤回单元。Yjs 解决操作合并，不解决“你已经改了这段而 AI 又据旧内容改它”的语义冲突。
来源：[history-extension.ts](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/blocksuite/framework/store/src/extension/history/history-extension.ts)、[Store](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/blocksuite/framework/store/src/model/store/store.ts#L359)。

## 给 Nomi 的落地启发

- 保留现有 React Flow 外层画布，以 artifactId/revisionId 管成果身份；内层 HTML 元素 id、Markdown block id、slideId/shapeId、sheetId/cellRange 分类型适配。可以共用评论协议，不必强行让所有内容都进入 BlockSuite 的 schema。
- 评论保存 target locator + 引用文本/缩略图 + 创建时 revision，并显式有 anchored/stale/orphaned 状态。替换导致定位失效时显示待重新定位，不能偷偷挂错。
- Agent 先读取可定位上下文（当前版本、选中区域、关联对象），产出针对该版本的 patch/proposal；校验 expectedRevision 后局部应用。并发用户改动时重读或重定位；避免整份字符串重生成覆盖。
- 一次 Agent 修改一个可撤回 changeset；diff 要让人看懂而不是把代码 diff 当普通用户界面。评论的 open/resolved 与 Agent 的 proposed/applied/accepted 分开，不能 Agent 一改完就当人满意。
- 只借 BlockSuite 的小块/协议思想。直接装全套会带入 Yjs、Lit/Web Components、DI、signals、editor selection/model schema、迁移及主题适配，与 Nomi React+Zustand+React Flow 的既有底座重叠。

## 许可证与复用成本

仓库顶级 LICENSE：packages/backend 与 packages/common/native 按 backend/server/LICENSE；其余主要 MIT。BlockSuite inline-comment package.json 明确 MIT。backend/server/LICENSE 是 EE 条款，同时指明 CE/客户端部分有 MPL2.0 范围；生产复用服务端必须逐文件辨别来源/发行范围，不能称整仓 MIT。本报告只提出技术参考，不做法律判断。
来源：[LICENSE](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/LICENSE)、[backend license](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/packages/backend/server/LICENSE)、[comment package](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/blocksuite/affine/inlines/comment/package.json)。

## 尚未证明

- 未亲测真实 UI 的多轮 AI 修改、批注重定位、并发、撤回体验。
- 本轮未核验 doc_update native structural diff 的内部实现，不能承诺它保留所有评论/标记。
- 已查看 tool 文件中未看到将评论直接消费为 Agent 任务的闭环；不因此断言全仓不存在。
- 块内嵌入任意 HTML/PPT/Office 的格式保真、精确评论等不是这次代码检查能够证明的能力。
