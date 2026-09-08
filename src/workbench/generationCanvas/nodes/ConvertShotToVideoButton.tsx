import React from 'react'
import { useTranslation } from 'react-i18next'

/** 镜头号固定在媒体左下，不随选择或生成状态消失。 */
export function ShotPreviewOverlays({
  shotIndex,
}: {
  shotIndex: number | null
}): JSX.Element | null {
  const { t } = useTranslation()
  if (shotIndex == null) return null
  return (
    <span data-shot-number className="absolute bottom-1.5 left-1.5 z-[4] inline-flex items-center px-2 py-1 rounded-full bg-nomi-paper/90 text-nomi-ink-60 text-micro font-medium tabular-nums pointer-events-none">
      {t('generationCommon.shotConversion.shot', { index: shotIndex })}
    </span>
  )
}
