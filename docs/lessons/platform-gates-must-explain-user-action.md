# 平台门控必须在 UI 上说人话

> 📎 教训 · 首次记录 2026-09-08 · 状态：✅ 已固化
> **触发场景**：平台不支持，却显示未检测、部分受限或泛化失败。

**结论**：平台能力门控在发现与执行共享边界统一拦截；前台必须显示真实原因和可执行下一步，不能让用户用重装、登录、代理排查无法改变的平台限制。

**为什么会踩**：Antigravity Windows 发现路径以 PLATFORM_UNVERIFIED 拒绝，准备好的执行身份却可绕过。界面仍显示尚未检测，用户误以为安装问题。版本、握手与退出阶段也混用了兼容性假设与错误分类。

**怎么用**：检查直接、prepared 两种入口；用注入平台测试未启动任何进程；错误码集中映射并检查中英文穷尽；不支持时不要显示已启用或未获取模型清单。恢复支持前必须验证真实 Windows 后代进程清理，模拟平台测试不能替代 RC。

**出处**：[修复计划](../plan/2026-09-08-antigravity-cli-windows.md)、electron/ai/antigravityWindows.test.ts、src/ui/onboarding/AntigravityConnectionCard.test.ts。
