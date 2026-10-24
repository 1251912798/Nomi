import { describe, expect, it } from 'vitest'
import { MODEL_ARCHETYPES, resolveArchetypeForModel } from '../../../../../electron/shared/modelArchetypes'
import { currentArchetypeMode } from './archetypeMeta'
import { archetypeModeChoices } from './channelModeReach'
import { presentGenerationModes, textModeToReturnTo } from './generationModePresentation'

const TEXTS = {
  reference: '参考', firstLast: '首尾帧', firstFrame: '首帧',
  limitTip: (c: { images?: number; videos?: number; audios?: number }) => `最多 ${c.images ?? 0}/${c.videos ?? 0}/${c.audios ?? 0}`,
}
const archetype = (modelKey: string) => {
  const found = resolveArchetypeForModel({ modelKey, vendorKey: 'apimart', meta: {} } as never)
  if (!found) throw new Error(`档案缺失：${modelKey}`)
  return found
}
const present = (modelKey: string, kind: 'video' | 'image' | 'other', activeModeId: string) => {
  const spec = archetype(modelKey)
  return presentGenerationModes({ archetype: spec, visibleChoices: archetypeModeChoices(spec), activeModeId, kind, texts: TEXTS })
}

describe('生成方式只由输入决定（B3）', () => {
  it('视频：参考排第一、没有文生；分段在参数面板顶部', () => {
    const result = present('seedance-2', 'video', 'omni')
    expect(result.where).toBe('panel')
    if (result.where !== 'panel') return
    expect(result.choices.map((c) => c.label)).toEqual(['参考', '首帧', '首尾帧'])
    expect(result.choices.some((c) => c.id === 't2v')).toBe(false)
    expect(result.activeId).toBe('omni')
  })

  it('参考旁带上限提示，其余没有', () => {
    const result = present('seedance-2', 'video', 'omni')
    if (result.where !== 'panel') throw new Error('应在面板')
    expect(result.choices[0]!.limitTip).toBe('最多 9/3/3')
    expect(result.choices.slice(1).every((c) => c.limitTip === undefined)).toBe(true)
  })

  it('当前是看不见的文生方式（空节点默认）→ 高亮「参考」，不改数据', () => {
    const result = present('seedance-2', 'video', 't2v')
    expect(result.where === 'panel' && result.activeId).toBe('omni')
  })

  it('图片没有这一组（没放图是文生图、放了图是改图）', () => {
    expect(present('gpt-image-2', 'image', 'i2i')).toEqual({ where: 'none' })
  })

  it('只有一种带图方式（文生 + 首帧）不出现分段', () => {
    expect(present('kling-3.0', 'video', 't2v')).toEqual({ where: 'none' })
  })

  it('声音 / 3D 仍用旧模式栏', () => {
    const spec = archetype('seedance-2')
    expect(presentGenerationModes({ archetype: spec, visibleChoices: archetypeModeChoices(spec), activeModeId: 't2v', kind: 'other', texts: TEXTS }).where).toBe('bar')
  })
})

describe('输入没了回到文生', () => {
  const back = (modelKey: string, modeId: string, hasInput: boolean) => {
    const spec = archetype(modelKey)
    return textModeToReturnTo(spec, currentArchetypeMode(spec, { archetype: { id: spec.id, modeId } }), hasInput)
  }
  it('参考方式一张都没有 → 回文生', () => expect(back('seedance-2', 'omni', false)).toBe('t2v'))
  it('还有图 → 不动（旧项目里的参考不丢）', () => expect(back('seedance-2', 'omni', true)).toBeNull())
  it('首尾帧是用户特意选的，空了也不收回', () => expect(back('seedance-2', 'firstlast', false)).toBeNull())
  it('图片改图方式没图 → 回文生图', () => expect(back('gpt-image-2', 'i2i', false)).toBe('t2i'))
  it('没有文生方式的模型不动', () => expect(back('happyhorse', 'edit', false)).toBe('t2v'))
  it('删掉预演参考后仍按 B3 回到文生，即使 attached 标记还在', () => {
    const spec = archetype('seedance-2')
    const mode = currentArchetypeMode(spec, { archetype: { id: spec.id, modeId: 'omni' } })
    expect(textModeToReturnTo(spec, mode, false)).toBe('t2v')
  })
})

describe('方式名按槽的实际能力标（遍历全部档案）', () => {
  const T = { reference: '参考', firstLast: '首尾帧', firstFrame: '首帧', limitTip: () => '' }
  const rows = MODEL_ARCHETYPES.flatMap((spec) => {
    const result = presentGenerationModes({ archetype: spec, visibleChoices: archetypeModeChoices(spec), activeModeId: spec.defaultModeId ?? spec.modes[0]!.id, kind: 'video', texts: T })
    return result.where === 'panel' ? result.choices.map((choice) => ({ spec, choice, mode: spec.modes.find((mode) => mode.id === choice.id)! })) : []
  })
  const kindsOf = (mode: { slots: readonly { kind: string }[] }) => new Set(mode.slots.map((slot) => slot.kind))

  it('标成「首帧」的方式，槽一定有首帧、没有尾帧；标成「首尾帧」的两个都有；标成「参考」的有参考图数组、没有首帧', () => {
    expect(rows.length).toBeGreaterThan(20)
    for (const { spec, choice, mode } of rows) {
      const kinds = kindsOf(mode)
      const where = `${spec.id}:${mode.id}`
      if (choice.label === mode.vendorTerm) continue // 认不清的方式回到档案真名，档案真名恰好叫「首帧」不是本规则管的
      if (choice.label === '首帧') expect(kinds.has('first_frame') && !kinds.has('last_frame'), where).toBe(true)
      if (choice.label === '首尾帧') expect(kinds.has('first_frame') && kinds.has('last_frame'), where).toBe(true)
      if (choice.label === '参考') expect(kinds.has('image_ref') && !kinds.has('first_frame'), where).toBe(true)
    }
  })

  it('点名过的几个「多张参考图」方式不再叫首帧', () => {
    const labelOf = (specId: string, modeId: string) => rows.find((row) => row.spec.id === specId && row.mode.id === modeId)?.choice.label
    for (const [specId, modeId] of [['veo-3.1', 'reference'], ['grok-imagine-1.5-video', 'i2v'], ['kling-3.0', 'i2v'], ['wan-2.7', 'i2v']] as const) {
      const label = labelOf(specId, modeId)
      if (label !== undefined) expect(label, `${specId}:${modeId}`).not.toBe('首帧')
    }
  })
})
