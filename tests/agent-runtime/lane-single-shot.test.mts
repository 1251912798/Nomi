import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { runLaneSingleShot } from '../../electron/agentLane/laneSingleShot.mjs';
import { createLaneFixture } from './laneFixture.mjs';

for (const kind of ['openai-compatible', 'openai-responses', 'anthropic'] as const) {
  test(`single-shot ${kind}: isolated request, no tools or disk transcript`, async (t) => {
    const fixture = await createLaneFixture(t, [{ type: 'text', text: 'first' }, { type: 'text', text: 'second' }]);
    const model = { ...fixture.options.model, kind };
    const first = await runLaneSingleShot({ model, prompt: 'independent first' });
    const second = await runLaneSingleShot({ model, prompt: 'independent second' });
    assert.equal(fixture.http.requests.length, 2);
    for (const request of fixture.http.requests) assert.ok(!request.body.tools || (request.body.tools as unknown[]).length === 0);
    assert.ok(!JSON.stringify(fixture.http.requests[1].body).includes('independent first'));
    assert.deepEqual(first.parts.filter((part) => part.kind === 'assistant-text').map((part) => part.text), ['first']);
    assert.deepEqual(second.parts.filter((part) => part.kind === 'assistant-text').map((part) => part.text), ['second']);
    assert.deepEqual(await readdir(fixture.projectDir), []);
  });
}

for (const kind of ['openai-compatible', 'openai-responses', 'anthropic'] as const) {
  test(`single-shot ${kind} disables retries on provider failure`, async (t) => {
    const fixture = await createLaneFixture(t, [{ type: 'error', status: 503, message: 'one failure' }]);
    const result = await runLaneSingleShot({ model: { ...fixture.options.model, kind }, prompt: 'once only' });
    assert.equal(fixture.http.requests.length, 1);
    assert.ok(result.parts.some((part) => part.kind === 'error' && part.text.includes('one failure')));
  });

  test(`${kind}: a hallucinated tool cannot execute or obtain a second request`, async (t) => {
    const fixture = await createLaneFixture(t, [{ type: 'tool', calls: [{ id: 'unexpected', name: 'write_document', arguments: { content: 'overwrite' } }] }]);
    const result = await runLaneSingleShot({ model: { ...fixture.options.model, kind }, prompt: 'only answer' });
    assert.equal(fixture.http.requests.length, 1);
    assert.equal(fixture.document.text(), 'The opening scene.');
    assert.ok(result.parts.some((part) => part.kind === 'tool-call'));
    assert.ok(!result.parts.some((part) => part.kind === 'tool-result'));
  });
}

test('multimodal input uses the shared main-side input resolver', async (t) => {
  const fixture = await createLaneFixture(t, [{ type: 'text', text: 'image seen' }]);
  let activated = false;
  const captured = { approvalPolicy: { mode: 'step', spend: 'confirm' }, attachments: [{ assetId: 'frame', version: 1 }] } as const;
  await runLaneSingleShot({ model: fixture.options.model, prompt: 'inspect frame', input: {
    capture: () => captured,
    activate: (value) => { assert.equal(value, captured); activated = true; },
    providerContent: async (message) => {
      assert.equal(activated, true);
      assert.deepEqual(message.context.attachments, captured.attachments);
      return [{ type: 'text', text: message.content }, { type: 'image', data: 'cG5n', mimeType: 'image/png' }];
    },
    rewritePayload: (payload) => payload,
  } });
  const body = JSON.stringify(fixture.http.requests[0].body);
  assert.ok(body.includes('data:image/png;base64,cG5n'));
  assert.ok(body.includes('inspect frame'));
});

test('abort terminates only this isolated request', async (t) => {
  const controller = new AbortController();
  const fixture = await createLaneFixture(t, [{ type: 'text', text: 'partial', beforeFinish: async () => { controller.abort(); } }]);
  await assert.rejects(runLaneSingleShot({ model: fixture.options.model, prompt: 'cancel me', signal: controller.signal }), { name: 'AbortError' });
  assert.equal(fixture.http.requests.length, 1);
});
