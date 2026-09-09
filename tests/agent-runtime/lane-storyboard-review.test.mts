import assert from 'node:assert/strict';
import test from 'node:test';
import { openLane } from '../../electron/agentLane/laneHost.mjs';
import { createCanvasLaneTools } from '../../electron/agentLane/laneCanvasTools.js';
import type { CanvasWriteInput, CanvasWriteResult } from '../../electron/shared/agentCapabilities/canvasWrite.js';
import { createLaneFixture } from './laneFixture.mjs';

const inputs = [
  { operation: 'propose_storyboard_plan', title: 'Fixture plan', anchors: [],
    shots: [{ index: 1, shotKind: 'image', durationSec: 0, anchorIds: [], prompt: 'Fixture sunrise.' }] },
  { operation: 'patch_shots', select: { kind: 'indexes', indexes: [1] }, patch: { prompt: 'Reviewed fixture prompt.' } },
] as const;

function applied(input: CanvasWriteInput): CanvasWriteResult {
  const common = { applied: true as const, proposalId: 'fixture-proposal', reconciliation: { ok: true, deviationCount: 0 } };
  if (input.operation === 'propose_storyboard_plan') return { ...common, operation: input.operation, result: { persisted: true } };
  if (input.operation === 'patch_shots') return { ...common, operation: input.operation, changedShotIndexes: [1], changedFields: ['prompt'], result: { persisted: true } };
  return { ...common, operation: 'set_node_prompt', affectedNodeIds: ['fixture-node'] };
}

for (const input of inputs) {
  test(`safe-auto waits for a fresh review before ${input.operation} and cannot remember that approval`, async (t) => {
    const fixture = await createLaneFixture(t, [
      { type: 'tool', calls: [{ id: 'fixture-review', name: 'nomi_storyboard_write', arguments: input }] },
      { type: 'text', text: 'Fixture complete.' },
    ], { hasUserInterface: true, policy: () => ({ mode: 'safe-auto', spend: 'confirm' }) });
    let writes = 0;
    const lane = await openLane({ ...fixture.options, tools: createCanvasLaneTools({
      read: async () => { throw new Error('Fixture does not read.'); },
      write: async (value) => { writes += 1; return applied(value); },
    }) });
    const pending = new Promise<void>((resolve) => {
      const stop = lane.subscribe((projection) => { if (projection.pending) { stop(); resolve(); } });
    });
    const run = lane.execute({ kind: 'prompt', text: 'Prepare the fixture storyboard edit.' });
    try {
      await Promise.race([pending, run]);
      assert.equal(writes, 0, 'A plan must remain unmodified until the user reviews this exact proposal.');
      assert.equal(lane.projection().pending?.toolCallId, 'fixture-review');
      assert.equal(lane.projection().pending?.grantable, false);
      await assert.rejects(lane.execute({ kind: 'approval', toolCallId: 'fixture-review', action: 'allow-session' }));
      assert.equal(writes, 0);
      await lane.execute({ kind: 'approval', toolCallId: 'fixture-review', action: 'allow-once' });
      await run;
      assert.equal(writes, 1);
    } finally {
      await lane.execute({ kind: 'abort' });
      await run.catch(() => undefined);
      await lane.close();
    }
  });
}

test('safe-auto still executes an ordinary local canvas prompt edit without a review card', async (t) => {
  const fixture = await createLaneFixture(t, [
    { type: 'tool', calls: [{ id: 'fixture-local-write', name: 'nomi_canvas_write',
      arguments: { operation: 'set_node_prompt', nodeId: 'fixture-node', prompt: 'Fixture local edit.' } }] },
    { type: 'text', text: 'Fixture complete.' },
  ], { hasUserInterface: true, policy: () => ({ mode: 'safe-auto', spend: 'confirm' }) });
  let writes = 0, cards = 0;
  const lane = await openLane({ ...fixture.options, tools: createCanvasLaneTools({
    read: async () => { throw new Error('Fixture does not read.'); },
    write: async (input) => { writes += 1; return applied(input); },
  }) });
  try {
    lane.subscribe((projection) => { if (projection.pending) cards += 1; });
    await lane.execute({ kind: 'prompt', text: 'Edit the fixture node prompt.' });
    assert.equal(writes, 1);
    assert.equal(cards, 0);
  } finally { await lane.close(); }
});
