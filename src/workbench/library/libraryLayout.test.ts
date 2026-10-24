import { describe, expect, it } from 'vitest'
import {
  LIBRARY_CATEGORY_ALL,
  LIBRARY_SECTION_MINE,
  buildLibrarySections,
  libraryColumns,
  libraryHomeCount,
  libraryNavGroups,
  libraryRows,
  librarySectionsView,
  type LibraryPlacement,
} from './libraryLayout'

type Item = { id: string; place: LibraryPlacement }
const item = (id: string, segment: LibraryPlacement['segment'], group?: string): Item => ({
  id,
  place: { segment, ...(group ? { group: { id: group, label: group } } : {}) },
})
const labels = { mine: '我的', other: '其他' }
const build = (items: Item[]) => buildLibrarySections(items, (entry) => entry.place, labels)

const sample = (): Item[] => [
  item('e1', 'builtin', '表情'), item('c1', 'builtin', '运镜'), item('e2', 'builtin', '表情'),
  item('p1', 'public', 'GPT'), item('m1', 'mine'), item('e3', 'builtin', '表情'), item('x1', 'builtin'),
  ...Array.from({ length: 7 }, (_, index) => item(`c${index + 2}`, 'builtin', '运镜')),
]

describe('library layout projection (skill / prompt library redesign, Q3)', () => {
  it('puts Mine first, then built-in groups, then public groups, in first-occurrence order; nothing is lost', () => {
    const sections = build(sample())
    expect(sections.map((section) => section.id)).toEqual([LIBRARY_SECTION_MINE, 'builtin:表情', 'builtin:运镜', 'builtin:other', 'public:GPT'])
    expect(sections.flatMap((section) => section.items).map((entry) => entry.id).sort()).toEqual(sample().map((entry) => entry.id).sort())
    expect(sections.find((section) => section.id === 'builtin:other')?.label).toBe('其他')
  })

  it('keeps an empty Mine section so the category list can say 「我的 0」 and the empty state can speak', () => {
    const sections = build([item('a', 'builtin', 'G')])
    expect(sections[0]).toMatchObject({ id: LIBRARY_SECTION_MINE, items: [] })
    const nav = libraryNavGroups(sections, '全部')
    expect(nav[0].entries).toEqual([{ id: LIBRARY_CATEGORY_ALL, label: '全部', count: 1 }, { id: LIBRARY_SECTION_MINE, label: '我的', count: 0 }])
    expect(librarySectionsView(sections, { category: LIBRARY_CATEGORY_ALL, homeCount: 3 }).map((view) => view.id)).toEqual(['builtin:G'])
    expect(librarySectionsView(sections, { category: LIBRARY_SECTION_MINE, homeCount: 3 })).toEqual([
      expect.objectContaining({ id: LIBRARY_SECTION_MINE, items: [], total: 0, truncated: false }),
    ])
  })

  it('home shows one row per group and offers 「全部 N ›」 only when the group has more than one row', () => {
    const views = librarySectionsView(build(sample()), { category: LIBRARY_CATEGORY_ALL, homeCount: 3 })
    const byId = Object.fromEntries(views.map((view) => [view.id, view]))
    expect(byId['builtin:运镜']).toMatchObject({ total: 8, truncated: true })
    expect(byId['builtin:运镜'].items).toHaveLength(3)
    expect(byId['builtin:表情']).toMatchObject({ total: 3, truncated: false })
    expect(byId.mine).toMatchObject({ total: 1, truncated: false })
  })

  it('choosing a category shows only that group, fully expanded (a chosen group is never folded)', () => {
    const views = librarySectionsView(build(sample()), { category: 'builtin:运镜', homeCount: 3 })
    expect(views).toHaveLength(1)
    expect(views[0]).toMatchObject({ id: 'builtin:运镜', total: 8, truncated: false })
    expect(views[0].items).toHaveLength(8)
  })

  it('search expands every matching group and keeps every match', () => {
    const match = (entry: Item) => entry.id.startsWith('c') || entry.id === 'p1'
    const views = librarySectionsView(build(sample()), { category: LIBRARY_CATEGORY_ALL, homeCount: 2, match })
    expect(views.map((view) => view.id)).toEqual(['builtin:运镜', 'public:GPT'])
    expect(views.every((view) => !view.truncated)).toBe(true)
    expect(views.flatMap((view) => view.items)).toHaveLength(9)
  })

  it('nav lists only non-empty built-in / public groups with counts', () => {
    const nav = libraryNavGroups(build(sample()), '全部')
    expect(nav.map((group) => group.segment)).toEqual(['top', 'builtin', 'public'])
    expect(nav[0].entries[0].count).toBe(14)
    expect(nav[1].entries.map((entry) => `${entry.label}:${entry.count}`)).toEqual(['表情:3', '运镜:8', '其他:1'])
  })

  it('columns follow the measured width and clamp; one-column hosts still show two strips per group', () => {
    expect(libraryColumns(0, { minCardWidth: 160, gap: 12, max: 6 })).toBe(1)
    expect(libraryColumns(1156, { minCardWidth: 160, gap: 12, max: 6 })).toBe(6)
    expect(libraryColumns(480, { minCardWidth: 160, gap: 12, max: 6 })).toBe(2)
    expect(libraryColumns(256, { minCardWidth: 260, gap: 12, max: 3 })).toBe(1)
    expect(libraryHomeCount(1)).toBe(2)
    expect(libraryHomeCount(6)).toBe(6)
  })

  it('rows: one header per group plus card rows of `columns` items, keyed stably', () => {
    const views = librarySectionsView(build(sample()), { category: 'builtin:运镜', homeCount: 3 })
    const rows = libraryRows(views, 3, (entry) => entry.id)
    expect(rows.map((row) => row.kind)).toEqual(['header', 'items', 'items', 'items'])
    expect(rows.filter((row) => row.kind === 'items').map((row) => row.kind === 'items' ? row.items.length : 0)).toEqual([3, 3, 2])
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
  })
})
