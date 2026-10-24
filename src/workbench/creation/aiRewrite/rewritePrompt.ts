import type { SkillListItemDto } from '../../api/skillApi'
import { getCreationAiMode, modeAllowsWriteTools } from '../creationAiModes'
import type { RewriteSkillRef } from './rewriteSession'

/**
 * 「怎么改」的模型面文字：常用改法的一句话要求、写作 Skill 怎么挂、整条提示词怎么拼。
 * （界面上的字在 i18n；这里是给模型看的，不随界面语言变。）
 */
export const REWRITE_PRESET_INSTRUCTIONS = {
  rewrite: '换一种写法重新表达，保持原意、信息和篇幅大致不变。',
  shorter: '缩短：删去冗余和重复，保留关键信息与原意。',
  longer: '扩写：补充细节与画面感，保持原有的语气和视角。',
} as const

export const REWRITE_TONE_INSTRUCTIONS = {
  formal: '把语气改得更正式、更书面。',
  casual: '把语气改得更口语、更自然。',
  restrained: '把语气改得更克制、更冷静，少用形容词。',
  warm: '把语气改得更温暖、更有感情。',
} as const

export const REWRITE_TRANSLATE_INSTRUCTIONS = {
  en: '翻译成英文。',
  zh: '翻译成中文。',
  ja: '翻译成日文。',
} as const

const BOM = String.fromCharCode(0xfeff)

/** 去掉 SKILL.md 开头的 frontmatter，只留方法正文。 */
export function skillBodyText(raw: string): string {
  const text = raw.startsWith(BOM) ? raw.slice(1) : raw
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text)
  return (match ? text.slice(match[0].length) : text).trim()
}

/**
 * 「写作类 Skill」：用户自己的、不需要图 / 视频模型的单段 Skill。
 * 内置的是工作流（拆镜头、出图出视频），用在「改这几句话」上没有意义，所以只收用户自己导入的。
 */
export function isWritingSkill(skill: SkillListItemDto): boolean {
  if (skill.origin !== 'user' || skill.isPlaybook || skill.manifestError) return false
  if (skill.neededProviders.some((kind) => kind !== 'text')) return false
  const applies = skill.curation?.appliesTo
  return !applies || applies.includes('text')
}

export function toRewriteSkillRef(skill: SkillListItemDto, title: string): RewriteSkillRef {
  return { key: skill.name, title, body: skillBodyText(skill.body ?? '') }
}

const MAX_SKILL_BODY = 6000

export function buildRewritePrompt(input: {
  original: string
  instruction: string
  skill: RewriteSkillRef | null
  /** 当前选用的「提示词模式」（故事 / 剧本……）。只有自由写作的模式才带进来当文体约定。 */
  modeId?: string
}): string {
  const mode = input.modeId ? getCreationAiMode(input.modeId) : null
  // 纯问答（「不要主动改写文稿」）和专职模式（素材 / 分镜 / 提示词 / 审校，各有各的产出格式）都不是「改这几句话」的文体约定。
  const modeConvention = mode && modeAllowsWriteTools(mode) && !mode.dedicatedJob ? mode.prompt : ''
  return [
    '你是写作编辑。只改写下面「原文」这一段，不要动它之外的任何内容。',
    modeConvention ? `当前文稿的写作约定（只作文体与格式参考，本次任务以「要求」为准）：\n${modeConvention}` : '',
    input.skill?.body ? `按下面这份写作方法来改：\n"""\n${input.skill.body.slice(0, MAX_SKILL_BODY)}\n"""` : '',
    `要求：${input.instruction.trim() || REWRITE_PRESET_INSTRUCTIONS.rewrite}`,
    `原文：\n"""\n${input.original}\n"""`,
    '只输出改写后的这一段文字本身：不要解释、不要加引号或标题；保持原文的语言（要求是翻译时除外）和原有的格式记号（如行首的「△ 」）；原文有几个段落，就还输出几个段落。',
  ].filter(Boolean).join('\n\n')
}

/** 模型常见的「多余包装」：代码围栏、整段被引号包住。 */
export function cleanRewriteOutput(raw: string, original: string): string {
  let text = (raw.startsWith(BOM) ? raw.slice(1) : raw).trim()
  const fenced = /^```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n```$/.exec(text)
  if (fenced) text = fenced[1]!.trim()
  const pairs: Array<[string, string]> = [['“', '”'], ['"', '"'], ['「', '」']]
  for (const [open, close] of pairs) {
    if (text.length > 1 && text.startsWith(open) && text.endsWith(close) && !(original.startsWith(open) && original.endsWith(close))) {
      text = text.slice(open.length, text.length - close.length).trim()
      break
    }
  }
  return text
}
