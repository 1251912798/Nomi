import { libraryGroup, type LibraryCategory } from '../library/libraryGroups'
import type { SkillListItemDto } from '../api/skillApi'
import { matchesLibraryQuery } from '../library/libraryDiscovery'
import { skillDisplayTitle } from './skillDisplay'

/**
 * 技能库里的一条。技能库只列 `kind: skill`（用户 10-24 拍板 Q1：效果、提示词都回提示词库）——
 * 效果的 SKILL.md 仍在技能目录里，但它唯一的出口是主进程 `curatedPrompts.ts` 投影进提示词库，这里把它滤掉。
 */
export type SkillGalleryEntry = {
  id: string
  group?: LibraryCategory
  title: string
  description: string
  body: string
  cover?: string
  preview?: SkillListItemDto['preview']
  /** 封面是示意插画（暗色下换暗纸底 + 浅线，Q8）。 */
  illustration: boolean
  source?: string
  author?: string
  license?: string
  skill: SkillListItemDto
}

export function galleryEntries(skills: readonly SkillListItemDto[], language: string): SkillGalleryEntry[] {
  const locale = language.startsWith('zh') ? 'zh-CN' : 'en'
  // 只认 kind: skill（没有策展信息的外部技能也是技能）；以后多出别的 kind，默认不进技能库（Q1，反例「新源没过滤 kind」）。
  return skills.filter((skill) => (skill.curation?.kind ?? 'skill') === 'skill').map((skill) => ({
    id: `skill:${skill.name}`,
    group: libraryGroup(skill, language),
    title: skillDisplayTitle(skill, language),
    description: skill.curation?.summary[locale] ?? skill.description ?? '',
    body: skill.body ?? '',
    cover: skill.cover,
    preview: skill.preview,
    illustration: skill.curation?.preview?.provenance === 'illustration',
    source: skill.curation?.source.url,
    author: skill.curation?.source.author ?? skill.author ?? undefined,
    license: skill.curation?.license,
    skill,
  }))
}

/** 详情正文：技能文件原文，去掉 frontmatter 和与标题、简介重复的开头两段。 */
export function galleryBody(entry: SkillGalleryEntry): string {
  const blocks = entry.body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim().split(/\n\s*\n/)
  if (blocks[0] === `# ${entry.title}`) blocks.shift()
  if (blocks[0] === entry.description) blocks.shift()
  return blocks.join('\n\n')
}

const PROVIDER_SEARCH_ALIASES: Record<string, readonly string[]> = {
  text: ['text', '文本', '文字'],
  image: ['image', '图像', '图片'],
  video: ['video', '视频'],
  audio: ['audio', '音频'],
}

export function matchesGalleryQuery(entry: SkillGalleryEntry, query: string): boolean {
  return matchesLibraryQuery({
    title: entry.title, description: entry.description,
    keywords: [entry.skill.name, entry.group?.label ?? '', ...entry.skill.neededProviders.flatMap(provider => PROVIDER_SEARCH_ALIASES[provider] ?? [provider])],
  }, query)
}
