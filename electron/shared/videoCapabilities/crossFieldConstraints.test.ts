import { describe, expect, it } from 'vitest';
import { HAILUO_2_3_ARCHETYPE } from './hailuo23';
import { MINIMAX_H3_APIMART_ARCHETYPE } from './minimaxH3Apimart';
import { constrainParameterControls, normalizeConditionalParameters, remainingReferenceCapacity, validateModeConstraints } from './crossFieldConstraints';

describe('cross-field capability constraints', () => {
  it.each(HAILUO_2_3_ARCHETYPE.modes)('$id rejects 1080p + 10 seconds and narrows options', (mode) => {
    const values = { resolution: '1080p', duration: 10 };
    expect(constrainParameterControls(mode.params, values).find(p => p.key === 'duration')?.options.map(o => o.value)).toEqual([6]);
    expect(normalizeConditionalParameters(mode.params, values)).toEqual({ resolution: '1080p', duration: 6 });
    expect(validateModeConstraints(mode, values)?.kind).toBe('parameter');
    expect(validateModeConstraints(mode, { resolution: '768p', duration: 10 })).toBeNull();
    expect(validateModeConstraints(mode, { resolution: '1080p', duration: 6 })).toBeNull();
  });
  it('enforces aggregate counts at 12 across all three media types', () => {
    const mode = MINIMAX_H3_APIMART_ARCHETYPE.modes.find(m => m.id === 'ref')!;
    expect(remainingReferenceCapacity(mode, { image_ref: 9, video_ref: 3 })).toBe(0);
    expect(validateModeConstraints(mode, { image_urls: Array(9).fill('i'), video_urls: Array(3).fill('v'), audio_urls: ['a'] })?.kind).toBe('references');
    expect(validateModeConstraints(mode, { image_urls: Array(6).fill('i'), video_urls: Array(3).fill('v'), audio_urls: Array(3).fill('a') })).toBeNull();
  });
  it('uses facts for unrelated controls, defaults and reference keys after serialization', () => {
    const mode = JSON.parse(JSON.stringify({ ...HAILUO_2_3_ARCHETYPE.modes[0], maxTotalReferences: 2,
      slots: [{ kind: 'video_ref', inputKey: 'clips', max: 3, min: 0 }],
      params: [{ key: 'quality', type: 'select', options: [{ value: 'high', label: 'high' }], defaultValue: 'high' },
        { key: 'frames', type: 'select', options: [{ value: 4, label: '4' }, { value: 8, label: '8' }], defaultValue: 8,
          optionConstraints: [{ when: { key: 'quality', value: 'high' }, values: [4] }] }] }));
    expect(normalizeConditionalParameters(mode.params, { frames: '8' })).toEqual({ frames: 4 });
    expect(validateModeConstraints(mode, { clips: ['a', 'b', 'c'], frames: 4 })?.kind).toBe('references');
    expect(constrainParameterControls(mode.params, {})[1].defaultValue).toBe(4);
  });
});
