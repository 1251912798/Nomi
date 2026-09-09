import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { AgentHarness } from '@earendil-works/pi-agent-core';
import { createModels } from '@earendil-works/pi-ai';
import { createNomiProvider } from '../../electron/agentLane/laneModelProvider.mjs';
import { openLaneSession } from '../../electron/agentLane/laneSession.mjs';
import { BACKGROUND_CONTEXT } from '@earendil-works/pi-agent-core/harness/context';
import { z } from 'zod';
import { createLaneNativeAssembly } from '../../electron/agentLane/laneNativeAssembly.mjs';
import { createExtendedLaneTools } from '../../electron/agentLane/laneExtendedTools.js';
import { createCanvasLaneTools } from '../../electron/agentLane/laneCanvasTools.js';
import { toModelVisibleSchema } from '../../electron/agentLane/laneToolSchema.mjs';
import { createLaneTools } from '../../electron/agentLane/laneTools.mjs';
import { bindLaneTool } from '../../electron/agentLane/laneRuntimePort.js';
import { LANE_MODEL_TOOL_CATALOG, LANE_DEFERRED_TOOL_CATALOG } from '../../electron/agentLane/laneToolCatalog.js';
import { generationPlanInputSchema } from '../../electron/shared/agentCapabilities/generationPlanSchemas.js';
import { createLaneFixture } from './laneFixture.mjs';

const sandbox = { active: true, operations: { exec: async () => ({ exitCode: 0 }) }, close: async () => undefined };
const closing = { type: 'text' as const, text: '完成。' };
const plan = () => LANE_DEFERRED_TOOL_CATALOG.find(s => s.name === 'nomi_generation_plan')!;
const textOf = (result: { content: readonly { type: string; text?: string }[] }) => result.content.map(p => p.text ?? '').join('\n');

test('C19 · switching groups tells the model core tools remain callable', async t => {
  const f = await createLaneFixture(t, [
    { type: 'tool', calls: [{ id: 'switch', name: 'nomi_request_tools', arguments: { group: 'coding' } }] },
    { type: 'tool', calls: [{ id: 'core', name: 'read_full_text', arguments: {} }] }, closing,
  ]);
  const native = await createLaneNativeAssembly({ projectDir: f.projectDir, sandbox, bashTimeoutMs: 5000 });
  const request = native.tools.find(tool => tool.name === 'nomi_request_tools')!;
  const result = await request.execute('switch', { group: 'coding' } as never, (() => undefined) as never, undefined, {} as never, BACKGROUND_CONTEXT);
  assert.match(textOf(result), /Always available:.*read_full_text/);
  assert.match(textOf(result), /Added by coding:/);
  assert.match(textOf(result), /Retired:/);
  assert.match(request.description, /Core tools stay available in every group/);
  const configured = await createNomiProvider(f.options.model, globalThis.fetch);
  const models = createModels({ credentials: configured.credentials });
  models.setProvider(configured.provider);
  const session = await openLaneSession({ projectDir: f.projectDir, laneName: 'main' }, BACKGROUND_CONTEXT);
  const { harness } = await AgentHarness.create<undefined>({ session: session.session, models,
    model: configured.model, systemPrompt: 'Read the creation document after switching groups.',
    tools: [...createLaneTools(LANE_MODEL_TOOL_CATALOG.map(spec =>
      f.options.tools.find(tool => tool.name === spec.name) ?? bindLaneTool(spec, async () => {
        throw new Error('Unexpected domain call');
      }))), ...native.tools],
    activeToolNames: [...native.activeToolNames()],
  }, BACKGROUND_CONTEXT);
  f.after(async () => { await harness.close(BACKGROUND_CONTEXT); await session.release(BACKGROUND_CONTEXT); });
  const lane = await harness.lane('main', BACKGROUND_CONTEXT);
  native.bindActiveTools(lane);
  assert.equal((await lane.prompt('切组后读文稿', undefined, BACKGROUND_CONTEXT)).ok, true);
  assert.match(JSON.stringify(f.http.requests.at(-1)?.body), /The opening scene/);

});

test('C28 · lane hides preview while the external contract retains it', () => {
  assert.equal(plan().schema.safeParse({ operation: 'preview', operationId: 'op-one' }).success, false);
  const schema = toModelVisibleSchema(plan().schema, { toolName: plan().name });
  assert.doesNotMatch(JSON.stringify(schema), /preview/);
  assert.equal(generationPlanInputSchema.safeParse({ operation: 'preview', operationId: 'op-one' }).success, true);
});
