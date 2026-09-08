import { expect, it } from 'vitest'
import { slowGenerationEntries } from './slowGenerationNotice'
import type { GenerationQueueEntry } from '../generationCanvas/runner/generationQueueStore'
const base = { nodeId: 'n', batchId: 'b', waveIndex: 0, enqueuedAt: 0 }
it('does not invent an expected duration without successful history for the same node', () => {
  const running: GenerationQueueEntry = { ...base, id: 'now', state: 'running', startedAt: 100 }
  expect(slowGenerationEntries([running], 100000)).toEqual([])
  const prior: GenerationQueueEntry = { ...base, id: 'prior', state: 'success', startedAt: 0, endedAt: 10 }
  expect(slowGenerationEntries([prior, running], 120)).toEqual([])
  expect(slowGenerationEntries([prior, running], 121)).toEqual([running])
  expect(slowGenerationEntries([{ ...prior, nodeId: 'other' }, running], 100000)).toEqual([])
})
