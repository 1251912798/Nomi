# UA 默认样式泄漏是一类问题，但蓝框未必来自 UA

> 📎 教训 · 首次记录 2026-09-09 · 状态：现行
> **触发场景**：点击输入框出现厚环，或怀疑滚动条/表单控件露出浏览器原生外观。

**结论**：先读取真实元素的计算样式与匹配规则，再在设计系统基础层修正。不在每个组件补 focus:outline-none。

**为什么会踩**：tailwind.config.ts 的旧 addBase 已将 UA outline:auto 换成 token，但把 textarea/input 和按钮混在同一条 :focus-visible。Chromium 对需要键盘编辑的控件，在鼠标点击后也会匹配 :focus-visible。“focus-visible = 只按 Tab 才出现”是假设，不是浏览器合同。

**怎么用**：
- 同时记录 outline-style/width/color、:focus-visible、token 与 -webkit-focus-ring-color 的计算色，不能看截图的蓝色就断言 UA。
- 文本框在鼠标与 Tab 下都使用字段/组合容器边框高亮；非文本控件保留键盘焦点环，别全局取消无替代。
- outline:none 时 Chromium 仍可能报告 3px 宽；判断是否绘制必须同时检查 style。
- 滚动条先看现有全局 scrollbar-color/width；appearance:auto 也不是充分证据，隐藏 native checkbox 可以是可访问性实现的一部分。
- 跑 tests/ux/focus-indication.e2e.mjs；负例必须先证明文本厚环和按钮无指示两种错误都可被观察，再检查生产 CSS。#662 合并后按规则提案接入唯一扫描器。

**出处**：docs/plan/2026-09-09-focus-indication-class.md；docs/plan/2026-09-09-focus-feel-rule-proposal.md。
