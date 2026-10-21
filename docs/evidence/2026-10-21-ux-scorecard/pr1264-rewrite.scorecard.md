# 体验成绩单：写作区选中文字 AI 改写（选区浮条「AI 编辑」）

- 改动：写作区选中文字 AI 改写（选区浮条「AI 编辑」）（#1264）
- 验收 head：`0741ff17afaa2d71188d973456635e70b45cd43b`（未合入；merge-base 9adca4202b5db10fe5a68673a7d03767db2676e1）
  - 本页的两项失败（B1 跨文稿改错、B2 刚输入的句子被一起撤回）属于该 head；该 head 之后 41d2026a5 已修，修法和测试由 V-rewrite 复验；本页是试行样例，#1264 合入前按最终 head 重出一张。失败记录保持原样，不删
- 场景 id：`rewrite-shorten-accept-undo`
- 谁验：V-rewrite（独立于实现线 I-rewrite）（独立验收）
- 日期：2026-10-21；成绩单整理：I-scorecard，只读 V-rewrite 报告与走查产物整理，没有重跑

**用户这次能完成：**选中一段文字，点 AI 编辑、点「缩短」，在原位看新旧对比，Enter 接受或 Esc 放弃，接受后 Ctrl+Z 撤回

**能力变化：**新增：选区浮条上的 AI 编辑、五类常用改法、写作 Skill、就地新旧对比（段尾 ✓ ✕）；改变：选区浮条加宽、AI 会话期间隐藏原有格式按钮；去掉：无

## 结果

- 机器：完成 **1 / 2**（失败 1 条，原样列在下表，不丢）
- 首次尝试成功：null（未采集：需要真人首次操作，AI 不代填）

| 尝试 | 结果 | 说明 | 证据 |
| --- | --- | --- | --- |
| 常规路径：同一篇稿里，选中 → AI 编辑 → 缩短 → Enter 接受 → Ctrl+Z 撤回 | 通过 |  | 设计实验室走查 24/24 状态；live-01 到 live-05 |
| 变体：改写前刚输入一句，快速接受，再 Ctrl+Z 撤回 | **失败** | 一次撤销把改写前刚输入的 New sentence. 也撤掉了（正文变成 Existing text.），应当只回到 New sentence. Existing text.；redo 可恢复（B2） | 1264-shots/safety-probe.json 的 history-rapid-accept，pass=false |

## 机器测的

来源：walk-log
设备 / 窗口 / 语言：Windows，Chromium headless（Playwright） / 设计实验室 760×460 画框 / zh / light（另有 en / dark 四套静态状态截图）。边界：合成文稿 + 假桌面桥；不是 Electron 整机，不是真模型（真模型调用 0，花费 0）

| 主指标 / 指标 | 现状 → 当前 | 单位 | 样本数 | 口径 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 完成这件事要做的动作（选中、点 AI 编辑、点「缩短」、Enter 接受） | 9 → 4 | 个 | 1 | 脚本计数（真事件，非采集器） | 现状 9 是 R-uxprocess §5 的设计估算（选段→开助手→粘贴→输入要求→发送→找回复→复制→回正文→替换），不是 Nomi 实测；当前 4 是从走查脚本里数的真键鼠动作（选中一行的 End、Shift+Home 合并算一次选中），不经采集器、不含找路和误点 |
| 撤回要做的动作（点回正文、Ctrl+Z） | null → 2 | 个 | 1 | 脚本计数（真事件，非采集器） | 没有现状对照；脚本计数 |
| 完成耗时 | null → null | ms | 1 | 未采 | 没采：这条走查没有接 collect.mjs，假桥响应是即时的，脚本耗时也不是人的耗时 |

## 真人给的（和上面分开记）

- SEQ（1–7）：null（未采集）
- 误点：null · 回退：null · 求助：null · 首次尝试成功：null
- 说明：没有真人做过这个任务；SEQ、人工事件、首次尝试都是 null

## 护栏

| 护栏 | 结果 | 证据 / 说明 |
| --- | --- | --- |
| 切到正文相同的另一篇文稿，旧改写结果不能写进别的文稿（请求进行中） | **失败** | A 的改写被接受到 B：A 原文不变、B 被替换（B1）；1264-shots/cross-document-running-after-accept.png |
| 同上（结果已经返回时再切文稿） | **失败** | 同样误写 B；V-rewrite 报告 B1 两种时机均实跑 |
| Esc 放弃后原文不变 | 通过 | live-06-discarded（实验室走查） |
| 进行中撤销 / 外部整篇替换 / 关闭会话，迟到结果不写文稿 | 通过 | 1264-shots/safety-probe.json 三项 pass=true |
| 不花钱 | 通过 | 真模型调用 0，实际花费 0（V-rewrite 报告） |

## 最大摩擦点与决定

- 摩擦：改写前刚打了一句、立刻接受改写、再按 Ctrl+Z：想撤销 AI 改写，结果刚打的那句也没了（B2）；另外切到正文相同的另一篇文稿再接受，改的是另一篇（B1）。两处都是数据风险，不是顺不顺的问题
- 决定：修：退回实现线——改写会话绑定文稿身份并在切换时失效，接受时同时校验身份和原文；接受事务用现成的历史分组隔离，补两个反例回归。动作数 9 到 4 的收益保留，不能拿它抵消数据风险
- 协调决定：待协调（通过 / 退回 / 明示延期）

## 没验证的

| 缺口 | owner | 复查条件 |
| --- | --- | --- |
| 真人首次操作：SEQ、误点、回退、求助、首次尝试 | 协调会话（找真人） | 有参与者时每人 10–15 分钟；在此之前这一栏一直是 null |
| Electron 整机、真文本模型 | I-rewrite | 阻断修完后跑一次真 App 零花费走查；真模型最小量另议 |
| 性能（任务书称 p95 超预算） | I-rewrite | 本页没读也没核；以 perf-scenario 证据行为准 |
| 英文暗色下按词对比的可读性 | 设计线 | V-rewrite 列为建议，不阻断 |

## 证据路径

- V-rewrite（独立验收报告，仓库外）
- docs/evidence/2026-10-21-ux-scorecard/1264-shots/live-01-selected.png 到 live-05-undone.png（走查截图，复制自 #1264 分支）
- docs/evidence/2026-10-21-ux-scorecard/1264-shots/cross-document-running-before-accept.png、cross-document-running-after-accept.png
- docs/evidence/2026-10-21-ux-scorecard/1264-shots/safety-probe.json
- V-rewrite 附带的跨文稿复现数据 probe-results.json（协调本地，仓库外）

> 这一页不出总分：机器数、真人数、护栏、未验证各看各的。
