import { expect, it, vi } from 'vitest';
import http from 'node:http';
import { resolveProductionReferenceUrls } from './productionReferenceUrls';
import { localizeAssetsForVendor, type LocalAsset } from '../catalog/assetLocalization';
import { spendReferenceKey } from '../shared/contracts/pendingSpendConfirm';
const reference = { assetId: 'asset', contentHash: 'hash', version: 1, kind: 'image' as const, role: 'first_frame' as const };
function fixture() {
  const assets = { list: () => [{ id: 'asset', data: {url:'nomi-local://asset/p/ref.png',contentType:'image/png'} }], identity: () => ({contentHash:'hash',version:1}), import: vi.fn() };
  return { assets, localize: vi.fn(async () => ['https://cdn.example/ref.png']) };
}
it('localizes pinned project assets through the existing transport before sealing', async () => {
  const deps = fixture();
  expect(await resolveProductionReferenceUrls({projectId:'p',providerId:'apimart',references:[reference],assertCurrent(){}},deps)).toEqual({[spendReferenceKey(reference)]:'https://cdn.example/ref.png'});
  expect(deps.localize).toHaveBeenCalledWith('apimart',['nomi-local://asset/p/ref.png']);
});
it('rejects changed content before upload and after asynchronous upload', async () => {
  const deps = fixture();
  deps.assets.identity = () => ({contentHash:'changed',version:1});
  await expect(resolveProductionReferenceUrls({projectId:'p',providerId:'apimart',references:[reference],assertCurrent(){}},deps)).rejects.toThrow('identity_changed');
  expect(deps.localize).not.toHaveBeenCalled();
  deps.assets.identity = () => ({contentHash:'hash',version:1});
  deps.localize.mockImplementation(async () => { deps.assets.identity = () => ({contentHash:'changed',version:1}); return ['https://cdn.example/ref.png']; });
  await expect(resolveProductionReferenceUrls({projectId:'p',providerId:'apimart',references:[reference],assertCurrent(){}},deps)).rejects.toThrow('identity_changed');
});
it('rejects a retired project after upload', async () => {
  let current = true;
  const deps = fixture(); deps.localize.mockImplementation(async () => { current = false; return ['https://cdn.example/ref.png']; });
  await expect(resolveProductionReferenceUrls({projectId:'p',providerId:'apimart',references:[reference],assertCurrent(){if(!current)throw new Error('stale_project')}},deps)).rejects.toThrow('stale_project');
});

it('uses the real multipart upload path against a delayed loopback endpoint', async () => {
  const uploads: Array<{ fileName: string; bytes: number }> = [];
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    await new Promise((resolve) => setTimeout(resolve, 25));
    uploads.push({ fileName: req.headers['content-disposition'] ?? 'multipart', bytes: Buffer.concat(chunks).length });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ url: 'https://loopback.invalid/reference.png' }));
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('loopback server did not bind');
  const endpoint = `http://127.0.0.1:${address.port}/v1/uploads/images`;
  const localUrl = 'nomi-local://asset/p/ref.png';
  const local: LocalAsset = { bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'), contentType: 'image/png', fileName: 'ref.png' };
  const postMultipart = async (url: string, headers: Record<string, string>, bytes: Buffer, fileName: string, contentType: string, _extra?: Record<string, string>, fileField = 'file') => {
    const form = new FormData();
    form.append(fileField, new Blob([new Uint8Array(bytes)], { type: contentType }), fileName);
    const response = await fetch(url, { method: 'POST', headers, body: form });
    return JSON.parse(await response.text()) as unknown;
  };
  try {
    const resolved = await resolveProductionReferenceUrls({
      projectId: 'p', providerId: 'apimart', references: [{ ...reference, assetId: 'asset' }], assertCurrent() {},
    }, {
      assets: {
        list: () => [{ id: 'asset', data: { url: localUrl, contentType: 'image/png' } }],
        identity: () => ({ contentHash: 'hash', version: 1 }),
      },
      localize: async (_providerId, urls) => {
        const result = await localizeAssetsForVendor(
          { referenceImages: urls },
          () => [{ vendorKey: 'apimart', ingestion: { strategy: 'upload-multipart', endpoint, urlPath: 'url', accepts: ['image'] }, uploadApiKey: '' }],
          () => local,
          vi.fn(),
          postMultipart,
        );
        return [((result.value as { referenceImages: string[] }).referenceImages[0])!];
      },
    });
    expect(resolved).toEqual({ [spendReferenceKey(reference)]: 'https://loopback.invalid/reference.png' });
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.bytes).toBeGreaterThan(0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
