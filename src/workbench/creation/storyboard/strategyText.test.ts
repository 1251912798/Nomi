import { describe, expect, it } from 'vitest'
import { aggregateIssues } from './strategyText'

describe('aggregateIssues', () => {
  it('combines identical model corrections and keeps affected shots', () => {
    const issues = Array.from({ length: 8 }, (_, index) => ({
      code: 'model.missing' as const,
      shotId: `s${index + 1}`,
      params: { requested: 'minimax-h3', modelLabel: 'MiniMax H3' },
    }))
    expect(aggregateIssues(issues)).toEqual([{ issue: issues[0], shotIds: issues.map((issue) => issue.shotId!) }])
  })

  it('does not combine different model corrections', () => {
    const result = aggregateIssues([
      { code: 'model.missing', shotId: 's1', params: { requested: 'a', modelLabel: 'A' } },
      { code: 'model.missing', shotId: 's2', params: { requested: 'b', modelLabel: 'B' } },
    ])
    expect(result).toHaveLength(2)
  })
})
