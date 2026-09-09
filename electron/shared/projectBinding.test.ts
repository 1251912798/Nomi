import { describe, expect, it } from 'vitest'
import { projectAgentPartitionKey, sameProjectAgentBinding } from './projectBinding'

const binding = { projectId: 'project-a', immutableProjectUuid: '11111111-1111-4111-8111-111111111111', projectGeneration: 3 }

describe('shared receipt and migration binding identity', () => {
  it('keeps the existing on-disk partition while comparing every authority dimension', () => {
    expect(projectAgentPartitionKey(binding)).toBe('project-agent.11111111-1111-4111-8111-111111111111.g3')
    expect(sameProjectAgentBinding(binding, { ...binding })).toBe(true)
    for (const other of [
      { ...binding, projectId: 'project-b' },
      { ...binding, immutableProjectUuid: '22222222-2222-4222-8222-222222222222' },
      { ...binding, projectGeneration: 4 },
    ]) expect(sameProjectAgentBinding(binding, other)).toBe(false)
  })

  it('rejects path traversal and malformed generations before constructing disk paths', () => {
    for (const other of [
      { ...binding, immutableProjectUuid: '../outside' },
      { ...binding, projectGeneration: 0 },
      { ...binding, projectGeneration: Number.MAX_SAFE_INTEGER + 1 },
      { ...binding, projectId: ' project-a' },
      { ...binding, extra: 'untrusted' },
    ]) expect(() => projectAgentPartitionKey(other)).toThrow('invalid_project_binding')
  })
})
