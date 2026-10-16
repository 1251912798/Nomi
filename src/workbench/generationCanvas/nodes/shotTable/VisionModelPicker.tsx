import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { NomiSelect, type NomiSelectOption } from '../../../../design'
import { useModelOptionsState } from '../../../../config/useModelOptions'
import type { DeconstructionShotTableDocument } from '../../../../../electron/shared/canvas/shotTable'
import { editShotTableFacts } from './shotTableActions'

/**
 * 分镜表底栏的「读图模型」选择（2026-10-11 走查 §1：拆解的读图腿用户原来换不了）。
 *
 * 选择记在表上（`source.visionModel`），整表重拆与单镜重试都带它；「自动选择」= 清掉它，交主进程自动挑。
 * 选项复用文本模型清单（`useModelOptionsState('text')`），只隐去**明确声明不能读图**的行；
 * 能不能读图的最终判据在主进程（`modelSupportsImageInput`），这里不抄第二份。
 * 身份是 (vendor, modelKey) 双段——同名模型可能出现在两家中转站。
 */
const identityOf = (option: { vendor?: string; modelKey?: string }): string => `${option.vendor ?? ''}::${option.modelKey ?? ''}`

export function VisionModelPicker({ nodeId, table, disabled }: { nodeId: string; table: DeconstructionShotTableDocument; disabled: boolean }): JSX.Element {
  const { t } = useTranslation()
  const { options: textOptions } = useModelOptionsState('text')
  const chosen = table.source.visionModel
  const options = React.useMemo<NomiSelectOption[]>(() => {
    const rows = textOptions
      .filter((option) => option.vendor && option.modelKey)
      .filter((option) => (option.meta as { supportsImageInput?: unknown } | null | undefined)?.supportsImageInput !== false)
      .map((option) => ({ value: identityOf(option), label: option.vendorName ? `${option.label} · ${option.vendorName}` : option.label }))
    // 选中的那个模型被停用 / 删了：仍然列出来，别让下拉静默回到「自动」——那等于悄悄换了钱的去向。
    if (chosen && !rows.some((row) => row.value === identityOf({ vendor: chosen.vendorKey, modelKey: chosen.modelKey }))) {
      rows.push({ value: identityOf({ vendor: chosen.vendorKey, modelKey: chosen.modelKey }), label: chosen.modelKey })
    }
    return [{ value: '', label: t('shotTable.visionAuto') }, ...rows]
  }, [chosen, t, textOptions])
  return (
    <NomiSelect
      size="xs"
      ariaLabel={t('shotTable.visionModel')}
      leadingLabel={t('shotTable.visionModel')}
      title={t('shotTable.visionHint')}
      disabled={disabled}
      triggerMaxWidth={180}
      value={chosen ? identityOf({ vendor: chosen.vendorKey, modelKey: chosen.modelKey }) : ''}
      options={options}
      onChange={(value) => {
        const [vendorKey, modelKey] = value.split('::')
        editShotTableFacts(nodeId, (current) => ({
          ...current,
          source: { ...current.source, visionModel: vendorKey && modelKey ? { vendorKey, modelKey } : undefined },
        }))
      }}
    />
  )
}
