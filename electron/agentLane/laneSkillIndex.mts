// Agent lane · 技能索引的注入与自动触发（方案 §3.4）。
//
// ── 它在解决哪个真实摩擦（D6 ①）──
//
// 用户装了二十个技能。今天 lane 里模型一个都看不见——它不知道「说号风格分镜」这件事
// 已经有人写好了方法论躺在盘上，于是每次都从零编一遍，编出来的和用户上次批准的那版不一样。
// 反过来，把二十个技能的正文每轮都拼进系统提示词，一个 30KB 的技能就要用户每一轮付一次钱。
//
// 标准答案两家都写着同一句：**只预载 name + description，正文按需读**
// （Anthropic agent-skills best practices；pi `core/skills.js:267-298` 的
// `<available_skills>` 就是 Agent Skills 标准的那个形状）。
//
// ── 要权衡的那一个东西（D6 ②）──
//
// 「按需读」需要一个**读正文的手段**。这正是阶段 5c 之前做不了这件事的原因：
// lane 没有 `read`。接进 pi 的 7 个 coding 工具之后它有了，所以这个文件才存在，
// 而且它**不新造 `load_skill` 工具**——多一个常驻工具就多占一格 `LANE_TOOL_BUDGET`，
// 而 pi 自己给的答案是「用 `read` 去读 `<location>`」（`formatSkillsForPrompt` 的
// `fileReadTool` 参数就是在选这句话怎么写）。
//
// **自动触发就是 description**：模型读索引自己决定去 `read` 哪一个。没有宿主侧分类器——
// 那是 Claude / pi 的同一条机制，方案 §3.4 已经对照过一致。
//
// ── R29：我们另写了什么 ──
//
// 渲染那一段**一个字都不写**：`formatSkillsForPrompt` 是 pi 的导出
// （`dist/index.d.ts:21`），XML 转义、`disable-model-invocation` 过滤、
// 「相对路径按技能目录解析」那句话全在它里面。我们只做两件 pi 不知道的事：
//   ① Nomi 的 `SkillRecord` → pi 的 `Skill` 形状（我们的技能不都在 pi 的发现根上）；
//   ② 这个技能要不要 coding 工具（`laneToolGroups` 的解锁条件 ①）。
import path from 'node:path';

import type { LaneSkillIndexEntry } from '../shared/agentLane/laneContracts.js';
import { LANE_CODING_TOOL_NAMES } from './laneCodingTools.mjs';
import type { LaneCodingUnlockReason } from './laneToolGroups.mjs';

/** pi 的 `Skill` 结构面（只写 `formatSkillsForPrompt` 真的读的字段 + 它的必填项）。 */
export interface PiSkill {
  name: string
  description: string
  filePath: string
  baseDir: string
  sourceInfo: { path: string, source: string, scope: 'user' | 'project' | 'temporary', origin: 'package' | 'top-level' }
  disableModelInvocation: boolean
}

/** pi 那一侧我们要用到的那一个函数。写成接口是为了让单测不必动态 import 整个包。 */
export interface PiSkillFormatter {
  formatSkillsForPrompt(skills: PiSkill[], fileReadTool?: 'read' | 'bash'): string
}

export async function loadPiSkillFormatter(): Promise<PiSkillFormatter> {
  return (await import('@earendil-works/pi-coding-agent')) as unknown as PiSkillFormatter;
}

/**
 * 索引是**可注入的**（方案 §3.2 P-1）：输入不是 `skillStore`，是一个数组。技能不都在磁盘上
 * ——skill hub 是已定方向，那一天到了要改的是喂进来的人，不是这个文件。
 * 形状本身住在中立契约层（`laneContracts.ts`），因为 CJS 那一半要在 `OpenLaneOptions` 上写出它。
 */
export interface LaneSkillProvider {
  list(): readonly LaneSkillIndexEntry[]
}

/** 技能包里被认作「可执行区」的目录名。与 `skillPackage.ts` 同一份语义，导入侧已经在用它。 */
const SKILL_EXECUTABLE_DIR_NAMES: ReadonlySet<string> = new Set(['scripts', 'bin', 'hooks']);

/**
 * 这个技能要不要 coding 工具。**两条来源，任一即真**：
 *   ① 盘上真的有可执行区——技能作者写了脚本，它就是要跑的；
 *   ② frontmatter 里 `tools:` 声明了 `coding`——技能不带脚本，但正文会让模型去写/跑东西。
 *
 * 为什么不只看 ②：`docs/plan/2026-09-07-builtin-skill-library.md` 里的既有技能一条都没写
 * `tools:`，而它们中有几条是带 `scripts/` 的。只认声明 = 那几条永远解锁不了，而症状是
 * 「模型说它要跑 selftest，然后说它没有工具」——一句用户完全看不懂的话。
 */
export function laneSkillRequiresCodingTools(input: {
  /** 技能目录下的直接子目录名（从盘上来；技能不在盘上时给空数组）。 */
  readonly childDirectoryNames?: readonly string[]
  /** 已解析的 SKILL.md frontmatter。 */
  readonly frontmatterValues?: Readonly<Record<string, unknown>>
}): boolean {
  for (const name of input.childDirectoryNames ?? []) {
    if (SKILL_EXECUTABLE_DIR_NAMES.has(name.trim().toLowerCase())) return true;
  }
  const declared = input.frontmatterValues?.['tools'];
  const declaredList = typeof declared === 'string'
    ? declared.split(',')
    : Array.isArray(declared) ? declared : [];
  return declaredList.some((value) => {
    const normalized = String(value).trim().toLowerCase();
    return normalized === 'coding' || (LANE_CODING_TOOL_NAMES as readonly string[]).includes(normalized);
  });
}

/**
 * Nomi 的技能记录 → pi 的 `Skill`。
 *
 * `baseDir` / `sourceInfo` 是 pi 的必填项而 `formatSkillsForPrompt` 不读它们——
 * 这里按技能目录如实填，不填 `{}` 强转。理由是下一个人可能会把这批 `Skill` 交给 pi 的
 * 别的函数（`loadSkills` 那族真的读 `sourceInfo.scope`），那时一个撒过谎的字段
 * 不会报错，只会让技能被归到错误的优先级里。
 */
export function toPiSkills(entries: readonly LaneSkillIndexEntry[]): PiSkill[] {
  return entries.map((entry) => {
    const baseDir = path.dirname(entry.filePath);
    return {
      name: entry.name,
      description: entry.description,
      filePath: entry.filePath,
      baseDir,
      sourceInfo: { path: entry.filePath, source: 'nomi-skill-library', scope: 'user', origin: 'package' },
      disableModelInvocation: entry.disableModelInvocation,
    };
  });
}

/**
 * 系统提示词里的 `<available_skills>` 那一段。
 *
 * `fileReadTool` 传 `'read'`：lane 装了 pi 的 `read`（阶段 5c），而 `formatSkillsForPrompt`
 * 会照此把「用 read 工具去读」写进那段话。传 `'bash'` 是给没有 `read` 的宿主用的——
 * 我们有，所以不走那条。
 */
export function renderLaneSkillSection(
  formatter: PiSkillFormatter,
  entries: readonly LaneSkillIndexEntry[],
): string {
  if (entries.length === 0) return '';
  return formatter.formatSkillsForPrompt(toPiSkills(entries), 'read').trim();
}

/**
 * 解锁条件 ①：这一刻触发/引用的技能要不要脚本。
 *
 * **只看被引用的那几条，不看整个索引**——索引里有一条带 `scripts/` 的技能，不等于这次对话
 * 要跑脚本。按整个索引解锁等于「装了任意一个带脚本的技能 = coding 组永远亮着」，
 * 那就把按需装载退化成了「默认全亮」，而 §6 量过那要付 20% 的前缀。
 */
export function laneSkillUnlockReason(
  entries: readonly LaneSkillIndexEntry[],
  referencedSkillNames: readonly string[],
): LaneCodingUnlockReason | null {
  if (referencedSkillNames.length === 0) return null;
  const referenced = new Set(referencedSkillNames.map((name) => name.trim().toLowerCase()));
  const hit = entries.some((entry) => referenced.has(entry.name.trim().toLowerCase()) && entry.requiresCodingTools);
  return hit ? 'skill-requires-scripts' : null;
}
