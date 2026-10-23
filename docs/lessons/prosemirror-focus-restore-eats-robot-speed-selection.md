# 机器速度的键盘选区，会被 ProseMirror 的聚焦收尾吃掉

> 📎 教训 · 首次记录 2026-10-24 · 状态：现行
> **触发场景**：测试点进编辑器后立刻用方向键 / Shift+方向键 / `selectText()` 改选区，单跑永远绿、忙机上选区变成空、变成全选、或偏几个字；断言的是 `meta.textGenSelection` 一类「编辑器选区的投影」。

**结论**：ProseMirror 聚焦后 20 毫秒会把它**记得的**选区写回屏幕；原生方向键挪的选区，它要等异步的 `selectionchange` 才读到。机器一忙，那个定时器正好插在「按键」和「读到」之间，刚按的键就被抹掉。测试要一个选区，就用编辑器自己的选区命令（`editor.commands.setTextSelection`）落下——同步写进屏幕选区和状态，什么都不用等；真要测原生键盘，先确认编辑器早已聚焦（不是刚点进去），并且每一步等 `editor.state.selection` 跟上再按下一下。

**为什么会踩**：
- `prosemirror-view` 1.41.8 `handlers.focus`（本机 `node_modules/.pnpm/prosemirror-view@1.41.8/.../dist/index.js:3812`）：从未聚焦变成聚焦时 `setTimeout(…, 20)`，到点若 `domObserver.currentSelection` 和屏幕选区不同就 `selectionToDOM(view)`——它本来是防「浏览器聚焦时把光标重置到开头」的。
- 方向键（含 Shift）走浏览器原生移光标（`selectHorizontally` 对纯文本返回 false），ProseMirror 只在 `document` 的 `selectionchange` 里 `flush()` 读选区（`dist/index.js:4662`）；`selectionchange` 是排队的任务，忙机上排在后续输入事件之后。
- 于是三种红法都是同一个定时器（`tests/ux/text-document-generation-ownership.test.mjs`，10 核 + 16 个满载进程 + 4 份并行，页面里包 `setTimeout` 插桩）：
  - 触发前屏幕选区 `"OLD"`、触发后 `""`——三下 Shift+→ 全没了；
  - ArrowLeft 之后触发，把 Ctrl+A 的全选写回来，后面的 → 全落在行尾，Shift+→ 什么也选不到；
  - 五下 → 走到第四下时触发，光标被拽回开头，最后选成 `"eep"`。
  带长 goto 的诊断版 44 跑 13 跑如此；节点 meta 一直忠实地跟着编辑器，红的不是「状态没提交」，是屏幕选区被编辑器自己改了。
- 真人点进去再按键远超 20 毫秒，碰不到；只有主线程被长任务卡住、按键插队到定时器前面时才可能（属上游行为，未修）。

**怎么用**：
- 写「选一段字再做事」的测试：夹具暴露 `select(phrase)`，内部 `editor.commands.setTextSelection(range)`，返回屏幕选区和投影两样一起断言（范例：`tests/ux/fixtures/text-document-generation-ownership.tsx` 的 `select`）。
- 看到「刚 `click()` 完就按方向键」的测试，先问编辑器是不是刚从未聚焦变成聚焦。
- 打字（`keyboard.type`）不受影响：输入走 MutationObserver 微任务，当场就被读进状态。

**出处**：分支 `fix/text-ownership-flaky`；根因合同 `docs/fixes/2026-10-24-browser-fixture-ready-signals.root-cause.json`。
