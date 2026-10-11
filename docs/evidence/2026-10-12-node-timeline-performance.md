# 节点工具栏加入时间轴：性能审查

2026-10-12，macOS arm64 / Apple M5 / 24GB / Electron 开发构建，1600×1000。结论：本轮实测未观察到持续拖动或平移卡顿；没有改动前后的 A/B，因此不宣称证明零回归。Windows、打包应用、大量不同高分辨率素材及超长时间轴未验证。

## 热路径与优化

- 旧刘海逐节点挂载；新动作随已有单选媒体工具栏挂载，多选、只读和不支持媒体不挂载按钮。没有新增轮询、后台任务或媒体解码。
- 新按钮复用 `selectCanvasNodeById` 的现有共享索引，避免每次状态通知单独 `nodes.find`。点击和拖拽时仍重读当前主结果。
- 真实走查发现自动缩放令成功/Undo提示消失：原 revision 将顶层 scale/playheadFrame 当成内容。在共同 kernel 提取内容投影，内容编辑仍令旧操作失效。回执以同一投影 shallow 订阅，Agent 另外保留 Undo 栈引用检查。生产 store 先红后绿测试证明：100 次播放头变化导致的整轴有效性检查从 100 次降为 0 次，Undo 仍恢复原轴。
- 拖拽沿用原 MIME 与载荷，只在 dragstart 编码一次，不在 hover/render 编码。整个 node 的历史版本仍在旧载荷里，特别大的 history 可能造成一次性起拖开销；本轮未量化此极端情形，也未更换接收协议。

原生拖拽还通过真实事件诊断发现 XYFlow 原生 mousedown 抢走工具栏手势。在共同 FloatingToolbarFrame 复用既有 nodrag/no-pan 类，避免整节点位移；这不增加事件轮询或逐帧逻辑。

## 真实媒体规模采样

使用现有 `tests/perf/canvas-scale-bench.mjs`，设置 `NOMI_CANVAS_PERF_REAL_ASSET_DIR` 指向仓库真实 AI 镜头和其抽帧。持久隔离项目，不调用供应商、不产生费用。图片重复使用同一真实资源，测试规模交互成本，不代表不同素材的解码压力。每项独立执行 3 次，表内为 harness 的中位数；采样时主机另有任务运行。

| 项目节点 / 边 | 操作 | 视口挂载节点 | FPS | 帧 P95(ms) | 长任务 |
| --- | --- | --- | --- | --- | --- |
| 60 / 30 | 拖动 1 个选中节点 | 60 | 120.0 | 10.0 | 0 |
| 300 / 150 | 拖动 1 个选中节点 | 180 | 120.1 | 10.6 | 0 |
| 300 / 150 | 整体平移 | 180 | 119.8 | 9.9 | 0 |

原始样本：[60节点拖动](../../tests/perf/results/canvas-scale-node-timeline-i60-drag.json)、[300节点拖动](../../tests/perf/results/canvas-scale-node-timeline-i300-drag.json)、[300节点平移](../../tests/perf/results/canvas-scale-node-timeline-i300-pan.json)。三项使用同一成功构建：HEAD `288c60482c4887f1a292a5728e0a74fea6b356fb`，含本任务未提交改动的构建树 `f02a4c29792fa3f5e1468a82d13f970a8d3b8295`。该构建已包含共享浮条 nodrag/no-pan 修复及整合 main fdb0b15438；后续改动仅为探索页冗余展开箭头、验收和文档证据，生产代码冻结。平移单次样本的最大帧耗时曾为21.5ms，主机 loadAvg1 为18.3–24.7；不将中位数解释为每帧都达标。

可复跑示例：`NOMI_CANVAS_PERF_REAL_ASSET_DIR=<真实素材目录> node tests/perf/canvas-scale-bench.mjs --scales I300 --scenarios drag-nodes-1 --runs 3 --label <新标签>`。不同场景应串行，避免并发 Electron 干扰采样。
