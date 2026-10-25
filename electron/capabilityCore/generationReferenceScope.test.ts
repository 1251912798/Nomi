import { describe, expect, it } from 'vitest'
import { createGenerationReferenceScopeGuard } from './generationReferenceScope'
import type { ExecutionContractV1, PlanCandidate } from './executionContract'

const lease = { projectId: 'project-1', immutableProjectUuid: 'uuid-1', projectGeneration: 1, revocationEpoch: 0 }
const candidate: PlanCandidate = {
  candidateId: 'shot-1', revision: 1, moduleId: 'generation.single-shot', providerId: 'apimart', modelId: 'image-model', mode: 'text-to-image',
  prompt: 'a cat', parameters: { size: '1024x1024' }, references: [{ assetId: 'asset-1', contentHash: 'hash-1', version: 1, kind: 'image', role: 'reference' }],
}
const contract: ExecutionContractV1 = { schemaVersion: 1, candidateId: 'shot-1', candidateRevision: 1, moduleId: 'generation.single-shot', moduleVersion: '1.0.0', contractHash: 'contract-1', providerId: 'apimart', modelId: 'image-model', mode: 'text-to-image', prompt: candidate.prompt, parameters: candidate.parameters, references: candidate.references, warnings: [] }
const run = (overrides: Record<string, unknown> = {}) => ({
  runId: 'op-1', projectId: 'project-1', revision: 1, status: 'draft', stageId: 'generation', planVersion: 1,
  generationPlan: { state: 'draft', candidate, cardHidden: false }, jobs: [], ...overrides,
}) as never

describe('generation reference scope guard', () => {
  it('ignores Nomi-owned project and canvas projection revision changes during delayed upload', () => {
    let project = { id: 'project-1', immutableProjectUuid: 'uuid-1', projectGeneration: 1, revision: 1 }
    let currentRun = run()
    const assertCurrent = createGenerationReferenceScopeGuard({
      lease, operation: { operationId: 'op-1', projectId: 'project-1', candidate, planVersion: 1 }, contract, initialRun: currentRun,
      readProject: () => project, readRun: () => currentRun,
    })
    project = { ...project, revision: 2 }
    currentRun = run({ revision: 2, generationPlan: { state: 'draft', candidate, cardHidden: false, nodeId: 'node-1' } })
    expect(() => assertCurrent()).not.toThrow()
  })

  it('rejects a user change to the selected shot while upload is in flight', () => {
    let currentRun = run()
    const assertCurrent = createGenerationReferenceScopeGuard({
      lease, operation: { operationId: 'op-1', projectId: 'project-1', candidate, planVersion: 1 }, contract, initialRun: currentRun,
      readProject: () => ({ id: 'project-1', immutableProjectUuid: 'uuid-1', projectGeneration: 1, revision: 1 }), readRun: () => currentRun,
    })
    currentRun = run({ revision: 2, generationPlan: { state: 'draft', candidate: { ...candidate, revision: 2, prompt: 'a fox' }, cardHidden: false } })
    expect(() => assertCurrent()).toThrow('generation_reference_scope_changed')
  })

  it('rejects a user change to the selected reference identity', () => {
    let currentRun = run()
    const assertCurrent = createGenerationReferenceScopeGuard({
      lease, operation: { operationId: 'op-1', projectId: 'project-1', candidate, planVersion: 1 }, contract, initialRun: currentRun,
      readProject: () => ({ id: 'project-1', immutableProjectUuid: 'uuid-1', projectGeneration: 1 }), readRun: () => currentRun,
    })
    currentRun = run({
      generationPlan: {
        state: 'draft',
        cardHidden: false,
        candidate: { ...candidate, references: [{ ...candidate.references![0], assetId: 'asset-2', contentHash: 'hash-2' }] },
      },
    })
    expect(() => assertCurrent()).toThrow('generation_reference_scope_changed')
  })

  it('rejects another process advancing the selected Run state', () => {
    let currentRun = run()
    const assertCurrent = createGenerationReferenceScopeGuard({
      lease, operation: { operationId: 'op-1', projectId: 'project-1', candidate, planVersion: 1 }, contract, initialRun: currentRun,
      readProject: () => ({ id: 'project-1', immutableProjectUuid: 'uuid-1', projectGeneration: 1, revision: 1 }), readRun: () => currentRun,
    })
    currentRun = run({ revision: 2, status: 'submitted' })
    expect(() => assertCurrent()).toThrow('generation_reference_scope_changed')
  })

  it('keeps the old whole-revision criterion red for a Nomi-owned self-write', () => {
    const initialProjectRevision: number = 1
    const currentProjectRevision: number = 2
    const initialRunRevision: number = 1
    const currentRunRevision: number = 2
    const legacyAssertCurrent = () => {
      if (currentProjectRevision !== initialProjectRevision || currentRunRevision !== initialRunRevision) {
        throw new Error('generation_reference_scope_changed')
      }
    }
    expect(legacyAssertCurrent).toThrow('generation_reference_scope_changed')
  })
})
