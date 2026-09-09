import { expect, it } from 'vitest'
import type { GenerationCanvasNode } from '../generationCanvas/model/generationCanvasTypes'
import { localGenerationMedian } from './generationTiming'

it('requires ten matching actual completion durations and ignores output duration as generation time', () => {
  const node: GenerationCanvasNode = { id: 'n', kind: 'video', title: '', position: { x: 0, y: 0 },
    history: Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, type: 'video', createdAt: 1000000 + i, durationSeconds: 5, provenance: { provider: 'vendor', modelKey: 'model', timestamp: 1 } })),
    runs: Array.from({ length: 11 }, (_, i) => ({ id: `run${i}`, resultId: `r${i}`, status: 'success', startedAt: 1000000 + i - (i + 1) * 60000, completedAt: 1000000 + i, updatedAt: 1000000 + i, durationSeconds: 5 })) }
  const address = { vendorKey: 'vendor', modelKey: 'model' }
  expect(localGenerationMedian([node], address, 5)).toBe(6.5 * 60000)
  expect(localGenerationMedian([{ ...node, runs: node.runs!.slice(0, 9) }], address, 5)).toBeUndefined()
  expect(localGenerationMedian([node], { ...address, vendorKey: 'other' }, 5)).toBeUndefined()
  expect(localGenerationMedian([node], address, 10)).toBeUndefined()
})
