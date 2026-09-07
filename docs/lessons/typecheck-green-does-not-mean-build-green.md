# typecheck 绿 ≠ 构建绿：图标白名单 barrel 只在构建期生效

> 📎 教训 · 首次记录 2026-09-08 · 状态：现行
> **触发场景**：新引入一个 `@tabler/icons-react` 的图标；或任何「typecheck 过了但构建炸」的情况。

**结论**：本仓有一个**图标白名单 barrel** `src/vendor/tablerIcons.ts`（252 个，为控包体积只
re-export 用到的那些），构建时把 `@tabler/icons-react` 别名过去。
**`typecheck` 解析的是真包**（有全部 5800+ 图标），**构建解析的是 barrel**（只有 252 个）。
所以新图标能过 typecheck、能过所有单测，**在 `vite build` 那一步才炸**：

```
"IconFlame" is not exported by "src/vendor/tablerIcons.ts"
```

**为什么会踩**：写「放量」角标时随手 `import { IconFlame }`，typecheck 绿、单测绿、
`gates:contracts` 73 道全绿——五门跑到最后的构建才红。

**怎么用**：
- 加新图标 = **改两个地方**：`src/vendor/tablerIcons.ts` 加一行 re-export，然后才是组件里用。
- 那个文件**按主题分簇，不是字母序**（交通工具/家电是一簇、数据类是一簇）。
  按语义放进对应簇，别按字母插——我第一次就插进了「交通工具/家电」那一簇。
- 加完按设计系统 §6「新图标加入流程」登记进语义图标表（`check:icon-semantics` 管这张表）。
- 更一般的一条：**typecheck 与 build 看的不是同一份模块图**。凡有别名 / barrel / `optimizeDeps`
  介入的地方，两者的结论可以不一致——**只有构建能证明构建**。

**顺带**：选图标时隐喻要诚实。「放量」= 广告花费档高 = **投放在加码**，
`IconTrendingUp`（趋势上升）比 `IconFlame`（火苗＝热门）准确。

**关联**：[[dead-selector-lies-both-ways]]（同族：一处失效锚点，两种谎言）。
