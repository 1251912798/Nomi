// NF-0928-0003 类边界：判据从动词声明派生——只有读动词、只有成功的、只有同一资源（语义入参归一后相同）才互相取代。
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import { LANE_MODEL_TOOL_CATALOG } from './laneToolCatalog'
import { omitSupersededReads, supersededReadNote } from './laneSupersededReads.mjs'

const call = (id: string, name: string, args: unknown) => ({ role: 'assistant', content: [{ type: 'toolCall', id, name, arguments: args }],
  api: 'openai-completions', provider: 'f', model: 'f', stopReason: 'toolUse', timestamp: 0,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }) as unknown as AgentMessage
const result = (id: string, name: string, text: string, isError = false) =>
  ({ role: 'toolResult', toolCallId: id, toolName: name, content: [{ type: 'text', text }], isError, timestamp: 0 }) as AgentMessage
const texts = (messages: AgentMessage[]) => messages.flatMap((message) => message.role === 'toolResult'
  ? [(message.content[0] as { text: string }).text] : [])

describe('omitSupersededReads', () => {
  it('a later read of the same resource replaces the earlier copy; {} and {scope:"full"} are the same resource', () => {
    const out = omitSupersededReads([call('a', 'read_script', {}), result('a', 'read_script', 'OLD'),
      call('b', 'read_script', { scope: 'full' }), result('b', 'read_script', 'NEW')], LANE_MODEL_TOOL_CATALOG)
    expect(texts(out)).toEqual([supersededReadNote('read_script', 'b'), 'NEW'])
  })

  it('keeps a two-page read sequence visible at answer time', () => {
    const input = [
      call('page-1', 'look_at_canvas', {},), result('page-1', 'look_at_canvas', 'PAGE 1'),
      call('page-2', 'look_at_canvas', { selectedFrom: 32 }), result('page-2', 'look_at_canvas', 'PAGE 2'),
    ]
    expect(texts(omitSupersededReads(input, LANE_MODEL_TOOL_CATALOG))).toEqual(['PAGE 1', 'PAGE 2'])
  })

  it('uses the declared cursor field instead of coupling paging to a field name', () => {
    const canvas = LANE_MODEL_TOOL_CATALOG.find((spec) => spec.name === 'look_at_canvas')!
    const offsetSpec = {
      ...canvas,
      name: 'read_with_offset',
      pageCursorField: 'offset',
      schema: z.object({ offset: z.number().int().min(0).optional() }),
      semanticInputOf: () => ({}),
    }
    const input = [
      call('page-1', 'read_with_offset', {}), result('page-1', 'read_with_offset', 'PAGE 1'),
      call('page-2', 'read_with_offset', { offset: 32 }), result('page-2', 'read_with_offset', 'PAGE 2'),
    ]
    expect(texts(omitSupersededReads(input, [offsetSpec]))).toEqual(['PAGE 1', 'PAGE 2'])
  })

  it('keeps all three pages in one sequence and does not let continuations replace each other', () => {
    const input = [
      call('page-1', 'look_at_canvas', {},), result('page-1', 'look_at_canvas', 'PAGE 1'),
      call('page-2', 'look_at_canvas', { selectedFrom: 32 }), result('page-2', 'look_at_canvas', 'PAGE 2'),
      call('page-3', 'look_at_canvas', { selectedFrom: 64 }), result('page-3', 'look_at_canvas', 'PAGE 3'),
    ]
    expect(texts(omitSupersededReads(input, LANE_MODEL_TOOL_CATALOG))).toEqual(['PAGE 1', 'PAGE 2', 'PAGE 3'])
  })

  it('a new page one replaces the old page and every old continuation, while other resources stay', () => {
    const input = [
      call('old-1', 'look_at_canvas', {},), result('old-1', 'look_at_canvas', 'OLD PAGE 1'),
      call('old-2', 'look_at_canvas', { selectedFrom: 32 }), result('old-2', 'look_at_canvas', 'OLD PAGE 2'),
      call('other', 'read_script', {},), result('other', 'read_script', 'OTHER'),
      call('new-1', 'look_at_canvas', {},), result('new-1', 'look_at_canvas', 'NEW PAGE 1'),
    ]
    expect(texts(omitSupersededReads(input, LANE_MODEL_TOOL_CATALOG))).toEqual([
      supersededReadNote('look_at_canvas', 'new-1'),
      supersededReadNote('look_at_canvas', 'new-1'),
      'OTHER',
      'NEW PAGE 1',
    ])
  })

  it('a different resource, a failed later read, a failed earlier read and a write are all kept as they are', () => {
    const input = [
      call('a', 'read_script', {}), result('a', 'read_script', 'FULL'),
      call('b', 'read_script', { scope: 'selection' }), result('b', 'read_script', 'SELECTION'),
      call('c', 'read_script', {}), result('c', 'read_script', 'refused', true),
      call('d', 'write_script', { where: 'append', content: 'x' }), result('d', 'write_script', 'WRITTEN'),
      call('e', 'write_script', { where: 'append', content: 'y' }), result('e', 'write_script', 'WRITTEN AGAIN'),
    ]
    expect(texts(omitSupersededReads(input, LANE_MODEL_TOOL_CATALOG))).toEqual(['FULL', 'SELECTION', 'refused', 'WRITTEN', 'WRITTEN AGAIN'])
  })

  it('every read verb in the catalog takes part, and no write verb does (derived, not a hand list)', () => {
    for (const spec of LANE_MODEL_TOOL_CATALOG) {
      const out = omitSupersededReads([call('a', spec.name, {}), result('a', spec.name, 'OLD'), call('b', spec.name, {}), result('b', spec.name, 'NEW')], [spec])
      expect(texts(out)[0], spec.name).toBe(spec.effect === 'read' ? supersededReadNote(spec.name, 'b') : 'OLD')
    }
  })
})
