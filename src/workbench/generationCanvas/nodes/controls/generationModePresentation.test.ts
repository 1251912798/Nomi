import { describe, expect, it } from 'vitest'
import { resolveArchetypeForModel } from '../../../../../electron/shared/modelArchetypes'
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
})
