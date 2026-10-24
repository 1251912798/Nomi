// 视频比例默认的「已经是首选」判断：按 ASPECT_RATIO_META_KEYS 的优先级取第一个读得出比例的键（aspect_ratio 最先），
// 再约分比较。旧模式残留在别的键上的比例（切方式后 image_size 还留着）不能挡住这次该铺的默认值。
import { describe, expect, it } from 'vitest'
import type { GenerationCanvasEdge, GenerationCanvasNode } from '../model/generationCanvasTypes'
import type { DynamicModelControl } from './controls/parameterControlModel'
import { videoAspectSeedPatch } from './videoAspectSeed'

const ratioControl = (values: string[]): DynamicModelControl => ({
  key: 'aspect_ratio', label: '比例', binding: 'parameter',
  type: 'select', options: values.map((value) => ({ value, label: value })),
}) as unknown as DynamicModelControl

const portrait: GenerationCanvasNode = { id: 'img', title: 'img', kind: 'image', categoryId: 'shots', position: { x: 0, y: 0 }, meta: { aspect_ratio: '9:16' } }
const edges: GenerationCanvasEdge[] = [{ id: 'e1', source: 'img', target: 'shot', mode: 'first_frame' }]
const shot = (meta: Record<string, unknown>): GenerationCanvasNode => ({ id: 'shot', title: 'shot', kind: 'video', categoryId: 'shots', position: { x: 600, y: 0 }, meta })
const seed = (meta: Record<string, unknown>, values: string[]) =>
  videoAspectSeedPatch({ nodeId: 'shot', nodes: [portrait, shot(meta)], edges, controls: [ratioControl(values)], meta, respectExplicit: true })

describe('videoAspectSeedPatch：「已经是首选」只看优先级最高、读得出比例的那个键', () => {
  it('aspect_ratio 是 16:9、旧模式残留的 image_size 是竖版 → 连竖图仍切到 9:16', () => {
    expect(seed({ aspect_ratio: '16:9', image_size: 'portrait_16_9' }, ['16:9', '9:16']).aspect_ratio).toBe('9:16')
  })

  it('aspect_ratio 已是 720:1280（约分后就是 9:16）→ 不重铺', () => {
    expect(seed({ aspect_ratio: '720:1280' }, ['1280:720', '720:1280'])).toEqual({})
  })
})
