# Lovart 页面导航与 Nomi 现有 owner 接缝核查

日期：2026-10-12；固定源码基线 `0c1ed6a0c9421091f238413d682af97e9aa18d9d`。本报告作者只读 Nomi 本地源码，未操作 Lovart、未改产品、未迁移数据；主研究线的 Lovart 当前 UI 观察另见[页面与 Agent 联动](lovart-pages-interaction.md)。本报告不以用户描述或 UI 外观推定 Lovart 内部实现。

## 判断

**可以先复用 category 身份，把画布左侧分类导航改为顶部平面标签；但“分类换一种导航”与“任意业务对象都能放入自由页面”是两个不同的改动。** 当前 category 已经切开不同可见子画布，有独立坐标空间与运行期视口记忆，足以成为低成本导航起点。当前没有第二套页面 owner，也没有必要再建一张独立 graph。

如果页面 1/页面 2 是用户任意组织的设计页，且每页同时放角色、镜头、图片、视频、文档，就必须把“页面归属”和“角色/场景/镜头这类业务身份”解耦；只把目录树组件换成 Tabs 不能完成这个语义变化。建议方案明确这一条，避免第一版就在新 pageId 与旧 categoryId 上双写同一种归属。

## 当前真正的数据归属

| 内容 | 当前 owner / 行为 | 对页面导航的含义 |
|---|---|---|
| 顶层身份 | `workbenchStore.categories` 管 category 列表，`activeCategoryId` 管当前显示项；分类只有 id/name/order/isBuiltin 等，没有 parentId。内置 shots/cast/scene/prop/audio 带默认渲染语义。 | 顶层本来就是平面集合，可直接显示为标签；自定义分类可对应新增标签。内置名称、重命名/删除权限不会因换组件消失。 |
| 内容与层级 | 项目只有一份 generation graph；node.categoryId 是可见子画布归属，node.groupId / NodeGroup.nodeIds 是分组；组带 categoryId，没有组套组的 parent。 | 目录树显示“分类→组→节点”是投影，不是独立文件树。顶部标签替换顶层导航后，组仍应留在画布 Frame 和选中对象上下文中。 |
| 可见隔离 | React Flow 取当前 category 节点及组，边只有 source 与 target 都在本页才显示。节点坐标是每个 category 自己的可见空间。 | 这是呈现隔离，不能当权限/执行/模型上下文隔离。 |
| 视口 | `categoryViewports[categoryId]` 记录 zoom/offset，切分类会应用对应视口；离开项目清空。项目保存载荷没有 activeCategoryId/categoryViewports，恢复也没有读它们。 | 可复用会话内每页视口；“重启仍回到上次页面和缩放”需要增加正式持久化契约，当前未实现。 |
| 新建/删除 | addCategory 为自定义 id 新增通用外观；内置分类不可改名/删。deleteCategory 把节点重新归到 shots，解散该分类组并保留节点。 | 不能直接沿用为用户理解的“删除页面并删除其全部内容”；第一版须明确保留当前行为，或另行设计并验证删除语义。 |

依据：[分类身份与内置语义](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/project/projectCategories.ts#L25-L90)、[分类操作 owner](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/workbenchStore.ts#L252-L309)、[节点 / 平面组模型](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/model/generationCanvasTypes.ts#L173-L250)、[当前页过滤与跨页边隐藏](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/reactFlow/GenerationCanvasReactFlow.tsx#L154-L170)、[按分类恢复视口](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/reactFlow/GenerationCanvasReactFlow.tsx#L224-L264)、[项目读写快照](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/project/workbenchProjectSession.ts#L10-L40)、[项目释放清空视口](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/workbenchStoreLifetime.ts#L77-L87)。

## 生成、Agent 与跨页引用不是页签组件的责任

**生成属于项目中的具体 node / Run，不属于当前画面那一页。** 当前执行读取完整 graph 来解析参考，并冻结上游引用版本戳。因此切标签不能把已提交任务迁移到新页，也不能取消后台生成。已有 node.categoryId 与结果/Run 关联应继续保留；任务新产物回到原目标节点。未提交的反馈/草稿若要在切页后继续编辑，需要冻结发起页与对象，不能等 Agent 落地时再读 activeCategoryId。见 [全图生成引用与版本戳](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/runner/generationRunController.ts#L252-L259)。

**当前默认创建按业务 kind 分发，不保证落当前可见分类。** 共享 kind 默认映射把 character 放 cast、scene/director/model3d 放 scene、audio 放 audio，其余放 shots；Agent 批量创建路径也用 groupCategoryId 或 kind 默认分类。若在用户新建“页面 2”发“生成一个角色和三张海报”，换了 Tabs 仍可能把内容分散进既有分类。要实现自由页面，需在现有创建 admission / 草稿信封冻结目标 page/category，并在共享创建边界统一执行，业务 kind 不再兼任页面归属。见 [创建默认分类](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/model/generationCanvasTypes.ts#L25-L48)、[Agent 创建分发](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/agent/applyCanvasToolCall.ts#L502-L526)。

**当前 Agent 会话是项目对话，草稿/附件也是项目输入，未按 category 分会话。** 用户反馈指向具体对象时，现有同步输入冻结已经可用；但当前构造器使用完整 graph 的 selectedNodeIds，没有页身份作为独立目标字段。切页是否要保留手工引用、选中对象与未发送意见，需要交互契约明确；不能让隐藏页的旧选中被误解为新页选中。推荐继续同一 Agent 对话，显式显示“正在修改：页面 1 · 图片 A · 版本 3”；切页改变浏览，不静默改草稿目标。不要复制 runtime 或给每页另造 Agent 状态机。见 [Agent 输入冻结](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/ai/v4/useAgentPanelV4Actions.ts#L47-L83)、[项目对话与草稿归属](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/ai/ProjectAgentResidentShell.tsx#L95-L133)。

**跨页参考现成可执行，但跨页边在当前视图被隐藏。** 当前 generation resolver 接全图 nodes/edges；因此页面 2 的镜头仍可引用页面 1 的角色。不要为了“页面隔离”直接滤掉执行图的跨页边，造成参考丢失。应显示轻量引用签，例如“引用：页面 1 / 角色 A”，点击定位到来源页面；这只增加可见 provenance，不复制生成状态或媒体。当前左侧拖节点去另一分类走 copyNodeToCategory：新 nodeId、derivedFrom 指向源、独立历史/元数据副本，不是同一对象的跨页快捷方式或同步链接。见 [当前页过滤与跨页边隐藏](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/reactFlow/GenerationCanvasReactFlow.tsx#L154-L170)、[跨分类独立副本](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/store/canvasNodeActions.ts#L542-L582)、[全图生成引用与版本戳](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/generationCanvas/runner/generationRunController.ts#L252-L259)。

另外，`look_at_canvas` 当前投影返回全图节点/边/组，projectNode 的输出没有 categoryId/page 列表；category 仅进入后面的编号身份推导。自由页面进入 Agent 语义需要在现有 canvas.read 契约和输入上下文补充可读页身份、当前页及明确修改范围，不是只给系统 prompt 加“请看当前页”。见 [Agent 画布读面投影](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/electron/shared/agentCapabilities/canvasRead.ts#L319-L350)。

## 建议分两步承接，不建立并行 owner

1. **导航阶段**：按现有 categoryId 渲染顶部标签，隐藏/替换对应左侧树导航；“+”沿现有自定义 category 新建。保留原内置语义、跨页引用、组/Frame、现有生成门与项目 Agent。这阶段名称应如实体现分类/已有页名，不把五个业务区暗改成两个空白自由页；当前默认入页与删除行为明确标在方案合同里。
2. **自由页面阶段**：如最终确定所有业务对象可以混放任意页，统一选择一个归属 owner，迁移既有 category 业务耦合。可选择“现有 categoryId 升格页面归属，kind/role/shotOwner 承载业务身份”；不能新 pageId 只控制视觉、旧 categoryId 继续控制创建与编号。需一起处理默认创建、镜头编号/渲染推导、Agent 读写范围、页面删除/移动/复制、每页视口持久化，以及旧项目兼容。

现有 category migration 会按 kind 为缺失 categoryId 的节点补默认分类，并保留非空自定义 id；因此自由页上线时必须审计这一链，防止旧兼容路径把用户自由页再次分回业务区。这里不执行迁移，见 [旧分类兼容映射](https://github.com/aqm857886159/Nomi/blob/0c1ed6a0c9421091f238413d682af97e9aa18d9d/src/workbench/project/projectCategoryMigration.ts#L52-L73)。

底部评论/涂鸦与左侧 Agent 可以直接接前述媒体反馈方案：用户在对象上点评论/框选，冻结对象和发起页面，自动形成同一 composer 的可审阅引用；涂鸦默认是反馈覆盖层，明确选择内容编辑时才改媒体。用户只需表达改什么，不必再手工复制图片、补节点名和时间。上下文自动带入仍须清晰展示目标并允许移除；发送/执行沿现有 admission、附件与费用边界。

## 首次真实验证应覆盖

- 页面 A/B 同坐标节点、各自缩放；来回切页与退出重开分别验收，不混淆会话记忆与持久恢复。
- 页面 A 开始反馈→切 B→发送，仍指向 A 的冻结对象；隐藏页旧选中和主动跨页引用有明确区分。
- 页面 B 说“新建角色+海报”，明确验证实际落页；不能只看 tab 高亮。
- 页面 B 引用 A 的角色，生成/版本戳仍正确，跨页引用签可回到源；复制对象与引用同一对象区别可见。
- A 的后台生成中切 B，新结果回原 node/Run；删除/复制/重命名页面不把待发送意见或已提交任务挂错对象。

状态：研究提议；所有验证样本未运行，无 UI 实现、无数据迁移。
