# OpenDesign 同名辨析与评论机制补充

调研日期：2026-10-12。范围：公开官方文档，以及 Open CoDesign 固定提交的部分源码。未安装、未启动应用、未运行其测试；文档描述与源码存在不等于已完成真实交互验收。本报告为主方案补充，不替代对 nexu-io/open-design 的独立源码调研。

## 1. 先区分名字，避免拼出一个不存在的产品

| 对象 | 可确认的身份 | 证据等级与处理 |
| --- | --- | --- |
| nexu-io/open-design | 主调研线负责的 GitHub 项目 | 以其自身源码报告为准，不能把下面两者的能力计入它 |
| pages.undefined83.org/open-design | 官方文档的源码链接指向 gitlab.undefined83.org/web-dev/open-design；文档称 SvelteKit/Svelte 5 Web 应用、Go MCP、用户自带 Codex/Claude Worker | 公开文档可读；匿名仓库页面/raw 跳登录、GitLab API 404、git info/refs 401。无法取得源码 SHA、实际许可证或核对实现，因此只能借鉴交互，不能计入可直接摘取源码清单 |
| dporkka/opendesign | GitHub API 明确标记为 OpenCoworkAI/open-codesign 的 fork | fork main 固定 SHA `41119283e810ea34730e4bc05871c5775c29812f`；不宜把旧 fork README 当当前上游交付状态 |
| OpenCoworkAI/open-codesign | Electron/React 的本地优先 Open CoDesign，上游独立项目 | 本次固定 main SHA `856dba889bc44fcf44241341ecf9c1053fc9f29d`；源码、根 LICENSE、NOTICE 可读。仅小范围核验评论/CAS/源编辑，未整体评测 |

undefined83 文档出现 `nexu-open-design:saas-landing` 模板包 ID，只能说明其接口接受该命名的模板包；**不能据此推断与 nexu 同仓、分叉关系、源码许可或功能等价**。本轮没有取得两者 Git 历史关系证据。[模板参数](https://pages.undefined83.org/open-design/reference/mcp-tools/)

## 2. undefined83：值得学习的轻交互，但源码复用未成立

它的说明贴近本方案：预览正常浏览、元素直接编辑、批注交给 Agent 分成三种模式。切换到评论同时打开评论面板；点击元素创建批注，双击文字原地输入替换内容，但将其作为 old→new 提案排队。这降低“我是在改最终文件，还是在表达修改意图”的混淆。人工小修与 Agent 请求都有入口。[Canvas](https://pages.undefined83.org/open-design/features/canvas/)、[Review and comment](https://pages.undefined83.org/open-design/using/review-and-comment/)

它的评论是交接队列：默认 `od_get_comments` 读取并移除，`peek:true` 才只读；前者需要 write，后者允许 read。文档明确它不承担长期讨论线程。**Nomi 不能照搬读取即清空**：如果 Agent 已读但中断/失败，用户仍须看到原意见和处理结果。建议保留评论记录，执行意图独立排队；读取、开始处理、提交修改、用户确认各自留下状态。[MCP tools](https://pages.undefined83.org/open-design/reference/mcp-tools/)

直接编辑接口文档也有限定：仅 `.html`，定位描述为 tag/index/attrs/text/descendants，允许文本、字号、字重、颜色、段后距，支持 dryRun。这不是一个已证明支持任意 DOM→React 源码的通用编辑 SDK；旧版本定位是否漂移、重复元素如何拒绝、如何保存选区，当前无法源码验证。[HTTP API](https://pages.undefined83.org/open-design/reference/http-api/)

版本历史文档采用操作前检查点、Agent 改动后版本、恢复前回归点；恢复本身可再恢复。它按项目文件与对话快照组织，不等于单元素操作 Undo，也不能证明付费记录如何保留。可学“先保留回归点再恢复”，Nomi 仍需遵守既有运行/花费事实不因 Undo 抹除的边界。[Revisions](https://pages.undefined83.org/open-design/features/revisions/)

文档称预览、渲染、缩略图与导出共用有界队列及一个 Chromium，每次独立 context；可学统一渲染资源所有权，避免每个节点自建 Chromium。对 Nomi 应先复用现有 Electron 生命周期、截图和预览服务，而非移植 Web 部署/Go MCP/Worker 全栈。[Architecture](https://pages.undefined83.org/open-design/developer/architecture/)

结论：它支持我们讨论的交互方向具有实际产品实例；**它没有在本轮提供可拿来即用的开源组件证据**。许可证未知，不能摘代码；无需为继续写方案要求用户登录它的 GitLab。

## 3. Open CoDesign：三个最有用的源码机制

以下所有源码链接固定于 SHA `856dba889bc44fcf44241341ecf9c1053fc9f29d`。

### 3.1 评论与执行要求分开，评论跟着快照与文件走

[`comments.ts`](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/apps/desktop/src/renderer/src/store/slices/comments.ts) 在新建评论时要求 snapshotId，带 selector、outerHTML、rect、sourcePath 等，支持将评论挑选加入下一次 prompt。`submitComment` 重新编辑已存在批注时走 update，减少重复行；同 selector/sourcePath 的 pending edit 有复用逻辑。

[`session-chat.ts`](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/apps/desktop/src/main/session-chat.ts#L386) 以 pi SessionManager custom entries 存 add/update/remove/mark-applied，重放得到评论列表。`listPendingSessionCommentEdits` 只挑 `kind=edit,status=pending`；更改已应用 edit 的文字，重设 pending 并清除 appliedInSnapshotId。这比删除已读评论更适合后续追问。

可学：备注与要求执行的修改明确区分；目标绑定当时的快照和源文件；批量选择交给 Agent；用户修改意见会使旧完成结论失效。

不直接照搬：这是围绕其 design/session 存储写的应用代码，依赖其 DB、SessionManager、schema 和 IPC；Nomi 已有 pi 与资产/画布公共提交边界，移植全套会形成第二账本。也不能仅靠 selector+rect 宣称跨重排稳定。其独立 [`comment-anchor.ts`](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/packages/core/src/comment-anchor.ts) 是压缩路径/文字/样式为 prompt 的小帮助模块，不是经过此轮验证的跨版本重锚引擎；代码注释宣称 nth-of-type 可抗兄弟重排，单靠该规则并无此保证。

### 3.2 评论完成标记的 CAS，不能替代成果写入的 CAS

[`comment-content.ts`](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/packages/shared/src/comment-content.ts) 对 designId/snapshotId/kind/sourcePath/selector/tag/outerHTML/text/scope/parentOuterHTML 生成 JSON.stringify 内容指纹；没有把坐标当意见身份。它是确定性序列化，不是安全哈希。

[`markSessionCommentsAppliedIfUnchanged`](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/apps/desktop/src/main/session-chat.ts#L536) 在 main 同步事件循环内比较 pending edit 与 expectedContent，匹配者 mark-applied，不匹配返回 conflictedIds。测试场景是 Agent 处理期间用户将 Red 改成 Blue，旧任务不得把 Blue 标成完成。[测试源码](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/apps/desktop/src/main/comments-cas.test.ts)

可摘取：内容指纹这个小纯函数、比较规则及上述竞态验收场景，在保留 MIT 声明后适配到 Nomi schema。无需引新依赖；Nomi 已有 Zod。更推荐把“执行时冻结意见版本、回写前复核”纳入现有 command/precondition 边界。

限制：这个 CAS **只保护评论状态**，不证明文件已经正确改变，不实现评论+文件跨资源事务，也不证明用户验收。IPC 还保留省略 expectedContent 的直接标记分支；Nomi Agent 自动完成路径应强制 expectation。不能用 applied 直接替代“用户已接受”。

### 3.3 小修必须写回真实源文件，保存成功与预览刷新失败分开

[`source-edit-persistence.ts`](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/apps/desktop/src/renderer/src/preview/source-edit-persistence.ts) 是极小的 adapter：schema parse 后核对返回 path、previewRevision，避免将错误文件/错误预览的 ACK 当本次成功。真正提交位于 main，不在渲染 DOM 里假装保存。

[`source-edit-atomic.ts`](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/apps/desktop/src/main/source-edit-atomic.ts) 写同目录唯一临时文件、fsync、复核暂存内容及目标身份/预期内容，然后 rename；要求调用方持有 workspace-path lease 和 canonical writer lease。源码明确承认这只是 atomic replacement，**不是操作系统 CAS**：外部写入仍可在最后校验与 rename 之间竞争。失败清理临时文件。不能摘一个 rename helper 就宣称跨进程无丢失更新。

[`source-edits-ipc.ts`](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/apps/desktop/src/main/source-edits-ipc.ts#L163) 将成功落盘视为事实；后续通知/预览刷新失败只给 warning，避免报告“未保存”诱发重试覆盖新内容。这一点适合 Nomi 的“提交成功，但预览待刷新”状态。

[`source-edit-engine.ts`](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/apps/desktop/src/main/source-edit-engine.ts#L663) 用 Babel AST 和 SHA256 源码校验规划局部编辑，重新解析改后源码；**仅支持 JSX/TSX 的 source-definition 范围**，拒绝任意 selected instance。共享源定义可影响多个渲染实例，代码直接说明这一点。预览绑定代码还要验证 DOM 文本/子元素是否仍符合源映射；不是 selector 即源码地址。[预览绑定](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/packages/runtime/src/source-edit-binding.ts)

可学：preview revision+source content 双重校验；失败明确拒绝而非模糊匹配；共享组件修改范围可解释；保存 ACK 与刷新分开。

取舍：Nomi 第一期 HTML/Markdown 不需要背 JSX 源映射引擎；只有明确要编辑用户工程 React 源码时，才评估摘取这一组 engine/provenance/binding/instrumentation 模块及测试。通用 AST/Babel/parse5 继续用成熟库；不要把此应用层源码映射误称独立维护的成熟 SDK。

## 4. 复用清单与许可证边界

| 内容 | 处理建议 | 直接拿来成本/限制 |
| --- | --- | --- |
| commentContentFingerprint / expectation 比较规则 | 小范围 source-port 或按既有 schema 适配；优先复用竞态用例 | 纯函数可理解、MIT；原 schema import 需拆；不必引 TypeBox/Zod4 |
| source-edit-persistence 的 ACK 校验模式 | 合入现有 Nomi bridge 的一致性检查 | helper 本身很小，整包接入无价值；不是源文件写入实现 |
| commitSourceEdit 暂存提交流程 | 对照现有公共提交边界补缺口；不并行引新writer | 依赖路径租约、写入租约，外部写入竞态仍在；需要真实崩溃/重启/平台测试 |
| 评论面板/PinOverlay | 交互和布局参考 | React+自家store/i18n/styles/schema 耦合；Nomi需生产组件与设计token，不整块复制UI |
| JSX源编辑引擎 | 留到用户工程代码编辑阶段评估 | AST定义不等于单实例；多模块耦合、复用范围受格式约束 |
| 整套core/shared/runtime/storage | 不接入 | private monorepo包，非即插即用 npm SDK；会与Nomi既有Agent和资产真源重叠 |
| undefined83源码 | 不摘取 | 无可访问源码、SHA和许可，本轮只能学习公开交互 |

Open CoDesign 根 [LICENSE](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/LICENSE) 是 MIT，要求保留版权与许可；已检查上述下载的源码文件未见覆盖根许可的单独头部声明，**未审计全仓所有文件**。[NOTICE](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/NOTICE) 列 pi/Electron/PptxGenJS/dom-to-pptx/esbuild 等第三方，并说明发行包生成第三方许可集合；实际摘取仍要沿依赖闭包检查。

其 [core](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/packages/core/package.json)、[shared](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/packages/shared/package.json)、[desktop](https://github.com/OpenCoworkAI/open-codesign/blob/856dba889bc44fcf44241341ecf9c1053fc9f29d/apps/desktop/package.json) 当前版本0.2.2且private，Electron39/React19/Zod4/pi0.72，与Nomi现有版本不同。其同样使用pi强化了“复用现有Agent底座，补精准目标与工作流”的选择，不能为了借评论重装一套Agent。

## 5. 应进入主方案的四条结论

1. 轻交互有具体实例：浏览/批注/小修分开，文本替换可以先表达为提案；这支持产品方向，尚不证明目标用户收益。
2. 评论是持久的用户意图；交给Agent是一项独立操作。读取不等于完成，applied不等于用户验收。
3. 两种版本都要保护：成果目标版本与评论意见版本。只做其中一种CAS仍可能把过期意见或错误目标当成功。
4. 最值得拿的是小模块与真实竞态用例。完整应用源码不是成熟通用组件，Nomi的既有pi、TargetRef/Precondition、公共提交与Undo边界应继续拥有事实。

## 6. 本轮边界与复核材料

- 无用户账号登录、无外部写入、无Nomi修改。
- GitLab源码不可匿名访问，未绕过权限、未要求登录；SHA和许可保持unknown。
- Open CoDesign当前提交源码可读；测试仅阅读，未执行。不宣称评论准确率、导出保真度、Windows行为或真实保存恢复已验证。
- 临时源文件：本轮临时源码缓存（未纳入仓库）；固定上游SHA如上。若要正式source-port，先在独立任务里确认主方案选型与依赖闭包，再做生产接入和真实任务验收。
