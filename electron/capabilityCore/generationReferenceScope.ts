import type { ExecutionContractV1, PlanCandidate } from './executionContract'
import type { GenerationSealMultiShot } from './mcpGenerationMultiShot'
import { stableAuthorizationJson } from '../productionRun/productionGenerationAuthorization'
import type { ProjectLeaseV2 } from './projectLease'
import type { ProductionRun } from '../productionRun/productionRunTypes'
import type { WorkspaceProjectRecordV2 } from '../workspace/workspaceTypes'

type ProjectIdentity = Pick<WorkspaceProjectRecordV2, 'id' | 'immutableProjectUuid' | 'projectGeneration'>
type GenerationOperationScope = Readonly<{
  operationId: string
  projectId: string
  candidate: PlanCandidate
  planVersion?: number
}>

type ScopeUnit = Readonly<{ shotId: string; candidate: PlanCandidate; contract: ExecutionContractV1 }>

export type GenerationReferenceScopeGuardInput = Readonly<{
  lease: Pick<ProjectLeaseV2, 'projectId' | 'immutableProjectUuid' | 'projectGeneration'>
  operation: GenerationOperationScope
  contract: ExecutionContractV1
  multiShot?: GenerationSealMultiShot
  initialRun: ProductionRun
  readProject: () => ProjectIdentity | null | undefined
  readRun: () => ProductionRun | null | undefined
}>

function unitsFor(input: Pick<GenerationReferenceScopeGuardInput, 'operation' | 'contract' | 'multiShot'>): readonly ScopeUnit[] {
  if (!input.multiShot) return [{ shotId: input.operation.candidate.candidateId, candidate: input.operation.candidate, contract: input.contract }]
  const scope = new Set(input.multiShot.scope)
  return input.multiShot.shots
    .filter((shot) => shot.included !== false && scope.has(shot.shotId) && shot.contract)
    .map((shot) => ({ shotId: shot.shotId, candidate: shot.candidate, contract: shot.contract! }))
}

function candidateForShot(run: ProductionRun, shotId: string): PlanCandidate | undefined {
  const plan = run.generationPlan
  if (!plan) return undefined
  if (plan.shots && plan.shots.length > 0) return plan.shots.find((shot) => shot.shotId === shotId)?.candidate
  return plan.candidate.candidateId === shotId ? plan.candidate : undefined
}

/**
 * Run state that can change the user's generation decision. Revision counters, updatedAt,
 * canvas node bindings and detached projection flags are deliberately excluded: those are
 * Nomi-owned projection/cache writes and are not user scope.
 */
function semanticRunState(run: ProductionRun, shotIds: readonly string[]): unknown {
  const selected = new Set(shotIds)
  return {
    status: run.status,
    stageId: run.stageId,
    stop: run.stop,
    planVersion: run.planVersion,
    planState: run.generationPlan?.state,
    jobs: run.jobs
      .filter((job) => selected.has(typeof job.metadata?.shotId === 'string' ? job.metadata.shotId : ''))
      .map((job) => ({
        jobId: job.jobId,
        shotId: job.metadata?.shotId,
        attempt: job.attempt,
        status: job.status,
        providerTaskId: job.providerTaskId,
        stageId: job.stageId,
      }))
      .sort((left, right) => left.jobId.localeCompare(right.jobId)),
  }
}

function projectIdentityOf(project: ProjectIdentity | null | undefined): unknown {
  if (!project) return null
  return { id: project.id, immutableProjectUuid: project.immutableProjectUuid, projectGeneration: project.projectGeneration }
}

function scopeSnapshot(input: GenerationReferenceScopeGuardInput, project: ProjectIdentity | null | undefined, run: ProductionRun | null | undefined): string {
  const units = unitsFor(input)
  const shotIds = units.map((unit) => unit.shotId)
  return stableAuthorizationJson({
    project: projectIdentityOf(project),
    operationId: input.operation.operationId,
    projectId: input.operation.projectId,
    planVersion: input.operation.planVersion,
    candidates: units.map((unit) => ({
      shotId: unit.shotId,
      candidate: unit.candidate,
      contractHash: unit.contract.contractHash,
      references: unit.contract.references,
    })),
    currentCandidates: run ? shotIds.map((shotId) => ({ shotId, candidate: candidateForShot(run, shotId) ?? null })) : null,
    run: run ? semanticRunState(run, shotIds) : null,
  })
}

/**
 * Shared upload-time guard for both app and authenticated-MCP hosts.
 * It compares semantic generation scope, never the mutable project/Run revision counters.
 */
export function createGenerationReferenceScopeGuard(input: GenerationReferenceScopeGuardInput): () => void {
  const initialProject = input.readProject()
  const initialRun = input.initialRun
  const expectedProject = {
    id: input.lease.projectId,
    immutableProjectUuid: input.lease.immutableProjectUuid,
    projectGeneration: input.lease.projectGeneration,
  }
  const expected = scopeSnapshot(input, initialProject, initialRun)
  return () => {
    const currentProject = input.readProject()
    const currentRun = input.readRun()
    if (!currentProject || !currentRun
      || stableAuthorizationJson(projectIdentityOf(currentProject)) !== stableAuthorizationJson(expectedProject)
      || scopeSnapshot(input, currentProject, currentRun) !== expected) {
      throw new Error('generation_reference_scope_changed')
    }
  }
}
