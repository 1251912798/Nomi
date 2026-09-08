# director/panels/
> L2 | 父级: ../CLAUDE.md
> 导演台 V2 的 DOM 面板层：只组合 src/design 原语与 token 类名，业务全部通过 useDirectorStore 读写 model 层；three 世界经 ViewportApiContext 命令式调用。
> 成员清单
> EditorSplit.tsx: 两栏可拖分栏（横/纵），比例持久到 localStorage（nomi:director:split:*），指针捕获 + 方向键/Home/End
> Popover.tsx: 锚定浮层原语（上 / 下 / 右三向）：BodyPortal + 按触发器矩形 fixed 定位（分栏各自是层叠上下文，挂在触发器里会被兄弟面板盖住）、z 走 NOMI_OVERLAY_Z_INDEX.popover、外点（触发器 / 面板都算内）关闭、捕获期 Esc、data-nomi-escape-layer 让编辑器 Esc 让路 + PopoverItem
> CreationBar.tsx: 视口左缘竖向图标创建栏：角色（女/男 → 放置模式）、机位（选中主体时 14 预设、无主体只给「当前视角」，菜单头「相对主体：X」；预设机位直接叫预设名、新机位成为预览机位并取消主体选中）、灯光（3 种）、方块（画框模式）；创建入口互斥，主体预设组合完整父组得到图层局部位姿，当前视角则将世界机位逆转图层局部
> BottomBar.tsx: 视口底部居中一条图标胶囊：撤销/重做 ｜ 导入 720 全景 / 群众矩阵 / 骨骼与 IK 把手 / 画幅（8 比例 + free / 3 分辨率 / 三分线）/ AI 搭场景 / 截图 / 产出弹层
> usePanoramaImport.ts: 720 全景导入流程：类型 / 80MB 校验 → 读尺寸（非 2:1 软警告）→ object URL 先预览 → 资产桥落盘换托管 url → 无桌面运行时退回 data URL 并提示临时
> panoramaImport.ts: 720 全景导入校验常量（80MB 上限、2:1 ±3% 标准比例判定；切换门从 V1 入籍）
> imageFile.ts: 读图片尺寸 / 文件转 data URL（全景导入与资产库上传共用）
> LinkedAssetsContext.ts: 画布连线带进来的全景 / 泼溅 / 模型引用注入（DirectorEditor 提供，资产库只读消费，不入工程）
> CanvasImagesContext.ts: 注入 canvasImages collector 收集的当前/历史图片及标识，不按节点种类过滤；AI「从画布选」与签名共用结果
> ai/: AI 搭场景浮条，见 ai/CLAUDE.md
> dialogs/: 模态对话框（动作库弹窗 / 手机虚拟相机二维码），见 dialogs/CLAUDE.md
> outputs/: 产物弹层（截图 / 视频列表、发送到画布 / 删除），见 outputs/CLAUDE.md
> ModelDisplayModeSwitch.tsx: 视口右下胶囊：实体 / 半透 / 白模 三态 ｜ 偏好设置 / 帮助入口（无 handler 时隐藏）
> viewport/: 视口容器与叠加层，见 viewport/CLAUDE.md
> side/: 右栏上半（场景对象 / 资产库），见 side/CLAUDE.md
> inspector/: 右栏下半属性检查器，见 inspector/CLAUDE.md
> fields/: 检查器字段原语，见 fields/CLAUDE.md
> 法则: 成员完整·一行一文件·父级链接·技术词前置
> [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
