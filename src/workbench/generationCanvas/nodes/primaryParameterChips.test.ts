import { describe, expect, it } from 'vitest'
import {
  MAX_CHIP_RANGE_STEPS,
  numericRangeChipOptions,
  parameterChipOptions,
  parameterChipValue,
} from './primaryParameterChips'
import type { DynamicModelControl } from './controls/parameterControlModel'

// 参数下拉的候选项与当前值（底栏数量钮用）：每条都拿**档案里真实存在的控件形状**去验，形状出处写在各常量旁边。

const ratio: DynamicModelControl = {
  key: 'aspect_ratio', label: '比例', type: 'select', binding: 'parameter',
  options: [{ value: '1:1', label: '1:1' }, { value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }],
  defaultValue: '16:9',
}
// 档案里 duration 常是 number + 区间、options 为空（electron/shared/videoCapabilities/seedance.ts）。
const duration: DynamicModelControl = {
  key: 'duration', label: '时长', type: 'number', binding: 'parameter',
  options: [], min: 4, max: 15, defaultValue: 5,
}
const resolution: DynamicModelControl = {
  key: 'resolution', label: '清晰度', type: 'select', binding: 'parameter',
  options: [{ value: '720p', label: '720p' }, { value: '1080p', label: '1080p' }], defaultValue: '720p',
}
// 目录模型（没有档案）走 binding，不走 key。
const catalogDuration: DynamicModelControl = {
  key: 'durationSeconds', label: '时长', binding: 'durationSeconds',
  options: [{ value: 5, label: '5s' }, { value: 10, label: '10s' }], defaultValue: 5,
}

describe('numericRangeChipOptions — 区间型时长切成下拉档位', () => {
  it('4–15 秒切成 12 档（Seedance 2 的真实声明）', () => {
    const options = numericRangeChipOptions(duration)
    expect(options.map((option) => option.value)).toEqual(['4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'])
  })

  it('切不出两档以上的区间不切（0–1 未声明步长），交给 ⚙ 里的输入框', () => {
    expect(numericRangeChipOptions({ key: 'duration', label: '时长', type: 'number', binding: 'parameter', options: [], min: 0, max: 1 })).toEqual([])
  })

  it('档数超过一个下拉能扫完的量就不切（连续量不该用下拉选）', () => {
    const long = { ...duration, min: 1, max: 1 + MAX_CHIP_RANGE_STEPS }
    expect(numericRangeChipOptions(long)).toEqual([])
  })

  it('小数步长不渲出浮点毛刺（0.30000000000000004）', () => {
    const strength: DynamicModelControl = { key: 'duration', label: '时长', type: 'number', binding: 'parameter', options: [], min: 0.1, max: 0.5, step: 0.1 }
    expect(numericRangeChipOptions(strength).map((option) => option.value)).toEqual(['0.1', '0.2', '0.3', '0.4', '0.5'])
  })
})

describe('chip 上的值与文案', () => {
  it('值从 meta derive；meta 没有就落到档案默认值（与面板同一条链）', () => {
    expect(parameterChipValue(ratio, { aspect_ratio: '9:16' })).toBe('9:16')
    expect(parameterChipValue(ratio, {})).toBe('16:9')
    expect(parameterChipValue(catalogDuration, {})).toBe('5')
  })

  it('候选项优先用档案声明的枚举', () => {
    expect(parameterChipOptions(resolution)).toEqual([{ value: '720p', label: '720p' }, { value: '1080p', label: '1080p' }])
  })
})
