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
