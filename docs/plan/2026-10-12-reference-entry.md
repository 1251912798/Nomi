# 小鼠标参考入口与真实 Agent 附件

获批探索：2026-10-12 用户“可以”，原话“icon应该和我们的原来的一致”“那个小鼠标”。入口使用原有 IconPointer，旁边“参考”，打开图片节点即可看见。实现基线 origin/main 6d28f38632；独立线 reference_census。

类别：新界面/改交互、Agent行为、画布、数据格式。选择参考只准备输入，发送/生成仍由用户执行。

| 设计卡 | 决定与证据 |
| --- | --- |
| 1 用户怎么用 | 打开节点→看到参考→选素材或画布点选→原槽位显示→输入要求→用户生成；Agent→参考立即画布点选 / 原+批量上传 / @选现有素材→句中缩略图→分别写要求→发送。真实任务：本地人物定妆图生图、真实视频节点首尾帧、Agent参考图片与视频原件定向修改当前节点。主指标：首屏能找到参考（基线隐藏在+，目标直接可见）；质量：所选原件身份进入request（目标0静默丢失）；护栏：无自动生成/选源不改目标/已有槽不丢。按每步预期→实际记录，真实provider待验。 |
| 1b 连带界面 | 中文/英文参考按钮、picker点选、类型限制、附件准备失败与原导演台目标标签；原上传/拖放/粘贴/首尾帧/重排/@引用/撤销保留。完整普查见独立报告。 |
| 2 owner | Node: AssetReference→NodeParameterControls原槽写入与resolveReferenceSlots；点选只用canvasPickMode；Agent: useComposerAttachments→projectAgentAttachments→claims→main projectAssetStore→laneDesktopInput。来源选择不改selectedNodeIds，目标发送时走原captureSendContext。 |
| 3 复用 | 复用AssetPicker/AssetPickerPopover/IconPointer/AssetTile/原上传API/原main身份解析；不新增参考store、不从renderUrl直接发送vendor。 |
| 4 全状态 | 空入口常显；上传中附件不可发送；成功现有缩略图；失败保留可移除并重选；部分成功各附件独立；取消点选不写；失效main拒绝且保留草稿；槽满显示原因且可移除；没有参考槽的纯文本生成不捏造槽。zh/en i18n。 |
| 5 中途 | picker Esc/外点关而保留草稿；点选Esc/空白取消；上传关窗不自动发送；断网失败可移除重选；切项目由project context阻止跨项目落入；重启不恢复未持久化临时picker。所有准备过程不发起生成；发送ACK才清对应附件。 |
| 6 外部数据 | 现有main导入与项目绑定验证原件，renderer只声明身份；图片vision按原模型能力发送；视频/音频以可执行assetId素材引用进入prompt，用于生成参考和技术事实读取，不能声称模型已经理解画面/声音。原生视频/音频语义分析不在现有lane能力内。 |
| 7 性能 | 现有素材池；Agent选择按已有导入/列表边界，不复制本地原件；分页原件查找。1000素材与最大画布性能unverified。 |
| 8 条件 | macOS真Electron、中英/暗色/窄窗/键盘已走查（loopback文本supplier，0付费）；Windows/打包版/真实provider unverified，测试fixture不能替代。 |
| 9 验收 | red→green同类传输回归，入口原路径Electron截图，独立reference_census复核；提交前风险gates；PR不合并。回滚revert本任务commit，不改用户数据schema。 |

motion-contract：复用现有AnchoredPopover入退场、AssetTile450ms预览；不加自写动画，reduced-motion沿用已有实现。点选不缩放或移动目标。

拍板清单：docs/design/boards/2026-10-12/ReferenceEntry.board.json；阶段先用生产组件搭建并捕获真实截图，然后按清单核对。探索图不是生产合同。

最终交互合同（用户后续纠正优先）：
- 小鼠标「参考」一击进入现有canvasPickMode，不能先弹搜索；有声明槽的节点保留原队列末尾 / 各槽内+，不增加顶部+；无声明槽的fallback后方独立+打开原AssetPicker。Agent参考后原+保留直接multiple上传，不另加一个+。
- 用户后续拍板：Agent 只保留原小鼠标 IconPointer，去掉「参考」可见文字，与原 + 同为 24px 图标按钮；悬停说明、无障碍名称和一击点选行为保留。节点仍显示「参考」。
- Agent文字采用同一PromptEditor/AssetMention；打@或画布点选都落句中缩略图，不在顶部另排ready媒体chips。pending/error仍保留现有可移除状态；恢复草稿ready原件重新入句，未bound媒体不隐形。
- 最后一处引用删除同步移除claim；ACK期间编辑保留其仍引用的原件；编号按canonical assetId/version去重，与main manifest一致。Shift+Enter保留换行。
- 显式画布来源的精确resultId在发送时再验，沿用只读ContextSnapshot带@编号→源nodeId，不改默认选中target，不授予写权限。同原件被多个节点复用时如指令有歧义，需要明确节点名，不假定assetId唯一代表节点。

画布点选只取卡面当前主版本；当前版本重复/不支持时不可选，不能暗中改取历史版。历史精确版本仍可从原+素材选择器选择。

用户最终收窄：只实现原小鼠标入口和已确认的引用交互，删除自行添加的展示。声明了参考槽的节点保留原数组队列末尾+、首尾帧/源视频槽内+，撤掉新header+；无槽位fallback沿用原左输入owner的+；Agent保留原+。不添加目标标签、不另开上方媒体条、不新增按钮/提示/布局。
