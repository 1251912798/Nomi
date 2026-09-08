v3 截图：docs/design/mockups/2026-09-08-skill-library-cards/library-cards{,@2x}.png
v3 逐字检查：1x/2x 无折叠控件、正文至许可证末句完整、无 Markdown 标记；左图顶对齐，图下说明清楚；46 条正文及 80 段长文滚动到底验收通过。
v2 截图：docs/design/mockups/2026-09-08-skill-library-cards/{library-cards,node-effects}{,@2x}.png
断言结果：46 条正文 + Markdown 结构夹具通过；旧 pre 原文路径断言失败，展开/收起与引用/追加/撤销通过。
逐字检查：详情无 Markdown 标记与重复标题简介，meta 单行清楚；卡片与 chip 字阶、间距一致，折尾渐隐。
# SL-LAST · 技能与提示词即时价值一期
分支：feat/skill-library-curation-20260908
最终提交：05fcda5066380aa44b6987f9fb8358e044f3772c；PR：https://github.com/aqm857886159/Nomi/pull/655（未合并）
候选：34 条 / 11 仓库；收录：15 技能 + 40 效果；15 技能已有原仓真实配图。
许可证拒收/暂缓：4 条；另因范围排除：1 条。
锚图1：docs/design/covers/anchors/anchor-1.png
锚图2：docs/design/covers/anchors/anchor-2.png
锚图3：docs/design/covers/anchors/anchor-3.png（推荐，未批准）
实付：APIMart $0.0375，预算按 8 折算约 ¥0.30；TikHub 一次查询实付未知；未试产/批量。
样张1：docs/design/mockups/2026-09-08-skill-library-cards/library-cards.html（同名 PNG）
样张2：docs/design/mockups/2026-09-08-skill-library-cards/node-effects.html（同名 PNG）
验证：pnpm run gates 退出0；Vitest 12056通过/2跳过；附加测试、构建、样张交互/解码通过；9批push钩子通过。
边界：UI未实现；40效果封面待选锚图；文本分享包拒绝二进制媒体；真实ASAR安装包/Agent生成闭环未测。
接触表：docs/design/covers/contact-sheet.png；完整来源/许可/成本与验证限度见 PR。
