import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { AgentHarness, reduceLaneSnapshot, type LaneSnapshot } from '@earendil-works/pi-agent-core';
import { BACKGROUND_CONTEXT } from '@earendil-works/pi-agent-core/harness/context';
import { createModels } from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import { findLaneReceiptAuthority } from '../../electron/agentLane/laneReceiptAuthority.mjs';
import { LANE_RECEIPT_AUTHORITY_NOTE } from '../../electron/shared/agentLane/laneReceiptAuthority.js';
import { createNomiProvider } from '../../electron/agentLane/laneModelProvider.mjs';
import { openLaneSession } from '../../electron/agentLane/laneSession.mjs';
import { projectLaneSnapshot } from '../../electron/shared/agentLane/laneProjection.js';
import { createHttpFixture } from './httpFixture.mjs';

const authority = { receiptProposalId: 'fixture-receipt', approvalId: 'fixture-approval', actionHash: 'fixture-action-hash' };
const note = { ...authority, toolCallId: 'fixture-call' };
type ReceiptSnapshot = Pick<LaneSnapshot, 'transcript' | 'queues'>;
const customEntry = (id: string, data = note): LaneSnapshot['transcript'][number] => ({
  id, parentId: null, seq: 1, timestamp: 0, type: 'custom', customType: LANE_RECEIPT_AUTHORITY_NOTE, data,
});
const queuedEntry = (entryId: string, data: unknown = note): LaneSnapshot['queues'][number] => ({
  entryId, kind: 'write', type: 'custom', customType: LANE_RECEIPT_AUTHORITY_NOTE,
  data: data as Extract<LaneSnapshot['queues'][number], { type: 'custom' }>['data'],
});

test('a real before_tool durable authority is queryable inside execute and after cold reopen', async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), 'nomi-receipt-authority-'));
  const http = await createHttpFixture([
    { type: 'tool', calls: [{ id: 'fixture-call', name: 'receipt_probe', arguments: {} }] },
    { type: 'text', text: 'Fixture complete.' },
  ]);
  const ctx = BACKGROUND_CONTEXT;
  let first: Awaited<ReturnType<typeof open>> | undefined;
  let reopened: Awaited<ReturnType<typeof open>> | undefined;
  let executionAuthority: ReturnType<typeof findLaneReceiptAuthority>;
  let queuedWhileExecuting = false;
  const configured = await createNomiProvider({ kind: 'openai-compatible', providerId: 'fixture', modelId: 'fixture',
    baseURL: http.baseURL, authType: 'api-key', apiKey: 'fixture' });
  const models = createModels({ credentials: configured.credentials });
  models.setProvider(configured.provider);
  async function open(sessionId?: string) {
    const opened = await openLaneSession({ projectDir, laneName: 'main', sessionId }, ctx);
    const { harness } = await AgentHarness.create({ session: opened.session, models, model: configured.model,
      systemPrompt: 'Receipt fixture.', tools: [{ name: 'receipt_probe', label: 'Fixture', description: 'Fixture.',
        parameters: Type.Object({}), execute: async () => {
          const snapshot = first!.snapshot;
          queuedWhileExecuting = snapshot.queues.some((entry) => entry.type === 'custom' && entry.customType === LANE_RECEIPT_AUTHORITY_NOTE);
          executionAuthority = findLaneReceiptAuthority(snapshot, authority.receiptProposalId);
          assert.deepEqual(executionAuthority, authority, 'Renderer receipt preparation needs this authority before the tool finishes.');
          assert.equal(projectLaneSnapshot(snapshot, { pricing: 'unpriced', supportedThinkingLevels: ['off'] }).parts
            .filter((part) => part.kind === 'host-note' && part.noteType === LANE_RECEIPT_AUTHORITY_NOTE).length, 0);
          return { content: [{ type: 'text' as const, text: 'Fixture result.' }], details: {} };
        } }] }, ctx);
    const lane = await harness.lane('main', ctx);
    const watch = await lane.watch(ctx);
    const snapshot = watch.snapshot;
    watch.start((event) => { reduceLaneSnapshot(snapshot, event); });
    return { lane, harness, snapshot, sessionId: opened.sessionId,
      close: async () => { watch.unsubscribe(); await harness.close(ctx); await opened.session.close(ctx); await opened.release(ctx); } };
  }
  try {
    first = await open();
    first.harness.hooks.on('before_tool', async (_event, context) => {
      await first!.lane.appendCustomEntry(LANE_RECEIPT_AUTHORITY_NOTE, note, context);
      return undefined;
    });
    await first.lane.prompt('Run the receipt fixture.', undefined, ctx);
    assert.equal(queuedWhileExecuting, true, 'The fixture must exercise the real queued-write boundary.');
    assert.deepEqual(executionAuthority, authority);
    assert.deepEqual(findLaneReceiptAuthority(first.snapshot, authority.receiptProposalId), authority);
    assert.equal(first.snapshot.queues.length, 0);
    const sessionId = first.sessionId;
    await first.close();
    first = undefined;
    reopened = await open(sessionId);
    assert.deepEqual(findLaneReceiptAuthority(reopened.snapshot, authority.receiptProposalId), authority);
  } finally {
    await first?.close();
    await reopened?.close();
    await http.close();
    await rm(projectDir, { recursive: true, force: true });
  }
});

test('one persisted entry is counted once across transcript and queued writes without mutating either', () => {
  const snapshot: ReceiptSnapshot = { transcript: [customEntry('same-entry')], queues: [queuedEntry('same-entry')] };
  const original = structuredClone(snapshot);
  assert.deepEqual(findLaneReceiptAuthority(snapshot, authority.receiptProposalId), authority);
  assert.deepEqual(snapshot, original);
  snapshot.queues.push(queuedEntry('different-entry'));
  assert.throws(() => findLaneReceiptAuthority(snapshot, authority.receiptProposalId), /lane_receipt_authority_ambiguous/);
});

test('conflicting entry identities fail closed and unrelated valid authorities do not authorize a proposal', () => {
  const snapshot: ReceiptSnapshot = { transcript: [customEntry('same-entry')],
    queues: [queuedEntry('same-entry', { ...note, approvalId: 'different-approval' })] };
  assert.throws(() => findLaneReceiptAuthority(snapshot, authority.receiptProposalId), /lane_receipt_authority_conflict/);
  assert.equal(findLaneReceiptAuthority({ transcript: [], queues: [queuedEntry('entry')] }, 'other-receipt'), undefined);
  const unrelated: ReceiptSnapshot = { transcript: [{ ...customEntry('other'), customType: 'nomi.ui.task' }], queues: [] };
  assert.equal(findLaneReceiptAuthority(unrelated, authority.receiptProposalId), undefined);
});

test('malformed queued authority fields and invalid proposal identities fail closed', () => {
  for (const data of [null, [], {}, { ...note, approvalId: '' }, { ...note, actionHash: 1 },
    { ...note, approvalId: ' padded ' }, { ...note, toolCallId: '' }, { ...note, extra: true },
    { ...note, receiptProposalId: 'x'.repeat(513) }]) {
    assert.throws(() => findLaneReceiptAuthority({ transcript: [], queues: [queuedEntry('entry', data)] }, authority.receiptProposalId), /lane_receipt_authority_invalid/);
  }
  assert.throws(() => findLaneReceiptAuthority({ transcript: [], queues: [] }, ''), /lane_receipt_authority_invalid/);
  assert.throws(() => findLaneReceiptAuthority({ transcript: [], queues: [queuedEntry('')] }, authority.receiptProposalId), /lane_receipt_authority_invalid/);
});
