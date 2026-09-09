import { productionRunToolDescriptors, productionRunReadToolNames, productionArtifactWriteToolNames } from './productionRunDescriptors'
import { modelArgumentTolerance } from './modelArgumentTolerance'
import { modelEffectsForCapability, MODEL_TOOL_READ_TIMEOUT_MS, MODEL_TOOL_WRITE_TIMEOUT_MS, type ModelFacingToolSpec } from './modelFacingTools'
import { capabilityContractById } from './registry'

/** Existing production schemas have one owner; both runtime generations consume that owner. */
export function productionModelToolSpecs(): ModelFacingToolSpec[] {
  return Object.values(productionRunToolDescriptors).map(descriptor => {
    const read = productionRunReadToolNames.has(descriptor.name)
    const contractId = read ? 'production.run.read' : productionArtifactWriteToolNames.has(descriptor.name)
      ? 'production.artifact.write' : 'production.run.write'
    const contract = capabilityContractById(contractId)
    if (!contract) throw new Error(`Unknown deferred capability: ${contractId}`)
    const effects = modelEffectsForCapability(contract)
    return {
      contractId,
      name: descriptor.name,
      schema: descriptor.parameters,
      description: descriptor.description,
      promptSnippet: descriptor.description,
      promptGuidelines: ['Use run and artifact identifiers returned by Nomi. Preserve expectedVersion and revision. Paid gates must be confirmed in Nomi.'],
      effects,
      execution: { timeoutMs: effects.mutates ? MODEL_TOOL_WRITE_TIMEOUT_MS : MODEL_TOOL_READ_TIMEOUT_MS },
      profiles: ['internal'], internalGroup: 'production',
      examples: descriptor.name === 'start_production_run'
        ? [{ when: 'Create a reviewable brief draft:', arguments: { goal: 'A short product introduction', durationSeconds: 30 } }]
        : [],
      prepareArguments: descriptor.name === 'start_production_run'
        ? modelArgumentTolerance({ arrayFields: ['sellingPoints'] }) : modelArgumentTolerance({}),
    }
  })
}
