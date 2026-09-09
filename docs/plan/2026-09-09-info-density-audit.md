# 信息密度审计 · 2026-09-09

状态：📎 审计完成，测试侧观察规则已实现；不代表生产体验已修复。

## 范围与验收

在既有 `docs/info-density-audit-20260909` 分支工作；preflight 基线 `982fb39711e84f9f3fb9aee36a73e2ca6e9e5a42`，同 origin/main 且干净。只读 human 与 gate5f 截图、增补 C19/C20 和既有台账；遍历所有指定面，区分实见、代码候选和未覆盖状态。只修改测试侧 observer、其浏览器夹具和本文档；不改生产代码、不碰 #646 冻结区、不修改证据源、不打包、不调用付费模型。

回滚：撤销本任务测试与文档的 scoped diff 即可，无持久化迁移。验收：5 行准备工具夹具在规则前失败、后通过；同容器/连续性/可见性/数字时间归一化反例；记录模式不阻断且原规则语义保持；完整 `python3 scripts/with-gates-lock.py -- pnpm run gates` exit 0 后正常 hooks commit/push 和 PR。

根因分类 recurring：过程事件一条条渲染不等于用户任务摘要；工具、任务与通知均可能反复进入。生产侧缺少展示聚合与恢复语义的不变量，本次只补最早共享测试 checkpoint 的观察能力，不伪造生产修复合同或声称测试能阻止体验复发。第三方生命周期 not-applicable：沿用已安装 Playwright DOM evaluate，无新增依赖或外部契约。

## 先查别人

- 仓库已有观察入口：`tests/ux/_feel-observer.mjs:137` 的共享 checkpoint 负责截图/状态等待后的扫描、记录和棘轮比较；本次在这里补规则，不另起扫描框架，也不改 `_feel.mjs` 旧规则。
- 依赖已有通知去重能力：`node_modules/@mantine/notifications/lib/notifications.store.d.ts:5` 已支持通知 id，`:24` 有 limit，`:33` 有 updateNotification；生产入口 `src/ui/toast.tsx:96` 已用 id 更新。因此 C23 应传递任务身份并复用现有更新机制，不自研第二个通知中心。
- 仓库已有局部聚合：`src/workbench/ai/v4/agentPanelV4Collapse.ts:65` 已聚合同类工具，`src/workbench/creation/storyboard/StoryboardPlanStrategyPanel.tsx:72` 已聚合同类 blocker；本次定位这些既有边界为何漏掉思考穿插/回合结束，不提议平行生产实现。
- 浏览器能力沿用已安装 Playwright 的 page.evaluate 与原生 DOM Range；本次只增加项目特定的“连续同文兄弟行”启发式，无新增第三方框架或外部文件格式。生态产品重设计不在本次实施范围；正式生产修法仍需对应样张与评审。TikHub/付费调研按用户“不花额度”约束未运行，不把未查写成没有先例。

## 结论与证据边界

180 张源 PNG 已逐张查看（138 张 human，42 张 gate5f，含 22 张素材帧而非 UI），逐张清单见末尾。对缺少现场状态的面，补拍实际生产组件，使用离线夹具数据、1280×900、生产 Tailwind/Mantine 样式；外网请求全部阻断，无模型调用。组件夹具证明展示行为，不冒充真实导出或导入旅程。最初缺 CSS 的试拍已弃用；本目录保存的是样式加载后的截图。模型页离线组件只到加载态，因此模型页结论使用 human 074–081。

本次登记 13 条发现，归入既有 C20 与新簇 C21–C24；另外列出代码候选与排除项。C03/C04/C15 不新开重复簇，模型名截断仍归 C02，审批详情高度仍归 C05。冻结列表示**建议实施是否可能触及**冻结区，本 PR 实际不修改任何生产文件。

原始证据前缀：H = `/Users/aoqimin/Desktop/Nomi-switch-gate/artifacts/human-20260909/`；G = `/Users/aoqimin/Desktop/Nomi-switch-gate/artifacts/sweep/gate5f-20260909/`。下表 H 的编号可在逐张清单定位完整文件名；关键原图只读复制进 [证据目录](info-density-evidence/)。代码行号基于 `982fb3971`；交付前已快进整合 `4e4df2703`（这四个新增提交未改下表生产文件）。

## 全面逐项对账

| 面 / 编号 | 证据截图与代码 file:line | 人看到什么 | 判据 | 建议折成什么样 | 簇 | #646 冻结 |
|---|---|---|---|---|---|---|
| Agent 过程 D01 | H022/023；`src/workbench/ai/v4/agentPanelV4Collapse.ts:26`、`:65`、`:86`；`useAgentPanelV4Data.ts:369` | 5 次准备工具之间夹思考条目，工具分组存在却被打断；每行都有“其他设置 1 项/完成” | 1、6 | 按一次用户任务聚合“已准备 5 步”，当前步骤与需要决定项常驻，详情展开 | C20 | 展示修法不碰；若补 lane 事件语义则是 |
| Agent 结束 D02 | H056/057；`src/workbench/ai/v4/AgentPanelV4Panel.tsx:264`；`agentPanelV4Collapse.ts:86` | 已进入确认/结果阶段，准备步骤与旧错误仍占据消息流；没有按回合结束收束 | 4 | 一条回合结果 + 折叠执行记录；未解决阻塞单独保留 | C20 | 同 D01 |
| Agent 失败 D03 | H023/024/056；`src/workbench/ai/v4/AgentPanelV4Receipt.tsx:13`、`:38`、`:79`；`src/workbench/ai/resident/residentToolDisplay.ts:453` | “参数不合法/失败”没有说明系统是否已纠正、用户是否还要做事；后续审批出现也无法消除这份疑问 | 3 | “参数已纠正，继续准备”或“仍需补充 X”；恢复成功降为历史详情，真实阻塞给一个下一步 | C22（C20 子表现） | 投影可在 v4；若事件未提供恢复关联需 lane，冻结后实施 |
| 任务中心历史 D04 | [真实组件](info-density-evidence/component-tasks.png)；`src/workbench/taskCenter/TaskCenterPanel.tsx:278`、`:281` | 三条成功逐行重复“导出完成”，终态占据任务面板；失败也列在“已完成 4”之下 | 1、4、6 | 当前进行中 + 待处理失败 + “已结束 3 项”默认折叠，结果可查 | C20 | 否 |
| 导出结果 D05 | [真实组件](info-density-evidence/component-tasks.png)；`src/workbench/taskCenter/exportJobTaskCenter.ts:28`、`:39`；`TaskCenterPanel.tsx:401` | “导出失败”无原因也无动作；成功行同样不能从任务中心打开结果 | 3 | 失败给安全原因分类与“返回导出/重试”；成功摘要有“查看成片” | C22 | 否 |
| 通知/toast D06 | [真实组件](info-density-evidence/component-toast.png)；`src/ui/toast.tsx:96`；`src/NomiAppProviders.tsx:24` | 五次相同失败请求显示两个相同红提示，其余排队；关闭不是修复动作 | 2、3（不是同屏≥3） | 同一任务同一原因更新同一个通知，显示数量与下一步；不按纯文案跨任务误合并 | C23 | 否 |
| 素材库错误 D07 | H108–113 证明真实入口；D06 用同一 toast 与现有错误文案复现；`src/workbench/assets/AssetLibraryPanel.tsx:288`、`:302`、`:517` | 导入/音频导入/删除异常只弹泛化失败，不能判断权限、格式或重试是否可行；截图不是实际失败导入 | 3 | 共享操作结果投影提供安全原因、受影响数量、可执行动作；保留已有“跳过 N 项”聚合 | C22 | 否 |
| 画布占位 D08 | H090/106；`src/workbench/generationCanvas/nodes/render/CardCommon.tsx:169`；`NodeEmptyState.tsx:14` | 整段提示词铺在空图片/视频节点里，选中后下方 composer 又显示一遍 | 5、6 | 占位只留下一步，提示词只在编辑位置完整显示；非选中卡最多一句识别摘要 | C21 | 共享 render 不碰 reactFlow；若挪宿主布局需复核 |
| 分镜默认说明 D09 | H060/062/064；`src/workbench/creation/storyboard/shotRow/ShotReferenceZone.tsx:215`；`StoryboardPlanStrategyPanel.tsx:75` | 每个文生视频镜头重复“无需参考图”类说明，顶部还常驻“一切合法无需调整” | 6 | 默认合法用静默表达；共同模式表头说明一次，只突出例外或可行动的缺口 | C24 | 否 |
| 预览/时间轴空态 D10 | H130–134；`src/workbench/timeline/TimelineTrack.tsx:313`；`src/workbench/timeline/TimelineTextTrack.tsx:151`；`PreviewSourcePanel.tsx:69` | 左侧“去生成”、中央“从生成区拖入素材”、多个空轨道再各说一次拖入提示 | 6 | 整个编辑面一个主入口；轨道只留名称与必要落点，首次有素材后撤掉教学 | C24 | 否 |
| 设置 AI 策略 D11 | [真实组件](info-density-evidence/component-ai.png)；`src/workbench/settings/AiModelsSection.tsx:253`、`:292` | 上传区同时解释公网转换、API 优先级、公共 Relay、匿名图床；首屏多行实现说明挤走实际策略 | 5 | 常驻“当前上传通道 + 隐私影响 + 配置入口”；技术回退链放已有高级展开，保留明确同意 | C24 | 否 |
| 设置通用 D12 | [真实组件](info-density-evidence/component-general.png)；`src/workbench/settings/CanvasGestureSection.tsx:29`、`:56` | 选滚轮缩放/平移时要读一段空白拖动、Shift 框选、ComfyUI 的说明，与当下选择无关 | 5、6 | 留当前手势效果一句，完整画布教学归帮助入口；开关含义不隐藏 | C24 | 否 |
| 设置自动化 D13 | [权限行](info-density-evidence/component-automation-hosts.png)；`src/workbench/settings/AutomationPermissionsSection.tsx:194`、`:246` | 顶部与“预算内继续”重复边界说明；hosts 各行相同权限说明，但开关代表不同授权对象，不能合并开关 | 2、6 | 共享权限说明一次，各授权开关保留；付费/不可逆边界仍必须明确 | C24 | 否 |
| 设置文件错误（候选） | [默认态](info-density-evidence/component-file.png)；`src/workbench/settings/ProjectLocationSection.tsx:85` | 代码同一 catch 写 inline feedback 又 toast；尚无失败态截图，不声称现场重现 | 2、3 候选 | 操作附近一处呈现原因与下一步，toast 仅在用户离开相关面时提醒 | C22/C23 候选 | 否 |
| 审批卡（既有） | H026–055；`src/workbench/ai/v4/AgentPanelV4Cards.tsx:237`、`:314` | 每项已有详情开关，全收起也存在；多项被手动展开后确认落到可视区外 | C05 已有，不新记“没有折叠” | 后续 C05 处理滚动与确认可达性，不能无差别隐藏待批准内容 | C05 | v4 否，lane 若变审批契约则是 |
| 消息流/模型钮（既有） | H013/022/135；G nano/02.png；`AgentPanelV4Panel.tsx:128`；`AgentPanelV4Composer.tsx:206` | 思考块/原文与模型截断已有 C03/C15/C02；最终表格存在“还有 N 行·展开” | 不重复 | 沿用原簇与原验收，不另开平行修法 | C02/C03/C15 | lane 可能 |
| 分镜警告（已有改善） | 既有台账 C04；H060 当前无该告警；`StoryboardPlanStrategyPanel.tsx:72`、`:141`；`strategyText.ts` 的 `aggregateIssues` | 当前 HEAD 已按原因聚合 blockers，也有无模型“去设置”；不能引用旧 raw map 当当前实现 | 不重复 | 在 C04 原簇验证聚合键与不同原因不误合并 | C04 | 否 |
| 画布错误/徽标（未见新同类） | H088–106；G submitted；`src/workbench/generationCanvas/nodes/ClipNodePreview.tsx:100` | 已有恢复/失败分支；现场主要是 C08 缩略图加载失败与已生成矛盾，不新增一簇 | 原簇 | 保持状态/恢复语义一致；本次没有真实供应商错误新截图 | C08 | reactFlow 宿主可能 |
| 导出进度（排除） | G deepseek/05.png、06.png 证明预览入口；`src/workbench/preview/TimelinePreview.tsx:588` | 代码为单一进度位置替换阶段，不按事件追加；成功主动显示文件位置；失败 toast 缺恢复语义归 D05 类 | 不新记 | 保留单一进度；错误沿 C22，不另造导出专用展示系统 | C22 类入口 | 否 |
| 素材/技能/提示词库（排除） | H108–128；`src/workbench/assets/AssetLibraryPanel.tsx:663`、`:689` | 空态短，列表虚拟化；技能卡操作分别作用于不同技能，提示词预览是用户主动查阅内容 | 未命中 | 不把有行动价值的卡片或主动编辑内容折掉 | — | 否 |
| 设置文件/模型/关于（排除） | H074–081；[文件](info-density-evidence/component-file.png)、[关于](info-density-evidence/component-about.png)；`SettingsDialog.tsx`、`TelemetrySection.tsx:87` | 文件迁移已有“查看 3 步”，模型详情已有分组，诊断日志由用户主动展开且限 20 条；关于入口简短 | 未命中 | 保留；离线截图不能证明桌面更新失败态正常 | — | 否 |
| 项目库（排除） | H003–006；`src/workbench/library/ProjectLibraryPage.tsx:412`、`:484` | 项目卡是打开项目入口；错误态与空态分开且有重试，不是过程日志 | 未命中 | 不按卡片外形相同就合并；大量项目状态未获现场证据 | — | 否 |

路径核对：需求的 `src/workbench/storyboard/` 实际为 `src/workbench/creation/storyboard/`。扫描 `src/workbench/ai/lane/` 与 resident 展示入口后，实际可见流由 v4 外壳和 collapse 投影驱动；没有修改冻结区。未发现独立“通知中心”页面，实际入口为统一 toast、任务中心及系统批次通知。`useBatchFinishNotifier.ts:20`/`:36` 已按批次去重，G 两个 submitted 图均是一条“已完成 8 个”，应保留，不能当每项轰炸证据。

## 根因聚簇与通用修法

| 簇 | 根因 / 最早共享 owner | 通用修法（本次只建议） | 同类还能从哪里回来 |
|---|---|---|---|
| C20 | 展示投影把相邻事件当成用户任务；思考事件割裂 work stretch，完成状态没有收束语义 | 在 `collapseV4Flow` 的任务投影及任务中心公共分组组件建立“当前 / 待决定 / 已结束摘要”，按任务身份聚合，不按模型名写分支；不同业务组件共享规则而不混用原始事件 schema | 重试、思考穿插、刷新恢复历史、新工具名、导出与生成混排 |
| C21 | `CardCommon` 把完整内容注入占位组件，展示和编辑各拥有一份原文 | 最早共享占位投影只给状态/下一步，完整 prompt 归编辑器；同一规则覆盖图片、视频和 3D 空节点 | 导入旧项目、不同模型、新节点类型、未选中节点或尺寸变小 |
| C22 | 结果投影只携带状态标签，缺安全原因/恢复结果/用户动作；旧失败与后续成功没有关联 | 共享操作结果投影保留安全错误分类、恢复关联、可执行动作，再供 receipt/task/toast 消费；不要把原始路径、供应商响应直接铺给用户，也不要给不可重试操作假按钮 | 导出、导入、删除、设置保存、任务重试、供应商自动修参；需用成功恢复与真阻塞成对验收 |
| C23 | 通知默认随机身份，同一问题每次调用创建一条；inline/toast 无单一展示归属 | 在统一通知入口按任务与原因更新通知，保留最新处理状态与次数；调用者指定结果身份，近处反馈与全局提醒只选一个 owner | 多文件导入、批量失败、轮询回调、重挂载、不同任务恰好同文案（不得误合并） |
| C24 | 容器、行、占位与设置说明各自完整教学，正常默认状态当信息反复输出 | 公共行/空态/设置 section 明确“容器教一次、行只讲差异”；共享说明折进已有高级/帮助入口，重要隐私与付费决定常驻 | 更多轨道、更多镜头、新权限客户端、翻译变长、首次进入和恢复旧工作区 |

优先次序：C22 真阻塞下一步 → C20 过程收束 → C21 占位原文重复 → C23 通知去重 → C24 默认说明去重。核心取舍：摘要降低常驻噪声，但不能吞掉需要用户决定的差异；审批内容、不同项目和不同授权对象必须保留可操作身份。这里没有获批生产样张，因此不越权实现这些 UI 修法。

## 发现即断言

`tests/ux/_feel-observer.mjs` 新增 `repeated-rows`：同一容器的连续可见兄弟行，去除数字、ISO 日期和时分秒后文本相同，≥3 行记录一组。利用真实文本范围与祖先裁剪排除隐藏、关闭 details、滚动视区外内容；每次共享 checkpoint 自动扫描。所有 journey 均仅记录，显式登记零基线也不阻断；原 font-size/overlap 等规则继续原有棘轮行为。

[先红](info-density-evidence/red.log)：5 行“准备工具 · 参数 其他设置 N 项 · ✓完成 时间”期望 1 组，旧实现得到 0；[后绿](info-density-evidence/green.log)：observer 4 测试通过。[完整浏览器套件](info-density-evidence/browser-suite.log)：14/14 通过，含精确 3 行门槛、不可点击但可见的文本行、2 行反例、中间不同文字、不同父容器、隐藏/折叠/裁剪内容，以及已有规则行为。

边界：这是候选发现器，不是行动价值判官；数字不同的订单/镜头等有意义内容也可能命中，所以不阻断。不同文字的“思考”行穿插会切断严格连续组，不能单凭本规则捕获整个 C20；人工跨回合审计仍必要。以可见文本与 DOM 兄弟关系工作，不分析图像内文字、跨容器语义或未进入可视区的历史记录。旧规则语义和生产行为均未改变。

## 逐张查看清单

以下每行是一张已查看原始图片，before/after 转场不当作稳定错误态。源目录保持只读；素材帧也列出，避免把遍历文件冒充 UI 覆盖。

| 文件（H / G 前缀见上） | 一句话观察 |
|---|---|
| `H/001-launch.png` | 启动占位，未见过程列表。 |
| `H/002-skip-intro-before.png` | 首次引导页面，不属于重复执行记录。 |
| `H/003-skip-intro-after.png` | 进入项目库的过渡帧，淡化外壳不当稳定错误。 |
| `H/004-new-project-before.png` | 进入项目库的过渡帧，淡化外壳不当稳定错误。 |
| `H/005-new-project-after.png` | 项目库仅一个项目入口，未见冗余过程行。 |
| `H/006-type-original-script-before.png` | 空创作区和简短 Agent 提示，未见成段堆叠。 |
| `H/007-type-original-script-after.png` | 输入脚本或模型菜单过程，内容/候选项有明确作用。 |
| `H/008-select-model-menu-before.png` | 输入脚本或模型菜单过程，内容/候选项有明确作用。 |
| `H/009-select-model-menu-after.png` | 输入脚本或模型菜单过程，内容/候选项有明确作用。 |
| `H/010-choose-dialog-model-before.png` | 输入脚本或模型菜单过程，内容/候选项有明确作用。 |
| `H/011-choose-dialog-model-after.png` | 输入脚本或模型菜单过程，内容/候选项有明确作用。 |
| `H/012-deepseek-v4-pro-before.png` | 输入脚本或模型菜单过程，内容/候选项有明确作用。 |
| `H/013-deepseek-v4-pro-after.png` | 已选模型钮出现截断，归既有 C02；输入过程不新开密度簇。 |
| `H/014-budget-update-in-document-before.png` | 已选模型钮出现截断，归既有 C02；输入过程不新开密度簇。 |
| `H/015-budget-update-in-document-after.png` | 已选模型钮出现截断，归既有 C02；输入过程不新开密度簇。 |
| `H/016-start-storyboard-before.png` | 已选模型钮出现截断，归既有 C02；输入过程不新开密度簇。 |
| `H/017-start-storyboard-after.png` | 已选模型钮出现截断，归既有 C02；输入过程不新开密度簇。 |
| `H/018-send-storyboard-request-before.png` | 已选模型钮出现截断，归既有 C02；输入过程不新开密度簇。 |
| `H/019-send-storyboard-request-after.png` | 已选模型钮出现截断，归既有 C02；输入过程不新开密度簇。 |
| `H/020-agent-wait-30.png` | 开始出现准备工具与思考，过程累积尚在继续。 |
| `H/021-agent-wait-60.png` | 开始出现准备工具与思考，过程累积尚在继续。 |
| `H/022-agent-wait-90.png` | 多条准备工具被思考行隔开，C20 关键证据。 |
| `H/023-agent-wait-120.png` | 参数不合法失败没有说明恢复或下一步。 |
| `H/024-agent-wait-150.png` | 审批出现而历史失败仍红，处理结果关系不清。 |
| `H/026-approval-shot-1-detail-before.png` | 审批镜头列表默认紧凑，单项具有展开入口。 |
| `H/027-approval-shot-1-detail-after.png` | 审批镜头列表默认紧凑，单项具有展开入口。 |
| `H/028-open-shot-1-before.png` | 审批镜头列表默认紧凑，单项具有展开入口。 |
| `H/029-open-shot-1-after.png` | 审批镜头列表默认紧凑，单项具有展开入口。 |
| `H/030-open-shot-2-before.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/031-open-shot-2-after.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/032-open-shot-3-before.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/033-open-shot-3-after.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/034-open-shot-4-before.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/035-open-shot-4-after.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/036-open-shot-5-before.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/037-open-shot-5-after.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/038-open-shot-6-before.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/039-open-shot-6-after.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/040-open-shot-7-before.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/041-open-shot-7-after.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/042-open-shot-8-before.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/043-open-shot-8-after.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/044-confirm-eight-shot-plan-before.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/045-confirm-eight-shot-plan-after.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/046-scroll-approval-before.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/047-scroll-approval-after.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/048-approval-scroll-result.png` | 逐项展开审批详情后列表长，归 C05 可达性，不能说完全没有折叠。 |
| `H/049-collapse-read-details-before.png` | 多项展开占据审批卡，确认可达性仍需 C05 处理。 |
| `H/050-collapse-read-details-after.png` | 收起后恢复紧凑列表，证明折叠已有。 |
| `H/051-read-shot-7-before.png` | 收起后恢复紧凑列表，证明折叠已有。 |
| `H/052-read-shot-7-after.png` | 单个后排镜头详情展开，内容由用户主动查看。 |
| `H/053-read-shot-8-before.png` | 单个后排镜头详情展开，内容由用户主动查看。 |
| `H/054-read-shot-8-after.png` | 单个后排镜头详情展开，内容由用户主动查看。 |
| `H/055-confirm-plan-before.png` | 紧凑审批卡能看到确认入口。 |
| `H/056-confirm-plan-after.png` | 批准后准备步骤和旧失败仍占消息区。 |
| `H/057-open-storyboard-before.png` | 结果表格已有“还有 N 行·展开”，过程历史未整体收束。 |
| `H/058-open-storyboard-after.png` | 结果表格已有“还有 N 行·展开”，过程历史未整体收束。 |
| `H/059-open-plan-draft-before.png` | 结果表格已有“还有 N 行·展开”，过程历史未整体收束。 |
| `H/060-open-plan-draft-after.png` | 分镜行重复参考图默认说明，顶部合法提示常驻。 |
| `H/061-inspect-shots-3-5-before.png` | 分镜行重复参考图默认说明，顶部合法提示常驻。 |
| `H/062-inspect-shots-3-5-after.png` | 分镜行重复参考图默认说明，顶部合法提示常驻。 |
| `H/063-inspect-shots-6-8-before.png` | 分镜行重复参考图默认说明，顶部合法提示常驻。 |
| `H/064-inspect-shots-6-8-after.png` | 分镜行重复参考图默认说明，顶部合法提示常驻。 |
| `H/065-quote-eight-shots-before.png` | 分镜行重复参考图默认说明，顶部合法提示常驻。 |
| `H/066-quote-eight-shots-after.png` | 批量生成确认显示长预计时间，归已有 C06。 |
| `H/067-cancel-eight-video-confirm-before.png` | 批量生成确认显示长预计时间，归已有 C06。 |
| `H/068-cancel-eight-video-confirm-after.png` | 取消确认后返回分镜，不新登记重复告警。 |
| `H/069-single-video-quote-before.png` | 取消确认后返回分镜，不新登记重复告警。 |
| `H/070-single-video-quote-after.png` | 单镜确认仍显示估时，沿 C06。 |
| `H/071-cancel-single-unpriced-before.png` | 单镜确认仍显示估时，沿 C06。 |
| `H/072-cancel-single-unpriced-after.png` | 回到分镜与模型设置入口，没有新增过程列表。 |
| `H/073-inspect-model-billing-before.png` | 回到分镜与模型设置入口，没有新增过程列表。 |
| `H/074-inspect-model-billing-after.png` | 供应商与模型目录有分组/详情层级，选择项不当噪声。 |
| `H/075-apimart-detail-before.png` | 供应商与模型目录有分组/详情层级，选择项不当噪声。 |
| `H/076-apimart-detail-after.png` | 供应商与模型目录有分组/详情层级，选择项不当噪声。 |
| `H/077-h3-model-details-before.png` | 供应商与模型目录有分组/详情层级，选择项不当噪声。 |
| `H/078-h3-model-details-after.png` | 供应商与模型目录有分组/详情层级，选择项不当噪声。 |
| `H/079-close-model-detail-before.png` | 供应商与模型目录有分组/详情层级，选择项不当噪声。 |
| `H/080-close-model-detail-after.png` | 供应商与模型目录有分组/详情层级，选择项不当噪声。 |
| `H/081-close-settings-before.png` | 供应商与模型目录有分组/详情层级，选择项不当噪声。 |
| `H/082-close-settings-after.png` | 离开设置回工作区，Agent 历史重复问题沿 C20。 |
| `H/083-inspect-task-center-before.png` | 离开设置回工作区，Agent 历史重复问题沿 C20。 |
| `H/084-inspect-task-center-after.png` | 任务面板过渡帧，不据此判定已完成列表状态。 |
| `H/085-close-task-center-before.png` | 空任务中心提示简短；不能证明满载任务体验。 |
| `H/086-close-task-center-after.png` | 空任务中心提示简短；不能证明满载任务体验。 |
| `H/087-open-generation-canvas-before.png` | 空任务中心提示简短；不能证明满载任务体验。 |
| `H/088-open-generation-canvas-after.png` | 画布空节点开始显示提示词，占位内容需归位。 |
| `H/089-add-image-node-before.png` | 画布空节点开始显示提示词，占位内容需归位。 |
| `H/090-add-image-node-after.png` | 新增图节点与背景视频占位同屏；背景视频原文铺满卡片，图节点重复以 H106 为确证。 |
| `H/091-type-image-prompt-before.png` | 新增图节点与背景视频占位同屏；背景视频原文铺满卡片，图节点重复以 H106 为确证。 |
| `H/092-type-image-prompt-after.png` | 新增图节点与背景视频占位同屏；背景视频原文铺满卡片，图节点重复以 H106 为确证。 |
| `H/093-image-model-picker-before.png` | 新增图节点与背景视频占位同屏；背景视频原文铺满卡片，图节点重复以 H106 为确证。 |
| `H/094-image-model-picker-after.png` | 模型/比例选择弹层有独立操作价值，背景占位重复仍在。 |
| `H/095-choose-gpt-image-2-before.png` | 模型/比例选择弹层有独立操作价值，背景占位重复仍在。 |
| `H/096-choose-gpt-image-2-after.png` | 模型/比例选择弹层有独立操作价值，背景占位重复仍在。 |
| `H/097-image-parameters-before.png` | 模型/比例选择弹层有独立操作价值，背景占位重复仍在。 |
| `H/098-image-parameters-after.png` | 模型/比例选择弹层有独立操作价值，背景占位重复仍在。 |
| `H/099-set-image-16-9-1k-before.png` | 模型/比例选择弹层有独立操作价值，背景占位重复仍在。 |
| `H/100-set-image-16-9-1k-after.png` | 模型/比例选择弹层有独立操作价值，背景占位重复仍在。 |
| `H/101-correct-visible-image-prompt-before.png` | 返回选中图节点，完整提示词在占位和编辑区重复。 |
| `H/102-correct-visible-image-prompt-after.png` | 返回选中图节点，完整提示词在占位和编辑区重复。 |
| `H/103-duplicate-image-node-before.png` | 返回选中图节点，完整提示词在占位和编辑区重复。 |
| `H/104-duplicate-image-node-after.png` | 返回选中图节点，完整提示词在占位和编辑区重复。 |
| `H/105-second-image-prompt-before.png` | 返回选中图节点，完整提示词在占位和编辑区重复。 |
| `H/106-second-image-prompt-after.png` | 返回选中图节点，完整提示词在占位和编辑区重复。 |
| `H/107-open-assets-before.png` | 返回选中图节点，完整提示词在占位和编辑区重复。 |
| `H/108-open-assets-after.png` | 素材库空态有上传入口，未实见导入错误。 |
| `H/109-search-assets-before.png` | 素材库空态有上传入口，未实见导入错误。 |
| `H/110-search-assets-after.png` | 素材库空态有上传入口，未实见导入错误。 |
| `H/111-asset-project-tab-before.png` | 素材库空态有上传入口，未实见导入错误。 |
| `H/112-asset-project-tab-after.png` | 素材库空态有上传入口，未实见导入错误。 |
| `H/113-open-skills-before.png` | 素材库空态有上传入口，未实见导入错误。 |
| `H/114-open-skills-after.png` | 技能空态为短标题加提示，没有满屏执行日志。 |
| `H/115-builtin-skills-before.png` | 技能空态为短标题加提示，没有满屏执行日志。 |
| `H/116-builtin-skills-after.png` | 技能卡共享动作文字但对应不同技能，不自动合并。 |
| `H/117-search-storyboard-skill-before.png` | 技能卡共享动作文字但对应不同技能，不自动合并。 |
| `H/118-search-storyboard-skill-after.png` | 技能筛选列表，条目有区别与操作价值。 |
| `H/119-skill-detail-before.png` | 技能筛选列表，条目有区别与操作价值。 |
| `H/120-skill-detail-after.png` | 技能筛选列表，条目有区别与操作价值。 |
| `H/121-open-prompts-before.png` | 技能筛选列表，条目有区别与操作价值。 |
| `H/122-open-prompts-after.png` | 提示词库加载帧，不以加载占位判断稳定内容。 |
| `H/123-search-prompts-before.png` | 提示词目录以缩略图呈现，非重复状态行。 |
| `H/124-search-prompts-after.png` | 搜索加载帧，需以后续已加载图判断。 |
| `H/125-prompt-detail-before.png` | 提示词搜索结果已显示，卡片是素材选择。 |
| `H/126-prompt-detail-after.png` | 提示词预览弹层打开过程。 |
| `H/127-close-prompt-detail-before.png` | 用户主动查看提示词全文，有送上画布/复制动作。 |
| `H/128-close-prompt-detail-after.png` | 关闭预览/切换工作区的过渡，不增报密度缺陷。 |
| `H/129-open-generation-timeline-before.png` | 关闭预览/切换工作区的过渡，不增报密度缺陷。 |
| `H/130-open-generation-timeline-after.png` | 时间轴多个空轨道各自提示，归 C24。 |
| `H/131-preview-workspace-before.png` | 时间轴多个空轨道各自提示，归 C24。 |
| `H/132-preview-workspace-after.png` | 源面板、中央预览和各空轨道重复教拖入素材。 |
| `H/133-inspect-export-before.png` | 源面板、中央预览和各空轨道重复教拖入素材。 |
| `H/134-inspect-export-after.png` | 源面板、中央预览和各空轨道重复教拖入素材。 |
| `H/135-return-creation-before-restart-before.png` | 手动展开助手表格；主动查看与默认铺开须区分。 |
| `H/136-return-creation-before-restart-after.png` | 回创作区与 token 信息弹层，未见新一类密度问题。 |
| `H/137-original-before-restart-before.png` | 回创作区与 token 信息弹层，未见新一类密度问题。 |
| `H/138-original-before-restart-after.png` | 回创作区与 token 信息弹层，未见新一类密度问题。 |
| `H/139-before-cold-restart.png` | 回创作区与 token 信息弹层，未见新一类密度问题。 |
| `G/deepseek/00.png` | 空工作台，未见重复过程。 |
| `G/deepseek/01.png` | 脚本已输入，原文问题沿 C15。 |
| `G/deepseek/02.png` | 分镜结果与助手摘要；长说明归既有 C03/C15。 |
| `G/deepseek/03.png` | 生成确认与结果摘要，保留有用决策信息。 |
| `G/deepseek/04.png` | 画布总览中节点缩小，沿 C09；助手原文沿既有簇。 |
| `G/deepseek/05.png` | 预览有色条素材与时间轴，未见导出过程日志列表。 |
| `G/deepseek/06.png` | 预览后续状态，时间轴不是重复过程行。 |
| `G/deepseek/C0-298ef605-02-approval.png` | 8 镜审批紧凑排列，详情问题沿 C05，不新报无折叠。 |
| `G/deepseek/C0-298ef605-04-submitted.png` | 一条“已完成 8 个”证明批次聚合；缩略图加载失败沿 C08。 |
| `G/deepseek/first.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/deepseek/last.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/deepseek/middle.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/deepseek/profile/projects/未命名项目 09_09 13_08-mttn1txh-81b4e2da/assets/generated/2026-09-09/frame-first-000ded92.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/deepseek/profile/projects/未命名项目 09_09 13_08-mttn1txh-81b4e2da/assets/generated/2026-09-09/frame-first-3c3ee893.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/deepseek/profile/projects/未命名项目 09_09 13_08-mttn1txh-81b4e2da/assets/generated/2026-09-09/frame-first-566b565a.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/deepseek/profile/projects/未命名项目 09_09 13_08-mttn1txh-81b4e2da/assets/generated/2026-09-09/frame-first-791cdf23.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/deepseek/profile/projects/未命名项目 09_09 13_08-mttn1txh-81b4e2da/assets/generated/2026-09-09/frame-first-a8d5c490.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/deepseek/profile/projects/未命名项目 09_09 13_08-mttn1txh-81b4e2da/assets/generated/2026-09-09/frame-first-e98920ea.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/deepseek/profile/projects/未命名项目 09_09 13_08-mttn1txh-81b4e2da/assets/generated/2026-09-09/frame-first-ed7667b9.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/deepseek/profile/projects/未命名项目 09_09 13_08-mttn1txh-81b4e2da/assets/generated/2026-09-09/frame-first-f75c91b1.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/deepseek/restart/07.png` | 重启保留分镜与缩略图状态，没有新增密度类型。 |
| `G/nano/00.png` | 空工作台，未见重复过程。 |
| `G/nano/01.png` | 脚本已输入，原文问题沿 C15。 |
| `G/nano/02.png` | 分镜结果与助手摘要；长说明归既有 C03/C15。 |
| `G/nano/03.png` | 生成确认与结果摘要，保留有用决策信息。 |
| `G/nano/04.png` | 画布总览中节点缩小，沿 C09；助手原文沿既有簇。 |
| `G/nano/05.png` | 预览有色条素材与时间轴，未见导出过程日志列表。 |
| `G/nano/06.png` | 预览后续状态，时间轴不是重复过程行。 |
| `G/nano/C0-298ef605-02-approval.png` | 8 镜审批紧凑排列，详情问题沿 C05，不新报无折叠。 |
| `G/nano/C0-298ef605-04-submitted.png` | 一条“已完成 8 个”证明批次聚合；缩略图加载失败沿 C08。 |
| `G/nano/first.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/nano/last.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/nano/middle.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/nano/profile/projects/未命名项目 09_09 13_14-mttn9enc-a2c5f2a1/assets/generated/2026-09-09/frame-first-049ea99c.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/nano/profile/projects/未命名项目 09_09 13_14-mttn9enc-a2c5f2a1/assets/generated/2026-09-09/frame-first-16db82a3.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/nano/profile/projects/未命名项目 09_09 13_14-mttn9enc-a2c5f2a1/assets/generated/2026-09-09/frame-first-2fcbcee5.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/nano/profile/projects/未命名项目 09_09 13_14-mttn9enc-a2c5f2a1/assets/generated/2026-09-09/frame-first-3a81c937.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/nano/profile/projects/未命名项目 09_09 13_14-mttn9enc-a2c5f2a1/assets/generated/2026-09-09/frame-first-8900a5f0.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/nano/profile/projects/未命名项目 09_09 13_14-mttn9enc-a2c5f2a1/assets/generated/2026-09-09/frame-first-a1c08c2d.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/nano/profile/projects/未命名项目 09_09 13_14-mttn9enc-a2c5f2a1/assets/generated/2026-09-09/frame-first-ba5a2347.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/nano/profile/projects/未命名项目 09_09 13_14-mttn9enc-a2c5f2a1/assets/generated/2026-09-09/frame-first-da0fa9a7.png` | 色条素材帧，不是 UI 截图，不能作为界面密度证据。 |
| `G/nano/restart/07.png` | 重启保留分镜与缩略图状态，没有新增密度类型。 |

组件补拍清单：`component-file.png`（迁移说明已有展开）；`component-ai.png`（上传链路说明挤占首屏）；`component-automation.png`（风险说明与授权入口）；`component-general.png`（手势说明段落）；`component-about.png`（简短入口）；`component-tasks.png`（三成功、一失败、一编码夹具）；`component-toast.png`（五请求但同屏仅两条）；`component-models.png`（离线加载态，不作目录证据）；`component-automation-hosts.png`（相同权限说明按客户端重复）。

补拍方法：直接挂载生产 `SettingsDialog`、`TaskCenterPanel` 和 `NomiAppProviders`；任务夹具依次传入 succeeded/succeeded/succeeded/failed/encoding 五个 exportJobs，通知夹具调用现有 `toast` 五次。使用新浏览器上下文且阻断非 127.0.0.1 请求；没有桌面 bridge 的设置按钮禁用属于夹具限制，不作为生产缺陷。

## 最终验证收据

完整 `python3 scripts/with-gates-lock.py -- pnpm run gates` exit 0（[摘要收据](info-density-evidence/gates-summary.log)）：全部阻断性门岗通过，Vitest 1303 文件/12116 测试通过，运行时测试与构建通过。早先两轮分别被临时截图脚本 lint 和缺失 prior-art 节阻断，已收敛后完整重跑；没有绕过 gate。文档索引/台账等既有 advisory 与构建体积 warning 不当作阻断，也没有抬高基线。
