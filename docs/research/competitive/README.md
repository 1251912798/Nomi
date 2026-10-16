# 竞品学习（产出在私有仓）

竞品雷达的对标名单、报告、原始抓取和来源登记都在**私有仓 Nomi-service 的 `research/competitive/`**，公开主仓不放竞品名与竞品内容（用户 2026-10-15 拍板）。

- 流程：技能 [`nomi-competitive-radar`](../../../agent-skills/nomi-competitive-radar/SKILL.md)，规程见 [每日雷达与三日竞品雷达](../../engineering/daily-radars.md)。
- 本机定位私有仓读环境变量 `NOMI_PRIVATE_REPO`；没设就明说「今天没查成」，不落回本目录。
- 门岗：`pnpm run check:skills-format` 要求本目录除本文件外**不得出现任何文件**。
