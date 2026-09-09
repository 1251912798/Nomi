import { laneMessageText } from '../agent-lane-observer.mjs'
// Score the native transcript emitted by the runtime under test, never retired Host events.
export function scorePlanner(messages, domainComplete) {
  const first = messages.flatMap((message) => Array.isArray(message.content) ? message.content : [])
    .find((part) => part.type === 'toolCall' && part.name === 'nomi_storyboard_write')
  const completed = first && messages.find((message) => message.role === 'toolResult' && message.toolCallId === first.id)
  const terminal = messages.findLast((message) => message.role === 'assistant')
  const correct = Boolean(completed) && completed.isError === false
  const success = domainComplete && terminal?.stopReason === 'stop' && Boolean(laneMessageText(terminal).trim())
  return { firstTool: first ? `${correct ? 1 : 0}/1 (${correct ? 100 : 0}%)` : 'N/A (0/0)',
    turns: `${success ? 1 : 0}/1 (${success ? 100 : 0}%)`,
    scope: 'First native storyboard write and completed planner turn; automatic reviews excluded.' }
}

// The switch candidate persists pi messages instead of retired agent.* events.
export function scoreLanePlanner(messages, domainComplete) {
  const first = messages.filter((m) => m.role === 'assistant')
    .flatMap((m) => Array.isArray(m.content) ? m.content : []).find((p) => p.type === 'toolCall')
  const completed = first && messages.find((m) => m.role === 'toolResult' && m.toolCallId === first.id)
  const terminal = messages.at(-1)
  const correct = completed && completed.isError === false
  const success = domainComplete && terminal?.role === 'assistant' && terminal.stopReason === 'stop'
    && terminal.content?.some((p) => p.type === 'text' && p.text?.trim())
  return { firstTool: first ? `${correct ? 1 : 0}/1 (${correct ? 100 : 0}%)` : 'N/A (0/0)',
    turns: `${success ? 1 : 0}/1 (${success ? 100 : 0}%)`,
    scope: 'One storyboard planner attempt; native pi transcript; automatic reviews excluded.' }
}
