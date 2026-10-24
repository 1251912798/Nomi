import { describe, expect, it } from 'vitest'
import { galleryBody, galleryEntries, matchesGalleryQuery } from './skillGallery'
import type { SkillListItemDto } from '../api/skillApi'
import type { SkillCuration } from '../../../electron/shared/skillCuration'

const skill: SkillListItemDto = {
  directoryName: 'external', name: 'external', label: 'External', description: 'Summary', author: null,
  stageLabels: [], isPlaybook: false, neededProviders: [], manifestError: null, origin: 'user', packageVersion: 'v1', contentHash: 'hash',
  body: '---\nname: external\n---\n\n# External\n\nSummary\n\n## Method\n\nDo the work.',
}
const curation = (kind: 'skill' | 'effect', provenance: 'illustration' | 'upstream-output'): SkillCuration => ({
  kind,
  title: { 'zh-CN': '镜头语言', en: 'Lens language' },
  summary: { 'zh-CN': '统一景别', en: 'Shot sizes' },
  group: { 'zh-CN': '导演', en: 'Directing' },
  preview: { path: 'preview.webp', type: 'image', provenance },
  source: { url: 'https://example.com/skill', author: 'someone' },
  license: 'MIT',
} as unknown as SkillCuration)

describe('skill gallery projection', () => {
  it('preserves name, provider aliases and multi-term search in the new gallery', () => {
    const [entry] = galleryEntries([{ ...skill, neededProviders: ['image'] }], 'en')
    expect(matchesGalleryQuery(entry, 'external 图像')).toBe(true)
    expect(matchesGalleryQuery(entry, 'image summary')).toBe(true)
    expect(matchesGalleryQuery(entry, 'video')).toBe(false)
  })
  it('keeps old external Skills without covers and displays their complete body without frontmatter', () => {
    const [entry] = galleryEntries([skill], 'en')
    expect(entry.cover).toBeUndefined()
    expect(entry.illustration).toBe(false)
    expect(galleryBody(entry)).toBe('## Method\n\nDo the work.')
  })
  it('lists only kind: skill — effects live in the prompt library (Q1, user 2026-10-24)', () => {
    const builtin = { ...skill, origin: 'builtin' as const }
    const entries = galleryEntries([
      { ...builtin, name: 'lens', curation: curation('skill', 'illustration') },
      { ...builtin, name: 'dolly', curation: curation('effect', 'upstream-output') },
    ], 'zh-CN')
    expect(entries.map((entry) => entry.skill.name)).toEqual(['lens'])
    expect(entries[0]).toMatchObject({ title: '镜头语言', description: '统一景别', illustration: true, group: { label: '导演' } })
    expect(matchesGalleryQuery(entries[0], '导演')).toBe(true)
  })
  it('keeps any future non-skill kind out by default — only kind: skill (and uncurated external skills) get in', () => {
    const builtin = { ...skill, origin: 'builtin' as const }
    const future = { ...curation('skill', 'illustration'), kind: 'prompt' } as unknown as SkillCuration
    const entries = galleryEntries([{ ...builtin, name: 'future', curation: future }, skill], 'en')
    expect(entries.map((entry) => entry.skill.name)).toEqual(['external'])
  })
})
