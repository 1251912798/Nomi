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
  const [point, setPoint] = React.useState<{ x: number; y: number } | null>(null)
  const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en'
  const effects = items.filter(p => p.curation?.kind === 'effect' && p.curation.appliesTo.some(k => k === kind))
  const label = (p: LibraryPrompt): string => p.curation?.title[locale] ?? p.title
  const groups = new Map<string, LibraryPrompt[]>()
  for (const item of [...effects, ...user.items.filter(p => p.promptType === kind)]) {
    const group = item.curation?.group[locale] ?? t('libraries.prompt.source.mine')
    groups.set(group, [...(groups.get(group) ?? []), item])
  }
  const menu: WorkbenchMenuNode[] = [...groups].map(([group, entries]) => ({
    kind: 'group', id: group, label: group,
    items: entries.map(item => ({ id: item.id, label: label(item), onSelect: () => onSelect(item), disabled })),
  }))
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
