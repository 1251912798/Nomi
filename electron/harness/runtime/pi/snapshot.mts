import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SessionManager, type AgentSession } from '@earendil-works/pi-coding-agent';
import { legacyPiDigest as digest, validateLegacyPiData as validateData, validateLegacyPiEnvelope } from '../../../shared/agentLane/legacyPiSnapshot.mjs';

export type SnapshotSource = Pick<AgentSession, 'sessionManager' | 'isIdle' | 'isCompacting'>;

// The legacy writer only emits the running version. The shared read-only codec
// owns which existing versions remain readable after this runtime is removed.
const WRITTEN_PI_VERSION = '0.85.1';

export function exportSnapshot(source: SnapshotSource): string {
  if (!source.isIdle || source.isCompacting) throw new Error('Snapshot requires a stable, idle session');
  const data = {
    header: source.sessionManager.getHeader(),
    entries: source.sessionManager.getEntries(),
    leafId: source.sessionManager.getLeafId(),
  };
  validateData(data);
  return JSON.stringify({ format: 'nomi.pi-work-context', version: 1, piVersion: WRITTEN_PI_VERSION, data, sha256: digest(data) });
}

// pi (0.84.3 and 0.85.1 alike) has no fromSnapshot/storage-adapter API on this
// legacy seam. Use its public in-memory
// manager + file loader, then restore the separate leaf pointer. Never replay tools.
export async function importSnapshot(
  serialized: string,
  options: { cwd: string; tempRoot: string },
): Promise<SessionManager> {
  const data = validateLegacyPiEnvelope(JSON.parse(serialized));
  const materializationDir = await mkdtemp(join(options.tempRoot, 'nomi-pi-snapshot-'));
  try {
    const file = join(materializationDir, 'context.jsonl');
    await writeFile(file, [data.header, ...data.entries].map((entry) => JSON.stringify(entry)).join('\n') + '\n',
      { mode: 0o600, flag: 'wx' });
    const manager = SessionManager.inMemory(options.cwd);
    manager.setSessionFile(file);
    if (data.leafId === null) manager.resetLeaf();
    else manager.branch(data.leafId);
    // pi's loader can migrate/skip malformed entries. A version-locked cache must
    // not silently become a different transcript when that happens.
    if (digest(manager.getEntries()) !== digest(data.entries)) throw new Error('Snapshot entries changed during restore');
    return manager;
  } finally {
    await rm(materializationDir, { recursive: true, force: true });
  }
}
