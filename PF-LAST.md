# PF-LAST

真实页面截图（1440px，隔离回环模型，0 付费调用）：
- `real/00-image-idle.png`、`01-image-generating.png`、`03-image-finalizing.png`、`04-image-saved.png`
- `real/05-image-queued.png`、`06-task-center-queued.png`、`07-video-generating-no-history.png`、`08-video-generating-reduced-motion.png`、`09-video-generating-zoom-60.png`
- `real/10-three-real-surfaces-generating.png`、`11-preview-timeline-regenerating.png`、`12-image-failed-vendor-disabled.png`、`13-task-center-failed-vendor-disabled.png`

修复：真实本地化开始事件提前到导入前；composer 观察真实 bottom dock；历史任务按自身结果投影；状态条、composer、浮动工具条改读 `categoryViewports`；断开供应商使用模型配置恢复；镜头编号避开状态区。

三处同句真实页面断言：节点 DOM、任务中心 DOM、时间轴 DOM 同一时刻均为“生成中 · 已等 20 秒”，`acceptance.json` 为 green。60% 屏幕字体 14px，composer 13px；reduced-motion 常亮且无 sheen；视频无历史时不显示“这类通常”。时间轴截图是已加入时间轴片段的重新生成，首次生成幽灵段仍未实现。

PR：#658 https://github.com/aqm857886159/Nomi/pull/658（未合并）。
分支：feat/process-feedback-phases-20260908；HEAD 614de8cbe28769690b86f662e5747d295ed39722；已整合 #653/#654。
里程碑：cb58032ea 语汇；bf881c4b0 原子；e7ec75745 骨架；63cf9cf6c 三处接线。
1 文案/穷举：缺阶段映射触发 TS2741 → 恢复后 typecheck 绿，见证据 red-green.md。
2 无假数：假 percent / 位次变异红 → 无数字夹具绿；非法百分比输入先红后绿。
3 三处同句：篡改任务文案红 → 19 状态三处完全同句绿，见 acceptance.json。
4 不跳版：尺寸+1变异红 → 排队至落盘几何稳定绿；不同返回画幅回归先红后绿。
5 reduced-motion：点改透明变异红 → 浏览器与真实 Nomi Electron 常亮/静止绿。
6 60%：取消缩放补偿变异红 → 状态条≥12px绿，真实 Electron 截图已查看。
截图：docs/plan/process-feedback-evidence/（contact-sheet、journey-*、electron-*）；19 基线已录入。
删除：NodeQueuedBadge、STATUS_LABEL、大写微徽标、任务卡独立排队/耗时拼句、假零百分比、假波形。
验证：pnpm run gates 全绿；75 contracts 0 阻断/3 advisory；142 视觉通过；11998 单测通过/2跳过；运行时与构建通过。
边界：时间轴只接已有源节点片段；首次生成幽灵段留 C-2；模型费用 0。
