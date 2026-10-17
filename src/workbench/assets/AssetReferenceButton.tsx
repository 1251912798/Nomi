import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { IconPointer } from '../../vendor/tablerIcons'
import { AssetActionTile } from './AssetTile'

/** Point at the canvas immediately. Library add controls retain their existing owners. */
export default function AssetReferenceButton({ onClick, disabled, title, iconOnly = false }: {
  onClick: () => void; disabled?: boolean; title?: string; iconOnly?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const label = t('assetLibrary.addReference')
  if (!iconOnly) return <AssetActionTile data-reference-entry="true" disabled={disabled} onClick={onClick}
    title={title ?? label} aria-label={label}>
    <IconPointer size={18} stroke={1.7} aria-hidden="true" />
  </AssetActionTile>
  return <span className="inline-flex shrink-0 items-center gap-1">
    <button type="button" data-reference-entry="true" disabled={disabled} onClick={onClick} title={title ?? label}
      aria-label={label}
      className="grid size-6 shrink-0 place-items-center rounded-nomi-sm text-nomi-ink-80 hover:bg-nomi-ink-05 disabled:cursor-not-allowed disabled:opacity-50">
      <IconPointer size={16} stroke={1.7} aria-hidden="true" />
    </button>
  </span>
}
