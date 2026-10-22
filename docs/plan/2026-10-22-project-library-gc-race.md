# 设计卡：项目库收尾——列表只读不删项目（N1）、一项读不出只坏一张卡（N2）

> 实现线 P-library-2，验收线 V-plibrary2。方向检查（用户 10-22 拍板 C′ 共用部分）：`docs/plan/2026-10-21-project-library-direction-check.md` 的 N1 节、§8 和 §8a。
> 类别：丢数据（N1）按 9 格全填；N2 是纯 bug 修复下的界面改动，按 pure-bugfix 例外写拍板图一格。

| 格 | 内容 |
|---|---|
| ★0 先查别人 | ① V-plibrary 验收报告 N1 / N2（`D:/Nomi-coord-state/reports/V-plibrary.md` 第三节）：给了两个方向，一是删除授权看 `stagedTransactionTails`，二是把重读和删除放进同一把锁。**改了**我们的决定：两个都只是补授权，最后选了「列表只读」，删除器整个拿掉。② `docs/plan/2026-06-14-empty-draft-project-gc.md`：原回收设计默认「首次列举 = 本进程还没写过」。**确认了**这个前提只靠调用顺序维持。③ `docs/lessons/mcp-read-path-must-not-write-host-configs.md` 和 `check:read-path-writes`：读路径不许写，是仓库已有的规则。**改了**守法：把删项目也纳入这道门岗，不另起一道。 |
| ★1 用户怎么用 | 当我开着 Nomi，项目库在加载，同时某个项目正在后台保存（MCP / Agent 写入、自动保存在排队等锁），我希望刚保存的东西不会被删，以便放心让 Agent 在后台干活。当库里某个项目的数据坏了或者被链接到了别处，我希望其他项目照常出来，坏的那张说清怎么回事，并能把它从库里移走，以便库不会整页打不开。**不做什么**：离开项目时不收空草稿，等「离开只写欠着的」落地（今天离开会整存转正草稿）；不修 `.nomi` 越界本身，只拒读和提示。**真实任务**：① 验收用例 C 的时序（`electron/projects/draftGcInterleave.test.ts`）；② 一个项目 `.nomi` 是越界 junction，库里还有一个正常项目（截图脚本 `docs/evidence/2026-10-22-project-library-80/walk/unreadable-card-shots.mjs`）。**指标**：保存排队时被删的次数 = 0（量具：上面的特征测试）；一项读不出时其余卡的可见率 = 100%（量具：`projectListSummary.test.ts`）；回库耗时护栏用 `project-library-list` / `project-library-list-80` 两个 perf 场景。 |
| ★1b 连带界面 | 项目卡：置灰、不可点，悬停标签分两种（「项目数据指向文件夹外，已停止读取」/「读不出这个项目的数据」），title 写下一步；同步角标照旧显示「文件异常」；删除确认框走「从项目库移除，不删文件」的文案（与外部文件夹同一句）；MCP / Agent 的项目列表同样拿到 `unreadableReason`，也同样看不到可证明为空的草稿。 |
| ★2 谁说了算 | 项目列表摘要的唯一主人：`listWorkspaceProjects`（door-map 只有一个读入口 `repository.ts`）。删项目目录的唯一主人：用户删除 → `deleteProject` → `deleteWorkspaceProject`（door-map 1 扇，原先 2 扇）。取锁不造根：唯一取锁函数 `tryAcquireCanonicalWorkspaceManifestLock`。同一事实只存 1 份；没有靠「东西不见了」去猜用户意图。 |
| ★3 一致与复用 | 置灰卡复用现有「文件夹暂不可用」那种卡（`project.missing` 的样式与交互），不新增元素。「只解绑不删盘」复用外部文件夹的删除文案和 `removeWorkspaceReference`。边界错误的判据复用 `isWorkspaceBoundaryError`（原本就有，这次导出）。门岗复用 `check:read-path-writes`。 |
| ★4 全状态 | 正常：卡片照旧。暂时忙（别的写者锁着）：普通登记卡，下次刷新恢复。越界：置灰卡 +「项目数据指向文件夹外，已停止读取」，下一步写在 title（可从项目库移除，不删文件；修好 `.nomi` 后回库自动恢复）。其余读不出：置灰卡 +「读不出这个项目的数据」，同样给出下一步。文件夹不在：照旧显示「文件夹暂不可用」。可证明为空的草稿：不显示。取消中 / 能力不可用：不适用（纯本地读，不调模型）。文案中英文都在 i18n 里，`check:i18n` 已过。 |
| 5 中途表 | 列表读取途中被关窗 / 重启：只读，不留半截状态。保存排队途中被关窗 / 重启：保存走原有的退出排空，没有删除器和它抢。删除途中：只有用户点删除才会删，流程和以前一样。断网 / 连点：不适用，纯本地；连点刷新只是多读几次，只读、幂等。花费：不涉及。 |
| 6 外部数据与失败 | 外部来源只有用户磁盘上的 `.nomi` 和项目目录。junction / 符号链接越界时按边界规则拒读，卡片说明原因。项目根在写的过程中被删（资源管理器删掉 / 同步盘挪走）时，明确报 `WorkspaceRootMissingError`，不重建孤儿目录。 |
| ★7 性能 | 不是新功能，但按任务书量过：81 个项目回库中位 424.8ms，同时段 41 个项目 443ms（都是 noisy），时间不随规模涨，所以不需要窗口化。超预算的主因是离开时整份重存（save-async 298ms 加 list-async 210ms，串行），另行立项。场景 `project-library-list-80` 已登记（proposed 300，基线由协调写）。这次列表只对可证明为空的候选多读一次清单，其余项不多读（`repository.test.ts` 钉住「每项只快照读一次」）。 |
| 8 真实条件 | Windows：是。英文界面：截图已做。真实 junction 越界：是。真规模：80 个项目只做了 perf。干净安装 / 真付费 / 键盘全程：`unverified`，与本改动无关。 |
| 拍板图清单 | 不适用（pure-bugfix 例外）：复用现有置灰卡，没有新元素；协调 10-22 已批复用和文案。截图：`docs/evidence/2026-10-22-project-library-80/unreadable-card-{zh-CN,en}.png`。 |
| ★9 验收与回滚 | **验收清单（反例 → 期望）**：① 保存排队等锁时列举收尾 → 目录在、保存成功、之后的列表里有它；② 列举途中保存成功 → 这一次的列表里就有它（对候选再读一次清单）；③ 遗留空草稿 → 不显示，但目录和登记都在，列多少次都不删；④ 草稿 `assets` 里有文件 → 照常显示；⑤ staged / immediate 写者排队期间根被删 → 报 `WorkspaceRootMissingError`，根不被重建；⑥ 一个项目越界 → 整页不抛错，邻居照出，这张卡带 `unreadableReason`；⑦ 一个项目被别的写者锁着 → 整页不抛错，这张卡是普通登记卡；⑧ 删除读不出的项目 → 只解绑登记，盘上文件不动；锁忙时删除照常报错；⑨ 任何 list / read / resolve / get 能走到 `deleteWorkspaceProject` → `check:read-path-writes` 变红。**变异**：见 PR 正文。**回滚**：revert fix 提交 `c219118e8`。**独立验收**：V-plibrary2，待出。 |
