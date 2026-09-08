# 删除未接线的技能 playbook orchestrator

🚧 进行中。任务分支 chore/delete-playbook-orchestrator-20260908。

## 范围与根因

基线：delivery:preflight 刷新后 HEAD = origin/main = e2c0357512989efd31cbe413f48c8b115bcd6c6f。
症状：测试与注释让未接线的阶段调度看起来像生产能力。直接原因：独立的 PlaybookRun / 拓扑排序 / markdown 切段只被测试调用，生产调度另有 owner。根因：未接入实现及其需求派生残留，测试自证不代表生产使用。
分类 one_off：这是无生产入口的孤立死代码删除，不是对可重现生产故障增加分支；整个模块及仅测试消费的报告函数一起移除后，没有用户、输入、供应商或平台能进入它。没有引入通用门岗或运行时修复；不新增 v3 修复合同、R17 规则或依赖。R17 红证不适用（无新门岗）；改动派生测试先红后绿。

## 最新 main 逐项复核

用 git grep 在 origin/main 的 electron / src / scripts 查符号，并查全部技能 SKILL.md 写入方：

- runPlaybook：零结果，任务书所述两条 schema 注释已在 main 消失。
- PlaybookRun、extractMarkdownSection：仅定义及 playbookOrchestrator.test.ts；orderPlaybookStages 另被 builtinSkills.test.ts 两例使用。
- dependsOn / pause：仅旧 orchestrator 执行；schema / migration 仍解析保留。
- stages.tools / modelPrefs.family：skillCapability.ts 计算 needs.tools / families，但 skillIpc.ts:36,70 只取 providers。
- reportSkillCapability / SkillCapabilityReport：全仓只有 skillCapability.test.ts，随 tools/families 死派生移除。
- goal：skillIpc.ts:81 投影 stageLabels；SkillCard.tsx:36 用长度，扩大到全仓 git grep stageLabels 后发现 ProjectAgentResidentShell.tsx:317 还拼接备用说明。因此「goal 只用数组长度」并不完全成立；保留 goal / DTO，仅标明不参与运行时规划。
- id / skillRefs：skillExecutionEvidence.ts:36 查引用；productionRunDriverOps.ts:315,382 真实调用，保留。
- modelPrefs.kind：deriveSkillNeeds → skillIpc → provider chip，保留。
- productionPlaybooks.ts:30 的生产阶段表独立拥有执行顺序，不依赖被删模块；不改该高风险生产文件（保留其中历史类比注释）。

## 先查别人（R31）

- Agent Skills 官方规范 https://agentskills.io/specification ：2026-09-08 抓取确认 SKILL.md + YAML frontmatter，metadata 是扩展位置；不新增平行清单。
- 本地格式 owner [技能包格式规范](../skill-pack-format.md) §5：阶段元数据已经是对外格式，已有写入不能直接删 schema。
- 现有 R31 登记 [standard-formats.json](../engineering/standard-formats.json) 的 agent-skill 项及官方夹具继续适用。metadata.nomi 嵌套是已有偏差，领域理由是保存 Nomi 的模态与技能引用；本次不新增偏差。
- 生产近邻 electron/productionRun/productionPlaybooks.ts:30 已有独立执行阶段 owner；不是引入或重造调度器，删除孤立实现即可。

brand-promo / drama-short / release-media-pack 的 frontmatter 在写 goal、tools、depends-on、pause；前两者还写 model-prefs.family=seedance。skill-author 正文也示范旧字段。因此按任务书保留五类字段的解析，schema 和格式文档标 deprecated，明确「无运行时调度/授权/模型家族选择作用」。goal 仍作兼容 DTO 标签与缺描述时的备用说明；id、skill-refs、kind 仍有效。旧迁移路径不变，不丢用户字段。

## 实施、验收与回滚

删除 orchestrator 和专属测试，撤销它的 vocabulary / i18n 豁免登记，删除 builtin 测试中的拓扑/暂停断言（真实 skillRefs、包完整性断言保留）；只计算有效 provider 需求；删除无人消费的 reportSkillCapability。标注旧字段，不改变解析合法性、授权边界、真实生产调度、UI 和热目录。
验收：技能派生测试先红后绿、electron/skills 回归（含导入迁移与证据）、check:vocabularies / check:filesize / check:framework-boundary 基线不增、完整 pnpm run gates。不增加规则故无 R17 门岗红证；不接线 Agent 或工具，真实模型额度为零。
回滚：revert 本任务提交即可，磁盘格式未变，无数据迁移。
