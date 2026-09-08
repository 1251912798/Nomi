import { createHash } from 'node:crypto';
import { assertProjectAgentBinding, type ProjectBinding } from '../shared/projectBinding.js';
import { stableProjectAgentJson } from '../shared/legacyAgentJson.js';
import { validateLegacyPiEnvelope } from '../shared/agentLane/legacyPiSnapshot.mjs';
import { legacyRecord, type LegacySource, type LegacyConversation } from './laneLegacySources.js';

export interface ValidatedLegacyConversation extends LegacyConversation {
  /** Only v4 records and checksum-validated host threads acquire this identity. */
  readonly boundThreadId?: string;
  readonly activeEntryIds?: ReadonlySet<string>;
}
export interface ValidatedLegacySource extends LegacySource {
  readonly conversations: readonly ValidatedLegacyConversation[];
}

function fail(): never { throw new Error('legacy-source-integrity-or-binding-failed'); }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function requireBinding(value: unknown, expected: ProjectBinding): void {
  const actual = value as ProjectBinding;
  assertProjectAgentBinding(actual);
  if (actual.projectId !== expected.projectId || actual.immutableProjectUuid !== expected.immutableProjectUuid
    || actual.projectGeneration !== expected.projectGeneration) fail();
}
const nonnegative = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

function validateHost(raw: Record<string, unknown>, binding: ProjectBinding): void {
  if (Object.keys(raw).sort().join('|') !== 'binding|checksum|commandLedger|hostRevision|schemaVersion|state'
    || raw.schemaVersion !== 1) fail();
  requireBinding(raw.binding, binding);
  const state = legacyRecord(raw.state); const pointer = legacyRecord(raw.commandLedger);
  if (!state || !pointer) fail();
  requireBinding(state.binding, binding);
  if (!nonnegative(raw.hostRevision) || raw.hostRevision !== state.hostRevision
    || state.commandLedgerHighWater !== raw.hostRevision || pointer.highWater !== raw.hostRevision
    || Object.keys(pointer).sort().join('|') !== 'byteOffset|headChecksum|highWater'
    || !nonnegative(pointer.byteOffset) || typeof pointer.headChecksum !== 'string'
    || !/^[a-f0-9]{64}$/.test(pointer.headChecksum)) fail();
  if (pointer.highWater === 0 && (pointer.byteOffset !== 0
    || pointer.headChecksum !== hash('nomi-project-agent-command-ledger:v1\0empty'))) fail();
  if (pointer.highWater !== 0 && pointer.byteOffset === 0) fail();
  const { checksum, ...base } = raw;
  if (checksum !== hash(stableProjectAgentJson(base))) fail();
  if (!Array.isArray(state.threads) || !Array.isArray(state.items)) fail();
  const ids = new Set<string>();
  for (const value of state.threads) {
    const thread = legacyRecord(value);
    if (typeof thread?.threadId !== 'string' || !thread.threadId.trim() || ids.has(thread.threadId)) fail();
    ids.add(thread.threadId);
  }
  for (const value of state.items) {
    const item = legacyRecord(value);
    if (typeof item?.threadId !== 'string' || !ids.has(item.threadId)) fail();
  }
}

function activePiIds(value: unknown): ReadonlySet<string> {
  const data = validateLegacyPiEnvelope(value);
  const parents = new Map(data.entries.map(entry => [entry.id, entry.parentId]));
  const active = new Set<string>();
  let id = data.leafId;
  while (id !== null) { active.add(id); id = parents.get(id) ?? null; }
  return active;
}

/** All source admission is pure: failures expose no content and never mutate a source. */
function validateSource(source: LegacySource, binding: ProjectBinding): ValidatedLegacySource {
  assertProjectAgentBinding(binding);
  if (source.status !== 'decoded') fail();
  const raw = legacyRecord(source.raw);
  if (!raw) fail();
  if (source.kind === 'host-snapshot') {
    validateHost(raw, binding);
    return { ...source, conversations: source.conversations.map(conversation => ({
      ...conversation, boundThreadId: conversation.threadId,
    })) };
  }
  return { ...source, conversations: source.conversations.map(conversation => {
    if (conversation.format !== 'pi') return conversation;
    const record = legacyRecord(conversation.raw);
    if (!record) fail();
    if (raw.version !== 4) return { ...conversation, activeEntryIds: activePiIds(record) };
    requireBinding(record.project, binding);
    if (typeof record.threadId !== 'string' || !record.threadId.trim() || record.threadId.trim() !== record.threadId
      || record.sessionKey !== `nomi:project-agent:${binding.immutableProjectUuid}:g${binding.projectGeneration}`
      || conversation.key !== hash(JSON.stringify([record.sessionKey, record.threadId]))
      || (record.source !== 'native' && record.source !== 'legacy-limited')) fail();
    return { ...conversation, boundThreadId: record.threadId,
      activeEntryIds: record.snapshot === undefined ? new Set<string>() : activePiIds(JSON.parse(String(record.snapshot))),
    };
  }) };
}

export function validateLegacySource(source: LegacySource, binding: ProjectBinding): ValidatedLegacySource {
  try { return validateSource(source, binding); }
  catch { return fail(); }
}
