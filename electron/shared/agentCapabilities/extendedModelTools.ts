import { flattenDiscriminatedUnion } from './flatModelInput'
import { timelineEditPlanModelSchema, timelineReadPiDescriptionForAlias } from './timelineRead'
import { timelineWritePiInputSchemaForAlias, timelineWritePiDescriptionForAlias, TIMELINE_WRITE_ALIASES } from './timelineWrite'
import { exportReadPiInputSchemaForAlias, exportWritePiInputSchemaForAlias, exportReadPiDescriptionForAlias,
  exportWritePiDescriptionForAlias, EXPORT_READ_ALIASES, EXPORT_WRITE_ALIASES } from './exportCapabilities'
import { CANVAS_DELETE_ALIAS, canvasDeletePiInputSchema, canvasDeletePiDescriptionForAlias } from './canvasDelete'
import { generationPlanSchemaForHost, generationStatusInputSchema } from './generationPlanSchemas'
import { modelArgumentTolerance } from './modelArgumentTolerance'
import { modelEffectsForCapability, MODEL_TOOL_READ_TIMEOUT_MS, MODEL_TOOL_WRITE_TIMEOUT_MS, type ModelFacingToolSpec } from './modelFacingTools'
import { capabilityContractById } from './registry'

const examplePlan = { planId: 'plan-1', baseRevision: 'revision-1', summary: 'Move the opening clip',
  operations: [{ kind: 'move', clipId: 'clip-1', startFrame: 0 }] }

function spec(input: Pick<ModelFacingToolSpec, 'name' | 'schema' | 'contractId' | 'internalGroup'> & {
  description: string; examples?: ModelFacingToolSpec['examples'];
  operationCapabilityIds?: ModelFacingToolSpec['operationCapabilityIds']
}): ModelFacingToolSpec {
  const { examples, ...fields } = input
  const contract = capabilityContractById(input.contractId)
  if (!contract) throw new Error(`Unknown deferred capability: ${input.contractId}`)
  const effects = modelEffectsForCapability(contract)
  return { ...fields, promptSnippet: input.description,
    effects,
    execution: { timeoutMs: effects.mutates ? MODEL_TOOL_WRITE_TIMEOUT_MS : MODEL_TOOL_READ_TIMEOUT_MS },
    examples: examples ?? [], profiles: ['internal'],
    prepareArguments: modelArgumentTolerance({ arrayFields: ['operations', 'nodeIds', 'shots', 'references'], objectFields: ['patch', 'candidate', 'parameters'] }),
  }
}

/** Deferred model descriptors remain next to their canonical capability schemas. */
export function extendedModelToolSpecs(): ModelFacingToolSpec[] {
  const timeline = [
    spec({ name: 'propose_edit_plan', contractId: 'timeline.read', internalGroup: 'timeline',
      description: timelineReadPiDescriptionForAlias('propose_edit_plan')!, schema: timelineEditPlanModelSchema,
      examples: [{ when: 'Preview before applying:', arguments: examplePlan }] }),
    ...Object.values(TIMELINE_WRITE_ALIASES).map(name => spec({ name, contractId: 'timeline.write', internalGroup: 'timeline',
      description: timelineWritePiDescriptionForAlias(name)!,
      schema: name === TIMELINE_WRITE_ALIASES.applyPlan ? timelineEditPlanModelSchema : timelineWritePiInputSchemaForAlias(name)!,
      examples: name === TIMELINE_WRITE_ALIASES.applyPlan ? [{ when: 'Apply the reviewed plan:', arguments: examplePlan }] : [],
    })),
  ]
  const media = [
    ...Object.values(EXPORT_READ_ALIASES).map(name => spec({ name, contractId: 'export.read', internalGroup: 'media',
      description: exportReadPiDescriptionForAlias(name)!, schema: exportReadPiInputSchemaForAlias(name)! })),
    ...Object.values(EXPORT_WRITE_ALIASES).map(name => spec({ name, contractId: 'export.write', internalGroup: 'media',
      description: exportWritePiDescriptionForAlias(name)!, schema: exportWritePiInputSchemaForAlias(name)! })),
  ]
  return [...timeline, ...media,
    spec({ name: CANVAS_DELETE_ALIAS, contractId: 'canvas.delete', internalGroup: 'maintenance',
      description: canvasDeletePiDescriptionForAlias(CANVAS_DELETE_ALIAS)!, schema: canvasDeletePiInputSchema }),
    spec({ name: 'nomi_generation_plan', contractId: 'generation.plan', internalGroup: 'generation',
      description: 'Read generation context, create or revise a draft. This host cannot preview. Use existing operation identifiers for updates. This never approves or starts paid generation.',
      schema: flattenDiscriminatedUnion(generationPlanSchemaForHost({ preview: false }), { name: 'generation plan' }),
      operationCapabilityIds: { context: 'generation.context.read', create: 'generation.plan', patch: 'generation.plan' },
      examples: [{ when: 'Create a draft:', arguments: { operation: 'create', prompt: 'A quiet sunrise above the sea' } }],
    }),
    spec({ name: 'nomi_generation_status', contractId: 'generation.control', internalGroup: 'generation',
      description: 'Read, cancel, or reconcile one generation operation. Read status before cancellation or reconciliation. Never retry unknown provider work or spend credit.',
      schema: flattenDiscriminatedUnion(generationStatusInputSchema, { name: 'generation status' }),
      operationCapabilityIds: { read: 'generation.run.read', cancel: 'generation.control', reconcile: 'generation.control' },
      examples: [{ when: 'Read the current task:', arguments: { operation: 'read', operationId: 'run-1' } }],
    }),
  ]
}
