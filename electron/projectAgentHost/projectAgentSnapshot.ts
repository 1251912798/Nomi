export { ProjectAgentSnapshotError } from '../shared/legacyAgentJson';
import { stableProjectAgentJson } from '../shared/legacyAgentJson';
export { stableProjectAgentJson } from '../shared/legacyAgentJson';

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  return Object.freeze(value);
}

/** Freeze one newly-created reducer record without cloning or rewalking an existing frozen subtree. */
export function freezeProjectAgentIncremental<T>(value: T): T {
  return deepFreeze(value);
}

export function freezeProjectAgentSnapshot<T>(value: T): T {
  return deepFreeze(JSON.parse(stableProjectAgentJson(value)) as T);
}
