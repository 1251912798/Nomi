import { describe, expect, it } from 'vitest';
import { resolveIndexedReferencePreview, type SpendReferenceAssets } from './pendingSpendReferences';

const pinned = { assetId: 'old', contentHash: 'real-hash', version: 1, kind: 'image' as const, role: 'character' as const };

function assets(identity: { contentHash: string; version: number } | undefined, url: unknown = 'nomi-local://asset/p/old.png'): SpendReferenceAssets {
  return { list: () => [{ id: 'old', data: { url, contentType: 'image/png' } }], identity: () => identity };
}

describe('pinned reference preview is read from the project asset owner', () => {
  it('returns the indexed URL when the pinned version is still the current one', () => {
    expect(resolveIndexedReferencePreview('p', pinned, assets({ contentHash: 'real-hash', version: 1 }))).toBe('nomi-local://asset/p/old.png');
  });

  it('refuses a reference whose pinned content changed, whose asset is gone, or that has no URL', () => {
    expect(() => resolveIndexedReferencePreview('p', pinned, assets({ contentHash: 'other', version: 1 }))).toThrow('storyboard_reference_asset_unavailable');
    expect(() => resolveIndexedReferencePreview('p', pinned, assets({ contentHash: 'real-hash', version: 2 }))).toThrow('storyboard_reference_asset_unavailable');
    expect(() => resolveIndexedReferencePreview('p', pinned, assets(undefined))).toThrow('storyboard_reference_asset_unavailable');
    expect(() => resolveIndexedReferencePreview('p', pinned, assets({ contentHash: 'real-hash', version: 1 }, 42))).toThrow('storyboard_reference_asset_unavailable');
  });
});
