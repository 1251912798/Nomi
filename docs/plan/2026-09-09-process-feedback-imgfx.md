# 过程反馈 C-1b · 等待期接 img-fx（代码级方案，主会话 2026-09-09 01:50）

> 用户裁决：等待期要有「有生命」的视觉，假的是进度数字不是动画；真图到手用它揭示；完成后两秒内动画结束、媒体零遮挡。
> 状态：📋 方案（主会话写）→ Codex 实施。落仓路径 `docs/plan/2026-09-09-process-feedback-imgfx.md`。

## 0. 四列表（R29 / R20 买不造）
| 它提供 | 我们用 | 我们另写 | 我们拆散 |
|---|---|---|---|
| `img-fx@0.5.1`（MIT，peer: react ≥18、three ≥0.149；仓库 three ^0.184 已满足）：`<ImageGeneration>` WebGL 马赛克「生成中」shader，三个 preset（`pixels-organic` / `pixels-mechanic` / `sweep-gradient`），`images` 揭示池，ref 句柄 `triggerReveal({hold:'manual'})` / `triggerHide()` / `triggerRegenerate()` / `isImageActive()`，`onCycle(phase)`，`theme='auto'` 读 `<html data-theme>`，`colors`/`cardBg`/`borderRadius`/`pixelScale`/`strength`/`paused` | 全部通过 props 与 ref 用；不写 shader、不 fork | 只写「状态 → props/ref 调用」的映射壳 + 挂载门控（视口/数量/reduced-motion） | 无 |
官方文档：`npm view img-fx readme`；demo https://image.jakubantalik.com ；仓库 https://github.com/Jakubantalik/img-fx 。

## 1. 挂在哪
只改 `src/workbench/generationCanvas/nodes/GenerationWaitingSurface.tsx`（#658 新建的唯一等待层，absolute inset-0 压在媒体区）。把现在的 CSS 扫光 `data-process-sheen` **替换**为 `<ImageGeneration>`（P1 删旧；reduced-motion 与门控回退保留一条静态 accent-soft 淡带，那不是并行版，是无动效回退）。任务卡、时间轴**不接**（缩略太小，WebGL 不值）。

## 2. 状态 → img-fx 映射（死表，穷举）
| 我们的段 | 表现 | img-fx 调用 |
|---|---|---|
| 排队 / 提交 / 生成中（无真帧） | shader 一直跑，**永远不揭示任何图**（没有真图就没有图） | `preset="sweep-gradient"`（读作「正在生成」，最克制；`pixels-organic` 留给设计实验室对比一格）；`images={[]}`；`autoReveal={false}`；`paused={!inViewport || documentHidden}` |
| 生成中 · 有真帧（ComfyUI 逐节点 / Replicate 部分模型） | 每来一帧：真帧在 shader 里「溶解」进来并保持；上面仍压 #658 的 scrim + 「预览帧 · 第 n/m 步」 | 首帧：`images={[frameUrl]}` → `ref.triggerReveal({hold:'manual'})`；后续帧：更新 `images` → `ref.triggerRegenerate()`（从当前帧碎成格子再溶成新帧） |
| 落盘（最终图到手） | 最终图从 shader 里溶解出来 → **动画完成即卸载整个等待层**，下面的真实 `<img>`/`<video>` 裸露，零遮挡；「已保存到项目」标签由 #658 现有逻辑停 2s 淡出 | `images={[finalUrl]}` → `triggerReveal({hold:'manual'})`；`onCycle(p)` 收到 `visible`（或揭示完成的那个 phase，以 d.ts 为准）→ 父组件把 `waiting=false` 卸载 `GenerationWaitingSurface`。总时长上限 1.2s（超时兜底：无论 phase 到没到，1.2s 后强制卸载） |
| 失败 | 立即卸载等待层，失败卡照 #658 | 不调用 |
| 音频 | **不接** img-fx（等高灰条规则不变） | `audio` 分支保持现状 |
| 视频节点 | 同图片：无真帧跑 shader；首帧到 = 真帧规则；成片到 = 落盘规则（用 poster/首帧图作揭示图，`<video>` 在下面） | 同上 |

## 3. 门控（性能是硬约束）
- **不挂载 img-fx** 的情形（回退到静态 accent-soft 淡带 + 状态条）：① `prefers-reduced-motion`（现有 `useReducedProcessMotion`）；② 节点不在视口（React Flow 已有 `lightweightMode` / `shouldRenderFullNodeContent`，复用它的判定，不另写 IntersectionObserver）；③ 同屏已挂载 ≥ 4 个（模块级计数器，先到先得，其余回退）；④ 画布缩放 < 40%（格子看不清，白烧 GPU）。
- `paused` 在 `document.hidden` 时为 true。
- 预算：`tests/ux/canvas-performance-benchmark.e2e.mjs` 加一场「8 个生成中节点（4 挂 fx + 4 回退）」：FPS 不低于现有预算、long task 0；`pixelScale` 若不达标降到 1.5。
- 卸载必须释放 WebGL 上下文（img-fx 自己管；断言 unmount 后 `canvas` 数量回零）。

## 4. 主题与 token
`theme="auto"`（它读 `<html data-theme>`，与我们一致）；`cardBg` = 计算样式里的 `--nomi-ink-05`；`colors` = `[--nomi-paper, --nomi-accent-soft, --nomi-accent, null…]` 在 mount 时从 `getComputedStyle(document.documentElement)` 读，token 翻转时重挂（监听 data-theme 变化）；`borderRadius` 让它自动探测容器（我们的 `rounded-nomi`）。不出现 token 之外的颜色（`check:tokens` 会扫字面量，颜色只从 CSS 变量读）。

## 5. 验收（每条先红）
1. 设计实验室新增 4 态：`pf-fx-generating`（t=1s 截）、`pf-fx-preview-reveal`（真帧溶解中）、`pf-fx-final-reveal`（最终图溶解中）、`pf-fx-done-clean`（揭示完成 +2s，**媒体上零元素**，DOM 断言等待层已卸载）；另一格 `pf-fx-reduced` 静态带。基线只在主会话看过截图后录。
2. 真实页面（复用 pf-realpage 那套隔离走查）：同 4 态真实节点截图 + 「完成后媒体零覆盖」断言。
3. 性能场景见 §3；`check:heavy-path` / `check:tokens` / `check:framework-boundary`（登记 img-fx 四列表）不增。
4. 变异：把 `images` 在无真帧时塞一张假图 → 断言红（证明「无真图不揭示」有守卫）。

## 6. 不做
不接 thinking-orbs / border-beam / gooey / metal；任务卡与时间轴不接；不做进度百分比以外的数字；不为不同模型做两套效果（P4）。

## 实施核对（补充证据，不替换上述裁决）
- 基线：`af088e848f87949c4c5fcd049b025c3dfb91026d`；已有远端 PR #658；工作区原有 `PF-LAST.md` 收尾记录完整保留。delivery:preflight 在暂存交接记录后通过，再原样恢复。
- 安装版本：0.5.1。`node_modules/img-fx/dist/index.d.ts:129`：`CyclePhase = 'idle' | 'reveal' | 'visible' | 'hide'`；`:372`：`onCycle(event)`，取 `event.phase` / `event.src`，不是字符串参数。
- `index.d.ts:183`：`triggerReveal({hold:'manual'})`，当前已 reveal/visible/hide 时 no-op；`:228`：`triggerRegenerate({durationMs, tintFromImage, autoReveal})`，默认 4000ms。最终帧替换预览必须先退出旧 reveal 再调用 reveal，不能把旧 visible 当最终帧已完成。
- `GenerationCanvasReactFlowViewport.tsx:188` 已启用 `onlyRenderVisibleElements`；`GenerationCanvasReactFlowNodes.tsx:222` 已在轻量模式卸载完整 NodeComponent。等待层复用这两层挂载边界，不修改内核、不另写 IntersectionObserver。
- 官方 README：2026-09-09 经 `npm view img-fx@0.5.1 readme` 核对。实际 React 包装器见 `node_modules/img-fx/dist/index.es.js:2012`；使用 React props/ref，无自建 shader、cycle 或 renderer。参考实现对照：渲染/生命周期一致；控制流有意不同（真实生成信号替代演示自动循环）；主题沿用 auto；观测用官方 onCycle；其余 agent 九层不适用 UI 动效组件。
- 回滚：按本任务四个里程碑逆序 revert，仅回滚本任务文件；不恢复已删除的旧动画为第二条运行路径。

### 参考实现逐层对照
| 层 | 它怎么做 | 我们怎么做 | 裁决 | 若没想到补在哪个阶段前 |
|---|---|---|---|---|
| 控制流 | img-fx README 手动 ref / autoReveal；index.d.ts:183 | 真实预览/最终产物触发 ref，禁止演示池自动 reveal | 有意不同：生成结果必须真实 | 不适用 |
| 观测与测试 | index.d.ts:372 onCycle 回调；index.es.js:2186 dispose | 使用 phase+src 认最终图，1.2s 上限和卸载 canvas 验证 | 一致；补业务期限约束 | 不适用 |
