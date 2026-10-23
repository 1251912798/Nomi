# 体验成绩单：画板打开就是画笔，完成后节点上显示画的那张图

- 改动：画板打开就是画笔，完成后节点上显示画的那张图
- 验收 head：`见提交说明（本次提交接在 10275c04b 之后）`（实现线本地提交（fix/whiteboard-open），未推送；数字在这个提交的构建和它的 Windows 打包版上测的）
- 场景 id：`whiteboard-first-gesture-and-visible-result`
- 谁验：R-whiteboard（实现线自测；独立验收线待协调指定）（实现线自测）
- 日期：2026-10-22；成绩单整理：R-whiteboard，按本次走查和打包版创作者路径的记录填写

**用户这次能完成：**打开画板直接拖就能画；按完成后，画板节点上看得见自己画的东西，能连下游当参考，点缩略图能接着画

**能力变化：**新增：画板节点有图时显示缩略图（点开重开）、性能场景 inline-whiteboard-done-export、「完成」出图期间按钮显示「保存中」（复用 NomiLoadingMark）；改变：打开画板默认工具：选择 → 画笔（两个入口）、画板「完成」：只存 state → 有内容就出一版图（推翻清单 O40）；去掉：载入原图时顺手切到「选择」并选中原图

## 结果

- 机器：完成 **4 / 7**（失败 3 条，原样列在下表，不丢）
- 首次尝试成功：null（未采集：需要真人首次操作，AI 不代填）

| 尝试 | 结果 | 说明 | 证据 |
| --- | --- | --- | --- |
| 修复前（203886f10）开发版创作者路径 zh：打开后直接拖 | **失败** | 0 笔；图片入口里照片被拖走，完成后挪过的图存成了新主版本 | before-zh-image-drag-moved-photo.png |
| 修复前（203886f10）开发版创作者路径 zh：画板节点完成后 | **失败** | 节点上只剩空启动器，画的内容看不见 | before-zh-board-done-empty.png |
| 修复中：没改动重开再完成多出一个版本 | **失败** | 画板被取整成 1280×719 当成了改动；已修（差不到 1 个屏幕像素就当同一个尺寸） | docs/plan/2026-10-12-inline-whiteboard.md「Also fixed on the way」 |
| whiteboard-refactor 走查 zh（58 项） | 通过 |  | walk-zh-CN-light.json |
| whiteboard-refactor 走查 en（58 项） | 通过 |  | walk-en-light.json |
| Windows 打包版创作者路径 zh（三个入口） | 通过 |  | packaged-creator-zh-CN.log.txt |
| Windows 打包版创作者路径 en（三个入口） | 通过 |  | packaged-creator-en.log.txt |

## 机器测的

来源：walk-log
设备 / 窗口 / 语言：Windows 11，i9-13900H；开发构建 + electron-builder --win dir 打包版 / 1280×933 内容视口 / zh-CN 与 en，浅色。边界：隔离夹具（仓库里那张 640×360 的真实镜头），不请求生成、不花钱；窄窗和深色主题没跑

| 主指标 / 指标 | 现状 → 当前 | 单位 | 样本数 | 口径 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 打开画板后直接拖画出的笔数 | 0 → 1 | 笔 | 4 | 脚本计数（真事件，非采集器） | 两个入口 × 中英文，打包版；修复前 0 笔来自 203886f10 的开发版和打包版 |
| 最坏画板「完成 → 可见反馈」（「完成」钮变成「保存中」） | null → 18.6 | ms | 5 | 实测（采集器） | 5 次：7.9 / 19.5 / 20.8 / 18.6 / 17.8，中位数；修改前按钮只是变灰，没有保存中状态 |
| 最坏画板「完成 → 节点上看见图」 | null → 3436.7 | ms | 5 | 实测（采集器） | 新增操作，没有修复前的数；4096²、12 张图、24 笔，中位数，noisy；预算 3000，超了，已登记欠账（共享落盘占 2–2.8s） |
| 1280×720 小画板「完成 → 节点上看见图」 | null → 1491 | ms | 3 | 实测（采集器） | 一次性测量（1483 / 1546 / 1491），中位数；没登记成场景 |

## 真人给的（和上面分开记）

- SEQ（1–7）：null（未采集）
- 误点：null · 回退：null · 求助：null · 首次尝试成功：null
- 说明：还没有真人试过；用户 10-22 的反馈是触发这次修改的原因，不是对修复后版本的评价

## 护栏

| 护栏 | 结果 | 证据 / 说明 |
| --- | --- | --- |
| 图片入口完成仍然正好多一版、不改就完成不多版本 | 通过 | walk-zh-CN-light.json：Done creates exactly one saved raster version / unchanged reopen and Done does not duplicate result history |
| 空画板不凭空出图 | 通过 | 单测 whiteboardProjectContext.test.ts board Done |
| 老画板数据不丢、不被自动改写 | 通过 | 单测：只有 state 的老画板要等用户打开并完成才补图 |
| 完成导出期间有当帧可见反馈 | 通过 | after-zh-done-saving.png、after-en-done-saving.png；走查「Done gives visible saving feedback while the picture is exported」 |

## 最大摩擦点与决定

- 摩擦：大画板按「完成」要等 3–4 秒才看到图
- 决定：按钮当帧显示「保存中」（约 20ms）；慢的那段在共享落盘，协调 10-22 已派 P-asset-persist 去修
- 协调决定：待协调验收

## 没验证的

| 缺口 | owner | 复查条件 |
| --- | --- | --- |
| 真人首次尝试：打开画板就画、完成后看到图 | 协调会话 | 下一次有人试用时补 SEQ |
| 窄窗、深色主题截图 | 独立验收线 | 验收时补跑走查 --dark 和窄窗 |

## 证据路径

- docs/evidence/2026-10-22-whiteboard-open/（修复前 / 修复后截图、走查报告、打包版日志、按钮普查）
- tests/perf/results/inline-whiteboard-done-export.json
- docs/plan/2026-10-12-inline-whiteboard.md「2026-10-22 change」

> 这一页不出总分：机器数、真人数、护栏、未验证各看各的。
