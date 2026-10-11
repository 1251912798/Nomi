import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { IconPointer, IconPlus } from '../../vendor/tablerIcons'

/** Point at the canvas immediately; the separate plus opens the existing asset picker. */
export default function AssetReferenceButton({ onClick, onAdd, open, disabled, title, iconOnly = false }: {
  onClick: () => void; onAdd?: () => void; open?: boolean; disabled?: boolean; title?: string; iconOnly?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  return <span className="inline-flex shrink-0 items-center gap-1">
    <button type="button" data-reference-entry="true" disabled={disabled} onClick={onClick} title={title ?? t('assetLibrary.addReference')}
      aria-label={t('assetLibrary.addReference')}
      className={iconOnly
        ? 'grid size-6 shrink-0 place-items-center rounded-nomi-sm text-nomi-ink-80 hover:bg-nomi-ink-05 disabled:cursor-not-allowed disabled:opacity-50'
        : 'inline-flex h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-pill border border-nomi-line bg-nomi-ink-05 px-2 text-caption font-medium text-nomi-ink hover:bg-nomi-accent-soft hover:text-nomi-accent disabled:cursor-not-allowed disabled:opacity-50'}>
      <IconPointer size={iconOnly ? 16 : 15} stroke={1.7} aria-hidden="true" />{iconOnly ? null : t('assetLibrary.referenceAction')}
    </button>
    {onAdd ? <button type="button" data-reference-add="true" disabled={disabled} onClick={onAdd}
      aria-label={t('assetLibrary.addReference')} title={t('assetLibrary.addReference')} aria-haspopup="dialog" aria-expanded={open}
      className="grid size-[30px] shrink-0 place-items-center rounded-nomi-sm text-nomi-ink-60 hover:bg-nomi-ink-05 disabled:opacity-50">
      <IconPlus size={16} stroke={1.7} aria-hidden="true" />
    </button> : null}
  </span>
}
