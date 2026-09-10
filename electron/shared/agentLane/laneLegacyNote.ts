export const LANE_LEGACY_NOTE = 'nomi.ui.legacy-source';
export const LANE_LEGACY_COMPLETE_NOTE = 'nomi.ui.legacy-complete';
export const LANE_LEGACY_TOOLS_NOTE = 'nomi.ui.legacy-tools-initialized';

export interface LaneLegacyFacts {
  arrayOrder: boolean;
  summaries: boolean;
  archivedItems: boolean;
  missingToolArguments: boolean;
}
export function laneLegacyFacts(value: unknown): LaneLegacyFacts | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  if ((value as { version?: unknown }).version !== 1) return;
  const facts = (value as { facts?: unknown }).facts;
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) return;
  const raw = facts as Record<string, unknown>;
  if (typeof raw.arrayOrder !== 'boolean' || typeof raw.summaries !== 'boolean'
    || typeof raw.archivedItems !== 'boolean' || typeof raw.missingToolArguments !== 'boolean') return;
  return { arrayOrder: raw.arrayOrder, summaries: raw.summaries, archivedItems: raw.archivedItems,
    missingToolArguments: raw.missingToolArguments };
}
