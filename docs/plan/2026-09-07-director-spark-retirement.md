# Spark 宿主异步卸载收口

> 状态：✅ 本地实现与验收完成，未提交。真实 Spark 6 项回归及 500k SPZ 旅程通过，16:03 冻结构建后的 Electron PNG/MP4 回画布与无控制台错误同时通过。收据见 `docs/audit/2026-09-07-director-functional-interaction-audit.md`。

复现：真实 Spark 的 `driveSort` 在 `readPause=1` 等待时，SparkHost 卸载直接 dispose 释放 accumulator.target，下一次读取抛错。官方当前 main 的 dispose 同样没有等待排序或取消调度，不能靠无依据升级解决。

仅修改 SparkHost 及其专用卸载 helper：摘出场景后关闭新 autoUpdate/LoD 调度，取消已排队 update/sort timer，清除再次排序意图；等待正在排序的完成信号与已存在 LoD worker 的排空屏障后释放 GPU。空闲/空场景不等待不存在的信号，重复卸载复用同一次释放。保留 Spark 原有帧调度、多视口和排序算法，不吞异常。

同类入口：全 src 仅一个 `new SparkRenderer`，DirectorCanvas 内的它服务可见导演台/PiP；另一个真实入口 `agent/DirectorHeadlessCapture.tsx` 使用独立 FencedCanvas，未挂 SparkHost，不冒称已覆盖其泼溅能力。`SplatEntity` 只拥有单 mesh，不拥有排序 accumulator。恢复前快照位于 `.tmp/director-full-audit-20260907/resume-SparkHost.before.tsx`。

验收：真实 Spark 最小红绿切片覆盖 readPause、排队任务、空闲/空场景、LoD 在途、重复卸载和替换 Host；根因合同/类型/lint 通过，再对最终 Electron 原命令复跑，PNG/MP4回画布与无控制台错误同时通过。真实 SPZ 资产旅程确认渲染保持。

回滚仅本轮 SparkHost/helper，不切换分支、不改旧工程、不操作 Git。依赖版本保留 2.1.0，合同明确当上游有可验证的异步 dispose/取消接口时替换此窄适配。
