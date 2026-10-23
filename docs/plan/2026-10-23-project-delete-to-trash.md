# 设计卡：删项目进系统回收站（⑭）

> 状态：✅ 已交付（跟着 #1300 一起合入；Windows 回收站真删 / 真还原未验，见第 8 格）
> 实现线 P-library-2。用户 2026-10-22 拍板 ⑭，2026-10-23 拍板五项默认。方向检查：`docs/engineering/direction-checks/2026-10-23-project-delete-to-trash.md`（改法「换」：永久删除换成进系统回收站）。
> 类别：碰「删用户文件」，按丢数据类全格填。

## ★0 先查别人

- Electron 官方文档 https://www.electronjs.org/docs/latest/api/shell ：`shell.trashItem(path)` 把文件或文件夹移进系统回收站（Windows 回收站、macOS 废纸篓、Linux 桌面回收站），出错就 reject。**确认了**：用现成能力，不自写。
- Electron 源码 https://github.com/electron/electron/blob/main/shell/common/platform_util_win.cc ：Windows 用 `IFileOperation` 加 `FOFX_RECYCLEONDELETE`，挂了 `DeleteFileProgressSink`。遇到进不了回收站的项，`PreDeleteItem` 返回 `E_ABORT`，整次放弃（`Operation was aborted`），不会退回永久删除。**确认了**：Windows 上「绝不静默永久删除」由平台本身兜住；我们另外再核一次原路径。
- 仓库先例 `electron/workspace/workspaceFileDelete.ts:39`：删单个素材已经走 `shell.trashItem`。**改了**：项目文件夹也走同一个平台能力。同一文件 `:42` 对旁边的说明文件，进不了回收站会退回 `rmSync`。这和本次拍板的原则冲突，记进下面「后续」。
- macOS 真机采样 `docs/evidence/2026-10-23-project-delete-to-trash/mac-roundtrip-result.jsonl` 与 `electron/projects/projectDeleteToTrash.test.ts` 的「真机采样」一节 · macOS 的废纸篓按卷分（系统卷 `~/.Trash`，外接盘 / 磁盘映像 `<卷>/.Trashes/<uid>`），`shell.trashItem` 会写「放回原处」信息（`ptbL` / `ptbN`），卷没有废纸篓就报错、不删；报错原文是 NSError 的本地化文字，**随系统语言变**，还带着项目文件夹名 · **改了**：失败分类不能只认英文原文——补上中英文系统的真机原文样本，匹配前剔掉文件夹路径和引号里的名字，认不出就 unknown（见 ★6）。

## ★1 用户怎么用

- 场景：用户在项目库里点某个项目的删除，确认「删除」后，项目文件夹进系统回收站；后悔了，可以从回收站还原。
- 步骤：
  1. 点卡片上的删除按钮；
  2. 确认框写明会移到「回收站 / 废纸篓」、可以还原、还原后下次启动 Nomi 会回到项目库；
  3. 点确认；
  4. 卡片消失，提示「已移到回收站，要找回就从回收站还原」；
  5. 进不了回收站时，卡片还在，卡片上说明原因、写明项目没有被删除。
- **不做**：
  - 应用内撤销；
  - 「仍要永久删除」二次选项（拍板不加）；
  - 外部文件夹进回收站（外部文件夹仍然只从项目库移除）。
- **真实任务**：在真机删一个本地项目，在系统回收站里能看到它、能还原、下次启动回到项目库。macOS 已验（见 ★8，一次性磁盘映像卷上的真废纸篓）；Windows 回收站待验收线或用户在真机确认。
- **指标**：「确认删除」后被永久删除的次数 = 0。量具：`electron/projects/projectDeleteToTrash.test.ts`，里面有结构守卫和变异。

## ★1b 连带界面

- 确认框：标题「删除项目」不变，正文改成「会移到回收站 / 废纸篓，可以还原」。中文正文分三行，回收站叫法单独在不含项目名的一行里（项目名长度不定，叫法若和名字同行会在行尾被拆成「废纸 / 篓」，第 2 轮改）。
- 成功：toast「已移到回收站……下次启动回到项目库」。**只有主进程回 `deleted: true`（文件夹真进了回收站）才弹**（第 2 轮改）。
- 没有东西进回收站：主进程回 `deleted: false`（文件夹已被挪走、库页没刷新；或其实是外部文件夹）时 toast「已从项目库移除，但项目文件夹没有移到回收站……没有删除任何文件」，不说「已移到回收站」（第 2 轮新增）。
- 失败：卡片上的提示按三类说：权限 / 该位置没有回收站 / 文件被占用；其余写「详细原因已记进日志」。
- 「只移除」确认框（灰卡、外部文件夹）不变。
- 以上中英都在 i18n 里。

## ★2 谁说了算

- 删项目目录的唯一做法是 `electron/projects/projectTrash.ts` 的 `moveProjectFolderToTrash`。
- workspace 项目走 `deleteWorkspaceProject`，回收站由调用方注入（workspace 层不 import electron）；老格式项目走 `deleteProject` 的 legacy 分支。
- 概念 `project.directory-lifecycle` 的说明已同步。
- 渲染层删除流程的唯一主人是 `src/workbench/library/projectDeleteFlow.ts`。

## ★3 一致与复用

- 复用 Electron `shell.trashItem`，和 `workspaceFileDelete.ts` 用的是同一个平台能力。
- 错误跨进程识别照 `projectDeleteIntent.ts` 已有的写法：名字写进信息开头。
- 回收站叫法用一个 `trashBinKey(platform)`，确认框、成功提示、失败提示共用。

## ★4 全状态

| 状态 | 用户看到什么 |
|---|---|
| 确认中 | 确认框写明会移到回收站 / 废纸篓、可以还原 |
| 进回收站成功 | 卡片消失，提示可以从回收站还原 |
| 没有权限 | 卡片还在，说明没权限、项目没被删 |
| 该位置没有回收站（网络盘 / 外接盘） | 卡片还在，说明这个位置没有回收站、项目没被删，需要的话请到文件夹里自己处理 |
| 文件被占用 | 卡片还在，说明有文件被占用、关掉再试、项目没被删 |
| 其余失败 | 卡片还在，说明项目没被删、详细原因已记进日志 |
| 别处正锁着这个项目 | 「项目正被别处占用」，不删 |
| 取清单锁时写不进 .nomi（只读卷 / 没权限写） | 不算「别处占用」：交给回收站那一步，报它给的真原因（比如「该位置没有回收站」）；项目没被删（第 2 轮改） |
| 确认删除、主进程却没把文件夹移进回收站（`deleted:false`） | toast 说「已从项目库移除，但项目文件夹没有移到回收站」，没有删任何文件（第 2 轮新增） |
| 删的是正打开的项目 | 先释放，不论成败都回项目库；失败时卡片在、显示原因 |
| 取消中 / 能力不可用 | 不适用：本地操作，不调模型 |

## 5 中途表

- 确认后、进回收站之前关窗：主进程调用要么已经发出（进回收站是一次原子的系统操作），要么没发出，没有中间态。
- 进回收站成功但还没解绑时进程退出：下次启动列表里这一项显示成「文件夹暂不可用」（登记还在、目录不在），native 项目会被自愈摘掉，不丢东西（文件在回收站里）。
- 断网：不涉及，网络盘本身就是「该位置没有回收站」那一类。
- 连点：确认框只有一个；删除按钮在流程中重复触发，最多再弹一次确认，删第二次时项目已经不在，只解绑。

## 6 外部数据与失败

- 外部来源是操作系统的回收站，规范见 ★0。
- 失败一律不删、原样报错；分类依据是错误码、HRESULT 和平台文字，认不准就归「其余」，不猜。
- **真机采样（macOS，2026-10-23）**：Electron `shell.trashItem` 的报错只有一句本地化原文，没有错误码：
  - 卷没有废纸篓（只读卷）：中文系统「未能将“…”移到废纸篓，因为宗卷“…”没有废纸篓。」，英文系统「“…” couldn’t be moved to the trash because the volume “…” doesn’t have one.」；
  - 没有权限（上级目录不可写）：中文系统「未能将“…”移到废纸篓，因为你没有访问该诊断报告的许可。」，英文系统「“…” couldn’t be moved to the trash because you don’t have permission to access it.」。
  - 修前：中文系统两类、英文系统「没有废纸篓」都落进「其余」。修后认得出；其它系统语言（日 / 韩 / 繁体）仍落进「其余」，只是提示更笼统，不影响「什么都不删」。
  - 系统原文里会带项目文件夹名（用户起的，可能叫 permission / locked）：匹配前先剔掉完整路径和引号里的名字。
  - 样本进了 `projectDeleteToTrash.test.ts`；变异「去掉 macOS 样本」「不剔文件夹名」都红。

## ★7 性能

不适用：删除是一次性操作，不在交互热路径。删除口从同步 IPC 换成异步，界面不再干等主进程。

## 8 真实条件

- Windows：确认框截图（中 / 英）已亲眼看过（`delete-confirm-zh-CN.png` / `delete-confirm-en.png`）。Windows 回收站里真删、真还原：**unverified**。
- **macOS（Mac 真机，2026-10-23，已验）**：`docs/evidence/2026-10-23-project-delete-to-trash/walk/real-trash-roundtrip.mjs` 用真 App、真界面点击，走完「进废纸篓 → 还原 → 下次启动回项目库」，加一条「进不了废纸篓」：
  - 项目放在脚本自己建的一次性磁盘映像卷里（`<卷>/.Trashes/<uid>` 是系统真的废纸篓，同一个 `NSFileManager trashItemAtURL`）。原因：`~/.Trash` 命令行进程读不了（Operation not permitted），在那里看不到、还原不了、也清不掉，会往用户真废纸篓里留垃圾；映像卷用完卸载删掉，用户真实的废纸篓一个字节没碰；
  - 结果：25 行结果全过（23 条断言 + 2 行确认框原文记录，`mac-roundtrip-result.jsonl`），截图 5 张逐张亲眼看过（`mac-confirm-zh-CN.png` / `mac-confirm-en.png` / `mac-trash-refused-zh-CN.png` / `mac-after-delete-zh-CN.png` / `mac-after-relaunch-zh-CN.png`）；
  - 还原用「把文件夹搬回原位」代替 Finder 的「放回原处」（两者效果相同；系统写的 `ptbL` / `ptbN` 放回原处信息已确认在）。**系统卷的 `~/.Trash` 本身没验**（读不了，且不往用户废纸篓留垃圾）；
  - 这一轮还发现并修了一处缺口：macOS 报错原文随系统语言变，原分类认不出（见 ★6）。
- **第 2 轮（Mac 真机，2026-10-24，真 App、真界面点击，项目都建在一次性磁盘映像卷里，没碰用户真实的废纸篓，截图逐张亲眼看过）**：
  - 中文确认框改成三行后重拍 `mac-confirm-zh-CN.png`（默认项目名「未命名项目 10/24 02:12」，和验收截图里把「废纸篓」拆成「废纸 / 篓」的名字一样长），叫法在单独一行里没被拆开；走查 `shell-redesign.walk.mjs` #47（真界面正文 = 词典那句）在新文案下仍过（这份走查后面的 #44「选中时间轴片段」找不到片段而红，V-library-trash 在合并基线上核过同样红，与本 PR 无关）；
  - 项目文件夹在访达里被挪走、库页没刷新时点删除：弹的是新提示「已从项目库移除，但项目文件夹没有移到废纸篓……」（`mac-removed-only-zh-CN.png`），映像卷废纸篓里什么都没有、挪走的文件夹原样；修前同一步弹的是「已移到废纸篓」；
  - 项目放在只读卷上点删除：卡片上说的是真原因「这个位置（比如网络盘或外接盘）没有废纸篓。项目没有被删除」（`mac-readonly-volume-zh-CN.png`），不再是「可能有别的程序正占用它的文件夹」；文件和登记原样、废纸篓为空。
  - Windows 的两张确认框截图（`delete-confirm-*.png`）是改之前的旧文案，没重拍（没有 Windows 真机）。
- Linux：unverified（桌面回收站）。

## 拍板图

**认领 `Library` 板的五个元素**（第 2 轮新增第五个 `library.delete.removedOnly`；协调 10-23 定：不套 `pure-bugfix`——它的定义是「不改布局、元素、文案，只修行为」，本 PR 改了三处文案；不出样张——文案是行为改动的直接结果，布局没变）：

- 查证：`docs/design/boards/` 里和项目库相关的只有 `2026-10-08/Library.board.json`、`LibraryEmpty.board.json`，原清单没有卡片删除钮、删除确认框、删除成功 / 失败提示，`functionCensus` 也没列删除。本 PR 把它们补进 `Library.board.json`（原来的元素只增不改），`stage` 仍是 `explored`，板源和候选不动，`check:board-parity` 过。**第 2 轮动了合同内容两处**：新增元素 `library.delete.removedOnly`；`library.delete.confirm` 的中文正文改成三行（词典同步改）。板内容变了，协调之前对 77ecef7 的确认记录哈希对不上，推送后要重跑 `coord-approve --board Library`。
- 五个元素都是 `implemented`、`change: keep`（沿用现有组件，只改文案 / 去处），中英原文写在各自的 `copy` 里，和产品词典同一份：
  - `library.card.delete`：卡片上的删除动作。走查 `tests/ux/shell-redesign.walk.mjs` #47（悬停出钮、点开确认框、取消不删）。
  - `library.delete.confirm`：删除确认框。走查 #47 核真界面上的正文 = 词典那句（带这台电脑的回收站叫法）；`tests/ux/library-delete-copy.test.mjs` 核板上写的原文 = 词典、流程交给确认框的正文 = 词典填上名字和平台叫法（3 个平台 × 中英）。
  - `library.delete.moved`：删除成功提示（主进程回 `deleted:true`）。同一个单测。
  - `library.delete.removedOnly`：主进程回 `deleted:false` 时的提示（只从项目库移除、没有东西进回收站）。同一个单测：板上原文 = 词典 = 流程交给界面的那句（3 个平台 × 中英）。
  - `library.delete.failed`：进不了回收站的失败提示（四类原因各一句，都写明项目没有被删除）。同一个单测，新增一类原因没写进板就红。
- `decisions` 加一条 D1：用户 10-22 / 10-23 两次原话「按推荐」，被推荐的是 ⑭ 的行为和五个默认；确认框 / 提示 / 失败提示的具体文案是协调 10-23 按 ⑭ 行为定的，非用户逐字。
- `functionCensus` 加一行「项目库：删除项目」→ `library.card.delete`，旧功能有了去处。
- 推送后由协调跑 `coord-approve --board Library`。

## ★9 验收与回滚

| 编号 | 反例 | 期望 |
|---|---|---|
| ① | 本地项目确认「删除文件」 | 文件夹进回收站、原路径不在了、素材在回收站里、之后才解绑 |
| ② | 进不了回收站：没权限 / 没有回收站 / 被占用 / 其余 | 抛 `ProjectTrashFailedError[原因]`，文件和登记都在 |
| ③ | 回收站报成功、原路径还在 | 当失败处理，不解绑 |
| ④ | 灰卡、外部文件夹点删除 | 意图是 unbind，不进回收站（组件级流程测试 `projectDeleteFlow.test.ts`） |
| ⑤ | 外部文件夹哪怕传了 delete-files | 也只解绑 |
| ⑥ | 老格式项目 | 同样进回收站；进不了就报错 |
| ⑦ | 删的是正打开的项目 | 先释放再删，失败也回项目库 |
| ⑧ | 别处正锁着这个项目 | 报占用，不删 |
| ⑨ | 从回收站还原 | 下次启动回到项目库 |
| ⑩ | 两个删除文件里写永久删除 | 结构守卫测试红；变异「失败退回 rmSync」「老格式换回 rmSync」「先解绑再删」「不核原路径」「去掉占用检查」「流程一律传 delete-files」「失败不回项目库」都红 |
| ⑪ | 文案 | 中英进词典，截图亲眼看；板上原文 = 词典 = 流程交给界面的那句（`tests/ux/library-delete-copy.test.mjs`，变异：改板上一个字、换错平台叫法都红）；走查 #47 核真界面上的确认框正文 |
| ⑫ | 平台差异 | 见方向检查 §2 |
| ⑬ | 系统报错原文随平台 / 系统语言变，还带着用户起的文件夹名 | 真机采样的原文（macOS 中 / 英 × 没有废纸篓 / 没权限、Windows 放弃操作）分对类；名字叫 permission / locked 不带偏；其它语言认不出就是 unknown、什么都不删；变异「去掉 macOS 样本」「不剔文件夹名」都红 |
| ⑭ | 走查 / 脚本收尾往用户真回收站塞测试垃圾 | 走查不许调产品删除（桥、IPC 通道、界面点确认；素材删除口同样先关上）、不许直接 `shell.trashItem`；唯一例外是自带一次性磁盘映像的真机脚本，收尾断言映像废纸篓是空的；守卫测试给每个口各一个反例（`tests/system/walks-never-trash-projects.test.mjs`） |
| ⑮ | Mac 真机闭环 | 进废纸篓 → 还原 → 下次启动回库，加「进不了」一条，`real-trash-roundtrip.mjs` 23 条断言全过（另有 2 行确认框原文记录） |
| ⑯ | 拍板图：Library 板的删除元素 | `check:board-parity` 过；元素都是 `implemented`，断言在走查 #47（真界面）和 `library-delete-copy.test.mjs`（板上原文 = 词典 = 流程交给界面的那句；变异改板上一个字、叫法换成别的平台都红） |
| ⑰ | 删除前取清单锁写不进 .nomi（只读卷 EROFS / 没权限 EACCES、EPERM） | 不报成「别处占用」；回收站那一步被走到、报它给的真原因；项目文件和登记原样。回收站进得去就照常进（`projectDeleteToTrash.test.ts`，变异「取锁错一律往外抛」红） |
| ⑱ | 确认删除、主进程回 `deleted:false` | 界面不弹「已移到回收站」，弹「已从项目库移除，但项目文件夹没有移到回收站」；`deleted:true` 才弹成功；「只移除」两种提示都不弹（`projectDeleteFlow.test.ts`；`localProjectStore.listFace.test.ts` 核 `deleted` 带得回来；`library-delete-copy.test.mjs` 核三个平台 × 中英的原文；变异「不看 `deleted` 一律弹成功」红） |
| ⑲ | 中文确认框正文把回收站叫法拆在行尾 | 叫法单独在不含项目名的一行里、整行放得进确认框一行（`library-delete-copy.test.mjs`）；Mac 真机重拍截图亲眼看（第 8 格） |

**回滚**：revert 本 PR 的 fix 提交。

**独立验收**：另一条线（协调指派）。

## 第 2 轮：独立验收后的合并前小改（2026-10-24，P-library-trash-r2）

独立验收 V-library-trash 判 #1300「通过」，报告「建议」里有三处是本 PR 新加的代码让界面说了不准的话（不丢数据）；验收线和协调都推荐合并前补掉。三处都不改方案（改法仍是「换」），不新增绕过：

1. **取清单锁**（建议 1）：`deleteWorkspaceProject` 删除前取锁只用来探「别处占用」，只把 `WorkspaceManifestLockBusyError` 往外抛。只读卷 / 没权限写 `.nomi` 抛的 EROFS / EACCES 以前原样往外跑，绕过回收站那一步的分类，卡片上说成「可能有别的程序正占用它的文件夹」，现在交给回收站去试、去报真原因。
2. **成功提示**（建议 2）：`deleteLocalProject` 把主进程返回的 `deleted` 带回来，流程只在 `true` 时弹「已移到回收站」，`false` 时说只从项目库移除了。
3. **确认框中文正文**（建议 5）：分三行，回收站叫法单独一行。

**类根因**：「界面说的话按用户点了什么说，不按主进程实际做了什么说」（说的 ≠ 做的）。结构上的补法：流程的删除依赖签名从 `Promise<void>` 换成 `Promise<{deleted}>`，流程不看结果就没法说成功；取锁这一步的「只有别处占用才拦」写成测试钉死（EROFS / EACCES / EPERM 各一条）。

**方向检查计数**：`node scripts/fix-churn.mjs` 对这几个文件又报命中（`workspaceRepository.ts` 第 7 刀、`NomiStudioApp.tsx` 第 7 刀、`projectDeleteFlow.ts` 第 3 刀、`projectRepository.ts` / `localProjectStore.ts` / `resources.ts` 各第 5 刀，以及 `electron/workspace/`、`src/workbench/library/` 目录和三个概念）。来源查得到：`workspaceRepository.ts` 和 `NomiStudioApp.tsx` 都是 main 上 5 个 fix（10-10 ~ 10-22 的 V-plibrary 几轮）加本 PR 自己的 `87baf3eed`，其余命中同理。这一轮是协调按独立验收的建议派的、同一个 PR 合并前的小改，改法仍是 `docs/engineering/direction-checks/2026-10-23-project-delete-to-trash.md` 里已批准的「换」，没有换方案、没有新增旁路（取锁那处是收窄往外抛的错，不是新增分支）；提交带 `Direction-Check:` trailer 指向同一份方向检查。**账**：建议 3（还原到改过的项目位置后不回库）、建议 4（走查守卫从扫文本升级成结构上做不出来）不在这一轮，协调另立账。

## 后续

- **下一单**：`electron/workspace/workspaceFileDelete.ts:42`。删单个素材时，旁边的说明文件进不了回收站会退回 `fs.rmSync`，违反「绝不静默退回永久删除」。按同一原则改成报错、不删。（用户 10-23 定：⑭ 合入后作为下一单。）
- Windows 回收站的删除与还原由验收线确认（见第 8 格；macOS 已在 Mac 真机验过）。
- 走查收尾（用户 / 协调 10-23）：走查直接删自己建的临时根（`launchNomiApp` 的 `close()` → 测试自己的 `fs.rm`），不走产品删除；全仓只有 `tests/ux/seedance-apimart.e2e.mjs` 在收尾走过产品删除口，已改。守卫 `tests/system/walks-never-trash-projects.test.mjs` 把三个口（桥 / IPC 通道 / 界面点确认）和 `shell.trashItem` 都拦住，真机脚本自带一次性磁盘映像、收尾断言映像废纸篓是空的。
