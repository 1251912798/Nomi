import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { NomiSelect, type NomiSelectOption } from '../../../../design'
import { useModelOptionsState } from '../../../../config/useModelOptions'
import type { DeconstructionShotTableDocument } from '../../../../../electron/shared/canvas/shotTable'
import { editShotTableFacts } from './shotTableActions'

/**
 * 拆解栏里的两颗模型 chip：读图腿、转写腿（2026-10-11 走查 §1 → 2026-10-18 拆解前选模型 移到拆解栏，并补上转写）。
 *
 * 选择记在表上（`source.visionModel` / `source.transcribeModel`），整表重拆都带它；「自动选择」= 清掉它，交主进程挑。
 * 选项来源：
 * - 读图 = 文本模型清单（`useModelOptionsState('text')`），只隐去**明确声明不能读图**的行；能不能读图的最终判据在主进程
 *   （`modelSupportsImageInput`），这里不抄第二份。
 * - 转写 = 音频模型清单里的转写模式（`useModelOptionsState('audio', 'transcribe')`），本机 Whisper 与云端转写在同一份清单里。
 * 身份是 (vendor, modelKey) 双段——同名模型可能出现在两家中转站。
 */
const identityOf = (option: { vendor?: string; modelKey?: string }): string => `${option.vendor ?? ''}::${option.modelKey ?? ''}`

type Leg = 'vision' | 'transcribe'

export function DeconstructModelPicker({ leg, nodeId, table, disabled }: { leg: Leg; nodeId: string; table: DeconstructionShotTableDocument; disabled: boolean }): JSX.Element {
  const { t } = useTranslation()
  const { options: textOptions } = useModelOptionsState('text')
  const { options: transcribeOptions } = useModelOptionsState('audio', 'transcribe')
  const chosen = leg === 'vision' ? table.source.visionModel : table.source.transcribeModel
  const options = React.useMemo<NomiSelectOption[]>(() => {
    const source = leg === 'vision'
      ? textOptions.filter((option) => (option.meta as { supportsImageInput?: unknown } | null | undefined)?.supportsImageInput !== false)
      : transcribeOptions
    const rows = source
      .filter((option) => option.vendor && option.modelKey)
      .map((option) => ({ value: identityOf(option), label: option.vendorName ? `${option.label} · ${option.vendorName}` : option.label }))
    // 选中的那个模型被停用 / 删了：仍然列出来，别让下拉静默回到「自动」——那等于悄悄换了钱的去向。
    if (chosen && !rows.some((row) => row.value === identityOf({ vendor: chosen.vendorKey, modelKey: chosen.modelKey }))) {
      rows.push({ value: identityOf({ vendor: chosen.vendorKey, modelKey: chosen.modelKey }), label: chosen.modelKey })
    }
    return [{ value: '', label: t(leg === 'vision' ? 'shotTable.visionAuto' : 'shotTable.node.transcribeAuto') }, ...rows]
  }, [chosen, leg, t, textOptions, transcribeOptions])
  return (
    <NomiSelect
      size="xs"
      ariaLabel={t(leg === 'vision' ? 'shotTable.visionModel' : 'shotTable.node.transcribe')}
      leadingLabel={t(leg === 'vision' ? 'shotTable.node.vision' : 'shotTable.node.transcribe')}
      title={t(leg === 'vision' ? 'shotTable.visionHint' : 'shotTable.node.transcribeHint')}
      disabled={disabled}
      triggerMaxWidth={220}
      value={chosen ? identityOf({ vendor: chosen.vendorKey, modelKey: chosen.modelKey }) : ''}
      options={options}
      onChange={(value) => {
        const [vendorKey, modelKey] = value.split('::')
        const next = vendorKey && modelKey ? { vendorKey, modelKey } : undefined
        editShotTableFacts(nodeId, (current) => ({
          ...current,
          source: { ...current.source, ...(leg === 'vision' ? { visionModel: next } : { transcribeModel: next }) },
        }))
      }}
    />
  )
}
