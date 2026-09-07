import { describe, expect, it } from 'vitest';
import { APIMART_VIDEO_MODELS } from './apimartVideos';
import { validateHailuo23Body } from './apimartHailuo23';
import { applyRequestTransformSync, validateRequestTransformSync } from '../tasks/requestTransforms';
import { validateMinimaxH3Body } from './apimartMinimaxH3';

describe('APIMart request contract', () => {
  it('wires every Hailuo transport bucket to the rejecting preflight guard', () => {
    const mappings = APIMART_VIDEO_MODELS.find(model => model.modelKey === 'MiniMax-Hailuo-2.3')!.mappings;
    expect(mappings.map(mapping => mapping.taskKind)).toEqual(['text_to_video', 'image_to_video']);
    for (const mapping of mappings) {
      expect(() => validateRequestTransformSync(mapping.create.request_transform, { resolution: '1080p', duration: 10 }, { baseUrl: '' })).toThrow();
    }
  });
  it.each(['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-2.3-Fast'])('rejects invalid duration for %s in both validation phases', model => {
    const body = { model, resolution: '1080p', duration: 10 };
    expect(() => validateHailuo23Body(body)).toThrow();
    expect(() => validateRequestTransformSync('apimart-hailuo-23', body, { baseUrl: '' })).toThrow();
    expect(() => applyRequestTransformSync('apimart-hailuo-23', body, { baseUrl: '' })).toThrow();
    expect(() => validateHailuo23Body({ ...body, duration: 6 })).not.toThrow();
  });
  it('rejects the thirteenth mixed reference before sending', () => {
    expect(() => validateMinimaxH3Body({ image_urls: Array(9).fill('image'), video_urls: Array(3).fill('video'), audio_urls: ['audio'] })).toThrow();
  });
  it('accepts exactly twelve references', () => {
    expect(() => validateMinimaxH3Body({ image_urls: Array(6).fill('image'), video_urls: Array(3).fill('video'), audio_urls: Array(3).fill('audio') })).not.toThrow();
  });
});
