# 「先查别人」报告：导进来的技能怎么才能在 Agent 里真用上（2026-09-07）

> R27 §16 的必交物。对应方案：[`docs/plan/2026-09-07-skill-import-real-use.md`](../../plan/2026-09-07-skill-import-real-use.md)。
> 交付分支 `fix/skill-import-real-use-20260907`（PR #582）。
>
> 本报告按手册 §15.2 的清单逐项过，**每条给出处**；没查成的明说「没查成」，不写成「别人没做过」。

## 要回答的三个问题

1. 「盘上状态有两个读者、写方不派失效信号」这件事，**依赖里 / 仓库里 / 生态里已经有正解了吗**？
2. 「把一个文件夹拖进渲染层」这件事，**平台自己给不给、要不要装库**？
3. 技能包的**格式权威**今天在谁手上——失败回执该把用户指向什么？

---

## ① 依赖里已有？

- **zip 解包不自己写**：`fflate` 已经是依赖，导入路径直接用它的 `unzipSync`（[`src/workbench/skillLibrary/parseSkillImport.ts:11`](../../../src/workbench/skillLibrary/parseSkillImport.ts:11)、[`:115`](../../../src/workbench/skillLibrary/parseSkillImport.ts:115)）。本轮**没有**新增任何解压实现。
- **目录拖拽是平台能力，不是库能力**：`DataTransferItem.webkitGetAsEntry()` 与 `FileSystemDirectoryReader.readEntries()` 都在 TS 的 DOM 类型里，也就是浏览器原生就给（`node_modules/typescript/lib/lib.dom.d.ts:9541` 与 `:11859`，各自的 MDN 链接就写在那两行的注释里）。
- **没有可借的现成收件库在依赖里**：`ls node_modules | grep -Ei "dropzone|file-selector"` 输出为空 —— react-dropzone 一族**不是**本仓依赖。判断：不为这件事新增依赖。理由不是「我们能写」，是**它替不掉我们真正的工作量**——收件之后要做的是「归一成 `{dirName, files}` 再交给既有解析器」，那一层无论装不装库都得自己写；而 `readEntries` 的分批语义只有十来行（下面 ② 有出处），换一个依赖不划算（R20 第 ③ 问：这不在护城河上，但也不碰钱不碰信任，标准实现的收益只有那十来行）。

## ② 仓库里已有？

- **「共享状态缺失效信号」这一族，本仓已经有正解在跑**：模型目录用 `nomi-model-catalog-changed`——写方派发（[`src/ui/onboarding/useOnboardingDrawerCatalog.ts:112`](../../../src/ui/onboarding/useOnboardingDrawerCatalog.ts:112)、[`src/workbench/ai/NoTextModelRecoveryCard.tsx:65`](../../../src/workbench/ai/NoTextModelRecoveryCard.tsx:65)），读方各自订阅（[`useVendorHealth.ts:73`](../../../src/ui/onboarding/useVendorHealth.ts:73)、[`NomiStudioApp.tsx:602`](../../../src/workbench/NomiStudioApp.tsx:602)、[`useAgentPanelV4Data.ts:210`](../../../src/workbench/ai/v4/useAgentPanelV4Data.ts:210)、[`useHasTextModel.ts:27`](../../../src/workbench/library/useHasTextModel.ts:27)）。**技能库缺的就是它的对应物**——所以本轮不发明新范式，照抄这一个。同族的根因合同已在册：[`docs/fixes/2026-09-05-agent-model-catalog-refresh.root-cause.json`](../../fixes/2026-09-05-agent-model-catalog-refresh.root-cause.json)。
- **格式解析已有一份，不再造第二份**：`parseSkillImport.ts` 已经处理裸 `.md` / zip（含 GitHub 套层目录）/ `.nomiskill.json` 三条路（[`docs/qa/2026-09-03-skill-import-walkthrough.md:55`](../../qa/2026-09-03-skill-import-walkthrough.md:55)）。拖拽只做**输入形状归一**，解析仍走它。
- **安全校验已有一份，且比 pi 严**：路径深度上限、可执行区跳过、manifest 校验全在主进程（[`electron/skills/skillPackage.ts:29`](../../../electron/skills/skillPackage.ts:29)、[`:59`](../../../electron/skills/skillPackage.ts:59)）。渲染层的深度上限**对齐**它而不是另立一个（[`src/workbench/skillLibrary/skillDropIntake.ts:22-23`](../../../src/workbench/skillLibrary/skillDropIntake.ts:22)）。
- **同题旧文已读，不重复调研**：[`docs/plan/2026-08-27-skills-knowledge-distribution.md`](../../plan/2026-08-27-skills-knowledge-distribution.md)（导入只认自造信封、31 本里只有 7 本带 manifest）、[`docs/fixes/2026-09-01-skill-import-standard-formats.root-cause.json`](../../fixes/2026-09-01-skill-import-standard-formats.root-cause.json)（上一轮修的是「进不进得来」）。**本轮的 delta 是「进来之后用不用得上」**——上一轮全绿时这条缝是开的。
- **本轮的教训已落盘**：[`docs/lessons/imported-thing-invisible-to-the-second-reader.md`](../../lessons/imported-thing-invisible-to-the-second-reader.md)。

## ③ 生态里已有？（官方/一手文档 + 开源近邻 + 同类产品）

- **格式权威已经收敛，而且不在我们手上**：Agent Skills 规范的必填面只有 `name` + `description` 的 frontmatter（[规范总览](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)，本仓早在 [`docs/plan/2026-08-27-skills-knowledge-distribution.md:45`](../../plan/2026-08-27-skills-knowledge-distribution.md:45) 就核对过「一字不差」）。pi / Claude Code / Codex 三家已同格式，**Nomi 是唯一多一份 `skill.json` 的人**——逐项对照表见 [`docs/research/2026-09-07-pi-package-ecosystem.md:168`](../2026-09-07-pi-package-ecosystem.md:168)。⇒ 失败回执只能指向 `SKILL.md`，指向 `skill.json` 是把用户往一个**只有我们有**的格式上带。
- **技能怎么进模型，pi 的参考实现已逐层对照过**：[`docs/research/2026-09-07-pi-reference-implementation-conformance.md`](../2026-09-07-pi-reference-implementation-conformance.md) 的 1.16 / 4.6 两格。与本轮相关的一条：pi 的技能发现是**每次 session 起来时扫盘**，它没有「长驻面板」这个东西，所以**它根本不会遇到我们这个 bug**——这正好说明这条缝是「桌面长驻 UI」独有的，不能指望上游替我们解决。
- **`readEntries` 必须循环读到空**是文档化行为，不是我们的经验之谈：MDN 明写一次调用只返回一批（[FileSystemDirectoryReader.readEntries](https://developer.mozilla.org/docs/Web/API/FileSystemDirectoryReader/readEntries)），Chromium 的批量上限是 100。只读一次 = **静默丢文件**。
- **同类产品在解决的是「装一次、同步多处」，不是「导进来用不上」**：Skills Hub 支持 Claude Code / Codex / Cursor / OpenCode / Gemini CLI / Qwen Code 等，统一安装与启停（[x.com/TiedGST](https://x.com/TiedGST/status/2094309544713453755)，2026-08-31）。⇒ 生态里**没有**现成的东西能替我们做这件事：它们全是 CLI，问题形状不同。这条同时是 R20 的第 ② 问答案。

## ④ TikHub 自媒体：真做的人卡在哪

完整附件：[`tikhub/tikhub-search.md`](tikhub/tikhub-search.md) / [`tikhub/tikhub-search.json`](tikhub/tikhub-search.json)（关键词「Claude Code 技能 Skill 导入 SKILL.md」，四平台各 12 条，共 48 条，2026-09-07 实抓）。

对本轮判断真正有信号的三条：

- **技能是「群里转发 → 装上就用」的东西，不是用户自己写的东西**：「Hermes 必装 skill TOP 10 🚀 📦 60 个官方 skill 中精选」（[小红书 · 薄薄不会诶爱](https://www.xiaohongshu.com/explore/6a4e594700000000150276aa?xsec_token=YBZhA9RHKtpEiKUe8cohlxtRDhZ1lKtrkgPlXZ-ZxCWfk%3D&xsec_source=pc_search)，2026-07-08）、「7个Skills技能包……新手必备，超简单好用（附技能安装包）」（[B站](https://www.bilibili.com/video/BV1aetR61Eti)）。⇒ 走查里那个「群里发我一个 zip」的输入形状是**实况**，不是我们编的场景。
- **用户的心智模型里，技能 = 一个 `SKILL.md`**：「说说 Skills 的 SKILL.md 文件结构是怎样的？」（[抖音 · 程序员R哥](https://www.douyin.com/video/7674851329126732651)，2026-08-17）、「我之前往一个 SKILL.md 里塞了 40 条规则」（[抖音 · Ali厂长](https://www.douyin.com/video/7641034803407604992)，2026-05-18）。**48 条里没有任何一条提到 `skill.json`。** ⇒ 旧文案让用户「补一份 `skill.json`」，等于要求他做一件全生态没人做过的事。这一条是本轮改文案的直接依据。
- **用户会追到「装上之后到底有没有被加载」这一层**：「给Claude Code装了一堆skill之后我一直好奇……抓包扒进」（[小红书 · 张司机在路上](https://www.xiaohongshu.com/explore/6a30068a0000000006023fef?xsec_token=YBkl5ngX373QEsP9tLqH9FPaLjVo8SqsbdME8p9b7oSW0%3D&xsec_source=pc_search)，2026-06-15）、「写了skill却不被调用？改这一行」（[小红书](https://www.xiaohongshu.com/explore/6a91aafb000000002a038b66?xsec_token=YBX9-Wpr2nj1jR7VvlEzSGrV2j6ES9WSG1O-S86ZEVmG4%3D&xsec_source=pc_search)）。⇒ 「卡片立在那儿」不是交付，「模型报文里真的有那份正文」才是——走查的终点断言按这条钉。

## 结论：用已有 / 自研

| 面 | 判断 | 理由 |
|---|---|---|
| zip 解包 | **用已有**（`fflate`） | 已是依赖，零新增 |
| 格式解析 | **用已有**（`parseSkillImport.ts`） | 三条路已覆盖；拖拽只归一形状 |
| 安全校验 | **用已有**（主进程 `skillPackage.ts`） | 渲染层判断一律不可信；深度上限对齐而非另立 |
| 失效信号 | **用已有范式**（照抄 `nomi-model-catalog-changed`） | 同族问题本仓已有正解，不发明第二套 |
| 拖拽收件 | **自研十来行** | 依赖里没有；库替不掉「归一成 `{dirName, files}`」那一层；不碰钱不碰信任 |
| 失败回执指向 | **跟随生态**（只提 `SKILL.md`） | 格式权威在 Agent Skills 规范手上，不在我们手上 |

## 诚实记分

- 真跑了的：TikHub 四平台实抓 48 条（附件在）；`readEntries` 的分批语义由 [`skillDropIntake.test.ts`](../../../src/workbench/skillLibrary/skillDropIntake.test.ts) 单测复现；完整闭环由 `tests/ux/skill-import-real-use.walk.mjs` 真机跑过（`paidCalls: 0`）。
- 只读没跑的：Skills Hub（只读了作者的介绍贴，没装没跑）；Agent Skills 规范页（读文档，没在 Claude Code 里对跑）。
- 没覆盖到的：**操作系统真实文件夹拖拽这一跳**——Playwright / Electron 都发不起它，走查合成的是 `drop` 事件与 FileSystemEntry 树（File 本体是真的）。这一格只能靠人手验，本轮没有人手验的收据，如实记在这里。
