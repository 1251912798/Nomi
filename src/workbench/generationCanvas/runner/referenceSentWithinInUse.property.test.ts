// 性质测试：发给供应商的图片 / 视频 / 音频地址 ⊆ 界面上正在用的那些（2026-10-22 线上错花钱热修）。
//
// 复盘：#1269 线的 docs/audit/2026-10-22-composer-reference-slots-direction.md 末节「main 上是否已存在」；
// 设计卡：docs/plan/2026-10-22-reference-leak-hotfix.md。
//
// 串的是生产里真走的那几段，不起界面、不起 Electron、不花钱：
//   界面「在用」  = resolveReferenceSlots（参考区真用的函数）
//   换方式 / 换模型 = applyArchetypeModeSwitch / buildNodeModelChangePatch + ensureArchetypeNodeMeta（main 上的真入口）
//   渲染层发送    = resolveGenerationReferences → buildCatalogTaskRequest
//   主进程        = 和 runtime.runTask 同顺序：stripReferenceResidue → applyHeadlessParamDefaults → buildProfileHttpRequest
//                  （通用中转用 NEWAPI_* op，APIMart 用 APIMART_*_MODELS 的 mapping）
//
// 两层尺子分开量：
//   ① 模板参数层（buildCatalogTaskRequest → taskTemplateParams，不经主进程剥除）——量的是**渲染层**有没有守住契约；
//      渲染层那步「当前方式没声明的参考键显式置 undefined」被删，这一层立刻红。
//   ② 真请求体（中转 / APIMart 两种传输）——量的是**最后上线的字节**。
// 主进程剥除（stripReferenceResidue）另有一组用例：绕过渲染层、把节点 meta 原样塞进 extras，主进程也得剥干净。
//
// 设 NOMI_REFLEAK_REPORT=<文件> 时把每层的漏格数和每格「在用且发出」写进去（修前 / 修后对账用）。
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ModelOption } from '../../../config/models'
import {
  MODEL_ARCHETYPES,
  resolveArchetypeForModel,
  type ArchetypeMode,
  type ModelArchetype,
} from '../../../../electron/shared/modelArchetypes'
import { applyHeadlessParamDefaults, taskTemplateParams } from '../../../../electron/catalog/taskParams'
import { stripReferenceResidue } from '../../../../electron/catalog/archetypeInput'
import { buildProfileHttpRequest } from '../../../../electron/catalog/profileHttpRequest'
import {
  NEWAPI_IMAGE_CREATE_OP,
  NEWAPI_VIDEO_CREATE_OP,
  newapiImageEditProfileForModel,
} from '../../../../electron/catalog/newapiTransport'
import { APIMART_VIDEO_MODELS } from '../../../../electron/catalog/apimartVideos'
import { APIMART_IMAGE_MODELS } from '../../../../electron/catalog/apimartImages'
import type { HttpOperation, Model, Vendor } from '../../../../electron/catalog/types'
import type { GenerationCanvasEdge, GenerationCanvasNode } from '../model/generationCanvasTypes'
import { createGenerationNode } from '../model/graphOps'
import { buildNodeModelChangePatch } from '../nodes/buildNodeModelChangePatch'
import { applyArchetypeModeSwitch, ensureArchetypeNodeMeta } from '../nodes/controls/archetypeMeta'
import { buildCatalogTaskRequest } from './catalogTaskActions'
import { resolveGenerationReferences } from './generationReferenceResolver'
import { resolveReferenceSlots } from './referenceSlots'

const REF = 'nomi-local://ref/'
const img = (name: string) => `${REF}${name}.png`
const imgs = (count: number, prefix = 'u', from = 1) => Array.from({ length: count }, (_, i) => img(`${prefix}${from + i}`))
const vid = (name: string) => `${REF}${name}.mp4`
const aud = (name: string) => `${REF}${name}.mp3`

type Graph = { node: GenerationCanvasNode; nodes: GenerationCanvasNode[]; edges: GenerationCanvasEdge[] }

function nodeKindFor(archetype: ModelArchetype): GenerationCanvasNode['kind'] {
  if (archetype.kind === 'image') return 'image'
  if (archetype.kind === 'audio') return 'audio'
  if (archetype.kind === 'model3d') return 'model3d' as GenerationCanvasNode['kind']
  return 'video'
}

function graphOn(archetype: ModelArchetype, modelKey: string, vendor: string, modeId: string, meta: Record<string, unknown>): Graph {
  const base = createGenerationNode({ id: 'n', kind: nodeKindFor(archetype), prompt: '一个镜头' })
  const node = { ...base, meta: { modelKey, modelVendor: vendor, vendor, archetype: { id: archetype.id, modeId }, ...meta } }
  return { node, nodes: [node], edges: [] }
}

/** 切方式：main 上 NodeParameterControls 走的就是 applyArchetypeModeSwitch（图留在原存储键里）。 */
function switchMode(graph: Graph, archetype: ModelArchetype, modeId: string): Graph {
  const node = { ...graph.node, meta: applyArchetypeModeSwitch(graph.node.meta || {}, archetype, modeId) }
  return { ...graph, node, nodes: graph.nodes.map((n) => (n.id === node.id ? node : n)) }
}

const option = (modelKey: string, vendor: string): ModelOption =>
  ({ value: modelKey, modelKey, vendor, label: modelKey, kind: 'video' } as ModelOption)

/** 换模型：模型菜单的 buildNodeModelChangePatch + 界面 effect 紧接着做的 ensureArchetypeNodeMeta。 */
function swapModel(graph: Graph, toModelKey: string, vendor: string): { graph: Graph; archetype: ModelArchetype } {
  const from = String(graph.node.meta?.modelKey)
  const { meta } = buildNodeModelChangePatch({
    node: graph.node, nodes: graph.nodes, edges: graph.edges,
    modelOptions: [option(from, vendor), option(toModelKey, vendor)], value: toModelKey, vendor,
  })
  const archetype = resolveArchetypeForModel({ modelKey: toModelKey, vendorKey: vendor, meta: {} })!
  const ensured = ensureArchetypeNodeMeta(meta, archetype) ?? meta
  const node = { ...graph.node, meta: ensured }
  return { graph: { ...graph, node, nodes: graph.nodes.map((n) => (n.id === node.id ? node : n)) }, archetype }
}

function inUse(graph: Graph): Set<string> {
  return new Set(resolveReferenceSlots(graph.node, graph.nodes, graph.edges)
    .flatMap((slot) => slot.fills.map((fill) => fill.url).filter((url): url is string => Boolean(url))))
}

/** 生成钮可不可点：当前方式每个必填槽（min ≥ 1）都至少有一张在用。 */
function clickable(graph: Graph, mode: ArchetypeMode): boolean {
  const slots = resolveReferenceSlots(graph.node, graph.nodes, graph.edges)
  return mode.slots.every((declared) => declared.min < 1
    || slots.some((slot) => slot.slotKind === declared.kind && slot.fills.some((fill) => Boolean(fill.url))))
}

function rendererRequest(graph: Graph) {
  const references = resolveGenerationReferences(graph.node, { nodes: graph.nodes, edges: graph.edges })
  return buildCatalogTaskRequest(graph.node, { references }).request
}

/** 一个值里出现的全部参考地址 → 它挂在哪些键下。 */
function urlsIn(root: unknown): Map<string, string[]> {
  const found = new Map<string, string[]>()
  const walk = (value: unknown, key: string) => {
    if (typeof value === 'string') {
      if (value.startsWith(REF)) found.set(value, [...(found.get(value) ?? []), key])
    } else if (Array.isArray(value)) value.forEach((item) => walk(item, key))
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, item]) => walk(item, key || k))
  }
  if (root && typeof root === 'object' && !Array.isArray(root)) Object.entries(root).forEach(([key, value]) => walk(value, key))
  else walk(root, '')
  return found
}

// ── 传输：和 runtime.runTask 同顺序渲染真请求体 ──────────────────────────────────────

type Transport = { vendor: Vendor; model: Model; op: HttpOperation | null; archetypeId: string }

const LOOPBACK = 'http://127.0.0.1:9'

function relayTransport(modelKey: string, archetypeId: string, kind: string): Transport {
  const op = kind === 'text_to_video' || kind === 'image_to_video' ? NEWAPI_VIDEO_CREATE_OP
    : kind === 'text_to_image' ? NEWAPI_IMAGE_CREATE_OP
      : kind === 'image_edit' ? newapiImageEditProfileForModel(modelKey).operation
        : null
  return {
    vendor: { key: 'relay-test', name: 'relay', enabled: true, baseUrlHint: LOOPBACK, authType: 'bearer' } as Vendor,
    model: { modelKey, vendorKey: 'relay-test', labelZh: modelKey, kind: 'video', enabled: true, meta: { archetypeId } } as Model,
    op, archetypeId,
  }
}

type ApimartModel = { modelKey: string; archetypeId: string; mappings: Array<{ taskKind: string; create: HttpOperation; modeId?: string }> }
const APIMART_MODELS: ApimartModel[] = [...APIMART_VIDEO_MODELS, ...APIMART_IMAGE_MODELS] as ApimartModel[]

function apimartTransport(model: ApimartModel, kind: string, modeId: string): Transport {
  const bucket = model.mappings.filter((mapping) => mapping.taskKind === kind)
  const mapping = bucket.find((m) => m.modeId === modeId) ?? bucket.find((m) => !m.modeId) ?? null
  return {
    vendor: { key: 'apimart', name: 'APIMart', enabled: true, baseUrlHint: LOOPBACK, authType: 'bearer' } as Vendor,
    model: { modelKey: model.modelKey, vendorKey: 'apimart', labelZh: model.modelKey, kind: 'video', enabled: true, meta: { archetypeId: model.archetypeId } } as Model,
    op: mapping?.create ?? null, archetypeId: model.archetypeId,
  }
}

/** 主进程那一段：runTask 里 extras 的处理顺序原样照搬，然后渲染出要发的 HTTP 请求。op 为空 = 这家没有这条路（不发）。 */
function wire(transport: Transport, request: { kind: string; prompt: string; extras?: Record<string, unknown> }) {
  if (!transport.op) return null
  const extras = applyHeadlessParamDefaults(stripReferenceResidue(structuredClone(request.extras ?? {})), transport.archetypeId,
    request.kind, transport.vendor.key, transport.op.defaultParams, transport.op.body, transport.model.modelKey)
  const built = buildProfileHttpRequest({
    vendor: transport.vendor, model: transport.model, apiKey: 'k',
    request: { ...request, extras } as never, operation: transport.op,
  })
  return { body: built.body, query: built.query, url: built.url, method: built.method, headers: built.headers }
}

// ── 格子：每个档案从「放满」起切到它的每个方式 ──────────────────────────────────────

type Start = 'refs' | 'frames' | 'media'
type Cell = { label: string; archetype: ModelArchetype; mode: ArchetypeMode; graph: Graph; modelKey: string }

const slotCap = (mode: ArchetypeMode, kind: string) => {
  const slot = mode.slots.find((s) => s.kind === kind)
  return slot ? Math.min(slot.max ?? 9, 9) : 0
}

function startFor(archetype: ModelArchetype, start: Start): { mode: ArchetypeMode; meta: Record<string, unknown> } | null {
  if (start === 'refs') {
    const mode = [...archetype.modes].sort((a, b) => slotCap(b, 'image_ref') - slotCap(a, 'image_ref'))[0]
    if (!mode || slotCap(mode, 'image_ref') === 0) return null
    return { mode, meta: { referenceImageUrls: imgs(slotCap(mode, 'image_ref')) } }
  }
  if (start === 'frames') {
    const mode = archetype.modes.find((m) => m.slots.some((s) => s.kind === 'first_frame') && m.slots.some((s) => s.kind === 'last_frame'))
    if (!mode) return null
    return { mode, meta: { firstFrameUrl: img('first'), lastFrameUrl: img('last') } }
  }
  const media = (m: ArchetypeMode) => slotCap(m, 'video_ref') + slotCap(m, 'audio_ref') + (m.slots.some((s) => s.kind === 'source_video') ? 1 : 0)
  const mode = [...archetype.modes].sort((a, b) => media(b) - media(a))[0]
  if (!mode || media(mode) === 0) return null
  return {
    mode,
    meta: {
      ...(slotCap(mode, 'image_ref') ? { referenceImageUrls: imgs(slotCap(mode, 'image_ref')) } : {}),
      ...(slotCap(mode, 'video_ref') ? { referenceVideoUrls: Array.from({ length: slotCap(mode, 'video_ref') }, (_, i) => vid(`v${i + 1}`)) } : {}),
      ...(slotCap(mode, 'audio_ref') ? { referenceAudioUrls: Array.from({ length: slotCap(mode, 'audio_ref') }, (_, i) => aud(`a${i + 1}`)) } : {}),
      ...(mode.slots.some((s) => s.kind === 'source_video') ? { sourceVideoUrl: vid('source') } : {}),
    },
  }
}

/**
 * 别名键：MCP canvas.write 的 metadata 原样进 meta、旧工程、参数槽写回都会留下这些键。界面一个都不显示。
 * 只放「请求构造之前没有任何一层会把它们认成当前方式的槽值」的组合：首 / 尾帧别名和 referenceImages /
 * upstreamResultUrls 会被 resolveGenerationReferences 抬成首帧 / 参考（那是另一类问题，见设计卡「残余风险」），
 * 所以只在当前方式**没有**对应槽时放。
 */
function aliasMetaFor(mode: ArchetypeMode): Record<string, unknown> {
  const has = (kind: string) => mode.slots.some((slot) => slot.kind === kind)
  return {
    image_url: img('alias-image_url'), imageUrl: img('alias-imageUrl'), referenceImageUrl: img('alias-referenceImageUrl'),
    reference_images: [img('alias-reference_images')], reference_image_urls: [img('alias-reference_image_urls')],
    video_url: vid('alias-video_url'), source_video_url: vid('alias-source_video_url'),
    reference_video_urls: [vid('alias-reference_video_urls')], reference_audio_urls: [aud('alias-reference_audio_urls')],
    ...(has('first_frame') ? {} : { first_frame_url: img('alias-first_frame_url') }),
    ...(has('last_frame') ? {} : { last_frame_url: img('alias-last_frame_url') }),
    ...(has('first_frame') || has('image_ref') ? {} : { referenceImages: [img('alias-referenceImages')], upstreamResultUrls: [img('alias-upstream')] }),
    ...(has('source_video') ? {} : { sourceVideoUrl: vid('alias-sourceVideoUrl') }),
    ...(has('video_ref') ? {} : { referenceVideoUrls: [vid('alias-referenceVideoUrls')] }),
    ...(has('audio_ref') ? {} : { referenceAudioUrls: [aud('alias-referenceAudioUrls')] }),
  }
}

function aliasCellsFor(archetypes: Array<{ archetype: ModelArchetype; modelKey: string; vendor: string }>): Cell[] {
  return archetypes.flatMap(({ archetype, modelKey, vendor }) => archetype.modes.map((mode) => ({
    label: `${archetype.id}: aliases@${mode.id}`, archetype, mode, modelKey,
    graph: graphOn(archetype, modelKey, vendor, mode.id, aliasMetaFor(mode)),
  })))
}

function cellsFor(archetypes: Array<{ archetype: ModelArchetype; modelKey: string; vendor: string }>, start: Start): Cell[] {
  const cells: Cell[] = []
  for (const { archetype, modelKey, vendor } of archetypes) {
    const begin = startFor(archetype, start)
    if (!begin) continue
    const graph = graphOn(archetype, modelKey, vendor, begin.mode.id, begin.meta)
    for (const mode of archetype.modes) {
      cells.push({
        label: `${archetype.id}: ${begin.mode.id}→${mode.id}`,
        archetype, mode, modelKey,
        graph: mode.id === begin.mode.id ? graph : switchMode(graph, archetype, mode.id),
      })
    }
  }
  return cells
}

const imageOrVideo = MODEL_ARCHETYPES
  .filter((a) => a.kind === 'video' || a.kind === 'image')
  .map((archetype) => ({ archetype, modelKey: archetype.identifierPatterns[0]!, vendor: 'apimart' }))
const everyArchetype = MODEL_ARCHETYPES.map((archetype) => ({ archetype, modelKey: archetype.identifierPatterns[0]!, vendor: 'apimart' }))
const apimartArchetypes = APIMART_MODELS.flatMap((model) => {
  const archetype = resolveArchetypeForModel({ modelKey: model.modelKey, vendorKey: 'apimart', meta: { archetypeId: model.archetypeId } })
  return archetype && archetype.id === model.archetypeId ? [{ archetype, modelKey: model.modelKey, vendor: 'apimart', model }] : []
})

type Layer = 'params' | 'relay' | 'apimart' | 'relay-bypass' | 'apimart-bypass'

/** 绕过渲染层的入口长什么样：节点 meta 原样进 extras，只带上渲染层那份按当前方式打好的 archetypeInput。 */
function bypassRenderer(graph: Graph, request: ReturnType<typeof rendererRequest>) {
  return { ...request, extras: { ...graph.node.meta, archetypeInput: request.extras?.archetypeInput ?? {} } }
}
type CellResult = { label: string; leaked: string[]; clickable: boolean; sentInUse: string[] }

function audit(cells: Cell[], layer: Layer): CellResult[] {
  return cells.map(({ label, archetype, mode, graph, modelKey }) => {
    const shown = inUse(graph)
    const built = rendererRequest(graph)
    const request = layer.endsWith('-bypass') ? bypassRenderer(graph, built) : built
    let sent: Map<string, string[]>
    if (layer === 'params') sent = urlsIn(taskTemplateParams(request))
    else {
      const transport = layer.startsWith('relay')
        ? relayTransport(modelKey, archetype.id, request.kind)
        : apimartTransport(apimartArchetypes.find((entry) => entry.modelKey === modelKey)!.model, request.kind, mode.id)
      sent = urlsIn(wire(transport, request as never))
    }
    const leaked = [...sent].filter(([url]) => !shown.has(url)).map(([url, keys]) => `${url.slice(REF.length)}←${[...new Set(keys)].join(',')}`)
    return { label, leaked, clickable: clickable(graph, mode), sentInUse: [...sent.keys()].filter((url) => shown.has(url)).sort() }
  })
}

const summary = (results: CellResult[]) => ({
  cells: results.length,
  leakedCells: results.filter((r) => r.leaked.length).length,
  leakedClickable: results.filter((r) => r.leaked.length && r.clickable).length,
})
const leaksOf = (results: CellResult[]) => results.filter((r) => r.leaked.length).map((r) => `${r.label}: ${r.leaked.join(' ')}`)

const LAYERS = {
  'params/refs': () => audit(cellsFor(imageOrVideo, 'refs'), 'params'),
  'params/frames': () => audit(cellsFor(imageOrVideo, 'frames'), 'params'),
  'params/media': () => audit(cellsFor(everyArchetype, 'media'), 'params'),
  'params/aliases': () => audit(aliasCellsFor(everyArchetype), 'params'),
  'relay/aliases': () => audit(aliasCellsFor(imageOrVideo), 'relay'),
  'apimart/aliases': () => audit(aliasCellsFor(apimartArchetypes), 'apimart'),
  'relay/refs': () => audit(cellsFor(imageOrVideo, 'refs'), 'relay'),
  'relay/frames': () => audit(cellsFor(imageOrVideo.filter((a) => a.archetype.kind === 'video'), 'frames'), 'relay'),
  'relay/media': () => audit(cellsFor(imageOrVideo, 'media'), 'relay'),
  'apimart/refs': () => audit(cellsFor(apimartArchetypes, 'refs'), 'apimart'),
  'apimart/frames': () => audit(cellsFor(apimartArchetypes, 'frames'), 'apimart'),
  'apimart/media': () => audit(cellsFor(apimartArchetypes, 'media'), 'apimart'),
  // 主进程这道守单独量：渲染层整个被绕过（MCP / 将来新入口 / 渲染层回归），真请求体照样只有在用的。
  'relay/bypass': () => audit([...cellsFor(imageOrVideo, 'refs'), ...cellsFor(imageOrVideo, 'frames'), ...cellsFor(imageOrVideo, 'media'), ...aliasCellsFor(imageOrVideo)], 'relay-bypass'),
  'apimart/bypass': () => audit([...cellsFor(apimartArchetypes, 'refs'), ...cellsFor(apimartArchetypes, 'frames'), ...cellsFor(apimartArchetypes, 'media'), ...aliasCellsFor(apimartArchetypes)], 'apimart-bypass'),
} as const

describe('性质：全部档案 × 每个方式，发出去的 ⊆ 界面在用', () => {
  const results = Object.fromEntries(Object.entries(LAYERS).map(([name, run]) => [name, run()])) as Record<keyof typeof LAYERS, CellResult[]>

  if (process.env.NOMI_REFLEAK_REPORT) {
    writeFileSync(process.env.NOMI_REFLEAK_REPORT, JSON.stringify(Object.fromEntries(Object.entries(results)
      .map(([name, cells]) => [name, { ...summary(cells), leaks: leaksOf(cells), sentInUse: Object.fromEntries(cells.map((c) => [c.label, c.sentInUse])) }])), null, 2))
  }

  it('覆盖面自检：收图档案 ≥ 20、方式格 ≥ 120；首尾帧起点、视频 / 音频起点、APIMart 都跑到了', () => {
    expect(new Set(results['params/refs'].map((r) => r.label.split(':')[0])).size).toBeGreaterThanOrEqual(20)
    expect(results['params/refs'].length).toBeGreaterThanOrEqual(120)
    expect(results['relay/frames'].length).toBeGreaterThanOrEqual(60)
    expect(results['params/media'].length).toBeGreaterThanOrEqual(30)
    expect(results['apimart/refs'].length).toBeGreaterThanOrEqual(40)
  })

  it.each(Object.keys(LAYERS) as Array<keyof typeof LAYERS>)('%s：没有一格把界面上没在用的地址发出去', (name) => {
    expect(leaksOf(results[name])).toEqual([])
  })
})

// ── 线上四个场景（复盘表 1a–4）+ 没误伤 ───────────────────────────────────────────────

const archetypeOf = (modelKey: string, vendor = 'apimart') => resolveArchetypeForModel({ modelKey, vendorKey: vendor, meta: {} })!

function bodies(graph: Graph, modelKey = String(graph.node.meta?.modelKey)) {
  const archetype = resolveArchetypeForModel({ modelKey, vendorKey: 'apimart', meta: graph.node.meta })!
  const request = rendererRequest(graph)
  const modeId = (graph.node.meta?.archetype as { modeId?: string } | undefined)?.modeId ?? ''
  const apimart = APIMART_MODELS.find((model) => model.modelKey === modelKey)
  return {
    request,
    relay: wire(relayTransport(modelKey, archetype.id, request.kind), request as never),
    apimart: apimart ? wire(apimartTransport(apimart, request.kind, modeId), request as never) : null,
  }
}
const sentUrls = (built: unknown) => [...urlsIn(built).keys()].sort()

describe('场景 1：放过首帧 / 首尾帧 / 参考图后切到文生，请求里一张图都不带', () => {
  const seedance = archetypeOf('seedance-2')
  it.each([
    ['1a 首帧 1 张', 'first', { firstFrameUrl: img('f') }],
    ['1b 首尾帧 2 张', 'firstlast', { firstFrameUrl: img('f'), lastFrameUrl: img('l') }],
    ['1c 参考 3 张', 'omni', { referenceImageUrls: imgs(3) }],
  ] as const)('%s → 文生视频', (_name, fromMode, meta) => {
    const graph = switchMode(graphOn(seedance, 'seedance-2', 'apimart', fromMode, meta), seedance, 't2v')
    expect(inUse(graph).size).toBe(0)
    const { request, relay } = bodies(graph)
    expect(request.kind).toBe('text_to_video')
    expect(relay!.body).not.toHaveProperty('image')
    expect(sentUrls(relay)).toEqual([])
    expect(sentUrls(taskTemplateParams(request))).toEqual([])
  })

  it('APIMart Seedance 2.0：首尾帧 → 文生，body 不带图', () => {
    const archetype = archetypeOf('doubao-seedance-2.0')
    const graph = switchMode(graphOn(archetype, 'doubao-seedance-2.0', 'apimart', 'firstlast', { firstFrameUrl: img('f'), lastFrameUrl: img('l') }), archetype, 't2v')
    expect(sentUrls(bodies(graph).apimart)).toEqual([])
  })
})

describe('场景 2：参考 3 张切到首尾帧再放帧，APIMart image_urls 只带首、尾帧', () => {
  it('Seedance 2.0（APIMart）', () => {
    const archetype = archetypeOf('doubao-seedance-2.0')
    const switched = switchMode(graphOn(archetype, 'doubao-seedance-2.0', 'apimart', 'omni', { referenceImageUrls: imgs(3) }), archetype, 'firstlast')
    const node = { ...switched.node, meta: { ...switched.node.meta, firstFrameUrl: img('f'), lastFrameUrl: img('l') } }
    const graph = { node, nodes: [node], edges: [] }
    expect([...inUse(graph)].sort()).toEqual([img('f'), img('l')].sort())
    const { apimart, relay } = bodies(graph)
    expect(sentUrls(apimart)).toEqual([img('f'), img('l')].sort())
    expect(sentUrls(relay)).toEqual([img('f')])
  })
})

describe('场景 3：连 3 张图进 Seedance 2.0 首尾帧，参考区说用几张就发几张', () => {
  it('APIMart 不再多带第 2、3 张', () => {
    const archetype = archetypeOf('doubao-seedance-2.0')
    const { node } = graphOn(archetype, 'doubao-seedance-2.0', 'apimart', 'firstlast', {})
    const sources = [1, 2, 3].map((i) => ({
      ...createGenerationNode({ id: `s${i}`, kind: 'image' }),
      result: { id: `r${i}`, type: 'image' as const, url: img(`e${i}`), createdAt: 0 },
    }))
    const edges = sources.map((source, order) => ({ id: `edge-${order}`, source: source.id, target: node.id, order })) as unknown as GenerationCanvasEdge[]
    const graph = { node, nodes: [node, ...sources] as GenerationCanvasNode[], edges }
    const shown = inUse(graph)
    const { apimart, relay } = bodies(graph)
    expect(sentUrls(apimart).filter((url) => !shown.has(url))).toEqual([])
    expect(sentUrls(relay).filter((url) => !shown.has(url))).toEqual([])
    expect(sentUrls(apimart)).toContain(img('e1'))
  })
})

describe('场景 4：Seedance 5 张换到 Veo 3.1 / Kling 3.0 / Wan 2.7，落到文生方式，中转不带第 1 张', () => {
  it.each(['veo3.1', 'kling-3.0', 'wan2.7'])('→ %s', (toModelKey) => {
    const seedance = archetypeOf('seedance-2')
    const { graph } = swapModel(graphOn(seedance, 'seedance-2', 'apimart', 'omni', { referenceImageUrls: imgs(5) }), toModelKey, 'apimart')
    const shown = inUse(graph)
    const { request, relay } = bodies(graph, toModelKey)
    expect(sentUrls(relay).filter((url) => !shown.has(url))).toEqual([])
    expect(sentUrls(taskTemplateParams(request)).filter((url) => !shown.has(url))).toEqual([])
  })
})

describe('没误伤：当前方式声明了、界面在用的图照常发出', () => {
  it('首帧方式：中转 image = 首帧；APIMart（Hailuo 2.3）first_frame_image = 首帧', () => {
    const seedance = archetypeOf('seedance-2')
    expect(bodies(graphOn(seedance, 'seedance-2', 'apimart', 'first', { firstFrameUrl: img('f') })).relay!.body).toMatchObject({ image: img('f') })
    const hailuo = archetypeOf('MiniMax-Hailuo-2.3')
    const mode = hailuo.modes.find((m) => m.slots.some((s) => s.kind === 'first_frame'))!
    expect(sentUrls(bodies(graphOn(hailuo, 'MiniMax-Hailuo-2.3', 'apimart', mode.id, { firstFrameUrl: img('f') })).apimart)).toEqual([img('f')])
  })

  it('参考方式：APIMart Seedance 2.0 全能参考照发 3 张参考；中转 image = 第 1 张', () => {
    const archetype = archetypeOf('doubao-seedance-2.0')
    const { apimart, relay } = bodies(graphOn(archetype, 'doubao-seedance-2.0', 'apimart', 'omni', { referenceImageUrls: imgs(3) }))
    expect(sentUrls(apimart)).toEqual(imgs(3))
    expect((relay!.body as Record<string, unknown>).image).toBe(imgs(3)[0])
  })

  it('首尾帧方式：APIMart Seedance 2.0 两帧都发；中转 image = 首帧', () => {
    const archetype = archetypeOf('doubao-seedance-2.0')
    const { apimart, relay } = bodies(graphOn(archetype, 'doubao-seedance-2.0', 'apimart', 'firstlast', { firstFrameUrl: img('f'), lastFrameUrl: img('l') }))
    expect(sentUrls(apimart)).toEqual([img('f'), img('l')].sort())
    expect((relay!.body as Record<string, unknown>).image).toBe(img('f'))
  })

  it('改图方式：中转 chat 多模态照带参考图', () => {
    const banana = archetypeOf('nano-banana')
    const { relay } = bodies(graphOn(banana, 'nano-banana', 'apimart', 'edit', { referenceImageUrls: imgs(2) }))
    expect(sentUrls(relay)).toEqual(imgs(2))
  })

  it('参考方式超上限：只发前 max 张（Kling 3.0 图生上限 2）', () => {
    const kling = archetypeOf('kling-3.0')
    const graph = graphOn(kling, 'kling-3.0', 'apimart', 'i2v', { referenceImageUrls: imgs(4) })
    expect([...inUse(graph)].sort()).toEqual(imgs(2))
    expect(sentUrls(taskTemplateParams(rendererRequest(graph)))).toEqual(imgs(2))
  })
})

describe('主进程剥除：绕过渲染层，把节点 meta 原样塞进 extras，主进程也不让残留键上线', () => {
  it('文生方式残留首帧 + 参考：剥掉，真请求体不带图', () => {
    const seedance = archetypeOf('seedance-2')
    const graph = graphOn(seedance, 'seedance-2', 'apimart', 't2v', { firstFrameUrl: img('stale'), referenceImageUrls: imgs(2), image_url: img('alias') })
    const request = rendererRequest(graph)
    // 模拟一个不经 buildReferenceExtras 的入口：节点 meta 原样进 extras，只留渲染层那份 archetypeInput。
    const raw = { ...request, extras: { ...graph.node.meta, archetypeInput: request.extras?.archetypeInput ?? {} } }
    expect(sentUrls(stripReferenceResidue(raw.extras))).toEqual([])
    expect(sentUrls(wire(relayTransport('seedance-2', seedance.id, 'text_to_video'), raw as never))).toEqual([])
  })

  it('当前方式声明了的值原样保留（首尾帧方式的两帧不动）', () => {
    const archetype = archetypeOf('doubao-seedance-2.0')
    const request = rendererRequest(graphOn(archetype, 'doubao-seedance-2.0', 'apimart', 'firstlast', { firstFrameUrl: img('f'), lastFrameUrl: img('l') }))
    expect(stripReferenceResidue(structuredClone(request.extras!))).toEqual(request.extras)
  })

  it('没有档案投影（ComfyUI / 无档案 / headless 调用方显式给的参考）不动', () => {
    const extras = { referenceImages: imgs(2), firstFrameUrl: img('f'), modelKey: 'x' }
    expect(stripReferenceResidue(structuredClone(extras))).toEqual(extras)
  })
})

// ── 免费抓包：本机假上游（loopback）真收到的请求体 ─────────────────────────────────────
//
// 上面量的是渲染出来的请求；这里把它真的发到 127.0.0.1 上一个只记账的假上游，按**收到的字节**断言：
// 不该带的一张都不带，该带的一张不少（等号断言，两头都管）。设 NOMI_REFLEAK_EVIDENCE_DIR 时把每一份
// 收到的请求体落盘（docs/evidence/2026-10-22-reference-leak-hotfix/ 就是这么来的）。不花钱、不出本机。

type Received = { method: string; path: string; body: unknown }

describe('免费抓包：本机假上游收到的请求体（四个场景 + 没误伤，中转 / APIMart 两种传输）', () => {
  let server: Server
  let base = ''
  const received: Received[] = []
  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = ''
      req.on('data', (chunk) => { raw += chunk })
      req.on('end', () => {
        received.push({ method: req.method || '', path: req.url || '', body: raw ? JSON.parse(raw) : null })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ code: 200, data: [{ task_id: 'loopback-task' }], task_id: 'loopback-task' }))
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  })
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  async function send(transport: Transport, request: ReturnType<typeof rendererRequest>): Promise<Received | null> {
    const built = wire({ ...transport, vendor: { ...transport.vendor, baseUrlHint: base } }, request as never)
    if (!built) return null
    const before = received.length
    await fetch(built.url, { method: built.method, headers: built.headers, body: JSON.stringify(built.body) })
    return received[before] ?? null
  }

  const seedance = () => archetypeOf('seedance-2')
  const apimartSeedance = () => archetypeOf('doubao-seedance-2.0')
  const hailuo = () => archetypeOf('MiniMax-Hailuo-2.3')
  const withFrames = (graph: Graph): Graph => {
    const node = { ...graph.node, meta: { ...graph.node.meta, firstFrameUrl: img('f'), lastFrameUrl: img('l') } }
    return { node, nodes: [node], edges: [] }
  }
  const threeEdges = (): Graph => {
    const { node } = graphOn(apimartSeedance(), 'doubao-seedance-2.0', 'apimart', 'firstlast', {})
    const sources = [1, 2, 3].map((i) => ({
      ...createGenerationNode({ id: `s${i}`, kind: 'image' }),
      result: { id: `r${i}`, type: 'image' as const, url: img(`e${i}`), createdAt: 0 },
    }))
    const edges = sources.map((source, order) => ({ id: `edge-${order}`, source: source.id, target: node.id, order })) as unknown as GenerationCanvasEdge[]
    return { node, nodes: [node, ...sources] as GenerationCanvasNode[], edges }
  }

  type LoopbackCase = [string, () => Graph, string, string[], string[] | null]
  // [名字, 图, 模型, 中转应收到的地址, APIMart 应收到的地址（null = APIMart 没有这条模型，不发）]
  const CASES: LoopbackCase[] = [
    ['S1a-中转-首帧切文生', () => switchMode(graphOn(seedance(), 'seedance-2', 'apimart', 'first', { firstFrameUrl: img('f') }), seedance(), 't2v'), 'seedance-2', [], null],
    ['S1b-中转-首尾帧切文生', () => switchMode(graphOn(seedance(), 'seedance-2', 'apimart', 'firstlast', { firstFrameUrl: img('f'), lastFrameUrl: img('l') }), seedance(), 't2v'), 'seedance-2', [], null],
    ['S1c-中转-参考3张切文生', () => switchMode(graphOn(seedance(), 'seedance-2', 'apimart', 'omni', { referenceImageUrls: imgs(3) }), seedance(), 't2v'), 'seedance-2', [], null],
    ['S1d-APIMart-首尾帧切文生', () => switchMode(graphOn(apimartSeedance(), 'doubao-seedance-2.0', 'apimart', 'firstlast', { firstFrameUrl: img('f'), lastFrameUrl: img('l') }), apimartSeedance(), 't2v'), 'doubao-seedance-2.0', [], []],
    ['S2-参考3张切首尾帧再放帧', () => withFrames(switchMode(graphOn(apimartSeedance(), 'doubao-seedance-2.0', 'apimart', 'omni', { referenceImageUrls: imgs(3) }), apimartSeedance(), 'firstlast')), 'doubao-seedance-2.0', [img('f')], [img('f'), img('l')].sort()],
    ['S3-连3张进Seedance2.0首尾帧', threeEdges, 'doubao-seedance-2.0', [img('e1')], [img('e1')]],
    ...['veo3.1', 'kling-3.0', 'wan2.7'].map((to): LoopbackCase => [`S4-5张换到${to}`, () => swapModel(graphOn(seedance(), 'seedance-2', 'apimart', 'omni', { referenceImageUrls: imgs(5) }), to, 'apimart').graph, to, [], null]),
    ['OK1-首帧方式照发首帧', () => graphOn(hailuo(), 'MiniMax-Hailuo-2.3', 'apimart', hailuo().modes.find((m) => m.slots.some((s) => s.kind === 'first_frame'))!.id, { firstFrameUrl: img('f') }), 'MiniMax-Hailuo-2.3', [img('f')], [img('f')]],
    ['OK2-参考方式照发参考数组', () => graphOn(apimartSeedance(), 'doubao-seedance-2.0', 'apimart', 'omni', { referenceImageUrls: imgs(3) }), 'doubao-seedance-2.0', [imgs(3)[0]], imgs(3)],
    ['OK3-首尾帧方式照发两帧', () => graphOn(apimartSeedance(), 'doubao-seedance-2.0', 'apimart', 'firstlast', { firstFrameUrl: img('f'), lastFrameUrl: img('l') }), 'doubao-seedance-2.0', [img('f')], [img('f'), img('l')].sort()],
  ]

  it.each(CASES)('%s', async (name, makeGraph, modelKey, relayExpected, apimartExpected) => {
    const graph = makeGraph()
    const request = rendererRequest(graph)
    const archetype = resolveArchetypeForModel({ modelKey, vendorKey: 'apimart', meta: graph.node.meta })!
    const modeId = (graph.node.meta?.archetype as { modeId?: string } | undefined)?.modeId ?? ''
    const apimart = APIMART_MODELS.find((model) => model.modelKey === modelKey)
    const relayGot = await send(relayTransport(modelKey, archetype.id, request.kind), request)
    const apimartGot = apimart ? await send(apimartTransport(apimart, request.kind, modeId), request) : null
    const dir = process.env.NOMI_REFLEAK_EVIDENCE_DIR
    if (dir) {
      mkdirSync(dir, { recursive: true })
      const shown = [...inUse(graph)].sort()
      for (const [transport, got] of [['relay', relayGot], ['apimart', apimartGot]] as const) {
        if (got) writeFileSync(join(dir, `${name}.${transport}.json`), `${JSON.stringify({ case: name, transport, kind: request.kind, inUse: shown, sent: sentUrls(got.body), received: got }, null, 2)}\n`)
      }
    }
    expect(relayGot).not.toBeNull()
    expect(sentUrls(relayGot!.body)).toEqual(relayExpected)
    if (apimartExpected) {
      expect(apimartGot).not.toBeNull()
      expect(sentUrls(apimartGot!.body)).toEqual(apimartExpected)
    }
  })
})
