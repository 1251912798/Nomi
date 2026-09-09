import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseLegacySource } from '../../electron/agentLane/laneLegacySources.js';
import { readRecordedConversations } from './replayShadowSources.mjs';

const pi = (entries: unknown[], leafId: string | null = null) => ({
  format: 'nomi.pi-work-context', version: 1, piVersion: '0.85.1',
  data: { header: { type: 'session', version: 3 }, entries, leafId }, sha256: 'not-yet-validated',
});

test('pi decoder retains ordered raw settings, branches, pending messages and unknown values', () => {
  const raw = pi([{ id: 'a', type: 'model_change', modelId: 'old' }, null,
    { id: 'b', type: 'message', message: { role: 'assistant', stopReason: 'pending', content: [] } }], 'b');
  const result = parseLegacySource('pi-snapshot', JSON.stringify(raw));
  assert.equal(result.status, 'decoded');
  assert.deepEqual(result.raw, raw);
  assert.deepEqual(result.conversations[0].items.map(item => item.sourceIndex), [0, 1, 2]);
  assert.deepEqual(result.conversations[0].items.map(item => item.raw), raw.data.entries);
});

test('context records preserve empty/cleared authority and unsupported v3 records', () => {
  const raw = { version: 4, records: {
    a: { state: 'ready', sessionKey: 'session', threadId: 'a', snapshot: JSON.stringify(pi([null])) },
    b: { state: 'cleared', sessionKey: 'session', threadId: 'b' },
    c: { state: 'ready', sessionKey: 'session', threadId: 'c' },
  } };
  const result = parseLegacySource('pi-snapshot', JSON.stringify(raw));
  assert.deepEqual(result.conversations.map(item => [item.threadId, item.state, item.items.length]),
    [['a', 'ready', 1], ['b', 'cleared', 0], ['c', 'empty', 0]]);
  assert.deepEqual(result.conversations[0].raw, raw.records.a);
  const old = { version: 3, records: { unbound: { snapshot: 'opaque', unknown: true } } };
  assert.deepEqual(parseLegacySource('pi-snapshot', JSON.stringify(old)).conversations[0].items[0].raw, old.records.unbound);
  assert.equal(parseLegacySource('pi-snapshot', JSON.stringify(old)).conversations[0].state, 'unsupported');
});

test('AI SDK decoder preserves null results, mixed content and empty sessions without mutation', () => {
  const raw = { sessions: { a: [{ role: 'user', content: [{ type: 'file', data: 'never-read' }] },
    { role: 'tool', content: [{ type: 'tool-result', result: null, output: 'must-not-substitute' }] }, false], b: [] } };
  for (const kind of ['agent-chat-v2', 'pi-snapshot'] as const) {
    const envelope = kind === 'pi-snapshot' ? { version: 2, ...raw } : raw;
    const result = parseLegacySource(kind, JSON.stringify(envelope));
    assert.deepEqual(result.conversations[0].items.map(item => item.raw), raw.sessions.a);
    assert.equal(result.conversations[1].state, 'empty');
  }
});

test('host decoder separates threads, keeps original global indices and never sorts timestamps', () => {
  const raw = { state: { threads: [{ threadId: 'a' }, { threadId: 'b' }, { threadId: 'empty' }], items: [
    { threadId: 'b', kind: 'assistant', text: 'later array first', createdAt: '2099' },
    { threadId: 'a', kind: 'tool', extra: { intact: true }, createdAt: '2000' },
    { threadId: 'b', kind: 'proposal', createdAt: '1999' }, null,
  ] } };
  const result = parseLegacySource('host-snapshot', JSON.stringify(raw));
  assert.deepEqual(result.conversations.find(item => item.threadId === 'b')?.items.map(item => item.sourceIndex), [0, 2]);
  assert.equal(result.conversations.find(item => item.threadId === 'empty')?.state, 'empty');
  assert.deepEqual(result.conversations.flatMap(item => item.items).sort((a, b) => a.sourceIndex - b.sourceIndex).map(item => item.raw), raw.state.items);
});

test('empty, malformed, unsupported and invalid UTF-8 are explicit, never successful empty history', () => {
  assert.equal(parseLegacySource('agent-chat-v2', '{"sessions":{}}').status, 'decoded');
  assert.equal(parseLegacySource('agent-chat-v2', '').status, 'invalid');
  assert.equal(parseLegacySource('agent-chat-v2', new Uint8Array([0xff])).status, 'invalid');
  assert.equal(parseLegacySource('agent-chat-v2', '{"somethingElse":[]}').status, 'unsupported');
  assert.equal(parseLegacySource('pi-snapshot', '{"version":4,"records":{"a":{"state":"ready","snapshot":"{"}}}').status, 'invalid');
});

test('L2 uses the shared decoder for all three file shapes and does not mix host threads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nomi-legacy-source-'));
  try {
    const projectsRoot = join(root, 'projects'); const hostRoot = join(root, 'host');
    const project = join(projectsRoot, 'fixture', '.nomi'); const partition = join(hostRoot, 'fixture');
    await mkdir(project, { recursive: true }); await mkdir(partition, { recursive: true });
    await writeFile(join(project, 'agent-thread-context-v1.json'), JSON.stringify({ version: 4, records: {
      a: { state: 'ready', threadId: 'a', snapshot: JSON.stringify(pi([
        { type: 'message', message: { role: 'user', content: 'pi' } },
        { type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: 'pi reply' }] } },
      ])) },
    } }));
    await writeFile(join(project, 'agent-session.json'), JSON.stringify({ sessions: { a: [
      { role: 'assistant', content: 'sdk reply' },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call', result: null, output: 'wrong' }] },
    ] } }));
    await writeFile(join(partition, 'snapshot-v1.json'), JSON.stringify({ state: { items: [
      { threadId: 'a', kind: 'assistant', text: 'host a' },
      { threadId: 'b', kind: 'assistant', text: 'host b' },
    ] } }));
    const result = await readRecordedConversations({ projectsRoot, hostRoot });
    assert.equal(result.conversations.length, 4);
    assert.deepEqual(result.scans.map(scan => scan.turns), [1, 1, 2]);
    assert.deepEqual(result.scans.map(scan => scan.unreadable), [[], [], []]);
    assert.equal(result.conversations.find(item => item.sourceKind === 'agent-chat-v2')?.messages[1].role, 'toolResult');
    assert.deepEqual(result.conversations.find(item => item.sourceKind === 'agent-chat-v2')?.messages[1],
      { role: 'toolResult', toolCallId: 'call', toolName: 'unknown', text: 'null', isError: false });
  } finally { await rm(root, { recursive: true, force: true }); }
});
