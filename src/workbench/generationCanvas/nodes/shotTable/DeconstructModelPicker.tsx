import { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { NomiSelect } from '../../../../design'
import { DECONSTRUCT_ASK_ABOVE_CALLS, type DeconstructionShotTableDocument } from '../../../../../electron/shared/canvas/shotTable'
import { identityOf, useDeconstructLegChoice, type DeconstructLeg } from './deconstructLegChoice'
import { editShotTableFacts } from './shotTableActions'
import { CONNECT_VENDOR_OPTION_VALUE, openModelCatalog } from '../../../common/useDedupedModelSelect'

/**
 * 拆解栏里的两颗模型 chip：读图腿、转写腿（2026-10-11 走查 §1 → 2026-10-18 拆解前选模型 移到拆解栏，并补上转写）。
 *
 * 选择记在表上（`source.visionModel` / `source.transcribeModel`），整表重拆都带它；「自动选择」= 清掉它，交主进程挑。
 * 选项来源：
 * - 读图 = 文本模型清单（`useModelOptionsState('text')`），只隐去**明确声明不能读图**的行；能不能读图的最终判据在主进程
 *   （`modelSupportsImageInput`），这里不抄第二份。
 * - 转写 = 音频模型清单里的转写模式（`useModelOptionsState('audio', 'transcribe')`），本机 Whisper 与云端转写在同一份清单里。
 * 身份是 (vendor, modelKey) 双段——同名模型可能出现在两家中转站。
 * 失效（选的模型不在清单里）不悄悄换：标红说原因，拆解栏的主按钮不可点；一个能读图的模型都没有时下拉里给「去接入」（复用模型框同一条）。
 */
export function DeconstructModelPicker({ leg, nodeId, table, disabled }: { leg: DeconstructLeg; nodeId: string; table: DeconstructionShotTableDocument; disabled: boolean }): JSX.Element {
  const { t } = useTranslation()
  const chosen = leg === 'vision' ? table.source.visionModel : table.source.transcribeModel
  const { options, stale, noModel } = useDeconstructLegChoice(leg, table)
  return (
    <NomiSelect
      size="xs"
      ariaLabel={t(leg === 'vision' ? 'shotTable.visionModel' : 'shotTable.node.transcribe')}
      leadingLabel={t(leg === 'vision' ? 'shotTable.node.vision' : 'shotTable.node.transcribe')}
      title={stale ? t('shotTable.node.modelUnavailableHint') : t(leg === 'vision' ? 'shotTable.visionHint' : 'shotTable.node.transcribeHint', { calls: DECONSTRUCT_ASK_ABOVE_CALLS })}
      disabled={disabled}
      triggerMaxWidth={220}
      triggerBadge={stale ? { text: t('shotTable.node.modelUnavailable'), tone: 'danger' } : undefined}
      value={chosen ? identityOf({ vendor: chosen.vendorKey, modelKey: chosen.modelKey }) : noModel ? CONNECT_VENDOR_OPTION_VALUE : ''}
      options={options}
      onChange={(value) => {
        if (value === CONNECT_VENDOR_OPTION_VALUE) { openModelCatalog(); return }
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
