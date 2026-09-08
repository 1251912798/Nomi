# PF-LAST

## 2026-09-09 C-1b img-fx 已实现，主会话已批准样张，完整 gates 绿，准备 push

- 版本：唯一新增依赖 `img-fx@0.5.1`（精确版本，lockfile 已提交）；四列表、26 个公开字段裁决已登记。分支 `feat/process-feedback-phases-20260908`，既有 PR #658，本轮未 push、未合并 PR。
- 实验室四态：`docs/plan/process-feedback-evidence/imgfx/lab/pf-fx-generating.png`、`pf-fx-preview-reveal.png`、`pf-fx-final-reveal.png`、`pf-fx-done-clean.png`；另有 `pf-fx-reduced.png`、`pf-fx-organic.png`。真实页面同名四态在 `docs/plan/process-feedback-evidence/imgfx/real/`。全部逐张 Read；已有状态变化的 12 张实际图在 `baseline-review/`，已获 PF-RULINGS.md 批准，仅录 process-feedback 相关基线。
- 同机 8 节点性能：改前 119.8 FPS / P95 9.4ms / long task 0；末次改后 119.9 FPS / P95 10.2ms / long task 0（中间复测 120.2 FPS / P95 9.5ms）。4 fx + 4 静态回退、槽位交接、离屏 fx=0、最终 canvas=0 均通过。交付数字以 `imgfx/performance-{before,after,final}.json` 为准；截图 before/after 指场景开始/清空，不是版本前后。
- 真机：隔离 Electron → 生产确认 → loopback 供应商 → 真实 ComfyUI IPC 预览 → 本地化落盘，费用 0；末次完成后 1175.8ms 卸载全部等待壳，1200ms 硬期限通过，无 pageerror。库内部 reveal 约 3s、无公开调速字段，因此 1100ms 应用期限会提前卸载，露出下面真实媒体；未 fork 或改 shader。
- 变异证据：`imgfx/red-missing-fx.log`（旧 CSS 无 img-fx 红）、`red-overstay-1s.log`（故意多留 1s，1200ms 即时断言红）、`red-fabricated-image.log`（无真帧塞假图红）；均已恢复。`red-motion-resume.log` 是软件 GPU/实验室 store 调查记录，不作为生产缺陷证据。
- 全量测试初跑 12071 通过 / 2 失败 / 2 跳过；两处失败已修：浏览器 visibility 在 effect 读取，保留无 DOM 音频渲染；实验室 zoom 使用真实宿主 dispatcher。红证据 `imgfx/red-render-and-lab-wiring.log`，全量复跑已绿：12073 Vitest / 13 janitor / 306 runtime / 8 stats 全通过，2 Vitest 跳过；日志 `/tmp/pf-imgfx-all-tests-final.log`。根因合同、walkthroughs、定向 lint、typecheck、浏览器门控与真实页面验收已通过。
- 最终 contracts 75 项：72 通过、0 阻断、3 advisory；全屏视觉 148/148，未更新其他屏。完整 `pnpm run gates` 退出 0（运行时、构建通过），日志 `/tmp/pf-imgfx-gates-final.log`；先前红门岗保留在 `/tmp/pf-imgfx-contracts-all.log`。
- 里程碑：`c336ba149` 依赖+登记；`5bbbc9049` 映射壳；`d277025c1` 门控+性能；`9dca691b2` 实验室/真实页证据。期间正常 merge `origin/main` 得到 `90b514a40`，无内核改动、无绕钩子。
- 裁决已到：`PF-RULINGS.md`（主会话 06:05）批准真实四态、只录 process-feedback/img-fx 相关基线，并明确完成态保留镜头号与右下图片标题。等待壳/scrim/进度/canvas 全部卸载符合最终裁决。

## 2026-09-09 PR #658 收尾完成：4 笔正常提交，分批 push 成功
- `a5899912e06a2a9e65a2c716aee3dd114c1e510e`：画布参数卡避让与生成反馈。
- `f200d843119bc5d86893a7ccaeff2243c7613ede`：共享错误码识别 catalog 失败。
- `527a96df0bce066fd7b6c37064cff5e9ba6a2871`：删除旧 composer pan hook、测试和接线。
- `af088e848f87949c4c5fcd049b025c3dfb91026d`：验收证据、视觉基线与文档；push 后 ls-remote 确认远端 HEAD 同此 SHA。
- 全部 commit/push 正常过钩子；累计大小超限后分批 push；最终 tree 与已绿暂存树 de17bc649 一致，复用 /tmp/pr658-final-gates.log，未重跑 gates；img-fx/备份 stash 未应用未 drop，交接文件未 add。

## 2026-09-09 PR #658 收尾：gates 绿；两笔提交被评审大小上限阻断
- 已删旧 pan 的 readLiveViewport 无用解构；动画 hook 内部引用未动，无额外 reactFlow 改动。
- lint：0 errors / 81 warnings；完整 gates 退出 0：75 contracts=72 通过/0 阻断/3 advisory，视觉 142/142，Vitest 12073 通过/2 跳过，runtime/构建通过；日志 /tmp/pr658-final-gates.log。
- 两笔 commit 尚未生成、未 push：第一笔安全扫描通过，但 Ponytail 拒绝 323092-byte diff（上限 150000）；未绕过钩子。
- 当前 HEAD `60c1865495cdb87109b4d8f26167cae53a4b6260`；暂存树 `de17bc6492a4fc1cc8cb87d4dc050849b4339d14` 完整保留。
- 可执行拆分已核算为 4 笔并分批正常 push，文件清单 /tmp/pr658-safe-commit-groups.json；待用户放宽“两笔”限制。img-fx 与备份 stash 均未应用/未 drop。

## 2026-09-09 PR #658 第二段：邻居避让与标签裁决（已实现，待 reactFlow 两行死接线删除授权）

- 放置层：`src/workbench/generationCanvas/nodes/useComposerViewportPlacement.ts:34` 统一测量非本节点、dock、版本托盘、连线热区；`:50` 在同一屏幕坐标系裁决；`composerObstaclePlacement.ts:21` 按下/上/右/左挑选无碰撞区域，空间不足取可用矩形并缩卡；四周全占满时缩到选中节点自身空闲区，仍不挡邻居。`NodeGenerationComposer.tsx:549` 隔离滚轮，`:566` 受限时整卡滚动。撤去原 composer 驱动画布平移与强制高度溢出，不改内核。
- 先红后绿：`neighbor-placement/red-card-intersection.log` 的旧代码矩形断言报 `group-character`、`group-scene` 被覆盖；新代码同一真实断言通过。侧放新增发现的透明连线热区同样纳入共享避让，旧失败见 `red-side-handle.log`；真实「加入时间轴→重新生成」已通过。原 card-stack 的版本按钮/悬停链在构建套件通过；未保留无效的独立 hover 修法。
- 标签裁决：`NodeGenerationStatus.tsx:14` 完成态立即消失；`GenerationStatusBar.tsx:23` 极淡底、次级小字、状态点着色、秒数 tabular-nums；`ConvertShotToVideoButton.tsx:13` 镜头号常驻左下；`BaseGenerationNode.tsx:636` 让编号高于生成占位层。图片标题移至右下以避开编号，浮动动作条仍在媒体外上方。
- 四张真实截图（均已逐张人眼检查，并有媒体内/外位置断言）：`docs/plan/process-feedback-evidence/neighbor-placement/real/selected-generating.png`、`unselected-generating.png`、`selected-complete.png`、`unselected-complete.png`。同目录 `acceptance.json` 记录四组合、三处同句、60% 可读、减弱动态、断开供应商恢复；模型费用 0。
- 最终含连线热区、四周占满和滚动可达断言的本地构建：full 1/2 **6/6**、2/2 **7/7**、critical **4/4**，收据在 `neighbor-placement/{full-1of2,full-2of2,critical}-summary.json`；已整合 main 的 #660/#655；75 contracts 零阻断、142 视觉通过。全量单测 12076 通过/2 跳过/1 失败：`src/customEventWiring.test.ts` 抓到旧 composer pan 孤儿监听。尚未提交本段里程碑或 push。定向几何单测 **9/9**、typecheck、根因合同、token、filesize 通过；process-feedback 屏 **20/20**（含注册表）通过，按本轮裁决更新该屏 19 张基线。
- 门禁补修：`electron/shared/nomiErrorCodes.ts:14` 扩展既有 model-config 码，catalog 生产端写码；共享解码器仅兼容两种完整历史落盘格式，删除 classifyError 中文子串猜测。翻译/误引文案新增 4 红→9/9 绿，见 `neighbor-placement/error-code-{red,green}.log`。未放宽 i18n 基线。
- 当前唯一阻塞：删除旧 pan 的派发后，`reactFlow/GenerationCanvasReactFlow.tsx:46` import 和 `:428` hook 调用仍挂孤儿监听。用户禁止触碰 reactFlow/**，已明确请求仅删除这两行与对应旧 hook/测试/常量的例外，未收到答复、未改内核。待应用补丁 `/tmp/pr658-remove-obsolete-pan.patch`；失败证据 `neighbor-placement/gates-orphan-listener.log`。批准后补合同的删除路径，跑 focused 与完整 gates，再正常 commit/push。当前所有实现已 staged；末次 gates `/tmp/pr658-gates-green.log`。
- 根因合同已追加 `invariant_owner_layer = composer 放置层`（`useComposerViewportPlacement.ts`），旧证据已先提交 `113ee5d68`。开工已有的 package.json / pnpm-lock.yaml 改动临时保存在 stash `8ab706455980994d6ffafc43fa571da54ce4e765`，本任务不提交它们，交付后恢复。
- 例行模型雷达：APIMart 新增 Gemini Omni 1.1 Flash Video；未接入、未更新基线。apimart-llm 凭据受 safeStorage 保护，今天该项没查成。论文雷达技能在可用目录未找到，未冒称完成。

## 2026-09-09 PR #658 点击根因调查（历史记录，已由顶部裁决取代）

- **CI 红的直接原因是浮层遮挡，不是 rect 变动。** run 34252289801（SHA 614de8cbe）原日志最后 58 次均为 `element is visible, enabled and stable`，随后另一 selected 节点 `subtree intercepts pointer events`。第 410 行点的是已成功的 sourceId。
- 机制：`NodeGenerationComposer.tsx:535` 的节点外 absolute 参数卡，加上 `useComposerViewportPlacement.ts:211` 起仅按视口/工具条/dock 避让的规则，允许覆盖邻近节点。本地真实页面图片参数卡遮住生成中视频的点击点，已截图；未擅改交互。
- **采样：旧代码实际绿，不能冒称先红后绿。** 每 250ms ×20：源图 rect 恒定；真实生成中图片文案 20→25 秒，rect 恒为 `(705,245,340,280)`。需要为真实遮挡建红测；给秒数加等宽字不会解决此次 CI。
- `node tests/ux/canvas-real-suite.mjs full -- --shard 2/2`：6/7（batch-production 通过）；critical：3/4。两组共同失败 `canvas-card-stack.walk.mjs:223`：2 版按钮 outside of viewport。
- 标签方案未实施：追加 1/2“媒体上方标签行、媒体零覆盖”与追加 3“状态条在媒体内部左上”互斥，已询问最终裁决，尚未收到答复。推荐媒体上方固定标签行。
- 新证据：[调查报告](docs/plan/2026-09-09-pr658-click-root-investigation.md)，截图/采样/CI 日志/套件收据在 `docs/plan/process-feedback-evidence/ci-658-investigation/`。生产代码未改，未跑 gates、未 commit/push；未更新设计实验室基线。未安装包；期间出现的 img-fx 依赖变动非本轮操作，保留不纳入。


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
