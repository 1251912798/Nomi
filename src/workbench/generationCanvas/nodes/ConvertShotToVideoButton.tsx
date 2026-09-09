import React from 'react'
import { useTranslation } from 'react-i18next'

/** 镜头号由框外 NodeLabelRow 定位，不随选择或生成状态换位。 */
export function ShotPreviewOverlays({
  shotIndex,
}: {
  shotIndex: number | null
}): JSX.Element | null {
  const { t } = useTranslation()
  if (shotIndex == null) return null
  return (
    <span data-shot-number className="inline-flex shrink-0 items-center text-nomi-ink-60 font-normal tabular-nums pointer-events-none">
      {t('generationCommon.shotConversion.shot', { index: shotIndex })}
    </span>
  )
}
