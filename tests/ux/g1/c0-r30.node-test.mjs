import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scorePlanner, scoreLanePlanner } from './c0-r30.mjs'
const event = (type, payload) => ({ type: `agent.${type}`, payload })
const trace = [event('tool.proposed', { toolCallId: 'first' }),
  event('tool.completed', { toolCallId: 'first', ok: false }),
  event('tool.proposed', { toolCallId: 'retry' }), event('tool.completed', { toolCallId: 'retry', ok: true }),
  event('turn.finished', { status: 'ok', finalTextHead: 'done' })]
test('a successful retry does not erase the failed first tool; success also requires domain and closing text', () => {
  assert.equal(scorePlanner(trace, true).firstTool, '0/1 (0%)')
  assert.equal(scorePlanner(trace, true).turns, '1/1 (100%)')
  assert.equal(scorePlanner(trace, false).turns, '0/1 (0%)')
  assert.equal(scorePlanner([...trace, event('turn.finished', { status: 'ok', finalTextHead: '' })], true).turns, '0/1 (0%)')
})
test('no observed tool call stays N/A; an attempted but interrupted planner stays failed', () => {
  assert.equal(scorePlanner([], false).firstTool, 'N/A (0/0)')
  assert.equal(scorePlanner([], false).turns, '0/1 (0%)')
})

test('native lane scoring preserves failed first calls and requires an actual successful terminal', () => {
  const messages = [
    { role: 'assistant', content: [{ type: 'toolCall', id: 'first' }] },
    { role: 'toolResult', toolCallId: 'first', isError: true },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'retry' }] },
    { role: 'toolResult', toolCallId: 'retry', isError: false },
    { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'done' }] },
  ]
  assert.equal(scoreLanePlanner(messages, true).firstTool, '0/1 (0%)')
  assert.equal(scoreLanePlanner(messages, true).turns, '1/1 (100%)')
  assert.equal(scoreLanePlanner(messages.slice(0, -1), true).turns, '0/1 (0%)')
  assert.equal(scoreLanePlanner(messages, false).turns, '0/1 (0%)')
  assert.equal(scoreLanePlanner([], false).firstTool, 'N/A (0/0)')
})
