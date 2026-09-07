import { registerRequestTransform } from '../tasks/requestTransforms';
import { desktopT } from '../i18n';
import { HAILUO_2_3_ARCHETYPE } from '../shared/videoCapabilities/hailuo23';
import { validateModeConstraints } from '../shared/videoCapabilities/crossFieldConstraints';

export function validateHailuo23Body(body: unknown): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;
  const violation = validateModeConstraints(HAILUO_2_3_ARCHETYPE.modes[0], body as Record<string, unknown>);
  if (violation) throw new Error(desktopT('modelConstraints.parameterCombination', { parameter: violation.kind === 'parameter' ? violation.key : '' }));
}

registerRequestTransform('apimart-hailuo-23', body => {
  validateHailuo23Body(body);
  return body;
}, validateHailuo23Body);
