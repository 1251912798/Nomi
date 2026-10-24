// 「切过去再切回来」「换模型」之后**真正发出去的东西**：走发送路径的同一个构造函数 buildArchetypeInputParams，
// 看参考张数和角色（首帧 / 尾帧 / 参考图）对不对。（验收阻断 1、2：界面上看着对、发出去却少了图，用户照样被扣钱。）
import { describe, expect, it } from 'vitest'
import type { ModelOption } from '../../../../config/models'
import { resolveArchetypeForModel, type ModelArchetype } from '../../../../../electron/shared/modelArchetypes'
import { createGenerationNode } from '../../model/graphOps'
import { buildNodeModelChangePatch } from '../buildNodeModelChangePatch'
import { applyArchetypeModeSwitch, buildArchetypeInputParams, currentArchetypeMode } from './archetypeMeta'
import { normalizeReferenceListMeta } from './referenceList'

const seedance = resolveArchetypeForModel({ modelKey: 'seedance-2', vendorKey: 'apimart', meta: {} } as never)!

/** 照 NodeParameterControls.handleModeSwitch：旧数据先落成规范的参考列表，再只改 modeId（列表不动）。 */
function switchMode(meta: Record<string, unknown>, spec: ModelArchetype, modeId: string): Record<string, unknown> {
  const normalized = normalizeReferenceListMeta(meta, currentArchetypeMode(spec, meta)) ?? meta
  return applyArchetypeModeSwitch(normalized, spec, modeId)
}
/** 只有上传图、没有连线：上传图由 buildArchetypeInputParams 自己按当前方式落槽。 */
const body = (meta: Record<string, unknown>, spec: ModelArchetype) => buildArchetypeInputParams(meta, spec, {})
/** 请求体里出现的所有图片地址（不管它放在哪个键、什么形状里）。 */
function imagesIn(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === 'string') { if (/^(a|b|c|u\d+)$/.test(value)) found.add(value) }
  else if (Array.isArray(value)) value.forEach((item) => imagesIn(item, found))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => imagesIn(item, found))
  return found
}

describe('切方式之后发出去的请求', () => {
  const start = { archetype: { id: seedance.id, modeId: 'omni' }, referenceImageUrls: ['a', 'b', 'c'] }

  it('参考方式：三张都在参考图里发出去', () => {
    expect(body(start, seedance).reference_image_urls).toEqual(['a', 'b', 'c'])
  })

  it('切到首尾帧：首帧 a、尾帧 b（角色对），第三张不发', () => {
    const sent = body(switchMode(start, seedance, 'firstlast'), seedance)
    expect(sent).toMatchObject({ first_frame_url: 'a', last_frame_url: 'b' })
    expect([...imagesIn(sent)].sort()).toEqual(['a', 'b'])
  })

  it('再切回参考：和切之前发出去的完全一样（一张不少）', () => {
    const back = switchMode(switchMode(start, seedance, 'firstlast'), seedance, 'omni')
    expect(body(back, seedance)).toEqual(body(start, seedance))
  })
})

describe('换模型之后发出去的请求（上传的首尾帧）', () => {
  const option = (modelKey: string): ModelOption => ({ value: modelKey, modelKey, vendor: 'apimart', label: modelKey, kind: 'video' } as ModelOption)
  const swap = (modelKey: string) => {
    const node = { ...createGenerationNode({ id: 'v', kind: 'video' }), meta: { modelKey: 'seedance-2', modelVendor: 'apimart', vendor: 'apimart', archetype: { id: 'seedance-2', modeId: 'firstlast' }, firstFrameUrl: 'a', lastFrameUrl: 'b' } }
    const meta = buildNodeModelChangePatch({ node, nodes: [node], edges: [], modelOptions: [option('seedance-2'), option(modelKey)], value: modelKey, vendor: 'apimart' }).meta
    return { meta, spec: resolveArchetypeForModel({ modelKey, vendorKey: 'apimart', meta: {} } as never)! }
  }

  it.each(['wan-2.7', 'veo-3.1', 'kling-3.0', 'grok-imagine-1.5-video'])('换到 %s：两张图都在发出去的请求里（不会掉成纯文生）', (modelKey) => {
    const { meta, spec } = swap(modelKey)
    expect(currentArchetypeMode(spec, meta).intent).not.toBe('text')
    expect([...imagesIn(body(meta, spec))].sort()).toEqual(['a', 'b'])
  })

  it('Veo 3.1：按「首尾帧」类型发，两张图按首、尾的顺序', () => {
    const { meta, spec } = swap('veo-3.1')
    expect(body(meta, spec)).toMatchObject({ generation_type: 'frame', image_urls: ['a', 'b'] })
  })
})
