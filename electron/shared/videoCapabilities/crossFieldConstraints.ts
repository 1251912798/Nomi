/** Pure capability projections shared by UI and request validation. */
import type { ArchetypeMode, ArchetypeReferenceSlotKind, ModelParameterControl } from './types';

type Values = Record<string, unknown>;
export type ReferenceCounts = Partial<Record<ArchetypeReferenceSlotKind, number>>;
const sameValue = (a: unknown, b: unknown): boolean => String(a) === String(b);

export function constrainParameterControls(controls: ModelParameterControl[], values: Values): ModelParameterControl[] {
  const effective = Object.fromEntries(controls.map(control => [control.key, values[control.key] ?? control.defaultValue]));
  return controls.map(control => {
    const active = control.optionConstraints?.filter(rule => sameValue(effective[rule.when.key], rule.when.value));
    if (!active?.length) return control;
    const options = control.options.filter(option => active.every(rule => rule.values.some(value => sameValue(value, option.value))));
    const defaultValue = options.find(option => sameValue(option.value, control.defaultValue))?.value ?? options[0]?.value;
    return { ...control, options, defaultValue };
  });
}

/** Only conditional selections are corrected; ordinary parameter semantics remain with their owner. */
export function normalizeConditionalParameters(controls: ModelParameterControl[], values: Values): Values {
  let next = values;
  for (const control of constrainParameterControls(controls, values)) {
    if (!control.optionConstraints?.length) continue;
    const value = values[control.key] ?? control.defaultValue;
    if (control.options.some(option => sameValue(option.value, value))) continue;
    next = { ...next, [control.key]: control.defaultValue };
  }
  return next;
}

export function remainingReferenceCapacity(mode: ArchetypeMode, counts: ReferenceCounts): number {
  if (mode.maxTotalReferences === undefined) return Infinity;
  return Math.max(0, mode.maxTotalReferences - mode.slots.reduce((sum, slot) => sum + (counts[slot.kind] ?? 0), 0));
}

export type ModeConstraintViolation =
  | { kind: 'parameter'; key: string }
  | { kind: 'references'; max: number };

export function validateModeConstraints(mode: ArchetypeMode, values: Values): ModeConstraintViolation | null {
  for (const control of constrainParameterControls(mode.params, values)) {
    if (!control.optionConstraints?.length) continue;
    const value = values[control.key] ?? control.defaultValue;
    if (!control.options.some(option => sameValue(option.value, value))) return { kind: 'parameter', key: control.key };
  }
  if (mode.maxTotalReferences !== undefined) {
    const total = mode.slots.reduce((sum, slot) => {
      const value = slot.inputKey ? values[slot.inputKey] : undefined;
      return sum + (Array.isArray(value) ? value.length : typeof value === 'string' && value.trim() ? 1 : 0);
    }, 0);
    if (total > mode.maxTotalReferences) return { kind: 'references', max: mode.maxTotalReferences };
  }
  return null;
}
