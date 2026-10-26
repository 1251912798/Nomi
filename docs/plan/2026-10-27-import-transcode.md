# 导入转码不抢电脑、可见进度设计卡

改动名：导入视频可播放归一化收进有界进程门
线/负责人：fix/import-transcode-honest / Codex
类别：[长跑][可打断][数据格式]

### 功能分类
- [ ] 新界面 / 改交互
- [ ] 花钱
- [x] 长跑 / 可打断
- [ ] Agent 行为
- [ ] 大数据量 / 画布 / 长列表
- [ ] 生成效果
- [x] 数据格式
- [ ] 新增功能 / 性能

| 格 | 结论 | 证据 |
|---|---|---|
| ★0 先查别人 | ① [Adobe Premiere：Ingest and Proxy workflow](https://helpx.adobe.com/premiere/desktop/organize-media/ingest-proxy-workflow/ingest-and-proxy-workflow.html) 明确把拷贝与转码分开，并保留原片；确认本次保留导入原片回退、只在可播放性需要时生成 MP4。② [Apple Final Cut Pro：Create optimized and proxy files](https://support.apple.com/en-gb/guide/final-cut-pro/verb8e5f6fd/mac) 说明导入后在后台做转码、可查看 Background Tasks 进度且始终保留原片；确认本次必须让导入状态说清「转换格式」和可取消生命周期。③ [Blackmagic DaVinci Resolve：Proxy Media vs. Other Playback Optimizations](https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_17_New_Features_Guide.pdf) 区分可携带 proxy 与仅本机的 optimized media；确认本次不造第二份用户可见代理体系，只在落盘边界生成可播放 MP4，删半成品即收场。 | 公开官方原文；链接及上述三条影响记录在本卡 |
| ★1 用户怎么用 | 当用户从画布文件选择、素材库上传、Finder 拖放/粘贴或 `nomi_asset_import` 导入视频时，我想在必要的转换阶段看到「导入中 · 转换格式 · x%」，以便知道电脑在做什么且不会被一个 ffmpeg 抢满。步骤：选择/拖入视频 → 卡片先显示检查中 → 仅容器不兼容时快速换容器 → codec 不可播时显示转换格式进度 → 完成后卡片进入已导入。已知坑：不提供本次取消按钮；切项目、窗口销毁或应用退出会取消并清理，不回退成半成品。真实任务：登记的 `video-ai-shot-640x360` 派生 MKV 导入；登记的 `video-4k-hevc-10bit` 仅留给待 main 合入后的走查。目标→信号→指标：用户能判断导入仍在工作→`AssetLocalizationEvent.phase=converting`→转换阶段事件比例单调上升（`electron/assets/videoImportNormalize.integration.test.ts`）；CPU 不抢前台→ffmpeg 进程优先级与 `-threads` 参数→单测/集成断言；取消不留孤儿→子进程 PID 与 scratch 目录→取消集成测试。 | 上述测试、`tests/ux/real-media-fixtures.json`、待走查截图 |
| ★1b 连带界面 | 画布导入卡沿用现有 `NodeImportingOverlay`：中文「导入中 · 转换格式 · {{percent}}% · {{size}}」，英文「Importing · Converting · {{percent}}% · {{size}}」；检查中、拷贝中、收尾中保持原有文案；取消不新增错误卡，不写 missing 事实。 | `NodeImportingOverlay.tsx`、i18n key parity、进度 store 测试 |
| ★2 谁说了算 | 导入转码进程生命周期 owner：`electron/assets/videoImportNormalize.ts` 的 `transcodeFileToPlayableMp4IfNeeded`；子进程所有权与取消边界：`electron/export/mediaProbe.ts` 的 `runBoundedProcess`；阶段契约唯一 owner：`electron/shared/assets/assetLocalizationEvent.ts`；卡片状态消费者：`assetImportProgressStore`/`NodeImportingOverlay`。事实只存一份：输入 codec/container 判定一次，阶段与比例通过事件投影；没有调用方猜测用户意图。 | `node scripts/door-map.mjs runFfmpeg transcodeFileToPlayableMp4IfNeeded ensurePlayableVideoBytes` |
| ★3 一致与复用 | 复用 `runBoundedProcess`（已有 AbortSignal、进程组清理、超时）和 `ffmpegProgress` 解析；复用 `createAssetImportProgressReporter` 与现有 localization 事件；删除 `videoImportNormalize.ts` 私有 `spawn`。不迁移其余 8 个既有直接 spawn，本次只冻结为基线。 | `git grep`、`check:root-cause-contracts`、源码静态测试 |
| ★4 全状态 | 空：没有导入卡；加载：`导入中 · 检查中`；成功：节点进入已导入；失败：保留原有导入失败/可重试语义；部分成功：批量导入只报告失败项；取消中：不落资产、不记 missing、scratch 与子进程清理后请求结束；过期：项目绑定失效时同取消；能力不可用：ffmpeg/ffprobe 缺失时沿现有回退原文件并由既有播放守卫提示下一步重试。 | i18n、资产导入集成测试、取消测试 |
| 5 中途表 | 进行中 + 关窗口：AbortSignal 杀进程，删除输出与 tempDir，导入请求以取消结束；进行中 + 换项目：`assertCurrent` 轮询触发同一路径；进行中 + 退出：`registerQuitDrain` abortAll；断网：本地转码不依赖网络；连点：每次请求独立 controller/tempDir，完成者只发布自己的产物。花费：本地 CPU/磁盘只在请求存活期间使用；回执：现有 IPC failure envelope，不新增 missing。 | `importRequests` 单测、`quitTeardown` drain 接线、集成 PID/目录断言 |
| 6 外部数据与失败 | 来源只有用户本机文件、已登记真实视频和打包 ffmpeg/ffprobe；格式判定依 `probeMediaMetadata` 与 `playableVideoCodecs`，官方 ffmpeg 进度协议输出经既有解析器；探测/转换失败继续沿既有「原样导入」回退，取消单独识别，不把半成品发布。 | `mediaProbe.ts`、`ffmpegProgress.ts`、官方先例见 ★0 |
| ★7 性能 | 新增操作：导入容器换装、不可播 codec 转码、取消清理；最坏规模：登记的 4K HEVC 10-bit 1.38GB（走查待 main 合入后），CI 真实 640×360 MKV；预算：转换阶段前台 CPU 不以全核运行，进程参数线程数 ≤ `max(1, cores-2)`，优先级 below-normal；事件比例单调、首个转换事件在 ffmpeg 启动后 1s 内（此项没有独立性能量具，记未验证）；以后重跑用 `videoImportNormalize.integration.test.ts`，不新增 perf 场景，因为本次是根因明确的小修而非新增交互。 | 集成/单测；「首个转换事件 1s」未验证：缺专用量具 |
| 8 真实条件 | Mac：单测与真实仓库素材 MKV 派生已验证；Windows：未验证；中英 UI：待「走查不抢前台」合入 main 后再跑；最小窗口/真 4K/干净安装：unverified；不花钱、不用真实账号。 | 测试输出、待走查截图路径 |
| ★9 验收与回滚 | 独立验收清单：① `video-ai-shot-640x360` 派生 MKV 只换容器，参数无 `libx264`，几秒内完成；② 注入不可播放 codec 触发 libx264，`-threads` 为 cores-2 下限、lowPriority=true，phase=converting 且比例单调；③ 窗口销毁/项目失效/应用退出均杀 PID、删临时产物；④ 反例：移除 signal 绑定时孤儿测试必红；移除 remux 分支时容器测试必红；⑤ 中英卡片截图 Read。实现线自验，独立验收线编号与报告待协调派发；`## 独立验收` 写「待协调派验收线」。回滚：revert 实现提交，恢复旧 `runFfmpeg` 前需先恢复相同测试与风险记录；无开关。 | 测试退出码、`git diff --check`、`check:root-cause-contracts`、截图/报告 |

## 系统改进

系统此前没有把所有 ffmpeg 启动收进共享有界运行器：导入归一化私有 `spawn` 缺少 AbortSignal、进程组清理、优先级/线程策略和进度回调。此次把导入这一扇收进 `runBoundedProcess`，并在同一边界加入低优先级与 ffmpeg progress；其它 8 扇直接 spawn 只冻结为基线，0.25 再迁。新增源码扫描单测禁止 `videoImportNormalize.ts` 重新直接 spawn ffmpeg。
