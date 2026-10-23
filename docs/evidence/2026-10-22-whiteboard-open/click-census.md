# 按钮普查：画板「打开后第一下 / 完成后看见什么」（2026-10-22）

只列这次改了行为、或者新出现的可点目标。其余画板按钮的行为没变，由 `tests/ux/whiteboard-refactor.walk.mjs` 的原有 51 项覆盖。

| 设计来源 / 组件 | 变体 / 状态 | 无障碍角色 + 名称 | 用户动作 | 预期的界面状态和副作用 | 测试 ID | 证据 |
|---|---|---|---|---|---|---|
| 清单 InlineWhiteboard（O40 已被推翻）/ `WhiteboardCardBody` → `CardActivationButton` | 画板节点有图 · 已选中 | button「打开画板」/ "Open whiteboard" | 先选中，再点缩略图 | 原地打开画板，笔画和图片都在；没选中时这一下只是选中 / 拖动 | `whiteboard-open-preview` | 走查「the board reopens from its picture with the drawing intact」；`after-packaged-zh-reopen-from-picture.png` |
| 同上 / `EmptyStateLauncher` → `CardActivationButton` | 画板节点没图（空） | button「打开画板」 | 先选中，再点启动器 | 原地打开画板，激活规矩和改动前一样（抽成共用按钮，没改行为） | `whiteboard-empty-action` | 走查「standalone entry reuses the same editor and real import」 |
| `WhiteboardEditingToolbar` / 画笔（默认） | 刚打开（两个入口都一样） | button「画笔」处于按下态 | 不选工具，直接在画板上拖 | 画出一笔并落盘；在图片入口拖动时照片不动 | `whiteboard-brush` | 走查「image entry: the first drag after opening draws and leaves the photo where it was」「standalone entry: the first drag after opening draws a stroke」；`after-packaged-zh-open-brush.png` |
| `WhiteboardEditingToolbar` / 完成 | 画板节点 · 有内容 | button「完成」/ "Done" | 点击 | 当帧变成「保存中」（加载标记 + aria-busy，实测中位 18.6ms）；然后导出一张图作为节点结果（多一个版本），编辑器收起，节点显示缩略图；导出期间完成和截图两个按钮禁用 | `whiteboard-done` | 走查「standalone Done leaves the drawn content visible on the board node」；单测 board Done 组；`after-packaged-*-board-done-picture.png` |
| 同上 | 画板节点 · 空、从没出过图 | button「完成」 | 点击 | 只存 state，不出图，节点仍显示「打开画板」 | `whiteboard-done` | 单测「an empty board that never produced a picture saves its state only and keeps the launcher」 |
| 同上 | 已经有图 · 没改动 / 截图后马上点 | button「完成」 | 点击 | 不出新版本 | `whiteboard-done` | 走查「Done right after a screenshot adds no duplicate board version」「an unchanged reopen and Done keeps one board version」 |
| 同上 | 只有 state、还没有图的老画板 · 没改动 | button「完成」 | 点击 | 补出一张图 | `whiteboard-done` | 单测「a board saved as state alone (no picture yet) gets its picture on an unchanged Done」 |
| `ImageQuickActionsToolbar` / 画板 | 图片节点已选中 | button「画板」 | 点击 | 原地展开，默认画笔（原来是「选择」，并且选中原图） | `whiteboard-open` | 打包版创作者路径 B 段；`after-packaged-*-image-done.png` |
