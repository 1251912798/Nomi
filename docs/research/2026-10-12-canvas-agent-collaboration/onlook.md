# Onlook 源码核查（2026-10-12）

核验 main HEAD：`423e2e924366419e418ee049093872d535eea41a`，commit time `2026-07-22T02:07:29Z`。公开 README 明确：这里是起家的 Next.js + Tailwind 开源视觉编辑器；新的 AI-native designer hosted 产品在 early access，不能用公开源码推断后者完整能力。本轮读取官方 README、architecture docs、GitHub 完整文件树和 43 个源码/配置文件；没有运行产品、登录、付费调用，也没有修改 Nomi。

## 真实代码中的核心机制

1. **先使成果可定位，再让 AI 改。** `packages/parser/src/ids.ts:addOidsToAst` 给每个 JSX opening element 注入 `data-oid`，处理空/重复 ID 和跨 branch 冲突；`packages/parser/src/template-node/map.ts:createTemplateNodeMap` 建 OID→文件、起止位置、组件作用域、动态类型的映射。`apps/web/client/src/components/store/editor/ast/README.md` 解释为什么还要将 DOM 父子关系与 AST 组合：组件定义的 DOM 与调用实例不同，单靠 DOM 不能确定要改定义还是某次使用。其实际约束是 JSX/TSX，支持 `.map`/条件节点识别，不能由此推断任意网页/Office 格式已支持。

2. **展示桥接与源码操作分开。** `apps/web/preload/script/index.ts` 在预览里建立 Penpal 双向 RPC；parent 为 `apps/web/client/src/app/project/[id]/_components/canvas/frame/view.tsx`。对外暴露 DOM 查询、样式、文本、移动、截图等方法，预览 DOM 变化反馈给 frame event manager。`sandbox/preload-script.ts` 把脚本写入目标项目 public，并 AST 改写 Next layout 引入脚本。这要求我们控制或能改写成果，不是随便嵌一个第三方网页就能精确改。

3. **选中元素成为 Agent 的证据包。** `store/editor/chat/context.ts:getHighlightedContext` 同时读取 DOM 的 oid 和 instanceId，`getHighlightContextById` 拿实际源码并构造 `path + content + start/end lines + oid + branchId`。`packages/ai/src/contexts/classes/highlight.ts` 包装给模型；发送前会按 OID 更新选区内容，降低旧上下文错改。这里不是仅截图或 CSS selector。

4. **AI 修改有两档。** `packages/ai/src/tools/classes/search-replace-edit.ts` 对当前文件做 exact old_string→new_string；非唯一匹配会失败，除非显式 replace_all。`fuzzy-edit-file.ts` 则把 originalCode、updateSnippet、instruction 送到 applyDiff 服务，由另一模型回填整个文件后写入。前者可作为轻量局部修改的底座；后者不等于结构性“只准改选区”，不是精确边界保证。`typecheck.ts` 可跑 tsc，`check-errors.ts` 汇总终端错误，但不能替代视觉正确性验证。

5. **直接操作和 Agent 操作有不同恢复层。** `store/editor/history/index.ts` 使用 Action undo/redo stack，含 transaction 累积和反向 action；写操作由 code manager 写回。AI 对话 `app/project/[id]/_hooks/use-chat/index.tsx` 在 finish 后调用 `utils.ts:createCheckpointsForAllBranches`，逐 branch 做 git commit 并把 SHA 存到消息 metadata。`store/editor/git/git.ts:restoreToCommit` 用 git restore --source 恢复文件。不能由这些代码声称每次 AI 操作是原子事务：checkpoint 是结束后写；hook 的工具执行用了异步 handleToolCall，未在此链看到 AbortSignal 向执行工具传播，因此停止生成与撤回已发生修改要分别设计。

6. **评论尚未完成。** README 里 Leave comments 明确是 [ ]；本轮文件树和已读模块没有定位到已成型的评论 schema/处理闭环。Onlook 证明的是视觉选择→代码上下文→Agent修改，不能被用作“现成精准评论系统”的证据。

## 可借鉴 / 不该照搬

最值得借鉴的是稳定对象 ID、定义/实例区别、精确上下文包、唯一匹配失败关闭、变更记录与可恢复版本。Nomi 应该把评论锚定成 artifactId + revision + target，并由格式适配器解析：HTML 元素 ID、Markdown block/range、slide/page ID、sheet/cell range。截图/框选用于辅助定位；目标不存在或多义时应呈现锚点失效，不能假装精准。

不该照搬整个 Next.js 开发容器、样式工具栏和 JSX AST 编辑体系。Nomi 的 HTML/Markdown 产物可以远轻于完整 app workspace；对生成时就能加稳定 ID 的内容，没必要重建 Onlook 的任意 React 代码映射。保留几个一秒能完成的直接修改操作，其余用统一 Agent 变更提案，先生成新 revision + diff，再由用户验收。

安全不应照抄示例：Penpal parent 和 child 都有 allowedOrigins ['*']（child 有 TODO），frame sandbox 同时允许 scripts、same-origin、forms、popups、downloads，allow 还列出 camera/microphone 等。对 Nomi 的外部/Agent HTML 应单独设计精确 origin/session、最小 RPC、默认无网/权限、生命周期，不把预览视为可信应用代码。以上是源码配置观察，不是已证实的可利用漏洞。

## 许可证与部署依赖

根和 parser package 标 Apache-2.0；parser 标 private，依赖 Babel、Onlook models，不能假设它是可直接 npm 接入的成熟通用 SDK。仓库依赖 CodeSandbox SDK、Supabase、OpenRouter，fuzzy apply 有 Morph/Relace 类服务，hosting 有 Freestyle。开源许可不等于无服务成本和部署依赖；若取代码需保留许可/NOTICE 并逐包核查，若仅借架构可复用 Nomi 现有运行与资产层。

## 证据入口（固定 SHA）

- README：https://github.com/onlook-dev/onlook/blob/423e2e924366419e418ee049093872d535eea41a/README.md
- 官方架构：https://docs.onlook.com/developers/architecture
- OID 注入：https://github.com/onlook-dev/onlook/blob/423e2e924366419e418ee049093872d535eea41a/packages/parser/src/ids.ts
- 选中对象上下文：https://github.com/onlook-dev/onlook/blob/423e2e924366419e418ee049093872d535eea41a/apps/web/client/src/components/store/editor/chat/context.ts
- exact edit：https://github.com/onlook-dev/onlook/blob/423e2e924366419e418ee049093872d535eea41a/packages/ai/src/tools/classes/search-replace-edit.ts
- AI checkpoint：https://github.com/onlook-dev/onlook/blob/423e2e924366419e418ee049093872d535eea41a/apps/web/client/src/app/project/%5Bid%5D/_hooks/use-chat/index.tsx
- preview bridge/security：https://github.com/onlook-dev/onlook/blob/423e2e924366419e418ee049093872d535eea41a/apps/web/client/src/app/project/%5Bid%5D/_components/canvas/frame/view.tsx
- LICENSE：https://github.com/onlook-dev/onlook/blob/423e2e924366419e418ee049093872d535eea41a/LICENSE.md
