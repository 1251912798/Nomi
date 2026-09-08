import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import type { ProjectBinding } from '../shared/projectBinding.js';
import { stableProjectAgentJson } from '../shared/legacyAgentJson.js';
import type { createLegacyFileAccess } from './laneLegacyFiles.js';

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const sources = z.object({ conversationsHash: z.string().regex(/^[a-f0-9]{64}$/),
  contextHash: z.string().regex(/^[a-f0-9]{64}$/), proposalReceiptHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const evidence = z.object({ schemaVersion: z.literal(1), mode: z.literal('archive-only'),
  binding: z.unknown(), sources });
const timestamp = z.string().refine(value => Number.isFinite(Date.parse(value)));
function fail(): never { throw new Error('legacy-prior-archive-evidence-mismatch'); }

/** Only the exact old cutover pair is evidence. No directory scan or receipt reads. */
export function readLegacyPriorArchive(access: ReturnType<typeof createLegacyFileAccess>, nomi: string, binding: ProjectBinding) {
  try {
    const completeBytes = access.read(join(nomi, 'project-agent-cutover.json'))?.bytes;
    const preparedBytes = access.read(join(nomi, 'project-agent-cutover-preparation.json'))?.bytes;
    if (!completeBytes && !preparedBytes) return;
    if (!completeBytes || !preparedBytes) fail();
    const complete = evidence.extend({ completedAt: timestamp }).strict().parse(JSON.parse(completeBytes.toString()));
    const prepared = evidence.extend({ startedAt: timestamp }).strict().parse(JSON.parse(preparedBytes.toString()));
    if (stableProjectAgentJson(complete.binding) !== stableProjectAgentJson(binding)
      || stableProjectAgentJson(prepared.binding) !== stableProjectAgentJson(binding)
      || stableProjectAgentJson(complete.sources) !== stableProjectAgentJson(prepared.sources)
      || complete.completedAt !== prepared.startedAt) fail();
    const stamp = prepared.startedAt.replace(/[^0-9A-Za-z]/g, '_');
    const file = join(nomi, 'project-agent-legacy-archive-v1', `${stamp}-agent-session.json`);
    const bytes = access.read(file)?.bytes;
    if (bytes === undefined && complete.sources.contextHash === digest(Buffer.alloc(0))) return;
    if (bytes === undefined || bytes.length === 0 || digest(bytes) !== complete.sources.contextHash) fail();
    return { file, bytes, stamp };
  } catch { return fail(); }
}
