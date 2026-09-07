import { describe, expect, it } from 'vitest'
import { nodeReferenceCapacity } from './nodeCrossFieldConstraints'
import { resolveRenderedControls } from '../nodeModelArchetype'
import { MINIMAX_H3_APIMART_ARCHETYPE } from '../../../../../electron/shared/videoCapabilities/minimaxH3Apimart'
import type { GenerationCanvasNode } from '../../model/generationCanvasTypes'
import type { ModelOption } from '../../../../config/models'

const base: GenerationCanvasNode = { id: 'target', kind: 'video', title: '', categoryId: 'shots', position: { x: 0, y: 0 } }
const refMode = MINIMAX_H3_APIMART_ARCHETYPE.modes.find(mode => mode.id === 'ref')!
const urls = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `https://example.com/${prefix}${index}`)

describe('renderer cross-field boundary', () => {
  it('projects Hailuo options from current metadata through production model resolution', () => {
    const option = { value: 'MiniMax-Hailuo-2.3', modelKey: 'MiniMax-Hailuo-2.3', vendor: 'apimart', label: 'Hailuo 2.3' } as ModelOption
    for (const variantId of ['standard', 'fast']) {
      const meta = { resolution: '1080p', duration: 10, archetype: { id: 'hailuo-2.3', modeId: 'i2v', variantId } }
      const duration = resolveRenderedControls(option, meta, false, true).find(control => control.key === 'duration')
      expect(duration?.options).toEqual([{ value: 6, label: '6' }])
    }
  })
  it('counts pending connected videos alongside uploaded images and audio', () => {
    const target = { ...base, meta: { modelKey: 'MiniMax-H3', vendor: 'apimart', archetype: { id: 'minimax-h3-apimart', modeId: 'ref' }, referenceImageUrls: urls('image', 8), referenceAudioUrls: urls('audio', 3) } }
    const source = { ...base, id: 'source' }
    const nodes = [target, source]
    expect(nodeReferenceCapacity(refMode, target, nodes, [])).toBe(1)
    expect(nodeReferenceCapacity(refMode, target, nodes, [{ id: 'pending-video', source: 'source', target: 'target', mode: 'reference' }])).toBe(0)
  })
})
