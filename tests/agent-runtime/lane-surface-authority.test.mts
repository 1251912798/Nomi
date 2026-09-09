import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import type { LaneComposerContext } from '../../electron/shared/agentLane/laneDesktopContracts.js';
import { createLaneFixture } from './laneFixture.mjs';

for (const contractId of ['canvas.delete', 'canvas.write', 'timeline.write', 'document.write']) {
  for (const target of [undefined, { kind: 'document' as const, documentId: 'doc', anchor: { kind: 'whole-document' as const } }, { kind: 'canvas' as const, nodeIds: [] }]) {
    test(`${contractId} checks consumed target ${target?.kind ?? 'missing'} before preparation`, async t => {
      const fixture = await createLaneFixture(t, [
        { type: 'tool', calls: [{ id: 'surface-call', name: 'mutate_surface', arguments: {} }] },
        { type: 'text', text: 'Done.' },
      ]);
      const context: LaneComposerContext = { approvalPolicy: { mode: 'safe-auto', spend: 'confirm' }, ...(target ? { target } : {}) };
      let preparations = 0;
      let executions = 0;
      const expectedAllowed = target?.kind === contractId.split('.')[0];
      const lane = await fixture.openLane({ ...fixture.options,
        input: { capture: () => context, activate: () => {}, rewritePayload: payload => payload,
          providerContent: async message => message.content },
        tools: [{ name: 'mutate_surface', contractId, description: 'Mutate a surface.', promptSnippet: 'Mutate a surface.',
          schema: z.object({}), examples: [], effects: { mutates: true, billable: false, reversal: 'none' },
          execution: { timeoutMs: 30_000 }, execute: async () => { executions++; return { ok: true, text: "applied" }; } }],
        toolLifecycle: { prepare: async () => { preparations++; }, approved: async () => {}, settled: () => {} },
      });
      await lane.execute({ kind: 'prompt', text: 'Mutate the selected surface.' });
      assert.equal(executions, expectedAllowed ? 1 : 0);
      assert.equal(preparations, expectedAllowed ? 1 : 0);
      const result = (fixture.http.requests[1]?.body as { messages: Array<{ role: string; tool_call_id?: string }> }).messages.find((m: { role: string; tool_call_id?: string }) => m.role === 'tool' && m.tool_call_id === 'surface-call');
      assert.ok(result, 'The model receives an actual tool result');
      assert.match(JSON.stringify(result), expectedAllowed ? /applied/ : /surface_authority_denied/);
    });
  }
}
