import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { stableProjectAgentJson } from '../../electron/shared/legacyAgentJson.js';
import { parseLegacySource, type LegacySourceKind } from '../../electron/agentLane/laneLegacySources.js';
import { planLegacyImport } from '../../electron/agentLane/laneLegacyImportPlan.mjs';
import { projectLaneSnapshot } from '../../electron/shared/agentLane/laneProjection.js';
import { createLaneFixture } from './laneFixture.mjs';
import { openProbeLane, PROBE_CONTEXT } from './stage3ProbeHarness.mjs';

const binding = { projectId: 'fixture', immutableProjectUuid: '12345678-1234-4234-8234-123456789abc', projectGeneration: 1 };
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const labels = { summaryPrefix: 'Legacy summary: ', unverifiedToolResult: 'Legacy tool outcome is unverified.' };
const source = (kind: LegacySourceKind, value: unknown) => parseLegacySource(kind, JSON.stringify(value));
function host(items: unknown[]) {
  const state = { binding, hostRevision: 0, commandLedgerHighWater: 0,
    threads: [{ threadId: 'a' }, { threadId: 'b' }], items };
  const base = { schemaVersion: 1, binding, hostRevision: 0, state,
    commandLedger: { highWater: 0, byteOffset: 0, headChecksum: hash('nomi-project-agent-command-ledger:v1\0empty') } };
  return source('host-snapshot', { ...base, checksum: hash(stableProjectAgentJson(base)) });
}
function nativeSource() {
  const timestamp = '2026-09-08T00:00:00.000Z';
  const data = { header: { type: 'session', version: 3, id: 'fixture', timestamp, cwd: '/fixture' },
    entries: [
      { type: 'message', id: 'u', parentId: null, timestamp, message: { role: 'user', content: 'original', timestamp: 999 } },
      { type: 'compaction', id: 'c', parentId: 'u', timestamp, summary: 'retained summary', firstKeptEntryId: 'u', tokensBefore: 4 },
      { type: 'message', id: 'sibling', parentId: 'u', timestamp, message: { role: 'user', content: 'inactive', timestamp: 1 } },
      { type: 'session_info', id: 'info', parentId: 'c', timestamp, name: 'old name' },
    ], leafId: 'info' };
  return source('pi-snapshot', { format: 'nomi.pi-work-context', version: 1, piVersion: '0.85.1',
    data, sha256: hash(JSON.stringify(data)) });
}

test('host plan preserves array order and N+T including empty assistant and non-executable task', () => {
  const result = planLegacyImport([host([
    { threadId: 'a', kind: 'user', text: 'first', createdAt: '2099-01-01' },
    { threadId: 'a', kind: 'assistant', text: '', createdAt: '2000-01-01' },
    { threadId: 'a', kind: 'tool', toolCallId: 'old-call', capability: { id: 'document.read' }, status: 'stopped', text: 'partial' },
    { threadId: 'a', kind: 'task', task: { kind: 'production-run', runId: 'must-not-execute' } },
  ])], binding, labels);
  const conversation = result.conversations.find(item => item.key === 'host:a')!;
  assert.equal(conversation.expectedParts, 5);
  assert.deepEqual(conversation.operations.map(op => op.sourceIndex), [0, 1, 2, 2, 3]);
  assert.deepEqual(conversation.operations.map(op => op.type === 'message' ? op.message.role : op.customType),
    ['user', 'assistant', 'assistant', 'toolResult', 'nomi.ui.legacy']);
  const outcome = conversation.operations[3];
  assert.ok(outcome.type === 'message' && outcome.message.role === 'toolResult');
  assert.equal(outcome.message.isError, true);
  assert.match(JSON.stringify(outcome.message.content), /unverified/);
});

test('cleared bound v4 suppresses only its own host thread; unrelated AI SDK sessions stay independent', () => {
  const sessionKey = `nomi:project-agent:${binding.immutableProjectUuid}:g1`;
  const context = source('pi-snapshot', { version: 4, records: {
    [hash(JSON.stringify([sessionKey, 'a']))]: { project: binding, sessionKey, threadId: 'a', source: 'native', state: 'cleared' },
  } });
  const plan = planLegacyImport([host([{ threadId: 'a', kind: 'user', text: 'never revive' },
    { threadId: 'b', kind: 'user', text: 'keep' }]), context,
  source('agent-chat-v2', { sessions: { a: [{ role: 'user', content: 'independent' }] } })], binding, labels);
  assert.equal(plan.suppressed.length, 1);
  assert.equal(plan.conversations.some(item => item.key === 'host:a'), false);
  assert.equal(plan.conversations.find(item => item.sourceKind === 'pi-snapshot')?.operations.length, 0);
  assert.equal(plan.conversations.find(item => item.key === 'host:b')?.operations.length, 1);
  assert.equal(plan.conversations.find(item => item.sourceKind === 'agent-chat-v2')?.operations.length, 1);
});

test('AI SDK preserves explicit null output and mixed assistant parts, archives orphan and unknown content', () => {
  const plan = planLegacyImport([source('agent-chat-v2', { sessions: { a: [
    { role: 'assistant', content: [{ type: 'text', text: 'before' }, { type: 'reasoning', text: 'think' },
      { type: 'tool-call', toolCallId: 'c', toolName: 'read', args: {} }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c', toolName: 'read', result: null, output: 'wrong' }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'orphan', toolName: 'read', result: 'untrusted' }] },
    { role: 'user', content: [{ type: 'file', data: 'file:///never-read' }] },
  ] } })], binding, labels).conversations[0];
  assert.deepEqual(plan.operations.map(op => op.sourceIndex), [0, 1, 2, 3]);
  assert.equal(plan.expectedParts, 6);
  const output = plan.operations[1];
  assert.ok(output.type === 'message' && output.message.role === 'toolResult');
  assert.deepEqual(output.message.content, [{ type: 'text', text: 'null' }]);
  assert.equal(plan.operations[2].type, 'custom');
  assert.equal(plan.operations[3].type, 'custom');
});

test('dangling and duplicate calls are inert, and invalid sources cannot fall back to host', () => {
  const call = { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'same', toolName: 'read', args: {} }] };
  const plan = planLegacyImport([source('agent-chat-v2', { sessions: { a: [call, call] } })], binding, labels);
  assert.deepEqual(plan.conversations[0].operations.map(op => op.type), ['custom', 'custom']);
  assert.throws(() => planLegacyImport([source('pi-snapshot', {}), host([])], binding, labels));
});

test('native summaries stay at their original position and inactive siblings never enter model context', () => {
  const plan = planLegacyImport([nativeSource()], binding, labels).conversations[0];
  assert.equal(plan.expectedParts, 5);
  assert.deepEqual(plan.operations.map(op => op.sourceIndex), [0, 1, 1, 2, 3]);
  assert.deepEqual(plan.operations.flatMap(op => op.type === 'message' && op.message.role === 'user' ? [op.message.content] : []),
    ['original', 'Legacy summary: retained summary']);
  assert.equal(plan.facts.summaries, true);
  assert.equal(plan.facts.archivedItems, true);
});

test('unknown native payloads remain raw notes while their validated branch structure retains position', () => {
  const raw = structuredClone(nativeSource().raw) as { data: { entries: Array<Record<string, unknown>> }; sha256: string };
  raw.data.entries[0].message = { role: 'future-role', payload: { intact: true } };
  raw.data.entries[3].type = 'future-entry';
  raw.sha256 = hash(JSON.stringify(raw.data));
  const plan = planLegacyImport([source('pi-snapshot', raw)], binding, labels).conversations[0];
  const first = plan.operations[0];
  assert.equal(first.type, 'custom');
  if (first.type === 'custom') assert.deepEqual((first.data as { raw: unknown }).raw, raw.data.entries[0]);
  assert.equal(plan.operations.at(-1)?.type, 'custom');
  assert.deepEqual(plan.operations.map(op => op.sourceIndex), [0, 1, 1, 2, 3]);
});

test('one invalid result in a multi-call message archives the entire connected group without orphaning its siblings', () => {
  const plan = planLegacyImport([source('agent-chat-v2', { sessions: { a: [
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'a', toolName: 'read', args: {} },
      { type: 'tool-call', toolCallId: 'b', toolName: 'read', args: {} }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'a', toolName: 'read', result: 'ok' },
      { type: 'tool-result', toolCallId: 'b', toolName: 'wrong-name', result: 'bad' }] },
  ] } })], binding, labels).conversations[0];
  assert.deepEqual(plan.operations.map(op => [op.type, op.sourceIndex]), [['custom', 0], ['custom', 1]]);
});

test('all three sources use real public append APIs and retain part counts/order after cold reopen with zero requests', async t => {
  const inputs = [nativeSource(), host([
    { threadId: 'a', kind: 'user', text: 'first', createdAt: '2099-01-01' },
    { threadId: 'a', kind: 'assistant', text: '', createdAt: '2000-01-01' },
    { threadId: 'a', kind: 'tool', capability: { id: 'legacy.read' }, status: 'done', text: 'historical summary' },
  ]), source('agent-chat-v2', { sessions: { a: [{ role: 'user', content: 'hello' },
    { role: 'assistant', content: [{ type: 'text', text: 'reply' }, { type: 'reasoning', text: 'reason' }] }] } })];
  for (const input of inputs) await t.test(input.kind, async st => {
    const plan = planLegacyImport([input], binding, labels).conversations[0];
    const fixture = await createLaneFixture(st, []);
    const opened = await openProbeLane(fixture, fixture.options);
    for (const op of plan.operations) {
      if (op.type === 'message') await opened.lane.appendMessage(op.message, PROBE_CONTEXT);
      else await opened.lane.appendCustomEntry(op.customType, op.data, PROBE_CONTEXT);
    }
    const watch = await opened.lane.watch(PROBE_CONTEXT);
    const before = projectLaneSnapshot(watch.snapshot, opened.modelFacts).parts;
    assert.equal(before.length, plan.expectedParts);
    assert.deepEqual(before.map(part => part.sequence), before.map((_, index) => index));
    watch.unsubscribe();
    await opened.close();
    const reopened = await openProbeLane(fixture, fixture.options, { sessionId: opened.sessionId });
    const cold = await reopened.lane.watch(PROBE_CONTEXT);
    assert.deepEqual(projectLaneSnapshot(cold.snapshot, reopened.modelFacts).parts, before);
    assert.equal(fixture.http.requests.length, 0);
    cold.unsubscribe();
  });
});
