import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { parseLegacySource } from '../../electron/agentLane/laneLegacySources.js';
import { validateLegacySource } from '../../electron/agentLane/laneLegacyIntegrity.mjs';
import { stableProjectAgentJson } from '../../electron/projectAgentHost/projectAgentSnapshot.js';

const binding = { projectId: 'fixture', immutableProjectUuid: '12345678-1234-4234-8234-123456789abc', projectGeneration: 1 };
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const timestamp = '2026-09-08T00:00:00.000Z';
const entry = (id: string, parentId: string | null) => ({ type: 'message', id, parentId, timestamp,
  message: { role: 'user', content: id, timestamp: 0 } });
function pi(entries: unknown[] = [entry('a', null)], leafId: string | null = 'a') {
  const data = { header: { type: 'session', version: 3, id: 'fixture', timestamp, cwd: '/fixture' }, entries, leafId };
  return { format: 'nomi.pi-work-context', version: 1, piVersion: '0.85.1', data, sha256: hash(JSON.stringify(data)) };
}
function host() {
  const state = { binding, hostRevision: 0, commandLedgerHighWater: 0,
    threads: [{ threadId: 'a' }], items: [{ threadId: 'a', kind: 'user', text: 'fixture' }] };
  const base = { schemaVersion: 1, binding, hostRevision: 0, state,
    commandLedger: { highWater: 0, byteOffset: 0, headChecksum: hash('nomi-project-agent-command-ledger:v1\0empty') } };
  return { ...base, checksum: hash(stableProjectAgentJson(base)) };
}
const checkPi = (raw: unknown) => validateLegacySource(parseLegacySource('pi-snapshot', JSON.stringify(raw)), binding);
const checkHost = (raw: unknown) => validateLegacySource(parseLegacySource('host-snapshot', JSON.stringify(raw)), binding);

test('integrity rejects altered pi bytes and invalid branch topology before import', () => {
  const altered = pi(); altered.data.entries.push(entry('b', 'a'));
  assert.throws(() => checkPi(altered));
  for (const raw of [pi([entry('a', null), entry('a', 'a')]), pi([entry('a', 'future')]), pi([], 'missing'),
    pi([entry('a', null), { type: 'compaction', id: 'b', parentId: 'a', timestamp,
      summary: 'fixture', firstKeptEntryId: 'absent', tokensBefore: 1 }], 'b')]) {
    assert.throws(() => checkPi(raw));
  }
  const branched = checkPi(pi([entry('a', null), entry('b', 'a'), entry('sibling', 'a')], 'b'));
  assert.deepEqual([...branched.conversations[0].activeEntryIds!], ['b', 'a']);
  assert.equal(branched.conversations[0].boundThreadId, undefined);
  assert.deepEqual(checkPi(pi([], null)).conversations[0].activeEntryIds, new Set());
});

test('v4 checks all binding fields, session key and hashed record key, including cleared records', () => {
  const sessionKey = `nomi:project-agent:${binding.immutableProjectUuid}:g1`;
  const key = hash(JSON.stringify([sessionKey, 'a']));
  const record = { project: binding, sessionKey, threadId: 'a', source: 'native', state: 'cleared' };
  const wrap = (value: unknown, recordKey = key) => ({ version: 4, records: { [recordKey]: value } });
  assert.equal(checkPi(wrap(record)).conversations[0].boundThreadId, 'a');
  assert.throws(() => checkPi(wrap(record, 'wrong')));
  assert.throws(() => checkPi(wrap({ ...record, sessionKey: 'wrong' })));
  for (const project of [{ ...binding, projectId: 'other' }, { ...binding, projectGeneration: 2 },
    { ...binding, immutableProjectUuid: '12345678-1234-4234-8234-123456789abd' }]) {
    assert.throws(() => checkPi(wrap({ ...record, project })));
  }
});

test('host checks canonical checksum, both bindings, revisions and ledger pointer', () => {
  assert.doesNotThrow(() => checkHost(host()));
  const reordered = Object.fromEntries(Object.entries(host()).reverse());
  assert.doesNotThrow(() => checkHost(reordered));
  const corrupt = host(); corrupt.state.items[0].text = 'changed';
  assert.throws(() => checkHost(corrupt));
  for (const mutate of [
    (raw: ReturnType<typeof host>) => { raw.binding = { ...binding, projectGeneration: 2 }; },
    (raw: ReturnType<typeof host>) => { raw.state.binding = { ...binding, projectId: 'other' }; },
    (raw: ReturnType<typeof host>) => { raw.state.hostRevision = 1; },
    (raw: ReturnType<typeof host>) => { raw.commandLedger.byteOffset = 1; },
    (raw: ReturnType<typeof host>) => { raw.commandLedger.highWater = -1; },
    (raw: ReturnType<typeof host>) => { raw.commandLedger.headChecksum = 'a'.repeat(64); },
  ]) {
    const raw = host(); mutate(raw);
    const { checksum: _checksum, ...base } = raw;
    raw.checksum = hash(stableProjectAgentJson(base));
    assert.throws(() => checkHost(raw));
  }
});

test('invalid and unsupported sources do not become valid empty imports', () => {
  assert.throws(() => validateLegacySource(parseLegacySource('agent-chat-v2', ''), binding));
  assert.throws(() => validateLegacySource(parseLegacySource('host-snapshot', '{}'), binding));
  assert.doesNotThrow(() => validateLegacySource(parseLegacySource('agent-chat-v2', '{"sessions":{}}'), binding));
});

test('integrity errors never expose source ids or parser details', () => {
  const privateId = 'private-fixture-marker';
  assert.throws(() => checkPi(pi([entry(privateId, 'missing')], privateId)),
    error => error instanceof Error && error.message === 'legacy-source-integrity-or-binding-failed');
});
