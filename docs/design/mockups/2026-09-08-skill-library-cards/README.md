# 技能库与节点效果 · 两张待拍板样张

状态：仅 HTML 设计与交互样张，未实现产品 UI。

## 样张一：卡片与详情

[HTML](library-cards.html) · [PNG](library-cards.png)

真实摩擦：用户不想先读长文才知道技能有什么用。保留现役左侧 420px 库面板，把文字卡改为“媒体 + 标题 + 一句简介”；点卡片打开大窗，原图完整展示，旁边读完整 prompt，来源与许可证始终先展示。两个动作分别是“用到节点”和“引用到 Agent”。可切换技能/提示词，搜索和分组可点击。

核心取舍：两列更好扫看，但每张简介只能一行；长说明交给详情。提示词 Tab 暂用候选锚图3演示媒体位置，明确标为未批准封面；不把这次排版选择当作风格批准。详情中的完整技能正文直接由 SKILL.md 生成，编辑内容请改技能后重建，不改生成物。

## 样张二：节点效果 chip

[HTML](node-effects.html) · [PNG](node-effects.png)

真实摩擦：空提示词框没有起点。图片节点空框直接显示人物三视图、场景三视图、去 AI 感、自然扩图四个 chip +“更多 ▾”；已有内容只留“更多 ▾”。分组下拉根据 appliesTo 过滤，图片节点不列视频运镜。视频节点可用的运镜内容已经落库，本张不额外画第三个节点。

核心取舍：常用效果露出，完整分组保留一个入口；不再增加“预设”概念。点选只追加，不清空原文；能从连接的参考取得主体就带入，缺角色身份的槽位高亮留空。撤销还原点选前内容。样张同时展示空/非空两态，两个编辑框都可试点与撤销。

## 真实截图与边界

- [现役技能库与 composer](current-skills-composer.png)：由 `capture-real.tsx` 挂载生产 `SkillLibraryContent`、`NodeGenerationComposer`；左侧数据来自修改前已有的33个技能。
- [现役提示词库](current-prompts.png)：挂载生产 `PromptLibraryContent`，使用现有25条内置表情包数据。
- 这些是实际组件取景，外层画布定位是取景台；不是运行完整 Electron 项目的截图。取景台未加载用户模型目录，所以 composer 留下原生的目录未连接提示。本期没有伪造一次生成任务，也没有修改生产组件。
- 两张样张沿用上述真实外壳比例，并直接加载 `src/theme/nomi-tokens.css`。锁图标取 Tabler `IconLock` 路径，非 Unicode 替代图标。
- **和 v4 技能 chip hover 视频共用同一媒体**：唯一声明住 SKILL.md 的 `metadata.nomi.library.preview`；本期提供数据与设计，未接通 v4 hover UI。已有图片可复用；没有的视频不会被伪装成视频。
- 两个“用到节点/引用到 Agent”动作仅修改样张中的状态，不操作真实项目或调用模型。

## 重建与验收

```sh
node docs/design/mockups/2026-09-08-skill-library-cards/build.mjs
# 先在任务 worktree 启动 Vite；本轮端口5198
node docs/design/mockups/2026-09-08-skill-library-cards/verify.mjs
```

已验证：图片解码成功；两种库的详情、来源、引用动作；追加不清空；参考槽继承；缺槽留空；空/非空编辑器撤销。PNG在1680×842、1倍比例生成并人工检查。脚本支持 `NOMI_MOCKUP_BASE` 指向其他本地预览端口。
