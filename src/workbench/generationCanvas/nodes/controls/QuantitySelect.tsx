import React from 'react'
import { useTranslation } from 'react-i18next'
import { NomiSelect } from '../../../../design'
import { ToolbarDivider } from '../NodeFloatingToolbar'
import { parameterChipOptions, parameterChipValue } from '../primaryParameterChips'

/** 底栏数量钮：「1 个 ▾」（视频）/「1 张 ▾」（图片）。只在模型声明了数量类参数时出现。 */
export default function QuantitySelect({ control, meta, isVideo, onChange }: {
  control: Parameters<typeof parameterChipValue>[0]
  meta: Record<string, unknown>
  isVideo: boolean
  onChange: (value: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const value = parameterChipValue(control, meta)
  const unitKey = isVideo ? 'generationCommon.composerB3.quantityVideo' : 'generationCommon.composerB3.quantityImage'
  return (
    <>
      <ToolbarDivider />
      <span className="inline-flex shrink-0" data-bar-segment="quantity" data-parameter-chip={control.key} data-parameter-chip-value={value}>
        <NomiSelect
          ariaLabel={t('generationCommon.composerB3.quantity')}
          value={value}
          options={parameterChipOptions(control).map((option) => ({ value: option.value, label: t(unitKey, { count: option.label }) }))}
          onChange={onChange}
        />
      </span>
    </>
  )
}
