import React from 'react'
import { useTranslation } from 'react-i18next'
import type { NomiSelectOption } from '../../../../design'
import { useModelOptionsState } from '../../../../config/useModelOptions'
import type { DeconstructionShotTableDocument } from '../../../../../electron/shared/canvas/shotTable'
import { CONNECT_VENDOR_OPTION_VALUE } from '../../../common/useDedupedModelSelect'

export const identityOf = (option: { vendor?: string; modelKey?: string }): string => `${option.vendor ?? ''}::${option.modelKey ?? ''}`

export type DeconstructLeg = 'vision' | 'transcribe'

export type DeconstructLegChoice = {
  options: NomiSelectOption[]
  /** 表上选的模型已不在清单里（停用 / 删了 / 供应商断开）：不悄悄换，标红、拆解按钮不可点，等用户换一个。 */
  stale: boolean
  /** 读图腿一个能读图的模型都没有：下拉里只剩「去接入」。 */
  noModel: boolean
}

/** 一条腿的选项与状态；拆解栏的主按钮也读它（选的模型失效时不让拆）。 */
export function useDeconstructLegChoice(leg: DeconstructLeg, table: DeconstructionShotTableDocument): DeconstructLegChoice {
  const { t } = useTranslation()
  const { options: textOptions } = useModelOptionsState('text')
  const { options: transcribeOptions } = useModelOptionsState('audio', 'transcribe')
  const chosen = leg === 'vision' ? table.source.visionModel : table.source.transcribeModel
  return React.useMemo<DeconstructLegChoice>(() => {
    const source = leg === 'vision'
      ? textOptions.filter((option) => (option.meta as { supportsImageInput?: unknown } | null | undefined)?.supportsImageInput !== false)
      : transcribeOptions
    const rows: NomiSelectOption[] = source
      .filter((option) => option.vendor && option.modelKey)
      .map((option) => ({ value: identityOf(option), label: option.vendorName ? `${option.label} · ${option.vendorName}` : option.label }))
    const noModel = leg === 'vision' && rows.length === 0
    // 选中的那个模型被停用 / 删了：仍然列出来，别让下拉静默回到「自动」——那等于悄悄换了钱的去向。
    const stale = Boolean(chosen) && !rows.some((row) => row.value === identityOf({ vendor: chosen!.vendorKey, modelKey: chosen!.modelKey }))
    if (chosen && stale) rows.push({ value: identityOf({ vendor: chosen.vendorKey, modelKey: chosen.modelKey }), label: chosen.modelKey, trailing: t('shotTable.node.modelUnavailable'), trailingTone: 'danger' })
    if (noModel) rows.push({ value: CONNECT_VENDOR_OPTION_VALUE, label: t('shotTable.node.noVisionModel'), trailing: t('generationCommon.parameters.connectVendorAction'), trailingTone: 'accent' })
    const auto = { value: '', label: t(leg === 'vision' ? 'shotTable.visionAuto' : 'shotTable.node.transcribeAuto') }
    return { options: noModel && !chosen ? rows : [auto, ...rows], stale, noModel }
  }, [chosen, leg, t, textOptions, transcribeOptions])
}
