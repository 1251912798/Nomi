import { describe, expect, it } from 'vitest'
import type { LaneSnapshot } from '@earendil-works/pi-agent-core'
import { projectLaneSnapshot } from './laneProjection'

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }

describe('lane provider failure visibility', () => {
  it('retains a settled provider error even when the assistant produced no content', () => {
    const snapshot: LaneSnapshot = {
      lane: 'main', tipId: 'failed', operation: null, queues: [], faulted: false,
      configuration: { model: { provider: 'fixture', modelId: 'fixture' }, thinkingLevel: 'off', activeToolNames: [] },
      stats: { messageCount: 1, usage },
      transcript: [{ id: 'failed', parentId: null, seq: 1, timestamp: 1, type: 'message', message: {
        role: 'assistant', content: [], api: 'openai-completions', provider: 'fixture', model: 'fixture',
        usage, stopReason: 'error', errorMessage: 'Connection closed before a response.', timestamp: 1,
      } }],
    }
    const projection = projectLaneSnapshot(snapshot, { pricing: 'unpriced', supportedThinkingLevels: ['off'] })
    expect(projection.parts).toEqual([{
      kind: 'error', text: 'Connection closed before a response.', sequence: 0, entrySeq: 1, contentIndex: 0,
    }])
    expect(projection.running).toBe(false)
  })
})
