import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateToolArguments } from '@earendil-works/pi-ai';
import { LANE_DEFERRED_TOOL_CATALOG } from '../../electron/agentLane/laneToolCatalog.js';
import { toModelVisibleSchema } from '../../electron/agentLane/laneToolSchema.mjs';

test('every deferred domain descriptor reaches the pi schema boundary', () => {
  for (const tool of LANE_DEFERRED_TOOL_CATALOG) {
    assert.doesNotThrow(() => toModelVisibleSchema(tool.schema, { toolName: tool.name }), tool.name);
  }
});

test('pi accepts nested JSON generation parameters through the published local references', () => {
  const spec = LANE_DEFERRED_TOOL_CATALOG.find(tool => tool.name === 'nomi_generation_plan')!;
  const tool = { name: spec.name, description: spec.description,
    parameters: toModelVisibleSchema(spec.schema, { toolName: spec.name }) };
  const parameters = { seed: 17, enabled: true, labels: ['one', 'two'], nullable: null,
    nested: { image: { crop: [0, 1, 2, 3] }, prompts: [{ text: 'A sunrise', weights: [0.5, 1] }] } };
  const cases = [
    { operation: 'create', prompt: 'A sunrise', parameters },
    { operation: 'patch', operationId: 'operation-1', patch: { parameters } },
    { operation: 'create', shots: [{ prompt: 'A sunrise', parameters }] },
    { operation: 'create', candidate: { candidateId: 'candidate-1', revision: 1, moduleId: 'image',
      providerId: 'loopback', modelId: 'fixture', mode: 'text_to_image', prompt: 'A sunrise', parameters } },
  ];
  for (const args of cases) {
    const validated = validateToolArguments(tool, { id: 'call-1', type: 'toolCall', name: tool.name, arguments: args });
    assert.equal(spec.schema.safeParse(validated).success, true);
    assert.deepEqual(validated, args);
  }
  assert.throws(() => validateToolArguments(tool, { id: 'invalid', type: 'toolCall', name: tool.name,
    arguments: { operation: 'create', candidate: { parameters } } }));
});
