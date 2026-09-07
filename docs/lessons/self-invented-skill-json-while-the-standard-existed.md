# 自造 `skill.json`：标准就摆在那儿，只是没人在动手前去看一眼

> 📎 教训 · 首次记录 2026-09-07 · 状态：现行
> **触发场景**：你要设计或改一个「**外部也读写**」的东西的形状——技能/提示词包的文件格式、MCP 配置、模型可见的工具 schema、导入导出格式、供应商 API 契约、要和别的宿主互通的落盘格式。也就是说：除了我们自己的代码，还有第二个程序（或第二个人手写它）会读写这东西。

**结论**：动手之前先花十分钟找**规范或事实标准**，找到就对齐它；要扩展，只能放进标准留的扩展点（如 YAML frontmatter 的自定义键），**绝不另起一个平行文件**。找不到才自定义，而且要写清「查过哪些、为什么对不上」。这三步现在是机器判据：`docs/engineering/standard-formats.json` + `pnpm run check:standard-formats`（R31）。

**为什么会踩**：

Agent Skills 的官方形态只有一种——**文件夹 + `SKILL.md` + YAML frontmatter**，Claude Code / pi / Codex 三家一致，没有第二个清单文件（https://code.claude.com/docs/en/skills）。我们在它旁边另起了 `skill.json`，把 name / description / archetypeId 放进去。

后果分两层，中间隔了将近两周：

- **2026-08-26 群里抱怨「别人的技能导不进来」**。用户原话：「正常用 hermes 或 workbuddy 都是导入一个 zip 包就行，包里有 skill.md 就行了」。当天的修法是**在导入侧加一条兼容路径**（`src/workbench/skillLibrary/parseSkillImport.ts` 的 `packageFromMarkdown`，2026-08-27 加），让裸 `SKILL.md` 也能进来——症状修掉了，**平行文件本身没动**。
- **2026-09-07，文案还在引导用户去造 `skill.json`**。因为导出侧、模板、说明文字全都还按自造格式写着。

要害不是「当时没查」这一次失手，是**这个机制**：

1. **系统只奖励「做出来」，不惩罚「没查」**（和 R29/`check:prior-art` 是同一条）。写一个 `skill.json` 有产出、看得见；查一圈发现标准已经定好、于是什么都不用发明，看起来像空手一轮。
2. **症状修复会让根因活得更久**。加一条兼容导入路径之后，「导不进来」这个能被用户看见的信号消失了，而平行文件继续存在、继续被文案推广。**能看见的那半边被补上，剩下的那半边就再也没人碰。**
3. **提醒不是防线**（R28）。R5 写着「碰三方库先查官方文档」，但格式设计当时不被当成「碰三方库」——它看起来像我们自己的内部结构。**「这是我们自己的东西」是这类失手最常见的自我说服。**判据要换成一句可机检的话：**除了我们的代码，还有没有第二个程序会读写它。**

**怎么用**：

- 设计任何外部可见的形状前，先在 `docs/plan` 的「## 先查别人」里写死一行**标准对齐**：`规范链接` / `我们的偏差` / `偏差理由`。**理由只许是领域约束**（「这是别人家的配置文件，整份覆盖会删掉用户其它的 server」），不许是偏好（「我们这样更简单」「当时就这么写的」）——偏好写上去等同于承认没查。
- 想加字段时先问：**标准有没有留扩展点？** frontmatter 的自定义键就是门；另开一个文件是自己凿的墙。我们的 `audience: mcp|internal` 走的是门，`skill.json` 走的是墙——同一个技能包里两种做法并存，正好是对照组。
- 登记进 `docs/engineering/standard-formats.json`，**抓一份官方样例当夹具**放 `tests/fixtures/standard-formats/`（出处记 `SOURCES.md`），并写一条读取器测试真的去读它。「我们读得过自己写的」不证明「我们读得过别人写的」——这个盲区就是 08-26 那条抱怨的落点。
- 修这类问题时，问一句：**我修的是「用户看得见的那半边」还是根因？** 加兼容路径让导入能跑，但平行文件和引导它的文案还在——那不叫修好了（P2）。

**出处**：R31（`docs/engineering-rules.md`）；门岗 `scripts/check-standard-formats.mjs`；登记表 `docs/engineering/standard-formats.json`（`nomi-skill-manifest` 条目登记成 `non-aligned`，收敛绑在 PR #580 `refactor/skill-format-frontmatter-20260907`）；官方格式出处 https://code.claude.com/docs/en/skills；症状修复的痕迹见 `src/workbench/skillLibrary/parseSkillImport.ts` 与 `electron/skills/skillPackage.ts` 顶部注释（两处都写着「生态早已收敛到 SKILL.md + frontmatter」，写下这句话的同时 `skill.json` 仍在旁边）。
