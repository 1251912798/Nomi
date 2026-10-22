// 真付费样本（reference-leak-hotfix.paid.mjs）的判定先零花费验一遍（V-refleak 第 1 轮的条件）。
//
// 用的是真东西：渲染层 buildCatalogTaskRequest 拼这一档请求（Seedance 2.0 · fast · 480p · 4 秒 · 无音频 · 首尾帧，
// 节点上还躺着 3 张残留参考），交给**真的 runtime.runTask**（对等夹具：真内置目录 + globalThis.fetch 捕获），
// 拿到 APIMart 真请求体，再按网络闸的账本形状喂给 judgeReferenceWire。
// 参考地址用 https 假域名，免得触发本机托管上传；付费那一场里两帧是先托管上传、再按返回地址发的——这里照那个形状
// 补两条「托管上传」账本（文件名 + 返回地址），判定靠它把地址对回 first.png / last.png。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', async () => {
  const nodeFs = await import('node:fs')
  const nodeOs = await import('node:os')
  const nodePath = await import('node:path')
  const { electronStub } = await import('../../electron/parity/parityElectronMock.ts')
  return electronStub(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'nomi-refleak-judge-')))
})
vi.mock('../../electron/capabilityCore/rendererBridge', () => ({
  requestRendererDecision: async () => ({ confirmed: true }),
  requestRenderer: async (operation) => { throw new Error(`付费路径不该走带超时的桥: ${operation}`) },
}))

const { driveEngineA, installFetchCapture, seedParityCatalog } = await import('../../electron/parity/generationParityTestUtils.ts')
const { buildCatalogTaskRequest } = await import('../../src/workbench/generationCanvas/runner/catalogTaskActions.ts')
const { resolveGenerationReferences } = await import('../../src/workbench/generationCanvas/runner/generationReferenceResolver.ts')
const { createGenerationNode } = await import('../../src/workbench/generationCanvas/model/graphOps.ts')
const { judgeReferenceWire } = await import('./_referenceLeakWire.mjs')

const HOST = 'api.apimart.ai'
const HOSTED = 'https://upload.apimart.test/hosted/'
const REFERENCE_FILES = ['ref-1.png', 'ref-2.png', 'ref-3.png']
const SCENE = { host: HOST, firstFile: 'first.png', lastFile: 'last.png', referenceFiles: REFERENCE_FILES }
// 托管后的公网地址故意不含原文件名（真上传返回的多半是随机 id），判定只能靠账本把它对回文件名。
const hosted = (file) => `${HOSTED}${Buffer.from(file).toString('hex')}.png?sig=SIGNED&exp=1`

let capture
beforeAll(async () => {
  capture = installFetchCapture()
  await seedParityCatalog(['apimart'])
}, 60_000)
afterAll(() => capture?.restore())

/** 场景 2 修后的节点：首尾帧方式、两帧在用、3 张残留参考还躺在 meta 上（付费脚本布的就是这个）。 */
function sceneNode() {
  const base = createGenerationNode({ id: 'paid-shot', kind: 'video', prompt: '一只橘猫从书桌上跳下，镜头缓慢跟随，写实' })
  return {
    ...base,
    meta: {
      modelKey: 'doubao-seedance-2.0', modelVendor: 'apimart', vendor: 'apimart',
      archetype: { id: 'seedance-2-apimart', modeId: 'firstlast', variantId: 'fast' },
      duration: 4, resolution: '480p', generate_audio: false,
      referenceImageUrls: REFERENCE_FILES.map(hosted),
      firstFrameUrl: hosted('first.png'), lastFrameUrl: hosted('last.png'),
    },
  }
}

/** 真 runTask 出站那一刻的请求 → 网络闸账本的形状（查询串照闸的规矩换成 `?<redacted>`），外加两条托管上传。 */
async function ledgerFor(node, { uploads = ['first.png', 'last.png'], mutateBody } = {}) {
  const { vendor, request } = buildCatalogTaskRequest(node, { references: resolveGenerationReferences(node, { nodes: [node], edges: [] }) })
  const record = await driveEngineA(capture, { vendorKey: vendor, kind: request.kind, prompt: request.prompt, extras: { ...request.extras, nodeId: node.id } })
  expect(record.failure, JSON.stringify(record.failure)).toBeUndefined()
  const body = mutateBody ? mutateBody(structuredClone(record.request.body)) : record.request.body
  const scrub = (text) => text.replace(/(https?:\/\/[^\s"'\\?#]+)\?[^\s"'\\#]*/g, '$1?<redacted>')
  const entries = uploads.flatMap((file, index) => [
    { kind: 'allowed-request', via: 'fetch', seq: index + 1, method: 'POST', url: 'https://api.apimart.ai/v1/uploads/images', host: HOST, body: { form: [{ field: 'file', fileName: file, size: 15237, type: 'image/png' }] } },
    { kind: 'allowed-response', via: 'fetch', seq: index + 1, status: 200, text: scrub(JSON.stringify({ code: 200, data: { url: hosted(file) } })) },
  ])
  entries.push({ kind: 'allowed-request', via: 'fetch', seq: 99, method: 'POST', url: `${record.request.origin}${record.request.path}`, host: new URL(record.request.origin).hostname, body: { text: scrub(JSON.stringify(body)) } })
  return { entries, body }
}

describe('真付费样本的判定：用真 runTask 渲染的 APIMart 首尾帧请求体', () => {
  it('修后：image_urls 和 image_with_roles 各带一遍首尾帧（4 处出现），去重后恰好 first.png、last.png → 判过', async () => {
    const { entries, body } = await ledgerFor(sceneNode())
    expect(body.image_urls?.length).toBe(2)
    expect(Array.isArray(body.image_with_roles)).toBe(true)
    const verdict = judgeReferenceWire(entries, SCENE)
    expect(verdict.summary.imageUrlOccurrences).toBe(4)
    expect(verdict.summary.imagesInBody.map((entry) => entry.file).sort()).toEqual(['first.png', 'last.png'])
    expect(verdict.problems).toEqual([])
  })

  it('修前的形状（残留参考混进 image_urls）→ 判红，并点名', async () => {
    const { entries } = await ledgerFor(sceneNode(), {
      uploads: ['first.png', 'last.png', ...REFERENCE_FILES],
      mutateBody: (body) => ({ ...body, image_urls: [...body.image_urls, ...REFERENCE_FILES.map(hosted)] }),
    })
    const verdict = judgeReferenceWire(entries, SCENE)
    expect(verdict.problems.join('\n')).toMatch(/残留参考出现在请求体里/)
    expect(verdict.problems.join('\n')).toMatch(/被托管上传了：ref-1\.png、ref-2\.png、ref-3\.png/)
    expect(verdict.problems.join('\n')).toMatch(/应恰好是 first\.png、last\.png/)
  })

  it('残留参考只是被托管上传了、没进请求体 → 也判红', async () => {
    const { entries } = await ledgerFor(sceneNode(), { uploads: ['first.png', 'last.png', 'ref-2.png'] })
    expect(judgeReferenceWire(entries, SCENE).problems.join('\n')).toMatch(/被托管上传了：ref-2\.png/)
  })

  it('托管上传没记到、地址对不回文件名 → 判红（证明不了只发了两帧，不放过）', async () => {
    const { entries } = await ledgerFor(sceneNode(), { uploads: [] })
    expect(judgeReferenceWire(entries, SCENE).problems.join('\n')).toMatch(/对不回本地文件名/)
  })

  it('不止一次创建请求 → 判红', async () => {
    const { entries } = await ledgerFor(sceneNode())
    const create = entries.at(-1)
    expect(judgeReferenceWire([...entries, { ...create, seq: 100 }], SCENE).problems.join('\n')).toMatch(/视频创建请求有 2 次/)
  })
})
