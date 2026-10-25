/**
 * 参数下拉的候选项与当前值——底栏数量钮（`QuantitySelect`）和「数量是不是一个能选的参数」的判据都读这里。
 *
 * 档案声明的枚举优先；档案只给了区间的数值（`number` + min/max/step）切成有限档位，切不出就不算能选。
 * 2026-09-11 到 D2（用户 2026-10-23 拍板）之间这里还住着付费确认卡「逐参数 chip」的判据（哪几个参数露在卡底栏上），
 * 付费卡不再挂参数控件，那套判据随旧卡一起删了。
 */
import {
  catalogControlInitialValue,
  controlInitialValue,
  controlValueToString,
  isParameterControl,
  optionLabel,
  optionValue,
  type DynamicModelControl,
} from './controls/parameterControlModel'
import { hasUsableSliderStep } from './controls/numericDraft'

/**
 * 数值区间能切出多少档还算「一个下拉」。
 * 上限从下拉本身的尺寸推：`NomiSelect` 的列表高 240px、每行 30px（`src/design/NomiSelect.tsx`）
 * = 一屏 8 行，允许到一屏的两倍（滚一次就到底）。再多的连续量（步进 0.05 的强度这类）
 * 用下拉选本来就是错的形态，它留在 ⚙ 里的滑杆/输入框上。
 * 现役最长的一条是 Seedance 的时长 4–15s（12 档），在这个上限内。
 */
export const MAX_CHIP_RANGE_STEPS = 16

/** 数值区间 → 离散档位；切不出（无区间 / 步长废掉 / 档数过多）返回空数组。 */
export function numericRangeChipOptions(control: DynamicModelControl): { value: string; label: string }[] {
  if (!isParameterControl(control)) return []
  if (control.type !== 'number') return []
  const { min, max, step } = control
  if (typeof min !== 'number' || typeof max !== 'number') return []
  if (!hasUsableSliderStep(min, max, step)) return []
  const effectiveStep = typeof step === 'number' && step > 0 ? step : 1
  const count = Math.floor((max - min) / effectiveStep) + 1
  if (count > MAX_CHIP_RANGE_STEPS) return []
  return Array.from({ length: count }, (_, index) => {
    // 浮点步长累加会渲出 0.30000000000000004；按档位序号乘再定点回原步长的小数位。
    const decimals = (String(effectiveStep).split('.')[1] || '').length
    const value = Number((min + index * effectiveStep).toFixed(decimals))
    return { value: String(value), label: String(value) }
  })
}

/** chip 的候选项（档案声明的枚举优先；纯区间数值才 derive 档位）。 */
export function parameterChipOptions(control: DynamicModelControl): { value: string; label: string }[] {
  if (!isParameterControl(control)) {
    return control.options.map((option) => ({ value: optionValue(option), label: optionLabel(option) }))
  }
  if (control.options.length > 0) {
    return control.options.map((option) => ({ value: controlValueToString(option.value), label: option.label }))
  }
  return numericRangeChipOptions(control)
}

/** chip 当前值（与面板读的是同一条 meta → 默认值链，chip 和面板不会各说各话）。 */
export function parameterChipValue(control: DynamicModelControl, meta: Record<string, unknown>): string {
  return isParameterControl(control)
    ? controlInitialValue(control, meta)
    : catalogControlInitialValue(control, meta)
}
