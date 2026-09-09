# 技能包格式规范

版本：v3（从 2026-09-07 起生效；v2 的 `skill.json` 已退场）
位置：`skills/<skill-key>/`

---

## 1. 总览

一个技能就是**一个目录 + 一个 `SKILL.md`**。没有第二份清单文件。

`SKILL.md` 开头是 YAML frontmatter（写给 runtime 的元数据），后面是 markdown 正文（写给模型的方法论）。这是 [Agent Skills 标准](https://agentskills.io/specification)的形状——pi、Claude Code、Codex 读的都是它，所以**别人的技能目录拖进 Nomi 能用，Nomi 的技能拖出去也能用**。

> **v2 → v3 变了什么**：`skill.json` 删除，它承载的 Nomi 独有字段搬进 frontmatter 的 `metadata.nomi`。为什么这么做、逐字段怎么落，见 [`docs/plan/2026-09-07-skill-format-convergence.md`](plan/2026-09-07-skill-format-convergence.md)。用户目录里的存量 `skill.json` 由加载器一次性迁移并留 `.bak` 备份。

Runtime 加载技能时：

1. 用真 YAML 解析器读 frontmatter（`electron/skills/skillFrontmatter.ts`）；解析不了就当损坏，不加载。
2. 校验 `metadata.nomi`（`electron/skills/skillManifestSchema.ts` 的 zod schema）；块存在但不合法 ⇒ **fail closed**（该技能拿到零工具）。
3. 把 `SKILL.md` 正文按需注入模型上下文。

---

## 2. 目录结构

```
skills/
  <skill-key>/                 e.g. workbench-storyboard-planner
    SKILL.md                   唯一必需文件：frontmatter + 方法论正文
    references/                (可选) 按需加载的参考资料
    assets/                    (可选) 模板、查找表
```

`scripts/` `bin/` `hooks/` **不收**：Nomi 只吃知识层，导入器会显式跳过并告诉用户原因（`electron/skills/skillPackage.ts`）。这比 pi 严，是有意的——pi 是信任本机用户的 CLI，Nomi 是握着用户密钥、会花用户钱的桌面应用。

---

## 3. frontmatter 顶层字段（Agent Skills 规范）

| 字段 | 必填 | 约束 |
|---|---|---|
| `name` | ✅ | ≤64 字符；只允许小写 `a-z` / `0-9` / 连字符；不得首尾连字符、不得连续连字符；**必须与目录名一致** |
| `description` | ✅ | ≤1024 字符。写清楚**做什么** + **什么时候用**（触发词写在这里，模型靠它决定要不要加载） |
| `license` | | 许可证名或随包文件名 |
| `compatibility` | | ≤500 字符的环境要求 |
| `allowed-tools` | | 空格分隔的预授权工具（规范里仍是实验字段，Nomi 不读） |
| `metadata` | | 任意键值映射，见 §4 |
| `disable-model-invocation` | | `true` 时不进系统提示词，只能由用户显式选中。**规范闭集之外的一处有意偏离**——pi 与 Claude Code 都原生支持它，挪进 `metadata` 反而会让那两家读不到 |

**顶层不许出现别的键。** 官方参考校验器 `skills-ref` 对顶层做闭集校验，多一个就是 error；Nomi 的 `check:skills-format` 门岗同样硬拦。Nomi 独有的东西一律住 `metadata.nomi.*`。

---

## 4. `metadata.nomi` 字段（Nomi 扩展块）

线上用 kebab-case，与 frontmatter 的既有习惯一致。

```yaml
---
name: workbench-storyboard-planner
description: 把一段故事文本拆成 6-12 个镜头节点 + 时序连边。用户给一段故事、要分镜时用我。
metadata:
  nomi:
    version: "1.0.0"                 # 必填，SemVer；会落进生产运行的产物证据
    label: 分镜规划师                 # 可选，卡片/选择器上的显示名（缺省用 name）
    author: "@nomi"                  # 可选
    audience: mcp                    # 可选，internal（默认）| mcp。用户导入的技能一律强制 internal
    selectable-in-workbench: true    # 可选，让单段内置技能出现在 Workbench 选择器
    requested-capabilities: []       # 可选，**只能收窄** Host 的能力天花板，见下
    tools: [create_canvas_nodes, connect_canvas_edges]   # 必填，工作流元数据
    required-providers: [text, image]                    # 必填，text | image | video 的子集
    stages: []                       # 可选，多段 playbook 骨架，见 §5
---
```

### `requested-capabilities`：唯一参与运行时授权的字段

它只做减法：从 Host 已经授予的能力里再收窄一层，永远不能扩权（`electron/skills/skillCapability.ts` 的 `restrictToolsToSkillCapabilities`）。值必须是 Capability Registry 的规范 id，写错一个直接校验失败。

**校验失败 = 零工具**，不是「放行」。`electron/ai/agentChatV2.ts` 把 `manifestError` 变成空能力表——这是有意的 fail-closed。

### `tools` / `required-providers`

`required-providers` 驱动技能卡上的 ✓/⚠ 模态芯片（缺哪个模态就提示去接入）。`tools` 是工作流元数据，**不授权任何东西**——真正的授权只看 `requested-capabilities`。

---

## 5. `stages`：多段 playbook（可选）

无 `stages` = 单段技能，绝大多数技能长这样。

```yaml
    stages:
      - id: script                       # 必填，阶段稳定 id
        goal: 先出一份可审阅的编号剧本      # 必填，deprecated 兼容元数据
        tools: [read_full_text]          # 必填，deprecated；不授权工具
        depends-on: []                   # 可选，deprecated；不调度依赖
        pause: true                      # 可选，deprecated；不触发暂停
        skill-refs: [writer-screenwriter] # 可选，本阶段按需注入的方法论技能
        model-prefs: [{ kind: text }]     # 可选，kind 驱动模态 chip
```

**兼容字段（deprecated，无阶段执行作用）**：`goal`、`tools`、`depends-on`、`pause` 和 `model-prefs[].family` 已被内置及存量技能包写入，因此仍按原 schema 解析；不要把它们当作规划、工具授权、依赖排序、暂停或模型家族选择指令。`goal` 仍投影为 DTO 标签：技能卡使用阶段数量，`ProjectAgentResidentShell` 在缺少描述时用标签拼接备用说明。因此 `goal` 仍有 UI 元数据用途，但不参与阶段规划。必填的 `goal` / `tools` 暂时保留原格式要求，避免破坏存量包。

仍生效的是 `id` / `skill-refs`（生产阶段的方法论引用与执行证据）及 `model-prefs[].kind`（供应商模态 chip）。真正执行的阶段顺序与门由 `electron/productionRun/productionPlaybooks.ts` 及生产 driver 管理，不从这些兼容字段生成。

`model-prefs` 用 `.strict()` 从结构上拒绝 `archetypeId` / `params` 等 vendor 专属键——技能分享出去不该绑死某个供应商（P4）。

---

## 6. 写一个自己的技能

1. 建 `skills/<your-key>/SKILL.md`，frontmatter 至少写 `name`（= 目录名）与 `description`。
2. 需要工具白名单 / 模态声明 / playbook 的，加 `metadata.nomi`。
3. 正文按「何时使用 → 操作步骤 → 常见坑 → 验收清单」写；控制在 500 行内，细节挪进 `references/`。
4. 跑 `pnpm run check:skills-format` 自检。

---

## 7. 验证

```bash
pnpm run check:skills-format   # 格式门岗：没有 skill.json、frontmatter 合法、必填齐全、pi 读得动
pnpm run test -- electron/skills   # 内置技能的扩展块回归
```

门岗的第六条判据是**让 pi 自己的加载器给我们判分**：把 `skills/` 交给 `@earendil-works/pi-coding-agent` 的 `loadSkillsFromDir`，要求「一个不少、零 diagnostics」。别的宿主读不动的技能，在我们自己的 CI 里就红。

---

## 8. 相关代码

| 文件 | 职责 |
|---|---|
| `electron/skills/skillFrontmatter.ts` | frontmatter 解析（唯一 owner） |
| `electron/skills/skillManifestSchema.ts` | `metadata.nomi` 的 zod schema |
| `electron/skills/skillStore.ts` | 目录发现、记录组装、可见性 |
| `electron/skills/skillPackage.ts` | 导出 / 导入 / 删除、路径安全 |
| `electron/skills/skillCapability.ts` | 能力派生与授权收窄 |
| `scripts/check-skills-format.mjs` | 格式门岗 |

## 9. 精选内容与封面（2026-09-08）

`metadata.nomi.library` 是技能和节点效果共用的策展元数据；`kind` 区分 `skill` / `effect`，`appliesTo` 使用现役 text/image/video 模态。包含双语 title/summary/group、slots（token + reference）、source（原始 URL、40位 commit、作者、更改说明、证据链接），可选 preview（目录内路径、媒体类型、真实来源/本地产物/插画标记）。正文仅在 SKILL.md 保存，提示词库从目录投影，禁止另写一份 JSON 正文。

精选内容再分发必须有标准顶层 license；只拒绝缺许可的精选条目，不拒绝无许可的用户私有技能。官方 SKILL.md 样例仍能导入。媒体路径不得越出本技能目录，允许 assets/ 或 references/ 下 PNG/JPEG/WebP/MP4/WebM。原仓配图与 Nomi 实测、用途插画三种证据不可混称。现役文本分享信封不携带这些二进制媒体；本期提供随内置目录发布的媒体，UI 接线及二进制分享另行交付。

策展媒体目前仅随应用内置技能目录发布；现有文本分享信封不能携带图片/视频。包含 preview 的导入会明确拒收，导出返回不可导出；不会生成缺图却声称有效的分享包。卡片与 Agent hover 共用 `nomi-local://skill-preview/<directoryName>`，由主进程只开放已声明的内置媒体。
