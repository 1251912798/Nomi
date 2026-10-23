// agent-ratio-variant-landing.paid.mjs 的判定先零花费验一遍：
// 用落画布同一个构造器（buildPlannedNodeMeta）造这一档的节点，交给**真的** buildCatalogTaskRequest + runtime.runTask
// （对等夹具：真内置目录 + globalThis.fetch 捕获），拿 APIMart 真请求体，按网络闸账本的形状喂给 judgeRatioVariantWire。
// 顺带把 RATIO_VARIANT_SHOT.wireModel（Mini 在 APIMart 请求体里的型号名）钉在真渲染结果上——付费脚本里的期望值不是手猜的。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', async () => {
  const nodeFs = await import('node:fs')
  const nodeOs = await import('node:os')
  const nodePath = await import('node:path')
  const { electronStub } = await import('../../electron/parity/parityElectronMock.ts')
  return electronStub(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'nomi-ratio-variant-judge-')))
})
vi.mock('../../electron/capabilityCore/rendererBridge', () => ({
  requestRendererDecision: async () => ({ confirmed: true }),
  requestRenderer: async (operation) => { throw new Error(`付费路径不该走带超时的桥: ${operation}`) },
}))

const { driveEngineA, installFetchCapture, seedParityCatalog } = await import('../../electron/parity/generationParityTestUtils.ts')
const { buildCatalogTaskRequest } = await import('../../src/workbench/generationCanvas/runner/catalogTaskActions.ts')
const { resolveGenerationReferences } = await import('../../src/workbench/generationCanvas/runner/generationReferenceResolver.ts')
const { createGenerationNode } = await import('../../src/workbench/generationCanvas/model/graphOps.ts')
const { toCatalogModelOptions } = await import('../../src/config/modelOptionMappers.ts')
const { buildAgentModelEntries } = await import('../../src/workbench/generationCanvas/agent/availableModels.ts')
const { buildModelEntryIndex, buildPlannedNodeMeta } = await import('../../src/workbench/generationCanvas/agent/plannedNodeMeta.ts')
const { RATIO_VARIANT_SHOT: SHOT, judgeRatioVariantWire, nodeShotProblems } = await import('./_ratioVariantWire.mjs')

const HOST = 'api.apimart.ai'
let capture
let entryByKey
beforeAll(async () => {
  capture = installFetchCapture()
  const catalog = await seedParityCatalog(['apimart'])
  const options = toCatalogModelOptions(catalog.models.filter((model) => model.vendorKey === 'apimart').map((model) => ({
    modelKey: model.modelKey, modelAlias: model.modelAlias, vendorKey: model.vendorKey, kind: model.kind, labelZh: model.labelZh, meta: model.meta,
  })))
  entryByKey = buildModelEntryIndex(buildAgentModelEntries(options), ['apimart'])
}, 90_000)
afterAll(() => capture?.restore())

/** Agent 起草的这一档落到画布上的节点（与落地线同一个构造器）。 */
function landedNode(variantId = SHOT.variantId) {
  const meta = buildPlannedNodeMeta({
    modelKey: SHOT.modelKey, vendor: SHOT.vendorKey, modeId: SHOT.modeId, ...(variantId ? { variantId } : {}),
    params: { size: SHOT.aspect, resolution: SHOT.resolution, duration: SHOT.durationSec, generate_audio: SHOT.generateAudio },
  }, entryByKey)
  expect(meta).toBeTruthy()
  return { ...createGenerationNode({ id: 'paid-shot', kind: 'video', prompt: '雨后的窄巷，竖构图，镜头缓慢上摇' }), meta }
}

async function ledgerFor(node) {
  const { vendor, request } = buildCatalogTaskRequest(node, { references: resolveGenerationReferences(node, { nodes: [node], edges: [] }) })
  const record = await driveEngineA(capture, { vendorKey: vendor, kind: request.kind, prompt: request.prompt, extras: { ...request.extras, nodeId: node.id } })
  expect(record.failure, JSON.stringify(record.failure)).toBeUndefined()
  return [{ kind: 'allowed-request', via: 'fetch', seq: 1, method: 'POST', url: `${record.request.origin}${record.request.path}`, host: new URL(record.request.origin).hostname, body: { text: JSON.stringify(record.request.body) } }]
}

describe('真付费样本的判定：用真 runTask 渲染这一档的 APIMart 请求体', () => {
  it('这一档的节点过节点核对；真请求体的型号 = RATIO_VARIANT_SHOT.wireModel、比例 9:16 → 判过', async () => {
    const node = landedNode()
    expect(nodeShotProblems(node.meta)).toEqual([])
    const verdict = judgeRatioVariantWire(await ledgerFor(node), { host: HOST })
    expect(verdict.summary).toMatchObject({ createRequests: 1, model: SHOT.wireModel, size: SHOT.aspect })
    expect(verdict.problems).toEqual([])
  })

  it('落地丢了变体（#1288 修之前的形状）→ 节点核对红，请求体型号也红', async () => {
    const node = landedNode(null)
    expect(nodeShotProblems(node.meta).join('\n')).toMatch(/变体是/)
    expect(judgeRatioVariantWire(await ledgerFor(node), { host: HOST }).problems.join('\n')).toMatch(/请求体型号是/)
  })

  it('打开节点被改成 16:9（PR-b 修之前的形状）→ 节点核对红，请求体比例也红', async () => {
    const node = landedNode()
    node.meta = { ...node.meta, size: '16:9', aspect_ratio: '16:9' }
    expect(nodeShotProblems(node.meta).join('\n')).toMatch(/比例（size）是 "16:9"/)
    expect(judgeRatioVariantWire(await ledgerFor(node), { host: HOST }).problems.join('\n')).toMatch(/请求体比例（size）是 "16:9"/)
  })

  it('不止一次创建请求 → 判红', async () => {
    const entries = await ledgerFor(landedNode())
    expect(judgeRatioVariantWire([...entries, { ...entries[0], seq: 2 }], { host: HOST }).problems.join('\n')).toMatch(/视频创建请求有 2 次/)
  })
})
