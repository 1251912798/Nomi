import type { ModelParameterControl } from '../../../../config/modelCatalogMeta'
import type { ArchetypeMode } from '../../../../../electron/shared/modelArchetypes'
import { translateModelDisplayText } from '../../../../i18n/modelDisplayText'

/** 当前模式的「源视频」单槽（HappyHorse video-edit）。返回 meta 存储键 + 标签；无则 null。 */
export function archetypeModeSourceVideoSlot(mode: ArchetypeMode): { metaKey: string; label: string } | null {
  const slot = mode.slots.find((s) => s.kind === 'source_video')
  return slot ? { metaKey: 'sourceVideoUrl', label: translateModelDisplayText(slot.label) } : null
}

/** 当前模式的标量参数（复用现有 ModelParameterControl 渲染路径）。 */
export function archetypeModeParams(mode: ArchetypeMode): ModelParameterControl[] {
  return mode.params.map(localizeModelParameterControl)
}

export function localizeModelParameterControl(control: ModelParameterControl): ModelParameterControl {
  return {
    ...control,
    label: translateModelDisplayText(control.label),
    ...(control.placeholder ? { placeholder: translateModelDisplayText(control.placeholder) } : {}),
    ...(control.options
      ? {
          options: control.options.map((option) => ({
            ...option,
            label: translateModelDisplayText(option.label),
          })),
        }
      : {}),
  }
}
