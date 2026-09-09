import { groupLibraryItems, libraryGroup } from '../../library/libraryGroups'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { WorkbenchMenu, type WorkbenchMenuNode } from '../../../design/menu'
import { usePromptLibrary } from '../../promptLibrary/usePromptLibrary'
import { useUserPrompts } from '../../promptLibrary/useUserPrompts'
import type { LibraryPrompt } from '../../api/promptLibraryApi'

const STARTER_EFFECTS = ['effect-character-three-view', 'effect-scene-three-view', 'effect-natural-texture', 'effect-fill-outpaint']

export function NodeEffectChips({ empty, kind, disabled, onSelect }: {
  empty: boolean; kind: string; disabled?: boolean; onSelect: (item: LibraryPrompt) => void
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const { items } = usePromptLibrary(true)
  const user = useUserPrompts(true)
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set())
  const [point, setPoint] = React.useState<{ x: number; y: number } | null>(null)
  const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en'
  const effects = items.filter(p => p.curation?.kind === 'effect' && p.curation.appliesTo.some(k => k === kind))
  const label = (p: LibraryPrompt): string => p.curation?.title[locale] ?? p.title
  const groups = groupLibraryItems([...effects, ...user.items.filter(p => p.promptType === kind)], item => libraryGroup(item, i18n.language))
  const menu: WorkbenchMenuNode[] = groups.map(group => {
    const choices = group.items.map(item => ({ id: item.id, label: label(item), onSelect: () => onSelect(item), disabled }))
    if (!group.collapsed) return { kind: 'group', id: group.id, label: group.label, items: choices }
    const open = expanded.has(group.id)
    return { kind: 'group', id: group.id, items: [
      { id: `toggle:${group.id}`, label: t('libraries.gallery.groupCount', { name: group.label, count: group.items.length }),
        shortcut: open ? '▾' : '▸', closeOnSelect: false,
        onSelect: () => setExpanded(previous => { const next = new Set(previous); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next }) },
      ...(open ? choices : []),
    ] }
  })
  return <div className="flex shrink-0 flex-wrap items-center gap-1" data-node-effect-chips={empty ? 'empty' : 'filled'}>
    {empty && STARTER_EFFECTS.flatMap(id => {
      const item = effects.find(p => p.id === id)
      return item ? [<button key={id} type="button" disabled={disabled} onClick={() => onSelect(item)} data-effect-chip={id}
        className="rounded-pill bg-nomi-ink-05 px-2 py-1 text-caption leading-4 text-nomi-ink-80 hover:text-nomi-accent disabled:opacity-40">{label(item)}</button>] : []
    })}
    <button type="button" disabled={disabled} aria-expanded={Boolean(point)} aria-haspopup="menu" data-effect-more
      onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setPoint({ x: rect.left, y: rect.bottom + 4 }) }}
      className="rounded-pill bg-nomi-ink-05 px-2 py-1 text-caption leading-4 text-nomi-ink-80 hover:text-nomi-accent disabled:opacity-40">{t('libraries.gallery.more')} ▾</button>
    <WorkbenchMenu open={Boolean(point)} onOpenChange={open => { if (!open) setPoint(null) }} point={point ?? { x: 0, y: 0 }} items={menu}
      ariaLabel={t('libraries.gallery.effect')} className="max-h-[470px] w-60 overflow-y-auto p-3" itemClassName="rounded-nomi-sm text-caption" data-testid="node-effect-menu" />
  </div>
}
