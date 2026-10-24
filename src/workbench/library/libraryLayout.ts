import type { LibraryCategory } from './libraryGroups'

/**
 * 技能库 / 提示词库共用的排版投影（设计卡 docs/plan/2026-10-23-skill-prompt-library-layout.md，用户 10-24 拍板）。
 * 只管「哪些条目落在哪一组、首页露多少、虚拟列表一行放几张」，不碰数据：条目、搜索、使用记录各有各的 owner。
 *
 * 分组身份仍只认 `libraryGroups.ts` 的 `libraryGroup()`（声明出来的分类 / 公开来源，从不按标题猜，C20）；
 * 这里只把它们排成三段：我的 / 内置 / 公开库（技能库只有前两段）。
 */

export type LibrarySegment = 'mine' | 'builtin' | 'public'

/** 两个宿主：项目库页签（宽页，没开项目）与项目里左栏抽屉（280px 起，可拖宽）。 */
export type LibraryHost = 'page' | 'drawer'

/** 分类列里的「全部」；「我的」组的 id 也固定，好让两个库共用同一套分类列。 */
export const LIBRARY_CATEGORY_ALL = 'all'
export const LIBRARY_SECTION_MINE = 'mine'

export type LibrarySection<T> = Readonly<{ id: string; label: string; segment: LibrarySegment; items: readonly T[] }>

export type LibraryPlacement = Readonly<{ segment: LibrarySegment; group?: LibraryCategory }>

/**
 * 归组：「我的」一组恒在最前（可能是空的——分类列要显示「我的 0」，选中它时空态要说话）；
 * 内置各组、公开库各组按条目在数据里第一次出现的顺序排（不按最近用过排：分类列不该因为用了一条就跳位置）。
 * 组内顺序就是传入顺序。内置 / 公开条目没有声明分组的，落进该段的「其他」组，不丢、不单列成无名卡。
 */
export function buildLibrarySections<T>(
  items: readonly T[],
  place: (item: T) => LibraryPlacement,
  labels: Readonly<{ mine: string; other: string }>,
): LibrarySection<T>[] {
  const mine: T[] = []
  const groups = new Map<string, { id: string; label: string; segment: LibrarySegment; items: T[] }>()
  for (const item of items) {
    const { segment, group } = place(item)
    if (segment === 'mine') { mine.push(item); continue }
    const id = group ? `${segment}:${group.id}` : `${segment}:other`
    const entry = groups.get(id) ?? { id, label: group?.label ?? labels.other, segment, items: [] }
    entry.items.push(item)
    groups.set(id, entry)
  }
  const ordered = [...groups.values()]
  const bySegment = (segment: LibrarySegment) => ordered.filter((group) => group.segment === segment)
  return [
    { id: LIBRARY_SECTION_MINE, label: labels.mine, segment: 'mine', items: mine },
    ...bySegment('builtin'),
    ...bySegment('public'),
  ]
}

export type LibraryNavEntry = Readonly<{ id: string; label: string; count: number }>
export type LibraryNavGroup = Readonly<{ segment: 'top' | 'builtin' | 'public'; entries: readonly LibraryNavEntry[] }>

/** 分类列：顶上「全部 N」「我的 N」，下面「内置」「公开库」两段各组带计数；空组不列。 */
export function libraryNavGroups<T>(sections: readonly LibrarySection<T>[], allLabel: string): LibraryNavGroup[] {
  const total = sections.reduce((sum, section) => sum + section.items.length, 0)
  const top: LibraryNavEntry[] = [{ id: LIBRARY_CATEGORY_ALL, label: allLabel, count: total }]
  const mine = sections.find((section) => section.segment === 'mine')
  if (mine) top.push({ id: mine.id, label: mine.label, count: mine.items.length })
  const entriesOf = (segment: LibrarySegment): LibraryNavEntry[] => sections
    .filter((section) => section.segment === segment && section.items.length > 0)
    .map((section) => ({ id: section.id, label: section.label, count: section.items.length }))
  const groups: LibraryNavGroup[] = [{ segment: 'top', entries: top }]
  const builtin = entriesOf('builtin')
  if (builtin.length) groups.push({ segment: 'builtin', entries: builtin })
  const external = entriesOf('public')
  if (external.length) groups.push({ segment: 'public', entries: external })
  return groups
}

export type LibrarySectionView<T> = Readonly<{
  id: string
  label: string
  segment: LibrarySegment
  /** 这一组此刻要画出来的条目。 */
  items: readonly T[]
  /** 这一组一共多少条（组头「全部 N ›」的 N）。 */
  total: number
  /** 首页这一组只露了一行，组头要给「全部 N ›」。 */
  truncated: boolean
}>

/**
 * Q3（用户 10-24 按默认拍板，替换 09-09 的 C20「超过 4 项整组折成一行字」）：
 *   · 首页（分类「全部」、没在搜）：每组只露 `homeCount` 张真卡片，多出来的组头给「全部 N ›」；「我的」为空时首页不出这一组；
 *   · 选中一个分类：只看这一组，全部摊开（空组照样返回，让空态说话）；
 *   · 搜索：每组全部摊开，只留有匹配的组——匹配项一个都不丢。
 */
export function librarySectionsView<T>(
  sections: readonly LibrarySection<T>[],
  options: Readonly<{ category: string; match?: (item: T) => boolean; homeCount: number }>,
): LibrarySectionView<T>[] {
  const { category, match, homeCount } = options
  const filtered = sections.map((section) => (match ? { ...section, items: section.items.filter(match) } : section))
  if (category !== LIBRARY_CATEGORY_ALL) {
    const chosen = filtered.find((section) => section.id === category)
    return chosen ? [{ ...chosen, total: chosen.items.length, truncated: false }] : []
  }
  const present = filtered.filter((section) => section.items.length > 0)
  if (match) return present.map((section) => ({ ...section, total: section.items.length, truncated: false }))
  return present.map((section) => ({
    ...section,
    items: section.items.slice(0, Math.max(1, homeCount)),
    total: section.items.length,
    truncated: section.items.length > Math.max(1, homeCount),
  }))
}

/** 一行放几张：按最小卡宽推，夹在 [1, max]。 */
export function libraryColumns(width: number, options: Readonly<{ minCardWidth: number; gap: number; max: number }>): number {
  const { minCardWidth, gap, max } = options
  if (!(width > 0)) return 1
  return Math.max(1, Math.min(max, Math.floor((width + gap) / (minCardWidth + gap))))
}

/** 首页每组露几张：就是一行；抽屉里技能条卡一行只有一张时露两条（LibraryDrawers 板「组名 + 两条」）。 */
export function libraryHomeCount(columns: number): number {
  return columns <= 1 ? 2 : columns
}

export type LibraryRow<T> =
  | Readonly<{ kind: 'header'; key: string; section: LibrarySectionView<T>; first: boolean }>
  | Readonly<{ kind: 'items'; key: string; sectionId: string; items: readonly T[] }>

/** 虚拟列表的行：每组一个组头行 + 若干卡片行（一行 `columns` 张）。 */
export function libraryRows<T>(views: readonly LibrarySectionView<T>[], columns: number, keyOf: (item: T) => string): LibraryRow<T>[] {
  const rows: LibraryRow<T>[] = []
  const perRow = Math.max(1, columns)
  views.forEach((section, index) => {
    rows.push({ kind: 'header', key: `header:${section.id}`, section, first: index === 0 })
    for (let start = 0; start < section.items.length; start += perRow) {
      const items = section.items.slice(start, start + perRow)
      rows.push({ kind: 'items', key: `items:${section.id}:${keyOf(items[0])}`, sectionId: section.id, items })
    }
  })
  return rows
}
