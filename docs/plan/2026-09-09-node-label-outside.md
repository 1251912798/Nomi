# 节点镜头标签框外归位

状态：🚧 进行中。依据用户 2026-09-09 02:05、02:20、22:45 裁决；03:00 媒体内上下角方案作废。

## 真实摩擦与方案
镜头号落在图片左下、标题随生成状态换位置，用户看图还要避开常驻标记。统一在 BaseGenerationNode 框外左上标签行承载镜头号、标题、参考与状态；动作条在标签行上方。标签用次级墨色和小字阶，不铺强调底。
标签随节点缩放；低于 40% 隐藏整行（20% 全景只看构图，放大恢复），不做反向放大挤占邻图。标签行固定单行，长标题截断。动作条仍保留现有反向缩放，底边始终在标签上方；菜单向上展开。

## 范围与边界
生产改动为 src/workbench/generationCanvas/nodes/** 及本次授权的 components/LightweightGenerationNode.tsx；增加测试、设计实验室 specimen 与证据文档。冻结 reactFlow/**，不改节点数据、视口与依赖；旧视觉基线仅准更新文末列出的 26 张。回滚通过撤销本任务提交，持久化无迁移。

## 根因
ShotPreviewOverlays 在 ConvertShotToVideoButton.tsx:14 写死 bottom；BaseGenerationNode.tsx:429 状态头独立 top；NodeImagePreviewActions.tsx:29 另有图片底部标题。缺少媒体与常驻信息互斥的共同边界，属 recurring。
沿用本仓 FloatingToolbarShell 和 EditableNodeTitle，不引入库或新框架层。任务已给出明确形态裁决，使用现有 CSS 定位能力；外部格式与供应商契约不涉及。

## 先查别人
- 仓库已有浮条：`src/workbench/generationCanvas/nodes/NodeFloatingToolbar.tsx:18`，复用定位容器，给框外标签留固定间距，不造另一套 toolbar。
- 仓库已有标题编辑：`src/workbench/generationCanvas/nodes/render/EditableNodeTitle.tsx:23`，复用更新节点标题、Enter 保存和 Escape 撤销，不改数据契约。
- 依赖已有事件语义：[React 官方 common DOM 文档](https://react.dev/reference/react-dom/components/common#handling-focus-events)，Context7 已核对 pointer enter/leave 与 subtree focus；原生 video 控件不自研。
- 用户任务书提供 02:05 / 02:20 / 22:45 产品裁决与截图，媒体与标签的位置由该裁决决定；本次没有选型或第三方格式接入。

## 验收
先记录空/图片现状与遮挡面积红测，再实施；空、图片、视频、选中、放大、20%/40%/100%/200% 布局，覆盖面积为零且标签与动作条不相交。新增实验室 specimen，定向更新获准的 26 张旧基线。Electron 真实渲染与用户交互验证。按簇正常 hooks 提交，再运行完整 python3 scripts/with-gates-lock.py -- pnpm run gates；exit 0 后才 push/PR。

## 常驻覆盖层盘点

| 元素 / 入口 | 处理 | 媒体关系 |
|---|---|---|
| 镜头号 ShotPreviewOverlays | 移入框外 NodeLabelRow | 空、图、视频共用位置 |
| 图片标题 NodeInlineImageTitle | 移入同一行，保留编辑 | 删除生成后图内右下标题 |
| 参考角色/场景 ShotMountBadges | 移入同一行 | 不再占图片左下 |
| 生成状态 NodeGenerationStatus | 移入同一行 | 不再占图片左上 |
| 技术自检、独立副本 | 随共同头部移到框外 | 不再压媒体 |
| 视频已拆解 / 拆解结果 | 两个重复入口合为框外一个按钮 | 两个自动化锚点指向同一按钮，功能不丢 |
| 放大、生成记录、下载、图像/视频动作 | 保留选中时框外动作条，上移到标签行上方 | 原有放大钮已被去重，无常驻图内按钮 |
| 转视频 | 当前镜头编号组件只剩编号，无转视频覆盖按钮 | 转换能力由既有生成入口负责 |
| 时间轴拖动缺口 | 原有 hover/focus 才出现 | 非常驻；侧向拖动钮本就位于框外 |
| 视频原生播放器控件 | 保留浏览器 hover 播放控件 | 非常驻自绘元数据 |
| 生成动效、错误/恢复报告、裁剪网格 | 保留任务进行/错误/用户编辑时的内容状态 | 不属于正常预览的常驻元数据 |
| 场景卡沉浸式信息条 | 改为 hover / 编辑时显现 | 正常浏览零常驻遮挡 |
| 角色/道具卡标题与计数 | 保留独立媒体下方信息区 | 本来不叠在媒体上 |
| 结果历史、预览弹层 | 用户主动打开才出现 | 图像预览顶部预留 pt-16，标题与关闭按钮不占图 |

## 检查记录
- 安装与 delivery:preflight exit 0；任务基线 13bd6a73a9f41ffa7c59de08cde9ff2d9a1b7f15。
- 红测：真实 Electron 渲染，空/图片镜头标签遮挡面积 1181.359375 CSS px²。
- 首轮绿测：空/图/视频 × 20%/40%/100%/200%，12 组面积均 0，动作条底边严格高于标签行顶边。
- 未触发模型生成，验收额度 0。模型雷达独立运行：新增条目 6，apimart-llm 因凭据加密未查成，不更新基线；雷达产物不纳入本任务。
- React 事件语义经 Context7 核对（2026-09-09）：https://react.dev/reference/react-dom/components/common#handling-focus-events — onBlur 使用 currentTarget.contains(relatedTarget) 区分离开播放器与在内部控件间切换；onPointerEnter/onPointerLeave 管悬停。保留原生 video 控件与原有播放守卫，没有自造播放器。
- 原生视频控件补充：暂停时浏览器也可能常显，因此由 NodeVideoPlaybackGuard 明确限定 hover / keyboard focus 时启用 controls，移出与失焦即还原干净画面。
- 任意正缩放的几何保证：标签行相对媒体顶边覆盖 [-34z, -6z]，浮条底边位于 -40z，两者间距恒为 6z > 0；浮条反向缩放以底边为原点，不改变该间距。20% 时标签不可见；其余正缩放不依赖尺寸探测或视口层补丁。
- 真实项目链路：三镜存量项目从项目库打开，点击「适应视图」，真实 React Flow 画布改名、拖动后检查标签仍在框外，再双击图片放大、Escape 关闭；白天/夜间主题均已目视，截图见 project-three-shots / project-renamed-dragged / project-expanded。

## 收尾授权与保留边界
- 用户收尾任务书已授权 `components/LightweightGenerationNode.tsx`：>80 节点轻量 body 也复用 NodeLabelRow，删除底部标题/状态覆盖层。81 节点真实项目红测面积 2826 CSS px²；同一测试接入主验收脚本，修后必须归零。
- C09：真实 React Flow 视口没有覆盖上游 minZoom=0.5（node_modules/@xyflow/react/dist/esm/index.mjs:3745），滑条 min=20 与真实下限不一致。任务冻结 reactFlow/**，本任务不改该层。节点宿主夹具 20% 隐藏/无碰撞通过，不等于实际画布 20% 已验收；正式 20% 视口验收需 C09 解冻后接力。
- C09 留给 #646 合后；本任务不改 reactFlow/**，不宣称真实画布 20% 验收完成。

## 历史门禁与定向基线更新

已同步最新基线 f708568dfc19（无冲突）。第三轮完整合同门禁跑完：视觉 26 旧图失败（24 process-feedback + 2 depth-action），其余 128 视觉检查通过，新增 specimen 通过。其余阻断项已修正并复查。任务禁重录旧基线，未进行更新、提交、推送或建 PR；已请求仅 26 图的授权。根因合同仍明示轻量节点范围外缺口与 C09 冻结限制。


用户已授权仅更新第三轮门禁失败的 26 张旧基线（24 process-feedback、2 depth-action）。从该轮保存的实际渲染图定向复制，未运行全量 design-lab:update；后续完整 gates 再逐像素核验。三组前后并排覆盖生成状态、实时预览、暗色视频动作条；depth-action 媒体中的“镜头 1”是夹具图像自身的内容，唯一变更为框外动作条上移。

### 授权的 26 张旧基线

- `tests/ux/design-lab/__baselines__/process-feedback/pf-fx-organic.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-fx-generating.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-fx-preview-reveal.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-fx-final-reveal.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-fx-done-clean.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-fx-reduced.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-image-queued.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-image-submitting.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-image-generating.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-image-finalizing.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-image-failed.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-video-queued.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-video-submitting.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-video-generating.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-video-finalizing.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-video-failed.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-audio-queued.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-audio-submitting.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-audio-generating.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-audio-finalizing.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-preview.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-late.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-zoom-60.png`
- `tests/ux/design-lab/__baselines__/process-feedback/pf-preview-dark.png`
- `tests/ux/design-lab/__baselines__/depth-action/depth-action-01-toolbar.png`
- `tests/ux/design-lab/__baselines__/depth-action/depth-action-01-toolbar-dark.png`

## 收尾验收收据

- 同一 Electron 验收脚本先红 exit 1（轻量节点常驻文字遮挡 2826 CSS px²），应用获准补丁后绿 exit 0（面积 0）。标准节点 12 组几何检查、元数据共存、鼠标/键盘视频控件、真实项目改名/拖动/放大/关闭一并通过。
- 根因合同门禁通过；红绿收据见 [red-green.json](2026-09-09-node-label-evidence/red-green.json)。截图与三组前后并排见同目录。
- 已核对旧基线改动集合恰为授权的 26 张；另有此前已批准的新 specimen 一张。
- 最终完整 gates 的 exit code 和精确 head 以 PR 收据为准；gates-result.txt 仅保留授权前第三轮失败历史。

## PR #684 字阶修复计划（2026-09-09）

CI run 34347335160 的 Electron smoke 报 font-size 新增 1；本地 smoke 同样 exit 1，artifacts/feel/smoke-8f1ebda1-956b-43ea-9792-758d681e95a3/new-surfaces.json 记录镜头号和标题为 11px。规则 DEFAULT_RULES.minFontSize=12；caption=12，micro=11。
根因是框外常驻 metadata 错用角标字阶，且子组件重复覆盖字号；普通空/图/视频和 >80 节点轻量 body 都可复发。NodeLabelRow 负责 caption 字阶，子项继承（带自身字阶的共享控件明确 text-[length:inherit]）。保留次级墨色和所有几何/视口行为，不动 reactFlow/** 或体感规则/容差。同步设计文档与现有 v3 合同，扩充 Electron 回归验证元数据和轻量路径的实际字号。
先跑红回归；修后重建 Tailwind/生产包、smoke 和标签真实旅程、tokens。只更新本 PR 新增 canvas-frame-shot-label-outside specimen；旧基线若出现真实漂移先报告。最后完整 with-gates-lock gates exit 0，正常 hooks commit/push。回滚用本次提交的 revert，无数据迁移。

字阶红绿收据：新增 scanFeel 回归先在 empty/0.4 抓到镜头号/标题 11px（/tmp/nomi-label-font-red.log）；修后 node-label-outside.e2e.mjs exit 0，涵盖空/图/视频各缩放、参考/状态/拆解、真实项目改名/拖动/放大/关闭和 81 节点轻量路径。smoke exit 0（17 assertions），check:tokens exit 0，build exit 0。新 specimen 定向更新 1 张；现有体感规则、容差与旧视觉基线未改。此次截图保存在 /tmp/nomi-label-font-evidence，目视确认白底 specimen 与暗色真实项目均保持次级墨色和框外位置。
