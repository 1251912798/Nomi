import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { IconPointer } from '../../vendor/tablerIcons'
import { ICON_TIERS } from '../../design'
import { AssetActionTile } from './AssetTile'

/**
 * 画布点选入口。**一件组件多处复用**，宿主之间只靠 `iconOnly` 一个开关区分：
 *  - 默认（画布生成框 / 列表详情 / 错误报告）：整块 40px 浅底方块，图标 20 / 1.6；
 *  - `iconOnly`（Agent 输入框，和附件、模型同一排）：28px，图标 16 / 2。
 * 素材库的添加入口仍归它们各自的 owner。
 */
export default function AssetReferenceButton({ onClick, disabled, title, iconOnly = false }: {
  onClick: () => void; disabled?: boolean; title?: string; iconOnly?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const label = t('assetLibrary.addReference')
  if (!iconOnly) return <AssetActionTile data-reference-entry="true" disabled={disabled} onClick={onClick}
    title={title ?? label} aria-label={label}>
    <IconPointer size={ICON_TIERS.bar.size} stroke={ICON_TIERS.bar.stroke} aria-hidden="true" />
  </AssetActionTile>
  return <span className="inline-flex shrink-0 items-center gap-1">
    <button type="button" data-reference-entry="true" disabled={disabled} onClick={onClick} title={title ?? label}
      aria-label={label}
      className="grid size-7 shrink-0 place-items-center rounded-nomi-sm text-nomi-ink-80 hover:bg-nomi-ink-05 disabled:cursor-not-allowed disabled:opacity-50">
      <IconPointer size={ICON_TIERS.tool.size} stroke={ICON_TIERS.tool.stroke} aria-hidden="true" />
    </button>
  </span>
}
