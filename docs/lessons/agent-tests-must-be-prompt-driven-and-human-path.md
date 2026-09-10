# 测 Agent 不用各种 prompt 打它、走查靠灌状态 = 测不出东西

- 日期：2026-09-09 · 状态：active · 场景：A 走查与体验验证
- 结论：给用户看的验收必须像人一样点（一个窗口、界面动作、下拉选模型、真敲剧本）、每功能少量真出、**测 Agent 先写 ≥20 句用户会说的话**；不是 dry-run、夹具、灌 store、按界面清单排 case。
- 当时为什么会踩：把 Agent 当流水线里的一个「分镜站」（整轮只发 1 句）；case 从扫描机制的 surfaces 清单起头；为省额度用 loopback 代替真模型；用户纠正「像真人一样点」后只把旧 case 换成界面动作，没重新推导真人最常做的事 = 对 Agent 打字。用户当天三次追问「为什么不输入各种 prompt 测」。
- 下次怎么避：按 [`../engineering/acceptance-walkthrough-doctrine.md`](../engineering/acceptance-walkthrough-doctrine.md) 六条走；派工任务书 Agent 面 case 数 ≥ 其他面之和；封顶写件数不写金额；接力任务书写死「开工第一步自己启动」。
